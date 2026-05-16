# AG-Grid Customization Features
> Compiled from MarketsUI / FI Trading Terminal design conversations  
> Covers all features discussed for building an AdapTable-style customization layer over AG-Grid Enterprise

---

## Table of Contents

1. [General Settings](#1-general-settings)
2. [Column Customization](#2-column-customization)
3. [Column Groups Wizard](#3-column-groups-wizard)
4. [Conditional Styling](#4-conditional-styling)
5. [Calculated Columns](#5-calculated-columns)
6. [Named Queries & Filters](#6-named-queries--filters)
7. [Cell & Row Flashing Wizard](#7-cell--row-flashing-wizard)
8. [Entitlements & Cell Editing Rules](#8-entitlements--cell-editing-rules)
9. [Data Management & Row Models](#9-data-management--row-models)
10. [Sorting & Filtering Features](#10-sorting--filtering-features)
11. [Editing Features](#11-editing-features)
12. [Undo / Redo](#12-undo--redo)
13. [Export & Clipboard](#13-export--clipboard)
14. [Performance Optimization](#14-performance-optimization)
15. [Theming & Visual Customization](#15-theming--visual-customization)
16. [Grid Settings Profiles](#16-grid-settings-profiles)
17. [Expression Editor](#17-expression-editor)

---

## 1. General Settings

> Customize core `gridOptions` and `defaultColDef` properties exposed via a settings UI.

### Grid Options
- Grid theme selection: **Alpine**, **Balham**, **Material** (light & dark variants)
- Row height (global default)
- Header height customization
- Row selection mode: `single` | `multiple` | `none`
- Checkbox selection toggle
- Row dragging enable/disable
- Suppress row hover highlight
- Animate rows on sort/filter (`animateRows`)
- Row border and grid line visibility
- Grid dimensions and responsiveness
- `suppressDragLeaveHidesColumns`
- `suppressFieldDotNotation`
- `suppressAutoSize`
- `suppressColumnMoveAnimation`

### Default Column Definitions (`defaultColDef`)
- Global resizable / sortable / filterable defaults
- Global editable toggle
- Min/max width defaults
- Wrap header text
- `suppressMovable` default
- `lockPosition` default

### Pagination & Scrolling
- Enable/disable pagination (`pagination: true`)
- Rows per page (`paginationPageSize`)
- Auto page size (`paginationAutoPageSize`)
- Suppress pagination panel
- Infinite scroll vs paginated mode
- Viewport row model toggle

### Locale & Accessibility
- Locale configuration (number formatting, date display)
- Internationalization (`localeText` overrides)
- Keyboard navigation and shortcut mapping
- `ensureDomOrder` for accessibility

### State Persistence Strategy
- Local storage (IndexedDB via Dexie in dev)
- Remote REST endpoint persistence (prod)
- JSON import/export for full grid state
- `columnState`, `filterState`, `groupState`, `sortState` persisted separately

---

## 2. Column Customization

> Per-column styling, formatting, editing, and behavior configuration.

### Header Customization
- Header text / `headerName` override
- Header tooltip
- Header font: family, size, weight, color
- Header background color
- Header text alignment (left / center / right)
- Custom header component (`headerComponent`)
- Suppress sort icon in header
- Header column menu enable/disable

### Column Layout
- Width (`width`, `minWidth`, `maxWidth`)
- **Important**: Use `initialWidth` / `initialHide` / `initialPinned` etc. to avoid overwriting column state on re-render; do NOT mutate stateful properties directly
- Column pinning: left / right / none
- Column visibility toggle (`hide`)
- Column lock position
- Column resizable
- Column auto-sizing (fit content)
- Column reorder / suppress move

### Stateful Properties (use `initial*` variants)
| Stateful Property | Safe Initial Variant |
|---|---|
| `width` | `initialWidth` |
| `sort` | `initialSort` |
| `sortIndex` | `initialSortIndex` |
| `hide` | `initialHide` |
| `pinned` | `initialPinned` |
| `rowGroup` | `initialRowGroup` |
| `rowGroupIndex` | `initialRowGroupIndex` |
| `pivot` | `initialPivot` |
| `pivotIndex` | `initialPivotIndex` |
| `aggFunc` | `initialAggFunc` |
| `flex` | `initialFlex` |

### Value Formatters
- Standard formatters: number, currency, percentage, date
- Excel-style format strings (e.g. `#,##0.00`, `$#,##0`, `MM/DD/YYYY`)
- Custom formatter templates with user-defined expression
- Null / empty value placeholder formatting
- Locale-aware formatting (commas, decimal separators)

### Value Getters
- Simple field mapping
- Complex computed expressions (JavaScript or expression string)
- Cross-column computed values
- Expression editor integration for defining value getter logic

### Cell Renderers
- Default text renderer
- `agAnimateShowChangeCellRenderer` for live-data ticking
- `agAnimateSlideCellRenderer`
- Sparkline cell renderer (`agSparklineCellRenderer`)
- Custom React/Angular component cell renderers
- Conditional renderer selection via `cellRendererSelector`

### Cell Editors
- Default text input
- Select / dropdown editor
- Date picker editor
- Autocomplete editor
- Large text (`agLargeTextCellEditor`)
- Custom editor components
- Data source for select cells (static list, REST endpoint, or socket subscription)
- `cellEditorParams` configuration per column

### Cell Styling (Column Level)
- Cell background color
- Cell text color
- Cell font: family, size, weight
- Text alignment
- Cell padding / border

---

## 3. Column Groups Wizard

> UI wizard for creating, editing, and removing column group hierarchies.

### Features
- Add new column group with custom `headerName`
- Assign existing columns to a group via drag-and-drop or tree control
- Reorder groups and columns within groups
- Remove groups (ungrouping columns back to root)
- Nested group support (multi-level hierarchy)
- Open/close group state (`openByDefault`)
- Group header styling (same options as column headers)
- `marryChildren` toggle to lock group columns together
- Visual tree preview before applying changes
- Apply changes to live grid without full re-render

---

## 4. Conditional Styling

> Rule-based styling of cells and rows using expressions, applied at runtime without full column re-render.

### Styling Targets
- Individual **cell** styling (per column)
- Entire **row** styling (`getRowStyle` / `rowClassRules`)
- **Column-level** blanket cell class

### Implementation Method: `cellClassRules` (Recommended)
- **String expressions** are most performant — grid evaluates as: `'x >= 1000'` where `x` = cell value
- **Function expressions** for complex multi-field logic
- Grid automatically adds/removes classes; no manual cleanup needed
- `cellStyle` accumulates inline styles and requires manual override — avoid for conditional logic

```
Performance Order (best to worst):
1. cellClassRules  (string expressions) ⭐⭐⭐⭐⭐
2. cellClassRules  (functions)          ⭐⭐⭐
3. cellStyle       (function)           ⭐⭐
4. cellClass       (function)           ⭐⭐
```

### Dynamic CSS Class Generation (for 200+ columns)
- Generate unique class names at runtime: `cell-style-{colId}`
- Inject `<style>` element with rules programmatically via `addOrUpdateCssRule()`
- Avoid hardcoding 200 class definitions; use loop-generated stylesheet injection

### Condition Expression Functions
All conditions written in the **Expression Editor** (see §17) support:

**Comparison Operators**: `>`, `<`, `>=`, `<=`, `==`, `!=`  
**Logical Operators**: `AND`, `OR`, `NOT`  
**Ternary**: `condition ? trueValue : falseValue`  
**Mathematical**: `ABS`, `ROUND`, `FLOOR`, `CEIL`, `SQRT`, `POW`, `MOD`  
**Statistical**: `AVG`, `MEDIAN`, `STDEV`, `VARIANCE`, `MIN`, `MAX`  
**String**: `CONCAT`, `UPPER`, `LOWER`, `TRIM`, `SUBSTRING`, `REPLACE`, `LEN`, `STARTS_WITH`, `ENDS_WITH`, `CONTAINS`  
**Date**: `DATE_DIFF`, `DATE_ADD`, `NOW`, `YEAR`, `MONTH`, `DAY`, `IS_WEEKDAY`  
**Null checks**: `ISNULL`, `ISNOTNULL`, `ISEMPTY`  
**Aggregation (row level)**: `SUM`, `COUNT`, `DISTINCT_COUNT`

### Style Attributes per Rule
- Background color (light theme / dark theme variants)
- Text / foreground color
- Font weight (bold), font style (italic)
- Border color and thickness
- Cell icon / badge overlay
- Rule priority ordering (higher priority wins)
- Rule scope: specific columns, all columns, or row-level

### Theme-Aware Rules
- Define separate style values for light mode and dark mode
- Rules automatically swap on `data-theme` toggle
- CSS variable token system compatible with MarketsUI MDL tokens

---

## 5. Calculated Columns

> Virtual columns computed from expressions over existing row data.

### Expression Authoring
- **Text-based Expression Editor**: syntax highlighted, autocomplete, inline validation
- **Visual Node Builder**: drag-and-drop, node-based expression graph
- All function categories from §4 (Conditional Styling) are available
- Cross-column references: `{columnId}` or `row['fieldName']`
- Null-safe operations with `ISNULL` / default value fallback

### Column Configuration
- Custom `headerName` for the calculated column
- Position in column order (drag to position)
- Width, pin, hide settings same as regular columns
- `valueFormatter` applied to result
- Calculated column included in export (CSV / Excel)
- Calculated column participates in row grouping aggregation

### Lifecycle
- Stored as part of profile (see §16)
- Recalculated on every `cellValueChanged` and `applyTransaction` update
- Does not trigger `undoRedoCellEditing` stack (read-only virtual column)

---

## 6. Named Queries & Filters

> Saved, reusable filter configurations applied to the grid with AND/OR combination logic.

### Filter Types (Native AG-Grid)
- Text filter (`agTextColumnFilter`)
- Number filter (`agNumberColumnFilter`)
- Date filter (`agDateColumnFilter`)
- Set filter (`agSetColumnFilter`)
- Multi-filter (`agMultiColumnFilter`)
- Custom filter components
- Floating filters (inline below header)
- Quick filter (global text search, `quickFilterText`)

### Named Query Features
- Save current active filter state as a Named Query with a label and description
- Build new Named Queries via:
  - Simple filter UI (column → operator → value)
  - Advanced **Expression Editor** for complex predicates
  - Combined conditions with `AND` / `OR` operators
- Apply multiple Named Queries simultaneously using `OR` union logic
- Query list management: view, activate, deactivate, edit, delete
- Query preview panel (shows matched rows count before applying)
- Export/import Named Queries as JSON

### Filter Persistence
- `filterModel` saved as part of profile state
- `cacheQuickFilter: true` for performance
- External filter integration (`isExternalFilterPresent` / `doesExternalFilterPass`)
- Filter state survives profile save/load
- `onFilterChanged` event subscriptions for downstream reactions

### Advanced Filter
- `enableAdvancedFilter: true` for AG-Grid's built-in advanced filter bar
- Combine with Named Queries for layered filtering

---

## 7. Cell & Row Flashing Wizard

> Define conditions and visual attributes for real-time cell/row flash animations on data updates.

### Flash Trigger Methods

**Method 1 — Automatic (column config)**
```
enableCellChangeFlash: true  on columnDef or defaultColDef
```
Fires when cell value changes via `applyTransaction` or `setRowData`.

**Method 2 — Programmatic API**
```
gridApi.flashCells({
  rowNodes: [...],
  columns: ['price', 'yield'],
  flashDuration: 2000,
  fadeDuration: 1000
})
```

**Method 3 — Wizard-defined conditional flash**
- Flash only when expression evaluates true (e.g. `value > previousValue`)
- Flash up (increase) vs flash down (decrease) with different colors

### Flash Configuration
| Property | Description |
|---|---|
| `cellFlashDuration` | Duration flash color is shown (default 500ms) |
| `cellFadeDuration` | Duration of fade-out (default 1000ms) |
| Flash color — up | Configurable (e.g. green `#00C853`) |
| Flash color — down | Configurable (e.g. red `#D50000`) |
| Flash color — neutral | For non-directional changes |
| Animation type | Flash / slide |
| Scope | Cell-level or full row |

### Wizard UI
- Column selector (multi-select with column tree)
- Condition builder (expression editor for trigger logic)
- Flash style editor: colors, durations, animation
- Theme-specific colors (light mode / dark mode variants)
- Live preview panel with simulated data update
- Flash rule list: view, reorder, enable/disable, delete

### Notes
- Changes via `applyTransaction` do NOT automatically flash — must call `flashCells()` manually after transaction OR enable `enableCellChangeFlash` on the column def
- Filter-triggered changes do NOT flash by default
- Flash state does NOT interfere with `undoRedoCellEditing` stack

---

## 8. Entitlements & Cell Editing Rules

> Wizard to enable/disable cell editing based on row data values or REST-endpoint entitlements.

### Rule Types
| Rule Type | Description |
|---|---|
| **Row-value condition** | Edit allowed only if another cell in the same row satisfies a condition (e.g. `status == 'OPEN'`) |
| **REST entitlement** | Call a REST endpoint with row key; response determines edit permission |
| **Static role-based** | Always editable / never editable based on user role |
| **Combination** | AND/OR combination of the above |

### `editable` Callback (AG-Grid native)
```ts
editable: (params: EditableCallbackParams) => {
  return params.data.status === 'OPEN' && params.data.traderDesk === currentUser.desk;
}
```

### Conditional Editor Selection
- `cellEditorSelector` returns different editor type per row
- e.g., use dropdown editor for some rows, text editor for others based on row values

### Entitlement REST Integration
- Configure endpoint URL per column rule
- Request payload: `{ rowId, columnId, rowData }` (partial)
- Response: `{ editable: boolean, reason?: string }`
- Response cached per session (TTL configurable)
- Fallback behavior on endpoint failure (allow / deny / preserve last state)

### Validation Rules
- Cell-level validator functions
- Row-level validators (cross-field)
- Custom error message display
- Visual error indicator (cell border, tooltip)

### Wizard UI
- Rule list per column (ordered priority)
- Rule builder: condition type → expression / endpoint config
- Test panel: enter sample row values → evaluate result
- Error message customization per rule

---

## 9. Data Management & Row Models

### Row Model Types
| Model | Use Case |
|---|---|
| `clientSide` | All data in browser; supports grouping, aggregation, sort, filter client-side |
| `serverSide` | AG-Grid requests data blocks from server on demand; supports large datasets |
| `infinite` | Append-only infinite scroll; blocks fetched on scroll |
| `viewport` | Only visible rows fetched; ideal for streaming / real-time |

### Server-Side Row Model (SSRM) with Local Data
- Wrap already-fetched rows (e.g. 10,000) in a custom `IServerSideDatasource`
- `getRows(params)` applies sort/filter/group from `params.request` locally
- `params.success({ rowData, rowCount })` to return result
- Enables AG-Grid pagination, sorting, filtering UX without re-fetching from server

### `applyTransaction` for Incremental Updates
- Use for ViewServer delta push updates (socket.io deltas)
- Supports partial row updates — only include changed fields + row ID
- `getRowId` must be configured to match delta message key
- Does NOT automatically trigger cell flash — call `flashCells()` post-transaction
- Does NOT push to `undoRedoCellEditing` stack — custom undo system needed for real-time grids

### Batch & Async Transactions
- `asyncTransactionWaitMillis: 100` — batch rapid delta updates
- `applyTransactionAsync()` for high-frequency streaming data
- `cacheBlockSize`, `maxBlocksInCache` for SSRM memory management

### Change Detection
- `rowBuffer: 10` — reduce for faster initial renders
- `suppressAnimationFrame: true` — disable for maximum throughput
- `debounceVerticalScrollbar: true`

---

## 10. Sorting & Filtering Features

### Sorting
- Single-column sort (click header)
- Multi-column sort (`multiSortKey: 'ctrl'`)
- `sortingOrder: ['asc', 'desc', null]` — cycle order
- `accentedSort: true` — locale-aware string comparison
- `suppressMultiSort` — lock to single column
- Custom comparator functions per column
- Server-side sorting (passed via SSRM `sortModel`)
- Sort state persistence

### Filtering (see also §6)
- Text / Number / Date / Set / Multi filters
- `filterModel` get/set via API
- `gridApi.setFilterModel(model)` / `gridApi.getFilterModel()`
- `gridApi.onFilterChanged()` — trigger after programmatic filter change
- External filter: `isExternalFilterPresent` + `doesExternalFilterPass`
- `enableAdvancedFilter: true`
- Floating filters below column headers
- Quick filter: `gridApi.setQuickFilter(text)`
- `cacheQuickFilter: true` for performance

---

## 11. Editing Features

### Edit Modes
- Inline cell editing (default)
- Popup editor
- Full row editing (`editType: 'fullRow'`)
- Batch editing (accumulate changes, commit on demand)

### Start/Stop Edit
- `gridApi.startEditingCell({ rowIndex, colKey })`
- `gridApi.stopEditing(cancel?)`
- `stopEditingWhenCellsLoseFocus: true`
- `enterMovesDown`, `enterMovesDownAfterEdit`

### Editor Types (built-in)
- `agTextCellEditor`
- `agSelectCellEditor`
- `agRichSelectCellEditor` (Enterprise)
- `agLargeTextCellEditor`
- `agDateCellEditor` (Enterprise)
- `agDateStringCellEditor`
- `agCheckboxCellEditor`
- `agNumberCellEditor`

### Custom Editors
- React component editors
- Angular component editors
- Editor `popup: true` for overlay mode
- `cellEditorPopupPosition: 'over' | 'under'`

### Validation
- `valueSetter` — return `false` to reject edit
- Custom validator functions
- `onCellValueChanged` — post-edit validation and side effects

---

## 12. Undo / Redo

### Configuration
```ts
gridOptions: {
  undoRedoCellEditing: true,
  undoRedoCellEditingLimit: 10,  // default 10
}
```

### Supported Operations
| Operation | Undoable |
|---|---|
| Direct cell edit | ✅ Yes |
| Ctrl+V paste (range) | ✅ Yes |
| Ctrl+X cut | ✅ Yes |
| Fill handle drag | ✅ Yes |
| `applyTransaction` | ❌ No (custom undo required) |

### Stack Clearing Triggers
- Sort applied
- Filter changed
- Row grouping changed
- Column order changed

### API Methods
```ts
gridApi.undoCellEditing()        // Undo last action
gridApi.redoCellEditing()        // Redo
gridApi.getCurrentUndoSize()     // Number of available undos
gridApi.getCurrentRedoSize()     // Number of available redos
```

### Custom Undo for `applyTransaction`
- Maintain external undo stack in application state
- On each transaction: store `{ add, remove, update }` delta with inverse
- On Ctrl+Z: call reverse `applyTransaction` with inverted delta
- Complex object cell values must be **immutable** for undo to work correctly

---

## 13. Export & Clipboard

### CSV Export
- `gridApi.exportDataAsCsv(params)`
- Column selection, header inclusion, row range
- Custom value formatter applied to export
- `suppressCsvExport` to disable

### Excel Export (Enterprise)
- `gridApi.exportDataAsExcel(params)`
- `excelStyles` array for cell formatting in Excel
- Column groups preserved in Excel header
- `sheetName`, `fileName` configurable
- Data type mapping (number, date, string)
- Suppress export: `suppressExcelExport`

### Clipboard
- Copy: Ctrl+C (range or single cell)
- Paste: Ctrl+V — triggers `cellValueChanged` events per cell; undoable
- Cut: Ctrl+X (Enterprise) — clears cells and triggers `cutStart`/`cutEnd` events; undoable
- `processCellForClipboard` / `processCellFromClipboard` — intercept for custom transform
- `sendToClipboard` — custom clipboard write handler

---

## 14. Performance Optimization

### Virtualization
- `suppressColumnVirtualisation: false` — enable column virtualization (keep enabled for 200+ columns)
- `rowBuffer: 10` — rows rendered beyond visible viewport
- `debounceVerticalScrollbar: true`

### Rendering
- `suppressAnimationFrame: true` — bypass requestAnimationFrame for high-frequency updates
- `suppressRowHoverHighlight: true` — reduces re-renders on mouse move
- Use **plain JS cell renderers** over React component renderers for critical high-churn columns

### Data & Cache
- `asyncTransactionWaitMillis: 100` — batch websocket deltas
- `cacheBlockSize: 100`, `maxBlocksInCache: 10` for SSRM
- `groupDefaultExpanded: 0` — start groups collapsed (do not render all child rows at load)

### Column Definitions
- Pre-compute `cellClassRules` objects; avoid creating new function references on every render
- Use **string expressions** in `cellClassRules` instead of functions where possible
- Avoid `cellStyle` functions for high-churn columns (use `cellClassRules` instead)
- For 200+ columns: generate unique CSS class names + inject `<style>` tag dynamically; do not recompute inline styles per cell

### Server-Side vs Client-Side
- Client-side model handles up to ~100K rows adequately with virtualization
- Server-side row model (`rowModelType: 'serverSide'`) for 500K+ rows or real-time ticking datasets
- Can use SSRM with locally pre-fetched data by implementing `IServerSideDatasource` in-memory

---

## 15. Theming & Visual Customization

### Built-in Themes
- `ag-theme-alpine` / `ag-theme-alpine-dark`
- `ag-theme-balham` / `ag-theme-balham-dark`
- `ag-theme-material`
- Custom theme: `.ag-theme-bn` (MarketsUI Binance-inspired dark)

### CSS Variable Token System
- Override AG-Grid SASS variables via CSS custom properties
- Warm parchment light theme base: `#E8E4DC`
- Dark theme follows Binance-style token set
- `data-theme="dark"` / `data-theme="light"` toggle on root
- MarketsUI Design Language (MDL) tokens bridge AG-Grid vars and PrimeNG/shadcn tokens

### Per-Theme Conditional Style Rules
- Conditional styling rules (§4) support theme-specific style values
- Rules automatically apply correct color on `data-theme` switch
- Flash colors (§7) also theme-aware

### Header & Cell Appearance
- Header background, text, border
- Row alternate coloring (zebra striping)
- Selection highlight color
- Hover row color
- Focused cell border color
- Font family, size, line height

### Theme Profiles
- Multiple named visual themes saved alongside grid settings profiles
- Export/import themes as JSON
- Preview panel shows live grid with theme applied

---

## 16. Grid Settings Profiles

> Save, load, and share full grid configuration snapshots.

### Profile Contents
A profile captures the complete state of all customization layers:
- `gridOptions` overrides
- `defaultColDef` overrides
- Column definitions (widths, visibility, pin, sort, format, editor, renderer)
- Column groups
- Conditional styling rules
- Calculated columns
- Named queries
- Cell/row flashing rules
- Entitlement rules
- Theme selection
- Active filter model
- Active sort model
- Row group state

### Storage Backends
| Backend | Environment | Notes |
|---|---|---|
| Dexie IndexedDB | Dev / local | Zero-config, offline-capable |
| REST API | Production | Central profile server; team sharing |
| JSON file import | Any | Manual backup / migration |
| Local Storage | Fallback | Limited size; sync only |

### Profile Management UI
- Named profiles list (create, rename, duplicate, delete)
- Set default profile (loaded on grid init)
- Profile version history (last N snapshots)
- Role-based default profiles (different defaults per user role)
- Share profile with team (requires REST backend)
- Export profile as JSON / import from JSON
- Profile diff viewer (compare two profiles)

### Profile API
```ts
profileService.save(profileName, gridState)
profileService.load(profileName): GridState
profileService.list(): ProfileMeta[]
profileService.delete(profileName)
profileService.setDefault(profileName)
profileService.export(profileName): JSON
profileService.import(json): void
```

---

## 17. Expression Editor

> Sophisticated code editor used across Calculated Columns, Conditional Styling, Named Queries, Cell Flashing, and Editing Rules.

### Editor Modes
- **Text mode**: Monaco-style editor with syntax highlighting, autocomplete, inline error markers
- **Visual mode**: Drag-and-drop node-based expression builder
- Toggle between modes with expression round-tripping

### Autocomplete
- Column names from current grid (`{columnId}`)
- All built-in functions with signature hints
- Operator suggestions
- Variable `x` = current cell value (for cell-scope expressions)

### Function Library

| Category | Functions |
|---|---|
| Mathematical | `ABS`, `ROUND(n, decimals)`, `FLOOR`, `CEIL`, `SQRT`, `POW(base, exp)`, `MOD(a, b)`, `LOG`, `EXP` |
| Statistical | `AVG(col)`, `MEDIAN(col)`, `STDEV(col)`, `VARIANCE(col)`, `MIN(a,b)`, `MAX(a,b)` |
| Aggregation | `SUM(col)`, `COUNT(col)`, `DISTINCT_COUNT(col)` |
| String | `CONCAT(a,b,...)`, `UPPER`, `LOWER`, `TRIM`, `SUBSTRING(s, start, len)`, `REPLACE(s, from, to)`, `LEN`, `STARTS_WITH`, `ENDS_WITH`, `CONTAINS`, `REGEX_MATCH` |
| Date | `DATE_DIFF(d1, d2, unit)`, `DATE_ADD(d, n, unit)`, `NOW()`, `TODAY()`, `YEAR(d)`, `MONTH(d)`, `DAY(d)`, `IS_WEEKDAY(d)`, `FORMAT_DATE(d, fmt)` |
| Logical | `IF(cond, t, f)`, `ISNULL(v, default)`, `ISNOTNULL(v)`, `ISEMPTY(v)`, `AND(...)`, `OR(...)`, `NOT(v)` |
| Ternary | `condition ? trueExpr : falseExpr` |
| Comparison | `>`, `<`, `>=`, `<=`, `==`, `!=`, `IN [list]`, `BETWEEN a AND b` |

### Validation
- Real-time syntax error highlighting
- Type inference warnings (e.g. string compared to number)
- Unknown column reference errors
- Expression evaluation preview with sample row data

### Preview Panel
- Input: sample row data (editable JSON)
- Output: evaluated result displayed inline
- For styling expressions: shows which CSS class would be applied
- For calculated columns: shows computed value

---

## Appendix: AG-Grid API Quick Reference

### Grid API (`gridApi`)
```ts
// Data
gridApi.applyTransaction({ add, update, remove })
gridApi.applyTransactionAsync({ add, update, remove })
gridApi.setRowData(data)
gridApi.refreshCells({ columns, rowNodes, force })

// Columns
gridApi.setColumnDefs(newDefs)
gridApi.getColumnDefs()

// Filtering
gridApi.setFilterModel(model)
gridApi.getFilterModel()
gridApi.setQuickFilter(text)
gridApi.onFilterChanged()

// Sorting
gridApi.setSortModel(model)

// Editing
gridApi.startEditingCell({ rowIndex, colKey })
gridApi.stopEditing(cancel?)

// Undo/Redo
gridApi.undoCellEditing()
gridApi.redoCellEditing()
gridApi.getCurrentUndoSize()
gridApi.getCurrentRedoSize()

// Export
gridApi.exportDataAsCsv(params)
gridApi.exportDataAsExcel(params)

// Flashing
gridApi.flashCells({ rowNodes, columns, flashDuration, fadeDuration })

// State
gridApi.getColumnState()
gridApi.applyColumnState({ state, applyOrder })
gridApi.resetColumnState()
```

### Column API (`columnApi` — pre v31, merged into `gridApi` in v31+)
```ts
gridApi.setColumnVisible(colKey, visible)
gridApi.setColumnPinned(colKey, pinned)
gridApi.setColumnWidth(colKey, width)
gridApi.moveColumn(colKey, toIndex)
gridApi.getAllColumns()
gridApi.getDisplayedCenterColumns()
```

---

*Last updated: April 2026 — MarketsUI / FI Trading Terminal (Wells Fargo Structured & Credit Products)*
