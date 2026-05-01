# MarketsGrid vs AdapTable for AG Grid — Gap Analysis

> **Scope under review:** the `@marketsui/markets-grid` package only —
> `packages/markets-grid/src/*.tsx`/`.ts` (~25 files, ~80 KLOC including
> the `formatter/` subtree).
> **Reference doc:** [`docs/ADAPTABLE_TOOLS_DEEP_ANALYSIS.md`](./ADAPTABLE_TOOLS_DEEP_ANALYSIS.md)
> (AdapTable v22, crawled April 2026).
> **Date written:** 2026-04-30. Authored against
> `MarketsGrid.tsx` rev 2026-04-30 (the v2-handle-and-headerExtras revision).
> **Legend** — ✅ implemented · 🟡 partial · 🔵 delegated to sibling
> package · ⚪ out of scope by design · ❌ missing.

---

## 1. Executive summary

`@marketsui/markets-grid` is a *thin* React wrapper around AG Grid
Enterprise. The package's job, end-to-end, is:

1. Boot AG Grid with `AllEnterpriseModule` registered
   (`MarketsGrid.tsx:14` + `MarketsGrid.tsx:73-76`),
2. Mount a `GridProvider` and a `GridPlatform` (the latter from
   `@marketsui/core`) that runs a *module pipeline* over the column
   defs / grid options on every state change
   (`useGridHost.ts:34-58`),
3. Render a primary toolbar row with a saved-filter pill carousel
   (`FiltersToolbar.tsx`), a brush-toggled formatting toolbar
   (`FormattingToolbar.tsx` + the `formatter/` subtree), a profile
   selector (`ProfileSelector.tsx`), and Save / Settings / admin-action
   icon buttons (`MarketsGrid.tsx:604-755`),
4. Persist the *active profile* (via `useProfileManager` from
   `@marketsui/core`) plus an opaque "grid-level data" blob
   (`MarketsGrid.tsx:331-400`) through a pluggable `StorageAdapter`
   (factory or instance), with a beforeunload guard, save-flash
   indicator, and a dirty-aware profile-switch dialog
   (`MarketsGrid.tsx:511-578`),
5. Open a `SettingsSheet` (a Cockpit-themed popout that hosts every
   module's `ListPane`/`EditorPane` master-detail editor —
   `SettingsSheet.tsx:147-455`), backed by `HelpPanel.tsx`
   (a static cheatsheet of Excel format strings + expression syntax).

**Everything else** — the actual rule editors for conditional styling,
calculated columns, column groups, column customization, column
templates, saved filters, grid-state capture/replay, grid-options
panel, design-system tokens, profile manager, undo-redo, expression
evaluator, formatter primitives — lives in `@marketsui/core` and
sibling editor packages. The package itself is shell + toolbars +
sheet chrome; it never owns rule storage, the expression engine, the
storage adapter implementation, the design-system tokens, or any
data-plane concerns.

That sets up a particular comparison with AdapTable: AdapTable bundles
*everything* (engine, expression language, ~30 modules, persistence,
events, plugins) under one `Adaptable.init({...})` call. MarketsGrid's
analogous boundary is the consumer's bootstrap code, which composes
`@marketsui/core` modules + `@marketsui/markets-grid` shell +
`@marketsui/config-service` storage. So a fair classification needs
the **🔵 delegated to sibling** column — features that exist in the
ecosystem but specifically do *not* live in `markets-grid`.

### 1.1 Capability scorecard

Rows = the 14 AdapTable feature categories from the deep analysis.
Status applies to *what `markets-grid` itself ships*; sibling-package
delivery is called out where relevant.

| # | Category | Status | One-liner |
|---|---|---|---|
| 1 | Frameworks & install | 🟡 | React-only wrapper; AG-Grid Enterprise hard-required. No vanilla / Angular / Vue. |
| 2 | Layouts (column state, row groups, aggregations, master-detail) | 🟡 | Profile-as-layout via sibling `grid-state` + `column-customization`; no pivot UI, no weighted-avg agg, no grand-total UI, no master-detail surface. |
| 3 | UI surfaces (Settings Panel, Dashboard, Tool Panel, Status Bar, menus, theming) | 🟡 | Settings sheet ✅, two pinned toolbars ✅, theming ✅ (via design-system tokens). No dashboard, no custom tool panel API, no column-menu/context-menu extension. |
| 4 | Core features (calculated cols, alerts, action cols, charting) | 🟡 | Calculated cols 🔵 (sibling, standard only); no alerts engine, no action columns, no charting integration. |
| 5 | Searching & filtering | 🟡 | Saved-filter pills with auto-name + count + multi-pill OR/AND merge ✅; no quick search, no grid filter (AQL), no data sets, no named queries. |
| 6 | Cell rendering, formatting, visual effects | 🟡 | Cell + header style overrides (typography/colors/borders/alignment) and value formatters (currency, percent, comma, BPS, Excel-format, fixed-income tick) all ✅ in `formatter/` subtree. Conditional styling rule editor 🔵 (sibling). No styled columns (gradient/percent-bar/badge/sparkline), no flashing-cells-as-rule. |
| 7 | Editing | ❌ | No Smart Edit, Bulk Update, Plus/Minus, Shortcuts, validation, or data-change history. AG-Grid edit handlers only. |
| 8 | Annotating | ❌ | No notes, comments, free-text columns. |
| 9 | Working with grid data (export, import, sort, select, summarise, transpose, highlight) | 🟡 | Profile export/import as JSON ✅; row export only via AG-Grid CSV/Excel modules. No reports module, no data import, no transpose, no cell summary, no programmatic highlight/jump. |
| 10 | Advanced (team sharing, row forms, scheduling, no-code, FDC3, system status) | 🟡 | Profile import/export is the closest thing to team-sharing-snapshot. No active-mode sharing, no row forms, no scheduler, no no-code, no FDC3 wiring, no system status messages. Some pieces (FDC3, OpenFin) are 🔵 to platform shells. |
| 11 | Developer APIs (state lifecycle, permissions, row models, columns, support) | 🟡 | Imperative `MarketsGridHandle` (`gridApi`/`platform`/`profiles`) ✅; pluggable `StorageAdapter` ✅; CSRM only — no SSRM/Viewport bridges. No permissioning. No state-migrations helper. |
| 12 | AdapTable Query Language (AQL) | ❌ | No domestic expression language inside `markets-grid`. There is an "expression engine" referenced in sibling docs (`useExpressionPolicy`, `valueFormatterFromTemplate`'s expression branch in `formatter/state.ts:51`); it is per-row JS-string evaluation only — no AST, no aggregation, no observables, no server-evaluation seam. |
| 13 | FinTech integrations | 🔵 | OpenFin / interop.io belong to `openfin-platform*` siblings; `markets-grid` only consumes `isOpenFin()` for popout-frame chrome (`SettingsSheet.tsx:172`). |
| 14 | Technical reference (options object, API, events, plugins, modules) | 🟡 | One typed prop bag (`MarketsGridProps` — `types.ts:20`); modular registration (`DEFAULT_MODULES` — `MarketsGrid.tsx:100-110`); no event catalogue, no plugin system, no entitlements. |

---

## 2. Architecture comparison

### 2.1 Wrapper relationship to AG Grid

**AdapTable.** Static factory `Adaptable.init({ adaptableOptions,
agGridConfig: { gridOptions, modules } })`. The wrapper *instantiates*
AG Grid itself, owns two side-by-side DOM containers (one for the
dashboard/UI shell, one for the AG Grid viewport), and returns an
`AdaptableApi` that exposes a sub-API per module.

**MarketsGrid.** A React component (`MarketsGrid.tsx:252-254`,
exported via `forwardRef` for typed handles) that mounts an
`<AgGridReact>` itself (`MarketsGrid.tsx:779-811`). AG Grid
Enterprise modules are registered with a process-wide guard
(`_agRegistered` — `MarketsGrid.tsx:72-77`) the first time any
`MarketsGrid` instance mounts; further instances reuse the
registration. The wrapper is *thin* — there is no parallel
container; all of MarketsGrid's chrome (toolbars, settings sheet,
header-extras slot) renders *above* the same `<div style={{ flex: 1
}}>` that AG Grid fills. ColDefs, GridOptions, sideBar, statusBar,
defaultColDef, theme, rowHeight, headerHeight, animateRows, cell
selection are all forwarded straight to AG Grid (`MarketsGrid.tsx:
780-810`).

**Implication.** Both libraries are non-destructive overlays. AdapTable
takes "instantiate AG Grid for me" off the consumer; MarketsGrid does
the same via the React component boundary, but it stops at "register
modules + render `<AgGridReact>`". Where AdapTable owns the
configuration system, expression language, event bus, permission
model, and persisted state store as one Promise-returning object,
MarketsGrid delegates those concerns to `@marketsui/core` and exposes
them via a `MarketsGridHandle` (`types.ts:226-238`).

### 2.2 Config object vs. props

**AdapTable.** One large `AdaptableOptions` literal split into option
groups (`editOptions`, `filterOptions`, `expressionOptions`,
`alertOptions`, `chartingOptions`, `dashboardOptions`,
`stateOptions`, `entitlementOptions`, etc. — Section 14.1 of the deep
analysis). Plus a separate `initialState` literal containing all
state-bearing module objects. Plus `plugins: [...]`.

**MarketsGrid.** One typed prop bag (`MarketsGridProps` in
`types.ts:20-193`). Surface area:

- *Identity:* `gridId`, `instanceId`, `appId`, `userId`, `rowIdField`.
- *Data:* `rowData`, `columnDefs`.
- *AG Grid passthroughs:* `theme`, `sideBar`, `statusBar`,
  `defaultColDef`, `rowHeight`, `headerHeight`, `animateRows`.
- *Toolbar visibility flags:* `showToolbar`, `showFiltersToolbar`,
  `showFormattingToolbar`, `showSaveButton`, `showSettingsButton`,
  `showProfileSelector`.
- *Module list:* `modules?: AnyModule[]` (defaults to `DEFAULT_MODULES`
  in `MarketsGrid.tsx:100-110`).
- *Storage:* `storage?: StorageAdapterFactory`,
  `storageAdapter?: StorageAdapter`, `autoSaveDebounceMs?`,
  `gridLevelData`, `onGridLevelDataLoad`.
