# context-breakdown

A Pi extension that adds a `/context` command: a per-category estimate of what currently fills the model's context window.

Pi's footer shows only the aggregate (tokens / window / percent). This splits the same transcript into buckets so you can see where the budget goes.

## Example output

In TUI mode the command opens a bordered overlay with two columns:

```
╭──────────────── Context Usage ─────────────────╮
│ ■■■·················  Claude Sonnet 4.6         │
│ ····················  (bfm) (1m context)        │
│ ····················  anthropic--claude-4.6-... │
│ ····················                            │
│ ····················  11K/1m tokens (1.1%)      │
│ ····················                            │
│ ····················  Estimated usage by cat.   │
│ ····················  ◆ System prompt: 3.4K ... │
│ ··········⊠⊠⊠⊠⊠⊠⊠⊠⊠⊠  ◈ System tools: 4.9K ...  │
│ ⊠⊠⊠⊠⊠⊠⊠⊠⊠⊠⊠⊠⊠⊠⊠⊠⊠⊠⊠⊠  ◇ System context: 2.5K ... │
│                        ◉ Skills: 412 tokens     │
│                        ◎ Messages: 0 tokens     │
│                        □ Free space: 839K       │
│                        ⊠ Autocompact buffer: ...│
│  any key to close                               │
╰─────────────────────────────────────────────────╯
```

(`·` stands for the dim free-space `□` cell.)

**LEFT**: a 20×10 grid "memory map" of the context window. Cells fill in order: each category as a colored `■`, then free space as dim `□`, then the autocompact buffer as `⊠` (warning color) occupying the final cells.

**RIGHT legend**: model name and provider, used/window tokens and percent, then one line per segment with icon and token count.

In non-TUI (json/print) mode a plain-text summary is shown via notify instead.

## Categories and colors

| Icon | Category | Source buckets | Color |
|------|----------|----------------|-------|
| ◆ | System prompt | `system: preamble` | accent |
| ◈ | System tools | `system: tool definitions` | mdCode |
| ◇ | System context | all other `system: *` | mdLink |
| ◉ | Skills | `system: skills` | success |
| ◎ | Messages | all `conversation: *` + `summaries` | toolOutput |
| □ | Free space | window − used − buffer | dim |
| ⊠ | Autocompact buffer | `compaction.reserveTokens` (default 16384) | warning |

## Grid dimensions

The grid is always 20 columns × 10 rows = 200 cells. Each segment gets cells proportional to its share of the total context window.

## How it works

- Walks `ctx.sessionManager.buildSessionProjection().messages`.
- Buckets each piece: system preamble, each named system section, tool definitions (`toolsAdded`), and the conversation by role (user, assistant text, assistant thinking, tool calls, tool results, bash, custom, summaries).
- System sections use the transcript's replace-by-name semantics, so the report reflects the current effective prompt, not every historical revision.
- Estimates tokens as `ceil(chars / 4)` and counts each image as ~4800 chars, matching Pi's own heuristic.
- The autocompact buffer is resolved from `pi.getSettings().compaction` with per-model override support.

## Accuracy

Per-section numbers are estimates. The only exact figure is the used-token count when the provider has reported it via `ctx.getContextUsage()`. Providers bill one lump, so a per-section split can never be exact. Right after a compaction, before the next model response, the used count falls back to the estimated bucket sum.

## Install

Load for one session:

```bash
pi --extension ./context-breakdown
```

Or install it permanently by placing this directory under `~/.pi/agent/extensions/` (Pi loads a subdirectory with an `index.ts` entry point). See `docs/extensions.md`. Pi runs TypeScript directly via `jiti`, so no build step is needed.
