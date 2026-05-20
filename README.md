# StarUI platform

A config-driven UI framework for capital-markets trading apps on OpenFin and
in the browser. StarUI ships a MarketsGrid product (AG Grid Enterprise +
customizer modules), a SharedWorker-backed data-services runtime, and hosted
shells so React and Angular widgets can run side-by-side under one OpenFin
workspace.

This monorepo consolidates previously fragmented Markets UI / widget tooling
into a single source of truth. Package names use the `@starui/*` scope; the
repo directory is `starui/`.

See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for the layer model and
[`docs/PACKAGE_ORGANIZATION.md`](./docs/PACKAGE_ORGANIZATION.md) for the ten
architecture buckets.

## Monorepo layout

```
starui/                      # npm workspace root
├── packages/                # ten architecture buckets (@starui/* libraries)
├── apps/                    # demos, reference apps, dev utilities
├── docs/                    # architecture, parity, consumer guides
├── scripts/                 # propagate, Vite/Tailwind consumer helpers
├── tools/                   # OpenFin launcher + dev utilities
├── e2e/                     # Playwright suite (demo-react + reference app)
└── e2e-openfin/             # OpenFin CDP smoke tests
```

## Stack

- **Node** ≥ 20, **npm** 10 workspaces, **Turborepo** 2
- **React** 19.2.x + **TypeScript** 5.9.x + **Vite** 7.x
- **Angular** 21.1.x (`ng-packagr` for library packages)
- **AG Grid Enterprise** 35.1.x (`themeQuartz`, module registry)
- **OpenFin** 43.101.x (Core / Workspace / Dock-Manager)
- **Dexie** (IndexedDB) for local config persistence; SharedWorker for live data
- **Radix UI** + shadcn primitives via `@starui/ui`
- **Vitest** 4 + **Playwright** 1.59

## Package buckets

Ten buckets under `packages/` — npm names stay `@starui/grid`, `@starui/app`, etc.
Only filesystem paths carry the bucket prefix.

| # | Bucket | Path | Key packages |
|---|--------|------|--------------|
| 1 | Design system | `design-system/` | `@starui/design-system`, `@starui/icons-svg` |
| 2 | Angular UI | `angular-ui/` | *(scaffold — PrimeNG / tokens)* |
| 3 | React UI | `react-ui/` | `@starui/ui` |
| 4 | Angular grid | `angular-grid/` | `@starui/grid-angular` |
| 5 | React grid | `react-grid/` | `@starui/grid` — MarketsGrid + customizer |
| 6 | Data | `data/` | `@starui/host-data`, `@starui/host-data-react`, `@starui/host-config` |
| 7 | OpenFin | `openfin/` | `@starui/host-openfin`, `@starui/openfin-platform` |
| 8 | Angular core | `angular-core/` | `@starui/app-angular`, `@starui/widgets-angular` |
| 9 | React core | `react-core/` | `@starui/app`, `@starui/widgets-react`, `@starui/widget-sdk` |
| 10 | Shared | `shared/` | `@starui/engine`, `@starui/host`, `@starui/types`, `@starui/shared-types` |

**Import rules (summary):** foundation packages never import framework adapters;
only `host-openfin` / `openfin-platform` may import `@openfin/core`; apps import
from packages, never the reverse. Full rules in [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).

## Apps

| App | Port | Command |
|---|---|---|
| `demo-react` | 5190 | `npm run dev:demo-react` |
| `demo-configservice-react` | 5191 | `npm run dev:demo-configservice-react` |
| `mockdata-provider-starui-app` | 5192 | `npm run dev:mockdata-provider-starui-app` |
| `dataprovider-editor-starui-app` | 5193 | `npm run dev:dataprovider-editor-starui-app` |
| `basic-starui-app` | 5194 | `npm run dev:basic-starui-app` |
| `markets-ui-react-reference` | 5174 | `npm run dev:markets-ui-react-reference` |
| `demo-angular` | 4200 | `npm run dev:demo-angular` |
| `stomp-view-server` | 8081 | `npm run dev:stomp` |

`npm run dev` defaults to `demo-react` at http://localhost:5190.

Run `npm run verify:apps` to smoke-test dev servers.

### Demo apps vs library development

