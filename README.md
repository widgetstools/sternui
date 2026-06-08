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
├── apps/                    # consumer/reference demos (apps/demos/*) — installed | source modes
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
| `my-stomp-app` | 5200 | `npm run dev:my-stomp-app` |
| `demo-stomp-markets-grid` | 5210 | `npm run dev:demo-stomp-markets-grid` (needs `npm run dev:stomp`) |
| `stomp-marketsgrid-minimal` | 5213 | `npm run dev:stomp-marketsgrid-minimal` — lean STOMP→MarketsGrid code sample (needs `npm run dev:stomp`) |
| `platform-hooks-demo` | 5214 | `npm run dev:platform-hooks-demo` — AppData bootstrap + grid event callbacks (mock data, no broker) |
| `basic-starui-app` | 5194 | `npm run dev:basic-starui-app` |
| `markets-ui-react-reference` | 5174 | `npm run dev:markets-ui-react-reference` |
| `demo-angular` | 4200 | `npm run dev:demo-angular` |
| `stomp-view-server` | 8081 | `npm run dev:stomp` |

`npm run dev` defaults to `demo-react` at http://localhost:5190.

Run `npm run verify:apps` to smoke-test dev servers.

### Packages vs consumer apps

| Layer | Path | Build command |
|-------|------|----------------|
| **Libraries** | `packages/*` | `npm run build:packages` |
| **Bucket tarballs** | `libs/*.tgz` (gitignored) | `npm run propagate` |
| **Apps — source mode** (default dev) | `apps/demos/*` | `npm run build:apps` |
| **Apps — tarball mode** (CI / consumer parity) | `apps/demos/*` | `npm run build:apps:installed` |