- *Lifecycle:* `onGridReady`, `onReady(handle)`.
- *Slots:* `adminActions`, `headerExtras`.

There is *no* `initialState` concept and *no* `options` super-object.
The user's saved state lives entirely inside the active *profile*
(opaque to the host), and "options-like" knobs are surfaced through
sibling modules' settings panels rather than through props. Compared
with AdapTable, the prop surface is dramatically narrower — and that's
deliberate: MarketsGrid pushes feature configuration into the runtime
UI (Settings Sheet) rather than design-time props.

### 2.3 State management

**AdapTable.** Redux-backed JSON store. Three lifecycle phases:
design-time `initialState` → `loadState()` first load → `loadState()`
subsequent. Default = local storage. Production = developer-supplied
`loadState`/`persistState` scoped by `adaptableId × userName ×
adaptableStateKey`. Migration helper for major-version bumps.

**MarketsGrid.** No global Redux store at the markets-grid layer.
Persistence is profile-shaped:

- The `useProfileManager` hook
  (imported from `@marketsui/core` — `MarketsGrid.tsx:38, 408-412`,
  configured with `disableAutoSave: true`) owns active profile id,
  profile list, dirty flag, and CRUD ops (create / load / delete /
  clone / rename / export / import).
- A `StorageAdapter` (sibling type from `@marketsui/core` —
  `types.ts:1-3`) is the persistence seam. The wrapper has *zero*
  knowledge of where rows land — `MemoryAdapter` for tests/demos
  (`MarketsGrid.tsx:331`), `DexieAdapter` for browser persistence
  (referenced in code comments), `createConfigServiceStorage()` for
  `(appId, userId, instanceId)` scoping when running inside the
  MarketsUI ConfigService.
- A *required-companion assertion* throws at mount time if `storage`
  is supplied without both `appId` and `userId`
  (`MarketsGrid.tsx:193-200`) — addresses the "rows mixed across
  users" failure mode.
- Each save explicitly captures AG-Grid's native column state via
  `captureGridStateInto(platform.store, api)` before flushing
  (`MarketsGrid.tsx:494-497`). Auto-save was deliberately removed —
  every change a user makes is held as dirty in-memory, then either
  saved (`handleSaveAll` → `profiles.saveActiveProfile()`) or
  discarded (`profiles.discardActiveProfile()`). A `beforeunload`
  warning fires while dirty (`MarketsGrid.tsx:517-526`).

**Sibling responsibility.** Module state inside the active profile is
managed by `@marketsui/core`'s module pipeline. Each registered
module owns a slice (`conditional-styling`, `column-customization`,
`column-templates`, `calculated-columns`, `column-groups`,
`saved-filters`, `toolbar-visibility`, `grid-state`,
`general-settings`). Modules expose `useModuleState<T>(moduleId)`
hooks (`FiltersToolbar.tsx:78`, `formattingToolbarHooks.ts:169`)
that mirror AdapTable's per-module state segmentation but are
managed by `@marketsui/core`'s store rather than duplicated here.

**Gap vs. AdapTable.**
- No equivalent of `BeforeAdaptableStateChanges` /
  `AdaptableStateChanged` /`AdaptableStateReloaded` event triple.
  Profiles dispatch through the manager's hook surface, but there is
  no public state-event bus and no enumeration of action names.
- No `SuspendableObject`-style suspend/un-suspend across all object
  types. Profiles can be cloned but not suspended.
- No `applyState` interceptor / `AdaptableUpgradeHelper`.
  Profile-import accepts a JSON payload (`MarketsGrid.tsx:694-703`)
  but version migration is the consumer's responsibility.

### 2.4 Expression / query engine

**AdapTable.** AQL, a domestic query language with parser,
six expression categories (Standard / Aggregation / Cumulative /
Quantile / Observable / Relative Change), shared function library
(SUM/AVG/MIN/MAX/PERCENTAGE; ANY_CHANGE/PERCENT_CHANGE/
ABSOLUTE_CHANGE; ROW_CHANGE/GRID_CHANGE; QUERY/VAR/IF/CASE/FIELD;
QUANT/CUMUL with WHERE/OVER/GROUP_BY/WEIGHT modifiers).
Predicates as a separate, simpler concept. Server-evaluation seam
(`evaluateAdaptableQLExternally` + AST hand-off via
`GridFilterApplied`/`ColumnFilterApplied`/`CalculatedColumnChanged`).
Expression Editor (text) and Query Builder (control) UIs.

**MarketsGrid.** The package owns *no* expression engine. Two
adjacent things exist in the ecosystem but neither rises to AQL:

