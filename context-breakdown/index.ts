import type { CompactionSettings, ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";
import type { Focusable } from "@earendil-works/pi-tui";
import { visibleWidth } from "@earendil-works/pi-tui";
import {
  buildGrid,
  buildLegendLines,
  consolidate,
  formatPercent,
  formatTokens,
  resolveBuffer,
  type CellSpec,
  type LegendLine,
  type ModelInfo,
} from "./context-display.js";

/** Matches Pi's ESTIMATED_IMAGE_CHARS so image-heavy context is not undercounted. */
const IMAGE_CHARS = 4800;

function contentChars(content: unknown): number {
  if (typeof content === "string") return content.length;
  if (!Array.isArray(content)) return 0;
  let chars = 0;
  for (const block of content as Array<Record<string, unknown>>) {
    const type = block?.type;
    if (type === "text" && typeof block.text === "string") chars += block.text.length;
    else if (type === "thinking" && typeof block.thinking === "string") chars += block.thinking.length;
    else if (type === "toolCall")
      chars += String(block.name ?? "").length + JSON.stringify(block.arguments ?? {}).length;
    else if (type === "image") chars += IMAGE_CHARS;
  }
  return chars;
}

type Buckets = Map<string, number>;

function add(buckets: Buckets, key: string, chars: number): void {
  if (chars <= 0) return;
  buckets.set(key, (buckets.get(key) ?? 0) + chars);
}

/**
 * Fold the transcript into character buckets. System sections use replace-by-name semantics
 * so the result reflects the current effective prompt, not every historical revision.
 */
function collectBuckets(messages: ReadonlyArray<Record<string, unknown>>): Buckets {
  const buckets: Buckets = new Map();
  const sections = new Map<string, string>();
  let preambleChars = 0;
  let toolChars = 0;

  for (const message of messages) {
    switch (message.role) {
      case "system": {
        preambleChars += contentChars(message.content);
        const secs = message.sections as Record<string, string | null> | undefined;
        if (secs)
          for (const [tag, value] of Object.entries(secs)) {
            if (value === null) sections.delete(tag);
            else if (typeof value === "string") sections.set(tag, value);
          }
        if (Array.isArray(message.toolsAdded)) toolChars += JSON.stringify(message.toolsAdded).length;
        break;
      }
      case "user":
        add(buckets, "conversation: user", contentChars(message.content));
        break;
      case "assistant": {
        const content = Array.isArray(message.content)
          ? (message.content as Array<Record<string, unknown>>)
          : [];
        for (const block of content) {
          if (block.type === "text") add(buckets, "conversation: assistant text", String(block.text ?? "").length);
          else if (block.type === "thinking")
            add(buckets, "conversation: assistant thinking", String(block.thinking ?? "").length);
          else if (block.type === "toolCall")
            add(
              buckets,
              "conversation: tool calls",
              String(block.name ?? "").length + JSON.stringify(block.arguments ?? {}).length,
            );
        }
        break;
      }
      case "toolResult":
        add(buckets, "conversation: tool results", contentChars(message.content));
        break;
      case "bashExecution":
        add(
          buckets,
          "conversation: bash",
          String(message.command ?? "").length + String(message.output ?? "").length,
        );
        break;
      case "custom":
        add(buckets, "conversation: custom", contentChars(message.content));
        break;
      case "branchSummary":
      case "compactionSummary":
        add(buckets, "summaries", String(message.summary ?? "").length);
        break;
      default:
        break;
    }
  }

  add(buckets, "system: preamble", preambleChars);
  add(buckets, "system: tool definitions", toolChars);
  for (const [tag, value] of sections) add(buckets, `system: ${tag}`, value.length);

  return buckets;
}

const GRID_COLS = 20;
const GRID_ROWS = 10;

class ContextUsageOverlay implements Focusable {
  readonly width: number;
  focused = false;

  private readonly grid: CellSpec[][];
  private readonly legendLines: LegendLine[];
  private readonly theme: Theme;
  private readonly done: () => void;

  constructor(
    theme: Theme,
    done: () => void,
    grid: CellSpec[][],
    legendLines: LegendLine[],
    width: number,
  ) {
    this.theme = theme;
    this.done = done;
    this.grid = grid;
    this.legendLines = legendLines;
    this.width = width;
  }

  handleInput(_data: string): void {
    this.done();
  }

  render(_width: number): string[] {
    const th = this.theme;
    const w = this.width;
    const innerW = w - 2;
    const lines: string[] = [];

    const pad = (s: string, len: number) => {
      const vis = visibleWidth(s);
      return s + " ".repeat(Math.max(0, len - vis));
    };

    const row = (content: string) =>
      th.fg("border", "│") + pad(content, innerW) + th.fg("border", "│");

    const titleText = " Context Usage ";
    const borderLen = innerW - visibleWidth(titleText);
    const leftDash = Math.floor(borderLen / 2);
    const rightDash = borderLen - leftDash;
    lines.push(
      th.fg("border", "╭" + "─".repeat(leftDash)) +
        th.fg("accent", titleText) +
        th.fg("border", "─".repeat(rightDash) + "╮"),
    );

    const gridWidth = GRID_COLS;

    const maxRows = Math.max(this.grid.length, this.legendLines.length);
    for (let r = 0; r < maxRows; r++) {
      let content = " ";

      const gridRow = this.grid[r];
      if (gridRow) {
        for (const cell of gridRow) {
          content += th.fg(cell.colorToken, cell.glyph);
        }
      } else {
        content += " ".repeat(gridWidth);
      }

      content += "  ";

      const legendLine = this.legendLines[r];
      if (legendLine) {
        for (const part of legendLine.parts) {
          content += part.colorToken ? th.fg(part.colorToken, part.text) : part.text;
        }
      }

      lines.push(row(content));
    }

    lines.push(row(""));
    lines.push(row(" " + th.fg("dim", "any key to close")));
    lines.push(th.fg("border", "╰" + "─".repeat(innerW) + "╯"));

    return lines;
  }

  invalidate(): void {}
  dispose(): void {}
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("context", {
    description: "Per-category estimate of what fills the context window",
    handler: async (_args, ctx) => {
      const projection = ctx.sessionManager.buildSessionProjection();
      const messages = projection.messages as unknown as Array<Record<string, unknown>>;
      const buckets = collectBuckets(messages);

      if (buckets.size === 0) {
        ctx.ui.notify("No context to report yet.", "info");
        return;
      }

      const usage = ctx.getContextUsage();
      const model = ctx.model as ModelInfo | undefined;
      const settings = pi.getSettings();
      const compaction: CompactionSettings = settings.compaction ?? {};
      const buffer = resolveBuffer(model, compaction);

      const data = consolidate(buckets, usage, model, buffer);

      if (ctx.mode !== "tui") {
        const used = formatTokens(data.used);
        const win = formatTokens(data.window);
        const pct = formatPercent(data.used, data.window);
        const catLines = data.segments
          .filter((s) => s.tokens > 0)
          .map((s) => `  ${s.icon} ${s.label}: ${formatTokens(s.tokens)} tokens (${formatPercent(s.tokens, data.window)})`)
          .join("\n");
        ctx.ui.notify(
          `Context Usage: ${used}/${win} tokens (${pct})\n\nEstimated usage by category:\n${catLines}`,
          "info",
        );
        return;
      }

      const grid = buildGrid(data.segments, data.window, GRID_COLS, GRID_ROWS);
      const legendLines = buildLegendLines(data.segments, data.used, data.window, model);

      const overlayWidth = Math.min(
        80,
        GRID_COLS + 3 + Math.max(...legendLines.map((l) => visibleWidth(l.text))) + 4,
      );

      await ctx.ui.custom(
        (_tui, theme, _kb, done) =>
          new ContextUsageOverlay(theme, () => done(undefined), grid, legendLines, overlayWidth),
        {
          overlay: true,
          overlayOptions: { anchor: "center", width: overlayWidth },
        },
      );
    },
  });
}
