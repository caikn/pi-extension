# context-breakdown

A Pi extension that adds a `/context` command: a per-category estimate of what currently fills the model's context window.

Pi's footer shows only the aggregate (tokens / window / percent). This splits the same transcript into buckets so you can see where the budget goes.

## Example output

```
Context breakdown (estimates):
  system: skills                    8,210 tok
  conversation: assistant text      5,430 tok
  system: tool definitions          3,900 tok
  conversation: tool results        3,120 tok
  conversation: user                2,050 tok
  system: project                   1,440 tok
  system: preamble                    980 tok
  system: cwd                         210 tok
  estimated sum                    25,340 tok
  provider total                   26,112 tok  (20.4% of 128,000)
```

Bucket names come straight from the transcript. The `system: <tag>` rows are whatever named sections Pi tagged (`skills`, `project`, `cwd`, and so on), so the set depends on what is loaded.

## How it works

- Walks `ctx.sessionManager.buildSessionProjection().messages`.
- Buckets each piece: system preamble, each named system section, tool definitions (`toolsAdded`), and the conversation by role (user, assistant text, assistant thinking, tool calls, tool results, bash, custom, summaries).
- System sections use the transcript's replace-by-name semantics, so the report reflects the current effective prompt, not every historical revision.
- Estimates tokens as `ceil(chars / 4)` and counts each image as ~4800 chars, matching Pi's own heuristic.

## Accuracy

Per-section numbers are estimates. The only exact figure is the `provider total` line, which comes from the provider's reported usage via `ctx.getContextUsage()`. Providers bill one lump, so a per-section split can never be exact. Right after a compaction, before the next model response, the provider total reads `unknown` because Pi cannot yet trust a usage number.

## Install

Load for one session:

```bash
pi --extension ./context-breakdown
```

Or install it permanently by placing this directory under `~/.pi/agent/extensions/` (Pi loads a subdirectory with an `index.ts` entry point). See `docs/extensions.md`. Pi runs TypeScript directly via `jiti`, so no build step is needed.
