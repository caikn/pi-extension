/**
 * Contract check for the pstack bundled agents. Runs under the package's bun
 * test runner:  bun tests/agents-contract.ts
 *
 * Asserts what native pi-subagents depends on: the package.json
 * `pi.subagents.agents` discovery entry and the frontmatter shape its catalog
 * parser accepts.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const AGENTS_DIR = join(PACKAGE_ROOT, "agents");

const THINKING_LEVELS = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
];

function frontmatter(name: string): string {
  const content = readFileSync(path.join(AGENTS_DIR, name), "utf8");
  const captured = /^---\n([\s\S]*?)\n---/.exec(content)?.[1];
  assert.ok(captured !== undefined, `${name} has no frontmatter`);
  return captured;
}

function frontmatterValue(name: string, key: string): string | undefined {
  const line = frontmatter(name)
    .split("\n")
    .find((candidate) => candidate.startsWith(`${key}:`));
  return line?.slice(`${key}:`.length).trim() || undefined;
}

const agentNames = readdirSync(AGENTS_DIR)
  .filter((name) => name.endsWith(".md"))
  .sort();

assert.deepEqual(
  agentNames,
  ["comment-sicko.md", "poteto-agent.md"],
  "unexpected bundled agents",
);

// --- native pi-subagents discovery entry ---
const pkg = JSON.parse(
  readFileSync(path.join(PACKAGE_ROOT, "package.json"), "utf8"),
) as { pi?: { subagents?: { agents?: unknown } } };
assert.deepEqual(
  pkg.pi?.subagents?.agents,
  ["./agents"],
  "package.json must declare pi.subagents.agents so native pi-subagents discovers the pack",
);

// --- definition contract ---
for (const name of agentNames) {
  const stem = name.replace(/\.md$/, "");
  assert.equal(
    frontmatterValue(name, "name"),
    stem,
    `${name} name must match its filename stem`,
  );

  const description = frontmatterValue(name, "description");
  assert.ok(description, `${name} must declare a description`);
  assert.ok(
    !/^[>|[]/.test(description),
    `${name} description must be a single-line scalar, not a folded block`,
  );

  assert.equal(
    frontmatterValue(name, "systemPromptMode"),
    "append",
    `${name} systemPromptMode must be append so the base Pi prompt is kept`,
  );
  assert.ok(
    ["true", "false"].includes(
      frontmatterValue(name, "allowNestedSubagents") ?? "",
    ),
    `${name} allowNestedSubagents must be exactly true or false`,
  );

  const thinking = frontmatterValue(name, "thinking");
  if (thinking !== undefined) {
    assert.ok(
      THINKING_LEVELS.includes(thinking),
      `${name} thinking "${thinking}" is not a Pi level`,
    );
  }

  const model = frontmatterValue(name, "model");
  if (model !== undefined) {
    assert.ok(
      !/:(?:off|minimal|low|medium|high|xhigh|max)$/.test(model),
      `${name} model must not carry a thinking suffix`,
    );
    assert.equal(
      model.split("/").length,
      2,
      `${name} model must be an exact provider/model-id`,
    );
  }

  const tools = frontmatterValue(name, "tools");
  if (tools !== undefined) {
    assert.ok(
      !/[[\]{}>|#"']/.test(tools),
      `${name} tools must be an inline comma-separated scalar`,
    );
    for (const entry of tools.split(",")) {
      assert.ok(entry.trim(), `${name} tools has an empty entry`);
    }
  }
}

assert.equal(
  frontmatterValue("comment-sicko.md", "allowNestedSubagents"),
  "false",
  "comment-sicko is a leaf",
);
assert.equal(
  frontmatterValue("comment-sicko.md", "tools"),
  "read, grep, find, ls, bash",
);
assert.equal(
  frontmatterValue("poteto-agent.md", "allowNestedSubagents"),
  "true",
  "poteto-agent delegates",
);
assert.equal(
  frontmatterValue("poteto-agent.md", "tools"),
  undefined,
  "poteto-agent must stay unrestricted",
);

console.log(`pstack agents contract: ok (${agentNames.length} agents)`);
