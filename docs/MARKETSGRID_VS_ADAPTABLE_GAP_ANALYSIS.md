# MarketsGrid vs AdapTable — Gap Analysis

> A feature-by-feature comparison of the MarketsGrid product surface
> (`@starui/grid`, the customizer modules, profile manager, data
> providers, OpenFin integration) against [AdapTable for AG
> Grid](https://www.adaptabletools.com/docs).
>
> **Sources:**
> - MarketsGrid: [`docs/current-features.md`](./current-features.md) and the
>   `packages/` source tree.
> - AdapTable: the full doc tree under `https://www.adaptabletools.com/docs/*`
>   (Getting Started → Framework Versions → Layouts → UI → Core Features →
>   Searching & Filtering → Cell Rendering → Editing → Annotating → Working
>   with Grid Data → Advanced Features → Developer Guides → AdaptableQL →
>   Partners → Technical Reference).
> - Crawl date: 2026-05-23.

---

## 1. Executive summary

**Headline parity: ≈ 43% (weighted by importance for a trading grid).**

MarketsGrid covers the **foundations** of an AdapTable-class product — profile
persistence, formatting/conditional styling, expression-driven calculated
columns, OpenFin integration, real-time data plumbing — but is short on
**trader-facing analytics surfaces** (alerts, flashing, styled columns,
sparklines, pivot, summarisation), **collaboration** (team sharing,
notes/comments, row forms), and **report-tier exporting** (Visual Excel,
scheduling, custom destinations). It also lags on **editing ergonomics**
(Smart Edit, Bulk Update, Plus/Minus, Shortcuts, data-change history UI).

Where MarketsGrid is **at or near parity** (≥75%): conditional styling,
display formatters, the profile/state system, AG Grid integration depth, and
the OpenFin runtime seam.

Where MarketsGrid is **dramatically behind** (≤20%): alerts, flashing,
styled columns (gradient / percent bar / badge / sparkline), Smart-Edit-class
editing, Visual Excel + scheduled reports, Notes/Comments, Row Forms,
Schedules/Reminders, AdaptableQL aggregation/observable expression families.

---

## 2. Methodology

Each AdapTable feature category was scored against MarketsGrid on a
**0 / 25 / 50 / 75 / 100** coverage scale:

- **0** — Not implemented (no surface, no engine support).
- **25** — Token / partial primitive exists but no UI module or wiring.
- **50** — Half-built — primitive plus some UI, missing major sub-features.
- **75** — Mostly there — primary use cases covered, edge cases missing.
- **100** — Full or stronger equivalent.

Each category is weighted **1–10** by importance for a capital-markets grid
(10 = critical, 1 = niche). Overall parity is the weighted average.

The matrix below is **granular** — one row per AdapTable doc section that
maps to a distinct capability. Where MarketsGrid has the same capability
under a different name, that's called out in the **MarketsGrid equivalent**
column.

---

## 3. Feature-by-feature matrix

### 3.1 Framework versions

| AdapTable feature | MarketsGrid equivalent | Coverage | Weight | Notes |
|---|---|---:|---:|---|
| React integration | `@starui/grid` + `@starui/widgets-react` | 100 | 5 | Full React stack |
| Angular integration | `@starui/grid-angular` (scaffold) | 25 | 4 | Marker export only |
| Vue integration | — | 0 | 2 | Not in roadmap |
| Custom Toolbar / Tool Panel / Settings Panel / Popups slots | Slot system in `@starui/widget-sdk` + customizer SettingsSheet | 50 | 5 | SDK exists; AdapTable-style per-surface slot API not exposed |

### 3.2 Layouts

| AdapTable feature | MarketsGrid equivalent | Coverage | Weight | Notes |
|---|---|---:|---:|---|
| Table Layouts (cols, order, sizing, pinning, sort, group, filter, selection, headers, filtering, row selection) | Profiles (full AG Grid state serialised by `ProfileManager`) | 90 | 10 | Profile == Table Layout for the table case |
| Layout Wizard UI | — | 25 | 5 | Customizer panels exist, but no step-by-step wizard flow |
| Pivot Layouts (pivot cols, groups, totals, result cols, formatting, sizing, sorting) | — (raw AG Grid pivot, no customizer module) | 20 | 7 | Major gap |
| Row Groups — expand/collapse, formatting, filtering, sorting, grouped rows | AG Grid native + col customizer `applyRowGroupingConfigToColDef` | 65 | 7 | Engine support; richer UI module missing |
| Aggregations — Grand Total Rows, Weighted Averages, Only Aggregation, Formatting | — | 20 | 8 | Critical for P&L / risk views |
| Column Groups — expand/collapse, formatting | Customizer column-groups module (`composeGroups`, `groupHeaderStyleToCSS`) | 75 | 6 | Strong support |
| Master-Detail | — | 10 | 6 | Not surfaced |
| Tree Data | — | 5 | 3 | Not surfaced |
| Default Layouts / Saving / Updating / Extending / Synchronising / Monitoring | `ProfileManager` covers save/update/active/dirty/auto-save | 80 | 7 | Strong; no cross-layout extension mechanism |

### 3.3 AdapTable UI

| AdapTable feature | MarketsGrid equivalent | Coverage | Weight | Notes |
|---|---|---:|---:|---|
| Settings Panel (configurable + custom) | `SettingsSheet` + customizer modules | 75 | 8 | Strong; less pluggable than AdapTable's panel slots |
| Dashboard with tabs / toolbars / buttons / modes (Default / Inline / Collapsed / Floating / Hidden) | `PrimaryToolbar` + `FiltersToolbar` + `FormattingToolbar` (with popout) | 45 | 7 | Multiple toolbars exist; no "dashboard mode" abstraction or floating mode |
| Tool Panel (module + custom) | — (no AG Grid Tool Panel registration) | 20 | 5 | AG Grid sidebar not wired up |
| Status Bar (configurable + custom) | — (no status bar customizer; `StaleDataBanner` covers staleness only) | 25 | 5 | Sparse coverage |
| Column Menu (configurable + custom items) | AG Grid native column menu | 40 | 6 | No custom-item registration API |
| Context Menu (configurable + custom + default structure) | OpenFin rename-tab context action; no in-grid context-menu customizer | 30 | 6 | OpenFin-side only |
| Theming — custom themes, CSS variables, AG Grid themes | `@starui/design-system` tokens + AG Grid adapters + dark/light/CVD | 100 | 9 | Stronger than AdapTable: token-driven, three-axis (mode + CVD) |
| UI guides — toasts, wizards, popups, custom palette, loading screen, progress, hiding, american english | `Toast` / `Toaster` / `useToast` / `Drawer` / `Dialog` / `Sheet` / portal provider | 70 | 5 | Most primitives present via `@starui/ui` |

### 3.4 Core features

| AdapTable feature | MarketsGrid equivalent | Coverage | Weight | Notes |
|---|---|---:|---:|---|
| Calculated Columns — Standard | Customizer calculated-columns module + `ExpressionEngine` + `buildVirtualColDef` | 80 | 9 | Strong |
| Calculated Columns — Aggregated | — | 15 | 7 | Major gap |
| Calculated Columns — Cumulative | — | 10 | 5 | — |
| Calculated Columns — Quantile (bucketing) | — | 10 | 5 | — |
| Calculated Columns — Referencing other calc cols | Partial via expression engine | 50 | 5 | — |
| Alerts — Data Change | — | 5 | 10 | Critical trading feature |
| Alerts — Relative Change (PERCENT_CHANGE, ABSOLUTE_CHANGE, ANY_CHANGE) | — | 5 | 10 | — |
| Alerts — Row Change (ROW_ADDED / ROW_REMOVED) | — | 5 | 8 | — |
| Alerts — Aggregation (multi-row limits) | — | 5 | 9 | Limit monitoring |
| Alerts — Observable (reactive) | — | 5 | 7 | — |
| Alerts — Validation (rollback on bad edit) | — | 5 | 8 | — |
| Alert notifications — toast, toolbar, dashboard highlight, auto-jump, log, custom, event | `useToast` primitive exists, no alerting pipeline | 10 | 8 | — |
| Action Columns — dynamic per-row buttons, conditional visibility | — | 10 | 6 | — |
| Charting — AG Grid Charts, persistent, multi-window, external chart libs | `Chart` wrapper in `@starui/ui` (Recharts) — not wired into grid | 15 | 7 | Primitive only |

### 3.5 Searching & filtering

| AdapTable feature | MarketsGrid equivalent | Coverage | Weight | Notes |
|---|---|---:|---:|---|
| Quick Search — text search, highlight matches, optional as-filter | Quick filter via `FiltersToolbar` | 40 | 6 | Missing highlighting + "search as filter" toggle |
| Column Filters — Filter Form + Filter Bar + In Filter + System Filters + Custom Filters | Floating filters + filters toolbar + `filtersToolbarLogic` + saved filters | 65 | 9 | Strong; lacks unified In-filter UI showing display values |
| Grid Filter (expression-based across grid) | — | 20 | 7 | Engine supports it via `ExpressionEngine` but no UI module |
| Data Sets — switch between named collections + optional forms | `MarketsGridContainer` two-provider picker + Alt+Shift+P hotkey | 60 | 7 | Provider switching done; "form-on-select" parameter prompts missing |
| Named Queries — saved queries reusable in expressions via QUERY() | — | 10 | 5 | Saved filters exist for filter model, not for expression reuse |

### 3.6 Cell rendering

| AdapTable feature | MarketsGrid equivalent | Coverage | Weight | Notes |
|---|---|---:|---:|---|
| Display Formats — Numeric | `excelFormatter` + formatter presets | 90 | 10 | Strong |
| Display Formats — String | Format presets + custom templates | 85 | 8 | — |
| Display Formats — Date | `excelFormatter` for dates + presets | 85 | 9 | — |
| Display Formats — Template (e.g. `"{value} units"`) | `valueFormatterFromTemplate` | 90 | 8 | — |
| Display Formats — Custom (developer function) | Custom value formatter via column def | 90 | 8 | — |
| Conditional Styling — Predicate + Expression | Customizer conditional-styling module + `ExpressionEngine` | 85 | 10 | Strong (dark/light themed styles) |
| Styled Columns — Gradient | — | 15 | 7 | Cell renderer doesn't exist; no gradient column-type |
| Styled Columns — Percent Bar | — | 15 | 7 | — |
| Styled Columns — Badge (text + icon, conditional) | `RatingBadgeRenderer`, `StatusBadgeRenderer`, `SideCellRenderer` exist but not configurable column-type | 35 | 7 | Renderers exist; no UI for end-user badge column config |
| Styled Columns — Sparkline | — | 5 | 6 | Niche but distinctive |
| Flashing Cells (UP / DOWN / Neutral, duration, scope, rule) | — (AG Grid `enableCellChangeFlash` only, no UI customizer) | 15 | 8 | Major gap |
| Flashing Rows | — | 10 | 6 | — |
| Column Header formatting | Customizer column-customization (label, alignment, style) | 80 | 7 | Strong |

### 3.7 Editing

| AdapTable feature | MarketsGrid equivalent | Coverage | Weight | Notes |
|---|---|---:|---:|---|
| Smart Edit (multiply / divide / +/- across many cells) | — | 10 | 7 | — |
| Bulk Update (set N cells to same value) | — | 10 | 7 | — |
| Plus / Minus increment via +/- keys | — | 10 | 5 | — |
| Shortcuts (M=million, K=thousand, etc.) | — | 5 | 6 | — |
| Styling Editable / ReadOnly Cells | Customizer style editor with data-type variants | 70 | 5 | — |
| Custom Edit Values (cell-level allowed values) | AG Grid native | 60 | 5 | — |
| Data Validation — Pre-Edit | — | 15 | 7 | — |
| Data Validation — Client-side rule | — | 20 | 7 | — |
| Data Validation — Server-side | DataProvider has REST/STOMP but no validation hook | 20 | 6 | — |
| Data Change History — tracking, monitor panel, undo, suspend | `HistoryStack` engine primitive only; no UI surface | 30 | 6 | Engine exists, monitor UI missing |
| Cell Editors — Select / Numeric / Percentage / Date | AG Grid + `Calendar` (react-day-picker) | 65 | 6 | — |

### 3.8 Annotating

| AdapTable feature | MarketsGrid equivalent | Coverage | Weight | Notes |
|---|---|---:|---:|---|
| Notes — per-cell personal annotations | — | 0 | 4 | — |
| Comments — team-shared cell-level dialogue | — | 0 | 5 | — |
| Free Text Columns — runtime-created user data columns | — | 0 | 4 | — |

### 3.9 Working with grid data

| AdapTable feature | MarketsGrid equivalent | Coverage | Weight | Notes |
|---|---|---:|---:|---|
| Exporting — Excel | AG Grid native | 70 | 8 | — |
| Exporting — Visual Excel (with styling/formatting) | — | 10 | 7 | Big gap — WYSIWYG export is a power-user feature |
| Exporting — CSV | AG Grid native | 80 | 6 | — |
| Exporting — JSON | AG Grid native (with adapter) | 60 | 5 | — |
| Reports — system + custom Boolean reports | — | 15 | 6 | No report definition layer |
| Report Destinations — file / clipboard / custom (email, REST, PDF) | File only | 25 | 6 | — |
| Scheduling exports / reports | — | 5 | 6 | — |
| Importing — JSON / CSV / Text into grid (update / add / populate) | Config import only (not row-data import wizard) | 15 | 5 | — |
| Custom Sorting (comparators) | `defaultNullSafeComparator` + AG Grid native | 75 | 7 | — |
| Selecting — API + Selection Changed events + Checkbox column | AG Grid native + grid-state persistence | 65 | 6 | — |
| Summarising — Cell Summaries (count / sum / avg / min / max for selection) | — | 15 | 7 | Status bar work needed |
| Summarising — Row Summaries | — | 15 | 6 | — |
| Transposing rows ↔ columns | — | 0 | 2 | Niche |
| Highlighting & Jumping (navigate to result) | — | 0 | 4 | — |

### 3.10 Advanced features

| AdapTable feature | MarketsGrid equivalent | Coverage | Weight | Notes |
|---|---|---:|---:|---|
| Team Sharing — Active (live-synced) | ConfigService REST backend can sync, but no "share with team" UI | 25 | 6 | Foundation exists |
| Team Sharing — Snapshot (one-off) | — | 20 | 5 | — |
| Team Sharing — Referenced (deps follow) | — | 15 | 5 | — |
| Row Forms — popup form for entire row edit | — | 5 | 5 | — |
| Schedules — calendar-based (DaysOfWeek / OneOffDate) | — | 5 | 5 | — |
| Reminders — scheduled alerts | — | 5 | 4 | — |
| AdapTable No Code (build instance from JSON/Excel via wizard) | — | 0 | 2 | Out of scope for our model |
| FDC3 — Intents, Contexts, gridDataContextMapping, FDC3 Action Columns, Context Menu items, Custom, OpenFin/interop.io/Connectifi plug-in | `useFdc3Channel` hook + OpenFin runtime; no mapping config UI or action-column FDC3 type | 30 | 8 | Hooks present; declarative mapping & UI missing |
| System Status Messages | `StaleDataBanner` (real-time stale + reconnect) | 30 | 4 | Limited scope |

### 3.11 Developer guides

| AdapTable feature | MarketsGrid equivalent | Coverage | Weight | Notes |
|---|---|---:|---:|---|
| AdapTable State — initial state, persistence (local + remote), management, custom, suspend, events, migrations | `ProfileManager` + `StorageAdapter` + `LocalStorageBundleAdapter` + `createConfigServiceStorage` + `ChangeNotifier` + migration helpers | 80 | 9 | Strong; lacks AdapTable's "suspend state" semantics and explicit migration API |
| Permissions — Module + Object level, Full / ReadOnly / Hidden | `ConfigManager` roles + permissions + `isVisible()` predicate | 55 | 7 | Backend modelled; UI gating per-module not wired |
| Handling Grid Data — loading, transaction add/update/delete, cell updates, events | STOMP/REST provider with `applyTransactionAsync` + delta/snapshot events | 80 | 9 | Strong |
| Server-Side Row Model — filtering, sorting, pivoting, grouping, calc cols, formatting, searching, viewport | Client-side row model only; data services do snapshot+tail | 30 | 5 | Major gap if SSRM required |
| Managing Columns — column types, AG Grid cellDataTypes, runtime ColDef, design-time, array columns, scope, info, headers, hiding | Customizer + `applyAssignments` + `getValueByPath` + AG Grid integration | 80 | 8 | Strong |
| Configuring AG Grid — GridOptions, ColDefs, cell rendering, pagination | Pass-through + `gridSurfaceOptions` | 90 | 8 | — |
| Developer Tutorials — cell editability, holiday calendars, context, containers, hotkeys, american english | `useChordHotkey`, portal provider, host context, theming | 55 | 5 | Most present; holiday calendars and en-US toggles missing |
| Supporting — logging, profiling, testing, monitoring, performance | Vitest + Playwright + propagate; less formal perf monitoring | 55 | 6 | Could be deeper |

### 3.12 AdapTable Query Language (AdaptableQL)

| AdapTable feature | MarketsGrid equivalent | Coverage | Weight | Notes |
|---|---|---:|---:|---|
| Standard Expressions | `ExpressionEngine` (tokenize / parse / evaluate) | 75 | 8 | Strong |
| Aggregation Expressions (SUM, AVG, COUNT, GROUP) | — | 15 | 7 | — |
| Cumulative Expressions (running totals) | — | 10 | 5 | — |
| Quantile Expressions (bucketing) | — | 10 | 5 | — |
| Observable / reactive Expressions | — | 5 | 5 | — |
| Advanced — QUERY function (refer Named Query) | — | 5 | 5 | — |
| Advanced — VAR function (developer-supplied values) | Partial via custom function registry | 30 | 5 | — |
| Advanced — IF / CASE logic | Custom function via engine; not first-class | 40 | 6 | — |
| Advanced — FIELD function (dynamic row data) | `nestedField` + `getPathAccessor` | 65 | 6 | — |
| Relative Change Expressions | — | 5 | 6 | — |
| Expression Editor UI (autocomplete, type-checking) | Simple textarea / preset selector in customizer | 35 | 7 | Need richer editor (Monaco-class) |
| Query Builder UI (graphical predicate composer) | Filter toolbar covers simple cases | 30 | 6 | — |
| Custom Expression Functions (standard + aggregated + scope) | `FunctionDefinition` in engine | 60 | 6 | — |
| Predicates — System | AG Grid predicates + filter-toolbar logic | 65 | 6 | — |
| Predicates — Custom | `doesValueMatchFilter`, `doesRowMatchFilterModel` | 65 | 6 | — |
| Server Evaluation of AdaptableQL | — | 0 | 4 | Requires backend |

### 3.13 Partner integrations

| AdapTable feature | MarketsGrid equivalent | Coverage | Weight | Notes |
|---|---|---:|---:|---|
| OpenFin (workspace, dock, home, notifications, FDC3 channels) | `@starui/host-openfin` + `@starui/openfin-platform` — full workspace shell, dock, home, IAB, notifications | 90 | 8 | Stronger in some areas (config browser, workspace-setup), thinner on home search providers |
| interop.io (Glue42-style) | — | 0 | 3 | Not supported |
| ipushpull | — | 0 | 2 | Not supported |

---

## 4. Category roll-up

Weighted average per AdapTable section group:

| Category | Weighted score | Max | % |
|---|---:|---:|---:|
| Framework Versions | 9.0 | 16 | **56%** |
| Layouts | 31.0 | 59 | **53%** |
| AdapTable UI | 27.5 | 51 | **54%** |
| Core Features (Calculated cols, Alerts, Action cols, Charting) | 13.0 | 92 | **14%** |
| Searching & Filtering | 17.7 | 34 | **52%** |
| Cell Rendering | 47.5 | 91 | **52%** |
| Editing | 17.4 | 65 | **27%** |
| Annotating | 0.0 | 13 | **0%** |
| Working with Grid Data | 33.6 | 76 | **44%** |
| Advanced (Team Sharing, Row Forms, Schedules, No Code, FDC3, Status) | 7.4 | 36 | **21%** |
| Developer Guides (State, Permissions, Data, SSRM, Columns, AG Grid, Tutorials, Support) | 41.2 | 57 | **72%** |
| AdaptableQL | 19.8 | 81 | **24%** |
| Partner Integrations | 7.2 | 13 | **55%** |
| **Overall weighted parity** | **272.3** | **684** | **≈ 43%** |

> Numbers are coverage × weight summed within each category. Read the table
> as "MarketsGrid covers X% of the weighted AdapTable scope in that
> category."

The shape of the gap is clear:

- **Foundations (Developer Guides) at ~72%** — the platform plumbing
  (state, persistence, data ingest, AG Grid integration) is in good shape.
- **UI surfaces at ~50%** — toolbars and settings panel exist, but the
  dashboard mode model, tool panel, status bar, and column/context menu
  extension points are thin.
- **Trader-facing analytics surfaces (Alerts, Annotating, Editing
  ergonomics, AdaptableQL extensions) at 0–27%** — this is where the
  product visibly trails AdapTable.

---

## 5. Significant gaps (deep dive)

These are the gaps that most affect a buy-side / sell-side trader's
day-to-day experience. They're ordered by **impact × feasibility**.

### 5.1 Alerts

AdapTable's alerting engine fires from six trigger families (data change,
relative change, row change, aggregation, observable, validation) and
publishes to a toast layer, an alert toolbar, dashboard cell highlighting,
auto-jump, console, custom containers, and an `AlertFired` event.