| Audience | Installs | Builds with |
|---|---|---|
| **External consumers** | Artifactory / bucket `.tgz` files | App CI + `staruiConsumerVite.mjs` |
| **Monorepo libraries** | Workspace `"*"` between packages | `build:packages`, `typecheck:packages`, `test:packages` |
| **Monorepo demo apps** | `file:../../libs/*.tgz` per bucket | `build:consumer`, `verify:consumer` |

Apps under `apps/` install StarUI the way external teams do: **architecture-bucket
tarballs** under `libs/` (standing in for Artifactory), not workspace member deps.
Vite resolves member imports (`@starui/grid`, `@starui/app`, …) via
[`scripts/staruiConsumerAliases.mjs`](./scripts/staruiConsumerAliases.mjs).

After library changes that demo apps consume:

```bash
npm run propagate          # rebuild + pack buckets → libs/
npm run verify:consumer    # full consumer parity (CI)
```

**Local fast path** — alias demo apps to live `packages/` source (not used in CI):

```bash
STARUI_DEV_SOURCE=1 npm run dev:demo-react
STARUI_DEV_SOURCE=1 npm run dev:markets-ui-react-reference
```

If hot reload looks stale after editing packages, clear Vite cache:

```bash
rm -rf node_modules/.vite apps/*/node_modules/.vite
```

## Grid customizer modules (`@starui/grid`)

| Module | Priority | Purpose |
|---|---|---|
| `general-settings` | 0 | Grid Options — row sizing, selection, flash-on-change, side bar, … |
| `column-templates` | 1 | Named style templates |
| `column-customization` | 10 | Per-column format, filter, style, layout |
| `calculated-columns` | 15 | Expression-driven virtual columns |
| `column-groups` | 18 | Header group hierarchy |
| `conditional-styling` | 20 | Expression-driven row/cell painting |
| `saved-filters` | 30 | Quick-filter pills |
| `toolbar-visibility` | 40 | Toolbar show/hide |
| `grid-state` | 200 | AG Grid native state on explicit Save |

## Getting started

```bash
npm ci

# Primary React demo — http://localhost:5190
npm run dev

# OpenFin reference app (MarketsGrid + data-services) — http://localhost:5174
npm run dev:markets-ui-react-reference

# Angular demo
npm run dev:demo-angular

# Launch demo-react inside OpenFin
npm run dev:openfin

# Launch the React reference app inside OpenFin
npm run dev:openfin:markets-react
```

On a fresh clone, demo apps expect tarballs in `libs/`. If `npm ci` in an app
fails on missing `file:../../libs/*.tgz`, run `npm run propagate` from the repo
root first (or `npm run build:consumer` for a full pass).

## Build & test pipelines

Turbo's graph covers direct workspace deps. Demo apps declare bucket tarballs, so
consumer builds are orchestrated explicitly:

```text
Packages (libraries)                Consumer (demo apps)
─────────────────────               ────────────────────
turbo build --filter=!./apps/**     npm run propagate
turbo typecheck (packages)    →     turbo build --filter=./apps/**
turbo test (packages)               turbo typecheck (apps)
```

### Root scripts

| Script | What it does |
|---|---|
| `build:packages` | Build all libraries under `packages/` |
| `build:apps` | Build demo apps (needs fresh tarballs) |
| `build:consumer` | `build:packages` → `propagate` → `build:apps` |
| `typecheck:packages` | `tsc --noEmit` on libraries |
| `typecheck:apps` | `tsc --noEmit` on demo apps |
| `typecheck:consumer` | packages + propagate + apps typecheck |
| `test:packages` | Vitest across library packages (`npm test`) |
| `check:tarballs` | Fail if committed `libs/*.tgz` are stale |
| `verify:consumer` | `build:consumer` + `typecheck:apps` |
| `propagate` | Pack bucket tarballs to `libs/`, sync app deps |
| `sync:app-deps` | Rewrite app tarball paths from manifest |
| `e2e` | Playwright (`e2e/`) |
| `test:e2e:openfin` | OpenFin CDP smoke tests (`e2e-openfin/`) |
| `clean` | Remove `node_modules`, `dist`, `.turbo` |

Shorthand defaults:

```bash
npm run build        # build:consumer
npm run typecheck    # typecheck:consumer
npm test             # test:packages
```

