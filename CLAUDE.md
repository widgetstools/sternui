# CLAUDE.md — agent instructions for `marketsui-platform`

This is the consolidated MarketsUI platform monorepo. Four previously-separate
repos (`widgets`, `markets-ui`, `fi-trading-terminal`, `stern-2`) live here as
first-class workspaces under `@marketsui/*`.

**Read before editing:**

- [`README.md`](./README.md) — quick orientation, scripts, getting started
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — layer model + import rules
- [`docs/DEPS_STANDARD.md`](./docs/DEPS_STANDARD.md) — canonical dep versions
- [`docs/IMPLEMENTED_FEATURES.md`](./docs/IMPLEMENTED_FEATURES.md) — kept in lockstep with code (update on every feature add/change/remove)

## Package manager

**npm 10 workspaces.** Never `pnpm`, never `yarn`. Install with
`npm ci --legacy-peer-deps` — the `--legacy-peer-deps` is permanent
because corporate-bundled `.tgz` packages declare peer ranges that
conflict with React 19 / Angular 21 on first read. Drop the flag and
install breaks.

## Build

**Turborepo 2.** Scripts at root:

```bash
npm run build       # turbo build — everything
npm run typecheck   # turbo typecheck — every package
npm test            # turbo test — Vitest
npm run e2e         # turbo e2e — Playwright
```

Every library package uses `"build": "rimraf dist && tsc"` (or
`ng-packagr`). The `rimraf` prefix is required to defeat a TS5055
"cannot overwrite input file" error that Turbo's cache-restore triggers
on the next run. Don't remove it.

## Testing

- Vitest 4 + jsdom 29 for unit tests. Baseline: 298 passing.
- Playwright 1.59 against `apps/demo-react`. Baseline: 195/214 passing
  (19 failures are pre-existing — see [`docs/E2E_STATUS.md`](./docs/E2E_STATUS.md)).

## Import boundary rules

Enforced via convention (ESLint enforcement is a follow-up). See
`docs/ARCHITECTURE.md` for the full layer diagram. Key rules:

- Foundation packages (`shared-types`, `design-system`, `tokens-primeng`,
  `icons-svg`) must not import from anywhere except each other.
- `core` must not import from framework adapters (`angular`, `widgets-react`).
- `angular` must not import from `widgets-react` (siblings, not consumers).
- Only platform shells (`openfin-platform`, `openfin-platform-stern`) may
  import from `@openfin/core`.
- Apps import from packages, never the reverse.

## Pre-implementation checklist

Run mentally before writing code for any feature add / update / remove:

1. **Architecture fit** — does it belong in the layer it's being added to?
2. **Design-system fit** — use shared primitives, not new ones
3. **Reuse before new** — search for existing implementations first
4. **Anti-pattern refuse list** — no native `<input>`/`<textarea>`/`<select>`
   (use shadcn), no per-panel re-exploration of settled UI
5. **Complexity ceilings** — 800 LOC / file, 80 LOC / function
6. **Test coverage** — unit for logic, e2e for interaction
7. **v1/v2 scope** — all new features ship in v2. v1 is legacy reference

## Post-implementation checklist

After every feature add / update / fix / removal:

1. Update [`docs/IMPLEMENTED_FEATURES.md`](./docs/IMPLEMENTED_FEATURES.md) —
   same commit or immediate `docs:` follow-up. Don't ask the user first;
   just do it.
2. Run `npx turbo typecheck build test` and ensure green.
3. If interaction changes, add/update e2e spec under `e2e/`.
4. Commit messages: conventional prefixes (`feat(pkg):`, `fix(pkg):`,
   `chore:`, `docs:`, `test:`, `ci:`, `refactor(pkg):`).

## Commit trailer

Every commit this agent makes should end with:

```
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

## Dep version edits

Before adding or upgrading any dependency, check
[`docs/DEPS_STANDARD.md`](./docs/DEPS_STANDARD.md). If the new version is
not already standard, update the standard doc in the same commit. Don't
drift — the whole reason for this monorepo was to stop drift.