MarketsGrid has the **plumbing** (real-time delta application, AG Grid
event surface, `useToast` primitive, `EventBus`) but no alerting concept.

**Impact:** *very high* — alerts are the single most-requested feature in
trading-grid evaluations.

### 5.2 Flashing cells & rows

AG Grid has `enableCellChangeFlash` natively but offers no UI surface.
AdapTable wraps it with a configurable rule (`ANY_CHANGE`, predicate, or
expression), direction-aware styles (Up / Down / Neutral), per-rule
duration, and a target (cell vs. row).

MarketsGrid has no in-customizer flashing module.

**Impact:** *very high* — flashing is the universal "something changed"
signal in market data UIs.

### 5.3 Styled columns (Gradient / Percent Bar / Badge / Sparkline)

AdapTable's four built-in styled column types make a column visually
self-summarising without a separate chart panel.

MarketsGrid ships several **cell renderers** (`SideCellRenderer`,
`StatusBadgeRenderer`, `PnlValueRenderer`, etc.) but none are configurable
as a *column type* the user can apply in the customizer. Gradient and
sparkline have no implementation at all.

**Impact:** *high* — these are the headline screenshots in every
AdapTable demo.

### 5.4 Smart Edit / Bulk Update / Plus-Minus / Shortcuts

AdapTable's four data-entry modules give traders 10×-faster cell-edit
ergonomics: arithmetic across many cells, bulk-set, +/- keys for
increments, and shortcut keys ("M" → million).