Consumer apps declare **`file:libs/starui-*.tgz`** in `package.json`. Vite maps
`@starui/grid`, `@starui/app`, … via [`scripts/staruiConsumerAliases.mjs`](./scripts/staruiConsumerAliases.mjs).
**Source mode is the default** (live `packages/`). Tarball mode is opt-in with
`STARUI_USE_TARBALLS=1` or the `*:installed` scripts — see
[Running apps](#running-apps--source-mode-vs-tarball-mode) below.

After library changes (tarball mode only — source mode picks up edits live):

```bash
npm run build:packages
npm run propagate
npm run install:apps
npm run verify:consumer    # CI: tarball production builds
```

Validate source-mode resolution before starting demos:

```bash
npm run check:source-aliases           # warn if build:packages still needed
npm run check:source-aliases -- --strict   # fail until packages are built
```

Full matrix: **[`docs/BUILD.md`](./docs/BUILD.md)** and **[`apps/README.md`](./apps/README.md)**.

## Grid customizer modules (`@starui/grid`)

| Module | Priority | Purpose |
|---|---|---|
| `general-settings` | 0 | Grid Options — row sizing, selection, flash-on-change + colour swatches, side bar, … |
| `column-templates` | 1 | Named style templates |
| `column-customization` | 10 | Per-column format, filter, style, layout |
| `calculated-columns` | 15 | Expression-driven virtual columns |
| `column-groups` | 18 | Header group hierarchy |
| `conditional-styling` | 20 | Expression-driven row/cell painting |
| `saved-filters` | 30 | Quick-filter pills |
| `toolbar-visibility` | 40 | Toolbar show/hide |
| `grid-state` | 200 | AG Grid native state on explicit Save |

See **[docs/BUILD.md](./docs/BUILD.md)** and **[docs/LIBS.md](./docs/LIBS.md)** for build and tarball layout.

## Prerequisites

- **Node.js** ≥ 20
- **npm** 10.x (see `packageManager` in root `package.json` — use `npm install`, not `yarn` / `pnpm`)

> **Lockfiles are not committed.** `package-lock.json` / `apps/package-lock.json`
> are gitignored — they pin `registry.npmjs.org`, which a site behind a corporate
> Artifactory can't reach. Every install uses `npm install` (never `npm ci`); each
> environment regenerates its own lock against the registry in its `.npmrc` (see
> [`.npmrc.example`](./.npmrc.example)). Version pins in `package.json` are the
> reproducibility anchor.

## Fresh clone — step by step

The repo has **two install surfaces**:

| Surface | Path | What gets installed |
|---------|------|---------------------|
| **Packages** | repo root | `packages/*`, `tools/mcp-scaffold`, `e2e-openfin` — workspace `"*"` links between libraries |
| **Apps** | `apps/` (nested workspace) | Demos — `@starui/*` from local **`libs/*.tgz`** ([not in git](./docs/LIBS.md)) |

### 1. Clone and install everything (most contributors)

```bash
git clone <repo-url> starui
cd starui

npm run install:all
```

Runs **`bootstrap`**: `npm install` → build packages → **`propagate`** (writes gitignored `libs/`) → `npm install --prefix apps`.

### 2. Packages only (library work — faster)

```bash
npm install
npm run build:packages
npm test
```

Skip `install:apps` until you need to run a demo or `npm run build:apps`.

### 3. Install apps when you need demos

Requires `libs/` on disk first (`propagate` or step 1):

```bash
npm run build:packages
npm run propagate
npm run install:apps
```

### 4. Run the primary React demo

```bash
npm run dev
# → http://localhost:5190  (@starui/demo-react under apps/demos/demo-react, source mode)
```

### 5. Consumer CI parity (tarball mode)

```bash
npm run verify:consumer
```

Sequence: `build:packages` → `propagate` → `install:apps` → **`build:apps:installed`**.

### 6. App bundles — source mode (default)

```bash
npm run build:apps
```

Requires `propagate` + `install:apps` once so app npm deps (React, Vite, …) are
installed. `@starui/*` resolves from live `packages/` — no re-propagate needed
after library edits.

### 7. After you change library code (tarball mode only)

```bash
npm run build:packages
npm run propagate
npm run install:apps
```

Source-mode dev servers pick up `packages/` edits on hot reload without this step.

### 8. Rebuild gitignored `libs/`

```bash
npm run bootstrap -- --force
```

---

## Running apps — source mode vs tarball mode

Each Vite demo lives **once** under `apps/demos/<app>/`. The folder is the same
in both modes; you choose the mode with the script (or env var) you run.

| Mode | Default? | `@starui/*` resolves from | Use it when |
|------|----------|---------------------------|-------------|
| **Source** | yes | live `packages/` source | day-to-day dev — library edits hot-reload |
| **Tarball** | no | installed `file:libs/*.tgz` | consumer / publish parity, CI |

Mechanism: [`scripts/staruiConsumerAliases.mjs`](./scripts/staruiConsumerAliases.mjs)
aliases `@starui/*` to `packages/` **unless** `STARUI_USE_TARBALLS=1` is set.

> **Setup (both modes):** run once after clone (or when adding app deps):
>
> ```bash
> npm install                  # repo root — libraries
> npm run build:packages       # required — emits packages/*/dist (CSS, workers, tsc output)
> npm run propagate            # writes gitignored libs/*.tgz + manifest.json
> npm run install:apps         # nested apps/ workspace (React, Vite, tarballs, …)
> ```
>
> Or `npm run install:all` to do all of the above.
>
> **Exceptions:** `demo-angular` and `stomp-view-server` always resolve
> `@starui/*` from installed tarballs (no Vite source aliases).

---

### Source mode

#### From the repo root

```bash
# Primary demo — http://localhost:5190
npm run dev
npm run dev:demo-react

# Other demos (same pattern — all root dev:* scripts are source mode)
npm run dev:markets-ui-react-reference    # → http://localhost:5174
npm run dev:star-demo                     # → http://localhost:5175
npm run dev:markets-grid-lab

# By workspace name (any Vite demo)
npm --prefix apps run dev -w @starui/demo-react
npm --prefix apps run dev -w @starui/star-demo

# Production bundles — all apps, or one app
npm run build:apps
npm --prefix apps run build -w @starui/demo-react
```

#### From inside an app folder

```bash
cd apps/demos/demo-react

npm run dev          # source mode (default)
npm run dev:source   # alias for dev

npm run build        # source-mode production bundle
npm run build:source # alias for build
```

Edit files under `packages/` — the running dev server hot-reloads without
re-running `propagate`.

---

### Tarball mode

Use this to verify what an external consumer sees after `npm install` from
packed `@starui/*` bucket tarballs.

#### From the repo root

```bash
# Dev server (one app)
npm --prefix apps run dev:installed -w @starui/demo-react
npm --prefix apps run dev:installed -w @starui/star-demo

# Or set the env var explicitly
cross-env STARUI_USE_TARBALLS=1 npm --prefix apps run dev -w @starui/demo-react

# Production bundles — all apps, or one app
npm run build:apps:installed
npm --prefix apps run build:installed -w @starui/demo-react

# Full CI parity (packages → propagate → install → tarball builds)
npm run verify:consumer
```

#### From inside an app folder

```bash
cd apps/demos/demo-react

npm run dev:installed
npm run build:installed

# Or
cross-env STARUI_USE_TARBALLS=1 npm run dev
cross-env STARUI_USE_TARBALLS=1 npm run build
```

After changing `packages/`, refresh tarballs before tarball-mode dev/build:

```bash
npm run build:packages && npm run propagate && npm run install:apps
```

---

## Getting started (quick commands)

```bash
npm run install:all

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
| `build:apps` | Build all demo apps in **source mode** (default) |
| `build:apps:installed` | Build all demo apps in **tarball mode** (consumer parity) |
| `build:apps-source` | Alias for `build:apps` |
| `build:consumer` | `build:packages` → `propagate --no-build` → `install:apps` |
| `typecheck:packages` | `tsc --noEmit` on libraries |
| `typecheck:apps` | Typecheck demo apps in **source mode** |
| `typecheck:apps:installed` | Typecheck demo apps in **tarball mode** |
| `typecheck:consumer` | packages + propagate + **tarball** app typecheck (CI) |
| `test:packages` | Vitest across library packages (`npm test`) |
| `check:source-aliases` | Verify `@starui/*` Vite aliases resolve in source mode (`--strict` fails until `build:packages` done) |
| `check:tarballs` | Fail if local `libs/*.tgz` are stale vs `packages/` build (optional; `libs/` not in git) |
| `verify:consumer` | Full tarball pipeline: packages → propagate → install → `build:apps:installed` |
| `install:apps` | Fresh `npm install` in nested `apps/` workspace |
| `install:all` | `bootstrap` — packages + propagate + apps (fresh clone default) |
| `bootstrap` | `npm install` → `build:packages` → `propagate` → `install:apps` |
| `propagate` | Rebuild gitignored `libs/`, sync app deps (no lockfiles to commit) |
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
  (e.g. `starui-react-grid.tgz` bundles `@starui/grid`). The name is stable —
  no version or content hash — so app `file:` pins never need re-syncing.
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
- **5214** — `platform-hooks-demo` with `STARUI_DEV_SOURCE=1` (`e2e/platform-hooks-demo.spec.ts`)

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
| [`docs/guides/platform-bootstrap-config.md`](./docs/guides/platform-bootstrap-config.md) | Web `app-config.json` vs OpenFin manifest `customSettings` (`appId`, `userId`, hub bootstrap) |
| [`docs/guides/consumer-app-sharedworker-and-tailwind.md`](./docs/guides/consumer-app-sharedworker-and-tailwind.md) | SharedWorker + Tailwind pitfalls for consumer apps |
| [`docs/STOMP_DATAPROVIDER_MARKETSGRID_GUIDE.md`](./docs/STOMP_DATAPROVIDER_MARKETSGRID_GUIDE.md) | Fresh app + STOMP provider + MarketsGrid end-to-end |
| [`docs/MARKETSGRID_USAGE_GUIDE.md`](./docs/MARKETSGRID_USAGE_GUIDE.md) | MarketsGrid scenarios (components, hub, OpenFin, persistence) — [PDF](./docs/MARKETSGRID_USAGE_GUIDE.pdf) |
| [`docs/guides/platform-hooks-demo.md`](./docs/guides/platform-hooks-demo.md) | AppData bootstrap hooks + grid event callback bindings |
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
npm install     # from repo root — always start here on a fresh clone
```

Bucket tarballs under `libs/` are **gitignored** — run `npm run install:all`
(or `bootstrap`) on a fresh clone to generate them. After package changes, run
`npm run propagate`. Lockfiles aren't committed (regenerated per environment),
so there's nothing to commit but source. See [docs/LIBS.md](./docs/LIBS.md).

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

# Check local libs/ tarballs match packages/ (optional; libs/ not in git)
npm run check:tarballs
```

**Fast local dev** — source mode is the default; no tarball refresh needed while editing `packages/`:

```bash
npm run dev:demo-react
npm run dev:markets-ui-react-reference
```

To test against **tarballs** instead:

```bash
npm run build:packages && npm run propagate && npm run install:apps
npm --prefix apps run dev:installed -w @starui/demo-react
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

#### 4. Scaffold apps with MCP (`@starui/mcp-scaffold`)

MCP server (tarball in `libs/starui-mcp-scaffold-*.tgz`) scaffolds external-consumer
React apps with bundled `libs/` StarUI tarballs, design-system compliance, shadcn UI,
AG Grid themes, STOMP server, and OpenFin reference template.

```bash
# Pack MCP server (includes bundled platform tarballs)
npm run pack:mcp

# Run via npx
npx -y ./libs/starui-mcp-scaffold-0.1.0-<sha>.tgz
```

**Cursor / Claude Code** (`~/.cursor/mcp.json` or project `.mcp.json`):

```json
{
  "mcpServers": {
    "starui-scaffold": {
      "command": "npx",
      "args": ["-y", "./libs/starui-mcp-scaffold-0.1.0-<sha>.tgz"],
      "env": { "STARUI_ROOT": "/path/to/starui" }
    }
  }
}
```

**VS Code** (`.vscode/mcp.json` — use `"servers"` root key + `"type": "stdio"`):

```json
{
  "servers": {
    "starui-scaffold": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "./libs/starui-mcp-scaffold-0.1.0-<sha>.tgz"]
    }
  }
}
```

Templates: `basic`, `mockdata-provider`, `dataprovider-editor`, `stomp`, `openfin-platform`.
See [`tools/mcp-scaffold/README.md`](./tools/mcp-scaffold/README.md) and
[`docs/superpowers/specs/2026-05-27-starui-mcp-scaffold-design.md`](./docs/superpowers/specs/2026-05-27-starui-mcp-scaffold-design.md).

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

Each bucket tarball uses a stable, content-independent name, e.g.
`libs/starui-react-grid.tgz`. `libs/manifest.json` maps
`@starui/react-grid` → filename and lists member packages inside the bundle.
A version-stamped human-readable mirror is kept under `dist/packages/`.

---

### Clean

Remove installed dependencies, compiled output, and Turbo cache:

```bash
npm run clean
```

Then reinstall:

```bash
npm install
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
npm run check:tarballs        # optional: local libs/ vs fresh pack (after propagate)
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
| First-time setup | `npm install && npm run propagate` |
| Edit libraries | `npm run build:packages && npm test` |
| Edit libraries + test in demo app | `npm run dev` (source mode — hot-reloads `packages/`) |
| Test as a tarball consumer | `npm run propagate && npm run install:apps && npm --prefix apps run dev:installed -w @starui/demo-react` |
| Pre-merge CI check | `npm run verify:consumer && npm test && npm run e2e` |
| Production build all apps | `npm run build` |
| Fresh tarball hand-off | `npm run build:packages && npm run propagate` |
| Nuke and reinstall | `npm run clean && npm ci && npm run propagate` |

## Copyright

Internal Wells Fargo Capital Markets project. Not open-source.
