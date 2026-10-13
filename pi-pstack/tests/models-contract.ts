/**
 * Contract check for the pstack per-role model map: role resolution follows
 * roles -> buckets -> inherit-parent, the injection line reports every pinned
 * bucket and override, and the canonical module is the single source of truth
 * for every role token used in skills and listed by the setup wizard. Runs
 * under the package's `test` script (`bun tests/models-contract.ts`).
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
 BUCKETS,
 ROLE_BUCKETS,
 buildInjectionText,
 loadModelsMap,
 resolvePstackModelsFile,
 resolveRoleModel,
 unknownModelKeys,
} from "../extensions/pstack/models.js";

const PACKAGE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SKILLS_DIR = join(PACKAGE_ROOT, "skills");
const CANONICAL_ROLES = Object.keys(ROLE_BUCKETS).sort();

// --- buckets are exactly code and judgment ---
assert.deepEqual([...BUCKETS], ["code", "judgment"], "buckets must be exactly code and judgment");

// --- models.json path mirrors the config file precedence ---
assert.equal(
 resolvePstackModelsFile("pi", { PI_CODING_AGENT_DIR: "/tmp/agent" }),
 "/tmp/agent/pstack/models.json",
);
assert.equal(resolvePstackModelsFile("omp", {}), join(homedir(), ".omp", "agent", "pstack", "models.json"));
assert.equal(resolvePstackModelsFile("pi", {}), join(homedir(), ".pi", "agent", "pstack", "models.json"));

// --- resolveRoleModel honors roles -> buckets -> inherit-parent ---
{
 const map = {
  buckets: { code: "xai/grok-4", judgment: "anthropic/claude-opus-4-6:high" },
  roles: { "reflect-tooling": "openai/gpt-5", "swarm-workers": "inherit-parent", "bug-fix": "auto" },
 };
 assert.equal(resolveRoleModel(map, "feature"), "xai/grok-4", "code role falls back to the code bucket");
 assert.equal(resolveRoleModel(map, "cross-judge"), "anthropic/claude-opus-4-6:high", "judgment role falls back to its bucket");
 assert.equal(resolveRoleModel(map, "reflect-tooling"), "openai/gpt-5", "a fine-role override wins over its bucket");
 assert.equal(resolveRoleModel(map, "swarm-workers"), "xai/grok-4", "inherit-parent at the role falls back to the bucket");
 assert.equal(resolveRoleModel(map, "bug-fix"), "xai/grok-4", "auto at the role falls back to the bucket");
 assert.equal(resolveRoleModel({ buckets: {} }, "feature"), undefined, "no bucket pin resolves to inherit-parent");
 assert.equal(resolveRoleModel({ buckets: { code: "inherit-parent" } }, "feature"), undefined, "inherit-parent bucket omits");
 assert.equal(resolveRoleModel({ buckets: { code: "auto" } }, "feature"), undefined, "auto bucket omits");
 assert.equal(resolveRoleModel(null, "feature"), undefined, "null map resolves to inherit-parent");
 assert.equal(resolveRoleModel(map, "not-a-role"), undefined, "unknown role resolves to inherit-parent");
}

// --- buildInjectionText reports pinned buckets and overrides, else undefined ---
{
 assert.equal(buildInjectionText(null), undefined, "null map injects nothing");
 assert.equal(buildInjectionText({}), undefined, "empty map injects nothing");
 assert.equal(buildInjectionText({ buckets: { code: "inherit-parent" } }), undefined, "an all-omit map injects nothing");

 const text = buildInjectionText({
  buckets: { code: "xai/grok-4", judgment: "anthropic/claude-opus-4-6:high" },
  roles: { "reflect-tooling": "openai/gpt-5" },
 });
 assert.ok(text, "a pinned map injects a line");
 assert.match(text, /code: `xai\/grok-4`/);
 assert.match(text, /judgment: `anthropic\/claude-opus-4-6:high`/);
 assert.match(text, /overrides: reflect-tooling=`openai\/gpt-5`/);
 for (const role of Object.keys(ROLE_BUCKETS)) assert.ok(text.includes(role), `injection lists ${role}`);
 assert.match(text, /omit `model` \(inherit parent\) for anything unset\./);
 assert.match(text, /A role listed under overrides wins over its bucket\./);
 assert.equal(
  text.split("reflect-tooling").length - 1,
  1,
  "an overridden role appears only under overrides, never double-listed",
 );
 assert.doesNotMatch(
  text,
  /judgment:[^.]*reflect-tooling/,
  "an overridden role is dropped from its bucket's role list",
 );

 const codeOnly = buildInjectionText({ buckets: { code: "xai/grok-4" } });
 assert.ok(codeOnly && codeOnly.includes("code: `xai/grok-4`"), "a single pinned bucket injects");
 assert.ok(codeOnly && !codeOnly.includes("judgment:"), "an unpinned bucket is omitted");
 assert.ok(codeOnly && !codeOnly.includes("overrides:"), "no overrides line without overrides");

 const overrideOnly = buildInjectionText({ roles: { feature: "xai/grok-4" } });
 assert.ok(overrideOnly && overrideOnly.includes("overrides: feature=`xai/grok-4`"), "an override alone injects");

 // every code role overridden: the pinned code bucket line is omitted (its model is unused)
 const codeRoles = Object.keys(ROLE_BUCKETS).filter((role) => ROLE_BUCKETS[role] === "code");
 const allCodeOverridden = buildInjectionText({
  buckets: { code: "xai/grok-4", judgment: "anthropic/claude-opus-4-6:high" },
  roles: Object.fromEntries(codeRoles.map((role) => [role, "openai/gpt-5"])),
 });
 assert.ok(allCodeOverridden, "a map with overrides still injects");
 assert.ok(!allCodeOverridden.includes("code: `"), "a bucket whose every role is overridden is omitted");
 assert.match(allCodeOverridden, /judgment: `anthropic\/claude-opus-4-6:high`/);
}

// --- unknownModelKeys flags hand-edit typos, ignores valid and null ---
{
 assert.deepEqual(unknownModelKeys(null), [], 'null map has no unknown keys');
 assert.deepEqual(
  unknownModelKeys({ buckets: { code: 'xai/grok-4' }, roles: { 'reflect-tooling': 'openai/gpt-5' } }),
  [],
  'valid keys are not flagged',
 );
 assert.deepEqual(
  unknownModelKeys({ buckets: { codex: 'x' }, roles: { 'swarm-worker': 'y' } }),
  ['buckets.codex', 'roles.swarm-worker'],
  'unknown bucket and role keys are flagged, sorted',
 );
 assert.deepEqual(
  unknownModelKeys({ roles: JSON.parse('{"constructor":"x","toString":"y"}') }),
  ['roles.constructor', 'roles.toString'],
  'prototype-shadowing keys are flagged as unknown own roles',
 );
}

// --- loadModelsMap parses best-effort and returns null on any error ---
{
 const dir = mkdtempSync(join(tmpdir(), "pstack-models-"));
 const file = join(dir, "models.json");
 try {
  writeFileSync(file, '{"buckets":{"code":"xai/grok-4"}}', "utf8");
  assert.deepEqual(loadModelsMap(file), { buckets: { code: "xai/grok-4" } });
  writeFileSync(file, "not json", "utf8");
  assert.equal(loadModelsMap(file), null, "malformed JSON is null");
  writeFileSync(file, "[1,2,3]", "utf8");
  assert.equal(loadModelsMap(file), null, "a non-object document is null");
  assert.equal(loadModelsMap(join(dir, "missing.json")), null, "a missing file is null");
 } finally {
  rmSync(dir, { recursive: true, force: true });
 }
}

// --- every role token used in skills exists in the canonical module ---
{
 const marker = /`([a-z0-9-]+)` model from the pstack model map/g;
 const referenced = new Set<string>();
 const files = readdirSync(SKILLS_DIR, { recursive: true, encoding: "utf8" }).filter((name) =>
  name.endsWith(".md"),
 );
 for (const name of files) {
  const body = readFileSync(join(SKILLS_DIR, name), "utf8");
  for (const match of body.matchAll(marker)) {
   const role = match[1];
   if (!role) continue;
   assert.ok(ROLE_BUCKETS[role], `${name} references unknown pstack role token "${role}"`);
   referenced.add(role);
  }
 }
 assert.deepEqual(
  [...referenced].sort(),
  CANONICAL_ROLES,
  "skills must reference exactly the canonical role tokens, no drift",
 );
}

// --- the setup-pstack skill lists exactly the canonical roles and buckets ---
{
 const skill = readFileSync(join(SKILLS_DIR, "setup-pstack", "SKILL.md"), "utf8");
 const section = /## Canonical roles\n([\s\S]*?)\n## /.exec(skill)?.[1];
 assert.ok(section, "setup-pstack must have a Canonical roles section");
 const listed = new Set<string>();
 for (const match of section.matchAll(/`([a-z0-9-]+)`/g)) if (match[1]) listed.add(match[1]);
 assert.deepEqual(
  [...listed].sort(),
  [...BUCKETS, ...Object.keys(ROLE_BUCKETS)].sort(),
  "setup-pstack must list exactly the canonical role keys and bucket names",
 );
 for (const bucket of BUCKETS) assert.ok(section.includes(`\`${bucket}\` bucket`), `setup-pstack names the ${bucket} bucket`);
}

console.log(
 `pstack models contract: ok (resolution, injection, ${CANONICAL_ROLES.length} canonical roles, skill drift guard)`,
);
