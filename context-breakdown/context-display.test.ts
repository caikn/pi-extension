import { describe, expect, it } from "bun:test";
import {
  buildGrid,
  buildLegendLines,
  consolidate,
  formatPercent,
  formatTokens,
  resolveBuffer,
  tokens,
} from "./context-display.ts";

describe("formatTokens", () => {
  it("returns raw number below 1000", () => {
    expect(formatTokens(999)).toBe("999");
    expect(formatTokens(412)).toBe("412");
    expect(formatTokens(0)).toBe("0");
  });

  it("returns K suffix at 1000+ with one-decimal precision, trailing .0 trimmed", () => {
    expect(formatTokens(1000)).toBe("1K");
    expect(formatTokens(11000)).toBe("11K");
    expect(formatTokens(3400)).toBe("3.4K");
    expect(formatTokens(4900)).toBe("4.9K");
    expect(formatTokens(839000)).toBe("839K");
  });

  it("returns m suffix at 1_000_000+", () => {
    expect(formatTokens(1_000_000)).toBe("1m");
    expect(formatTokens(2_500_000)).toBe("2.5m");
  });
});

describe("formatPercent", () => {
  it("returns 0.0% when part is zero", () => {
    expect(formatPercent(0, 1000)).toBe("0.0%");
  });

  it("returns 0.0% when whole is zero", () => {
    expect(formatPercent(0, 0)).toBe("0.0%");
  });

  it("returns <0.1% for very small but nonzero share", () => {
    expect(formatPercent(1, 10000)).toBe("<0.1%");
    expect(formatPercent(4, 10000)).toBe("<0.1%");
  });

  it("returns formatted pct for normal values", () => {
    expect(formatPercent(500, 1000)).toBe("50.0%");
    expect(formatPercent(1, 100)).toBe("1.0%");
    expect(formatPercent(1000, 128000)).toBe("0.8%");
  });

  it("boundary: 0.05% rounds to 0.1%", () => {
    const result = formatPercent(5, 10000);
    expect(result).toBe("0.1%");
  });
});

describe("tokens helper", () => {
  it("converts chars to tokens via ceil(n/4)", () => {
    expect(tokens(4)).toBe(1);
    expect(tokens(5)).toBe(2);
    expect(tokens(0)).toBe(0);
    expect(tokens(400)).toBe(100);
  });
});

describe("resolveBuffer", () => {
  it("returns 0 when compaction is disabled", () => {
    expect(resolveBuffer(undefined, { enabled: false })).toBe(0);
  });

  it("uses global reserveTokens", () => {
    expect(resolveBuffer(undefined, { reserveTokens: 8000 })).toBe(8000);
  });

  it("uses model override over global", () => {
    const model = { id: "claude-3-5-sonnet", provider: "anthropic" };
    const compaction = {
      reserveTokens: 8000,
      modelOverrides: { "anthropic/claude-3-5-sonnet": { reserveTokens: 4000 } },
    };
    expect(resolveBuffer(model, compaction)).toBe(4000);
  });

  it("falls back to 16384 default", () => {
    expect(resolveBuffer(undefined, {})).toBe(16384);
  });
});

