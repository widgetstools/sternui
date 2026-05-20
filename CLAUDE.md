# CLAUDE.md — agent instructions for `starui` (MarketsUI platform monorepo)

This is the consolidated MarketsUI platform monorepo. Libraries, apps,
docs, tooling, and e2e tests all live at the **repo root** (`packages/`,
`apps/`, `docs/`, `scripts/`, `tools/`, `e2e/`).

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

All workspace packages live under **`packages/`** in ten
architecture buckets (see
[`docs/PACKAGE_ORGANIZATION.md`](./docs/PACKAGE_ORGANIZATION.md)):

| # | Bucket | Path | Packages |
|---|--------|------|----------|
| 1 | UI Design System | `design-system/` | `design-system`, `icons-svg` |
| 2 | Angular UI Controls | `angular-ui/` | *(scaffold — PrimeNG/tokens)* |
| 3 | React UI Controls | `react-ui/` | `ui` |
| 4 | Angular Grid | `angular-grid/` | `grid` → `@starui/grid-angular` |
| 5 | React Grid | `react-grid/` | `grid` → `@starui/grid` |
| 6 | Data Utilities | `data/` | `host-config`, `host-data`, `host-data-react`, `host-data-angular` |
| 7 | OpenFin Utils | `openfin/` | `host-openfin`, `openfin-platform` |
| 8 | Angular Core | `angular-core/` | `app`, `widgets`, `config-browser` |
| 9 | React Core | `react-core/` | `app`, `widgets-react`, `widget-sdk`, `host-wrapper-react`, `config-browser`, `workspace-setup-react` |
| 10 | Core / Shared | `shared/` | `types`, `shared-types`, `engine`, `host`, `host-browser`, `widget`, `widget-browser` |

**Apps** live under `apps/` and consume libraries via npm
workspace `"*"` deps.

The root `package.json` workspaces glob enumerates each bucket explicitly
(npm 10 doesn't do `packages/**`). When adding a new package:

1. Pick the architecture bucket by role (see table above).
2. Package name carries the framework suffix when a twin can exist; drop the
   suffix for framework-singletons (`ui`, `widget-sdk`, `grid`).
3. `tsconfig.json` `"extends"` is `"../../../tsconfig.base.json"` (3 levels)
   from `packages/<bucket>/<package>/`.

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
- `packages/react-ui/ui/src/components/**` — shadcn-ui CLI generates kebab
  filenames (`alert-dialog.tsx`, `dropdown-menu.tsx`); renaming would
  diverge from `npx shadcn add ...` future regenerations
- `packages/react-grid/grid/src/customizer/ui/shadcn/**` — gc-themed
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
npm run build       # turbo build — all workspaces
npm run typecheck   # turbo typecheck — all workspaces
npm test            # turbo test — Vitest
npm run e2e         # Playwright — e2e
```

Every library package uses `"build": "rimraf dist && tsc"` (or
`ng-packagr`). The `rimraf` prefix is required to defeat a TS5055
"cannot overwrite input file" error that Turbo's cache-restore triggers
on the next run. Don't remove it.

## Propagating package changes (external tarball consumers)

In-repo apps use workspace `"*"` deps — edit a package, run `npm run build`
(or `npm run dev:demo-react`) and changes are picked up via workspace linking.

`npm run propagate` (delegates to `scripts/propagate.mjs`) builds
and packs **one tarball per architecture bucket** flat under `libs/`
(e.g. `starui-react-grid-0.1.0-<sha8>.tgz`). Each bundle contains all workspace
packages in that bucket. Flags:

- `--dry-run` — show the plan, write nothing.
- `--gc` — delete orphaned tarballs in `libs/`.
- `--no-install` / `--no-build` — skip install or per-package build steps.
- Pass a bucket name (`react-core`) or member package (`grid`) to pack one bucket.

Manifest: `libs/manifest.json` maps `@starui/<bucket>` → tarball +
`members` array (legacy member names resolve for MCP scaffolding).

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
3. If interaction changes, add/update e2e spec under `e2e/`.
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
[`apps/demo-angular/package.json`](./apps/demo-angular/package.json)
documents the per-package "stable-vs-latest" rationale inline in its
`//dependencies-registry-notes` block — mirror that pattern when
introducing version pins elsewhere. Don't drift: the whole reason for
this monorepo was to stop drift.
