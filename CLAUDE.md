mcp# CLAUDE.md — agent instructions for `marketsui-platform`

This is the consolidated MarketsUI platform monorepo. The **active codebase**
lives under **`starui-platform/`** — libraries, apps, and e2e. The repo root
delegates build/dev/test/e2e to that workspace and hosts shared docs/tooling.
Legacy root `packages/` has been removed; all `@starui/*` development happens
inside `starui-platform/packages/`.

**Read before editing:**

- [`README.md`](./README.md) — quick orientation, scripts, getting started
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — layer model + import rules
- [`docs/IMPLEMENTED_FEATURES.md`](./docs/IMPLEMENTED_FEATURES.md) — kept in lockstep with code (update on every feature add/change/remove)

## Package manager

**npm 10 workspaces.** Never `pnpm`, never `yarn`. Install with plain
`npm ci` — no `--legacy-peer-deps`, no `--force`. Every workspace
resolves cleanly against the public npm registry. If a future install
needs the flag, treat that as a real ERESOLVE bug to investigate, not
a permanent workaround.

One root `overrides` entry remains: `@openfin/core` is pinned to
`43.101.4` to keep the workspace direct deps aligned with the version
that `@openfin/workspace-platform` / `@openfin/notifications` /
`@openfin/workspace` declare as a transitive (currently `43.101.2`).
Drop the override only by aligning all five packages on the same
version in the same change.

## Package layout

All workspace packages live under **`starui-platform/packages/`** in three
framework buckets (per
[`starui-platform/docs/PARITY.md`](./starui-platform/docs/PARITY.md) and [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)):

- `starui-platform/packages/shared/` — vanilla TS, framework-agnostic
  - `engine/` — GridPlatform, ProfileManager, expression engine, modules
  - `design-system/`, `shared-types/`, `types/`, `icons-svg/` — foundation leaves
  - `host/`, `host-browser/`, `host-openfin/` — host port + runtime adapters
  - `host-config/`, `host-data/` — config + data-services
  - `widget/`, `widget-browser/` — widget PlatformAdapter contract + browser impl
  - `openfin-platform/` — OpenFin workspace shell
- `starui-platform/packages/react/` — React-only packages
  - `ui/` — shadcn primitives (no `-react` suffix)
  - `grid/` — MarketsGrid widget + customizer (`@starui/grid`; replaces legacy `@starui/markets-grid` + `@starui/grid-react`)
  - `app/`, `widgets-react/`, `widget-sdk/` (React bindings; contract in `@starui/widget`)
  - `host-wrapper-react/`, `host-data-react/`
  - `config-browser/`, `workspace-setup-react/`
- `starui-platform/packages/angular/` — Angular scaffolds (parity catching up)

**Apps** live under `starui-platform/apps/` and consume libraries via npm
workspace `"*"` deps — not root `file:` tarballs.

The root `package.json` workspaces glob enumerates `starui-platform/**`
paths explicitly (npm 10 doesn't do `packages/**`). When adding a new package:

1. Pick the framework bucket by peer dep (vanilla → `shared/`, React →
   `react/`, Angular → `angular/`).
2. Pick the sub-bucket by role (foundation leaf, host, service, widget, tool).
3. Package name carries the framework suffix when a twin can exist; drop the
   suffix for framework-singletons (`ui`, `widget-sdk`, `grid`).
4. `tsconfig.json` `"extends"` is `"../../../../tsconfig.base.json"`
   (4 levels) from sub-bucketed packages under `starui-platform/`.

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
- `starui-platform/packages/react/ui/src/components/**` — shadcn-ui CLI generates kebab
  filenames (`alert-dialog.tsx`, `dropdown-menu.tsx`); renaming would
  diverge from `npx shadcn add ...` future regenerations
- `starui-platform/packages/react/grid/src/customizer/ui/shadcn/**` — gc-themed
  shadcn copy carried over from the legacy grid-react extraction

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
npm run build       # turbo build — starui-platform
npm run typecheck   # turbo typecheck — starui-platform
npm test            # turbo test — Vitest
npm run e2e         # Playwright — starui-platform/e2e
```

Every library package uses `"build": "rimraf dist && tsc"` (or
`ng-packagr`). The `rimraf` prefix is required to defeat a TS5055
"cannot overwrite input file" error that Turbo's cache-restore triggers
on the next run. Don't remove it.

## Propagating package changes (external tarball consumers)

In-repo apps use workspace `"*"` deps — edit a package, run `npm run build`
(or `npm run dev:demo-react`) and changes are picked up via workspace linking.

`npm run propagate` (delegates to `starui-platform/scripts/propagate.mjs`) still
packs libraries to content-hashed tarballs in `starui-platform/libs/` for
**external** consumers (MCP scaffolds, corporate hand-off). Flags:

- `--dry-run` — show the plan, write nothing.
- `--gc` — delete orphaned tarballs in `starui-platform/libs/`.
- `--no-install` / `--no-build` — skip install or per-package build steps.

Manifest: `starui-platform/libs/manifest.json`.

## Testing

- Vitest 4 + jsdom 29 for unit tests. Baseline: 653 passing.
- Playwright 1.59 against `starui-platform/apps/demo-react`. Baseline: 195/214 passing
  (19 failures are pre-existing — see [`docs/E2E_STATUS.md`](./docs/E2E_STATUS.md)).

## UI stack rules (non-negotiable)

Every UI component — new or updated — MUST:

1. **Consume `@starui/design-system` tokens.** Never hardcode colors,
   spacing, typography. Resolve through `--bn-*` / `--fi-*` CSS variables
   or the semantic exports from `@starui/design-system/tokens/semantic`.

2. **Use the framework-matching primitive library:**
   - **React** → shadcn/ui (via `@starui/ui` + `@starui/grid` customizer
     primitives). **No native `<input>` / `<textarea>` / `<select>`.**
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

- Foundation packages (`shared-types`, `design-system`, `icons-svg`) must
  not import from anywhere except each other.
- `@starui/engine` must not import from framework adapters (`widgets-react`, `grid`).
- Only `host-openfin` and `openfin-platform` may import from `@openfin/core`.
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
3. If interaction changes, add/update e2e spec under `starui-platform/e2e/`.
4. Commit messages: conventional prefixes (`feat(pkg):`, `fix(pkg):`,
   `chore:`, `docs:`, `test:`, `ci:`, `refactor(pkg):`).

## Commit trailer

Every commit this agent makes should end with:

```
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

## Dep version edits

Pin to the **stable line** for each major (React 19.2.x, Angular 21.1.x,
@openfin/core 43.101.x), not the latest patch. The Angular demo's
[`starui-platform/apps/demo-angular/package.json`](./starui-platform/apps/demo-angular/package.json)
documents the per-package "stable-vs-latest" rationale inline in its
`//dependencies-registry-notes` block — mirror that pattern when
introducing version pins elsewhere. Don't drift: the whole reason for
this monorepo was to stop drift.
