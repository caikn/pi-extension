# pi-pstack

A pi-mimir fork of [pstack](https://github.com/cursor/plugins/tree/main/pstack). It keeps all upstream skills that are platform-portable (49; `make-bot-ui` is Cursor-platform-only and excluded, and `setup-pstack` is ported as a pi-native per-role model map), the sticky Poteto Mode, and the bundled `poteto-agent` and `comment-sicko` agents. It delegates through the native [pi-subagents](https://www.npmjs.com/package/pi-subagents) `subagent` tool rather than shipping its own child-Pi runner.

## Why this fork exists

Upstream pstack is a Cursor plugin that registers its own `subagent` tool and child-process runner. On Pi the `subagent` tool already exists, provided by pi-subagents. This fork drops the upstream tool registration so the native `subagent` is the only one, and pstack's bundled agents become inputs to it.

## How delegation works here

The bundled `agents/` directory is declared in `package.json` under `pi.subagents.agents`. pi-subagents discovers it as a `package`-source agent pack, reading and validating the definitions in place, so nothing is copied into `~/.pi/agent/agents`. The agent frontmatter uses pi-subagents keys: `systemPromptMode: append` (keep the base Pi prompt) and `allowNestedSubagents: true` (so `poteto-agent` can spawn swarm and arena workers).

After install, list the discovered agents with `subagent({ action: "list" })` to confirm they resolved, then delegate the native way:

```text
subagent({ agent: "poteto-agent", task: "investigate and fix the retry regression, then verify it" })
```

Select a child model per call with `model: "provider/id"`, or omit `model` to inherit the parent. Pin a durable default with the Pi setting `subagents.agentOverrides.<agent>.model` (or `subagents.defaultModel` for all agents). For fan-out, make one `workflow: "parallel"` call with an `args.tasks` array.

`poteto-agent` self-instructs to read the bundled `poteto-mode` skill in full before working, so the behavior upstream got via prompt injection is preserved without this fork injecting anything.

## What's included

- 49 skills under `skills/`, matching the upstream inventory minus Cursor-only `make-bot-ui` (prose adapted where Pi differs). Two skills are renamed from upstream to avoid colliding with common user-global skills: `tdd` → `tdd-bug-fix` and `teach` → `explain`. Internal cross-references (e.g. the `bug-fix` playbook pointing at `tdd-bug-fix`) are updated to match.
- `poteto-agent` and `comment-sicko` agent definitions under `agents/`, discovered by pi-subagents via `package.json` `pi.subagents.agents`.
- Commands: `/poteto-mode` (sticky Poteto Mode for the session) and `/setup-pstack` (the interactive per-role model map wizard).
- Tools: none. Task tracking, session recall, and subagent delegation use the host environment (a todolist, `recall`, the native `subagent` tool).

Running the test suite (`npm test`) requires [bun](https://bun.sh).

## Model routing

`setup-pstack` writes a per-role model map that the extension injects into context. Each role resolves to a model, and skills name their role when they delegate.

The map lives at `$PI_CODING_AGENT_DIR/pstack/models.json` when that env var is set, otherwise `~/.pi/agent/pstack/models.json` under pi or `~/.omp/agent/pstack/models.json` under omp. The same resolution as the pstack config file.

```json
{
  "buckets": { "code": "xai/grok-4", "judgment": "anthropic/claude-opus-4-6:high" },
  "roles": { "reflect-tooling": "openai/gpt-5" }
}
```

Two buckets group the roles. The `code` bucket covers `feature`, `refactoring`, `bug-fix`, `perf-issue`, `hillclimb`, `arena-runners`, `swarm-workers`, `why-investigators`, `how-explorer`. The `judgment` bucket covers `architect-runners`, `cross-judge`, `reflect-judgment`, `reflect-tooling`, `interrogate-reviewers`, `why-synthesizer`, `how-explainer`.

Resolution for a role is `roles[role]`, then `buckets[bucket(role)]`, then inherit-parent. At the role level, the literal values `inherit-parent` and `auto` are treated as unset and fall through to the bucket. They do not bypass a pinned bucket. At the bucket level, these aliases leave the bucket unpinned. Omit `model` only when resolution yields no configured slug. A slug may carry a native `:level` thinking suffix (`off`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`). A missing or malformed `models.json` injects nothing, so unconfigured roles inherit the parent model.

The extension injects one grouped line listing each pinned bucket with the roles that still fall back to it, then any fine-role overrides. A role with its own override is dropped from its bucket's list and shown only under overrides, so no role is double-listed, and a bucket whose every role is overridden is omitted entirely. Unrecognized `roles.*` or `buckets.*` keys (a hand-edited typo like `roles.swarm-worker`) are ignored but logged once per session to a console warning, so a bad edit is not lost in silence.

Run `/setup-pstack` to pick a model per bucket with optional fine-role overrides. The wizard reads the live model catalog via `subagent({ action: "models" })`, validates each base slug against it (stripping any `:level` thinking suffix first, since the catalog lists bare `provider/id` slugs), rejects an unknown slug with the closest catalog ids, and merges your picks into the file as a non-destructive merge that keeps every value you did not change. The change takes effect on the next agent start, with no restart needed.

The native per-call `model` (omit to inherit the parent) and the Pi setting `subagents.agentOverrides.<agent>.model` (or `subagents.defaultModel` for all agents) remain the lower-level escape hatch.

## What's removed vs upstream

- The upstream `subagent` tool and its child-Pi process runner. Use the native pi-subagents `subagent` instead.
- The `pstack_config`, `pstack_todo`, and `pstack_sessions` tools. Task tracking and session recall use the host environment (a todolist, `recall`).

## What's renamed vs upstream

Upstream skill names assume Cursor's isolated plugin namespace. On Pi, skills share one namespace with the user's global skills (`~/.pi/agent/skills`, `~/.agents/skills`), so generically named skills collide. Two are renamed to keep both the pstack and user versions resolvable:

- `tdd` → `tdd-bug-fix`. The pstack skill is a narrow failing-test-first bug-fix loop (`disable-model-invocation`), not a general TDD reference. The new name reflects its scope and clears the common user `tdd` skill.
- `teach` → `explain`. The pstack skill explains a body of code by running `how` and `why`, distinct from a stateful multi-session teaching workspace. `explain` matches its intent and clears a user `teach` skill.

References inside the port are updated to the new names.

## Safety

The extension requests confirmation for recognizable shell commands that push, alter pull requests, merge, deploy, mutate infrastructure, or recursively delete files. In non-interactive mode it blocks these commands. This is a guardrail, not a complete shell-security sandbox.

To run without approval prompts, set `confirmExternalActions` to `false` in the pstack config file: `$PI_CODING_AGENT_DIR/pstack/config.json` when that env var is set, otherwise `~/.omp/agent/pstack/config.json` under omp or `~/.pi/agent/pstack/config.json` under pi (same resolution as pi-headroom's settings). Restart the host after a config change. A missing, malformed, or non-boolean config keeps the guard enabled. With the guard disabled, agents are told to run recognized external commands without asking and still pause for irreversible writes (force-pushes to shared branches, deployments, data deletion, customer messages).

## License and provenance

Derived from Cursor's pstack, licensed under MIT. See [LICENSE](LICENSE).
