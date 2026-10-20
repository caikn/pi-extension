# Poteto Mode upstream sync

## Source

Upstream commit: `88d47514b82e7c44f00f2b2a72ff6dd12158038c`.

[Immutable source](https://github.com/cursor/plugins/blob/88d47514b82e7c44f00f2b2a72ff6dd12158038c/pstack/skills/poteto-mode/SKILL.md).

Scope: Poteto Mode instructions, README task/model wording, Babysit status-request mapping, and verification tests. Extension runtime, model resolver, agent definitions, and other playbooks are unchanged.

## Ported

- Bundled-skill location and absolute path in delegate prompts.
- Investigation exception to prototype-based fork resolution, full-autonomy decisions, and operator response wording.
- Cite only principle leaves read this session, alongside the existing real-decision requirement.
- Reply cleanup trigger and Writing the reply reference.
- Expanded PR-status examples and playbook-owned mode mapping.
- Decision-trail examples and separate local/auditable-record sentences.
- Parent chat owns the playbook; routed skills own their agents and models.
- Fresh-agent warning for interrupt-chained resumes.
- Attack the Premise wording and position, Fix Root Causes, Test Behavior Not Implementation, and Build the Lever sentence split.
- Reply and Comments simplifications.
- Orchestrate sentence splits and Autopilot-full wording.

Principles were compared entry by entry after removing explicit name annotations. All 24 entries match the pinned upstream text and order. Prove It Works needed no text change.

## Kept or skipped upstream differences

| Area | Decision and reason |
| --- | --- |
| Commands | Keep both `/poteto-mode` and `/skill:poteto-mode`; Pi supports both. |
| Frontmatter | Keep `disable-model-invocation`; skip `icon` and `color`, which are platform-specific. |
| Principles-first tracking | Keep the initial Principles-reading item; append verbatim playbook steps to the same todolist to remove conflicting first-item rules. |
| Citation semantics | Keep the real-decision constraint; reading a leaf alone does not justify a citation. |
| Question tool | Replace `AskQuestion` with asking the user; Pi does not provide that tool. |
| Autonomy gate | Use the configured enabled/disabled policy and retain irreversible-action pauses; an autonomy grant does not disable the guard. |
| MCP scope | Keep documented tool scope instead of upstream's unrestricted “any MCP tool.” |
| Agent skill standard | Keep Pi Agent Skills standard instead of Cursor's built-in `create-skill`. |
| Technical writing command | Keep `/skill:technical-writing` for Pi command syntax. |
| Cleanup | Keep combined `unslop` and `no-comments` before commit and optional-skill detection; do not require `cursor-team-kit` or `deslop`. |
| Surface verification | Keep available project tooling instead of mandatory Cursor control skills; retain same-surface reproduction. |
| Benchmark trigger | Port upstream ordering; retain the existing checklist requirement. |
| Babysit | Skip Cursor built-in-skill and phase-agent `drive` tool warnings; keep actual playbook modes and explicitly map “anything outstanding on X” to `check`. |
| Loop examples | Use “run until done” and the local `/loop` in omp / explicit watcher commands in pi wording; do not advertise `/loop` as a plain-Pi command. |
| Principle lookup | Keep all explicit `principle-*` names instead of derived kebab-case lookup. |
| Delegation API | Keep native `subagent`, parallel `args.tasks`, scripted `runs.all`, durable defaults, local execution, and retained resume constraints; skip `Task`, `subagent_type`, `run_in_background`, and readonly advice. |
| Routed workflows | Include arena and architect as well as upstream's examples; preserve their prescribed agents and diverse-model choices. |
| Model defaults | Use resolved pstack roles, not upstream hard-coded families or a nonexistent hardest-task/prose role. |
| Model aliases | Match current resolver: role-level `auto` and `inherit-parent` fall through to bucket; omit only when no configured slug resolves. |
| Adaptive effort/speed | Skip automatic level adjustments, speed variants, nearest-slug selection, and adjusted-slug retries; pass exact configured slugs without changing runtime policy. |
| Verification model | Keep the canonical `swarm-workers` role. |
| Playbook lookup | Keep every explicit `playbooks/*.md` path instead of derived titles. |
| Pause safely | Keep Pi restart wording, not Cursor restart. |

No remaining differences in the pinned skill comparison are unexplained by the table above.

## Verification

Executable checks:

- `npm test`: all three contract scripts and 57 tests pass, including five new Poteto Mode instruction/reference checks.
- `npm run typecheck`: passes.
- Native Pi skill loader: 49 skills, Poteto Mode marked explicit-only, no diagnostics.
- Isolated `pi --mode rpc --no-session --no-extensions --no-mcp --no-context-files -e ./pi-pstack`: `/poteto-mode` and `/skill:poteto-mode` registered through `get_commands`; no model call or external action.
- Extension contract uses mock handlers: enabled guard prompts or blocks without UI; disabled guard registers no interception and injects both no-extra-confirmation guidance and irreversible-write boundary.
- Resolver checks exercise explicit overrides, role aliases with and without bucket pins, and exact suffix-bearing/suffix-free slugs.
- Existing watcher CLI test proves `--status-only` returns one terminal status report without entering queue polling; its mock clock throws on sleep.
- `git diff --check`: passes.

Static and manual checks:

- Bundled playbook/reference paths, model-module path, all 24 principle leaves, and named model roles resolve.
- Removed every reference to the unavailable task tool. No unintended Cursor tool names or model slugs occur in Poteto Mode.
- Babysit step 1 maps status questions to `check` and “get it green” to `drive`, retaining the docs-only exception.
- Todolist ordering is Principles first, verbatim playbook steps next, task-specific items last.
- Final skill compared line by line against pinned upstream, including all Principles and Playbooks entries.

Limits: instruction tests check text contracts, not model obedience. No live model-mediated `/poteto-mode` task, full-autonomy run, or forge operation was executed. The RPC smoke proves command discovery, not model behavior. Irreversible-action pauses with the guard disabled remain instructions, not shell enforcement.

Dependencies were absent initially. Installed declared dev dependencies with `npm install --ignore-scripts --package-lock=false`; no manifest or lockfile changes. npm reported one high-severity dependency vulnerability. Audit detail was unavailable without a lockfile; dependency remediation is outside this sync.
