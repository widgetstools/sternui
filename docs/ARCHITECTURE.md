# MarketsUI platform architecture

This document describes the layer model, the 18-package monorepo layout, and
the import-boundary rules. For the full narrative design authority (component
registry, dock protocol, config lifecycle, identity resolver), read
[MARKETSUI_DESIGN.md](./MARKETSUI_DESIGN.md). This file is the quick-
reference map: "what lives where, and what is allowed to import what."

## Layer model

```
┌─────────────────────────────────────────────────────────────────────┐
│  APPS (apps/*)                                                      │
│                                                                     │
│  demo-react · demo-angular · config-service-server                  │
│  fi-trading-reference · markets-ui-{react,angular}-reference        │
│  stern-reference-{react,angular}                                    │
└──────────────────────────────▲──────────────────────────────────────┘
                               │ imports
┌──────────────────────────────┴──────────────────────────────────────┐
│  PLATFORM SHELLS                                                    │
│                                                                     │
│  openfin-platform            (markets-ui flavor)                    │
│  openfin-platform-stern      (stern-2 flavor)                       │
└──────────────────────────────▲──────────────────────────────────────┘
                               │
┌──────────────────────────────┴──────────────────────────────────────┐
│  FRAMEWORK ADAPTERS                                                 │
│                                                                     │
│  angular           — Angular adapters + DI bridge                   │
│  widgets-react     — React blotter / chart / heatmap widgets        │
│  dock-editor-{react,angular}                                        │
│  registry-editor-{react,angular}                                    │
└──────────────────────────────▲──────────────────────────────────────┘
                               │
┌──────────────────────────────┴──────────────────────────────────────┐
│  APPLICATION DOMAIN                                                 │
│                                                                     │
│  markets-grid      — MarketsGrid host + toolbars + SettingsSheet    │
│  config-service    — Dexie + REST dual-mode config storage          │
│  component-host    — Identity resolver, debounced saver             │
│  widget-sdk        — Widget registry, launch spec, WidgetContext    │
└──────────────────────────────▲──────────────────────────────────────┘
                               │
┌──────────────────────────────┴──────────────────────────────────────┐
│  CORE                                                               │
│                                                                     │
│  core              — module system, ProfileManager,                 │
│                      ExpressionEngine, shadcn primitives, Poppable  │
│  ui                — low-level shadcn-ui components                 │
└──────────────────────────────▲──────────────────────────────────────┘
                               │
┌──────────────────────────────┴──────────────────────────────────────┐
│  FOUNDATION                                                         │
│                                                                     │
│  shared-types      — pure TS interfaces (no runtime imports)        │
│  design-system     — Tailwind config, tokens, terminal palette      │
│  tokens-primeng    — PrimeNG theme bridge                           │
│  icons-svg         — shared icon bundle                             │
└─────────────────────────────────────────────────────────────────────┘
```

## Import rules

Every package declares `@marketsui/*` dependencies as workspace packages
(via npm workspaces' internal linking — no explicit `workspace:` protocol
needed since npm resolves by the workspace name + `"*"` range).

### Allowed

- Up the stack: any package may import from packages *below* it in the
  diagram.
- Sideways within a layer: OK (e.g., `markets-grid` → `config-service`).
- `shared-types` is imported by everyone and imports nothing (other than
  `.d.ts` stubs it ships).

### Forbidden

- **Foundation must not import from Core or above.** `shared-types`,
  `design-system`, `tokens-primeng`, `icons-svg` are leaves. Breaking this
  will introduce cycles the moment core pulls in shared-types.
- **Core must not import from Framework Adapters.** `core` is
  React-agnostic in intent (it currently targets React 19, but Angular
  consumers go through `@marketsui/angular` which wraps core's imperative
  API, never the other way around).
- **`angular` must not import from `widgets-react`.** Framework layers
  are siblings, not consumers of each other.
- **Platform Shells are the only packages allowed to import from**
  `@openfin/core`. Everything below the shells treats OpenFin as a
  runtime side-effect injected via DI / context.
- **Apps import from packages, never the reverse.** No package may import
  from `apps/*`.

### Circular-dependency red flag