1. `valueFormatterFromTemplate(vft)` in `@marketsui/core` (used at
   `formatter/state.ts:370` for the preview swatch). Consumes a
   `ValueFormatterTemplate` discriminated union of `kind: 'preset' |
   'expression' | 'tick' | 'excelFormat'`. The `expression` branch
   evaluates a per-row JavaScript string (gated by a CSP policy —
   `formatterPresets.ts:54-56` notes that BPS falls back to
   `kind: 'expression'` because there's no preset). This is *value
   formatting only*, not row-filtering, not aggregation, not
   observable.
2. The conditional-styling rule editor (in `@marketsui/core`'s
   `conditional-styling` module — referenced via
   `conditionalStylingModule` at `MarketsGrid.tsx:31`). Rules are
   per-row JS expressions. Single category. No predicates, no
   AST-handoff, no functions library equivalent.

**Result.** The expression engine is the largest single architectural
gap. Calculated Columns, Conditional Styling, value formatters all
use *JS-string-eval-with-CSP-gate* in their separate ways; nothing
unifies them, nothing offers cross-row evaluation, nothing offers
server-side translation.

### 2.5 UI surfaces — mapping

| AdapTable surface | MarketsGrid equivalent | Notes |
|---|---|---|
| Settings Panel | `SettingsSheet.tsx` | Single popout (`Poppable` from core, OS-window-detached on OpenFin). One section per registered module's `ListPane`/`EditorPane` master-detail UI (`SettingsSheet.tsx:147-455`). Help cheatsheet replaces wizards (`HelpPanel.tsx`). |
| Dashboard | `MarketsGrid.tsx:604-755` primary row | Fixed layout: filter pills → brush toggle → profile selector → save → settings → admin actions. *Not user-configurable.* No tabs. No custom toolbars beyond the `headerExtras` slot (`types.ts:181-192`) which exists for the data-provider picker, hidden by default behind an Alt+Shift+P chord. |
| Tool Panel | AG Grid's `sideBar` prop, forwarded as-is (`MarketsGrid.tsx:798`). | No AdapTable-side custom tool panels, no module tool panels, no buttons. |
| Status Bar | AG Grid's `statusBar` prop, forwarded as-is (`MarketsGrid.tsx:799`). | Same story. |
| Column menu | AG Grid default. | No customization API. |
| Context menu | AG Grid default. | No customization API. |
| Theming | Cockpit CSS injected once per document via `ensureCockpitStyles()` (`MarketsGrid.tsx:84-91`). Tokens come from `@marketsui/design-system` (per CLAUDE.md the platform's standard). Light/dark from `data-theme` on `<html>`. | 🔵 — design-system is a sibling package. |

The popouts (`SettingsSheet` and `FormattingToolbar`) both use a
shared `Poppable` primitive from core (`SettingsSheet.tsx:11-12,
492-509`, `FormattingToolbar.tsx:23-103`) that handles inline ↔
detached-OS-window switching with frameless OpenFin chrome support.

### 2.6 Data architecture

**AdapTable.** Supports CSRM, SSRM, Viewport, with sharply different
feature parity per row model (Section 15.6 of the deep analysis).
Dedicated bridge functions `getAdaptableFilterState()` /
`getAdaptableSortState()` for SSRM. Native handling of ticking via
`CellChanged` event with `trigger ∈ {user, background, revert}`.
First-class flashing/relative-change/observable alert types.

**MarketsGrid.** **CSRM only**, by behaviour. The
`<AgGridReact rowData={rowData}>` prop binding (`MarketsGrid.tsx:787`)
is plain CSRM. There is no SSRM datasource wiring, no viewport
datasource, no `getAdaptableFilterState` analogue. SSRM works only
insofar as the consumer provides their own `gridOptions.datasource`
through a sibling module's transform — but none of the
`DEFAULT_MODULES` (`MarketsGrid.tsx:100-110`) configures SSRM.

Ticking is supported as a *consumer responsibility*: the v2 data-plane
package (`@marketsui/data-plane` per the IMPLEMENTED_FEATURES
inventory) feeds row updates via AG Grid `applyTransaction` calls;
`headerExtras` is the slot where the data-provider picker docks.
**There is no flashing-cell module.** AG Grid's own
`enableCellChangeFlash` and `cellFlashDuration` props are forwarded
silently if the consumer sets them on a colDef — no wrapper-level
support for predicate-driven flash, no UI to configure flash colours,
no Up/Down/Neutral palette, no "always" mode.

### 2.7 Eventing

**AdapTable.** `api.eventApi.on(name, handler)` with the eight
categories enumerated in Section 14.4 (Lifecycle, State, Data,
Selection, UI, Features, Integration). `CellChanged` and
`AlertFired` are the two highest-value events for a trading desk.

**MarketsGrid.** No package-level event bus. The `MarketsGridHandle`
exposes `gridApi` (raw AG Grid `GridApi`), `platform` (the
`GridPlatform` from `@marketsui/core` with its own `eventBus`), and
`profiles` (the manager hook) — the consumer subscribes through those.
`onReady(handle)` and `onGridReady(event)` props (`types.ts:140,
73`) are the only callback hooks; both fire once.

The package internally consumes some AG Grid events:
- `FiltersToolbar.tsx:138-141` — `rowDataUpdated`, `modelUpdated`,
  `firstDataRendered`, `filterChanged` for pill counts and the +
  button enablement.
- `formattingToolbarHooks.ts:124-130` — `cellFocused`, `cellClicked`,
  `cellSelectionChanged` for active-column tracking.
- `formatter/state.ts:188-200` — `columnEverythingChanged`,
  `displayedColumnsChanged`, `firstDataRendered` for picker data
  type.

These are wired through `@marketsui/core`'s `ApiHub` (`platform.api.on`
/ `platform.api.onReady`) — that's the closest thing to an event bus,
but it's an internal implementation detail rather than a documented
public surface.

### 2.8 Permissioning

**AdapTable.** Three access levels per Module (Full / ReadOnly /
Hidden) with `defaultAccessLevel`. Object-level overrides. Explicitly
*UI-only* — backend authorisation is the application's responsibility.

**MarketsGrid.** No permissioning whatsoever in-package. `adminActions`
visibility is consumer-controlled (`types.ts:248-260`); the consumer
filters by role before constructing the array. Profile-level
read-only / hidden flags do not exist. There is no module-level access
gate (every registered module renders its sheet section
unconditionally — `SettingsSheet.tsx:104-107`).

### 2.9 FDC3 / FinTech

**AdapTable.** Declarative `gridDataContextMapping` plus FDC3 Action
Columns and Context Menu Items. Plugin-driven OpenFin / interop.io /
ipushpull / Connectifi integration with auto-bridging.

**MarketsGrid.** No FDC3 surface. No notifications. No Excel-bidirec.
The package's only OpenFin coupling is `isOpenFin()` for popout
chrome (`SettingsSheet.tsx:172`) and `Poppable`'s `frame: false`
flag (`SettingsSheet.tsx:508`, `FormattingToolbar.tsx:74`). Real
OpenFin work is fully delegated to `@marketsui/openfin-platform*`
sibling packages.

---

## 3. Feature-by-feature gap analysis

### 3.1 Frameworks & install

**AdapTable.** Vanilla / TypeScript core; React (18 & 19), Angular
(18-21), Vue 3 adapters. Uniform 9-step integration model.
`Adaptable.init({...}).then(...)`. License key, primary key,
adaptableId, adaptableStateKey, userName, adaptableContext.

**MarketsGrid.**
- React-only (`peerDependencies` in `package.json` pin React >= 19,
  AG Grid >= 35).
- Hard requirement on AG Grid Enterprise (`AllEnterpriseModule`
  registered unconditionally — `MarketsGrid.tsx:14, 75`).
- Identity model: `gridId` (mandatory), `instanceId` (defaults to
  `gridId`), `appId`, `userId`, `rowIdField` (defaults to `'id'`,
  composite keys via array — `types.ts:36-38`). No
  `adaptableStateKey` analogue beyond the implicit
  `(appId, userId, instanceId)` triple in
  `createConfigServiceStorage`.
- No license-key concept — open-source consumption.

| Subfeature | Status | Effort | Notes |
|---|---|---|---|
| React 19 wrapper | ✅ | — | `MarketsGrid.tsx` |
| React 18 compat | ✅ | — | Peer dep is `>= 19.0.0` but `forwardRef`-based, should work on 18. |
| Vanilla TS | ❌ | XL | Would require rewriting the toolbar/sheet/popouts as framework-agnostic — equivalent to a near-total rewrite. |
| Angular adapter | ❌ | XL | Sibling `@marketsui/angular` exists but does not mirror MarketsGrid. |
| Vue adapter | ❌ | XL | Same. |
| `Adaptable.init`-style async constructor | ⚪ | — | Not idiomatic React. Replaced by `<MarketsGrid ref={...} onReady={...}>`. |
| License key | ⚪ | — | Not commercial. |
| Primary key (mandatory) | 🟡 | S | `rowIdField` is honoured but optional (default `'id'`). AdapTable refuses to start without one because Notes/Comments require it; MarketsGrid would need to enforce when those features arrive. |
| `adaptableContext` pass-through | 🟡 | S | `MarketsGridHandle` exposes platform/api/profiles, but no opaque developer-context pass-through into events. |
| AG Grid module wiring (selective vs all-enterprise) | 🟡 | S | Hard-coded `AllEnterpriseModule`. AdapTable allows per-feature module subset; MarketsGrid does not — bundle-size optimization is impossible for consumers. |
| `AdaptableReady` event | 🟡 | XS | `onReady(handle)` exists; not named or typed identically. |
| Container slots (`alertContainer`, `modalContainer`, `transposedViewContainer`) | ⚪ | — | Settings sheet uses `Poppable`'s OS-window mode; no other modals exist. |

### 3.2 Layouts

**AdapTable.** "Layout" is the central abstraction for a saved
view: TableColumns, ColumnVisibility, ColumnSizing, ColumnPinning,
ColumnSorts, ColumnHeaders, ColumnFilters, GridFilter,
RowGroupedColumns, TableAggregationColumns, RowSummaries,
RowGroupValues, AutoSizeColumns. Pivot Layouts are a separate kind.
At least one Layout is mandatory.

**MarketsGrid.** Closest analogue is the *active profile*. A profile
is opaque to the package (`MarketsGrid.tsx:494-499` just calls
`captureGridStateInto(platform.store, api)` then
`profiles.saveActiveProfile()`); the actual layout-shaped fields
live in sibling modules:

- `column-customization` 🔵 — visibility, sizing, pinning, header
  overrides, cell/header style overrides, value formatters, borders.
- `grid-state` 🔵 — AG Grid's native column-order/sort/filter/
  pagination/selection captured via
  `captureGridStateInto(...)` (`MarketsGrid.tsx:495`). Replays last so
  it sees the finalized columns from every other module
  (`MarketsGrid.tsx:99-100` comment).
- `column-groups` 🔵 — nestable group editor.
- `calculated-columns` 🔵 — per-row JS expressions (no
  aggregation/cumulative/quantile).
- `column-templates` 🔵 — reusable cell-style bundles, applied via
  `templateIds` on the assignment (`formatter/state.ts:174`).
- `saved-filters` 🔵 — opaque AG Grid filter models.
- `toolbar-visibility` 🔵 — pill-row collapse state
  (`FiltersToolbar.tsx:64-74`).
- `general-settings` 🔵 — grid-level options panel.

Profile switching: when the user picks a different profile from
`ProfileSelector` while dirty, an `AlertDialog` offers Save / Discard
/ Cancel (`MarketsGrid.tsx:533-578, 825-863`). When clean, the load
goes through directly.

| Subfeature | Status | Effort | Notes |
|---|---|---|---|
| Saved view per profile | ✅ | — | Profile is the unit of save. |
| Column order / visibility / sizing / pinning / sorting | 🔵 | — | All in sibling `column-customization` + `grid-state`. |
| Friendly column headers | 🔵 | — | `column-customization` `headerName` override. |
| Per-column filters persisted on layout | 🔵 | — | `saved-filters` module. |
| Cross-grid filter on layout (Grid Filter / AQL) | ❌ | XL | Needs an expression engine first (12). |
| Row groups | 🟡 (AG-Grid native) | M | Group columns stay set by AG Grid; group config isn't promoted to a first-class profile field — a profile re-apply that doesn't capture them via `grid-state` would lose them. Validation needed. |
| Pivot mode | 🟡 (AG-Grid native) | XL | AG Grid Enterprise provides pivot; no UI to author pivot configs, no `PivotLayout` analogue, no Pivot Wizard. |
| Layout aggregations (per column) | 🟡 (AG-Grid native) | M | AG Grid `aggFunc` works; no UI in MarketsGrid to author. |
| Weighted-Average aggregation (built-in) | ❌ | M | AdapTable's `weightedAverage` agg type is unique and high-value for FI desks (YTM weighted by notional, etc.). |
| `Only` aggregation | ❌ | S | Returns value if all rows agree, else blank. |
| Grand Total Row (top/bottom) | ❌ | M | AG Grid pinned-bottom-rows can do this; no MarketsGrid surface. |
| `SuppressAggFuncInHeader` per layout | 🔵 | XS | Pass-through via grid-options module. |
| Row summaries (pinned aggregation rows) | ❌ | M | |
| RowGroupValues (expand/collapse memory) | 🟡 | M | Captured by `grid-state` snapshot; not validated or first-class. |
| Master-Detail | ❌ | L | AG Grid Enterprise provides; no MarketsGrid integration. AdapTable nests independent AdapTable instances; equivalent here would be a `<MarketsGrid>` per detail row, which isn't wired. |
| Tree Data | 🟡 | M | AG Grid native; no UI surface; needs validation that profile capture/replay round-trips correctly. |
| Layout extending via Object Tags | ❌ | M | Profile is monolithic — no shared "this profile references these calculated columns" tag system. Cloning is the closest thing. |
| Multiple layouts per grid | ✅ | — | Multiple profiles per grid. |
| Default layout | 🟡 | S | `RESERVED_DEFAULT_PROFILE_ID` exists (`ProfileSelector.tsx:3`); semantics differ from "default for this user/role". |
| Layout sync across windows | 🟡 | M | `Poppable` popouts share the same module store via portal/context (settings sheet, formatting toolbar). Cross-window/grid-instance sync (e.g. broadcast changes to other open grids) is not provided. |

### 3.3 UI surfaces

**AdapTable.** Four primary surfaces (Settings Panel, Dashboard, Tool
Panel, Status Bar), plus Column Menu, Context Menu, Popups, Action
Columns. Five Dashboard modes. Three status panel locations.

**MarketsGrid.**

| Surface | Where | Status |
|---|---|---|
| Settings Panel | `SettingsSheet.tsx` (~530 LOC) | ✅ — popout-capable, master-detail per module. |
| Dashboard | `MarketsGrid.tsx:604-755` | 🟡 — fixed layout, no tabs, no user customization. |
| Tool Panel | AG Grid `sideBar` passthrough | 🔵 — AG Grid native only. |
| Status Bar | AG Grid `statusBar` passthrough | 🔵 — AG Grid native only. |
| Column menu | AG Grid default | ❌ — no customization API. |
| Context menu | AG Grid default | ❌ — no customization API. |
| Popups (Forms, Toasts, Wizards) | `Poppable` 🔵 (settings + formatting); no toasts; no wizards. | 🟡 — the settings sheet's master-detail editor stands in for AdapTable's wizards but isn't multi-step-formed. |
| Theming + CSS variables | `ensureCockpitStyles()` (`MarketsGrid.tsx:84-91`) injects `cockpitCSS` from `@marketsui/core`. Light/dark via `data-theme` per CLAUDE.md. | 🔵 — design-system tokens come from `@marketsui/design-system`. |
| Toast notifications | ❌ — no notification primitive. Errors fall back to `window.alert(...)` (`MarketsGrid.tsx:666, 691, 701`). | ❌ |
| Wizards | ❌ — no multi-step form pattern. | ❌ |
| Loading screen / progress indicators | ❌ — `suppressNoRowsOverlay: true` (`MarketsGrid.tsx:805`) deliberately suppresses AG Grid's overlay; consumer owns its own loading state. | ❌ |

| Subfeature | Status | Effort | Notes |
|---|---|---|---|
| Settings Panel (modal/window) | ✅ | — | `Poppable` handles inline ↔ OS-window. |
| One section per state-bearing module | ✅ | — | `SettingsSheet.tsx:104-107` filters `panelModules` by presence of `SettingsPanel` or `ListPane`+`EditorPane`. |
| Custom Settings panels (developer-injected) | ❌ | M | No public API to register a custom panel module from outside `markets-grid`. |
| Settings Panel `alwaysShowInDashboard` / `alwaysShowInToolPanel` | ⚪ | — | Only one dashboard surface; flag has no analogue. |
| Documentation links per panel | 🟡 | XS | `HelpPanel.tsx` is one global cheatsheet, not per-section. |
| Dashboard modes (Default / Inline / Collapsed / Floating / Hidden) | ❌ | M | The pill-row collapse state is the closest thing — single boolean per `toolbar-visibility` module, not five-mode. |
| Dashboard tabs grouping toolbars | ❌ | L | |
| Dashboard custom toolbars (developer content) | 🟡 | XS | `headerExtras` slot (`types.ts:181-192`) is a single-render-tree slot, not a registry. |
| Dashboard buttons (module shortcuts + custom) | 🟡 | XS | `adminActions` (`types.ts:247-261`) renders right-aligned; not a "module shortcut" system. |
| Quick search input on dashboard | ❌ | M | (See 3.5.) |
| Tool Panel — Module Tool Panels | ❌ | L | AG Grid sideBar is opaque to MarketsGrid; no per-module tool panel registration. |
| Tool Panel — Custom Tool Panels | 🟡 | M | Consumer can pass `sideBar={...}` AG-Grid-native; no MarketsGrid registration API. |
| Status Bar — Module Status Panels | ❌ | L | Same story as Tool Panel. |
| Column menu customization | ❌ | M | |
| Context menu customization | ❌ | M | |
| Theming | ✅ | — | Cockpit CSS + `@marketsui/design-system` tokens. |
| Light/dark support | ✅ | — | Per CLAUDE.md, `[data-theme="dark"]` flips tokens. |
| OS-following mode | 🟡 | S | Not in markets-grid; relies on `prefers-color-scheme` if the host wires it. |
| Custom themes (UserThemes) | 🔵 | — | Design-system handles. |
| Toast notifications | ❌ | M | Needed for an Alerts engine. |
| Wizards (multi-step forms) | ❌ | M | |
| Custom-colour palettes | 🔵 | — | Design-system. |
| American-English locale toggles | ⚪ | — | Not currently relevant. |

### 3.4 Core features

#### 3.4.1 Calculated columns

**AdapTable.** Four expression types: Standard / Aggregated /
Cumulative / Quantile. Configuration per column: `Query`,
`CalculatedColumnSettings.{DataType, Filterable, Groupable, Sortable,
Pivotable, Aggregatable}`. Aggregated/Cumulative/Quantile do *not*
work on SSRM. Calculated cols can reference each other; first-class in
charts/alerts/exports/pivots. AG Grid `valueCache` recommended.
External evaluation via `evaluateAdaptableQLExternally`.

**MarketsGrid.**
- Standard calculated columns 🔵 — `calculatedColumnsModule` from
  core (`MarketsGrid.tsx:28, 104`). Per-row JS expression in a
  `VirtualColumnDef` (referenced in
  `packages/core/src/modules/calculated-columns/index.ts:208`).
  No aggregation/cumulative/quantile types.
- No external-evaluation seam (no AST hand-off).
- Whether they participate in charts/exports/pivots depends on
  `@marketsui/core`'s implementation; markets-grid does not constrain.

| Subfeature | Status | Effort | Notes |
|---|---|---|---|
| Standard calculated cols | 🔵 ✅ | — | `calculatedColumnsModule`. |
| Aggregated (`SUM/AVG/MIN/MAX/PERCENTAGE` with `GROUP_BY`) | ❌ | L | Needs AQL-like expression engine. ~3-4 weeks. |
| Cumulative (`CUMUL(SUM([col]), OVER([sortCol]))`) | ❌ | L | Running totals — high value for P&L. |
| Quantile (`QUANT([col], N, GROUP_BY([cat]))`) | ❌ | M | |
| Calculated cols reference other calculated cols | 🟡 | S | Expression engine reads any `colId`; circular detection unverified. Worth auditing. |
| `Filterable / Groupable / Sortable / Pivotable / Aggregatable` per column | 🟡 | S | Settings exist conceptually in `column-customization`; the per-calculated-column flag set may not be 1:1. |
| `valueCache` recommendation | 🔵 | XS | AG Grid native, consumer toggles via `gridOptions`. |
| External evaluation hook | ❌ | XL | Requires AST + serialization layer — see (12). |

#### 3.4.2 Alerts

**AdapTable.** Six alert types (Data Change, Relative Change, Row
Change, Aggregation, Observable, Validation), four MessageType
levels, six behaviours (toast, highlight, jump, log, prevent edit,
custom render). `AlertFired` event with detailed payload.

**MarketsGrid.** ❌ across the board.
- The `conditional-styling` module (sibling) flashes cell styles when
  the predicate matches, but that's *visual* — no notification, no
  toast, no alert log, no `AlertFired` event.
- No edit-validation flow exists at all.

| Subfeature | Status | Effort | Notes |
|---|---|---|---|
| Data Change alerts | 🟡 | M | `conditional-styling` covers visual flash; needs a separate notification surface. |
| Relative Change alerts (`PERCENT_CHANGE`, `ABSOLUTE_CHANGE`) | ❌ | L | Needs delta tracking + expression support. |
| Row Change alerts (`ROW_ADDED`, `ROW_REMOVED`) | ❌ | M | |
| Aggregation alerts (limit/breach) | ❌ | L | Needs aggregation engine. |
| Observable alerts (Rx-style, inactivity) | ❌ | XL | Needs RxJS-shaped subscription model. |
| Validation alerts (`PreventEdit`) | ❌ | L | Needs an editing-validation tier first. |
| Toast notification surface | ❌ | M | Cross-cutting need. |
| Highlight cell/row behaviour | 🟡 | S | conditional-styling can do cell-level. |
| Jump-to-cell behaviour | ❌ | S | AG Grid `ensureColumnVisible` + `ensureNodeVisible`. |
| `AlertFired` event with `AlertFiredInfo` payload | ❌ | M | Requires building the events bus first. |
| Alert toolbar / tool panel / status bar | ❌ | L | |

#### 3.4.3 Action columns

**AdapTable.** Special columns hosting buttons. Built-in commands
(create/clone/edit/delete) auto-wired into Row Forms. Per-button
label/icon/onClick/disabled/hidden as value-or-function.

**MarketsGrid.** ❌. AG Grid's `cellRenderer` can deliver buttons, but
there is no MarketsGrid-level abstraction, no Row Form to wire them
into, no edit/clone/delete commands.

| Subfeature | Status | Effort | Notes |
|---|---|---|---|
| Action column type | ❌ | M | Needs design + a settings panel to author. |
| Built-in `create / clone / edit / delete` commands | ❌ | L | Depends on Row Forms. |
| Multi-button rows | ❌ | S | After base. |
| `ActionColumnContext` (rowData/rowNode/primaryKeyValue/api) | ❌ | XS | After base. |

#### 3.4.4 Charting

**AdapTable.** AG Grid Integrated Charts wrapper + persistence.
External chart libraries supported. `saveChartBehaviour` (auto/
manual/none). Cross-filter is partial (grid → chart only).

**MarketsGrid.** ❌. AG Grid Enterprise's Integrated Charts ships
because of `AllEnterpriseModule`, so the user *can* trigger them via
range-charting, but MarketsGrid does not persist the chart, host it
in a custom container, or expose any charting API.

| Subfeature | Status | Effort | Notes |
|---|---|---|---|
| Integrated chart launch | 🔵 ✅ | — | AG Grid native via Enterprise modules. |
| Chart persistence (auto / manual) | ❌ | M | |
| External chart hosting | ❌ | M | |
| Cross-filter chart→grid | ❌ | L | Partial in AdapTable too. |

### 3.5 Searching & filtering

**AdapTable.** Quick Search (with as-filter mode), Column Filters
(Forms + Bar; AND/OR; In; system; custom), Grid Filter (AQL,
column-to-column), Data Sets + Forms, Named Queries.

**MarketsGrid.** The `FiltersToolbar` (`FiltersToolbar.tsx`) is the
package's signature feature — a *saved-filter pill carousel* with
unique behaviour:

- Pills capture only the *delta* over currently-active pills
  (`subtractFilterModel` — `filtersToolbarLogic.ts:333-354`) so
  toggling pill A off doesn't leave pill B silently enforcing A's
  criterion.
- Per-pill row counts compute by walking `forEachNode` and running
  the saved model row-by-row through a hand-rolled
  `doesValueMatchFilter` (mirrors AG Grid's set/text/number filter
  semantics — `filtersToolbarLogic.ts:57-120`). Recomputes on
  `rowDataUpdated` / `modelUpdated` / `firstDataRendered`
  (`FiltersToolbar.tsx:138-141`). **Date filters are not implemented**
  (`filtersToolbarLogic.ts:117-119` falls through to match-all).
- Multiple active pills merge with column-level OR + cross-column AND
  (`mergeFilterModels` — `filtersToolbarLogic.ts:196-259`).
- The "+" button enables only when the live AG Grid filter model is
  *genuinely new* — `isNewFilter` rejects echoes of the merged-active
  shape and rejects re-entering a previously-deactivated pill
  (`filtersToolbarLogic.ts:288-309`). Strong guard against accidental
  duplication.
- Auto-naming via `generateLabel` (`filtersToolbarLogic.ts:35-49`):
  one-key models become `${col}: ${value}`, two-key become
  `${col1} + ${col2}`, more become `${col1} + N more`.
- Pill row collapses into a summary chip with active-count
  (`FiltersToolbar.tsx:325-352`).

| Subfeature | Status | Effort | Notes |
|---|---|---|---|
| Quick Search | ❌ | M | AG Grid's `quickFilterText` API exists; no UI surface, no highlight-match style, no as-filter mode toggle. |
| Quick Search highlight | ❌ | S | After base. |
| Quick Search as-filter mode | ❌ | XS | After base. |
| Column Filters via AG Grid floating-filter UI | ✅ | — | AG Grid passthrough. |
| AdapTable-style Filter Form (multi-predicate AND/OR) | ❌ | L | AG Grid's Filter API is single-predicate per col by default; AG Grid's "advanced filter" exists in Enterprise but isn't surfaced. |
| AdapTable-style Filter Bar | ❌ | M | AG Grid floating filters are MarketsGrid's substitute — the existing GAP analysis notes this is *strictly better* (you can use AG Grid's native filter components). |
| In Filter (multi-value picker) | ✅ | — | AG Grid set filter. |
| Saved filters as pills | ✅ | — | `FiltersToolbar`. |
| Multi-pill OR/AND merge | ✅ | — | `mergeFilterModels`. |
| Date filter row-match | ❌ | S | `filtersToolbarLogic.ts:117-119`. Currently falls through to match-all. |
| System Predicates (`Today`, `Blanks`, `Between`, etc.) | ⚪ | — | Different paradigm; AG Grid's filter operators serve. |
| Custom Predicates | ❌ | M | Predicates as a first-class concept don't exist. |
| Grid Filter (single AQL expression for whole grid) | ❌ | XL | Needs expression engine. |
| Column-to-column comparison filter | ❌ | XL | Needs expression engine. |
| Query Builder UI | ❌ | XL | Needs expression engine + control-driven authoring UI. |
| Expression Editor UI (text + autocomplete + validation) | 🟡 | M | A Monaco-based ExpressionEditor exists in core (per IMPLEMENTED_FEATURES §1.6); needs to be exposed for filter authoring. |
| Data Sets (multiple swappable client-side data sources) | ❌ | L | High-value for "narrow before fetch" trading desks. Needs a `DataSetSelected` event + form prompt. |
| Data Set Forms (parameterised selection) | ❌ | M | After Data Sets. |
| Named Queries | ❌ | M | `saved-filters` module is the closest, but scoped to AG Grid filter models, not full AQL. |

