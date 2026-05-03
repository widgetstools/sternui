# MarketsGrid vs AdapTable for AG Grid — Gap Analysis V2

> **Scope under review:** the `@marketsui/markets-grid` package only —
> `packages/markets-grid/src/*.tsx`/`.ts` (~25 files, ~8.2 KLOC including
> the `formatter/` subtree).
> **Reference doc:** [`docs/ADAPTABLE_TOOLS_DEEP_ANALYSIS.md`](./ADAPTABLE_TOOLS_DEEP_ANALYSIS.md)
> (AdapTable v22, crawled April 2026).
> **Date written:** 2026-04-30. Authored against
> `MarketsGrid.tsx` rev 2026-04-30 plus the new `openfinViewProfile.ts`,
> revised `formatter/state.ts`, `Formatter.tsx`, `FormattingToolbar.tsx`,
> and `useGridHost.ts`.
> **Predecessor:** [`MARKETS_GRID_VS_ADAPTABLE_GAP.md`](./MARKETS_GRID_VS_ADAPTABLE_GAP.md)
> (V1 — kept as the historical record). This is a fresh re-baseline,
> not a patch.
> **Legend** — ✅ implemented · 🟡 partial · 🔵 delegated to sibling
> package · ⚪ out of scope by design · ❌ missing.

---

## 0. What changed since V1

V1 was authored on the previous revision of `MarketsGrid.tsx` /
`formatter/state.ts` / `formatter/Formatter.tsx`. The toolbar refactor
that landed since then renamed the component graph, added one new
top-level file, and shifted several line ranges that V1 cited.

### 0.1 New files

- **`openfinViewProfile.ts`** (NEW, 57 LOC). Per-view active-profile
  pointer source for OpenFin. Implements core's `ActiveIdSource`
  interface against `fin.me.{getOptions,updateOptions}` so duplicated
  views show different profiles of the *same* MarketsGrid instance.
  Returns `null` outside OpenFin (browser, Electron, tests) so the
  manager falls back to localStorage. Both `read()` and `write()`
  swallow errors — described as best-effort, never blocking
  ProfileManager boot or commit. Wired on `MarketsGrid.tsx:417` via
  `useRef(createOpenFinViewProfileSource())` and threaded into
  `useProfileManager(... { activeIdSource })` at `MarketsGrid.tsx:418-423`.
  This is the most material new artifact in the package — it changes
  the persistence story for OpenFin hosts (see §2.3).

### 0.2 Renames + refactors that invalidate V1 line citations

V1 referenced `FormattingPropertiesPanel.tsx` as a separate component;
that file is gone. The split is now:

- `FormattingToolbar.tsx` (118 LOC) — thin shell that hosts the
  `Poppable` and dispatches between the horizontal in-grid surface
  and the vertical popped-panel surface.
- `formatter/Formatter.tsx` (194 LOC) — exports both
  `FormatterToolbar` (horizontal) *and* `FormatterPanel` (vertical)
  as pure render functions consuming the unified `useFormatter()`
  state.
- `formatter/state.ts` (477 LOC) — single hook returning
  `{ state, actions }` pair consumed by every module.
- `formatter/modules/Module{Clear,Context,Format,Library,Paint,Type}.tsx`
  — six pure module components rendered identically in both
  surfaces.

Concretely:

| V1 citation | Current location |
|---|---|
| `MarketsGrid.tsx:604-755` (toolbar row) | `MarketsGrid.tsx:595-787` (HEADER + primary row + pinned formatting toolbar). Functional shape similar; admin-action cluster, dirty-aware Save, and pinned formatting toolbar all live here. |
| `MarketsGrid.tsx:494-499` (`captureGridStateInto` + `saveActiveProfile`) | `MarketsGrid.tsx:499-518`. |
| `MarketsGrid.tsx:331-400` (gridLevelData read/write) | `MarketsGrid.tsx:332-402`. |
| `MarketsGrid.tsx:511-578` (profile-switch dialog) | `MarketsGrid.tsx:541-587` + dialog JSX at `MarketsGrid.tsx:843-881`. |
| `MarketsGrid.tsx:84-91` (`ensureCockpitStyles`) | `MarketsGrid.tsx:86-93`. |
| `MarketsGrid.tsx:99-100` (DEFAULT_MODULES comment) | `MarketsGrid.tsx:96-112`. |
| `useGridHost.ts:34-58` | `useGridHost.ts:38-58` (now augmented with an INITIAL_ONLY_GRID_OPTIONS skiplist at lines 19-35). |
| `formatter/state.ts:51` (expression formatter ref) | Now in `formatter/state.ts:54`; ResolvedFormatting moved into `formattingToolbarHooks.ts:147-166`. |
| `FormattingPropertiesPanel.tsx:*` | Removed. Equivalent JSX now in `formatter/Formatter.tsx:156-194` (`FormatterPanel`). |

### 0.3 Net new behaviour landed since V1

- **Per-view active-profile override (OpenFin).** §2.3.
- **`Clear selected` destructive action.** New on `formatter/state.ts:131-133`
  (action), `formatter/state.ts:309-313` (reducer call), with an
  AlertDialog at `formatter/Formatter.tsx:72-113`, exposed in both
  surfaces by `formatter/modules/ModuleClear.tsx`. V1 only had
  `Clear all`. ↑ partial → fully shipped.
- **Inline column-caption rename.** `setHeaderName` action +
  `InlineColumnLabel` editor (`formatter/modules/ModuleContext.tsx:25-98`)
  let single-column scope rename the displayed header inline. V1
  classified header rename as 🔵 (sibling-only); now ↑ ✅ in-package.
- **Editable lock toggle.** New `cellsEditable` state +
  `toggleEditable` action (`formatter/state.ts:99, 142, 320-324`),
  surfaced as the lock-pill in the Context module.
- **`PopoverCompat` everywhere.** The formatter modules switched from
  raw Radix to `PopoverCompat` (a sibling abstraction) for menu surfaces.
  No functional shift, but every V1 ":popover-mounted" effort estimate
  is unaffected — hosting story is identical.
- **`INITIAL_ONLY_GRID_OPTIONS` set in `useGridHost`.** Mirrors AG-Grid
  warning-#22-only options so post-mount pushes don't spam the console.
  V1 didn't note this; it's a small but real piece of the
  module-pipeline contract.
- **AG-Grid `asyncTransactionWaitMillis: 100`** is now hard-coded
  (`MarketsGrid.tsx:826`) for the live-update coalescing window.
  Previously inherited AG-Grid's 60ms default.
- **`maintainColumnOrder` is hard-coded** (`MarketsGrid.tsx:804`) so
  user-drag column reorders don't reset on every column-customization
  state change. V1 didn't mention this guard.
- **Formatter component signature stability.** `useFormatter()` is
  the single state-and-actions hook. Both surfaces (toolbar + panel)
  consume the same `state`/`actions` pair, eliminating the chance of
  behavioural drift V1 flagged as a maintenance risk.

### 0.4 What did NOT close