`openfin-platform-stern` used to import `dataProviderConfigService` from
`widgets-react`, creating a shell↔framework cycle Turborepo (correctly)
rejected. The current workaround is a commented-out import in
`openfin-platform-stern/src/bootstrap.ts` with a TODO to move
`dataProviderConfigService` down to `component-host` or `shared-types` so
shells can depend on it without crossing back through the framework
layer. See the TODO in `bootstrap.ts` for context.

## Build orchestration

Turborepo drives the pipeline. `turbo.json` defines:

| Task | DependsOn | Cache | Outputs |
|---|---|---|---|
| `build` | `^build` | yes | `dist/**` |
| `typecheck` | `^build` | yes | (none) |
| `test` | `^build` | yes | `coverage/**` |
| `dev` | — | no | (persistent) |
| `e2e` | `build` | no | `playwright-report/**`, `test-results/**` |

`^build` means "build my dependencies before me." This is why `core` is
the slowest path on a cold run — `markets-grid` and every framework
package waits on it.

Every library package uses `"build": "rimraf dist && tsc"` (or
`ng-packagr` for Angular libs). The `rimraf` prefix defeats a TS5055
"cannot overwrite input file" bug that surfaces when Turbo restores a
cached `dist/` and tsc reads stale `.d.ts` as inputs on the next run.

## Test orchestration

- **Vitest 4** drives unit tests. 298 tests at HEAD.
- **Playwright 1.59** drives the e2e suite in `e2e/` against
  `apps/demo-react`. `playwright.config.ts` at the root spawns Vite via
  `npm run dev -w @marketsui/demo-react` on port 5190.
- CI matrix (`.github/workflows/ci.yml`) runs typecheck, build, test in
  parallel jobs. The e2e job is separate (`e2e.yml`) because it needs
  `playwright install --with-deps chromium`.

## Dep standard

All version pinning lives in [`DEPS_STANDARD.md`](./DEPS_STANDARD.md).
In short:

- React 19.2.5 / React DOM 19.2.5 exact
- TypeScript 5.9.3 exact
- Vite 7.3.2 exact
- Tailwind 3.4.1 exact (**NOT** v4)
- AG-Grid 35.1.0 exact
- OpenFin 42.103.x (Core / Workspace / Dock-Manager)
- Angular 21.1.0 exact
- Vitest 4, jsdom 29

Bundled `.tgz` packages (`lucide-react`, `@widgetstools/dock-manager`,
`@primeng/themes`) live in the repo and ship peer-dep declarations that
conflict with React 19 / Angular 21 on first read. Install with
`--legacy-peer-deps` — this is permanent, not a workaround.

## Packages at a glance

| Layer | Package | Lines | Owner |
|---|---|---|---|
| Foundation | `shared-types` | ~600 | platform |
| Foundation | `design-system` | ~200 tokens + CSS | platform |
| Foundation | `tokens-primeng` | ~150 | platform |
| Foundation | `icons-svg` | ~80 assets | design |
| Core | `core` | ~16k | platform |
| Core | `ui` | ~1k | platform |
| Domain | `markets-grid` | ~10k | grid |
| Domain | `config-service` | ~1.5k | platform |
| Domain | `component-host` | ~1k | platform |
| Domain | `widget-sdk` | ~600 | widgets |
| Framework | `widgets-react` | ~3k | widgets |
| Framework | `angular` | ~1.5k | angular |
| Framework | `dock-editor-react` | ~800 | platform |
| Framework | `dock-editor-angular` | ~800 | angular |
| Framework | `registry-editor-react` | ~600 | platform |
| Framework | `registry-editor-angular` | ~600 | angular |
| Shell | `openfin-platform` | ~500 | platform |
| Shell | `openfin-platform-stern` | ~900 | platform |

## Further reading

- [**MARKETSUI_DESIGN.md**](./MARKETSUI_DESIGN.md) — the long-form design
  spec (1033 lines). Component registry, launch spec, dock protocol,
  identity resolver, config lifecycle.
- [**V3_ARCHITECTURE.md**](./V3_ARCHITECTURE.md) — module-system
  architecture for the grid.
- [**V4_REBUILD_PLAN.md**](./V4_REBUILD_PLAN.md) — forward-looking
  rebuild plan (superseded by this consolidation for structural work;
  feature-work sections still current).
- [**ROADMAP.md**](./ROADMAP.md) — feature roadmap, including
  AG-Grid / Adaptable parity gaps.
