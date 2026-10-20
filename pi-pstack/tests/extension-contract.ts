/**
 * Contract check for the pstack extension: config resolution follows the
 * pi-headroom precedence, only an explicit `confirmExternalActions: false`
 * disables the external-action guard, and the guard's prompt/block behavior
 * holds when enabled. Runs under the package's `test` script (`bun tests/…`).
 */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import pstack from "../extensions/pstack/index.js";
import {
 confirmExternalActionsEnabled,
 detectPstackHost,
 resolvePstackConfigFile,
} from "../extensions/pstack/config.js";

type ToolHandler = (event: unknown, ctx: unknown) => Promise<unknown>;

function startExtension(): { events: Map<string, unknown>; commands: Set<string> } {
 const events = new Map<string, unknown>();
 const commands = new Set<string>();
 const pi = {
  on(eventName: string, handler: unknown) {
   events.set(eventName, handler);
  },
  events: {
   on(_channel: string, _handler: unknown) {
    return () => { };
   },
  },
  appendEntry(_type: string, _data: unknown) {},
  registerCommand(name: string, _definition: unknown) {
   commands.add(name);
  },
 } as unknown as ExtensionAPI;
 pstack(pi);
 return { events, commands };
}

// --- config resolution follows the pi-headroom precedence ---
assert.equal(detectPstackHost({ zod: {} }), "omp");
assert.equal(detectPstackHost({}), "pi");
assert.equal(detectPstackHost(null), "pi");

assert.equal(
 resolvePstackConfigFile("omp", { PI_CODING_AGENT_DIR: "/tmp/agent" }),
 "/tmp/agent/pstack/config.json",
);
assert.equal(resolvePstackConfigFile("omp", {}), join(homedir(), ".omp", "agent", "pstack", "config.json"));
assert.equal(resolvePstackConfigFile("pi", {}), join(homedir(), ".pi", "agent", "pstack", "config.json"));

// --- only an explicit boolean false disables the guard ---
{
 const dir = mkdtempSync(join(tmpdir(), "pstack-config-"));
 const file = join(dir, "pstack", "config.json");
 const write = (body: string) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, body, "utf8");
 };
 try {
  write('{"confirmExternalActions":false}');
  assert.equal(confirmExternalActionsEnabled(file), false);
  write('{"confirmExternalActions":true}');
  assert.equal(confirmExternalActionsEnabled(file), true);
  write('{"confirmExternalActions":"false"}');
  assert.equal(confirmExternalActionsEnabled(file), true);
  write("not json");
  assert.equal(confirmExternalActionsEnabled(file), true);
  assert.equal(confirmExternalActionsEnabled(join(dir, "missing.json")), true);
 } finally {
  rmSync(dir, { recursive: true, force: true });
 }
}