### 3.6 Cell rendering, formatting, visual effects

This is the package's strongest area. The `formatter/` subtree (~1066
LOC across 8 files) is the in-grid + popped-out toolbar that drives
typography, paint (text/background/borders), value formatters
(currency / percent / thousands / decimals± / fixed-income tick /
custom Excel format strings), and template save/load.

**Format Columns (style + display format).**

| Subfeature | Status | Effort | Notes |
|---|---|---|---|
| Cell style: ForeColor | ✅ | — | `setTextColor` (`formatter/state.ts:237`). |
| Cell style: BackColor | ✅ | — | `setBgColor` (`formatter/state.ts:241`). |
| Cell style: BorderColor / width / style per side | ✅ | — | `applyBordersMap` (`formatter/state.ts:309-352`); 4-side independent control. |
| Cell style: FontWeight (bold) | ✅ | — | `toggleBold`. |
| Cell style: FontStyle (italic) | ✅ | — | `toggleItalic`. |
| Underline | ✅ | — | `toggleUnderline` (AdapTable doesn't break this out as a separate prop; close enough). |
| FontSize | ✅ | — | `setFontSizePx` (presets at `ModuleType.tsx:16`). |
| Alignment | ✅ | — | `toggleAlign('left'|'center'|'right')`. |
| Header style overrides | ✅ | — | `target = 'header'` switches typography/colour/borders into `headerStyleOverrides`. Format module disables itself for header (`formatter/state.ts:50, 143`). |
| Numeric display format | ✅ | — | Currency (USD/EUR/GBP/JPY), percent, comma, decimals±, BPS, plus a `FormatterPicker` for full Excel-format strings (`ModuleFormat.tsx:14`). |
| String display format | 🟡 | S | Excel-format strings cover `@`, `Mr. @`, etc., but no dedicated string-format module/UI. |
| Date display format (Unicode patterns) | 🟡 | M | The picker accepts Excel date formats; `pickerDataType` recognises date/datetime. AG Grid handles rendering when no format set. |
| Template format type | 🟡 | M | `ValueFormatterTemplate.kind` includes `'preset' | 'expression' | 'tick' | 'excelFormat'` — the `template` kind that AdapTable surfaces (parameterised template strings) isn't a direct match. |
| Custom (developer formatter) | ⚪ | — | AG Grid `cellRenderer` / `valueFormatter` on colDef remains available; consumer plugs in their own. |
| Adaptable Style supplier hook (dynamic styles per cell) | ❌ | M | Conditional Styling rules are predicate-driven; there's no per-cell dynamic style callback API. |
| Fixed-income tick format (32nd / 64th / 128th / 256th / 32+) | ✅ | — | `TICK_MENU` + `BPS_TEMPLATE` (`formatterPresets.ts:104-127`, `ModuleFormat.tsx:29-39`). **Strictly better than AdapTable** for FI desks. |
| Save current style as named template | ✅ | — | `saveAsTemplate` → `snapshotTemplate` (`formatter/state.ts:253-264`). |
| Template manager UI | ✅ | — | `TemplateManager.tsx` — single component used in compact (popover) and panel (popped) variants. Two-step delete confirm. |
| Apply template via dropdown | ✅ | — | `applyTemplate` (`formatter/state.ts:249`). |
| Type defaults (dataType → default style) | ✅ | — | `resolveTemplates(a, tplState, dataType)` (`formattingToolbarHooks.ts:185`). Numeric cols inherit a right-align default. |
| Undo/redo formatter actions | ✅ | — | `useUndoRedo` with limit 50 (`formatter/state.ts:153-157`). |

**Conditional styling.**

| Subfeature | Status | Effort | Notes |
|---|---|---|---|
| Predicate-based conditional styling | 🔵 ✅ | — | `conditionalStylingModule` from core (`MarketsGrid.tsx:31`). Per-row JS expression. |
| Expression-based conditional styling (AND/OR multi-column) | 🟡 🔵 | L | Single-expression rules exist; full AQL multi-row is missing — see (12). |
| Real-time evaluation as data updates | 🔵 ✅ | — | Re-evaluates on AG Grid data updates. |

**Styled columns.**

| Subfeature | Status | Effort | Notes |
|---|---|---|---|
| Gradient column | ❌ | M | |
| Percent Bar column | ❌ | M | |
| Badge column (predicate-driven, optional icon) | ❌ | M | |
| Sparkline column | 🔵 ✅ | — | AG Grid Enterprise sparkline. No MarketsGrid configuration UI. |

**Flashing cells / rows.**

| Subfeature | Status | Effort | Notes |
|---|---|---|---|
| Predicate / expression-driven flash rule | ❌ | L | High value for ticking grids. Needs a `flashing-cells` module + expression engine for the rule. |
| Up / Down / Neutral change styles | ❌ | S | After rule engine. |
| Duration (ms) or `always` | 🔵 | XS | AG Grid native `cellFlashDuration` exists. |
| Cell vs row target | ❌ | M | |
| Format precedence (Flash > Quick Search > Format Column) | ❌ | M | |

### 3.7 Editing

**AdapTable.** Four primary modules (Smart Edit, Bulk Update, Plus
Minus, Shortcuts), three validation tiers (pre-edit / client / server),
Data Change History, four cell editors.

**MarketsGrid.** ❌ across the board. AG Grid's native editing is
forwarded; nothing wraps it.

| Subfeature | Status | Effort | Notes |
|---|---|---|---|
| Smart Edit (one-op-many-cells) | ❌ | M | High-value for traders setting bid/ask deltas across selection. |
| Custom smart-edit operations | ❌ | S | After base. |
| Bulk Update (replace many cells with one value) with preview | ❌ | M | |
| Plus/Minus key-driven increments | ❌ | M | |
| Shortcuts (single-key multipliers) | ❌ | M | |
| Custom edit values per column | ❌ | S | |
| Editable cell styling | 🟡 | S | `formatter/` can style based on column type; no "in-edit" indicator. |
| Pre-edit validation (`isCellEditable`) | 🔵 | XS | AG Grid native colDef.editable. |
| Client validation (Validation Alerts with `PreventEdit`) | ❌ | L | Depends on Alerts engine. |
| Server validation (`validateOnServer`) | ❌ | M | Returns allow/disallow/override. |
| Data Change History (timestamp + source) | ❌ | L | Needs a per-grid event log + UI. Modes Off/Active/Suspended/Inactive. |
| Per-row Undo buttons (data-change history) | ❌ | M | After Data Change History. |
| Numeric cell editor (auto-active for numeric) | 🔵 | XS | AG Grid. |
| Date Picker cell editor | 🔵 | XS | AG Grid. |
| Select dropdown cell editor | 🔵 | XS | AG Grid. |
| Percentage cell editor | ❌ | S | |

### 3.8 Annotating

**AdapTable.** Notes (cell-level personal annotations stored in state),
Comments (threaded, multi-author, persisted via developer callbacks),
Free Text Columns (user-editable cols whose values live in AdapTable
state).

**MarketsGrid.** ❌ across the board. None of these exist; there is no
per-cell or per-row state slice for annotations, no commenting layer,
no Free Text column type. All three require a real Primary Key —
which `rowIdField` already provides — but the module side is absent.

| Subfeature | Status | Effort | Notes |
|---|---|---|---|
| Notes (per-cell, single-author, in state) | ❌ | M | New module. Needs PK enforcement. |
| Comments (threaded, multi-author, persisted) | ❌ | L | New module + persistence callback shape. |
| Free Text Columns | ❌ | M | New module + colDef registration. |

### 3.9 Working with grid data

#### 3.9.1 Reports & exports

**AdapTable.** Three-step model (report / format / destination).
System reports + custom reports (AQL-filtered). Excel / Visual Excel /
CSV / JSON formats. Download / Clipboard / Custom destinations.
Scheduling. Server-side processing.

**MarketsGrid.**
- Profile export (per-profile JSON download — `MarketsGrid.tsx:669-693`)
  and import (`MarketsGrid.tsx:694-703`) work end-to-end. **This is a
  configuration export, not a data export.**
- Data export 🔵 — AG Grid Enterprise's `csvExport` /
  `excelExport` modules ship with `AllEnterpriseModule`; consumers
  trigger via `gridApi.exportDataAsCsv()` / `exportDataAsExcel()`.
  No MarketsGrid-level Reports module, no UI to author a report,
  no scheduling.

| Subfeature | Status | Effort | Notes |
|---|---|---|---|
| System reports (all data / visible rows / selected cells) | 🔵 | S | AG Grid params; needs MarketsGrid wrapper for terminology. |
| Custom reports (AQL filter + column subset) | ❌ | XL | Needs expression engine. |
| Excel format (plain) | 🔵 | — | AG Grid Enterprise. |
| Visual Excel (with formatting/styles) | 🟡 | M | AG Grid Enterprise can preserve some styles via styling map; not first-class in MarketsGrid. |
| CSV | 🔵 | — | AG Grid. |
| JSON | 🟡 | S | Profile export covers config; no data-as-JSON export. |
| Download destination | 🔵 | — | AG Grid. |
| Clipboard destination | 🔵 | — | AG Grid copy. |
| Custom destination (developer endpoint) | ❌ | M | |
| Schedule reports | ❌ | L | Depends on a scheduler module — see (10.3). |
| Server-side processing | ❌ | L | |

#### 3.9.2 Importing

**AdapTable.** JSON / CSV / paste-from-text. Three modes (update /
add / replace). Auto-matches headers to colId then friendlyName.
`validate(...)` callback returns errors.

**MarketsGrid.**
- Profile JSON import works (`MarketsGrid.tsx:694-703`).
- Data import — ❌. No CSV/JSON paste-into-grid module, no header
  mapping prompt, no validation pipeline.

| Subfeature | Status | Effort | Notes |
|---|---|---|---|
| Profile JSON import | ✅ | — | |
| Grid data CSV import | ❌ | M | |
| Grid data JSON import | ❌ | M | |
| Paste-from-text import | ❌ | M | |
| Header mapping wizard | ❌ | L | |
| `validate(...)` business-rules callback | ❌ | M | |

#### 3.9.3 Sorting / Selecting / Summarising / Transposing / Highlighting

| Subfeature | Status | Effort | Notes |
|---|---|---|---|
| Custom sort comparers | 🔵 | — | AG Grid colDef.comparator. |
| Custom sort with Column Scope | ❌ | M | Needs Scope abstraction. |
| Programmatic select via Grid API | 🔵 | — | AG Grid via `MarketsGridHandle.gridApi`. |
| `SelectionChanged` event with detailed payload | 🔵 | — | AG Grid event passthrough. |
| Checkbox selection | 🔵 | — | AG Grid native. |
| RowSelection on Layout (mode/checkboxes) | 🟡 | S | Captured by `grid-state` snapshot but not authored via UI. |
| Cell Summaries (per-selection stats) | ❌ | M | AG Grid status panel `agAggregationComponent` covers basics; no MarketsGrid surface. |
| Row Summaries (pinned aggregation rows per layout) | ❌ | M | |
| Transposing | ❌ | L | New view. |
| Highlight & jump (programmatic visual focus) | 🔵 | XS | AG Grid `flashCells` + `ensureColumnVisible`. |

### 3.10 Advanced

#### 3.10.1 Team sharing

**AdapTable.** Snapshot mode + Active mode (live linkage).
Referenced sharing (auto-bundles dependencies). UUID matching.
Multiple teams via per-team storage keys.

**MarketsGrid.** Closest analogue is **profile import/export** —
manual snapshot share via JSON download/upload. No active mode, no
referenced sharing, no UUID matching, no team segmentation.

| Subfeature | Status | Effort | Notes |
|---|---|---|---|
| Snapshot sharing (manual JSON copy) | ✅ | — | Profile export/import. |
| Active sharing (live linkage) | ❌ | XL | Requires bidirectional sync, conflict resolution. |
| Referenced sharing (dependency-bundling) | ❌ | M | A profile is monolithic — auto-bundling dependencies isn't a concept here. |
| UUID matching | 🟡 | S | Profile ids are slug-based; no UUID-on-import handling. |
| Multiple-teams via storage keys | 🟡 | S | `(appId, userId, instanceId)` triple covers some of this — extending to a "team" axis would be M. |
| `loadSharedEntities` / `persistSharedEntities` callbacks | ❌ | M | Depends on a separate sharing layer. |

#### 3.10.2 Row forms

**AdapTable.** Four types (Create / Clone / Edit / Delete-as-event).
Adaptive controls per data type. Read-only cols display values.
Triggered via Row Form API or Action Column Commands.

**MarketsGrid.** ❌. No row form module. Action columns and the form
generator both absent.

| Subfeature | Status | Effort | Notes |
|---|---|---|---|
| Create row form | ❌ | L | |
| Clone row form | ❌ | M | After Create. |
| Edit row form | ❌ | M | After Create. |
| Delete row form (event) | ❌ | S | |
| Auto-handle vs manual buttons | ❌ | S | |

#### 3.10.3 Schedules & reminders

**AdapTable.** Reminders + Reports schedulable. Day-of-week or
one-off-date schedules.

**MarketsGrid.** ❌. No scheduler.

| Subfeature | Status | Effort | Notes |
|---|---|---|---|
| Time-based scheduler module | ❌ | L | |
| Reminder schedules | ❌ | M | After scheduler. |
| Report schedules | ❌ | M | After scheduler + Reports. |

#### 3.10.4 No-Code

**AdapTable.** `nocode()` plugin. Upload JSON/Excel and dynamically
configure a grid. Subset of options. Not in Angular.

**MarketsGrid.** ❌. The Settings Sheet is the closest no-code path
(every module is configurable through its UI), but there is no
JSON/Excel upload + auto-grid path. ⚪ — likely out of scope given
the platform's design-time ColDef construction pattern.

#### 3.10.5 FDC3

**AdapTable.** Declarative `gridDataContextMapping` + FDC3 Action
Columns + FDC3 Context Menu items. 14 contexts, intents, custom
contexts. Plugin-bridged on OpenFin / interop.io / Connectifi.

**MarketsGrid.** 🔵 — FDC3 belongs to `@marketsui/openfin-platform*`.
The package only consumes `isOpenFin()` for popout chrome.

| Subfeature | Status | Effort | Notes |
|---|---|---|---|
| `gridDataContextMapping` (col → FDC3 context) | ❌ | L | Could land in a `fdc3` module on top of `column-customization`. |
| FDC3 Action Columns | ❌ | L | Depends on Action Columns. |
| FDC3 Context Menu items | ❌ | M | Depends on Context Menu customization. |
| Broadcast on action click | 🔵 | M | OpenFin platform handles bus. |
| Listen for incoming intents | 🔵 | M | Same. |
| `FDC3Message` event | ❌ | S | After eventing model. |

#### 3.10.6 System status messages

**AdapTable.** API-driven runtime notifications. Settings Panel
section + dedicated toolbar/tool panel/dashboard module button/
status bar/toast/custom div surfaces. Session-scoped.

**MarketsGrid.** ❌. No notification primitive at all (errors land in
`window.alert` per `MarketsGrid.tsx:666, 691, 701`).

### 3.11 Developer APIs

#### 3.11.1 State lifecycle

| Subfeature | Status | Effort | Notes |
|---|---|---|---|
| Initial state (design-time) | 🟡 | S | No `initialState` prop; the implicit default profile is the initial state. |
| `loadState` / `persistState` callbacks | ✅ | — | `StorageAdapter.loadProfile / saveProfile / listProfiles / loadGridLevelData / saveGridLevelData`. |
| Default = browser local storage | ✅ | — | `MemoryAdapter` is the default fallback (`MarketsGrid.tsx:331`); `DexieAdapter` is the documented production choice. |
| Remote = developer-supplied | ✅ | — | `createConfigServiceStorage()` per IMPLEMENTED_FEATURES §1.N. |
| `BeforeAdaptableStateChanges` event | ❌ | M | |
| `AdaptableStateChanged` event with action names | ❌ | L | Requires a typed action enum. |
| `AdaptableStateReloaded` event | ❌ | S | |
| `SuspendableObject` (suspend/un-suspend per module object) | ❌ | M | |
| Migrations (`autoMigrateState` + `AdaptableUpgradeHelper`) | ❌ | M | Profile JSON has no version field today; first migration would also need a versioning bump. |
| `applyState` interceptor | ❌ | S | |

#### 3.11.2 Permissions

| Subfeature | Status | Effort | Notes |
|---|---|---|---|
| Module-level Full / ReadOnly / Hidden | ❌ | M | The `adminActions` `visible` flag (`types.ts:260`) is consumer-controlled; module-level UI gating doesn't exist. |
| Object-level overrides (per Layout, per Calculated Column, …) | ❌ | L | |
| `defaultAccessLevel` global | ❌ | S | After module-level. |

#### 3.11.3 Handling grid data

| Subfeature | Status | Effort | Notes |
|---|---|---|---|
| `loadGridData` / `addGridData` / `updateGridData` / `deleteGridData` / `setCellValue` | 🔵 | XS | AG Grid native; consumer uses `gridApi` directly via `MarketsGridHandle`. |
| Transaction grouping | 🔵 | — | AG Grid `applyTransactionAsync` / batched. |
| `RowChanged` event (only on AdapTable Grid API) | ⚪ | — | Different paradigm. |
| `CellChanged` event with `trigger` (user/background/revert) | ❌ | M | AG Grid's `cellValueChanged` exists; no MarketsGrid wrapping or trigger-disambiguation. |

#### 3.11.4 Server-Side / Viewport row models

**MarketsGrid is CSRM-only by behaviour.** No `getAdaptableFilterState`
analogue, no `getAdaptableSortState`, no SSRM datasource scaffolding.

| Subfeature | Status | Effort | Notes |
|---|---|---|---|
| SSRM support | ❌ | XL | Consumer can wire `gridOptions.datasource` themselves; nothing in MarketsGrid translates filters/sorts into the spec. |
| Viewport support | ❌ | XL | Same. |
| `getAdaptableFilterState` analogue | ❌ | L | Saved-filter pills could be exposed as a state object readable by an SSRM datasource. |
| `getAdaptableSortState` analogue | ❌ | M | |

#### 3.11.5 Managing columns

| Subfeature | Status | Effort | Notes |
|---|---|---|---|
| Adaptable Column object per AG Grid column | 🔵 ✅ | — | `column-customization` module's assignments. |
| Column Types (developer-defined buckets like `'price'`) | ❌ | M | No analogue. The module-pipeline's transforms run per-column but don't expose a developer taxonomy. |
| AG Grid Cell Data Types | 🔵 | — | Standard AG Grid colDef. |
| Managing ColDefs at runtime | 🔵 ✅ | — | The `useGridHost` pipeline re-runs on every state change (`useGridHost.ts:48-58`). |
| Hiding columns | 🔵 | — | `column-customization`. |
| Column Headers customization | 🔵 | — | `column-customization`. |
| Array Columns (sparkline) | 🔵 | — | AG Grid native. |
| Column Scope (`{ All / ColumnIds / DataTypes / ColumnTypes }`) | ❌ | M | Cross-cutting; needed by Alerts, Custom Sorts, Validation, Plus/Minus, Shortcuts, Reports, Flashing. Single highest-leverage missing abstraction after AQL. |

#### 3.11.6 Configuring AG Grid through MarketsGrid

The pipeline (`platform.transformGridOptions({})` —
`useGridHost.ts:54-58`) is the seam: every registered module can mutate
the grid options object. Hosts spread `{...gridOptions}` first
(`MarketsGrid.tsx:785`) so explicit host props win on conflict — the
opposite of AdapTable's "AdapTable owns the grid" model.

#### 3.11.7 Hotkeys

| Subfeature | Status | Effort | Notes |
|---|---|---|---|
| In-built hotkey manager | ❌ | S | AdapTable doesn't ship one either; both rely on consumer. |
| Save / Discard / Cmd+Enter to close sheet | ✅ | — | `SettingsSheet.tsx:139-145` (Escape closes; Cmd/Ctrl+Enter closes). The sheet's footer (`SettingsSheet.tsx:464-466`) advertises ⌘S = SAVE CARD, ⌘⏎ = SAVE ALL, ⌫ = DELETE, ESC = CLOSE — the actual save-card binding lives in module editors (sibling), not at this layer. |
| Alt+Shift+P data-provider chord | 🟡 | XS | Not bound *inside* `markets-grid` — the host (`MarketsGridContainer`) handles it. The `headerExtras` slot is the rendering target. |

#### 3.11.8 Support, logging, profiling, testing

| Subfeature | Status | Effort | Notes |
|---|---|---|---|
| Logging hooks | 🟡 | XS | Several `console.log`/`console.warn` calls scattered through the package (e.g. `MarketsGrid.tsx:167-168, 363-364, 397, 437, 496, 559, 574`). Not configurable. |
| Profiling (Chrome DevTools custom tracks) | ❌ | M | |
| Testing utilities | 🟡 | — | Test file present (`FormattingToolbar.test.tsx` 552 LOC, `filtersToolbarLogic.test.ts` 530 LOC) — solid coverage of the saved-filter logic and formatter actions. No published test-utility module. |
| Monitoring (state + data + behaviour visibility) | ❌ | L | |
| Performance (recommendation set) | ❌ | XS | Documentation gap. |

### 3.12 AQL — expression engine

The single largest architectural gap. Not in `markets-grid`, not
adequately in `@marketsui/core` either.

| Subfeature | Status | Effort | Notes |
|---|---|---|---|
| Standard expressions (per-row) | 🟡 🔵 | — | Per-row JS string eval gated by CSP policy (`formatterPresets.ts:54-56`). Used by `valueFormatterFromTemplate` and conditional-styling. Not parsed to an AST, not analysed, not validated beyond "did it throw?". |
| Aggregation expressions (multi-row) | ❌ | XL | |
| Cumulative expressions (multi-row in order) | ❌ | XL | |
| Quantile expressions (multi-row, bucketed) | ❌ | XL | |
| Observable expressions (Rx) | ❌ | XL | |
| Relative-change expressions | ❌ | L | |
| Standard function library (`STARTS_WITH`, `MIN`, `MAX`, etc.) | ❌ | M | |
| Aggregation function library (`SUM`, `AVG(WEIGHT())`, …) | ❌ | M | |
| Relative-change function library (`ANY_CHANGE`, `PERCENT_CHANGE`, …) | ❌ | M | |
| Observable function library (`ROW_CHANGE`, `GRID_CHANGE`, modifiers) | ❌ | L | |
| Advanced functions (`QUERY`, `VAR`, `IF/CASE`, `FIELD`) | ❌ | M | |
| Custom expression functions (developer-registered) | ❌ | M | |
| Predicates (separate, simpler concept) | ❌ | M | |
| Custom Predicates | ❌ | M | After base. |
| Query Builder UI (control-driven boolean) | ❌ | XL | |
| Expression Editor UI (text + autocomplete + validation) | 🟡 🔵 | M | A Monaco-based editor exists in core (per IMPLEMENTED_FEATURES §1.6); needs hooking into the engine. |
| Server evaluation seam (`evaluateAdaptableQLExternally`) | ❌ | XL | Requires AST + serialisation. |
| AST hand-off via events | ❌ | L | |

### 3.13 FinTech integrations

All 🔵 — handled by sibling packages. Specifically:

| Integration | Where | Status |
|---|---|---|
| OpenFin | `@marketsui/openfin-platform`, `@marketsui/openfin-platform-stern` | 🔵 |
| OpenFin Live Reports / Excel | Not present in inventory | ❌ |
| OpenFin Notifications (alert bridge) | Not present in inventory | ❌ |
| FDC3 | `@marketsui/openfin-platform*` | 🔵 |
| interop.io | Not present in inventory | ❌ |
| ipushpull | Not present in inventory | ❌ |
| `isOpenFin()` chrome detection | `@marketsui/core` (consumed at `SettingsSheet.tsx:172`) | ✅ |

### 3.14 Technical reference

**AdaptableOptions analogue.** The single typed `MarketsGridProps`
(`types.ts:20-193`) plus the `DEFAULT_MODULES` constant
(`MarketsGrid.tsx:100-110`). No nested `editOptions`/`alertOptions`/
`expressionOptions`/`teamSharingOptions`/`fdc3Options` blocks because
those features don't exist.

**API surface.** `MarketsGridHandle` (`types.ts:226-238`):
`{ gridApi, platform, profiles }`. No sub-API per feature; AG Grid's
api covers data, columns, sort, filter, export, selection;
`platform.api` is the internal ApiHub; `profiles` exposes profile CRUD.

**Events catalogue.** The package re-exposes nothing except
`onGridReady` and `onReady`. No `AdaptableStateChanged`, no
`AlertFired`, no `LayoutChanged`, no `CalculatedColumnChanged`. AG
Grid events bubble through `gridApi`.

**Plugins.** No plugin API. The closest analogue is the `modules`
prop (`types.ts:28`) — but that's a *settings panel* module list,
not a feature-bundling plugin system. There's no equivalent of
`adaptable-plugin-openfin` / `adaptable-plugin-master-detail`.

**Modules.** Per `DEFAULT_MODULES`: 9 default modules, all in
`@marketsui/core`. AdapTable ships ~30 (Section 14.6). Coverage at a
glance:

| AdapTable module bucket | MarketsGrid coverage |
|---|---|
| Layout, Format Column, Styled Column, Calculated Column, FreeText Column | column-customization 🟡; column-templates ✅; calculated-columns 🔵 (standard only); FreeText ❌; Styled ❌ |
| Quick Search, Column Filters, Grid Filter, Custom Sort | Quick Search ❌; Column Filters via AG-Grid 🔵; Grid Filter ❌; Custom Sort ❌ |
| Smart Edit, Bulk Update, Plus Minus, Shortcuts | All ❌ |
| Alerts, Flashing Cells | All ❌ |
| Notes, Comments | All ❌ |
| Export, Data Import, Data Set, Data Change History | All ❌ (data export 🔵 via AG Grid) |
| Charts, Named Query, Schedule, Team Sharing | All ❌ (charts 🔵 via AG Grid Enterprise) |
| Dashboard, Settings Panel, Tool Panel, Status Bar, Theme | Settings ✅; Theme ✅; others 🟡 |
| Column Info, Grid Info, System Status, State Management, FDC3 | State Management ✅ via profiles; others ❌ |

---

## 4. Prioritised gap closure recommendations

Ordered by *value-per-effort* for a banking trading-desk grid product.

1. **Flashing Cells module** (predicate-driven up/down/neutral)
   - **Why it matters:** trading-desk grids tick. AG Grid's
     `enableCellChangeFlash` is binary; users want
     "flash green for asks crossing through", "always-on watch on
     tenor 30Y", custom durations, row-level flashes. This is the #1
     missing visual feature.
   - **Effort:** L — needs a `flashing-cells` module slice + a
     predicate evaluator + four CSS animation states +
     Format-Column-precedence integration.
   - **Dependencies:** Column Scope abstraction; an interim
     predicate engine (subset of AQL — equality / `change` /
     `percentChange` literals only).
   - **First slice:** "always-on flash on numeric cells whose value
     differs from the previous tick", with a single colour palette
     (up = green, down = red, default duration 500ms). No UI, just
     a `flashingRules` slice on the assignment plus AG Grid event
     wiring. Adds <500 LOC.

2. **Conditional Styling — Expression edition**
   - **Why it matters:** the `conditional-styling` module today is
     predicate-only. A trading-desk product needs `[bid] > [ask]`,
     `[notional] > [limit] AND [tenor] = '10Y'`, etc.
   - **Effort:** M — the Monaco-based Expression Editor is already
     in core (per IMPLEMENTED_FEATURES §1.6); needs a small AST
     layer, AND/OR composition, and per-row eval routed through
     the existing module's predicate evaluator.
   - **Dependencies:** Expression Editor (have); nascent AST that
     can serialise AND/OR trees; column-reference resolver.
   - **First slice:** allow a single `[col] OP value` expression as
     the predicate; broaden in later slices.

3. **Calculated Columns — Aggregated + Cumulative + Quantile**
   - **Why it matters:** P&L roll-ups (`SUM`), portfolio averages
     (`AVG(WEIGHT())`), running totals, percentile buckets. These
     are core fixed-income / equity-derivative analytics. AdapTable
     leans on them; competitors (e.g. Inforalgo grids) have them.
   - **Effort:** L — needs the function library landed in (12), a
     re-evaluation hook on `rowDataUpdated`, and a `groupBy` /
     `over` / `weight` modifier syntax in the expression engine.
   - **Dependencies:** AQL (12). Takes ~3 weeks once the AST is in.
   - **First slice:** ship `SUM([col])` and `AVG([col])` agg-only,
     CSRM-only, no GROUP_BY. Walk before the rest.

4. **Data Change History + per-row Undo**
   - **Why it matters:** desk audit requirement. "Show me every
     change to this trade in the last 5 minutes" + per-row revert.
   - **Effort:** L — needs an event-sourced log keyed by primary
     key, modes (Off/Active/Suspended/Inactive), per-row UI
     buttons, and a side-panel viewer.
   - **Dependencies:** `CellChanged` event with disambiguated
     trigger (user/background/revert); persistence for the log
     (could land in profile or in a new top-level slice).
   - **First slice:** in-memory ring buffer keyed by PK + a tiny
     status-bar widget showing change count for the focused cell.
     Persistence + undo come in slice 2.

5. **Alerts engine — Data Change + Relative Change**
   - **Why it matters:** "tell me when bid crosses 100" /
     "notify on >5% spread move" — pre-trade risk.
   - **Effort:** L for the engine + UI; M for the toast surface
     (which is reusable for system status messages).
   - **Dependencies:** Expression engine subset for predicates;
     toast notification primitive (build once, reuse for
     System Status); `AlertFired` event with detailed payload.
   - **First slice:** Data Change alerts only, single MessageType
     (Warning), one behaviour (toast). Add other types later.

6. **Smart Edit — multiplicative across selection**
   - **Why it matters:** "shift every BUY price by +0.25" applied
     to a multi-row selection in one operation.
   - **Effort:** M — needs a popover anchored to the selection
     (existing `Poppable` primitive can host) + the four built-in
     ops + `setCellValue` calls per node.
   - **Dependencies:** none (leverages AG Grid's `cellSelection`
     already on by default — `MarketsGrid.tsx:797`).
   - **First slice:** hard-code multiply / add only, single column;
     fan out later.

7. **Quick Search**
   - **Why it matters:** every trader tries Ctrl+F. AG Grid's
     `quickFilterText` is one prop wrapped in a 30-line component —
     adding the highlight + as-filter mode toggle is the bulk of
     the work.
   - **Effort:** M — the input goes in the right edge of the
     primary toolbar (above the brush button); highlight uses CSS
     `mark` styling on the rendered cell text.
   - **Dependencies:** none.
   - **First slice:** AG Grid's quickFilterText path + a Cmd+F
     binding. Highlight + as-filter come later.

8. **Cell Summaries (status-bar selection stats)**
   - **Why it matters:** when traders highlight a range of bids,
     they want sum / avg / min / max in the status bar without
     opening another panel.
   - **Effort:** M — AG Grid's `agAggregationComponent` is most of
     this; need a MarketsGrid-side configuration UI + the
     "weighted" agg type.
   - **Dependencies:** Weighted Average aggregation (3.2).
   - **First slice:** plain SUM/AVG/MIN/MAX/COUNT (no weighted)
     wired via `<MarketsGrid statusBar={...}>` defaults.

9. **Reports module (System reports first)**
   - **Why it matters:** "give me a CSV of visible rows" without
     code. AG Grid Enterprise has the export capability; the gap
     is the *report definition* (what columns + what rule).
   - **Effort:** L — once Custom Reports get an expression filter,
     this is high value; System Reports alone are M.
   - **Dependencies:** Custom Reports need AQL; System Reports
     don't.
   - **First slice:** System Reports only — a tiny menu in the
     toolbar (export visible / export selected) wrapping
     `gridApi.exportDataAsCsv`. ~150 LOC.

10. **Layout / Profile schema versioning + migrations**
    - **Why it matters:** today's profiles are unversioned JSON;
      first time the data shape changes, every shipped profile
      breaks. AdapTable's `autoMigrateState` is a paved path here.
    - **Effort:** S — add a `version: number` to the profile JSON
      shape, an `applyMigrations(profile, fromV, toV)` helper, and
      a clear migration-on-import path.
    - **Dependencies:** none.
    - **First slice:** stamp `version: 1` on every existing profile
      at next save; add the migration helper as a no-op now;
      consumers can ship migrations later.

11. **Server-side filter state extractor (`getMarketsGridFilterState()`)**
    - **Why it matters:** even desks that stay on CSRM eventually
      need an SSRM bridge for >200k-row scenarios. Exposing the
      saved-filter pills + AG Grid filter model + sort state in a
      single serializable spec is half the SSRM story.
    - **Effort:** M — the data is already in `saved-filters` +
      AG Grid `getFilterModel` / `getColumnState`; needs a single
      typed API on `MarketsGridHandle`.
    - **Dependencies:** none.
    - **First slice:** a `getDatasourceSpec()` method on the handle
      returning `{ filters, sort, page }` for the consumer to wire
      into their own `IServerSideDatasource.getRows`.

12. **Custom column-menu + context-menu API**
    - **Why it matters:** every grid product eventually needs
      "Add to watchlist", "Open trade ticket", FDC3 broadcast.
      Today consumers can't extend either menu via MarketsGrid.
    - **Effort:** M — AG Grid exposes `getContextMenuItems` on
      gridOptions and column-menu items via colDef. A MarketsGrid
      seam that lets module authors register items + consumer
      adds via a `customMenuItems` prop closes the gap.
    - **Dependencies:** none.
    - **First slice:** consumer-level `contextMenuItems` /
      `columnMenuItems` props that compose with AG Grid's defaults.

13. **Toast notification primitive**
    - **Why it matters:** dozen-place dependency for Alerts,
      System Status, Save errors (currently `window.alert`).
    - **Effort:** S — shadcn Sonner is the conventional pick for
      the React stack; ~80 LOC of shell + a `useToast()` hook.
    - **Dependencies:** none, but unblocks (5) and System Status.
    - **First slice:** the hook + a single info/success/warn/error
      style. Consumers can already call it from `onClick`s today
      (see the `window.alert` call sites).

14. **Notes (per-cell annotations stored in profile)**
    - **Why it matters:** "Why did we mark this trade off-market?
      Because John, see Bloomberg msg 17:43" — auditability.
    - **Effort:** M — new module + ContextMenu integration ("Add
      Note") + a Notes-popover renderer.
    - **Dependencies:** Custom column/context menu (12).
    - **First slice:** notes live in `profile.notes[primaryKey][colId]`,
      author + timestamp + text only. Comments (threaded
      multi-author) come later.

15. **Action Columns (built-in `delete`/`clone`)**
    - **Why it matters:** trade-blotter UX universally has a row
      actions column. Doing it via cellRenderer today works but
      every team rewrites the buttons.
    - **Effort:** M — a new column type registered through the
      pipeline + an `onClick` prop bag (rowData, rowNode, PK,
      gridApi).
    - **Dependencies:** Row Forms come later as L; Action Columns
      can ship without them.
    - **First slice:** `delete` only, with a confirm dialog per
      click. Add `clone` once Row Forms (3.10.2) are scoped.

---

## 5. Anti-recommendations

Five AdapTable features that are **not** worth replicating in
`markets-grid`, given the platform's existing investments.

1. **AdapTable's permissioning model.** AdapTable explicitly notes
   that entitlements are *UI-only* and don't gate API access. The
   MarketsUI platform already has ConfigService + role-aware
   `adminActions` (`types.ts:247-261`) where the *consumer* decides
   visibility before constructing the array — that's the right layer
   for a banking platform that already has a backend authorisation
   tier. Re-implementing Full/ReadOnly/Hidden inside the UI buys
   nothing functional and adds 1k+ LOC of state plumbing. Keep the
   responsibility at the consumer level.

2. **AdapTable No Code.** The MarketsUI platform's design-time
   ColDef + module-pipeline architecture is *exactly the opposite* —
   columns are declared in code, then mutated via runtime UI. A
   "drop a JSON / Excel and get a grid" path violates the
   ARCHITECTURE.md layer model (data ascends from columnDefs, not
   from upload). The Settings Sheet is already the no-code surface
   for everything *configurable*; that's enough.

3. **AdapTable Dashboard's five modes (Default / Inline / Collapsed
   / Floating / Hidden) and tabs-grouping-toolbars system.** The
   primary-row layout (`MarketsGrid.tsx:604-755`) is deliberately
   fixed — it's built for the ~95% case (filter pills + brush +
   profile + save + settings). Generalising to a user-configurable
   dashboard adds significant state (tab definitions, button
   placement, mode persistence) for marginal benefit. The
   `headerExtras` slot (`types.ts:181-192`) already covers the one
   place a custom toolbar belongs (the data-provider picker).
   Don't ship the full dashboard system.