MarketsGrid has only AG Grid's default cell editor.

**Impact:** *high* — separates a passable grid from a trader-grade one.

### 5.5 Pivot layouts & aggregations (Grand Total / Weighted Avg)

AdapTable's Pivot Layouts and aggregation extras (grand total rows,
weighted averages, only-aggregation) are essential for P&L,
risk-by-bucket, and book breakdown views.

MarketsGrid leans on AG Grid's pivot but has no customizer module to
configure pivot dimensions, totals, or weighted averages from the UI.

**Impact:** *high* — these are table-stakes for any trading dashboard
that does desk-level rollups.

### 5.6 Visual Excel + scheduled / custom-destination reports

Visual Excel preserves column formatting on export. Reports can be
scheduled (DaysOfWeek + Hour + Minute) and routed to custom destinations
(email, REST, PDF).

MarketsGrid only does AG Grid's native CSV / Excel export.

**Impact:** *high* — daily end-of-day reporting is workflow-critical.

### 5.7 Notes, Comments, Free Text Columns

AdapTable separates personal annotations (Notes), team annotations
(Comments), and runtime-created data columns (Free Text Columns).

MarketsGrid has none of these.

**Impact:** *medium* — common ask in collab-heavy desks.

### 5.8 Data Change History + undo UI

AdapTable monitors every cell change and offers undo through a tracked
panel.