Nothing on V1's "missing" list moved to ✅ except the `setHeaderName`
inline rename and the `Clear selected` destructive action (both
formatter-local). The big-ticket gaps — Flashing Cells, Conditional
Styling expressions, Aggregated/Cumulative/Quantile Calculated
Columns, Alerts, Smart Edit / Bulk Update, Quick Search, Reports
module, Notes/Comments, AQL/expression engine, Permissioning, FDC3
declarative wiring, SSRM bridges, Toast primitive — all still ❌ or
🟡 unchanged.

### 0.5 Status diff (only rows that moved)

| Capability | V1 | V2 | Why |
|---|---|---|---|
| Active profile id source pluggable (OpenFin per-view) | ❌ (implicit single global pointer) | ✅ | `openfinViewProfile.ts` + `activeIdSource` wiring. |
| Per-cell `Clear selected` destructive action | ❌ | ✅ | New action + reducer + dialog. |
| Inline column-caption rename (single-column scope) | 🔵 (sibling-only via SettingsSheet) | ✅ in-package | `InlineColumnLabel` in `ModuleContext.tsx`. |
| `Editable` lock toggle in formatter | ❌ | ✅ | `toggleEditable` action, `cellsEditable` state. |
| Initial-only grid-option warning suppression | (not mentioned) | ✅ | `useGridHost.ts:19-35`. |

### 0.6 Still missing as of 2026-04-30 (top callouts)

In order of pain for a trading-desk consumer today:

1. **No Flashing Cells module.** AG-Grid's `enableCellChangeFlash`
   is the only available knob; predicate-driven up/down/neutral
   flashes do not exist.
2. **No Quick Search.** Every trader still tries Ctrl+F and gets
   nothing.
3. **No Smart Edit / Bulk Update.** Cell-range editing is
   one-cell-at-a-time via AG-Grid.
4. **No Alerts engine and no Toast surface.** Errors in the package
   still fall through to `window.alert(...)` (`MarketsGrid.tsx:677,
   702, 712`).
5. **No expression engine inside the package.** Conditional Styling
   and Calculated Columns remain JS-string-eval-with-CSP-gate via
   sibling modules; no AST, no aggregation, no observables, no
   server-eval seam.
6. **No profile schema versioning.** `importProfile` accepts
   whatever JSON it's given; first time the schema changes, every
   shipped profile breaks.
7. **No Reports module.** Profile JSON export ≠ data export.
8. **No Notes / Comments / Free Text columns.**
9. **No SSRM/Viewport row-model bridges.** CSRM-only by behaviour.
10. **No customisable column-menu / context-menu.** AG-Grid defaults only.

---

## 1. Executive summary + capability scorecard

`@marketsui/markets-grid` remains a *thin* React-only wrapper around
AG Grid Enterprise. End-to-end, the package's job is:

1. Boot AG Grid with `AllEnterpriseModule` registered
   (`MarketsGrid.tsx:14, 75-79`).
2. Mount a `GridProvider` and a `GridPlatform` (the latter from
   `@marketsui/core`) that runs a *module pipeline* over the column
   defs / grid options on every state change
   (`useGridHost.ts:38-131`, particularly the option-change pusher at
   lines 99-118).
3. Render a primary toolbar row (saved-filter pills, brush toggle,
   profile selector, save, settings, admin actions) and a pinned
   formatting-toolbar row beneath it (`MarketsGrid.tsx:595-787`).
4. Persist the *active profile* (via `useProfileManager` from
   `@marketsui/core`) plus an opaque "grid-level data" blob through a
   pluggable `StorageAdapter` (factory or instance). Now with an
   *optional per-view active-profile override* via OpenFin's
   `customData` (`openfinViewProfile.ts:29-57`,
   `MarketsGrid.tsx:417-423`). Beforeunload guard, save-flash, and a
   dirty-aware profile-switch AlertDialog round it out
   (`MarketsGrid.tsx:541-587`, `843-881`).