Package-scoped:

```bash
npm run build -w @starui/engine
npm test  -w @starui/grid
```

### Tarballs

- `npm run propagate` writes one `.tgz` per architecture bucket under `libs/`
  (e.g. `starui-react-grid-0.1.0-<sha>.tgz` bundles `@starui/grid`).
- Manifest: `libs/manifest.json` when present, else `dist/packages/manifest.json`
  after a package build.
- External consumers install the same buckets from Artifactory and wire Vite through
  [`scripts/staruiConsumerVite.mjs`](./scripts/staruiConsumerVite.mjs).

## Hosting a MarketsGrid in the reference app

The React reference app (`apps/markets-ui-react-reference`) hosts blotters via
plain client-side routes. Use `<HostedMarketsGrid>` from
`@starui/widgets-react/hosted` — it replaces the older multi-layer
HostedComponent / BlotterGrid stack with one call site.

The wrapper owns identity (`instanceId`, `appId`, `userId`), ConfigService-backed
storage, data-services mounting, theme, document title, and OpenFin workspace
save hooks. The route view only supplies grid-specific props.

```tsx
// apps/markets-ui-react-reference/src/views/BlottersMarketsGrid.tsx
import { HostedMarketsGrid } from '@starui/widgets-react/hosted';

export default function BlottersMarketsGrid() {
  return (
    <HostedMarketsGrid
      componentName="MarketsGrid"
      defaultInstanceId="markets-ui-reference-blotter"
      documentTitle="MarketsGrid · Blotter"
      withStorage
      theme="auto"
      dataServices={dataServices}
      dataServicesMode="eager"
      gridId="markets-ui-reference-blotter"
      historicalDateAppDataRef="positions.asOfDate"
      showFiltersToolbar
      showFormattingToolbar
      defaultColDef={{ floatingFilter: true, filter: true, sortable: true, resizable: true }}
    />
  );
}
```

Wire the view as a lazy route (e.g. `/blotters/marketsgrid`). The same URL works
in the browser, an OpenFin view (identity from `customData`), or a standalone
OpenFin window.

More detail: [`packages/react-core/widgets-react/src/hosted/README.md`](./packages/react-core/widgets-react/src/hosted/README.md).

### OpenFin launch contexts

| Context | Command |
|---|---|
| Browser dev | `npm run dev:markets-ui-react-reference` |
| OpenFin workspace | `npm run dev:openfin:markets-react` |
| Manual manifest | `npm run launch:openfin -- http://localhost:5174/platform/manifest.fin.json` |

## Testing

| Layer | Command | Notes |
|---|---|---|
| Unit (packages) | `npm test` | Vitest 4 + jsdom |
| Consumer verify | `npm run verify:consumer` | Tarballs + app build/typecheck |
| E2E (browser) | `npm run e2e` | Playwright in `e2e/` |

Playwright starts dev servers automatically (`playwright.config.ts`):

- **5190** — `demo-react` (default `baseURL`; most `v2-*.spec.ts` tests)
- **5191** — `demo-configservice-react`
- **5174** — `markets-ui-react-reference` with `STARUI_DEV_SOURCE=1` (integration
  specs such as `hosted-markets-grid.spec.ts`, `reference-cell-flash.spec.ts`)

Run a single spec:

```bash
npx playwright test e2e/reference-cell-flash.spec.ts
STARUI_DEV_SOURCE=1 npx playwright test e2e/hosted-markets-grid.spec.ts
```

OpenFin CDP smoke tests live in `e2e-openfin/` — `npm run test:e2e:openfin`.

CI runs package and consumer jobs separately; see `.github/workflows/ci.yml`.

## Key docs

| Doc | Contents |
|---|---|
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | Layer model, import boundaries |
| [`docs/PACKAGE_ORGANIZATION.md`](./docs/PACKAGE_ORGANIZATION.md) | Ten-bucket layout |
| [`docs/PARITY.md`](./docs/PARITY.md) | Package parity gate |
| [`docs/guides/consumer-app-sharedworker-and-tailwind.md`](./docs/guides/consumer-app-sharedworker-and-tailwind.md) | SharedWorker + Tailwind pitfalls for consumer apps |
| [`CLAUDE.md`](./CLAUDE.md) | Agent / contributor conventions |

