# mockdata-provider-starui-app — design

**Status:** draft for review
**Date:** 2026-05-17
**Workspace:** `apps/demo-apps/mockdata-provider-starui-app/`

## 1. Purpose

A single-page demo app that teaches developers exactly **how to use
`MockDataProvider` with `MarketsGrid`**. Everything in `basic-starui-app`
that is not about provider wiring (profiles persistence is kept, but no
ConfigInspector, no reset / export / import scaffolding around it) is
stripped. The lesson reduces to three concepts:

1. **The provider config object** (`MockProviderConfig`).
2. **The column definitions** that map provider rows to grid columns.
3. **The two ways to wire the provider stream into the grid** — direct
   `startMock()` vs the full `<DataServicesProvider>` + `useProviderStream`
   stack.

MarketsGrid's built-in profile / layout management stays on so the demo
also shows that provider config and saved grid layouts compose cleanly.

## 2. Layout

The main view uses `@widgetstools/react-dock-manager` with four panels.
Initial layout:

```
┌──────────────────────┬──────────────────────────────────────────┐
│                      │ [ Direct startMock ] [ via DataServices ]│
│   Provider Config    │                                          │
│   ─────────────────  │            <MarketsGrid />               │
│   dataType   ◯◉◯     │                                          │
│   rowCount   ──●──   │                                          │
│   interval   ──●──   │                                          │
│   updates    [✓] on  │                                          │
│   ─────────────────  │                                          │
│   columnDefs preview │                                          │
│                      │                                          │
├──────────────────────┴──────────────────────────────────────────┤
│   Live stats: 200 rows · 1.3 ticks/s · last ▲ 87ms ago          │
└──────────────────────────────────────────────────────────────────┘
```

- **Left** — `ProviderConfigPanel` (~340 px), live editor for the
  `MockProviderConfig` object plus a JSON preview.
- **Right top, tabbed** — two MarketsGrid panels sharing the same
  tab-group: `DirectGridPanel` and `DataServicesGridPanel`.
- **Bottom strip** — `StatsPanel`, showing live row count, rolling
  tick rate, last-update timestamp.

The dock-manager workspace is fully interactive: panels can be
floated, popped out, split, or auto-hidden via standard dock-manager
gestures. The initial layout is not persisted; refreshing the page
returns to the default arrangement. (Saving the dock state is out of
scope; see §10.)

Header is a slimmed-down version of `basic-starui-app`'s — brand,
theme toggle, help button. No menubar, no ConfigInspector, no
status strip. The help button opens a Sheet (see §8).

## 3. Files

All paths relative to `apps/demo-apps/mockdata-provider-starui-app/`.

```
index.html
package.json
tsconfig.json
vite.config.ts
tailwind.config.js
postcss.config.js
src/
  main.tsx                          ← React mount + DataServicesProvider
  App.tsx                           ← Header + DockManagerCore
  globals.css                       ← Design-system token wiring + dock CSS
  dataServices.ts                   ← createDataServicesClient() bundle
  state/
    MockConfigContext.tsx           ← React Context: live MockProviderConfig
  data/
    positionColumns.ts              ← AG-Grid column defs for positions
    tradeColumns.ts                 ← AG-Grid column defs for trades
    orderColumns.ts                 ← AG-Grid column defs for orders (legacy)
    columnDefsByType.ts             ← lookup map: dataType → { columnDefs, rowIdField }
  panels/
    ProviderConfigPanel.tsx
    DirectGridPanel.tsx
    DataServicesGridPanel.tsx
    StatsPanel.tsx
  components/
    Brand.tsx
    HelpSheet.tsx                   ← 5 tabs about MockDataProvider
    ConfigPreview.tsx               ← read-only formatted JSON view
```

File and symbol naming follows the project's CLAUDE.md rule
(PascalCase for components and classes, camelCase for utilities).
No kebab-case in the demo app.

## 4. Configuration state model

`MockConfigContext` exposes a single `MockProviderConfig` (the shape
from `@starui/shared-types`), four setters, and a `reset()` method.

```ts
interface MockConfigCtx {
  cfg: MockProviderConfig;            // memoized; identity changes only on real change
  setDataType: (dt: 'positions' | 'trades' | 'orders') => void;
  setRowCount: (n: number) => void;
  setUpdateIntervalMs: (ms: number) => void;
  setEnableUpdates: (on: boolean) => void;
  reset: () => void;
}

// Defaults
const DEFAULT_CFG: MockProviderConfig = {
  providerType: 'mock',
  dataType: 'positions',
  rowCount: 200,
  updateIntervalMs: 750,
  enableUpdates: true,
};
```

Why a context rather than a global store: only three React subtrees
read it (ProviderConfigPanel + two grid panels). Context keeps the
demo dependency-free.