describe("consolidate", () => {
  function makeBuckets(): Map<string, number> {
    const b = new Map<string, number>();
    b.set("system: preamble", 400);
    b.set("system: tool definitions", 800);
    b.set("system: skills", 1200);
    b.set("system: project", 600);
    b.set("system: cwd", 200);
    b.set("conversation: user", 2000);
    b.set("conversation: assistant text", 3000);
    b.set("summaries", 1600);
    return b;
  }

  it("maps buckets to the five ordered categories", () => {
    const usage = { tokens: null, contextWindow: 128000, percent: null };
    const model = { id: "m", provider: "p", contextWindow: 128000 };
    const { segments } = consolidate(makeBuckets(), usage, model, 0);

    const ids = segments.map((s) => s.id);
    expect(ids[0]).toBe("system-prompt");
    expect(ids[1]).toBe("system-tools");
    expect(ids[2]).toBe("system-context");
    expect(ids[3]).toBe("skills");
    expect(ids[4]).toBe("messages");
    expect(ids[5]).toBe("free");
    expect(ids[6]).toBe("buffer");
  });

  it("computes correct token counts for each category", () => {
    const usage = { tokens: null, contextWindow: 128000, percent: null };
    const model = { id: "m", provider: "p", contextWindow: 128000 };
    const { segments } = consolidate(makeBuckets(), usage, model, 0);

    const byId = Object.fromEntries(segments.map((s) => [s.id, s.tokens]));

    expect(byId["system-prompt"]).toBe(tokens(400));
    expect(byId["system-tools"]).toBe(tokens(800));
    expect(byId["system-context"]).toBe(tokens(600) + tokens(200));
    expect(byId["skills"]).toBe(tokens(1200));
    expect(byId["messages"]).toBe(tokens(2000) + tokens(3000) + tokens(1600));
  });

  it("uses provider tokens when not null", () => {
    const usage = { tokens: 50000, contextWindow: 128000, percent: 39.06 };
    const model = { id: "m", provider: "p", contextWindow: 128000 };
    const { used } = consolidate(makeBuckets(), usage, model, 0);
    expect(used).toBe(50000);
  });

  it("falls back to estimated sum when tokens is null", () => {
    const usage = { tokens: null, contextWindow: 128000, percent: null };
    const model = { id: "m", provider: "p", contextWindow: 128000 };
    const { used } = consolidate(makeBuckets(), usage, model, 0);
    const expected =
      tokens(400) +
      tokens(800) +
      tokens(1200) +
      tokens(600) +
      tokens(200) +
      tokens(2000) +
      tokens(3000) +
      tokens(1600);
    expect(used).toBe(expected);
  });

  it("allocates buffer at the end with correct token count", () => {
    const usage = { tokens: null, contextWindow: 128000, percent: null };
    const model = { id: "m", provider: "p", contextWindow: 128000 };
    const buffer = 16384;
    const { segments } = consolidate(makeBuckets(), usage, model, buffer);
    const bufSeg = segments.find((s) => s.id === "buffer");
    expect(bufSeg?.tokens).toBe(buffer);
  });
});

describe("buildLegendLines", () => {
  it("shows every fixed category including zero-token ones", () => {
    const usage = { tokens: 11000, contextWindow: 1_000_000, percent: 1.1 };
    const model = { id: "anthropic--claude-4.6-sonnet", name: "Claude Sonnet 4.6", provider: "bfm", contextWindow: 1_000_000 };
    const b = new Map<string, number>([
      ["system: preamble", 400],
      ["system: skills", 1600],
    ]);
    const { segments, used, window } = consolidate(b, usage, model, 150000);
    const text = buildLegendLines(segments, used, window, model).map((l) => l.text).join("\n");
    expect(text).toContain("Messages: 0 tokens (0.0%)");
    expect(text).toContain("System context: 0 tokens (0.0%)");
    expect(text).toContain("Autocompact buffer: 150K tokens (15.0%)");
    expect(text).toContain("(bfm) (1m context)");
    expect(text).toContain("Claude Sonnet 4.6");
  });
});

describe("buildGrid", () => {
  const cols = 20;
  const rows = 10;

  it("total cells equals cols * rows", () => {
    const usage = { tokens: null, contextWindow: 128000, percent: null };
    const model = { id: "m", provider: "p", contextWindow: 128000 };
    const b = new Map<string, number>([
      ["system: preamble", 40000],
      ["system: tool definitions", 20000],
      ["conversation: user", 50000],
    ]);
    const { segments, window } = consolidate(b, usage, model, 16384);
    const grid = buildGrid(segments, window, cols, rows);
    expect(grid.length).toBe(rows);
    for (const row of grid) expect(row.length).toBe(cols);
    const flat = grid.flat();
    expect(flat.length).toBe(cols * rows);
  });

  it("last cells are buffer glyphs even when segment counts do not sum exactly", () => {
    const window = 1_000_000;
    const segments = [
      { id: "messages", label: "Messages", icon: "■", colorToken: "toolOutput" as const, tokens: 11000 },
      { id: "free", label: "Free", icon: "□", colorToken: "dim" as const, tokens: 839000 },
      { id: "buffer", label: "Buffer", icon: "⊠", colorToken: "warning" as const, tokens: 150000 },
    ];
    const grid = buildGrid(segments, window, cols, rows);
    const flat = grid.flat();
    expect(flat.length).toBe(cols * rows);
    const bufferCells = Math.round((150000 / window) * cols * rows);
    for (let i = flat.length - bufferCells; i < flat.length; i++) {
      expect(flat[i]!.glyph).toBe("⊠");
      expect(flat[i]!.colorToken).toBe("warning");
    }
    expect(flat[flat.length - bufferCells - 1]!.glyph).not.toBe("⊠");
  });

  it("returns dim cells for zero window", () => {
    const segments = [{ id: "messages", label: "Messages", icon: "■", colorToken: "toolOutput" as const, tokens: 10 }];
    const grid = buildGrid(segments, 0, cols, rows);
    const flat = grid.flat();
    expect(flat.every((c) => c.colorToken === "dim")).toBe(true);
  });
});