## Platform tooling

- `tools/scripts/launch-openfin.mjs` — launch a manifest inside OpenFin
- `scripts/propagate.mjs` — build and pack bucket tarballs
- `scripts/verify-apps.mjs` — dev-server smoke check

## Developer guide

Step-by-step commands for the three common audiences in this repo, plus
propagate, clean, and test workflows.

### Prerequisites

```bash
node -v    # ≥ 20
npm -v     # 10.x (npm 10 workspaces)
npm ci     # from repo root — always start here on a fresh clone
```

On a **fresh clone**, demo apps depend on tarballs under `libs/`. If install
errors mention missing `file:../../libs/*.tgz`, run propagate once before
developing apps (see below).

---

### Build by audience

#### 1. Library developers (packages only)

You edit code under `packages/` and use workspace `"*"` links between libraries.
Demo apps are **not** involved.

```bash
# Compile all libraries
npm run build:packages

# Typecheck libraries only
npm run typecheck:packages

# Unit tests (Vitest) across libraries
npm test
# same as: npm run test:packages

# Single package
npm run build -w @starui/grid
npm run typecheck -w @starui/engine
npm test -w @starui/grid
```

Use this loop while changing `@starui/engine`, `@starui/grid`, `@starui/ui`, etc.
No propagate step is required until demo apps or external consumers need the change.

#### 2. Demo-app / consumer developers (apps in `apps/`)

Apps install StarUI as **bucket tarballs** from `libs/` (same model as
Artifactory consumers). After library changes, tarballs must be refreshed.

```bash
# Full consumer pipeline (CI parity) — packages → propagate → apps
npm run build

# Typecheck the same path
npm run typecheck

# CI gate before merge (build + typecheck apps)
npm run verify:consumer

# Check committed tarballs are current (no repack)
npm run check:tarballs
```

**Fast local dev** — skip tarballs and alias live package source (not used in CI):

```bash
STARUI_DEV_SOURCE=1 npm run dev:demo-react
STARUI_DEV_SOURCE=1 npm run dev:markets-ui-react-reference
```

If edits to packages do not show up in the browser, clear the Vite prebundle cache:

```bash
rm -rf node_modules/.vite apps/*/node_modules/.vite
```

#### 3. External consumers (outside this repo)

External teams install bucket tarballs from Artifactory (or a copied `libs/*.tgz`
set), not the monorepo workspace.

1. Install the buckets your app needs (e.g. `@starui/react-grid`, `@starui/react-core`).
2. Copy [`scripts/staruiConsumerVite.mjs`](./scripts/staruiConsumerVite.mjs) and
   [`scripts/staruiConsumerAliases.mjs`](./scripts/staruiConsumerAliases.mjs) into
   the app (or use your internal scaffold).
3. Build and test in **your** app CI — StarUI does not publish per-member npm
   packages; each tarball bundles every package in an architecture bucket.

To produce tarballs from this monorepo for hand-off:

```bash
npm run build:packages
npm run propagate
# tarballs land in libs/ — see libs/manifest.json for filenames + members
```

---

### Building apps

Production builds for all demo / reference apps:

```bash
# Requires fresh libs/ tarballs — runs build:packages + propagate first
npm run build:consumer

# Apps only (fails if libs/ tarballs are missing or stale)
npm run build:apps
```

Build a **single app**:

```bash
npm run build --workspace=@starui/demo-react
npm run build --workspace=@starui/markets-ui-react-reference
npm run build --workspace=@starui/demo-angular
```

Preview a production build locally:

```bash
npm run build --workspace=@starui/demo-react
npm run preview --workspace=@starui/demo-react
```

Dev servers (no production build):

```bash
npm run dev                              # demo-react → :5190
npm run dev:markets-ui-react-reference     # reference app → :5174
npm run dev:demo-angular                   # Angular demo → :4200
npm run verify:apps                        # smoke-check all dev server ports
```

---

### Propagate packages (tarballs → `libs/`)

`propagate` builds architecture-bucket tarballs, writes `libs/manifest.json`,
updates demo-app `package.json` tarball paths, and runs `npm install` where needed.

