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

## Hosting components in the reference apps

Both `apps/markets-ui-react-reference` and `apps/markets-ui-angular-reference`
expose components via plain client-side routes. The reference apps ship a
generic `HostedComponent` wrapper that handles the hosting concerns once —
identity resolution, ConfigService wiring, debug overlay, document title —
so each route's view file only owns its own content.

### What the wrapper provides

- **Per-instance identity (`instanceId`)** resolved in priority order:
  1. OpenFin `customData.instanceId` (when launched inside an OpenFin
     view — survives workspace save/restore)
  2. URL `?instanceId=…` query param (for non-OpenFin embeds)
  3. The `defaultInstanceId` you supply
- **`appId`/`userId`** resolved the same way (OpenFin customData → defaults
  baked from `seed-config.json`).
- **`ConfigManager` singleton** — same Dexie connection every other piece
  of the platform writes through, so a hosted component's profile rows
  appear in the Config Browser alongside dock + registry rows.
- **`StorageAdapterFactory`** — opt-in via `withStorage`; only created
  when the inner component reads/writes the host's ConfigService.
  External components that manage their own storage leave this off.
- **Auto-hide debug overlay** — collapsed by default; slides down from
  the top edge on hover. Renders the resolved `instanceId`/`appId`/
  `user` as labelled chips so you can verify scope at a glance.

### React — `<HostedComponent>` render-prop

```tsx
// apps/markets-ui-react-reference/src/views/MyView.tsx
import { HostedComponent } from '../components/HostedComponent';
import { MarketsGrid } from '@marketsui/markets-grid';

export default function MyView() {
  return (
    <HostedComponent
      componentName="My Blotter"
      defaultInstanceId="my-blotter-default"
      withStorage    // opt in for ConfigService-backed storage
    >
      {({ instanceId, storage, appId, userId }) =>
        instanceId == null || storage == null
          ? <div>Loading…</div>
          : <MarketsGrid
              gridId={instanceId}
              instanceId={instanceId}
              storage={storage}
              appId={appId}
              userId={userId}
              /* …your column defs, theme, row data… */
            />
      }
    </HostedComponent>
  );
}
```

Then wire it as a route in `main.tsx`:

```tsx
const MyView = React.lazy(() => import('./views/MyView'));

<Route
  path="/blotters/myview"
  element={
    <React.Suspense fallback={<div>Loading…</div>}>
      <MyView />
    </React.Suspense>
  }
/>
```

For an **external** component (one that fetches its own state), drop
`withStorage` — `storage` will be `null` and the component is expected
to use the `appId`/`userId` it receives as hints when calling its own
backend.

### Angular — `<app-hosted-component>` + `HostedComponentService`

The Angular wrapper uses content projection and a component-scoped
service. Inner components inject the service to read the resolved
identity; the wrapper itself handles everything else.

```ts
// apps/markets-ui-angular-reference/src/app/views/my-view-page.component.ts
import { Component, inject } from '@angular/core';
import { HostedComponentComponent, HostedComponentService } from '../components/hosted-component';

@Component({
  selector: 'app-my-view-page',
  standalone: true,
  imports: [HostedComponentComponent, MyInnerComponent],
  template: `
    <app-hosted-component
      componentName="My Blotter"
      defaultInstanceId="my-blotter-default"
    >
      <app-my-inner />
    </app-hosted-component>
  `,
})
export class MyViewPageComponent {}

// In MyInnerComponent — inject the service to read context
@Component({ ... })
export class MyInnerComponent {
  private host = inject(HostedComponentService);
  readonly instanceId = this.host.instanceId;  // signal<string | null>
  readonly appId = this.host.appId;            // signal<string>
  readonly userId = this.host.userId;          // signal<string>
}
```

Wire it as a lazy route in `app.routes.ts`:

```ts
{
  path: 'blotters/myview',
  loadComponent: () =>
    import('./views/my-view-page.component').then((m) => m.MyViewPageComponent),
},
```

### Routes vs OpenFin views

A route is just a path the SPA renders. The same route is used in three
launch contexts:

1. **Plain browser** (vite dev) — type the URL, the wrapper resolves
   identity from URL params or its default.
2. **OpenFin View** inside the platform — the dock launches it via
   `platform.createView({ url, customData: { instanceId, appId,
   userId } })`. The wrapper reads customData and the same component
   round-trips its config across workspace saves.
3. **Standalone OpenFin Window** — same URL, opened via
   `fin.Window.create({ url, customData: { … } })`. Workspace
   captures it the same way.

All three paths feed the same `instanceId` → `(appId, userId,
instanceId)` ConfigService scope, so a component saved inside OpenFin
shows up identically in plain browser dev (same Dexie DB, same row).

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