// --- guard prompts, blocks, and respects the config switch ---
{
 const dir = mkdtempSync(join(tmpdir(), "pstack-guard-"));
 const previous = process.env.PI_CODING_AGENT_DIR;
 process.env.PI_CODING_AGENT_DIR = dir;
 try {
  const { events, commands } = startExtension();
  assert.ok(events.has("session_start"));
  assert.ok(events.has("before_agent_start"));
  assert.ok(commands.has("poteto-mode"));
  assert.ok(commands.has("setup-pstack"));
  const gate = events.get("tool_call") as ToolHandler;
  assert.ok(gate, "guard registered by default");

  let prompts = 0;
  const confirm = async () => {
   prompts++;
   return true;
  };
  assert.equal(await gate({ toolName: "bash", input: { command: "git status" } }, { hasUI: true, ui: { confirm } }), undefined);
  assert.equal(await gate({ toolName: "read", input: { command: "git push" } }, { hasUI: false }), undefined);
  assert.deepEqual(await gate({ toolName: "bash", input: { command: "git push" } }, { hasUI: false }), {
   block: true,
   reason: "git push requires explicit user confirmation; non-interactive Pi cannot request it.",
  });
  assert.equal(await gate({ toolName: "bash", input: { command: "git push" } }, { hasUI: true, ui: { confirm } }), undefined);
  assert.equal(prompts, 1);
  assert.deepEqual(
   await gate({ toolName: "bash", input: { command: "gh pr merge 1" } }, { hasUI: true, ui: { confirm: async () => false } }),
   { block: true, reason: "User declined GitHub pull-request mutation." },
  );

  const beforeAgent = events.get("before_agent_start") as (event: { systemPrompt: string }) => unknown;
  assert.equal(beforeAgent({ systemPrompt: "base" }), undefined, "no injection when guard enabled and poteto mode off");

  const enable = events.get("input") as (event: { text: string }) => unknown;
  enable({ text: "/skill:poteto-mode investigate" });
  const injectMode = beforeAgent as (event: { systemPrompt: string }) => { systemPrompt: string } | undefined;
  const assertPlaybookBase = (prompt: string) => {
   const match = /The playbooks directory is ([^\n]+?)\. Resolve/.exec(prompt);
   assert.ok(match, "sticky mode must inject the absolute playbooks directory");
   const playbooks = match[1]!;
   assert.ok(existsSync(join(playbooks, "investigation.md")), "injected base resolves the reported missing playbook");
   assert.ok(prompt.includes(`For example, read ${join(playbooks, "investigation.md")}`));
  };
  const active = injectMode({ systemPrompt: "base" });
  assert.ok(active);
  assertPlaybookBase(active.systemPrompt);

  const restored = startExtension();
  const restore = restored.events.get("session_start") as (event: unknown, ctx: unknown) => void;
  restore({}, { hasUI: false, sessionManager: { getBranch: () => [
   { type: "custom", customType: "pstack-mode", data: { enabled: true } },
  ] } });
  const restoredInject = restored.events.get("before_agent_start") as typeof injectMode;
  const restoredPrompt = restoredInject({ systemPrompt: "base" });
  assert.ok(restoredPrompt);
  assertPlaybookBase(restoredPrompt.systemPrompt);

  mkdirSync(join(dir, "pstack"), { recursive: true });
  writeFileSync(join(dir, "pstack", "config.json"), '{"confirmExternalActions":false}', "utf8");
  const disabled = startExtension();
  assert.equal(disabled.events.has("tool_call"), false, "guard not registered when disabled");
  const inject = disabled.events.get("before_agent_start") as (
   event: { systemPrompt: string },
  ) => { systemPrompt: string } | undefined;
  const injected = inject({ systemPrompt: "base" });
  assert.ok(injected, "guard-disabled note injected");
  assert.ok(injected.systemPrompt.startsWith("base\n\n"), "note appended to the existing system prompt");
  assert.match(injected.systemPrompt, /confirmation guard is disabled/);
  assert.match(injected.systemPrompt, /Run recognized external commands \(pushes, pull-request updates, merges, deployments\) without asking/);
  assert.match(injected.systemPrompt, /Still pause for irreversible writes: force-pushes to shared branches, deployments, data deletion, and customer messages/);

  writeFileSync(join(dir, "pstack", "models.json"), '{"buckets":{"code":"xai/grok-4"}}', "utf8");
  const withModels = startExtension();
  const injectModels = withModels.events.get("before_agent_start") as (
   event: { systemPrompt: string },
  ) => { systemPrompt: string } | undefined;
  const modelsInjected = injectModels({ systemPrompt: "base" });
  assert.ok(modelsInjected, "models map injected when models.json pins a bucket");
  assert.match(modelsInjected.systemPrompt, /pstack models\. code: `xai\/grok-4`/);
 } finally {
  if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = previous;
  rmSync(dir, { recursive: true, force: true });
 }
}

console.log("pstack extension contract: ok (config resolution, guard switch, prompt/block)");