```bash
# Pack all buckets (typical after library changes)
npm run propagate

# Preview without writing files
npm run propagate -- --dry-run

# Pack one bucket only
npm run propagate -- react-grid
npm run propagate -- react-core
npm run propagate -- @starui/grid          # resolves to containing bucket

# Remove orphaned tarballs in libs/
npm run propagate -- --gc

# Repack without rebuilding packages (use when only manifest/sync needed)
npm run propagate -- --no-build

# Repack without reinstalling app node_modules
npm run propagate -- --no-install

# Rewrite app tarball paths from manifest (no pack)
npm run sync:app-deps
```

**When to propagate**

| You changed… | Run |
|---|---|
| Any package under `packages/` that demo apps consume | `npm run propagate` |
| Only docs / e2e / scripts (no package code) | Nothing |
| Before opening a PR that touches libraries | `npm run verify:consumer` |
| Before committing tarball updates | `npm run check:tarballs` |

Each bucket tarball name includes a content SHA, e.g.
`libs/starui-react-grid-0.1.0-df49405b.tgz`. `libs/manifest.json` maps
`@starui/react-grid` → filename and lists member packages inside the bundle.

---

### Clean

Remove installed dependencies, compiled output, and Turbo cache:

```bash
npm run clean
```

Then reinstall:

```bash
npm ci
npm run propagate    # if libs/ was empty or you need fresh tarballs
```

To clear **Vite dev cache only** (stale hot reload after package edits):

```bash
rm -rf node_modules/.vite apps/*/node_modules/.vite
```

---

### Run tests

#### Unit tests (Vitest — libraries)

```bash
# All library packages
npm test

# One package
npm test -w @starui/grid
npm test -w @starui/engine

# Watch mode (from a package directory)
npm run test:watch -w @starui/grid
```

#### Typecheck

```bash
npm run typecheck:packages    # libraries only
npm run typecheck:apps        # apps only (needs current libs/ tarballs)
npm run typecheck             # full consumer path (default)
```

#### Consumer verification (pre-merge)

```bash
npm run verify:consumer       # build:consumer + typecheck:apps
npm run check:tarballs        # ensure committed libs/*.tgz match built packages
npm run check:deps            # package cycle check
```

---

### Run E2E tests

Browser E2E uses Playwright in `e2e/`. Dev servers are started automatically
(see `playwright.config.ts`).

```bash
# Full suite (demo-react :5190, demo-configservice :5191, reference :5174)
npm run e2e

# Interactive / debug UI
npm run e2e:ui
npm run e2e:headed

# Single spec or file
npx playwright test e2e/reference-cell-flash.spec.ts
npx playwright test e2e/v2-general-settings.spec.ts

# Reference-app integration specs (5174 server uses STARUI_DEV_SOURCE=1)
npx playwright test e2e/hosted-markets-grid.spec.ts
npx playwright test e2e/reference-cell-flash.spec.ts

# Filter by title
npx playwright test -g "cell flash"
```

OpenFin CDP smoke tests (separate workspace):

```bash
npm run test:e2e:openfin
npm run test:e2e:openfin:cdp
```

**E2E web servers**

| Port | App | Specs |
|---|---|---|
| 5190 | `demo-react` | Most `v2-*.spec.ts`, design-system specs |
| 5191 | `demo-configservice-react` | Config-service integration |
| 5174 | `markets-ui-react-reference` | `hosted-markets-grid`, `reference-cell-flash`, … |

If Playwright fails to pick up recent package changes for the reference app,
clear Vite cache and rerun:

```bash
rm -rf node_modules/.vite apps/markets-ui-react-reference/node_modules/.vite
STARUI_DEV_SOURCE=1 npx playwright test e2e/reference-cell-flash.spec.ts
```

---

### Quick reference

| Goal | Command |
|---|---|
| First-time setup | `npm ci && npm run propagate` |
| Edit libraries | `npm run build:packages && npm test` |
| Edit libraries + test in demo app | `npm run propagate && STARUI_DEV_SOURCE=1 npm run dev` |
| Pre-merge CI check | `npm run verify:consumer && npm test && npm run e2e` |
| Production build all apps | `npm run build` |
| Fresh tarball hand-off | `npm run build:packages && npm run propagate` |
| Nuke and reinstall | `npm run clean && npm ci && npm run propagate` |

## Copyright

Internal Wells Fargo Capital Markets project. Not open-source.
