---
name: swarm
description: "Fan out N parallel workers, drain them, and return one report. Use for /swarm, 'swarm this', or parallel coverage, races, gauntlets, and exploration."
disable-model-invocation: true
---

# Swarm

Fan out N parallel cloud workers. They may cover separate slices, race the same brief, or mix both. The parent waits, aggregates, and returns one report.

## Start

Open a todolist with one entry per phase before launching anything.

1. Frame
2. Fan out
3. Aggregate
4. Report

## Phase A: Frame

1. State the done predicate and the artifact or report the swarm must return.
2. Choose the shape. Partition into slices, race N workers on identical briefs, or mix both. For a race or mixed shape, declare `first pass`, `rank all`, or `best-of` before spawning.
3. Set N from the user or derive it from the shape. N is total workers, not the cloud concurrency limit.
4. Pick the worker model. Use the `swarm-workers` model from the pstack model map, else omit `model` to inherit the parent. Pin one with a per-call `model: "provider/id"` (or the Pi setting `subagents.agentOverrides.poteto-agent.model`). For a model race, name each arm's model up front.
5. Give each worker its own writable output when it writes. When workers verify or measure commits, each brief names the exact SHAs. A measurement brief also names the method (sample count, what one sample is, order). The worker records both in its result.

## Phase B: Fan out

Use `agent: "poteto-agent"` unless a workflow names another agent. Spawn all N workers in one call. When every worker runs the same model, use `workflow: "parallel"` with an `args.tasks` array of `{ agent, task }`; set the shared model with the call's top-level `model`, using the `swarm-workers` model from the pstack model map, else omit `model` to inherit the parent. The data-only `args.tasks` form rejects any item field beyond `agent` and `task`, so a model race needs a `workflow: true` script instead: write one `` ```js workflow `` block that calls `runs.all([...])` and give each item its own `model`.

```js workflow
const results = await runs.all([
  { key: "arm-grok", agent: "poteto-agent", model: "xai/grok-4", task: "<brief>" },
  { key: "arm-opus", agent: "poteto-agent", model: "anthropic/claude-opus-4-6", task: "<brief>" }
]);
return results.map((r) => r.output);
```

Pi child processes run locally with isolated context, so give each task explicit file pointers and prevent concurrent writes to shared paths.

When a worker must start from a non-default ref, give it a managed worktree in a `workflow: true` script and set `baseRef` on the child. Allowed values are `HEAD` or a named ref such as `refs/heads/release` or `origin/main`. A full commit SHA is not supported.

Every brief stands alone. Include the goal, scope, exact slice or race arm, how to verify, and what to report. Reports use `PASS`, `ISSUES`, or `BLOCKED` with evidence.

If a worker drops out, proceed with N-1 and note it.

## Phase C: Aggregate

Read the terminal results. Drop a result that does not record the SHAs and method its brief names, and respawn that worker once. After a second miss, record a gap. A gap does not count as a pass. For coverage, every required slice needs a result. For a race, apply the selection rule declared up front. Use first pass, rank all, or best-of. Do not paste raw worker dumps.

Keep a compact result table, one-line evidenced issues, and explicit gaps or dropouts.

## Phase D: Report

Return one consolidated in-chat report with the table, issue one-liners, gaps or dropouts, and the race rule when used.