Cfg identity stability: the context value is built with `useMemo` so
the cfg object reference only swaps when one of its fields actually
changes. That's important because `useProviderStream` re-attaches on
cfg identity change, and the `restart()` path on the direct panel
also dedupes by reference.

## 5. Grid id scheme & profile bundles

Each MarketsGrid panel gets its own profile bundle keyed by a unique
`gridId` that includes the dataType:

```
Direct panel:        mockdata-direct-${dataType}-v1
DataServices panel:  mockdata-via-ds-${dataType}-v1
```

That yields six independent localStorage bundles (2 panels × 3
dataTypes). Switching dataType in the controls **remounts** the
relevant MarketsGrid via React `key={gridId}` so AG-Grid sees a
fresh column model and reinitialises the profile state. The user's
saved layouts for any (panel, dataType) combination come back exactly
when they switch back.

Storage keys:
```
markets-grid-bundle:mockdata-direct-positions-v1
markets-grid-bundle:mockdata-direct-trades-v1
markets-grid-bundle:mockdata-direct-orders-v1
markets-grid-bundle:mockdata-via-ds-positions-v1
markets-grid-bundle:mockdata-via-ds-trades-v1
markets-grid-bundle:mockdata-via-ds-orders-v1
```

Both panels render MarketsGrid with the full profile toolset enabled:
`showFiltersToolbar`, `showFormattingToolbar`, `showProfileSelector`,
`showSaveButton`, `showSettingsButton`. Side bar and status bar match
basic-starui-app defaults.

## 6. Wiring path 1 — `DirectGridPanel` (transport-direct)

The panel imports `startMock` from
`@starui/data-services/runtime/providers/transports/mock` (or the
top-level barrel) and runs it in the same module.

```ts
function DirectGridPanel() {
  const { cfg } = useMockConfig();
  const gridId = `mockdata-direct-${cfg.dataType}-v1`;
  const { columnDefs, rowIdField } = columnDefsByType[cfg.dataType];
  const [rows, setRows] = useState<unknown[]>([]);
  const rowsRef = useRef<unknown[]>([]);
  const handleRef = useRef<ProviderHandle | null>(null);

  useEffect(() => {
    handleRef.current = startMock(cfg, (evt) => {
      if (evt.rows && evt.replace) {
        rowsRef.current = [...evt.rows];
        setRows(rowsRef.current);
      } else if (evt.rows) {
        rowsRef.current = applyDelta(rowsRef.current, evt.rows, rowIdField);
        setRows(rowsRef.current);
      }
      // status events → forwarded to StatsPanel via a shared stats channel
    });
    return () => handleRef.current?.stop();
  }, [cfg, rowIdField]);

  return (
    <MarketsGrid
      key={gridId}
      gridId={gridId}
      rowData={rows}
      columnDefs={columnDefs}
      rowIdField={rowIdField}
      // ... full profile toolset enabled
    />
  );
}
```

`applyDelta` is a small helper: positions and trades carry a stable
row id, so it merges incoming rows by id into the current snapshot
(immutable update). For orders we use the same pattern with `id`.

## 7. Wiring path 2 — `DataServicesGridPanel` (full stack)

This panel uses `useProviderStream` from `@starui/data-services-react`.
The provider id is constructed from the dataType so the SharedWorker
hub keeps separate provider instances for each.

```ts
function DataServicesGridPanel() {
  const { cfg } = useMockConfig();
  const gridId = `mockdata-via-ds-${cfg.dataType}-v1`;
  const providerId = `mock-${cfg.dataType}`;
  const { columnDefs, rowIdField } = columnDefsByType[cfg.dataType];
  const [rows, setRows] = useState<unknown[]>([]);
  const rowsRef = useRef<unknown[]>([]);

  useProviderStream(providerId, cfg, {
    onDelta: (incoming, replace) => {
      if (replace) {
        rowsRef.current = [...incoming];
      } else {
        rowsRef.current = applyDelta(rowsRef.current, incoming, rowIdField);
      }
      setRows(rowsRef.current);
    },
    onStatus: () => undefined,
  });

  return (
    <MarketsGrid
      key={gridId}
      gridId={gridId}
      rowData={rows}
      columnDefs={columnDefs}
      rowIdField={rowIdField}
      // ... full profile toolset enabled
    />
  );
}
```

The cfg object is passed inline. No row is written to the
DataProviderConfigStore at startup — the demo intentionally shows
the "ad-hoc cfg" flow so consumers can compare it side-by-side
with `Direct`. (Saving a named provider config is its own concern
and lives in the existing `config-browser-react` app.)

`dataServices.ts` builds the services bundle once using the high-level
`createDataServicesClient` helper. It internally constructs the
SharedWorker, wires the default hub entry, and creates a ConfigManager
seeded with the right userId — no manual worker file required.

