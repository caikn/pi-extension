import type { ThemeColor } from "@earendil-works/pi-coding-agent";

const CHARS_PER_TOKEN = 4;

export function tokens(chars: number): number {
  return Math.ceil(chars / CHARS_PER_TOKEN);
}

export interface Segment {
  id: string;
  label: string;
  icon: string;
  colorToken: ThemeColor;
  tokens: number;
}

export interface ConsolidatedData {
  segments: Segment[];
  used: number;
  window: number;
}

export interface ModelInfo {
  id?: string;
  name?: string;
  provider?: string;
  contextWindow?: number;
}

export interface UsageInfo {
  tokens: number | null;
  contextWindow: number;
  percent: number | null;
}

export interface CompactionSettings {
  enabled?: boolean;
  reserveTokens?: number;
  modelOverrides?: Record<string, { reserveTokens?: number }>;
}

const SEGMENT_DEFS: Array<{
  id: string;
  label: string;
  icon: string;
  colorToken: ThemeColor;
}> = [
  { id: "system-prompt", label: "System prompt", icon: "◆", colorToken: "accent" },
  { id: "system-tools", label: "System tools", icon: "◈", colorToken: "mdCode" },
  { id: "system-context", label: "System context", icon: "◇", colorToken: "mdLink" },
  { id: "skills", label: "Skills", icon: "◉", colorToken: "success" },
  { id: "messages", label: "Messages", icon: "◎", colorToken: "toolOutput" },
];

export function resolveBuffer(
  model: ModelInfo | undefined,
  compaction: CompactionSettings,
): number {
  if (compaction.enabled === false) return 0;
  const provider = model?.provider;
  const id = model?.id;
  if (provider && id) {
    const key = `${provider}/${id}`;
    const override = compaction.modelOverrides?.[key];
    if (override?.reserveTokens !== undefined) return override.reserveTokens;
  }
  return compaction.reserveTokens ?? 16384;
}

export function consolidate(
  buckets: Map<string, number>,
  usage: UsageInfo | null,
  model: ModelInfo | undefined,
  buffer: number,
): ConsolidatedData {
  const bucketTokens = (key: string) => tokens(buckets.get(key) ?? 0);

  const systemPromptTok = bucketTokens("system: preamble");
  const systemToolsTok = bucketTokens("system: tool definitions");
  const skillsTok = bucketTokens("system: skills");

  let systemContextTok = 0;
  for (const [key, chars] of buckets) {
    if (
      key.startsWith("system: ") &&
      key !== "system: preamble" &&
      key !== "system: tool definitions" &&
      key !== "system: skills"
    ) {
      systemContextTok += tokens(chars);
    }
  }

  let messagesTok = 0;
  for (const [key, chars] of buckets) {
    if (key.startsWith("conversation: ") || key === "summaries") {
      messagesTok += tokens(chars);
    }
  }

  const estTotal =
    systemPromptTok + systemToolsTok + systemContextTok + skillsTok + messagesTok;
  const usedTokens = usage?.tokens ?? estTotal;
  const window = usage?.contextWindow ?? model?.contextWindow ?? 128000;

  const buffer_clamped = Math.min(buffer, window);
  const freeTokens = Math.max(0, window - usedTokens - buffer_clamped);

  const categorySegments: Segment[] = [
    { ...SEGMENT_DEFS[0]!, tokens: systemPromptTok },
    { ...SEGMENT_DEFS[1]!, tokens: systemToolsTok },
    { ...SEGMENT_DEFS[2]!, tokens: systemContextTok },
    { ...SEGMENT_DEFS[3]!, tokens: skillsTok },
    { ...SEGMENT_DEFS[4]!, tokens: messagesTok },
    {
      id: "free",
      label: "Free space",
      icon: "□",
      colorToken: "dim",
      tokens: freeTokens,
    },
    {
      id: "buffer",
      label: "Autocompact buffer",
      icon: "⊠",
      colorToken: "warning",
      tokens: buffer_clamped,
    },
  ];

  return { segments: categorySegments, used: usedTokens, window };
}