4. **AdapTable's plugin system + ipushpull / interop.io / OpenFin
   plugins.** OpenFin and FDC3 are owned by
   `@marketsui/openfin-platform*` shells; ipushpull and interop.io
   aren't strategic for this stack. AdapTable's plugin API is what
   they use to side-load these — but MarketsUI's monorepo + workspace
   import boundaries (per CLAUDE.md) replace it more cleanly.
   Building a plugin registry inside `markets-grid` would duplicate
   the workspace's existing mechanism.

5. **AdapTable Master Detail (independent AdapTable instances per
   detail row).** AG Grid's master/detail is forwarded through
   `gridOptions` already; a second-tier MarketsGrid-inside-MarketsGrid
   pattern creates re-entrancy bugs (the `_agRegistered` guard at
   `MarketsGrid.tsx:72-76` is process-wide; nested grids share
   profile storage ambiguously). Trading desks that need master/
   detail are better served wiring AG Grid's native detail
   `gridOptions` directly via the `defaultColDef` + custom cell
   renderer path. Don't wrap.

6. **AdapTable's Transposing view.** Niche. The trading desks this
   product targets read row-major data — bond ladders, trade
   blotters, RFQ blotters all benefit from row-major. Transposed
   views are useful for analyst-style "compare 2 funds across 30
   metrics" workflows that aren't core to the product line. Skip
   unless a specific consumer requests it.

---

*End of analysis. Source rev: `MarketsGrid.tsx` 2026-04-30,
`useGridHost.ts` 2026-04-29, `types.ts` 2026-04-29, formatter
subtree 2026-04-26, FiltersToolbar / SettingsSheet 2026-04-25.*