```ts
// dataServices.ts
import { createDataServicesClient } from '@starui/data-services';
import { LOGGED_IN_USER_ID } from '@starui/runtime-port';

export const dataServices = createDataServicesClient({
  appName: 'mockdata-provider-starui-app',
  userId: LOGGED_IN_USER_ID,
  // Browser-only demo — no REST config service. Local IndexedDB is
  // the ConfigManager backing store (default behaviour).
  configServiceRestUrl: undefined,
});
```

`main.tsx` wraps `<App />` in the provider:

```tsx
import { DataServicesProvider } from '@starui/data-services-react/runtime';
import { dataServices } from './dataServices';

createRoot(document.getElementById('root')!).render(
  <DataServicesProvider services={dataServices}>
    <App />
  </DataServicesProvider>,
);
```

No `<Suspense>` wrapper is needed because the provider runs in `mode="lazy"`
(default). `useProviderStream` starts in `loading` until the hub's
first snapshot arrives, which is fine for a demo.

## 8. ProviderConfigPanel

Layout (top to bottom inside a `ScrollArea`):

1. **Header** — title "Mock Data Provider", help icon → opens HelpSheet to "Provider config" tab.
2. **dataType** — shadcn `RadioGroup` with three options.
3. **rowCount** — three chip buttons (50 / 200 / 1000) using `Button variant="outline"`; the currently-selected chip is `variant="default"`. No slider — chips read cleaner for a demo.
4. **updateIntervalMs** — shadcn `Slider` 250–3000 ms (step 50). Current value rendered next to the slider in a `Badge`.
5. **enableUpdates** — shadcn `Switch` labelled "Stream live updates".
6. **Reset to defaults** — `Button variant="ghost"`. Calls `MockConfigContext.reset()`.
7. **Live config preview** — `ConfigPreview` component: read-only formatted JSON of the current cfg inside a bordered `ScrollArea`. Updates instantly on any control change.
8. **Column defs preview** — a collapsible (`Tabs` or `Accordion`) showing the active column defs as JSON.

All primitives from `@starui/ui`. All colours via `--ds-*` CSS variables.

## 9. StatsPanel

A compact, three-column strip displaying live numbers, sourced from
both grid panels via a shared `StatsContext`:

| Direct panel               | DataServices panel         | Provider config (echo) |
|----------------------------|----------------------------|------------------------|
| rows · ticks/s · last ▲ Δ  | rows · ticks/s · last ▲ Δ  | dataType · rowCount · interval · updates on/off |

`StatsContext` exposes `recordTick(source, ts, rowCount)` so both
grid panels push timestamps. The panel computes a rolling 5-second
tick rate from a small ring buffer. No expensive renders: the panel
re-renders at most once a second via a 1 Hz interval.

## 10. HelpSheet

`Sheet` (right side) wrapping a 5-tab `Tabs`:

| Tab key | Tab label | Content |
|---------|-----------|---------|
| `quickstart` | Quick start | What the demo shows, the four dock panels, keyboard shortcuts |
| `config` | Provider config | `MockProviderConfig` schema field-by-field with code snippets |
| `columns` | Column defs | AG-Grid column defs for each dataType; `rowIdField` choice; valueFormatter / cellStyle pointers |
| `wiring` | Wiring to grid | Side-by-side: Direct `startMock()` vs `useProviderStream()`; lifecycle (`loading → ready`); when to pick each |
| `layouts` | Layouts & profiles | How `gridId` scopes a profile bundle; why each (panel × dataType) gets its own; how Save / dropdown / customizer interact |