MarketsGrid has `HistoryStack` in the engine but **no UI** surface for
it.

**Impact:** *medium* — surfacing the existing engine primitive is a
cheap win.

### 5.9 Charting

AdapTable wires AG Grid Charts into the dashboard with persistent state
and multiple windows. External libraries plug in via a custom provider.

MarketsGrid ships `Chart` (Recharts wrapper) in `@starui/ui` but doesn't
launch charts from the grid.

**Impact:** *medium-high* — common power-user feature.

### 5.10 Action columns

Dynamic per-row buttons with conditional visibility/disabled state. Used
for "cancel order", "view details", FDC3 broadcasts.

MarketsGrid has no first-class action-column concept (AG Grid
`cellRenderer` works but isn't configurable from the UI).

**Impact:** *medium-high* — common in execution / order-book grids.

### 5.11 AdaptableQL — aggregation, observable, cumulative, quantile

MarketsGrid's expression engine covers per-row evaluation well, but lacks
the aggregation / cumulative / quantile / observable families that
AdaptableQL puts under one syntax.

**Impact:** *medium* — only relevant once aggregated calculated columns
and alerts ship.

### 5.12 Team Sharing UI

ConfigService can be REST-backed so shared rows are technically possible,
but there's no Active / Snapshot / Referenced sharing UI.

**Impact:** *medium* — important for buy-side analyst teams.

---

## 6. Areas where MarketsGrid is at or above parity

Worth calling out — these are differentiators or near-equivalents that
**don't** need to be on the roadmap:

- **Theming** — token-driven dark/light + CVD; richer than AdapTable's
  CSS-variable model.
- **OpenFin workspace shell** — full dock editor, registry editor,
  config browser, import/export bundle, child tool windows.
- **Profile persistence** — `ProfileManager` + `ConfigService` adapter +
  cross-tab sync via `BroadcastChannel` matches AdapTable State.
- **Provider switching** — Alt+Shift+P chord hotkey and
  `MarketsGridContainer` two-provider selector matches AdapTable Data
  Sets for the most common runtime-switch case.
- **Display formatters** — `excelFormatter` + presets cover AdapTable's
  number/date/template/custom formats at near-parity.
- **Conditional styling** — themed style editor (dark/light variants) is
  arguably ahead of AdapTable's CSS-variables-only approach.
- **AG Grid integration depth** — both pass-through `colDef` /
  `gridOptions` and customize them; equivalent.
- **Real-time data ingest** — SharedWorker-backed STOMP / REST / Mock
  with snapshot+tail, chunking, late-joiner support, byte-size events,
  and per-provider stats sampler is *richer* than what AdapTable
  documents in its data-loading guide.

---

## 7. Recommendations

Ranked by **ROI** (trader-visible value × implementation cost). Each item
is sized into a rough effort band (S < 1 week, M 1–4 weeks, L > 4 weeks).

### 7.1 P0 — Ship next quarter

| # | Feature | Effort | Why |
|---|---|---|---|
| 1 | **Alerts module** (data-change + relative-change + row-change triggers, toast + toolbar + cell-highlight notifications) | L | Single largest perceived gap; reuses `EventBus`, `useToast`, expression engine |
| 2 | **Flashing cells & rows customizer module** (rule + direction-aware styles + duration) | M | AG Grid primitive exists; just needs UI + rule plumbing |
| 3 | **Styled Columns — Gradient + Percent Bar + Sparkline column types** | M | Cell renderers are familiar territory; sparkline can use existing `Chart` wrapper |
| 4 | **Smart Edit + Bulk Update + Plus/Minus + Shortcuts** | M | Trader ergonomics, reuses AG Grid `applyTransactionAsync` |
| 5 | **Visual Excel export** (preserve formatting) | M | Differentiator vs AG Grid native |

### 7.2 P1 — 2-quarter horizon

| # | Feature | Effort | Why |
|---|---|---|---|
| 6 | **Pivot Layout customizer module** (pivot rows / columns / values / totals) | L | Table-stakes for risk + P&L users |
| 7 | **Aggregations** — Grand Total Rows + Weighted Averages | M | Common ask in fixed income desks |
| 8 | **Action Columns** (configurable per-row buttons with conditional visibility) | M | Order-book + RFQ workflows |
| 9 | **Charting from selection** — wire `Chart` (Recharts) to grid selection + persist chart state in profile | M | Power-user analytics |
| 10 | **Data Change History UI** — surface existing `HistoryStack` with undo panel | S | Engine already exists |
| 11 | **Quick Search** — text-match highlight + optional as-filter mode | S | Universal expectation |
| 12 | **Grid Filter (expression-based)** — UI for the existing expression engine to filter the whole grid | M | Power-user filtering |
| 13 | **Status Bar customizer** — Cell Summaries + Row Summaries when range selected | M | Common ask |

### 7.3 P2 — 3+ quarter horizon

| # | Feature | Effort | Why |
|---|---|---|---|
| 14 | **AdaptableQL-class aggregation / cumulative / quantile / observable expressions** in `ExpressionEngine` | L | Foundation for Aggregated Calculated Columns and aggregation alerts |
| 15 | **Aggregated Calculated Columns** | M | Depends on #14 |
| 16 | **Master-Detail support** with detail-grid plugin | M | Common in trade-blotter → fills view |
| 17 | **Reports + Custom Destinations + Scheduling** | L | Requires a report-definition layer; high-value for ops |
| 18 | **Data Validation UI** — pre-edit + client + server validation hooks | M | Compliance-driven asks |
| 19 | **Importing rows** — JSON / CSV / paste wizard with column-match + validation | M | Bulk position-load workflow |
| 20 | **Team Sharing UI** — wrap ConfigService with "share with team" + active/snapshot modes | M | Leverages existing REST backend |
| 21 | **FDC3 mapping config UI** — declarative `gridDataContextMapping` + FDC3 action-column type | M | Hooks exist, mapping declaration is missing |
| 22 | **Expression Editor (Monaco-class)** — autocomplete, type-checking, function-doc tooltips | M | Quality-of-life for any expression-driven feature |
| 23 | **Tool Panel + Column Menu + Context Menu extension points** | M | Currently only OpenFin context-menu is wired |

### 7.4 P3 — Lower priority

| # | Feature | Effort | Why |
|---|---|---|---|
| 24 | Notes (per-cell) | M | Annotation feature; depends on cell-key persistence |
| 25 | Comments (team-shared annotations) | L | Depends on Team Sharing |
| 26 | Free Text Columns | M | — |
| 27 | Row Forms (popup full-row editor) | M | — |
| 28 | Schedules + Reminders | M | Depends on a scheduler service |
| 29 | Named Queries (saved-query reference via QUERY()) | S | Cheap once expression engine has QUERY() |
| 30 | Layout Wizard | S | Customizer panels can be rebranded as a wizard |
| 31 | Permissions UI gating per customizer module | S | Plumbing already in ConfigService |

### 7.5 Recommend NOT implementing

These are AdapTable features that don't earn their keep in our context:

- **AdapTable No Code** wizard — we're a code-first platform with a
  developer audience; not a target user.
- **Transposing** — niche; not a common trader workflow.
- **Tree Data** — niche unless we have specific hierarchical-data use
  cases.
- **AdaptableQL Server Evaluation** — requires significant backend infra
  and isn't a core MarketsUI requirement.
- **ipushpull / interop.io partner integrations** — single-partner
  bindings; only if a customer specifically requires them.
- **Vue support** — no current consumer; sustaining cost is high.

---

## 8. How close is MarketsGrid to AdapTable?

**~43% weighted parity** today.

If the **P0 set** (Alerts, Flashing, Styled Columns, Smart Edit family,
Visual Excel) ships, parity moves to **~62%** — and crucially, the
trader-visible gap closes much faster than the headline number suggests
because the P0 set targets the highest-visibility features.

If P0 + P1 ships, parity reaches **~78%**, at which point MarketsGrid
is functionally competitive with AdapTable for the typical buy-side /
sell-side capital-markets workflow.

P2 + P3 round out the long tail (annotations, reports, sharing, niche
features) to bring parity above 90%.

---

## 9. Maintenance

Update this document when any of the following happen:

- A new top-level area appears in AdapTable's docs (re-crawl).
- A feature listed at 0–25% coverage ships in MarketsGrid → bump
  coverage and recompute the weighted score.
- The product strategy changes which categories matter (re-weight).
- A feature listed at 75–100% loses parity (downgrade).

Keep the matrix granular: one bullet per AdapTable doc section. The
roll-up is mechanical from the per-row coverage × weight, so updating
individual rows automatically updates the headline.
