---
name: setup-pstack
description: "Use for /setup-pstack, 'configure pstack models', 'set the pstack role models', or picking a model per pstack role. Interactive wizard that writes the per-role model map the extension injects into context."
disable-model-invocation: true
---

# Setup pstack

Pick a pi model and optional thinking level per pstack role. The wizard writes the pstack models file. The extension reads that file and injects the resolved map into context on every agent start, so edits take effect on the next agent start with no restart needed.

The map has two buckets. Each role falls back to its bucket, then to inherit-parent. Unconfigured roles inherit the parent model.

## Models file

The command passes the models file path as the argument after `/setup-pstack`. Use that path for the read in step 2 and the write in step 7. When no argument is present, resolve the path the same way the extension does. Use `$PI_CODING_AGENT_DIR/pstack/models.json` when that env var is set. Else use `~/.omp/agent/pstack/models.json` under omp or `~/.pi/agent/pstack/models.json` under pi.

## Canonical roles

The `code` bucket covers `feature`, `refactoring`, `bug-fix`, `perf-issue`, `hillclimb`, `arena-runners`, `swarm-workers`, `why-investigators`, `how-explorer`.

The `judgment` bucket covers `architect-runners`, `cross-judge`, `reflect-judgment`, `reflect-tooling`, `interrogate-reviewers`, `why-synthesizer`, `how-explainer`.

## Resolution

Resolution for a role is `roles[role]`, then `buckets[bucket(role)]`, then inherit-parent. The literal values `inherit-parent` and `auto` mean inherit-parent and drop the key. A slug may carry a native `:level` thinking suffix. Levels are `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`.

## Wizard

Run these steps in order. Ask one question at a time. Accept Enter to take the recommended default.

1. List available models. Call `subagent({ action: "models" })` and keep the returned slugs as the catalog.
2. Load current picks. If the models file exists, parse it and pre-fill each answer with the current value. This is a merge. Keep every value the operator does not change.
3. Ask the `code` model. Recommend a generation-class slug from the catalog, inherit-parent when unsure. Validate the base slug against the catalog. Strip any `:level` thinking suffix before the check, because the catalog lists bare `provider/id` slugs and a value pre-filled in step 2 may already carry a suffix. Reject an unknown base slug and show the closest catalog ids. Enter keeps the current value or inherit-parent.
4. Ask the `judgment` model. Recommend a top-reasoning slug from the catalog, inherit-parent when unsure. Validate the same way, stripping any `:level` suffix first.
5. Ask an optional thinking level per chosen bucket. Append it as `:level`. Enter skips the level.
6. Offer fine-role overrides once. List the canonical roles above. The operator names a role and a slug to override its bucket. Enter skips overrides. Selecting inherit-parent for a role drops its key.
7. Write the merged map to the models file with the `write` tool. Omit a bucket or role whose answer resolved to inherit-parent. Write `{}` when nothing is pinned.
8. Print the resolved map. Show what each role will use. Note that the change takes effect on the next agent start, with no restart needed.

## Schema

```json
{
  "buckets": { "code": "xai/grok-4", "judgment": "anthropic/claude-opus-4-6:high" },
  "roles": { "reflect-tooling": "openai/gpt-5" }
}
```

The role to bucket table lives in the extension, never in this file. A missing or malformed `models.json` injects nothing, so an incomplete write is safe to retry.
