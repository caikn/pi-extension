# AGENTS.md

Monorepo of Pi extensions/packages (`context-breakdown/`, `pi-pstack/`). Rules below are Pi-specific; general TS/git knowledge omitted.

## Non-obvious Pi rules

- Extension entry = **default export factory** `(pi: ExtensionAPI) => void | Promise<void>`. Async factories are awaited before startup.
- **Factory must not start processes, sockets, watchers, or timers.** Some loads run without a session. Start long-lived resources in a `session_start` handler; release them in an **idempotent** `session_shutdown` handler.
- Host-provided packages — `@earendil-works/pi-ai`, `@earendil-works/pi-agent-core`, `@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`, `typebox` — go in `peerDependencies` with `"*"`. **Never** put them in `dependencies` or bundle them (duplicate classes/registries). Import with `import type` where possible.
- Pi loads TS directly via `jiti` — no build step. Intra-package relative imports still use the `.js` extension (ESM), e.g. `import { x } from "./config.js"` for `config.ts`.
- Package resources: either conventional dirs (`extensions/`, `skills/`, `prompts/`, `themes/`) or explicit paths under `pi` in `package.json`. Dot-prefixed or symlinked roots must be listed explicitly (globs won't discover them). Keep the `pi-package` keyword.

## Tools

- `execute()` **throws** to fail. Returning an object is success (even with `isError`-style data — use `isError: true` to fail while still returning data).
- Result needs model-facing `content` + a `details` field (`undefined` when none).
- File-mutating tools wrap the whole read-modify-write in `withFileMutationQueue()`.
- Tools with shared mutable in-memory state must run sequentially.
- Include nested model-call `usage` in the result so session totals stay correct.

## Lifecycle

- Command-only ops (reload, wait-until-idle, session replacement, tree nav) must **not** be called from lifecycle/event handlers — deadlocks the runtime.
- Code after `await ctx.reload()` must not reuse old-runtime state; session replacement invalidates the old `ctx` (capture plain data first).
- Guard terminal-only UI with `ctx.mode === "tui"`; use `ctx.hasUI` for tui+rpc. Extensions also load in `json`/`print` with no UI — keep tool/event behavior independent of rendering.

## Verify

- `pi-pstack`: `tsc --noEmit` (typecheck) and `bun test` + the `bun tests/*-contract.ts` scripts (run via `npm run test`). `check:pack` uses `pnpm pack --dry-run`.
- Try a package without installing: `pi -e ./<package>`.
