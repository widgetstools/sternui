# AdapTable for AG Grid — Deep Analysis

A granular feature-by-feature and architectural breakdown of [AdapTable](https://www.adaptabletools.com/docs), the commercial AG Grid extension layer. This document is written for a banking / trading-desk platform team that already builds on AG Grid and is benchmarking AdapTable.

The material is sourced exclusively from the live docs at `https://www.adaptabletools.com/docs/*` (crawled April 2026). URLs are inlined inside each section so each claim can be re-verified.

---

## Table of contents

1. Frameworks & Installation
2. Layouts
3. UI surfaces
4. Core features (calculated columns, alerts, action columns, charting)
5. Searching & filtering
6. Cell rendering, formatting & visual effects
7. Editing
8. Annotating
9. Working with grid data (export, import, sort, select, summarise, transpose, highlight)
10. Advanced (team sharing, row forms, scheduling, no-code, FDC3, system status)
11. Developer APIs (state, permissions, data, row models, column management, tutorials, support)
12. AdapTable Query Language (AQL)
13. FinTech partner integrations
14. Technical reference (AdaptableOptions, API, events, plugins, modules)
15. Architecture write-up

---

## 1. Frameworks & Installation

AdapTable is a wrapper/overlay around AG Grid. It does not replace AG Grid; it instantiates and decorates it. Three official framework adapters wrap an underlying "vanilla" core, plus a vanilla JS entrypoint.

### 1.1 The 9-step integration model

Per [getting-started-integration](https://www.adaptabletools.com/docs/getting-started-integration), every install follows the same steps regardless of framework:

1. Create two HTML containers (default IDs `adaptable` and `grid`).
2. Import core CSS (`@adaptabletools/adaptable/index.css`), optionally the `dark.css` companion.
3. Import named exports (types and `Adaptable`) from `@adaptabletools/adaptable`.
4. Register AG Grid modules (either `AllEnterpriseModule` bundle or selective subset).
5. Define `GridOptions` as a plain object — leave it un-instantiated; AdapTable instantiates the grid.
6. Provide `initialState` containing at minimum one Layout.
7. Build the `AdaptableOptions` object.
8. Initialize via the static async constructor `Adaptable.init({ adaptableOptions, agGridConfig: { gridOptions, modules } })`.
9. Subscribe to the `AdaptableReady` event for post-init wiring.

The constructor returns a Promise that resolves to an `AdaptableApi` (see Section 14) which exposes `eventApi.on(...)` for subscriptions.

### 1.2 Identity, license, primary key

Per [getting-started-key-concepts](https://www.adaptabletools.com/docs/getting-started-key-concepts):

| Property | Purpose |
|---|---|
| `licenseKey` | Commercial license; absence injects a watermark. |
| `adaptableId` | Logical name for this grid instance — used when persisting state. |
| `adaptableStateKey` | Distinguishes multiple stored states for the same instance (e.g. per role). |
| `userName` | Identifies the active user; used by team sharing and permissioning. |
| `primaryKey` | Mandatory. The unique row identifier; many features (Notes, Comments, Free Text Columns) refuse to work with auto-generated primary keys. |
| `adaptableContext` | Free-form developer object surfaced into every callback/event. |

### 1.3 AG Grid module wiring

[getting-started-aggrid-modules](https://www.adaptabletools.com/docs/getting-started-aggrid-modules) — three tiers:

- **Mandatory:** row-model module (`ClientSideRowModelModule` or `ServerSideRowModelModule`), core API modules (`ColumnApiModule`, `RowApiModule`, `CellApiModule`, `EventApiModule`), foundational UI modules (`ColumnMenuModule`, `ContextMenuModule`, `RowGroupingModule`).
- **Per-feature:** `CsvExportModule`, `PivotModule`, `IntegratedChartsModule`, etc.
- **Forbidden:** `SetFilterModule` — it overrides AdapTable's filter implementation and breaks behaviour.

`AllEnterpriseModule` is the simplest path; selective registration is the bundle-size-optimised path.

### 1.4 AdaptableReady lifecycle

Per [getting-started-adaptable-ready](https://www.adaptabletools.com/docs/getting-started-adaptable-ready). The single-fire `AdaptableReady` event fires after init completes. The `AdaptableReadyInfo` payload contains:

- `agGridApi` — direct AG Grid Api
- `adaptableApi` — full AdapTable Api
- `adaptableContext` — pass-through developer context
- `adaptableId`, `userName`, `adaptableStateKey`

This is the recommended hook for dispatching custom container wiring, pre-loading data, or framework-side state binding.

### 1.5 Container setup

[dev-guide-tutorial-providing-containers](https://www.adaptabletools.com/docs/dev-guide-tutorial-providing-containers). `ContainerOptions` supports four resolution forms — string ID, `{ selector }`, raw `HTMLElement`, or a function returning any of these. Slots include:

- `adaptableContainer`, `agGridContainer` (vanilla only)
- `alertContainer`, `modalContainer`, `systemStatusContainer`, `transposedViewContainer`

All slots support function form so containers can be resolved dynamically with `ContainerContext` (provides `adaptableApi`, `userName`, custom context). Shadow DOM environments are supported.

### 1.6 React adapter

[react-overview](https://www.adaptabletools.com/docs/react-overview). Supports React 18 and 19. Wraps `AgGridReact` via the AG Grid `ReactUI` renderer.

- **Custom components:** Toolbar, Tool Panel, Settings Panel, Popup — each accepts a React component reference instead of a vanilla render function.
- **Hooks:** `useAdaptableState`, `useCurrentLayout`, `useAdaptableApi`.
- **No Code:** [react-no-code](https://www.adaptabletools.com/docs/react-no-code) ships the no-code wizard component pre-wrapped.

Beyond installation, the surface is identical to vanilla.

### 1.7 Angular adapter

[angular-overview](https://www.adaptabletools.com/docs/angular-overview). Supports Angular 18–21 (tracks AG Grid Angular's supported range). Wraps the AG Grid Angular component. Custom Angular components for the four extension points (Toolbar, Tool Panel, Settings Panel, Popup). No Code is **not** available in Angular.

### 1.8 Vue adapter

[vue-overview](https://www.adaptabletools.com/docs/vue-overview). Vue 3 only (AG Grid 32+ dropped Vue 2). Same four custom-component slots. Released with AdapTable v19.

### 1.9 Adaptable Id & State Key

[getting-started-adaptable-id](https://www.adaptabletools.com/docs/getting-started-adaptable-id), [getting-started-adaptable-state-key](https://www.adaptabletools.com/docs/getting-started-adaptable-state-key). Together they form the storage key for persisted state. Changing the `adaptableStateKey` in code is the primary mechanism for "resetting" or branching state per environment / role.

---

## 2. Layouts

Layouts are AdapTable's mechanism for swapping configurations of columns, sorting, grouping, filters and aggregations. **At least one Layout is mandatory** (per [handbook-layouts](https://www.adaptabletools.com/docs/handbook-layouts)).

### 2.1 Two layout kinds

- **Table Layout** — standard rows-and-columns view.
- **Pivot Layout** — engages when AG Grid is in pivot mode.

The active layout is the "Current Layout"; runtime mutation auto-persists. Layouts can be saved manually, extended with object tags (to reference styles/alerts/reports without per-layout duplication), and synchronised across instances via the Layout Changed event.

### 2.2 Table Layout

[handbook-layouts-table](https://www.adaptabletools.com/docs/handbook-layouts-table). Configuration shape (extends `LayoutBase`):

| Property | Function |
|---|---|
| `Name` | Layout identifier |
| `TableColumns` | Array of column IDs to include |
| `ColumnVisibility` | Visibility map |
| `ColumnSizing` | Width specs (px or flex) |
| `ColumnPinning` | Left/right pin map |
| `ColumnSorts` | Multi-column sort def |
| `ColumnHeaders` | Friendly-name overrides |
| `ColumnFilters` | Predicate-based filters per column |
| `GridFilter` | A single AQL boolean expression for the whole grid |
| `RowGroupedColumns` | Grouped-by columns |
| `TableAggregationColumns` | Per-column aggregation definitions |
| `RowSummaries` | Pinned summary rows |
| `RowGroupValues` | Expand/collapse memory |
| `AutoSizeColumns` | Auto-sizing toggle |

Table-layout sub-features each have their own page: [column-order](https://www.adaptabletools.com/docs/handbook-layouts-table-column-order), [column-visibility](https://www.adaptabletools.com/docs/handbook-layouts-table-column-visibility), [column-sizing](https://www.adaptabletools.com/docs/handbook-layouts-table-column-sizing), [column-pinning](https://www.adaptabletools.com/docs/handbook-layouts-table-pinning), [column-sorting](https://www.adaptabletools.com/docs/handbook-layouts-table-sorting), [column-headers](https://www.adaptabletools.com/docs/handbook-layouts-table-column-headers), [grouping-filtering](https://www.adaptabletools.com/docs/handbook-layouts-table-grouping-filtering), [row-selection](https://www.adaptabletools.com/docs/handbook-layouts-table-row-selection).

### 2.3 Pivot Layout

[handbook-layouts-pivot](https://www.adaptabletools.com/docs/handbook-layouts-pivot). Mutually exclusive with `TableColumns`. Properties:

- `PivotGroupedColumns` — column IDs that become row groups.
- `PivotColumns` — column IDs that fan out across the X axis.
- `PivotAggregationColumns` — `{ ColumnId, AggFunc }[]`.
- `ColumnSizing`, `SuppressAggFuncInHeader`.

Sub-features cover [defining](https://www.adaptabletools.com/docs/handbook-layouts-pivot-defining), [formatting](https://www.adaptabletools.com/docs/handbook-layouts-pivot-formatting), [filtering](https://www.adaptabletools.com/docs/handbook-layouts-pivot-filtering), [sorting](https://www.adaptabletools.com/docs/handbook-layouts-pivot-sorting), [sizing](https://www.adaptabletools.com/docs/handbook-layouts-pivot-sizing), [selecting](https://www.adaptabletools.com/docs/handbook-layouts-pivot-selecting), [pivot result columns](https://www.adaptabletools.com/docs/handbook-layouts-pivot-result-columns), [pivot column groups](https://www.adaptabletools.com/docs/handbook-layouts-pivot-column-groups), [pivot total columns](https://www.adaptabletools.com/docs/handbook-layouts-pivot-total-columns), and the [pivot wizard](https://www.adaptabletools.com/docs/handbook-layouts-wizard-pivot).

### 2.4 Row groups & aggregations

[handbook-grouping-rows](https://www.adaptabletools.com/docs/handbook-grouping-rows). Sub-pages: expand/collapse behaviour, formatting, filtering, sorting, grouped-row content.

[handbook-aggregation](https://www.adaptabletools.com/docs/handbook-aggregation):

- AG Grid's standard agg functions plus AdapTable's two custom ones.
- **Weighted Average** (`type: 'weightedAverage', weightedColumnId: '...'`) — first-class. Three implementation paths: Layout aggregation, Cell/Row Summary, or AQL `AVG([col], WEIGHT([weight]))`. See [handbook-aggregation-weighted-average](https://www.adaptabletools.com/docs/handbook-aggregation-weighted-average).
- **Only** aggregation — returns the value if all rows agree, otherwise blank.
- **Grand Total Row** — `top | bottom | true`. See [grand-total-row](https://www.adaptabletools.com/docs/handbook-aggregation-grand-total-row).
- `SuppressAggFuncInHeader` removes AG Grid's "(sum) Price" prefix per layout.

### 2.5 Column groups, master-detail, tree data

- [Column Groups](https://www.adaptabletools.com/docs/handbook-grouping-columns) with expand/collapse and formatting subpages.
- [Master Detail](https://www.adaptabletools.com/docs/handbook-master-detail) — provided by `masterDetailAgGridPlugin`. Each detail grid is an **independent** AdapTable instance configured via `detailAdaptableOptions`. `onDetailInit` callback fires per detail. Limitations: only one nesting level; no combined master+detail export.
- [Tree Data](https://www.adaptabletools.com/docs/handbook-tree-data-grid) — supported but disables Row Grouping and Pivoting. Tree column auto-id is `_ag-Grid-AutoColumn_`. Quick Search and Column Filters work; tree column auto-uses the In Filter.

### 2.6 Layout sync, default layouts, monitoring

- [updating](https://www.adaptabletools.com/docs/handbook-layouts-updating), [saving](https://www.adaptabletools.com/docs/handbook-layouts-saving), [extending](https://www.adaptabletools.com/docs/handbook-layouts-extending), [default-props](https://www.adaptabletools.com/docs/handbook-layouts-default-props), [synchronising](https://www.adaptabletools.com/docs/handbook-layouts-synchronising), [monitoring](https://www.adaptabletools.com/docs/handbook-layouts-monitoring).
- Synchronisation uses the **Layout Changed** event — keep separate Table/Pivot layouts and propagate filters via app code rather than mutating one layout.

---

## 3. UI surfaces

### 3.1 Settings Panel

[ui-settings-panel](https://www.adaptabletools.com/docs/ui-settings-panel). One section per state-bearing module. Two window types: Modal (centered with backdrop) and Window (movable/resizable, default). Opens from Dashboard, Tool Panel, Status Bar, Column Menu, or Context Menu. Custom panels can be added; `alwaysShowInDashboard`, `alwaysShowInToolPanel`, `showDocumentationLinks` control visibility/links. Respects per-module entitlements.

### 3.2 Dashboard

[ui-dashboard](https://www.adaptabletools.com/docs/ui-dashboard). Sits above AG Grid. Composed of:

- **Tabs** grouping toolbars.
- **Module Toolbars** (built-in, one per feature) and **Custom Toolbars** (developer content).
- **Dashboard Buttons** — module shortcuts and custom buttons. See [dashboard-buttons](https://www.adaptabletools.com/docs/ui-dashboard-buttons).
- **Quick Search** input on the right edge.

Five **Dashboard Modes**: Default, Inline (collapsible header + tab dropdown), Collapsed (toolbars on demand), Floating (minimal), Hidden. See [ui-dashboard-modes](https://www.adaptabletools.com/docs/ui-dashboard-modes).

Custom toolbar definitions are configured via [ui-dashboard-custom-toolbars](https://www.adaptabletools.com/docs/ui-dashboard-custom-toolbars) and emit a `CustomToolbarConfigured` event.

### 3.3 Tool Panel

[ui-tool-panel](https://www.adaptabletools.com/docs/ui-tool-panel). Lives inside AG Grid's right sidebar.

- **Module Tool Panels** — one per feature (e.g. Layout selector).
- **Custom Tool Panels** — buttons or custom content.
- **Buttons:** module buttons (open settings panels) and custom buttons. Note: only module buttons are configurable through the runtime UI; custom buttons must be design-time.
- Configuration split: AG Grid `GridOptions` controls icons/order/dimensions; AdapTable state controls visibility and definitions.

### 3.4 Status Bar

[ui-status-bar](https://www.adaptabletools.com/docs/ui-status-bar). Lives in AG Grid's status bar slot. Three locations (left/center/right). Up to 3 AdapTable Status Panels total, each containing unlimited Module Status Panels. Modules with rich status panels: Alerts, Cell Summary, Charts, Column Filters, Data Set, Export, Grid Filter, Layout, Quick Search, Theme.

### 3.5 Column menu

[ui-column-menu](https://www.adaptabletools.com/docs/ui-column-menu). Combines AG Grid items + AdapTable items + developer items. Configured via `customColumnMenu` (reorder, restructure, remove, add). Tip: `suppressMenuHide: true` keeps the menu dots permanently visible.

### 3.6 Context menu

[ui-context-menu](https://www.adaptabletools.com/docs/ui-context-menu). Same three sources. AdapTable groups copy/paste into one section and hides AG Grid's export (uses its own). Configured via `customContextMenu`. Default structure documented at [ui-context-menu-default-structure](https://www.adaptabletools.com/docs/ui-context-menu-default-structure).

### 3.7 Theming & CSS variables

[handbook-theming](https://www.adaptabletools.com/docs/handbook-theming). Two system themes (`light`, `dark`) plus an OS-following option. Custom themes via `UserThemes` config + custom CSS file. System themes auto-switch AG Grid; custom themes do not.

[handbook-theming-css-variables](https://www.adaptabletools.com/docs/handbook-theming-css-variables). Categories:

- Base (`--ab-base-space`, font sizes, core colours).
- Component-specific (dashboard, settings panel, toolbar).
- Status colours (error/success/warn/info) and semantic action colours (add/edit/delete).
- Typography scale `--ab-font-size-0` through `--ab-font-size-7`.

Variables prefixed `--ab-` or `--ab__`. **Scoped to AdapTable only** — AG Grid theming is a separate concern (see [handbook-theming-aggrid](https://www.adaptabletools.com/docs/handbook-theming-aggrid)).

### 3.8 UI tutorials

[ui-tutorial-overview](https://www.adaptabletools.com/docs/ui-tutorial-overview) covers practical recipes: toast notifications, wizards, editable styles, popups, custom Adaptable Style supplier, displaying buttons, configuring forms, creating icons, loading screen, progress indicators, hiding AdapTable entirely, American English locale, custom colour palettes. The technical reference is at [ui-technical-reference](https://www.adaptabletools.com/docs/ui-technical-reference).

---

## 4. Core features

### 4.1 Calculated Columns

[handbook-calculated-column](https://www.adaptabletools.com/docs/handbook-calculated-column). Four expression types:

| Type | Semantics | Doc |
|---|---|---|
| Standard | Per-row formula | [standard](https://www.adaptabletools.com/docs/handbook-calculated-column-standard) |
| Aggregated | Across multiple rows, optional `GROUP_BY` | [aggregated](https://www.adaptabletools.com/docs/handbook-calculated-column-aggregated) |
| Cumulative | Running totals — `CUMUL(SUM([col]), OVER([sortCol]))` | [cumulative](https://www.adaptabletools.com/docs/handbook-calculated-column-cumulative) |
| Quantile | `QUANT([col], N, GROUP_BY([cat]))` puts rows into N buckets | [quantile](https://www.adaptabletools.com/docs/handbook-calculated-column-quantile) |

Configuration object:

```text
{
  ColumnId,
  FriendlyName,
  Query: { ScalarExpression | AggregatedScalarExpression | ... },
  CalculatedColumnSettings: {
    DataType: 'string'|'number'|'date'|'boolean',
    Filterable, Groupable, Sortable, Pivotable, Aggregatable
  }
}
```

- Aggregated/Cumulative/Quantile do **not** work with the Server-Side Row Model (need full client-side data).
- Calculated Columns can reference each other and are first-class participants in Charts, Alerts, Exports, Pivots.
- AG Grid's `valueCache` is recommended for sort performance.
- External evaluation hook: `evaluateAdaptableQLExternally` (see Section 12.7).

Aggregated functions: `SUM`, `AVG` (with optional `WEIGHT()`), `MIN`, `MAX`, `PERCENTAGE`. See [handbook-calculated-column-referencing](https://www.adaptabletools.com/docs/handbook-calculated-column-referencing) and [configuring](https://www.adaptabletools.com/docs/handbook-calculated-column-configuring).

### 4.2 Alerts

[handbook-alerting](https://www.adaptabletools.com/docs/handbook-alerting). Six types:

| Type | Trigger | Doc |
|---|---|---|
| Data Change | Cell value matches predicate or expression | [data-change](https://www.adaptabletools.com/docs/handbook-alerting-data-change) |
| Relative Change | `ANY_CHANGE`, `PERCENT_CHANGE`, `ABSOLUTE_CHANGE` | [relative-change](https://www.adaptabletools.com/docs/handbook-alerting-relative-change) |
| Row Change | `ROW_ADDED`, `ROW_REMOVED` | [row-change](https://www.adaptabletools.com/docs/handbook-alerting-row-change) |
| Aggregation | Across multiple rows (limits / breaches) | [aggregation](https://www.adaptabletools.com/docs/handbook-alerting-aggregation) |
| Observable | Rx-style; can detect inactivity | [observables](https://www.adaptabletools.com/docs/handbook-alerting-observables) |
| Validation | Rolls back data changes that break the rule | [validation](https://www.adaptabletools.com/docs/handbook-alerting-validation) |

`MessageType` is `Info | Success | Warning | Error` (each with its colour). [Behaviours](https://www.adaptabletools.com/docs/handbook-alerting-behaviours) include toast notification, highlight cell/row, jump to cell, log, prevent edit (validation only), render into custom div. Toast notifications can include forms with Alert Button Actions.

[Alert Notifications](https://www.adaptabletools.com/docs/handbook-alerting-notifications) and [Messages](https://www.adaptabletools.com/docs/handbook-alerting-message). Alerts always also write into the Alert toolbar/tool panel/status bar.

**AlertFired event** ([alert-fired-event](https://www.adaptabletools.com/docs/handbook-alerting-alert-fired-event)) payload `AlertFiredInfo` includes:
- `alert` — the alert that fired
- `adaptableContext`
- For cell-driven: `CellDataChangedInfo` (column, old/new, primary key, full row, timestamp, trigger, `preventEdit`)
- For row-driven: `RowDataChangedInfo` (data rows, row nodes, change type — Load/Add/Update/Delete, timestamp)

Observable Alerts ([handbook-alerting-observables](https://www.adaptabletools.com/docs/handbook-alerting-observables)) expose `ROW_CHANGE`, `GRID_CHANGE`, `ROW_ADDED`, `ROW_REMOVED` and change types `MIN`, `MAX`, `COUNT`, `NONE` (inactivity). Observable expressions accept `WHERE` clauses for filtered monitoring. Use cases: "no updates in 1 hour", "max breach within window", "N rows removed within period". Suspending an alert removes its Rx subscription; un-suspending recreates it.

### 4.3 Action Columns

[handbook-action-column](https://www.adaptabletools.com/docs/handbook-action-column). Special columns hosting buttons. Definition:

```text
{ columnId, friendlyName, actionColumnSettings, actionColumnButton: ActionColumnButton | ActionColumnButton[] }
```

`ActionColumnButton` props (each can be value or function of `ActionColumnContext`): `label`, `buttonStyle` (variant + tone), `icon`, `onClick`, `hidden`, `disabled`. Context provides `rowData`, `rowNode`, `primaryKeyValue`, `adaptableApi`.

Built-in commands ([action-column-command](https://www.adaptabletools.com/docs/handbook-action-column-command)): `create`, `clone`, `edit`, `delete` — all wired automatically into Row Forms.

### 4.4 Charting

[handbook-charts](https://www.adaptabletools.com/docs/handbook-charts). Uses AG Grid Integrated Charts with persistence wrapper. `saveChartBehaviour`: `auto | manual | none`. Charts can be hosted in arbitrary developer-supplied containers. ReadOnly entitlement allows view+create but blocks save.

External chart libraries supported via [external](https://www.adaptabletools.com/docs/handbook-charts-external) — AdapTable saves and re-renders developer-provided charts.

Known limitation: cross-filter is partial — grid filters update charts, chart selections do not filter the grid.

---

## 5. Searching & filtering

### 5.1 Quick Search

[handbook-quick-search](https://www.adaptabletools.com/docs/handbook-quick-search). Wraps AG Grid Find. Searches across data columns, dynamic columns (row-grouped, tree), and AdapTable special columns (calculated, freetext). **Operates on display values only** (e.g. "£1,500" won't match "1500"). Three style levels: `CellMatchStyle`, `TextMatchStyle`, `CurrentTextMatchStyle`. Optional [as-filter](https://www.adaptabletools.com/docs/handbook-quick-search-as-filter) mode hides non-matching rows. Configurable column inclusion/exclusion, placeholder, session persistence, custom search implementations.

### 5.2 Column Filters

[handbook-column-filter](https://www.adaptabletools.com/docs/handbook-column-filter). Two UI surfaces:

- **Filter Form** — full predicate UI from Column Menu / Tool Panel.
- **Filter Bar** — beneath column headers, instant filtering with wildcards.

Predicates are AND-combined by default, optionally OR. **Multiple predicates only available in Filter Forms.** Filters evaluate underlying values, except `In` Predicate which respects display formats.

[In Filter](https://www.adaptabletools.com/docs/handbook-column-filter-in-filter) — multi-value picker. [System Filters](https://www.adaptabletools.com/docs/handbook-column-filter-system-filters), [Custom Filters](https://www.adaptabletools.com/docs/handbook-column-filter-custom-filters). [Manually Applying Filters](https://www.adaptabletools.com/docs/handbook-column-filter-manually-applying) and the [technical reference](https://www.adaptabletools.com/docs/handbook-column-filter-technical-reference).

### 5.3 Grid Filter

[handbook-grid-filter](https://www.adaptabletools.com/docs/handbook-grid-filter). A single AQL boolean expression scoped to the entire grid, attached to a Layout. Combines additively with Column Filters. Unique capability: column-to-column comparisons (`[closed_issues_count] > [closed_pr_count]`). Two UI tools: Query Builder (controls) and Expression Editor (text). Saveable as Named Query.

### 5.4 Data Sets & Forms

[handbook-data-sets](https://www.adaptabletools.com/docs/handbook-data-sets). Mechanism for offering multiple distinct data sources without leaving the **Client-Side Row Model**. All data sets must share column structure (because AdapTable objects are column-based). Selection emits `DataSetSelected` event; subscriber re-populates the grid.

[Data Set Forms](https://www.adaptabletools.com/docs/handbook-data-set-forms) parameterise selection — when the user picks a data set, an Adaptable Form prompts for parameters before fetch.

This is AdapTable's recommended alternative to SSRM for "I have lots of data" scenarios.

### 5.5 Named Queries

[handbook-named-queries](https://www.adaptabletools.com/docs/handbook-named-queries). Saved boolean AQL expressions (`{ Name, BooleanExpression }`) callable via the `QUERY()` function. Loadable from Grid Filter Toolbar; reusable across format/alert/report rules. Restrictable via Expression Options (`isColumnQueryable`, function availability) — particularly relevant for server-evaluation pipelines.

---

## 6. Cell rendering, formatting & visual effects

### 6.1 Format Columns

[handbook-column-formatting](https://www.adaptabletools.com/docs/handbook-column-formatting). Format Column module provides Style + Display Format, with optional rule.

Adaptable Style props: `ForeColor`, `BackColor`, `BorderColor`, `FontWeight`, `FontStyle`, `FontSize`, `Alignment`. Plus the Adaptable Style supplier hook for dynamic styles.

Display formats:

| Type | Doc |
|---|---|
| Numeric | [number](https://www.adaptabletools.com/docs/handbook-column-formatting-display-format-number) |
| String | [string](https://www.adaptabletools.com/docs/handbook-column-formatting-display-format-string) |
| Date (Unicode patterns) | [date](https://www.adaptabletools.com/docs/handbook-column-formatting-display-format-date) |
| Template | [template](https://www.adaptabletools.com/docs/handbook-column-formatting-display-format-template) |
| Custom (developer formatter) | [custom](https://www.adaptabletools.com/docs/handbook-column-formatting-display-format-custom) |

[Column Headers](https://www.adaptabletools.com/docs/handbook-column-formatting-headers) supports header-only styling (no conditions allowed on headers).

### 6.2 Conditional styling

[handbook-column-formatting-conditions](https://www.adaptabletools.com/docs/handbook-column-formatting-conditions). Two flavours:

- **Predicate** ([predicates](https://www.adaptabletools.com/docs/handbook-column-formatting-conditions-predicates)) — AND-only, simpler.
- **Expression** ([expressions](https://www.adaptabletools.com/docs/handbook-column-formatting-conditions-expressions)) — full AQL, AND/OR, multi-column, can be row-scoped.

Real-time evaluation as data updates.

### 6.3 Styled Columns

[handbook-styled-column-overview](https://www.adaptabletools.com/docs/handbook-styled-column-overview). Four styled-column types:

| Type | Data | Notes |
|---|---|---|
| [Gradient](https://www.adaptabletools.com/docs/handbook-styled-column-gradient) | numeric | Reversible for negatives |
| [Percent Bar](https://www.adaptabletools.com/docs/handbook-styled-column-percent-bar) | numeric | Multi-range colours, tooltip, background |
| [Badge](https://www.adaptabletools.com/docs/handbook-styled-column-badge) | numeric or string | Predicate-driven, optional icon |
| [Sparkline](https://www.adaptabletools.com/docs/handbook-styled-column-sparkline) | numeric array | Uses AG Grid sparkline (line/area) |

Styled columns inherit value formatting from the column's standard formatting.

### 6.4 Flashing cells & rows

[handbook-flashing-cell](https://www.adaptabletools.com/docs/handbook-flashing-cell). Five components:

1. **Scope** — Column Scope (see Section 11.4) selects targets.
2. **Rule** — predicate or AQL expression. Common: `ANY_CHANGE()`.
3. **Change Styles** — Up / Down / Neutral.
4. **Duration** — milliseconds or `always` (manual clear).
5. **Target** — `cell` or `row` (see [flashing-row](https://www.adaptabletools.com/docs/handbook-flashing-row)).

Format precedence (highest to lowest): Flashing Cells → Quick Search → Format Column.

---

## 7. Editing

### 7.1 Editing modules

[handbook-editing](https://www.adaptabletools.com/docs/handbook-editing). Four primary modules:

| Module | Role |
|---|---|
| Smart Edit | Apply one math op across many cells in one column |
| Bulk Update | Replace many cells with a single new value |
| Plus Minus | Increment/decrement by + / - keys |
| Shortcuts | Single-key multipliers/operations during numeric edit |

**Smart Edit** ([smart-edit](https://www.adaptabletools.com/docs/handbook-editing-smart-edit)): four built-in ops (add, subtract, multiply [default], divide). Custom ops via `smartEditCustomOperations` (`{ name, operation(value, smartEditValue, ctx) }`).

**Bulk Update** ([bulk-update](https://www.adaptabletools.com/docs/handbook-editing-bulk-update)): text/numeric/date columns. Preview table shows valid vs invalid edits before applying.

**Plus Minus** ([plus-minus](https://www.adaptabletools.com/docs/handbook-editing-plus-minus)): scoped via Column Scope.

**Shortcuts** ([shortcut](https://www.adaptabletools.com/docs/handbook-editing-shortcut)): rule = `{ Scope, Key, Operation, Value }`. Operations Add/Subtract/Multiply/Divide. Works inside Row Forms.

[Custom Edit Values](https://www.adaptabletools.com/docs/handbook-editing-custom-column-values) and [Editable Cell Styling](https://www.adaptabletools.com/docs/handbook-editing-cell-styling).

### 7.2 Validation tiers

[handbook-validating](https://www.adaptabletools.com/docs/handbook-validating). Three tiers:

| Tier | Mechanism | When |
|---|---|---|
| Pre-Edit | `isCellEditable(...)` — read-only based on existing values | Before user types |
| Client | Validation Alerts with `PreventEdit` behaviour | After user enters value |
| Server | `validateOnServer(...)` returns allow/disallow/override async | After client tier |

Server tier returns `{ success, value? }` allowing the server to mutate the proposed value.

### 7.3 Data Change History

[handbook-monitoring-data-change-history](https://www.adaptabletools.com/docs/handbook-monitoring-data-change-history). Tracks user edits and ticking updates with timestamp + source. Modes: Off, Active, Suspended (preserve history, stop new), Inactive (clear history). Can render Undo buttons per row ([buttons](https://www.adaptabletools.com/docs/handbook-monitoring-data-change-history-buttons)). Configured via `DataChangeHistoryOptions` (`activeByDefault`, change-type filter, undo enable).

### 7.4 Cell editors

[handbook-cell-editors](https://www.adaptabletools.com/docs/handbook-cell-editors). Four built-ins:

| Editor | Auto-active |
|---|---|
| Numeric | yes for numeric cols |
| Date Picker | yes for date cols |
| Select dropdown | only when configured |
| Percentage | only when configured |

GridOptions cell editors override these. Numeric and date editors also appear in filter components.

---

## 8. Annotating

### 8.1 Notes

[handbook-notes](https://www.adaptabletools.com/docs/handbook-notes). Personal cell-level annotations stored in **AdapTable State**, not in the data source. One note per cell (editable). Created via Context Menu "Add Note" or in initial state. Requires a real Primary Key. Object: `{ text, columnId, primaryKeyValue, timestamp }`.

### 8.2 Comments

[handbook-comments](https://www.adaptabletools.com/docs/handbook-comments). Threaded, multi-author, persisted via developer-supplied `loadComments` / `persistComments`-style callbacks. `isCellCommentable` controls eligibility. Users can only modify their own comments. Requires real Primary Key.

### 8.3 Free Text Columns

[handbook-freetext-column](https://www.adaptabletools.com/docs/handbook-freetext-column). User-editable columns whose values live in AdapTable State. Object:

```text
{
  ColumnId, FriendlyName, DataType: 'text'|'number'|'boolean'|'date',
  DefaultValue, FreeTextStoredValues: { [pk]: value },
  FreeTextColumnSettings: { filterable, sortable, groupable, resizable, ... }
}
```

Always editable (unlike Calculated Columns). Requires real Primary Key.

---

## 9. Working with grid data

### 9.1 Reports & exports

[handbook-exporting](https://www.adaptabletools.com/docs/handbook-exporting). Three-step export model: report (what), format (how), destination (where).

- **System Reports**: all data, visible rows, selected cells.
- **Custom Reports** ([custom](https://www.adaptabletools.com/docs/handbook-exporting-reports-custom)): boolean AQL expression filters rows; column subset chosen; re-evaluated each run.

Formats: [Excel](https://www.adaptabletools.com/docs/handbook-exporting-reports-format-type-excel), [Visual Excel](https://www.adaptabletools.com/docs/handbook-exporting-reports-format-type-visual-excel) (with formatting/styles), [CSV](https://www.adaptabletools.com/docs/handbook-exporting-reports-format-type-csv), [JSON](https://www.adaptabletools.com/docs/handbook-exporting-reports-format-type-json).

Destinations: Download, Clipboard (CSV/JSON only), Custom (developer endpoint via `customDestinations` — typical use cases: email, PDF, REST). [destinations-custom](https://www.adaptabletools.com/docs/handbook-exporting-destinations-custom).

[Scheduling](https://www.adaptabletools.com/docs/handbook-exporting-scheduling), [Processing](https://www.adaptabletools.com/docs/handbook-exporting-processing), [Formatting](https://www.adaptabletools.com/docs/handbook-exporting-formatting-reports), [Configuring](https://www.adaptabletools.com/docs/handbook-exporting-configuring). Server-side processing supported.

### 9.2 Importing

[handbook-importing](https://www.adaptabletools.com/docs/handbook-importing). JSON, CSV, paste-from-text. Three modes: update existing rows, add new, replace grid. Auto-matches input headers to `columnId` then `friendlyName`, prompts for manual mapping. `validate(...)` callback returns `DataImportValidationError[]` to enforce business rules.

### 9.3 Sorting / Selecting / Summarising / Transposing / Highlighting

- [Sorting](https://www.adaptabletools.com/docs/handbook-custom-sorting) — custom comparers (Column Scope based).
- [Selecting](https://www.adaptabletools.com/docs/handbook-selecting) — programmatic select via Grid API; `SelectionChanged` event with detailed payload; checkbox selection ([checkboxes](https://www.adaptabletools.com/docs/handbook-selecting-checkboxes)); RowSelection on Layout configures mode/checkboxes.
- [Summarising](https://www.adaptabletools.com/docs/handbook-summarising) — Cell Summaries (per-selection stats, customisable) and Row Summaries (pinned aggregation rows, per Table Layout via `ColumnsMap`).
- [Transposing](https://www.adaptabletools.com/docs/handbook-transposing) — flips axes for review.
- [Highlighting & Jumping](https://www.adaptabletools.com/docs/handbook-highlighting-jumping) — programmatic visual focus.

---

## 10. Advanced

### 10.1 Team Sharing

[handbook-team-sharing](https://www.adaptabletools.com/docs/handbook-team-sharing). Two modes:

- **Snapshot** — upload, then disconnected. Future edits don't sync.
- **Active** — persistent linkage. AdapTable syncs local changes back across all users.

[Referenced sharing](https://www.adaptabletools.com/docs/handbook-team-sharing-referenced) auto-uploads dependencies (e.g. a Layout's calculated columns). UUID matching prevents duplicates. Multiple teams supported via per-team storage keys.

Configuration: `enableTeamSharing: true` plus `loadSharedEntities` and `persistSharedEntities` callbacks. `Custom` configuration documented at [team-sharing-custom](https://www.adaptabletools.com/docs/handbook-team-sharing-custom).

### 10.2 Row Forms

[handbook-row-form](https://www.adaptabletools.com/docs/handbook-row-form). Four types: Create, Clone, Edit, Delete (Delete is non-visible — fires an event for the app to handle). Triggered via Row Form API (`displayCreateRowForm`, etc.) or Action Column Commands.

Adaptive controls per data type: text input, Numeric Cell Editor, Date Picker, checkbox. Read-only cols display values without inputs. Select cell editors render dropdowns. Custom buttons + `autoHandle` for manual row management.

### 10.3 Schedules & Reminders

[handbook-scheduling](https://www.adaptabletools.com/docs/handbook-scheduling). Two schedulable activities: Reminders (time-based alerts) and Reports.

Schedule shape:

```text
{ DaysOfWeek: ['Monday','Friday'], Hour: 17, Minute: 30 }
// or one-off: { OneOffDate: 'yyyy-mm-dd', Hour, Minute }
```

Schedules are state objects; users can create/edit/suspend/delete. Reminders display in toolbar/tool panel/status bar when fired.

### 10.4 AdapTable No Code

[handbook-no-code](https://www.adaptabletools.com/docs/handbook-no-code). Plugin (`nocode()`) enabling end-users to upload JSON/Excel and dynamically configure a grid. State persists per instance ID. Subset of options supported. Not available in Angular.

### 10.5 FDC3

[handbook-fdc3](https://www.adaptabletools.com/docs/handbook-fdc3). Four configuration concepts:

- **Mappings** ([mappings](https://www.adaptabletools.com/docs/handbook-fdc3-mappings)) — `gridDataContextMapping` connects FDC3 context types (e.g. `fdc3.instrument`) to columns/fields. Two reference prefixes: `_colId.{id}` for grid columns, `_field.{name}` for raw data fields. 14 FDC3 2.0 contexts supported (Instrument, Country, Currency, Contact, Organization, Portfolio, Position, etc.).
- **Contexts** ([context](https://www.adaptabletools.com/docs/handbook-fdc3-context)) — broadcast and listen.
- **Intents** ([intents](https://www.adaptabletools.com/docs/handbook-fdc3-intents)) — raise from context menu / action column buttons; listen via handler functions.
- **UI Components** ([ui-components](https://www.adaptabletools.com/docs/handbook-fdc3-ui-components)) — FDC3 Action Columns and Context Menu items defined in FDC3 Options.

[Custom FDC3](https://www.adaptabletools.com/docs/handbook-fdc3-custom) supports developer-defined intents/contexts. Connects to OpenFin, interop.io, Connectifi via dedicated plugins. Can also broker between AdapTable instances natively without a container.

### 10.6 System Status Messages

[handbook-system-status-message](https://www.adaptabletools.com/docs/handbook-system-status-message). API-driven runtime notifications. `StatusType`: Info / Success / Warning / Error. Properties: `message`, optional `furtherInformation`, `maxSystemMessagesInStore` (default 100). Surfaces: Settings Panel section, dedicated toolbar, tool panel, dashboard module button (icon/colour reflects latest), status bar, toast, custom div. Long messages get an ellipsis "more" affordance. Session-scoped — not persisted.

---

## 11. Developer APIs

### 11.1 AdapTable State

[dev-guide-adaptable-state](https://www.adaptabletools.com/docs/dev-guide-adaptable-state). State **does not include AG Grid data** — it is purely UI/configuration state.

Lifecycle:

1. **Design time** — developer supplies Initial State (must include at least one Layout).
2. **First load** — Initial State is read into memory and persisted via `persistState` callback.
3. **Subsequent sessions** — `loadState` callback hydrates from storage; user sees the prior session's state.

Persistence:

- Default = browser local storage.
- Remote = developer-supplied `loadState()` and `persistState()` in `stateOptions`.

State module sections include Dashboard, Quick Search, Theme, Tool Panel, Layouts, Calculated Columns, Alerts, Filters, plus 20+ more (mirroring the Modules in Section 14).

Internal architecture: AdapTable uses Redux; consumers should keep their own Redux store separate.

State events ([state-events](https://www.adaptabletools.com/docs/dev-guide-adaptable-state-events)):

- **AdaptableStateChanged** — fires for every change. Payload: `actionName` (over 150 distinct values like `GRID_DATA_EDITED`, `LAYOUT_SELECT`), user, timestamp, before/after snapshots.
- **BeforeAdaptableStateChanges** — pre-change. Payload: current state + Redux Action. Cannot cancel; mutation discouraged.
- **AdaptableStateReloaded**.

[Suspending state](https://www.adaptabletools.com/docs/dev-guide-adaptable-state-suspending) — `SuspendableObject` interface (`IsSuspended`, `IsReadOnly`). API pattern `suspendX` / `unSuspendX`. Not all objects support suspension (Layouts and Calculated Columns don't).

[Migrations](https://www.adaptabletools.com/docs/dev-guide-adaptable-state-migrating-state) — automatic by default. Set `autoMigrateState: false` to opt out and call `AdaptableUpgradeHelper.migrateAdaptableState()` manually with `UpgradeConfig` (`fromVersion`, `toVersion`, custom logging). Hook into `applyState` for app-specific transforms. Migrations only fire on major-version bumps (~once a year).

### 11.2 Permissions

[handbook-permissioning](https://www.adaptabletools.com/docs/handbook-permissioning). Three access levels per Module: **Full**, **ReadOnly**, **Hidden**. `defaultAccessLevel` overridable globally. [Permissioning Modules](https://www.adaptabletools.com/docs/handbook-permissioning-modules), [Permissioning Objects](https://www.adaptabletools.com/docs/handbook-permissioning-objects) — individual objects can override their module's level. **Important**: entitlements are UI-only — they do not block programmatic access via Initial State or API.

### 11.3 Handling grid data

[handbook-managing-grid-data](https://www.adaptabletools.com/docs/handbook-managing-grid-data). Six categories on `gridApi`:

- `loadGridData(...)` — initial population
- `addGridData(...)` — applyTransaction add + RowChanged event
- `updateGridData(...)` — applyTransaction update + event
- `deleteGridData(...)` — applyTransaction remove + event
- `setCellValue(...)` — single-cell update
- Transaction grouping for batch ops

Strong recommendation: use these (not raw AG Grid) so AdapTable can run validation hooks and emit its own events.

[Cell/Row Changed events](https://www.adaptabletools.com/docs/handbook-managing-grid-data-changed-events):

- **RowChanged** — fires only for changes via AdapTable Grid API or Action Column Commands. Payload `RowDataChangedInfo`: `changedAt`, `dataRows`, `rowNodes`, `rowTrigger ∈ {Load, Add, Update, Delete}`, `adaptableContext`.
- **CellChanged** — fires for any cell change (user or background). Payload `CellDataChangedInfo`: `changedAt`, `column`, `oldValue`, `newValue`, `primaryKeyValue`, `rowData`, `trigger` (user/background/revert), `preventEdit`.

### 11.4 Server-Side Row Model

[dev-guide-row-models-server-overview](https://www.adaptabletools.com/docs/dev-guide-row-models-server-overview). Significant caveat: docs explicitly recommend **avoiding SSRM unless > 200,000 rows**. Many features are not auto-applied — server is responsible for filtering, sorting, grouping, pivoting, aggregation.

Bridge functions:

- `getAdaptableFilterState()` — extracts AdapTable filtering config (predicates + expressions) for the server to translate.
- `getAdaptableSortState()` — extracts custom sort definitions.

Developer threads them into AG Grid's `IServerSideDatasource.getRows`.

Sub-pages: [filtering](https://www.adaptabletools.com/docs/dev-guide-row-models-server-filtering), [exporting](https://www.adaptabletools.com/docs/dev-guide-row-models-server-exporting), [sorting](https://www.adaptabletools.com/docs/dev-guide-row-models-server-sorting), [pivoting](https://www.adaptabletools.com/docs/dev-guide-row-models-server-pivoting), [grouping](https://www.adaptabletools.com/docs/dev-guide-row-models-server-grouping), [updating](https://www.adaptabletools.com/docs/dev-guide-row-models-server-updating), [formatting](https://www.adaptabletools.com/docs/dev-guide-row-models-server-formatting), [calculated columns](https://www.adaptabletools.com/docs/dev-guide-row-models-server-calculated-columns), [searching](https://www.adaptabletools.com/docs/dev-guide-row-models-server-searching).

[Viewport Row Model](https://www.adaptabletools.com/docs/dev-guide-row-models-viewport) — even more limited (no filtering, grouping, pivoting, lazy loading, aggregations, transactions). Recommended only for live viewport-only data; otherwise use SSRM.

### 11.5 Managing columns

[dev-guide-columns-overview](https://www.adaptabletools.com/docs/dev-guide-columns-overview). AdapTable creates an [Adaptable Column](https://www.adaptabletools.com/docs/dev-guide-columns-adaptable-column) object per AG Grid column.

- [Column Types](https://www.adaptabletools.com/docs/dev-guide-columns-column-types) — developer-defined buckets like `'price'`, `'calculatedColumn'`, used for scoping.
- [AG Grid Cell Data Types](https://www.adaptabletools.com/docs/dev-guide-aggrid-cell-data-types) — must be set explicitly per ColDef.
- [Managing ColDefs at runtime](https://www.adaptabletools.com/docs/dev-guide-columns-managing-runtime) and [at design time](https://www.adaptabletools.com/docs/dev-guide-columns-configuring-coldefs).
- [Array Columns](https://www.adaptabletools.com/docs/dev-guide-aggrid-array-columns) — for sparkline data.
- [Hiding Columns](https://www.adaptabletools.com/docs/dev-guide-columns-hiding-columns).
- [Column Headers](https://www.adaptabletools.com/docs/dev-guide-columns-column-headers).

**Column Scope** ([scope](https://www.adaptabletools.com/docs/dev-guide-columns-scope)) — used everywhere AdapTable needs to apply something to "the right columns":

```text
Scope: { All: true }                          // every column
Scope: { ColumnIds: ['price', 'pnl'] }
Scope: { DataTypes: ['number'] }
Scope: { ColumnTypes: ['price'] }             // developer-defined types
```

Scope is consumed by Alerts, Validation, Conditional formatting, Custom Sorts, Exports, Flashing, Plus/Minus, Shortcuts.

### 11.6 Configuring AG Grid through AdapTable

[dev-guide-aggrid-configuring-overview](https://www.adaptabletools.com/docs/dev-guide-aggrid-configuring-overview). AdaptableOptions and GridOptions are complementary, not nested. AdapTable instantiates AG Grid; ColDefs can be tuned at design time and at runtime. AG Grid cell renderers, pagination, and the rest remain available unchanged.

Sub-pages: [GridOptions](https://www.adaptabletools.com/docs/dev-guide-aggrid-configuring-gridoptions), [ColDefs](https://www.adaptabletools.com/docs/dev-guide-aggrid-columns), [Cell Rendering](https://www.adaptabletools.com/docs/dev-guide-aggrid-cell-rendering), [Pagination](https://www.adaptabletools.com/docs/dev-guide-aggrid-pagination).

### 11.7 Hotkeys

[dev-guide-tutorial-hotkeys](https://www.adaptabletools.com/docs/dev-guide-tutorial-hotkeys). No built-in hotkey manager. Recommended approaches:

- Mousetrap library: `Mousetrap.bind('alt+shift+s', () => api.scheduleApi.showSchedulePopup())`.
- Native `keydown` listener checking modifiers.

Any `adaptableApi.*Api.show*Popup()` method is bindable. Notable popups: schedule, calculated column, layout, quick search.

### 11.8 Support, logging, profiling, testing, monitoring, performance

[dev-guide-support-overview](https://www.adaptabletools.com/docs/dev-guide-support-overview):

- [Logging](https://www.adaptabletools.com/docs/dev-guide-support-logging).
- [Profiling](https://www.adaptabletools.com/docs/dev-guide-support-profiling) — Chrome DevTools profiler with custom track support.
- [Testing](https://www.adaptabletools.com/docs/dev-guide-support-testing).
- [Monitoring](https://www.adaptabletools.com/docs/dev-guide-support-monitoring) — combine state, data, user-behaviour visibility.
- [Performance](https://www.adaptabletools.com/docs/dev-guide-support-adaptable-performance).

### 11.9 Tutorials

[dev-guide-tutorial-overview](https://www.adaptabletools.com/docs/dev-guide-tutorial-overview). Recipes: cell editability, holiday calendars, providing Adaptable Context, providing containers, hotkeys.

### 11.10 Integrated examples (blog)

Useful for trading-desk patterns — editing tips, undoing edits, filter-by-style. Indexed at [dev-guide-integrated-examples-overview](https://www.adaptabletools.com/docs/dev-guide-integrated-examples-overview).

---

## 12. AdapTable Query Language (AQL)

[adaptable-ql-expression](https://www.adaptabletools.com/docs/adaptable-ql-expression). A purpose-built query language with a custom evaluator; expressions are human-readable strings.

### 12.1 Expression categories

| Category | Per-row? | Use cases | Doc |
|---|---|---|---|
| Standard | Yes | Calculated cols, conditional styling, grid filter | [standard](https://www.adaptabletools.com/docs/adaptable-ql-expression-standard) |
| Aggregation | Multi-row | Aggregated calc cols, aggregation alerts | [aggregation](https://www.adaptabletools.com/docs/adaptable-ql-expression-aggregation) |
| Cumulative | Multi-row in order | Running totals | [cumulative](https://www.adaptabletools.com/docs/adaptable-ql-expression-cumulative) |
| Quantile | Multi-row, bucketed | Quartiles/percentiles | [quantile](https://www.adaptabletools.com/docs/adaptable-ql-expression-quantile) |
| Observable | Reactive (Rx) | Alerts on change patterns | [observable](https://www.adaptabletools.com/docs/adaptable-ql-expression-observable) |
| Relative Change | Per-row using delta | Ticking-cell alerts | [relative-change](https://www.adaptabletools.com/docs/adaptable-ql-expression-relative-change) |

### 12.2 Composition

Expressions combine column refs (`[colId]`), literals, operators (logical + math), and Expression Functions:

```
STARTS_WITH([col1], 'ABC') OR MIN([col2], [col3]) > 100
AVG([examResult], WEIGHT([attendance]))
QUANT([Value], 4)
CUMUL(SUM([amount]), OVER([date]))
```

### 12.3 Function libraries

[adaptable-ql-expression-functions](https://www.adaptabletools.com/docs/adaptable-ql-expression-functions):

- [Standard](https://www.adaptabletools.com/docs/adaptable-ql-expression-functions-standard) — usable in **all** expression types.
- [Aggregated](https://www.adaptabletools.com/docs/adaptable-ql-expression-functions-aggregated) — `SUM`, `AVG`, `MIN`, `MAX`, `PERCENTAGE`.
- [Relative Change](https://www.adaptabletools.com/docs/adaptable-ql-expression-functions-relative-change) — `ANY_CHANGE`, `PERCENT_CHANGE`, `ABSOLUTE_CHANGE`.
- [Observable](https://www.adaptabletools.com/docs/adaptable-ql-expression-functions-observable) — `ROW_CHANGE`, `GRID_CHANGE`, `ROW_ADDED`, `ROW_REMOVED`, modifiers `MIN`/`MAX`/`COUNT`/`NONE`.
- [Advanced](https://www.adaptabletools.com/docs/adaptable-ql-expression-functions-advanced) — see 12.4.

### 12.4 Advanced functions

[adaptable-ql-expression-advanced](https://www.adaptabletools.com/docs/adaptable-ql-expression-advanced):

- `QUERY('name')` — invoke a Named Query.
- `VAR(...)` — inject custom values.
- `IF(...)` / `CASE(...)` — conditional logic; supports ternary and full case.
- `FIELD(...)` — reference row data not present in standard columns.
- [Reducing complexity](https://www.adaptabletools.com/docs/adaptable-ql-expression-managing) — refactor patterns.

### 12.5 Custom expression functions

[adaptable-ql-expression-functions-custom](https://www.adaptabletools.com/docs/adaptable-ql-expression-functions-custom):

- [Standard](https://www.adaptabletools.com/docs/adaptable-ql-expression-functions-custom-standard) — per-row developer functions.
- [Aggregated](https://www.adaptabletools.com/docs/adaptable-ql-expression-functions-custom-aggregation) — multi-row.
- [Scope](https://www.adaptabletools.com/docs/adaptable-ql-expression-functions-custom-scope) — limit which modules can call them.

Async custom expression functions are not yet supported. For predicate-style extension, prefer Custom Predicates (next section).

### 12.6 Predicates and Predicate vs Expression

[adaptable-predicate](https://www.adaptabletools.com/docs/adaptable-predicate). Predicates are simple boolean functions; cheaper than expressions. Used in: Column Filters, Alerts, Format Columns (predicate variant), Flashing Cells, Badge Styled Columns.

Object: `{ PredicateId, Inputs?: any[] }`.

[System Predicates](https://www.adaptabletools.com/docs/adaptable-predicate-system) include `Positive`, `Negative`, `Today`, `Contains`, `Equals` (numeric), `On` (date), `Is` (string), `Between`, `Before`, `After`, `In`, `NotIn`, `Blanks`, `NonBlanks`. Universal across types: `Blanks`, `NonBlanks`, `In`, `NotIn`. Others are data-type-specific.

[Custom Predicates](https://www.adaptabletools.com/docs/adaptable-predicate-custom) — developer-defined boolean functions.

Predicates and Expressions cannot be combined within the same rule.

### 12.7 Expression UI

[adaptable-ql-expression-ui](https://www.adaptabletools.com/docs/adaptable-ql-expression-ui). Two surfaces:

- [Query Builder](https://www.adaptabletools.com/docs/ui-query-builder) — control-driven, only boolean expressions.
- [Expression Editor](https://www.adaptabletools.com/docs/ui-expression-editor) — text editor with validation, function reference, autocomplete.

### 12.8 Server evaluation

[adaptable-server-evaluation](https://www.adaptabletools.com/docs/adaptable-server-evaluation). Four modules opt-in to external evaluation:

1. Alerts
2. Calculated Columns
3. Column Filters
4. Grid Filter

Mechanism: `evaluateAdaptableQLExternally(ctx)` returns a boolean indicating whether to delegate. Context exposes the expression string, module, referenced columns, predicates, and developer context. AdapTable also provides the **AST** to subscribers of `GridFilterApplied`, `ColumnFilterApplied`, `CalculatedColumnChanged`. **The translation from AST to backend dialect (SQL / Spark / GraphQL) is the developer's responsibility** — AdapTable does not auto-translate.

---

## 13. FinTech partner integrations

### 13.1 OpenFin

[integrations-openfin](https://www.adaptabletools.com/docs/integrations-openfin). `npm install @adaptabletools/adaptable-plugin-openfin`. Manifest references three OpenFin services: excel, notifications, fdc3.

Capabilities:

- **Live Reports / Excel Integration** — bidirectional sync (grid edits push to Excel; Excel edits push back). Schedulable. `onValidationFailureInExcel` for handling rejected edits.
- **OpenFin Notifications** — auto-converts AdapTable Alerts into actionable OpenFin notifications.
- **FDC3** — comprehensive support (AdapTable Tools is an OpenFin founder member).
- **OpenFin Toolbar** in Dashboard for managing live reports.

Configuration: `OpenFinPluginOptions` controls notification timeout, app icon, validation handlers.

### 13.2 interop.io

[integrations-interop](https://www.adaptabletools.com/docs/integrations-interop). Replaces older Finsemble + Glue42 plugins (consolidated v18). Supports both io.Connect Desktop and io.Connect Browser.

Capabilities:

- Notification bridge — `showAdaptableAlertsAsNotifications` converts alerts into io.Connect notifications.
- FDC3 column → FDC3 Intent communication.
- `InteropPluginAPI` for programmatic control.

### 13.3 ipushpull

[integrations-ipushpull](https://www.adaptabletools.com/docs/integrations-ipushpull). One-way export from AdapTable to ipushpull pages (which can fan out to Symphony, Bloomberg).

Capabilities:

- ipushpull Toolbar with login + operations.
- System and custom reports exportable.
- Snapshot vs Live Report (real-time sync) modes.
- Page management (create new pages from AdapTable).
- Schedulable.

Configuration: `username`, `password`, `api_key`, `api_secret`, endpoint URLs, throttling.

---

## 14. Technical reference

### 14.1 AdaptableOptions

[technical-reference-adaptable-options](https://www.adaptabletools.com/docs/technical-reference-adaptable-options). Top-level keys (grouped):

| Group | Keys |
|---|---|
| Identity | `adaptableId`, `userName`, `licenseKey`, `primaryKey`, `adaptableStateKey`, `adaptableContext` |
| State | `initialState`, `stateOptions` |
| UI | `dashboardOptions`, `toolPanelOptions`, `settingsPanelOptions`, `containerOptions`, `statusBarOptions` |
| Search/Filter | `filterOptions`, `quickSearchOptions` |
| Layout/Data | `layoutOptions`, `exportOptions`, `dataImportOptions` |
| Editing | `editOptions` |
| Features | `alertOptions`, `chartingOptions`, `expressionOptions`, `columnMenuOptions`, `contextMenuOptions`, `teamSharingOptions`, `fdc3Options` |
| Access | `entitlementOptions` |
| Columns | `columnOptions`, `customSortOptions` |
| Misc | `calendarOptions`, `notificationsOptions` |

The `agGridConfig` is a separate parameter to `Adaptable.init`, carrying `gridOptions` and AG Grid `modules`.

### 14.2 AdaptableApi

[technical-reference-adaptable-api](https://www.adaptabletools.com/docs/technical-reference-adaptable-api). Sub-APIs:

| Sub-API | Purpose |
|---|---|
| `gridApi` | Manage AG Grid + row data |
| `columnApi` | Adaptable column metadata |
| `layoutApi` | Layouts at runtime |
| `alertApi` | Alerts |
| `filterApi` | Column + Grid Filter |
| `exportApi` | Reports / exports |
| `calculatedColumnApi` | Calculated columns |
| `smartEditApi` | Smart Edit operations |
| `bulkUpdateApi` | Bulk Update operations |
| `plusMinusApi` | Plus/Minus + rules |
| `dashboardApi`, `toolPanelApi`, `columnMenuApi`, `contextMenuApi`, `themeApi` | UI control |
| `commentsApi`, `notesApi` | Annotations |
| `teamSharingApi` | Team sharing |
| `eventApi` | `on(...)` subscriptions |
| `agGridApi` | Direct AG Grid Api passthrough |

Also: `pluginsApi`, `scheduleApi`, `quickSearchApi`, `freeTextColumnApi`, `dataChangeHistoryApi`, `actionColumnApi`, `chartApi`, `dataSetApi`, `namedQueryApi`, `predicateApi`, `entitlementsApi`, `systemStatusApi`, `rowFormApi` and others surfaced through state/popup methods.

### 14.3 Initial State

[technical-reference-initial-state](https://www.adaptabletools.com/docs/technical-reference-initial-state). One section per Module (see 14.5). Mandatory: at least one Layout. Default-on state: SettingsPanel buttons in Dashboard and Tool Panel; QuickSearch black-on-yellow highlight; light theme.

### 14.4 Events catalogue

[technical-reference-adaptable-events](https://www.adaptabletools.com/docs/technical-reference-adaptable-events). Subscribe via `api.eventApi.on(eventName, handler)`.

| Category | Events |
|---|---|
| Lifecycle | `AdaptableReady` |
| State | `AdaptableStateChanged`, `BeforeAdaptableStateChanges`, `AdaptableStateReloaded` |
| Data | `CellChanged`, `RowChanged`, `DataImported` |
| Selection | `CellSelectionChanged`, `RowSelectionChanged` |
| UI | `DashboardChanged`, `LayoutChanged`, `ThemeChanged`, `CustomToolbarConfigured` |
| Features | `AlertFired`, `CalculatedColumnChanged`, `ChartChanged`, `ColumnFilterApplied`, `GridFilterApplied`, `GridSorted`, `CommentChanged`, `FlashingCellDisplayed` |
| Integration | `DataSetSelected`, `FDC3Message`, `LiveDataChanged`, `RowFormSubmitted`, `ScheduleTriggered`, `SystemStatusMessageDisplayed`, `TeamSharingEntityChanged` |

### 14.5 Plugins

[technical-reference-plugins](https://www.adaptabletools.com/docs/technical-reference-plugins). Five active plugins:

1. AdapTable No Code
2. Master Detail
3. OpenFin
4. interop.io (consolidates legacy Finsemble + Glue42)
5. ipushpull

Discontinued (folded into core): Charts (v11), Finance/FDC3 (v16), Finsemble & Glue42 (v18). Plugins exposed via `pluginsApi`.

### 14.6 Modules

[technical-reference-adaptable-modules](https://www.adaptabletools.com/docs/technical-reference-adaptable-modules). Module is the unit of permissioning, settings panel sectioning, and state segmentation.

- Data/Display: Layout, Format Column, Styled Column, Calculated Column, FreeText Column.
- Search/Filter: Quick Search, Column Filters, Grid Filter, Custom Sort.
- Editing: Smart Edit, Bulk Update, Plus Minus, Shortcuts.
- Alerts: Alerts, Flashing Cells.
- Annotation: Notes, Comments.
- Data: Export, Data Import, Data Set, Data Change History.
- Advanced: Charts, Named Query, Schedule, Team Sharing.
- UI: Dashboard, Settings Panel, Tool Panel, Status Bar, Theme.
- System: Column Info, Grid Info, System Status, State Management, FDC3.

---

## 15. Architecture

### 15.1 Relationship between AdapTable and AG Grid

AdapTable is best understood as a **wrapper-and-overlay** around AG Grid, sitting in front of it both visually and semantically. The integration is concretely a static factory call: `Adaptable.init({ adaptableOptions, agGridConfig })` receives an un-instantiated `GridOptions` object plus the AG Grid module list, instantiates the grid itself, and returns an `AdaptableApi` Promise.

Two DOM containers are physically rendered side by side — the AdapTable dashboard/UI shell on top (or in side panels via the Tool Panel and Status Bar) and the AG Grid viewport in its own container. AdapTable does not replace AG Grid's column model, row model or cell rendering — it manipulates them. ColDefs, GridOptions, AG Grid events and the AG Grid Api remain fully accessible (`api.agGridApi`). Many AdapTable features ultimately compile down to standard AG Grid calls: `applyTransaction` for data changes, AG Grid sort/filter/group state for layouts, AG Grid sparklines and integrated charts for visualisation, AG Grid status bar and tool panel slots for UI.

The key conceptual move is that AdapTable owns a parallel **control plane** alongside AG Grid's data plane. AG Grid remains responsible for "render N rows and M columns at 60fps"; AdapTable layers a configuration system, a query language, an event bus, a permission model, and a persisted state store. Because the wrapping is non-destructive — it forbids `SetFilterModule` to avoid filter contention, but otherwise composes — applications can keep doing things directly against AG Grid where it makes sense, and ascend to AdapTable's surface for the bits that need configuration, persistence or rich UI.

For trading desks the practical implication is that AdapTable is *additive*: a team that already has heavy AG Grid integration (custom cell renderers, custom row data sources, ticking pipelines) can adopt AdapTable without rewiring those pieces. They become the underlying cell renderers AdapTable styles, the row data AdapTable filters, the events AdapTable listens to.

### 15.2 The single config object — AdaptableOptions and the modules/plugins extensibility model

`AdaptableOptions` is intentionally one large object split into option groups (`editOptions`, `filterOptions`, `expressionOptions`, etc.) — see Section 14.1. The discriminator for "what feature does this configure" is the option group name; every module has a corresponding options block.

Two extensibility seams cross-cut this object:

**Modules** are first-class units of feature scope. Each Module has a name, a Settings Panel section, optionally a Module Toolbar, a Module Tool Panel, a Module Status Panel, and a permissioning slot. State is segmented per module — Initial State has `Alert: {...}`, `Layout: [...]`, etc. This consistent shape is what lets the Settings Panel auto-render one tab per module, lets entitlements be a `{ moduleName: 'Full' | 'ReadOnly' | 'Hidden' }` map, and lets Team Sharing reason about "share this module's objects".

**Plugins** are coarser: they bundle entire features (or integrations) that aren't part of the default install for bundle-size or licence reasons. The plugin API is `plugins: [...]` on AdaptableOptions, and plugins range from extending AG Grid behaviour (Master Detail) to bridging external systems (OpenFin, interop.io, ipushpull) to enabling whole new modes (No Code). Plugins can register modules, options blocks, toolbars, action column commands, and event listeners. The history of the plugin set is informative: the Charts, Finance and Finsemble/Glue plugins were folded into core — meaning AdapTable Tools tends to graduate plugin-grade integrations into the main bundle once they stabilise.

The result is a configuration surface where almost every behaviour can be tuned at three levels: design-time options, design-time initial state, and runtime API/UI mutations — all governed by the same Module abstraction.

### 15.3 State management architecture

AdapTable State is a **JSON-shaped, object-oriented, Redux-backed store** that does not contain AG Grid row data. It contains UI configuration (Layouts, Format Columns, Alerts, Reports, Calculated Columns, Themes, Data Change History entries, etc.) plus per-module preferences.

The lifecycle has three crisp phases:

1. **Design time** — developer hands AdapTable an `initialState` object literal, which is itself a complete, valid state.
2. **First load** — AdapTable runs `loadState()`. If storage is empty, the developer's initial state is used. Either way, the resulting state is reduced into the Redux store.
3. **Subsequent loads** — `loadState()` returns the previously saved state, which has accumulated runtime mutations.

Persistence is pluggable: by default it uses local storage; in production deployments, developers wire `loadState` and `persistState` into a remote backend (typically a per-user document keyed by `adaptableId` × `userName` × `adaptableStateKey`).

State objects share a small set of common interfaces — `AdaptableObject` (Uuid, name, description), `SuspendableObject` (`IsSuspended`, `IsReadOnly`), and Object Tags (used by Layouts to extend without bloating). Predicates and Scopes are first-class shapes used inside many state objects, which is what makes the system uniform: an Alert's scope and a Format Column's scope and a Custom Sort's scope are the same concept.

Two characteristic patterns:

- **Suspending** is preferred over deletion because it preserves the configuration. The API surface is uniform — `suspendCustomSort`, `unSuspendCustomSort` etc. — except for objects (Layout, Calculated Column) where suspension is meaningless.
- **Migrations** run on Redux state. By default they are automatic on major-version bumps; opt-out is `autoMigrateState: false` and the developer calls `AdaptableUpgradeHelper.migrateAdaptableState` with `UpgradeConfig`. Developers can intercept inside `applyState` to bolt on app-specific transforms.

State change events fire at two granularities — `BeforeAdaptableStateChanges` (cannot cancel; useful for progress UI) and `AdaptableStateChanged` (fires on every action with a typed `actionName` from the 150+ action enum). This is essentially Redux middleware exposed as a public event API, which is what makes monitoring/auditing trivially achievable.

Crucially, **entitlements live above the state layer**: they gate the UI but do not gate the API. Programmatic access to state through `adaptableApi` and ability to provide initial state in code are not constrained by entitlements. This is by design — entitlements are about *what end users see and click*, not about hardening — and it shifts security responsibility cleanly onto the application backend.

### 15.4 The expression engine (AQL)

AdapTableQL is a domestic query language built specifically for AdapTable rather than reusing SQL or JSONata. The unit of evaluation is the **Expression**, a string parsed into an AST. Six expression categories (Standard, Aggregation, Cumulative, Quantile, Observable, Relative Change) compose from a shared body of **Functions**. Standard Functions are universal — they work in every expression context — while specialised functions belong to one category (e.g. `CUMUL` is only valid inside Cumulative Expressions; `ANY_CHANGE` is valid only in Relative Change or Observable contexts).

The compositional pattern is straightforward: column references look like `[colId]`, function calls look like `FN([col], [other])`, operators are mathematical and logical, and several functions take other expressions as arguments (e.g. `OVER([sortCol])` modifies `CUMUL`, `WEIGHT([col])` modifies `AVG`, `GROUP_BY([col])` modifies aggregations, `WHERE(...)` modifies Observables). The result is more readable than nested SQL for the column-centric problems AdapTable models.

**Predicates** are a deliberately separate, simpler concept — boolean functions with an id and an inputs array. They are cheap, pre-validated, and UI-friendly (selectable from a dropdown with auto-rendered input controls). Predicates and expressions are mutually exclusive within a rule, which forces the user to commit to one paradigm per definition.

**Scopes** are how an expression or predicate is targeted onto columns. The Scope object — `{ All? | ColumnIds? | DataTypes? | ColumnTypes? }` — is reused across Alerts, Format Columns, Custom Sorts, Flashing Cells, Plus/Minus, Shortcuts, Reports. ColumnTypes is particularly powerful because developers define their own taxonomy (`'price'`, `'pnl'`, `'tenor'`) and apply rules against semantic groupings rather than hard-coded column id lists.

**Server evaluation** is the most architecturally important seam. Rather than translating expressions to SQL/Spark on the client, AdapTable hands the **AST** off to the application via dedicated events (`GridFilterApplied`, `ColumnFilterApplied`, `CalculatedColumnChanged`) and through a synchronous gate `evaluateAdaptableQLExternally(ctx)` that decides which expressions to delegate. The application is responsible for translating the AST into its backend's query dialect and routing the resulting rows back into the grid (typically via SSRM's `getRows`). This is a deliberate choice: it keeps AdapTable backend-agnostic while still letting the Expression Editor / Query Builder serve as the user-facing query surface for, say, a Java service that fronts a tick database.

### 15.5 UI architecture

AdapTable's UI is layered into four primary surfaces with clear separations of concern:

- **Settings Panel** — modal/window. The single point for editing every module's objects. Renders one section per module; uses wizards (multi-step forms) for object creation and editing. Custom panels can be inserted alongside.
- **Dashboard** — strip above AG Grid. Holds Tabs → Toolbars (module + custom) → Buttons. Five display modes (Default/Inline/Collapsed/Floating/Hidden) tune real-estate consumption.
- **Tool Panel** — inside AG Grid's right sidebar. Hosts Module Tool Panels and Custom Tool Panels. Acts as a vertical Dashboard for layouts where horizontal space is precious.
- **Status Bar** — inside AG Grid's status bar. Up to 3 AdapTable status panels each containing module status panels.

Plus:

- **Column Menu** and **Context Menu** — menu surfaces extended by AdapTable items.
- **Popups** (Adaptable Forms, Toasts, Adaptable Wizards) — modal/non-modal floating UI, retargetable into custom containers via `ContainerOptions`.
- **Action Columns** — UI surface embedded in the grid itself.

The framework adapter layer (React/Angular/Vue) plugs in at the **component-substitution** level — i.e. the four custom-component slots (Toolbar, Tool Panel, Settings Panel, Popup) accept native framework components, while the underlying AdapTable engine continues to render its built-in UI as vanilla JavaScript. This is a strict adapter pattern: the wrappers don't translate the entire UI to React/Angular/Vue, they just open holes where developer components can be hosted natively. That makes the framework adapters thin (they wrap AG Grid React/Angular/Vue + a hook into AdapTable init) and the AdapTable engine framework-independent.

The CSS layer is exclusively variable-driven. Two themes ship (`light`, `dark`) plus an OS-following mode; custom themes register in `UserThemes` and supply their own variable overrides. CSS variables follow a `--ab-*` / `--ab__*` convention and are scoped to AdapTable's own DOM — AG Grid's theming remains a parallel, separate concern (AG Grid native themes apply to the AG Grid container; AdapTable's variables apply to dashboards, tool panels, popups, etc.). Care is required because system themes auto-switch AG Grid's variant (so dark AdapTable + dark AG Grid is one click) but custom themes do not — those need a parallel AG Grid theme switch in app code.

### 15.6 The data architecture — three row models, one filter abstraction

AG Grid offers Client-Side, Server-Side and Viewport row models. AdapTable nominally supports all three but its capabilities differ sharply across them:

| Capability | Client-Side | SSRM | Viewport |
|---|---|---|---|
| Quick Search | Yes | Limited | Limited |
| Column Filters (AdapTable) | Yes (auto) | Manual via `getAdaptableFilterState` | Manual |
| Grid Filter (AQL) | Yes (auto) | Manual via AST | Limited |
| Custom Sort | Yes (auto) | Manual via `getAdaptableSortState` | Manual |
| Calculated Columns (Standard) | Yes | Yes | Yes |
| Calculated Columns (Aggregated/Cumulative/Quantile) | Yes | No | No |
| Aggregations | Yes | Server-driven | No |
| Pivoting | Yes | Server-driven | No |
| Row grouping | Yes | Server-driven | No |
| Master/Detail | Yes | Yes | No |
| Data Change History | Yes | Limited | Limited |
| Charts | Yes | Yes | Limited |

The docs recommend SSRM **only above ~200,000 rows**, and otherwise advocate for AdapTable's Data Sets feature: load multiple, swappable client-side data sets — keeping all client-side feature parity — rather than going SSRM. Data Sets even support a parameterising form (the Data Set Form) that runs before the data fetch, which mimics the "narrow before you fetch" pattern of SSRM without giving up client features.

When SSRM is unavoidable, AdapTable operates as a **filter and sort metadata broker** rather than a query executor. `getAdaptableFilterState()` and `getAdaptableSortState()` extract the AdapTable-side filter/sort definitions; the developer reads these inside `IServerSideDatasource.getRows`, translates them to whatever the backend expects (REST query, gRPC, SQL), and returns the resulting page. The AST handoff for AQL expressions plugs into this same pattern. AdapTable does *not* perform the translation — it provides the structured spec.

For data mutation, AdapTable offers `gridApi.addGridData / updateGridData / deleteGridData / setCellValue / loadGridData` as the canonical entry points. Underneath these are `applyTransaction` calls into AG Grid plus AdapTable event firings. The docs are explicit that bypassing this layer (calling AG Grid directly) skips validation hooks and breaks downstream events — for a trading-desk audit trail, this is non-trivial.

Live ticking data is supported across all row models. The `CellChanged` event differentiates user vs background origin; Flashing Cells, Relative Change Alerts, and Observable Alerts are all powered by this stream. Alert subscriptions (especially Observables) are torn down and rebuilt as objects suspend/un-suspend, so an inactivity alert that has been off for an hour does not falsely fire when re-enabled.

### 15.7 Eventing model

AdapTable's event bus is central enough that the AdapTable Api exposes it as `api.eventApi.on(name, handler)`, mirroring AG Grid's pattern. Events fall into clean categories — see Section 14.4. A few details matter for production integration:

- **`CellChanged` is the single most important event for ticking grids.** Its payload includes `oldValue`, `newValue`, `primaryKeyValue`, `rowData`, `column`, `trigger` (user/background/revert) and `preventEdit`. Crucially, this is the event that fires for both user edits and ticking updates — the `trigger` field disambiguates them. Audit trails should subscribe here.
- **`RowChanged` only fires for AdapTable Grid API mutations, not for ad-hoc AG Grid calls.** This is the practical reason the docs insist on using `gridApi.addGridData` etc. instead of `agGridApi.applyTransaction`.
- **The edit lifecycle** chains pre-edit (`isCellEditable`) → user types → client validation (Validation Alerts with `PreventEdit`) → server validation (`validateOnServer`) → if all pass, AG Grid commits → `CellChanged` fires → downstream `AlertFired` for Data Change / Relative Change / Observable / Aggregation alerts → `AdaptableStateChanged` fires for any state-side ripple. The `preventEdit` flag on `CellChanged` records whether the chain rolled the edit back.
- **`AlertFired`** is the unified notification entry point. Its payload (`AlertFiredInfo`) contains either a `CellDataChangedInfo` or a `RowDataChangedInfo`, so a single subscriber can react to all six alert types. Plus the `adaptableContext` passes through, which is how applications correlate alerts to their own session/user/instrument context.
- **State events** (`BeforeAdaptableStateChanges`, `AdaptableStateChanged`, `AdaptableStateReloaded`) support fine-grained `actionName` filtering — over 150 action types exist (`GRID_DATA_EDITED`, `LAYOUT_SELECT`, etc.), so a monitoring layer can subscribe just to the actions it cares about without parsing payloads.

### 15.8 Permissioning and team sharing architecture

The permissioning model is **UI-only** by construction — entitlements gate which modules and objects are visible/editable in the AdapTable UI, but they do not gate state injection via Initial State or programmatic mutation via the API. This is documented explicitly. The architectural reason is sound: enforcement of "who is allowed to do what" must ultimately live at the backend (in the persistence layer or via API authentication), and putting it in the client UI alone would offer false safety. AdapTable therefore deliberately scopes itself to *visibility/affordance* and lets the application add the authorisation tier.

The three levels (Full / ReadOnly / Hidden) apply at the Module layer, and individual Adaptable Objects can override the module's level. This double-layer means a deployment can show a module to all users in ReadOnly, but elevate one specific object (e.g. one approved Layout) to Full for editing, or hide a sensitive saved query for one role.

**Team Sharing** is the collaboration architecture. Two modes:

- **Snapshot** — copy the object once into a shared store, then disconnect. Each side may diverge.
- **Active** — the object remains linked. AdapTable monitors local changes and re-syncs them to the shared store (and pulls remote updates). Each Active object is identified by a UUID; conflict avoidance is via "last write wins" coupled with the team key segmenting which audience the entity belongs to.

**Referenced sharing** is the dependency-resolution layer: when a Layout depends on Calculated Columns or Action Columns, AdapTable bundles those references in the share automatically so receivers don't end up with broken pointers.

The implementation is again pluggable — `loadSharedEntities` and `persistSharedEntities` callbacks let the application route Team Sharing through any backend (a REST API, a Mongo collection, a Slack bot, a git commit). Multiple teams are addressable through distinct storage keys, so a desk can ship a default "Equities" team and a private "Risk" team to the same user.

### 15.9 FDC3 integration shape

AdapTable's FDC3 integration is **declarative and column-centric**. Rather than asking developers to write FDC3 send/receive code, the integration drives off `gridDataContextMapping` — a map from FDC3 context types (`fdc3.instrument`, `fdc3.country`, `fdc3.currency`, `fdc3.position`, `fdc3.portfolio`, etc., 14 standard FDC3 2.0 types) to grid columns or raw data fields. Two prefixes — `_colId.<id>` and `_field.<name>` — let mappings reference either the AdapTable-known column or the raw row data.

Once mapping is configured, AdapTable can:

- **Broadcast** a context when a user clicks an FDC3 Action Column button or a Context Menu item, harvesting the mapped values from the selected row to construct a valid FDC3 context object.
- **Listen** for incoming intents/contexts via developer-supplied handler functions.
- **Raise** intents from the grid's UI surfaces.

UI components ([handbook-fdc3-ui-components](https://www.adaptabletools.com/docs/handbook-fdc3-ui-components)) are configured at design time in FDC3 Options — FDC3 Action Columns and FDC3 Context Menu items.

Custom intents and contexts ([handbook-fdc3-custom](https://www.adaptabletools.com/docs/handbook-fdc3-custom)) extend the standard set, and are particularly useful for inter-AdapTable communication (one grid broadcasts a position selection, another grid filters to that instrument).

The bus is provided by the host environment. In OpenFin or interop.io, the FDC3 service is referenced in the manifest and the relevant plugin auto-bridges AdapTable's broadcasts/listens to the platform bus. Connectifi works the same way. Native browser FDC3 (without a desktop container) is supported, primarily for cross-AdapTable communication within a single window. The architecture cleanly separates "what to send" (declared in FDC3 Options) from "where to send it" (the bus, provided by the integration plugin), so the same FDC3 configuration runs unchanged across OpenFin, interop.io and standalone browser.

The **`FDC3Message`** event fires for both sent and received messages, providing a single hook for application-level FDC3 audit/telemetry.

---

## Summary of practical implications for a trading-desk platform

- AdapTable is **additive on top of AG Grid** — no rewrite of existing AG Grid renderers or row data sources is required; AdapTable plugs alongside.
- **AQL is the central abstraction.** Calculated Columns, Alerts, Filters, Conditional Formatting, Reports all share one expression language, one function library, and one server-evaluation handoff. Investments here pay off across every feature.
- **State is a Redux store with pluggable persistence.** Treating it as a serializable JSON document keyed by user × instance × stateKey is the right model for cross-machine sync, role-based defaults and migration.
- **Server-Side Row Model is heavily caveated.** For most large-but-not-huge desks, Data Sets + Client-Side Row Model preserve full feature parity. SSRM should be reserved for >200k rows or true streaming-only scenarios, and even then AdapTable becomes a metadata broker rather than a query engine.
- **Permissioning is UI-only.** Backend authorisation is the application's responsibility; AdapTable controls affordance, not access.
- **FDC3 is declarative.** The `gridDataContextMapping` plus FDC3 Options shape replaces hand-written FDC3 code, and runs unchanged across OpenFin, interop.io, Connectifi, and standalone browser.
- **The plugin model graduates integrations into core.** Charts, FDC3 and Glue/Finsemble all started as plugins and were folded into the main bundle, suggesting that today's plugins (OpenFin, interop.io, ipushpull, Master Detail, No Code) are stable but not necessarily the long-term seam.

---

*Sources: live documentation crawl of `https://www.adaptabletools.com/docs/*` performed April 2026. URLs are inlined with each section; pages not specifically linked but discoverable from the doc tree are listed in Section 1's references and in the per-section Sub-pages. All pages crawled returned content; no fetches failed during research.*
