import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { ROLE_BUCKETS, resolveRoleModel } from "../extensions/pstack/models.js";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const skillDir = join(root, "skills/poteto-mode");
const skill = readFileSync(join(skillDir, "SKILL.md"), "utf8");
const babysit = readFileSync(join(skillDir, "playbooks/babysit.md"), "utf8");

function section(body: string, heading: string): string {
  const start = body.indexOf(`## ${heading}\n`);
  assert.ok(start >= 0, `missing section ${heading}`);
  const end = body.indexOf("\n## ", start + 1);
  return body.slice(start, end < 0 ? undefined : end);
}

test("poteto-mode keeps portable frontmatter and resolvable bundled references", () => {
  assert.match(skill, /^---\nname: poteto-mode\ndescription: .+\ndisable-model-invocation: true\n---/);
  assert.ok(!skill.includes(["set", "tasks"].join("_")));
  assert.doesNotMatch(skill, /\bTask\b|subagent_type|AskQuestion|Cursor|cursor-team-kit|deslop/);
  const paths = [...skill.matchAll(/`((?:playbooks|references|\.\.\/\.\.\/extensions)\/[^`]+)`/g)];
  assert.ok(paths.length >= 24);
  for (const [, path] of paths) assert.ok(existsSync(join(skillDir, path!)), `missing ${path}`);
  const principles = [...section(skill, "Principles").matchAll(/\(\*\*(principle-[a-z-]+)\*\*\)/g)];
  assert.equal(principles.length, 24);
  for (const [, name] of principles) assert.ok(existsSync(join(root, "skills", name!, "SKILL.md")), `missing ${name}`);
});

test("one todolist reads Principles before verbatim playbook steps", () => {
  assert.match(skill, /Its first item is to read the Principles section below in full/);
  assert.match(section(skill, "Playbooks"), /After the Principles-reading item, add the matched playbook's steps to the todolist, copied in verbatim, before any task-specific todos\. Use the same list opened above/);
  assert.match(skill, /skip: <reason>/);
});

test("model guidance preserves resolver aliases and exact configured slugs", () => {
  const delegates = section(skill, "Subagents");
  assert.match(delegates, /At the role level, `inherit-parent` and `auto` are unset and fall through to the bucket/);
  assert.match(delegates, /Pass the exact resolved slug/);
  assert.match(delegates, /Leave suffix-free slugs unchanged/);
  assert.match(delegates, /Do not automatically adjust reasoning/);
  for (const role of ["feature", "refactoring", "bug-fix", "perf-issue", "hillclimb", "swarm-workers"]) {
    assert.ok(delegates.includes(`\`${role}\``));
    assert.ok(Object.hasOwn(ROLE_BUCKETS, role));
  }
  for (const model of ["provider/code-model", "provider/code-model:high"]) {
    for (const alias of ["inherit-parent", "auto"]) {
      assert.equal(resolveRoleModel({ buckets: { code: model }, roles: { feature: alias } }, "feature"), model);
      assert.equal(resolveRoleModel({ roles: { feature: alias } }, "feature"), undefined);
    }
    assert.equal(resolveRoleModel({ buckets: { code: "provider/other" }, roles: { feature: model } }, "feature"), model);
  }
});

test("Autonomy distinguishes enabled guard from disabled interception", () => {
  const autonomy = section(skill, "Autonomy");
  assert.match(autonomy, /When enabled, always obtain explicit confirmation/);
  assert.match(autonomy, /blocks them in non-interactive mode/);
  assert.match(autonomy, /When `confirmExternalActions: false`/);
  assert.match(autonomy, /ordinary pushes, PR updates, and merges, proceed without asking/);
  assert.match(autonomy, /Still pause for irreversible writes: force-pushes to shared branches, deployments, data deletion, and customer messages/);
  assert.match(autonomy, /A full-autonomy grant does not disable the configured guard/);
});

test("Babysit maps status-only questions to check, not its drive default", () => {
  const firstStep = babysit.split("\n").find((line) => line.startsWith("1. "));
  assert.ok(firstStep);
  const checkMapping = firstStep.slice(firstStep.indexOf('`check` is'), firstStep.indexOf('Undeclared defaults'));
  for (const phrase of ["check on X", "is it green", "anything outstanding on X"]) {
    assert.ok(checkMapping.includes(`"${phrase}"`), `missing check mapping for ${phrase}`);
  }
  assert.match(checkMapping, /not repair work or a polling loop/);
  assert.match(firstStep, /`drive` runs the loop to merge-ready, for "babysit this", "get it green"/);
  assert.match(babysit, /In `check` mode pass `--status-only`/);
});
