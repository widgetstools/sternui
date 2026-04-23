# MarketsUI platform

A config-driven UI framework for capital-markets trading apps on OpenFin.
Built for the Wells Fargo FI trading terminal as an AdapTable alternative,
plus a runtime that can host React and Angular widgets side-by-side under a
single OpenFin workspace.

This monorepo consolidates four previously-fragmented repositories
(`widgetstools/widgets`, `widgetstools/markets-ui`,
`widgetstools/fi-trading-terminal`, `nndrao/stern-2`) into a single source
of truth. See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for the
layer diagram and [`docs/MIGRATION_NOTES.md`](./docs/MIGRATION_NOTES.md) if
you followed a link from one of the archived repos.

## Stack

- **Node** ≥ 20, **npm** 10 workspaces, **Turborepo** 2 for build orchestration
- **React** 19.2.5 + **TypeScript** 5.9.3 + **Vite** 7.3.2
- **Angular** 21.1.0 (with `ng-packagr` for the library packages)
- **AG-Grid Enterprise** 35.1.0 (`themeQuartz`, `iconSetMaterial`)
- **OpenFin** 42.103.x (Core / Workspace / Dock-Manager)
- **Zustand** for runtime module state, **Dexie** (IndexedDB) for local persistence
- **Radix UI** + shadcn primitives, **CodeMirror 6** for expression editing
- **Vitest** 4 + **Playwright** 1.59 for tests

## Monorepo layout

### `packages/` — shared libraries (18)

| Package | Publishes | What it does |
|---|---|---|
| `@marketsui/shared-types` | types | Cross-cutting interfaces (IDataProvider, WidgetContext, FieldNode…) |
| `@marketsui/core` | React | Module system, ProfileManager, ExpressionEngine, shadcn primitives, Poppable |
| `@marketsui/markets-grid` | React | MarketsGrid host, FormattingToolbar, FiltersToolbar, SettingsSheet |
| `@marketsui/design-system` | CSS + tokens | Tailwind config, terminal palette, cockpit styles |
| `@marketsui/ui` | React | Low-level shadcn-ui components (Button, Card, Badge…) |
| `@marketsui/icons-svg` | SVG | Shared icon bundle |
| `@marketsui/tokens-primeng` | CSS | PrimeNG theme bridge |
| `@marketsui/config-service` | TS | Dexie + REST dual-mode config storage |
| `@marketsui/component-host` | TS | Identity resolver + debounced saver |
| `@marketsui/widget-sdk` | TS | Widget registry, launch spec, WidgetContext |
| `@marketsui/widgets-react` | React | Blotter / chart / heatmap widgets |
| `@marketsui/angular` | Angular | Angular adapters + DI integration |
| `@marketsui/dock-editor-react` | React | Dock configurator UI (React) |
| `@marketsui/dock-editor-angular` | Angular | Dock configurator UI (Angular) |
| `@marketsui/registry-editor-react` | React | Widget-registry editor UI (React) |
| `@marketsui/registry-editor-angular` | Angular | Widget-registry editor UI (Angular) |
| `@marketsui/openfin-platform` | TS | markets-ui OpenFin workspace bootstrap |
| `@marketsui/openfin-platform-stern` | TS | stern-2 OpenFin platform bootstrap |

### `apps/` — runnable demos + reference apps (9)

| App | What it is |
|---|---|
| `demo-react` | **Primary dev target.** Config-driven MarketsGrid demo. `npm run dev` |
| `demo-angular` | Angular parity demo |
| `config-service-server` | Reference config-service REST server |
| `fi-trading-reference` | fi-trading-terminal cockpit preserved for regression (React) |
| `fi-trading-reference-angular` | fi-trading-terminal cockpit, Angular 21 port |
| `markets-ui-react-reference` | markets-ui framework's React reference scenarios |
| `markets-ui-angular-reference` | markets-ui framework's Angular reference scenarios |
| `stern-reference-react` | stern-2 reference app (React) |
| `stern-reference-angular` | stern-2 reference app (Angular) |

### `tools/` — build + migration scripts

- `tools/scripts/normalize-deps.mjs` — one-shot dep-pin normalizer per `docs/DEPS_STANDARD.md`
- `tools/scripts/launch-openfin.mjs` — launch the demo inside OpenFin

## Grid modules (9 shipped under `@marketsui/core`)

| Module | Priority | Purpose |
|---|---|---|
| `general-settings` | 0 | Grid-level options (60 controls across 8 bands) |
| `column-templates` | 1 | Named style templates applied to many columns |
| `column-customization` | 10 | Per-column header, layout, style, format, filter, row-grouping |
| `calculated-columns` | 15 | Expression-driven virtual columns |
| `column-groups` | 18 | Header group hierarchy |
| `conditional-styling` | 20 | Expression-driven row/cell painting |
| `saved-filters` | 30 | Quick-filter pills with per-pill row counts |
| `toolbar-visibility` | 40 | Which toolbars show on the grid |
| `grid-state` | 200 | Round-trips AG-Grid's native state on explicit Save |

## Getting started

```bash
# Install (--legacy-peer-deps required for bundled corporate .tgz packages —
# see docs/DEPS_STANDARD.md for rationale)
npm ci --legacy-peer-deps

# React demo at http://localhost:5190
npm run dev

# Angular demo
npm run dev:demo-angular

# OpenFin harness (launches the React demo inside OpenFin)
npm run dev:openfin
```

## Scripts (root)

```bash
npm run build        # turbo build — everything
npm run typecheck    # turbo typecheck — every package
npm test             # turbo test — Vitest across packages
npm run e2e          # turbo e2e — Playwright
npm run lint         # turbo lint (opt-in per package)
npm run clean        # nuke all node_modules + dist + .turbo caches
```

Package-scoped commands work with the `-w` flag:

```bash
npm run build -w @marketsui/core
npm test  -w @marketsui/markets-grid
```

## Key docs

- [**ARCHITECTURE.md**](./docs/ARCHITECTURE.md) — layer diagram + import
  boundaries for the 18-package monorepo
- [**MIGRATION_NOTES.md**](./docs/MIGRATION_NOTES.md) — map from old repo
  URLs to new paths (for anyone following a link to an archived repo)
- [**DEPS_STANDARD.md**](./docs/DEPS_STANDARD.md) — canonical dep versions
  + per-package migration notes
- [**CONSOLIDATION_DECISIONS.md**](./docs/CONSOLIDATION_DECISIONS.md) —
  per-package resolution matrix for the 4-repo merge
- [**E2E_STATUS.md**](./docs/E2E_STATUS.md) — current Playwright baseline
- [**IMPLEMENTED_FEATURES.md**](./docs/IMPLEMENTED_FEATURES.md) —
  kept in lockstep with the code
- [**FORMATS_AND_EXPRESSIONS.md**](./docs/FORMATS_AND_EXPRESSIONS.md) —
  Excel-format + expression-engine reference
- [**MARKETSUI_DESIGN.md**](./docs/MARKETSUI_DESIGN.md) —
  1033-line design authority for the overall platform

## Testing

- **Unit:** Vitest 4 across all packages. `npm test`.
  Current baseline: **298 tests** passing (242 `core` + 56 `markets-grid`).
- **E2E:** Playwright against `apps/demo-react`. `npm run e2e`.
  Current baseline: **195 / 214** passing (see
  [E2E_STATUS.md](./docs/E2E_STATUS.md) for the 19 pre-existing failures
  tracked for follow-up).

## Copyright

Internal Wells Fargo Capital Markets project. Not open-source.