Same primitive style as `basic-starui-app/src/components/HelpSheet.tsx`
(`Section`, `ItemRow`, `Prose`, `Code`, `Kbd`, `ShortcutRow` helpers
get copied in unchanged — they're tiny and presentation-only).

## 11. Keyboard shortcuts

- `Ctrl + /` — toggle help
- `Ctrl + .` — toggle theme
- `Ctrl + 1` / `Ctrl + 2` / `Ctrl + 3` — switch dataType (positions / trades / orders)
- `Space` (when ProviderConfigPanel focused) — toggle `enableUpdates`

No export / import / inspector shortcuts — out of scope.

## 12. Theming

- App theme: `applyTheme({theme: 'dark'|'light'})` from `@starui/design-system`. Header button flips it.
- Dock-manager theme: `slateDark` when app is dark, `vsCodeLight` when light. (Closest visual match to StarUI tokens. No custom dock-manager theme.)
- All app surfaces use `bg-[color:var(--ds-*)]` Tailwind arbitrary values, exactly as `basic-starui-app` does.
- `@widgetstools/react-dock-manager/styles.css` imported once in `globals.css` after the design-system stylesheet so dock-manager defaults don't override token colours.

## 13. Dependencies

Inherit the basic-starui-app tarball set, add:

```json
"@starui/data-services": "file:../../../libs/starui-data-services-0.1.0-b8784441.tgz",
"@starui/data-services-react": "file:../../../libs/starui-data-services-react-0.1.0-6cabfb16.tgz",
"@starui/config-service": "file:../../../libs/starui-config-service-1.0.0-d9ffa570.tgz",
"@starui/runtime-port": "file:../../../libs/starui-runtime-port-0.1.0-420f624f.tgz",
"@widgetstools/react-dock-manager": "^1.0.0",
"@widgetstools/dock-manager-core": "^1.0.0"
```

Tarball filenames may change between sessions — the implementation
plan must re-read `libs/manifest.json` to find the current canonical
filenames before pinning. Use `npm run propagate -- <pkg>...` only if
the implementation needs to re-pack any of the StarUI libs.

## 14. Design-system compliance

- Every UI primitive is from `@starui/ui` (shadcn): `Sheet`, `Tabs`, `Card`, `Button`, `Slider`, `RadioGroup`, `Switch`, `ScrollArea`, `Badge`, `Tooltip`, `TooltipProvider`, `Separator`, `Accordion` (or `Collapsible`).
- **No** native `<input>`, `<textarea>`, `<select>`, `<button>`.
- **No** inline `style={{ ... }}` attributes — Tailwind classes only.
- **No** hardcoded hex colors — always `var(--ds-*)` or `var(--bn-*)`.
- Both `[data-theme="dark"]` and `[data-theme="light"]` must render correctly (verified manually before the task is marked done).

## 15. Acceptance criteria

The demo is "done" when **all** of the following hold:

1. `npm install` from monorepo root completes cleanly (no `--legacy-peer-deps`).
2. `npm run dev -w @starui/mockdata-provider-starui-app` serves the app on a Vite port (script set: `dev`, `build`, `typecheck` — same shape as basic-starui-app).
3. Default page shows the four-panel dock layout with Direct grid as the active tab, ProviderConfigPanel on the left, StatsPanel on the bottom.
4. Switching `dataType` in the config panel:
   - Swaps column defs in both grid panels.
   - Remounts both grids under new `gridId`s; previously-saved layouts for the new (panel, dataType) come back if any exist.
   - Restarts the provider (snapshot reload visible in StatsPanel).
5. Changing `rowCount`, `updateIntervalMs`, or `enableUpdates` affects both grids without forcing remount.
6. Both grids reach `status: 'ready'` within ~500 ms after mount and show streaming updates when `enableUpdates=true`.
7. Saving a profile in either grid (via its built-in save button) writes a fresh row to the matching localStorage bundle; refreshing the page restores it.
8. Help drawer opens via `Ctrl + /` and the help button; all 5 tabs render without overflow.
9. Theme toggle flips both app surfaces and the dock-manager theme.
10. `npx turbo typecheck build test --filter @starui/mockdata-provider-starui-app` is green.
11. No console warnings about React keys, missing AG-Grid licence (the demo runs in community mode just like basic-starui-app), or shadcn primitive misuse.

## 16. Out of scope

- Persisting the dock-manager layout to localStorage. (`@widgetstools/dock-manager-core` ships `saveToLocalStorage` / `loadFromLocalStorage` helpers; can be added in a follow-up.)
- Editing column defs from the UI (they're code-defined; the customizer offers the equivalent at runtime).
- Wiring REST / STOMP providers — this demo is mock-only by design.
- E2E tests (the existing demo apps don't ship Playwright suites; a follow-up doc PR can add one).
- Adding the app to Turbo's root `pipeline` / `outputs` configuration beyond what other demo apps already inherit.

## 17. Risks & mitigations

| Risk | Mitigation |
|------|-----------|
| SharedWorker fails in some browsers / private contexts | The demo runs without the DataServices grid in those contexts but should fail soft, not hard-crash. Wrap `createDataServicesClient` in a try/catch and render an inline message in `DataServicesGridPanel` instead of the grid when the services bundle fails to build. |
| dock-manager CSS load order overrides token colours | Import order in `globals.css`: design-system stylesheet first, then `@widgetstools/react-dock-manager/styles.css`, then Tailwind directives. Test in both themes. |
| Switching dataType while a tick is mid-flight | The `useEffect` cleanup calls `handle.stop()` synchronously; the new effect starts the new provider on the next tick. No coalescing needed — a single stale row would arrive at most. |
| `key={gridId}` remount drops in-memory column state | That's intended — column defs change with dataType. Profile persistence makes this lossless. |

## 18. Post-implementation checklist (per CLAUDE.md §"Post-implementation")

1. Update `docs/IMPLEMENTED_FEATURES.md` with one entry under today's date describing the new app.
2. `npx turbo typecheck build test` passes from monorepo root.
3. No e2e changes required.
4. Commit prefix: `feat(apps): add mockdata-provider-starui-app …`.
5. Commit trailer line:
   `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`