export function formatTokens(n: number): string {
  const fmt = (v: number, suffix: string) => {
    const s = v.toFixed(1);
    return (s.endsWith(".0") ? s.slice(0, -2) : s) + suffix;
  };
  if (n >= 1_000_000) return fmt(n / 1_000_000, "m");
  if (n >= 1000) return fmt(n / 1000, "K");
  return String(n);
}

export function formatPercent(part: number, whole: number): string {
  if (whole === 0) return "0.0%";
  if (part === 0) return "0.0%";
  const pct = (part / whole) * 100;
  if (pct > 0 && pct < 0.05) return "<0.1%";
  return `${pct.toFixed(1)}%`;
}

export interface CellSpec {
  glyph: string;
  colorToken: ThemeColor;
}

export function buildGrid(
  segments: Segment[],
  window: number,
  cols: number,
  rows: number,
): CellSpec[][] {
  const total = cols * rows;
  const dim: CellSpec = { glyph: "□", colorToken: "dim" };
  const chunk = (cells: CellSpec[]): CellSpec[][] => {
    const grid: CellSpec[][] = [];
    for (let r = 0; r < rows; r++) grid.push(cells.slice(r * cols, (r + 1) * cols));
    return grid;
  };

  if (window === 0 || total === 0) {
    return chunk(Array.from({ length: total }, () => dim));
  }

  const bufferSeg = segments.find((s) => s.id === "buffer");
  const bufferCells = bufferSeg
    ? Math.min(total, Math.max(0, Math.round((bufferSeg.tokens / window) * total)))
    : 0;
  const frontCapacity = total - bufferCells;

  const cells: CellSpec[] = [];
  for (const seg of segments) {
    if (seg.id === "buffer") continue;
    const count = Math.round((seg.tokens / window) * total);
    const glyph = seg.id === "free" ? "□" : "■";
    for (let i = 0; i < count && cells.length < frontCapacity; i++) {
      cells.push({ glyph, colorToken: seg.colorToken });
    }
  }
  while (cells.length < frontCapacity) cells.push(dim);
  for (let i = 0; i < bufferCells; i++) {
    cells.push({ glyph: "⊠", colorToken: bufferSeg!.colorToken });
  }

  return chunk(cells);
}

export interface LegendLine {
  text: string;
  parts: Array<{ text: string; colorToken: ThemeColor | null }>;
}

function lline(
  parts: Array<{ text: string; colorToken: ThemeColor | null }>,
): LegendLine {
  return { text: parts.map((p) => p.text).join(""), parts };
}

function plain(text: string): { text: string; colorToken: null } {
  return { text, colorToken: null };
}

function colored(text: string, colorToken: ThemeColor): { text: string; colorToken: ThemeColor } {
  return { text, colorToken };
}

export function buildLegendLines(
  segments: Segment[],
  used: number,
  window: number,
  model: ModelInfo | undefined,
): LegendLine[] {
  const lines: LegendLine[] = [];

  const modelName = model?.name ?? model?.id ?? "Unknown model";
  const provider = model?.provider ?? "";
  const windowStr = formatTokens(window);
  const usedFmt = formatTokens(used);
  const pctStr = formatPercent(used, window);

  lines.push(lline([colored(modelName, "accent")]));
  if (provider) {
    lines.push(lline([colored(`(${provider})`, "muted"), plain(` (${windowStr} context)`)]));
  }
  if (model?.id && model.id !== modelName) {
    lines.push(lline([colored(model.id, "dim")]));
  }
  lines.push(lline([plain("")]));
  lines.push(
    lline([
      plain(`${usedFmt}/`),
      colored(windowStr, "muted"),
      plain(` tokens (${pctStr})`),
    ]),
  );
  lines.push(lline([plain("")]));
  lines.push(lline([colored("Estimated usage by category", "muted")]));

  for (const seg of segments) {
    const pct = formatPercent(seg.tokens, window);
    if (seg.id === "free") {
      lines.push(
        lline([
          colored(seg.icon, seg.colorToken),
          plain(` ${seg.label}: ${formatTokens(seg.tokens)} (${pct})`),
        ]),
      );
    } else {
      lines.push(
        lline([
          colored(seg.icon, seg.colorToken),
          plain(` ${seg.label}: ${formatTokens(seg.tokens)} tokens (${pct})`),
        ]),
      );
    }
  }

  return lines;
}
