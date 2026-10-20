import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const manifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));

test("root Pi package exposes both extensions and pstack resources", () => {
  assert.ok(manifest.keywords.includes("pi-package"));
  assert.deepEqual(manifest.pi.extensions, [
    "./context-breakdown/index.ts",
    "./pi-pstack/extensions/pstack/index.ts",
  ]);
  assert.deepEqual(manifest.pi.skills, ["./pi-pstack/skills"]);
  assert.deepEqual(manifest.pi.subagents.agents, ["./pi-pstack/agents"]);
  for (const path of [...manifest.pi.extensions, ...manifest.pi.skills, ...manifest.pi.subagents.agents]) {
    assert.ok(existsSync(resolve(root, path)), `missing resource ${path}`);
  }
});

test("host packages remain unbundled wildcard peer dependencies", () => {
  for (const name of ["@earendil-works/pi-coding-agent", "@earendil-works/pi-tui"]) {
    assert.equal(manifest.peerDependencies[name], "*");
    assert.equal(manifest.dependencies?.[name], undefined);
  }
  assert.equal(manifest.workspaces, undefined, "Git installation must not install subpackage dev dependencies");
});