5. Open a `SettingsSheet` (Cockpit-themed popout hosting every
   module's `ListPane`/`EditorPane`), backed by a static `HelpPanel`
   cheatsheet.

Everything else — actual rule editors for conditional styling,
calculated columns, column groups, column customization, column
templates, saved filters, grid-state capture/replay, design-system
tokens, profile manager, undo-redo, expression evaluator, formatter
primitives, `Poppable`, `BorderStyleEditor`, `FormatterPicker`,
`Tooltip`, `Select`, `AlertDialog`, `Popover` — lives in
`@marketsui/core` and sibling editor packages. The package itself is
shell + toolbars + sheet chrome + the OpenFin pointer adapter.

That sets up the same comparison V1 used: AdapTable bundles
*everything* (engine, expression language, ~30 modules, persistence,
events, plugins) under one `Adaptable.init({...})` call. MarketsGrid's
analogous boundary is the consumer's bootstrap code, which composes
`@marketsui/core` modules + `@marketsui/markets-grid` shell +
`@marketsui/config-service` storage. **🔵 delegated to sibling**
remains a real classification, not a hand-wave.

### 1.1 Capability scorecard

Rows = the 14 AdapTable feature categories from the deep analysis.
Status applies to *what `markets-grid` itself ships*; sibling-package
delivery is called out where relevant.

| # | Category | Status | One-liner |
|---|---|---|---|
| 1 | Frameworks & install | 🟡 | React-only wrapper; AG-Grid Enterprise hard-required (`AllEnterpriseModule` at `MarketsGrid.tsx:14, 77`). No vanilla / Angular / Vue. |
| 2 | Layouts (column state, row groups, aggregations, master-detail) | 🟡 | Profile-as-layout via sibling `grid-state` + `column-customization`. Per-view active-profile override now ✅ (OpenFin only). No pivot UI, no weighted-avg agg, no grand-total UI, no master-detail surface. |
| 3 | UI surfaces (Settings Panel, Dashboard, Tool Panel, Status Bar, menus, theming) | 🟡 | Settings sheet ✅, two pinned toolbars ✅, theming ✅. No dashboard, no custom tool panel API, no column-menu/context-menu extension. Pinned formatting-toolbar row replaced V1's DraggableFloat — strictly better visual stability. |
| 4 | Core features (calculated cols, alerts, action cols, charting) | 🟡 | Calculated cols 🔵 (sibling, standard only); no alerts engine, no action columns, no charting integration. |
| 5 | Searching & filtering | 🟡 | Saved-filter pills (auto-name + count + multi-pill OR/AND merge, collapse-to-summary) ✅; no quick search, no grid filter (AQL), no data sets, no named queries. |
| 6 | Cell rendering, formatting, visual effects | 🟡 | Cell + header style overrides, value formatters (currency, percent, comma, BPS, Excel-format, fixed-income tick), inline column rename, editable-lock toggle, save-as-template, decimals±, undo/redo, two-sided clear (selected/all). Conditional styling rule editor 🔵 (sibling). No styled columns (gradient/percent-bar/badge/sparkline-config), no flashing-cells-as-rule. |
| 7 | Editing | ❌ | No Smart Edit, Bulk Update, Plus/Minus, Shortcuts, validation, or data-change history. AG-Grid edit handlers only. The new `toggleEditable` controls *whether* the cell is editable, not the editing UX. |
| 8 | Annotating | ❌ | No notes, comments, free-text columns. |
| 9 | Working with grid data | 🟡 | Profile export/import ✅; data export only via AG-Grid native. No reports module, no data import, no transpose, no cell summary, no programmatic highlight/jump. |
| 10 | Advanced (team sharing, row forms, scheduling, no-code, FDC3, system status) | 🟡 | Profile import/export is the closest thing to team-sharing-snapshot. No active-mode sharing, no row forms, no scheduler, no no-code, no FDC3 wiring, no system status messages. OpenFin `customData` is a tiny new touchpoint but *only* for the active-profile pointer. |
| 11 | Developer APIs | 🟡 | Imperative `MarketsGridHandle` (`gridApi`/`platform`/`profiles`) ✅; pluggable `StorageAdapter` ✅; CSRM only — no SSRM/Viewport bridges. No permissioning. No state-migrations helper. |
| 12 | AdapTable Query Language (AQL) | ❌ | Still no domestic expression language inside `markets-grid`. The `valueFormatterFromTemplate(...)`'s expression branch (`formatter/state.ts:54`) is per-row JS-string evaluation only. |
| 13 | FinTech integrations | 🔵 | OpenFin / interop.io / FDC3 belong to `openfin-platform*` siblings; markets-grid only consumes `isOpenFin()` for popout chrome AND now `fin.me.{getOptions,updateOptions}` for the active-profile pointer source. |
| 14 | Technical reference | 🟡 | One typed prop bag (`MarketsGridProps` — `types.ts:20`); modular registration (`DEFAULT_MODULES` — `MarketsGrid.tsx:102-112`); no event catalogue, no plugin system, no entitlements. |

Net movement vs V1: category 2 ↑ (per-view override is a layout-sync
improvement), category 6 ↑ (clear-selected, inline rename,
editable-toggle), everything else unchanged.

---

## 2. Architecture comparison

### 2.1 Wrapper relationship to AG Grid

**AdapTable.** Static factory `Adaptable.init({ adaptableOptions,
agGridConfig: { gridOptions, modules } })`. The wrapper *instantiates*
AG Grid itself, owns two side-by-side DOM containers (one for the
dashboard/UI shell, one for the AG Grid viewport), and returns an
`AdaptableApi` that exposes a sub-API per module.

**MarketsGrid.** A React component (`MarketsGrid.tsx:254-256`,
exported via `forwardRef` for typed handles) that mounts an
`<AgGridReact>` itself (`MarketsGrid.tsx:790-829`). AG Grid Enterprise
modules are registered with a process-wide guard (`_agRegistered` —
`MarketsGrid.tsx:74-79`) the first time any `MarketsGrid` instance
mounts. The wrapper is *thin* — there is no parallel container; all
chrome (toolbars, settings sheet, header-extras slot) renders *above*
the same `<div style={{ flex: 1 }}>` that AG Grid fills. ColDefs,
GridOptions, sideBar, statusBar, defaultColDef, theme, rowHeight,
headerHeight, animateRows, cell selection are all forwarded straight
to AG Grid (`MarketsGrid.tsx:790-828`).

**No structural shift since V1.** The `Adaptable.init`-equivalent
boundary has not moved — `MarketsGrid` still owns AG-Grid registration
and AG-Grid's React adapter. The new `openfinViewProfile.ts` does
*not* change this — it operates one layer below, on the active-profile
pointer (see §2.3).

### 2.2 Config object vs. props

**AdapTable.** One large `AdaptableOptions` literal split into option
groups (`editOptions`, `filterOptions`, `expressionOptions`,
`alertOptions`, `chartingOptions`, `dashboardOptions`, `stateOptions`,
`entitlementOptions`, etc.). Plus a separate `initialState` literal.
Plus `plugins: [...]`.

**MarketsGrid.** One typed prop bag (`MarketsGridProps` in
`types.ts:20-193`). Surface area unchanged from V1:

- *Identity:* `gridId`, `instanceId`, `appId`, `userId`, `rowIdField`.
- *Data:* `rowData`, `columnDefs`.
- *AG Grid passthroughs:* `theme`, `sideBar`, `statusBar`,
  `defaultColDef`, `rowHeight`, `headerHeight`, `animateRows`.
- *Toolbar visibility flags:* `showToolbar`, `showFiltersToolbar`,
  `showFormattingToolbar`, `showSaveButton`, `showSettingsButton`,
  `showProfileSelector`.
- *Module list:* `modules?: AnyModule[]` (defaults to
  `DEFAULT_MODULES` in `MarketsGrid.tsx:102-112`).
- *Storage:* `storage?: StorageAdapterFactory`,
  `storageAdapter?: StorageAdapter`, `autoSaveDebounceMs?`,
  `gridLevelData`, `onGridLevelDataLoad`.
- *Lifecycle:* `onGridReady`, `onReady(handle)`.
- *Slots:* `adminActions`, `headerExtras`.

There is *no* `initialState` concept and *no* `options` super-object.
The user's saved state lives entirely inside the active *profile*
(opaque to the host), and "options-like" knobs are surfaced through
sibling modules' settings panels rather than through props.

### 2.3 State management

**AdapTable.** Redux-backed JSON store. Three lifecycle phases:
design-time `initialState` → `loadState()` first load → `loadState()`
subsequent. Default = local storage. Production = developer-supplied
`loadState`/`persistState` scoped by `adaptableId × userName ×
adaptableStateKey`. Migration helper for major-version bumps.

**MarketsGrid.** No global Redux store at the markets-grid layer.
Persistence is profile-shaped:

- The `useProfileManager` hook (imported from `@marketsui/core` —
  `MarketsGrid.tsx:40, 418-423`, configured with
  `disableAutoSave: true`) owns active profile id, profile list,
  dirty flag, and CRUD ops (create / load / delete / clone / rename /
  export / import).
- A `StorageAdapter` is the persistence seam. The wrapper has *zero*
  knowledge of where rows land — `MemoryAdapter` for tests/demos
  (`MarketsGrid.tsx:333`), `DexieAdapter` for browser persistence,
  `createConfigServiceStorage()` for `(appId, userId, instanceId)`
  scoping when running inside the MarketsUI ConfigService.
- A *required-companion assertion* throws at mount time if `storage`
  is supplied without both `appId` and `userId`
  (`MarketsGrid.tsx:195-202`).
- Each save explicitly captures AG-Grid's native column state via
  `captureGridStateInto(platform.store, api)` before flushing
  (`MarketsGrid.tsx:499-518`). Auto-save was deliberately removed —
  every change is held as dirty in-memory, then either saved
  (`handleSaveAll`) or discarded (`profiles.discardActiveProfile()`).

#### 2.3.1 NEW: per-view active-profile pointer (OpenFin)

`openfinViewProfile.ts` is the most material new artifact. What it
does precisely:

- Implements core's `ActiveIdSource` interface (`{ read(): ... | null;
  write(id): ... }`) against `fin.me.getOptions` /
  `fin.me.updateOptions`.
- `read()` pulls `customData.activeProfileId` from the current view's
  options. Returns `null` when the value is missing or `fin` is
  unreachable.
- `write(id)` stores the new id into `customData.activeProfileId`,
  short-circuiting if it's already current. Skips the write entirely
  outside OpenFin (`finGlobal?.me?.getOptions` reachability check at
  line 32).

The wiring in `MarketsGrid.tsx:417-423` constructs the source once
per mount via `useRef(createOpenFinViewProfileSource())` and threads
it into `useProfileManager(... { activeIdSource })`. Per
`ProfileManager.ts:35-49`, the source is a *higher-priority pointer*
— if `read()` returns a non-null id and that profile exists, it wins
over localStorage.

**Why this matters.** Two effects:

1. **Duplicated views show different profiles.** OpenFin lets the
   user duplicate a view; both copies share the same MarketsGrid
   `gridId` + storage rows but each carries an independent
   `customData.activeProfileId`. Without the source, both views
   would race on the localStorage pointer and end up showing the
   same profile.
2. **Workspace snapshot round-trips the active profile id for
   free.** `Platform.getSnapshot()` reads from view options, so
   saving / restoring an OpenFin workspace captures the profile
   pointer alongside the view's URL and customData. The README
   comment at `openfinViewProfile.ts:7-27` calls this out
   explicitly.

Outside OpenFin (browser, Electron, tests, jsdom in vitest) the
factory returns `null` and the manager falls back to the localStorage
pointer just as before. Both `read()` and `write()` swallow errors —
the source is best-effort and **must never block ProfileManager boot
or a profile commit** (the comment at line 14-15 calls this out).

This is a *pointer* shift, not a *storage* shift. Profile *contents*
still live in the configured `StorageAdapter`. The new file changes
which profile is *active* per view, not where profiles are stored.

#### 2.3.2 Sibling responsibility

Module state inside the active profile is managed by
`@marketsui/core`'s module pipeline. Each registered module owns a
slice (`conditional-styling`, `column-customization`,
`column-templates`, `calculated-columns`, `column-groups`,
`saved-filters`, `toolbar-visibility`, `grid-state`,
`general-settings`). Modules expose `useModuleState<T>(moduleId)`
hooks (`FiltersToolbar.tsx:78`, `formattingToolbarHooks.ts:173-174`,
`formatter/state.ts:176-177`) — these mirror AdapTable's per-module
state segmentation but are managed by `@marketsui/core`'s store
rather than duplicated here.

#### 2.3.3 Gap vs. AdapTable (unchanged)

- No equivalent of `BeforeAdaptableStateChanges` /
  `AdaptableStateChanged` / `AdaptableStateReloaded` event triple.
  Profiles dispatch through the manager's hook surface, but there is
  no public state-event bus and no enumeration of action names.
- No `SuspendableObject`-style suspend/un-suspend across all object
  types. Profiles can be cloned but not suspended.
- No `applyState` interceptor / `AdaptableUpgradeHelper`.
  Profile-import accepts a JSON payload (`MarketsGrid.tsx:706-714`)
  but version migration is the consumer's responsibility.

### 2.4 Expression / query engine

**Unchanged from V1.** Markets-grid still owns *no* expression engine.
`valueFormatterFromTemplate(vft)` evaluates a `kind: 'expression'`
template's per-row JS string (gated by a CSP policy). The
`conditional-styling` module's rule editor (in core) accepts per-row
JS expressions. **Nothing has converged into a unified AQL** since V1.
This is the largest architectural gap and remains so.

### 2.5 UI surfaces — mapping

| AdapTable surface | MarketsGrid equivalent | Notes (current rev) |
|---|---|---|
| Settings Panel | `SettingsSheet.tsx` (~530 LOC) | Single popout (`Poppable` from core, OS-window-detached on OpenFin). One section per registered module's `ListPane`/`EditorPane` master-detail UI. Help cheatsheet replaces wizards. ✅ |
| Dashboard | `MarketsGrid.tsx:615-766` primary row + `MarketsGrid.tsx:778-787` pinned formatting-toolbar row | Fixed two-row layout. Row 1: filters carousel → brush toggle → profile selector → save → settings → admin actions. Row 2 (when `showFormattingToolbar && styleToolbarOpen`): the formatting toolbar pinned beneath. *Not user-configurable.* No tabs. The new pinned row replaced the V1-era DraggableFloat (per the comment block at `MarketsGrid.tsx:769-778`) so it can't overlap narrow grid columns in multi-grid dashboards. |
| Tool Panel | AG Grid `sideBar` prop, forwarded as-is | 🔵 |
| Status Bar | AG Grid `statusBar` prop, forwarded as-is | 🔵 |
| Column menu | AG Grid default | ❌ |
| Context menu | AG Grid default | ❌ |
| Theming | `ensureCockpitStyles()` injects cockpit CSS once per document. Tokens from `@marketsui/design-system`. Light/dark via `data-theme`. | 🔵 |

The popouts (`SettingsSheet` and `FormattingToolbar`) both use the
shared `Poppable` primitive (`SettingsSheet.tsx:11, 492-528`,
`FormattingToolbar.tsx:20, 49-114`) for inline ↔ detached-OS-window
switching with frameless OpenFin chrome support. The popped formatter
panel renders the *vertical* layout (`Formatter.tsx:156-194`) which
shares the same modules as the inline horizontal toolbar
(`Formatter.tsx:117-152`) so behaviour cannot drift between them.

### 2.6 Data architecture

**Unchanged from V1.** **CSRM only**, by behaviour. The
`<AgGridReact rowData={rowData}>` prop binding (`MarketsGrid.tsx:798`)
is plain CSRM. There is no SSRM datasource wiring, no viewport
datasource, no `getAdaptableFilterState` analogue.

Two AG-Grid-level knobs are *new* in the current revision:

- `maintainColumnOrder: true` (`MarketsGrid.tsx:804`) preserves user
  drag-reorders against module-state regenerations.
- `asyncTransactionWaitMillis: 100` (`MarketsGrid.tsx:826`)
  coalesces live-update transactions every 100ms instead of AG-Grid's
  60ms default — fewer main-thread tasks under fast feeds.

Neither closes a feature gap; they're both stability tweaks for tick
streams. Ticking is still a *consumer responsibility* (the v2
data-plane package feeds row updates via `applyTransaction` calls).
**There is no flashing-cell module.**

### 2.7 Eventing

**Unchanged from V1.** No package-level event bus. Internal listeners
in `FiltersToolbar.tsx:138-141`, `formattingToolbarHooks.ts:124-130`,
`formatter/state.ts:215-220` go through `@marketsui/core`'s `ApiHub`
(internal). `onReady(handle)` and `onGridReady(event)` props
(`types.ts:140, 73`) remain the only public callback hooks.

### 2.8 Permissioning

**Unchanged from V1.** No permissioning whatsoever in-package.
`adminActions` visibility is consumer-controlled (`types.ts:260`).

### 2.9 FDC3 / FinTech

**Slight expansion since V1.** Markets-grid's only first-party OpenFin
touchpoints are now:

1. `isOpenFin()` for popout chrome (`SettingsSheet.tsx:172`).
2. `Poppable`'s `frame: false` flag for frameless popouts.
3. **NEW:** `fin.me.{getOptions,updateOptions}` for the per-view
   active-profile pointer (`openfinViewProfile.ts:32, 37, 49`).

All three are *defensive* — each guards against `fin` being undefined
and falls through gracefully. None imply a real FDC3 surface, and
none change the V1 conclusion that real OpenFin/FDC3 work is fully
delegated to `@marketsui/openfin-platform*`.

---

## 3. Feature-by-feature gap walkthrough

### 3.1 Frameworks & install

| Subfeature | Status | Effort | Notes (delta vs V1) |
|---|---|---|---|
| React 19 wrapper | ✅ | — | `MarketsGrid.tsx`. peerDep pins React >= 19. |
| React 18 compat | ✅ | — | `forwardRef`-based; should run on 18 too. |
| Vanilla TS | ❌ | XL | Same. |
| Angular adapter | ❌ | XL | Sibling `@marketsui/angular` does not mirror MarketsGrid. |
| Vue adapter | ❌ | XL | Same. |
| `Adaptable.init`-style async constructor | ⚪ | — | Not idiomatic React. |
| License key | ⚪ | — | Not commercial. |
| Primary key (mandatory) | 🟡 | S | `rowIdField` defaults to `'id'`; not enforced as required. |
| `adaptableContext` pass-through | 🟡 | S | `MarketsGridHandle` carries platform/api/profiles, no opaque developer context. |
| Selective AG-Grid module wiring | 🟡 | S | `AllEnterpriseModule` hard-coded — bundle-size optimisation impossible. |
| `AdaptableReady` event | 🟡 | XS | `onReady(handle)` exists. |
| Container slots (`alertContainer`, etc.) | ⚪ | — | `Poppable` covers OS-window detach for the two surfaces that need it. |

### 3.2 Layouts

| Subfeature | Status | Effort | Notes (delta vs V1) |
|---|---|---|---|
| Saved view per profile | ✅ | — | Profile = unit of save. |
| Column order / visibility / sizing / pinning / sorting | 🔵 | — | Sibling `column-customization` + `grid-state`. `maintainColumnOrder: true` on `MarketsGrid.tsx:804` is a new guard against state-regeneration resets. |
| Friendly column headers | ✅ in-package (single-col scope) + 🔵 (sibling for bulk) | — | ↑ from V1: `setHeaderName` action + `InlineColumnLabel` (`ModuleContext.tsx:25-98`) lets single-column scope rename inline. Multi-col bulk rename still 🔵 via column-customization editor. |
| Per-column filters persisted on layout | 🔵 | — | `saved-filters` module. |
| Cross-grid filter on layout (Grid Filter / AQL) | ❌ | XL | Needs an expression engine first (12). |
| Row groups | 🟡 (AG-Grid native) | M | Same as V1. |
| Pivot mode | 🟡 (AG-Grid native) | XL | Same. |
| Layout aggregations (per column) | 🟡 (AG-Grid native) | M | Same. |
| Weighted-Average aggregation | ❌ | M | Same. |
| `Only` aggregation | ❌ | S | Same. |
| Grand Total Row (top/bottom) | ❌ | M | Same. |
| Row summaries (pinned aggregation rows) | ❌ | M | Same. |
| RowGroupValues (expand/collapse memory) | 🟡 | M | Same. |
| Master-Detail | ❌ | L | Same. |
| Tree Data | 🟡 | M | Same. |
| Layout extending via Object Tags | ❌ | M | Profile is monolithic. |
| Multiple layouts per grid | ✅ | — | Multiple profiles per grid. |
| Default layout | 🟡 | S | `RESERVED_DEFAULT_PROFILE_ID` exists. |
| Layout sync across windows | ✅ in-package (per-view active id) + 🟡 (cross-window broadcast) | — | ↑ from V1 🟡 to ✅ for the per-view-pointer slice: `openfinViewProfile.ts` lets duplicated OpenFin views show different active profiles of the same grid. Cross-window *content* sync (broadcast changes to other open grids) is still 🟡. |
| Per-view active-profile override (NEW classification) | ✅ | — | `openfinViewProfile.ts:29-57` + wiring at `MarketsGrid.tsx:417-423`. Outside OpenFin, returns null and falls through to localStorage. |

### 3.3 UI surfaces

| Subfeature | Status | Effort | Notes (delta vs V1) |
|---|---|---|---|
| Settings Panel (modal/window) | ✅ | — | `Poppable` handles inline ↔ OS-window. |
| One section per state-bearing module | ✅ | — | `SettingsSheet.tsx:104-107` filters by `SettingsPanel` or `ListPane`+`EditorPane`. |
| Custom Settings panels (developer-injected) | ❌ | M | No public API. |
| Dashboard modes (Default / Inline / Collapsed / Floating / Hidden) | ❌ | M | Pill-row collapse state is the closest thing. |
| Dashboard tabs grouping toolbars | ❌ | L | Same. |
| Dashboard custom toolbars (developer content) | 🟡 | XS | `headerExtras` slot. |
| Pinned formatting toolbar row | ✅ | — | NEW classification. The DraggableFloat-based "floating" formatting panel V1 documented has been replaced by a *pinned* second toolbar row (`MarketsGrid.tsx:778-787`, comment block at `:769-778`). Strictly more stable in multi-grid dashboards but loses drag-to-reposition. |
| Dashboard buttons (module shortcuts + custom) | 🟡 | XS | `adminActions` cluster (`MarketsGrid.tsx:917-947`). |
| Quick search input on dashboard | ❌ | M | Same. |
| Tool Panel — Module Tool Panels | ❌ | L | Same. |
| Tool Panel — Custom Tool Panels | 🟡 | M | Consumer passes `sideBar={...}` AG-Grid native. |
| Status Bar — Module Status Panels | ❌ | L | Same. |
| Column menu customization | ❌ | M | Same. |
| Context menu customization | ❌ | M | Same. |
| Theming | ✅ | — | Cockpit CSS + `@marketsui/design-system` tokens. |
| Light/dark support | ✅ | — | `[data-theme="dark"]`. |
| OS-following mode | 🟡 | S | Same. |
| Custom themes | 🔵 | — | Design-system. |
| Toast notifications | ❌ | M | Errors still fall to `window.alert(...)` (`MarketsGrid.tsx:677, 702, 712`). |
| Wizards (multi-step forms) | ❌ | M | Same. |
| Loading screen / progress indicators | ❌ | — | `suppressNoRowsOverlay: true` (`MarketsGrid.tsx:816`); consumer owns loading state. |

### 3.4 Core features

#### 3.4.1 Calculated columns

| Subfeature | Status | Effort | Notes |
|---|---|---|---|
| Standard calculated cols | 🔵 ✅ | — | `calculatedColumnsModule`. |
| Aggregated (`SUM/AVG/MIN/MAX/PERCENTAGE` with `GROUP_BY`) | ❌ | L | Needs AQL-like engine. |
| Cumulative (`CUMUL(SUM([col]), OVER([sortCol]))`) | ❌ | L | High value for P&L. |
| Quantile (`QUANT([col], N, GROUP_BY([cat]))`) | ❌ | M | Same. |
| Calculated cols reference other calculated cols | 🟡 | S | Circular detection unverified. |
| Per-column flags (Filterable/Groupable/Sortable/Pivotable/Aggregatable) | 🟡 | S | Same. |
| `valueCache` recommendation | 🔵 | XS | Consumer toggle. |
| External evaluation hook | ❌ | XL | Needs AST. |

#### 3.4.2 Alerts

❌ across the board. Same as V1.

#### 3.4.3 Action columns

❌ across the board. Same as V1.

#### 3.4.4 Charting

🔵 ✅ for chart launch (AG-Grid Enterprise via `AllEnterpriseModule`).
No persistence, external host, or cross-filter integration.

### 3.5 Searching & filtering

The `FiltersToolbar` remains the package's signature feature.

| Subfeature | Status | Effort | Notes |
|---|---|---|---|
| Quick Search | ❌ | M | Same. |
| Quick Search highlight | ❌ | S | Same. |
| Quick Search as-filter mode | ❌ | XS | Same. |
| Column Filters via AG Grid floating-filter UI | ✅ | — | Passthrough. |
| AdapTable-style Filter Form (multi-predicate AND/OR) | ❌ | L | Same. |
| AdapTable-style Filter Bar | ❌ | M | AG-Grid floating filters are MarketsGrid's substitute. |
| In Filter (multi-value picker) | ✅ | — | AG Grid set filter. |
| Saved filters as pills | ✅ | — | `FiltersToolbar` + `filtersToolbarLogic.ts`. |
| Multi-pill OR/AND merge | ✅ | — | `mergeFilterModels`. |
| Pill row collapse-to-summary | ✅ | — | `FiltersToolbar.tsx:325-352` (already shipped at V1). |
| Per-pill row counts | ✅ | — | `FiltersToolbar.tsx:108-144`. Recomputes on `rowDataUpdated`/`modelUpdated`/`firstDataRendered`. |
| Date filter row-match | ❌ | S | `filtersToolbarLogic.ts:117-119` — still falls through to match-all. |
| System Predicates (`Today`, `Blanks`, `Between`, etc.) | ⚪ | — | Different paradigm; AG Grid's filter operators serve. |
| Custom Predicates | ❌ | M | Same. |
| Grid Filter (single AQL expression for whole grid) | ❌ | XL | Needs expression engine. |
| Column-to-column comparison filter | ❌ | XL | Same. |
| Query Builder UI | ❌ | XL | Same. |
| Expression Editor UI | 🟡 🔵 | M | Monaco-based editor exists in core; not exposed for filter authoring. |
| Data Sets (multiple swappable client-side data sources) | ❌ | L | Same. |
| Data Set Forms | ❌ | M | Same. |
| Named Queries | ❌ | M | Same. |

### 3.6 Cell rendering, formatting, visual effects

The `formatter/` subtree (~1450 LOC across `Formatter.tsx`,
`state.ts`, `primitives.tsx`, six modules, and the `formatter.css`)
is the in-grid + popped-out toolbar. All values below are
**up-to-date** against the current state hook.

**Format Columns (style + display format).**

| Subfeature | Status | Effort | Notes (delta vs V1) |
|---|---|---|---|
| Cell style: ForeColor | ✅ | — | `setTextColor` (`formatter/state.ts:263-265`). |
| Cell style: BackColor | ✅ | — | `setBgColor` (`formatter/state.ts:267-269`). |
| Cell style: BorderColor / width / style per side | ✅ | — | `applyBordersMap` (`formatter/state.ts:357-400`); 4-side independent control. Render in `ModulePaint.tsx:49-83`. |
| Cell style: FontWeight (bold) | ✅ | — | `toggleBold`. |
| Cell style: FontStyle (italic) | ✅ | — | `toggleItalic`. |
| Underline | ✅ | — | `toggleUnderline`. |
| FontSize | ✅ | — | `setFontSizePx` (presets at `ModuleType.tsx:16`). |
| Alignment | ✅ | — | `toggleAlign('left'\|'center'\|'right')`. |
| Header style overrides | ✅ | — | `target = 'header'` in `formatter/state.ts:161-167`. Format module disables itself for header (`ModuleFormat.tsx:50`). |
| Inline column-caption rename (single-column) | ✅ | — | NEW. `setHeaderName` (`formatter/state.ts:138, 315-318`) + `InlineColumnLabel` (`ModuleContext.tsx:25-98`). ↑ from V1 🔵. |
| Editable lock toggle | ✅ | — | NEW. `toggleEditable` (`formatter/state.ts:142, 320-324`); pill render in `ModuleContext.tsx:161-174`. |
| Numeric display format | ✅ | — | Currency (USD/EUR/GBP/JPY), percent, comma, decimals±, BPS, Excel-format picker (`ModuleFormat.tsx`). |
| String display format | 🟡 | S | Same as V1. |
| Date display format (Unicode patterns) | 🟡 | M | Same. |
| Template format type | 🟡 | M | `ValueFormatterTemplate.kind` covers `'preset' \| 'expression' \| 'tick' \| 'excelFormat'`. |
| Custom (developer formatter) | ⚪ | — | AG Grid `cellRenderer` / `valueFormatter` available. |
| Adaptable Style supplier hook | ❌ | M | No per-cell dynamic style callback API. |
| Fixed-income tick format (32 / 32+ / 64 / 128 / 256) | ✅ | — | `TICK_MENU` (`ModuleFormat.tsx:29-35` + `formatterPresets.ts:104-121`). **Strictly better than AdapTable** for FI desks. |
| Save current style as named template | ✅ | — | `saveAsTemplate` (`formatter/state.ts:279-290`). |
| Template manager UI | ✅ | — | `TemplateManager.tsx` — single component used in compact (popover) and panel (popped) variants. Two-step delete confirm. |
| Apply template via dropdown | ✅ | — | `applyTemplate` (`formatter/state.ts:275`). |
| Type defaults (dataType → default style) | ✅ | — | `resolveTemplates(a, tplState, dataType)` (`formattingToolbarHooks.ts:189`). |
| Undo/redo formatter actions | ✅ | — | `useUndoRedo` with limit 50 (`formatter/state.ts:179-183`). |
| Clear-all destructive action (whole profile) | ✅ | — | `requestClearAll` + `confirmClearAll` (`formatter/state.ts:297-302`); dialog at `Formatter.tsx:39-70`. |
| Clear-selected destructive action (current scope) | ✅ | — | NEW. `requestClearSelected` + `confirmClearSelected` (`formatter/state.ts:304-313`); dialog at `Formatter.tsx:72-113`. ↑ from V1 ❌. |

**Conditional styling.**

| Subfeature | Status | Effort | Notes |
|---|---|---|---|
| Predicate-based conditional styling | 🔵 ✅ | — | `conditionalStylingModule` from core. |
| Expression-based conditional styling (AND/OR multi-column) | 🟡 🔵 | L | Single-expression rules exist. |
| Real-time evaluation as data updates | 🔵 ✅ | — | Re-evaluates on AG-Grid data updates. |

**Styled columns.** Unchanged from V1.

| Subfeature | Status | Effort | Notes |
|---|---|---|---|
| Gradient column | ❌ | M | |
| Percent Bar column | ❌ | M | |
| Badge column | ❌ | M | |
| Sparkline column | 🔵 ✅ | — | AG Grid Enterprise. |

**Flashing cells / rows.** All ❌. Same as V1.

### 3.7 Editing

❌ across the board, with one nuance: the new `toggleEditable`
formatter action *unlocks/locks* a cell for editing but does not
change the editing UX. The four AdapTable editing modules (Smart
Edit, Bulk Update, Plus/Minus, Shortcuts) and three validation tiers
remain absent.

### 3.8 Annotating

❌ across the board. Same as V1.

### 3.9 Working with grid data

Same as V1. Profile JSON export/import works
(`MarketsGrid.tsx:692-714`); data export only via AG-Grid native.

### 3.10 Advanced

#### 3.10.1 Team sharing

| Subfeature | Status | Effort | Notes |
|---|---|---|---|
| Snapshot sharing (manual JSON copy) | ✅ | — | Profile export/import. |
| Active sharing (live linkage) | ❌ | XL | Same. |
| Per-view profile pointer (workspace round-trip) | ✅ | — | NEW classification: OpenFin workspace snapshots round-trip the active-profile pointer via `customData` automatically (`openfinViewProfile.ts` description). Outside OpenFin, no equivalent. |

Other rows unchanged from V1.

#### 3.10.2-3.10.6 (Row forms / Schedules / No-Code / FDC3 / System status)

All ❌, same as V1. The new OpenFin pointer source is *not* an FDC3
surface — it operates on view options, not on the FDC3 broadcast bus.

### 3.11 Developer APIs

#### 3.11.1 State lifecycle

| Subfeature | Status | Effort | Notes |
|---|---|---|---|
| Initial state (design-time) | 🟡 | S | Same. |
| `loadState` / `persistState` callbacks | ✅ | — | `StorageAdapter.{loadProfile, saveProfile, listProfiles, loadGridLevelData, saveGridLevelData}`. |
| Default = browser local storage | ✅ | — | `MemoryAdapter` (default fallback at `MarketsGrid.tsx:333`); `DexieAdapter` documented. |
| Remote = developer-supplied | ✅ | — | `createConfigServiceStorage()` per IMPLEMENTED_FEATURES. |
| Pluggable active-id pointer (`ActiveIdSource`) | ✅ | — | NEW classification. Was conceptually missing in V1; the package now ships an OpenFin-aware source as the first concrete implementation. |
| `BeforeAdaptableStateChanges` event | ❌ | M | Same. |
| `AdaptableStateChanged` event | ❌ | L | Same. |
| `AdaptableStateReloaded` event | ❌ | S | Same. |
| `SuspendableObject` | ❌ | M | Same. |
| Migrations (`autoMigrateState` + `AdaptableUpgradeHelper`) | ❌ | M | Same — and worth re-flagging (see §4 priority 8). |
| `applyState` interceptor | ❌ | S | Same. |

#### 3.11.2 Permissions

❌ across the board. Same as V1.

#### 3.11.3 Handling grid data

Same as V1. `cellValueChanged` exists via AG-Grid's gridApi but no
MarketsGrid wrapping or trigger-disambiguation.

#### 3.11.4 Server-Side / Viewport row models

❌ across the board. CSRM-only.

#### 3.11.5 Managing columns

Same as V1, with the ↑ for inline header rename noted in 3.6.

#### 3.11.6 Configuring AG Grid through MarketsGrid

The pipeline (`platform.transformGridOptions({})` —
`useGridHost.ts:86-90`) is the seam. Hosts spread `{...gridOptions}`
*first* (`MarketsGrid.tsx:796`) so explicit host props win on conflict.
The new `INITIAL_ONLY_GRID_OPTIONS` skiplist (`useGridHost.ts:19-35`)
mirrors AG-Grid's "you can only set this at construction" warning
list so post-mount pushes for those keys are skipped — first-mount
spread still picks them up via the AgGridReact prop spread. This was
not a concept in V1 and is worth surfacing because it changes how a
sibling module that emits one of those keys is observed.

#### 3.11.7 Hotkeys

| Subfeature | Status | Effort | Notes |
|---|---|---|---|
| In-built hotkey manager | ❌ | S | Same. |
| Save / Discard / Cmd+Enter to close sheet | ✅ | — | `SettingsSheet.tsx:139-145`. |
| Alt+Shift+P data-provider chord | 🟡 | XS | Same. Not bound *inside* `markets-grid`. |

#### 3.11.8 Support, logging, profiling, testing

| Subfeature | Status | Effort | Notes |
|---|---|---|---|
| Logging hooks | 🟡 | XS | Several `console.log`/`console.warn` calls (`MarketsGrid.tsx:169-170, 366-367, 380, 399, 448, 507, 559, 570, 586`). Not configurable. |
| Profiling | ❌ | M | Same. |
| Testing utilities | 🟡 | — | `FormattingToolbar.test.tsx` (450 LOC), `filtersToolbarLogic.test.ts` (352 LOC). Solid coverage of saved-filter logic and formatter actions. |
| Monitoring | ❌ | L | Same. |
| Performance | ❌ | XS | Same. |

### 3.12 AQL — expression engine

❌ across the board. Same as V1, save for the formatter's
expression-template branch (`formatter/state.ts:54`,
`formatterPresets.ts:53-56` for BPS) which is per-row JS evaluation
gated by core's CSP policy. Not parsed to an AST, not analysed, not
validated beyond "did it throw?".

### 3.13 FinTech integrations

Same as V1, with the small expansion noted in §2.9 for the OpenFin
`fin.me` touchpoint (purely a state-pointer concern — not an FDC3
or notifications surface).

### 3.14 Technical reference

Same as V1. `MarketsGridProps` (`types.ts:20-193`) is the single
prop bag. `MarketsGridHandle` is `{ gridApi, platform, profiles }`.

---

## 4. Prioritised gap closure recommendations

Re-derived for the current revision. The OpenFin pointer source
closed a small gap in the layout-sync category; nothing on the V1
high-value list moved off the board. Net effect: the V1 ordering is
still mostly right, but priority 10 (profile schema versioning) gets
upgraded — now that the active-profile pointer is round-tripping
through OpenFin workspaces, an unversioned profile schema is *more*
fragile, not less.

1. **Flashing Cells module** (predicate-driven up/down/neutral). #1
   missing visual feature for ticking grids. L. Depends on a Column
   Scope abstraction + a predicate engine subset of AQL. First slice:
   "always-on flash on numeric cells whose value differs from the
   previous tick". <500 LOC.

2. **Conditional Styling — Expression edition.** Predicate-only today
   in the sibling module. Trading desks need `[bid] > [ask]` and
   AND/OR composition. M. The Monaco-based Expression Editor exists
   in core; needs a small AST layer.

3. **Calculated Columns — Aggregated + Cumulative + Quantile.** P&L
   roll-ups, running totals, percentile buckets. L. Depends on AQL.
   First slice: `SUM` and `AVG` agg-only, CSRM-only, no GROUP_BY.

4. **Profile schema versioning + migrations.** ↑ from V1 priority 10.
   The OpenFin per-view pointer means workspace snapshots now carry
   profile *ids* into restored sessions; if the underlying profile
   schema diverges between the snapshot save and restore (different
   app versions in the same workspace), there's no migration path. S
   to land the version field, M for the actual migration helper.

5. **Data Change History + per-row Undo.** Audit requirement. L.
   In-memory ring buffer keyed by primary key as the first slice;
   persistence + UI come later.

6. **Alerts engine — Data Change + Relative Change.** "Tell me when
   bid crosses 100." L for engine + UI. Builds on a Toast primitive
   (#13 in V1, now bumped — see 13).

7. **Smart Edit — multiplicative across selection.** "Shift every
   BUY price by +0.25." M. AG-Grid's `cellSelection` is already on
   (`MarketsGrid.tsx:808`). `Poppable` can host the popover.

8. **Quick Search.** Every trader tries Ctrl+F. M. Wraps AG-Grid's
   `quickFilterText` + a Cmd+F binding. Highlight + as-filter mode
   in slice 2.

9. **Cell Summaries (status-bar selection stats).** Trader highlights
   a range of bids → wants sum/avg/min/max in the status bar. M.
   AG-Grid's `agAggregationComponent` is most of this; need a
   weighted-avg type and a configuration UI.

10. **Reports module (System reports first).** "CSV of visible rows"
    without code. L for Custom Reports (need AQL); M for System
    Reports alone. ~150 LOC to wrap `gridApi.exportDataAsCsv`.

11. **Server-side filter state extractor
    (`getMarketsGridFilterState()`).** Bridge for >200k-row scenarios.
    M. The data is already in `saved-filters` + AG-Grid's filter
    model; needs one typed API on `MarketsGridHandle`.

12. **Custom column-menu + context-menu API.** "Add to watchlist",
    "Open trade ticket", FDC3 broadcast. M. Consumer-level
    `contextMenuItems` / `columnMenuItems` props composing with
    AG-Grid defaults.

13. **Toast notification primitive.** Now genuinely
    high-leverage — every `window.alert` site (`MarketsGrid.tsx:677,
    702, 712`) is a UX regression vs the rest of the app, and
    Alerts (#6) and System Status both need it. S — shadcn Sonner +
    a `useToast()` hook, ~80 LOC.

14. **Notes (per-cell annotations stored in profile).**
    Auditability. M. Depends on Custom column/context menu (12).
    First slice: `profile.notes[primaryKey][colId]` with author +
    timestamp.

15. **Action Columns (built-in `delete`/`clone`).** Trade-blotter
    UX universal. M. New column type + an `onClick` prop bag.
    `delete` first; `clone` once Row Forms are scoped.

---

## 5. Anti-recommendations

Six AdapTable features that are **not** worth replicating in
`markets-grid`, given the platform's existing investments.
Re-evaluated against the current code; one V1 anti-recommendation
(DraggableFloat → pinned formatting toolbar) doesn't apply to this
section but is worth noting in the "rejected V1 ideas that *did*
ship as something better" margin.

1. **AdapTable's permissioning model.** Still ⚪. AdapTable explicitly
   notes that entitlements are *UI-only*. The MarketsUI platform has
   ConfigService + role-aware `adminActions` (`types.ts:247-261`)
   where the *consumer* decides visibility before constructing the
   array — that's the right layer for a banking platform with a
   backend authorisation tier. Re-implementing Full/ReadOnly/Hidden
   inside the UI buys nothing functional and adds 1k+ LOC of state
   plumbing. Keep the responsibility at the consumer level.

2. **AdapTable No Code.** ⚪. The MarketsUI design-time ColDef +
   module-pipeline architecture is the opposite — columns are
   declared in code, then mutated via runtime UI. Drop-a-JSON-and-go
   violates the layer model. Settings Sheet is enough.

3. **AdapTable Dashboard's five modes + tabs.** ⚪. The two-row
   layout (filter pills + brush + profile + save + settings ; pinned
   formatting-toolbar row beneath) is deliberately fixed for the
   ~95% case. The *new* pinned formatting-toolbar row replaced
   DraggableFloat precisely *because* generalised positioning was
   buggy in multi-grid dashboards. `headerExtras` covers the one
   place a custom toolbar belongs (data-provider picker). Don't
   ship the full dashboard system.

4. **AdapTable's plugin system + ipushpull / interop.io / OpenFin
   plugins.** ⚪. OpenFin and FDC3 are owned by
   `@marketsui/openfin-platform*`; the new `openfinViewProfile.ts`
   is a *consumer* of the OpenFin runtime, not a *plugin host*.
   Ipushpull and interop.io aren't strategic. Workspace import
   boundaries replace the plugin registry.

5. **AdapTable Master Detail (independent AdapTable instances per
   detail row).** ⚪. AG-Grid's master/detail is forwarded through
   `gridOptions`. The `_agRegistered` guard at `MarketsGrid.tsx:74-79`
   is process-wide — nested `<MarketsGrid>` instances would share
   profile storage ambiguously. Wire AG-Grid's native detail
   `gridOptions` directly via the `defaultColDef` + custom cell
   renderer path. Don't wrap.

6. **AdapTable's Transposing view.** ⚪. Trading desks read row-major
   data; transposed views serve the analyst-style "compare 2 funds
   across 30 metrics" workflow. Skip unless a specific consumer
   requests it.

---

*End of analysis. Source rev: `MarketsGrid.tsx` 2026-04-30,
`useGridHost.ts` 2026-04-30, `openfinViewProfile.ts` 2026-04-30 (NEW),
`formatter/state.ts` 2026-04-30, `formatter/Formatter.tsx` 2026-04-30,
`formatter/modules/ModuleClear.tsx` 2026-04-30,
`formatter/modules/ModuleContext.tsx` 2026-04-30,
`formatter/modules/ModulePaint.tsx` 2026-04-30,
`FormattingToolbar.tsx` 2026-04-30, `formattingToolbarHooks.ts`
2026-04-30. Unchanged-but-re-read: `FiltersToolbar.tsx`,
`filtersToolbarLogic.ts`, `SettingsSheet.tsx`, `TemplateManager.tsx`,
`ProfileSelector.tsx`, `HelpPanel.tsx`, `DraggableFloat.tsx`,
`types.ts`, `index.ts`, `package.json`.*
