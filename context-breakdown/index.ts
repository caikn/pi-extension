import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** Matches Pi's own heuristic: ~4 chars per token. */
const CHARS_PER_TOKEN = 4;
/** Matches Pi's ESTIMATED_IMAGE_CHARS so image-heavy context is not undercounted. */
const IMAGE_CHARS = 4800;

const tokens = (chars: number): number => Math.ceil(chars / CHARS_PER_TOKEN);

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
 * Fold the transcript into character buckets. System sections are resolved with
 * the transcript's own replace-by-name semantics (a later message's section
 * value replaces an earlier one; null removes it) so the result reflects the
 * current effective prompt, not every historical revision.
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

  // Fold the resolved system pieces into named buckets.
  add(buckets, "system: preamble", preambleChars);
  add(buckets, "system: tool definitions", toolChars);
  for (const [tag, value] of sections) add(buckets, `system: ${tag}`, value.length);

  return buckets;
}

function pad(text: string, width: number): string {
  return text.length >= width ? text : text + " ".repeat(width - text.length);
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

      const rows = [...buckets.entries()]
        .map(([key, chars]) => [key, tokens(chars)] as const)
        .sort((a, b) => b[1] - a[1]);

      const estTotal = rows.reduce((sum, [, tok]) => sum + tok, 0);
      const keyWidth = Math.max(...rows.map(([key]) => key.length), 12);

      const lines = rows.map(
        ([key, tok]) => `  ${pad(key, keyWidth)}  ${tok.toLocaleString().padStart(9)} tok`,
      );
      lines.push(`  ${pad("estimated sum", keyWidth)}  ${estTotal.toLocaleString().padStart(9)} tok`);

      const usage = ctx.getContextUsage();
      if (usage) {
        const window = usage.contextWindow.toLocaleString();
        if (usage.tokens === null)
          lines.push(`  ${pad("provider total", keyWidth)}  ${"unknown".padStart(9)}     (window ${window}; recompute pending)`);
        else {
          const pct = usage.percent === null ? "?" : usage.percent.toFixed(1);
          lines.push(
            `  ${pad("provider total", keyWidth)}  ${usage.tokens.toLocaleString().padStart(9)} tok  (${pct}% of ${window})`,
          );
        }
      }

      ctx.ui.notify(["Context breakdown (estimates):", ...lines].join("\n"), "info");
    },
  });
}
