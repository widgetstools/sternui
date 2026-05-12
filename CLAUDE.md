# CLAUDE.md — agent instructions for `marketsui-platform`

This is the consolidated MarketsUI platform monorepo. Four previously-separate
repos (`widgets`, `markets-ui`, `fi-trading-terminal`, `stern-2`) live here as
first-class workspaces under `@starui/*`.

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

## Package layout

Workspace packages live under `packages/` in three framework buckets,
each split into role-based sub-buckets (per
[`docs/plans/plan-2026-05-07/code-organization.md`](./docs/plans/plan-2026-05-07/code-organization.md)):

- `packages/shared/` — vanilla TS, framework-agnostic
  - `core/` — grid platform (GridPlatform, LayoutManager, expression engine, persistence, etc.)
  - `foundation/` — pure leaves: `shared-types`, `design-system`, `icons-svg`, `tokens-primeng`
  - `runtime/` — `runtime-port` (interface) + `runtime-browser` / `runtime-openfin` impls
  - `services/` — vanilla services: `config-service`, `data-services`, `component-host`
  - `platform/` — runtime shells: `openfin-platform`
- `packages/react/` — React-only packages
  - `ui/` — shadcn primitives (no twin → no `-react` suffix)
  - `sdk/widget-sdk/` — widget contract (no twin → no suffix)
  - `widgets/` — `markets-grid`, `grid-react` (extracted from core), `widgets-react`
  - `hosts/host-wrapper-react/`
  - `providers/data-services-react/` — Provider + hook shells around `shared/services`
  - `tools/` — dev/operator UIs: `config-browser-react`, `workspace-setup-react`
- `packages/angular/` — Angular-only packages (parity catching up)
  - `hosts/host-wrapper-angular/`
  - `tools/config-browser-angular/`
  - `widgets/widgets-angular/`

The workspaces glob in root `package.json` enumerates each sub-bucket
explicitly (npm 10 doesn't do `packages/**`). When adding a new package:

1. Pick the framework bucket by peer dep (vanilla → `shared/`, React →
   `react/`, Angular → `angular/`).
2. Pick the sub-bucket by role (foundation leaf, runtime, service, host,
   provider, sdk, widget, tool, platform shell).
3. Package name carries the framework suffix when a twin can exist
   (`config-browser-react` / `config-browser-angular`); drop the suffix
   for framework-singletons (`ui`, `widget-sdk`, `tokens-primeng`).
4. `tsconfig.json` `"extends"` is `"../../../../tsconfig.base.json"`
   (4 levels) for sub-bucketed packages;
   `"../../../tsconfig.base.json"` (3 levels) for root-of-bucket
   exceptions (`shared/core/`, `react/ui/`).

## File naming

One rule per kind-of-thing. The rule is **filename matches the case of the
file's primary export**. Symbol naming (classes/functions/constants) is
already idiomatic across the repo — the rule below is what brings file
names in line with the symbols they export.

| Kind | Filename | Symbol |
|---|---|---|
| Class (default-shaped export) | `AppDataStore.ts` | `class AppDataStore` |
| React functional component | `MarketsGrid.tsx` | `function MarketsGrid()` or `const MarketsGrid =` |
| React hook | `useGridApi.ts` | `function useGridApi()` |
| Plain function collection / utility | `inferFields.ts` | `function camelCase()`, `const camelCase` |
| Types-only module | `types.ts` | `interface PascalCase`, `type PascalCase` |
| Constants module | `constants.ts` | `SCREAMING_SNAKE` for true constants; `camelCase` otherwise |
| Barrel | `index.ts` | re-exports |
| Folders | kebab-case | `data-provider-editor/` |
| Angular files | Angular Style Guide kebab + role suffix | `class FooComponent`, `class FooService` in `*.component.ts`, `*.service.ts`, `*.module.ts`, `*.directive.ts`, `*.pipe.ts` |

**Allowed in shared/ and react/ buckets**: `camelCase` and `PascalCase` only.
No kebab. No snake.

**Required in angular/ bucket and `apps/*-angular*` apps**: kebab-case
matching Angular Style Guide. Don't switch — Angular tooling and
muscle memory both depend on it.

**Carve-outs (kebab-case allowed despite the above)**:
- `packages/react/ui/src/components/**` — shadcn-ui CLI generates kebab
  filenames (`alert-dialog.tsx`, `dropdown-menu.tsx`); renaming would
  diverge from `npx shadcn add ...` future regenerations
- `packages/react/widgets/grid-react/src/ui/shadcn/**` — same (gc-themed
  shadcn copy carried over from the `core/ui/shadcn/` extraction in PR-8)

**Public subpath exports** in `package.json` `"exports"` may use kebab
even when they point at camelCase files (subpath name is the package's
public API; renaming breaks consumers). Examples:
`@starui/icons-svg/all-icons` → `./allIcons.ts`,
`@starui/design-system/cell-renderers` → `./dist/cellRenderers.js`.

ESLint enforcement (`unicorn/filename-case` per-bucket) is a follow-up
PR. Until then: convention enforcement happens in code review.

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

- Vitest 4 + jsdom 29 for unit tests. Baseline: 653 passing.
- Playwright 1.59 against `apps/demo-react`. Baseline: 195/214 passing
  (19 failures are pre-existing — see [`docs/E2E_STATUS.md`](./docs/E2E_STATUS.md)).

## UI stack rules (non-negotiable)

Every UI component — new or updated — MUST:

1. **Consume `@starui/design-system` tokens.** Never hardcode colors,
   spacing, typography. Resolve through `--bn-*` / `--fi-*` CSS variables
   or the semantic exports from `@starui/design-system/tokens/semantic`.

2. **Use the framework-matching primitive library:**
   - **React** → shadcn/ui (via `@starui/ui` + `@starui/core`'s
     settings-panel primitives). **No native `<input>` / `<textarea>` /
     `<select>`.** Always wrap with the shadcn equivalent.
   - **Angular** → PrimeNG (themed via `@starui/tokens-primeng`).
     `pInputText`, `pButton`, `pDropdown`, `pDialog`, etc.

3. **Be 100% dark/light compatible.** Every surface renders correctly
   under `[data-theme="dark"]` AND `[data-theme="light"]`. No hardcoded
   hex anywhere. Theme switching = flip `data-theme` on `<html>`;
   tokens resolve from there.

Applies to one-off dev UIs too. If tempted to build a custom primitive
that duplicates an existing shadcn/PrimeNG one, stop and use the existing
one instead.

## Import boundary rules

Enforced via convention (ESLint enforcement is a follow-up). See
`docs/ARCHITECTURE.md` for the full layer diagram. Key rules:

- Foundation packages (`shared-types`, `design-system`, `tokens-primeng`,
  `icons-svg`) must not import from anywhere except each other.
- `core` must not import from framework adapters (`widgets-angular`,
  `widgets-react`, `grid-react`).
- `widgets-angular` must not import from `widgets-react` (siblings, not
  consumers).
- Only `runtime-openfin` and `openfin-platform` may import from
  `@openfin/core`.
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
7. **No versioned code** — never `v1/`, `v2/`, `legacy/` in paths or
   doc phasing; superseded code is deleted in the same change as its
   replacement

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
