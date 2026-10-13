import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolvePstackAgentDir, type PstackHost } from "./config.js";

/**
 * Canonical pstack delegation buckets. Every role resolves to one of these,
 * and the `models.json` schema pins a model per bucket. This list is the single
 * source of truth; skills and the setup wizard must match it.
 */
export const BUCKETS = ["code", "judgment"] as const;
export type Bucket = (typeof BUCKETS)[number];

/**
 * Canonical pstack role to bucket table. Role tokens used at skill delegation
 * sites must match these keys character-for-character. Insertion order drives
 * the grouped injection text, so keep each bucket's roles contiguous.
 */
export const ROLE_BUCKETS: Record<string, Bucket> = {
  feature: "code",
  refactoring: "code",
  "bug-fix": "code",
  "perf-issue": "code",
  hillclimb: "code",
  "arena-runners": "code",
  "swarm-workers": "code",
  "why-investigators": "code",
  "how-explorer": "code",
  "architect-runners": "judgment",
  "cross-judge": "judgment",
  "reflect-judgment": "judgment",
  "reflect-tooling": "judgment",
  "interrogate-reviewers": "judgment",
  "why-synthesizer": "judgment",
  "how-explainer": "judgment",
};

/** Parsed `models.json`. Both sections are optional and best-effort typed. */
export type ModelsMap = {
  buckets?: Record<string, unknown>;
  roles?: Record<string, unknown>;
};

/** Literal values that mean "inherit the parent model" and resolve to omit. */
const OMIT_ALIASES = new Set(["inherit-parent", "auto"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A slug, or undefined when the value is absent, blank, or an omit alias. */
function normalizeSlug(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || OMIT_ALIASES.has(trimmed)) return undefined;
  return trimmed;
}

function rolesForBucket(bucket: Bucket): string[] {
  return Object.keys(ROLE_BUCKETS).filter((role) => ROLE_BUCKETS[role] === bucket);
}

/**
 * Resolve the pstack `models.json` for a host, reusing the config file's
 * precedence. `PI_CODING_AGENT_DIR` wins, else the host agent dir
 * (`~/.omp/agent` for omp, `~/.pi/agent` for pi).
 */
export function resolvePstackModelsFile(host: PstackHost, env: NodeJS.ProcessEnv = process.env): string {
  return join(resolvePstackAgentDir(host, env), "pstack", "models.json");
}

/**
 * Parse the models map best-effort. Any read error, malformed JSON, or
 * non-object document returns null so the extension injects nothing.
 */
export function loadModelsMap(file: string): ModelsMap | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  return parsed as ModelsMap;
}

/**
 * Unrecognized keys under `roles` or `buckets`, as `roles.<key>` / `buckets.<key>`,
 * sorted. A hand-edited typo like `roles.swarm-worker` is otherwise dropped
 * silently; the extension logs these once so the edit is not lost in silence.
 */
export function unknownModelKeys(map: ModelsMap | null): string[] {
  if (!map) return [];
  const unknown: string[] = [];
  const roles = isRecord(map.roles) ? map.roles : undefined;
  if (roles)
    for (const key of Object.keys(roles))
      if (!Object.hasOwn(ROLE_BUCKETS, key)) unknown.push(`roles.${key}`);
  const buckets = isRecord(map.buckets) ? map.buckets : undefined;
  if (buckets)
    for (const key of Object.keys(buckets))
      if (!(BUCKETS as readonly string[]).includes(key)) unknown.push(`buckets.${key}`);
  return unknown.sort();
}

/**
 * Resolve a role to a model slug, or undefined (inherit parent). Order is
 * `roles[role]` -> `buckets[bucket(role)]` -> inherit-parent. The literal
 * values `inherit-parent` and `auto` resolve to undefined at every step.
 */
export function resolveRoleModel(map: ModelsMap | null, role: string): string | undefined {
  if (!map) return undefined;
  const roles = isRecord(map.roles) ? map.roles : undefined;
  const direct = roles ? normalizeSlug(roles[role]) : undefined;
  if (direct) return direct;
  const bucket = ROLE_BUCKETS[role];
  if (!bucket) return undefined;
  const buckets = isRecord(map.buckets) ? map.buckets : undefined;
  return buckets ? normalizeSlug(buckets[bucket]) : undefined;
}

/**
 * Build the grouped injection line, or undefined when the map pins nothing.
 * Lists each pinned bucket with the roles that still fall back to it, then any
 * fine-role overrides. A role with its own override is dropped from its
 * bucket's list and shown only under overrides, so no role is double-listed. A
 * pinned bucket whose every role is overridden is omitted, since its model is
 * unused.
 */
export function buildInjectionText(map: ModelsMap | null): string | undefined {
  if (!map) return undefined;
  const buckets = isRecord(map.buckets) ? map.buckets : undefined;
  const roles = isRecord(map.roles) ? map.roles : undefined;

  const isOverridden = (role: string): boolean =>
    roles ? normalizeSlug(roles[role]) !== undefined : false;

  const parts: string[] = ["pstack models."];
  for (const bucket of BUCKETS) {
    const slug = buckets ? normalizeSlug(buckets[bucket]) : undefined;
    if (!slug) continue;
    const bucketRoles = rolesForBucket(bucket).filter((role) => !isOverridden(role));
    if (bucketRoles.length === 0) continue;
    parts.push(`${bucket}: \`${slug}\` (${bucketRoles.join(", ")}).`);
  }

  const overrides: string[] = [];
  if (roles)
    for (const role of Object.keys(ROLE_BUCKETS)) {
      const slug = normalizeSlug(roles[role]);
      if (slug) overrides.push(`${role}=\`${slug}\``);
    }
  if (overrides.length > 0) parts.push(`overrides: ${overrides.join(", ")}.`);

  if (parts.length === 1) return undefined;
  parts.push(
    "When delegating for a pstack role, pass that role's model; omit `model` (inherit parent) for anything unset. A role listed under overrides wins over its bucket.",
  );
  return parts.join(" ");
}
