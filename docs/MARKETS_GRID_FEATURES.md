# MarketsGrid — Code-Derived Feature Inventory

Compiled by reading the source under `packages/markets-grid/`, `packages/core/src/modules/`, `packages/core/src/expression/`, `packages/core/src/ui/`, and `packages/core/src/profiles/`. Reflects what actually exists in the current build (`MarketsGrid.DEFAULT_MODULES`), not historical refactor passes.

---

## 1. `<MarketsGrid>` — public component

### Props (`MarketsGridProps`)

- `gridId` — keys profile storage per instance
- `rowData` — row array
- `columnDefs` — base column definitions
- `modules` — module list (defaults to `DEFAULT_MODULES`)
- `theme` — AG-Grid theme object
- `rowIdField` — `string | string[]`, defaults to `'id'`
- `rowHeight`, `headerHeight`
- `animateRows`
- `defaultColDef`
- `sideBar` — `SideBarDef | boolean`
- `statusBar`
- `showToolbar`, `showFiltersToolbar`, `showFormattingToolbar`
- `showSaveButton`, `showSettingsButton`, `showProfileSelector`
- `storageAdapter` — single `StorageAdapter` instance
- `storage` — `StorageAdapterFactory` (closes over `appId / userId`; precedence over `storageAdapter`)
- `instanceId` — stable per-instance identity (defaults to `gridId`)
- `appId`, `userId`
- `autoSaveDebounceMs` (default 300)
- `onGridReady` — passthrough
- `onReady` — fires once after AG-Grid ready + platform mount + active profile applied
- `adminActions` — entries in Settings Tools menu
- `gridLevelData` + `onGridLevelDataLoad` — opaque per-grid blob
- `headerExtras` — ReactNode slot above toolbars
- `className`, `style`

### `MarketsGridHandle` (imperative ref)

- `gridApi` — AG-Grid `GridApi`
- `platform` — `GridPlatform`
- `profiles` — `UseProfileManagerResult`

### Public types exported from `packages/markets-grid/src`

- `SavedFilter` — `{ id, label, filterModel, active }`
- `AdminAction` — `{ id, label, icon?, description?, onClick, visible? }`
- `StorageAdapterFactory`, `StorageAdapterFactoryOpts`

---

## 2. Host-chrome subcomponents (composed by `<MarketsGrid>`)

- `FiltersToolbar`
  - Saved-filter pill carousel
  - Per-pill row-count badge
  - Add / toggle / rename / clear-all / `+` (delta-aware)
  - Carousel collapse → summary chip; persisted via `toolbar-visibility`
  - Sticky add / clear-all action cluster
- `FormattingToolbar`
  - Inline-pinned + draggable / pop-out variants
  - Modules: Context · Type · Format · Paint · Clear · Library
  - Live sample, undo/redo, rule-trail preview
  - `style-toolbar-toggle` Brush pill on filters row
- `SettingsSheet`
  - Cockpit drawer; 3-col layout (module rail / items list / editor)
  - Renders flat `SettingsPanel` or master-detail `ListPane` + `EditorPane`
  - `<PopoutPortal>` support (separate OS window)
  - Per-module back-compat `data-testid`s
- `ProfileSelector`
  - Dropdown + create / load / delete / clone / rename
  - Per-row Export, footer Export-active + Import
  - Dirty indicator on active profile
- Save button — captures grid state via `captureGridStateInto`, calls `profiles.save()`, dirty-dot, success flash
- Settings button — opens sheet inline or refocuses popped window

---

## 3. Modules in `DEFAULT_MODULES`

Wired in priority order; each ships in every profile snapshot.

| # | Module id | Priority | Schema | Has SettingsPanel |
|---|---|---|---|---|
| 1 | `general-settings` | 0 | v3 | yes |
| 2 | `column-templates` | 5 | v1 | no |
| 3 | `column-customization` | 10 | v5 | yes (master-detail) |
| 4 | `calculated-columns` | 15 | v1 | yes (master-detail) |
| 5 | `column-groups` | 18 | v1 | yes (master-detail) |
| 6 | `conditional-styling` | 20 | v1 | yes (master-detail) |
| 7 | `grid-state` | 200 | v2 | no |
| 8 | `toolbar-visibility` | 1000 | v1 | no |
| 9 | `saved-filters` | 1001 | v1 | no |

---

## 4. `general-settings` — Grid Options panel

### Essentials
- `rowHeight`, `headerHeight`, `animateRows`
- `quickFilterText`
- Pagination — enabled, pageSize, autoPageSize, hide-panel
- Selection — mode, checkbox, cellSelection, row dragging
- Cell flash + fade duration

### Row grouping / pivot
- `groupDisplayType`, `groupDefaultExpanded`
- `rowGroupPanelShow`, `rowGroupPanelSuppressSort`
- `groupHideOpenParents`, `groupHideColumnsUntilExpanded`
- `groupShowOpenedGroup`, `groupRemoveSingleChildren | leafGroupsOnly`
- `groupAllowUnbalanced`, `groupMaintainOrder`
- `stickyGroups`, `groupLockGroupColumns`
- `groupDragLeaveHidesColumns`
- `suppressGroupChangesColumnVisibility` (4-way)
- `refreshAfterGroupEdit`, `serverSideExpandAllAffectsAllRows`
- `pivotMode`, `pivotPanelShow`
- `grandTotalRow`, `groupTotalRow`, `suppressAggFuncInHeader`

### Filter / sort / clipboard
- `enableAdvancedFilter`, `includeHiddenColumnsInQuickFilter`
- Multi-sort mode (compound → `suppressMultiSort` + `alwaysMultiSort` + `multiSortKey`)
- `accentedSort`
- `copyHeadersToClipboard`, `clipboardDelimiter`

### Editing / interaction
- `singleClickEdit`, `stopEditingWhenCellsLoseFocus`
- Enter navigation (compound → vertical + after-edit)
- `undoRedoCellEditing` + limit
- `tooltipShowDelay`, `tooltipShowMode`

### Styling
- `suppressRowHoverHighlight`, `columnHoverHighlight`
- `suppressCellTextSelection`, `suppressColumnMoveAnimation`

### Default colDef (7 subsections)
- SIZING — `resizable`, `minWidth` / `maxWidth` / `width` / `flex`, `suppressSizeToFit`, `suppressAutoSize`
- SORT & FILTER — `sortable`, `filter`, `unSortIcon`, `floatingFilter`
- EDITING — `editable`, `suppressPaste`, `suppressNavigable`
- HEADER — `wrapHeaderText`, `autoHeaderHeight`, `suppressHeaderMenuButton`
- MOVEMENT & LOCKING — `suppressMovable`, `lockPosition`, `lockVisible`, `lockPinned`
- CELL CONTENT — `wrapText`, `autoHeight`, `enableCellChangeFlash`
- GROUPING · PIVOT · VALUES — `enableRowGroup`, `enablePivot`, `enableValue`

### Sidebar
- Visibility, per-panel toggles (columns / filters / custom), default panel

### Status bar
- Visibility + per-panel options

---

## 5. `column-templates` — reusable override bundles

- `templates: Record<id, ColumnTemplate>`
- `typeDefaults: Partial<Record<ColumnDataType, templateId>>` (`numeric` / `date` / `string` / `boolean`)
- Template fields — `id`, `name`, `description?`, `cellStyleOverrides`, `headerStyleOverrides`, `valueFormatterTemplate`, `sortable`, `filterable`, `resizable`, `cellEditorName`, `cellEditorParams`, `cellRendererName`, `createdAt`, `updatedAt`
- Resolution — per-field merge for style overrides; last-writer-wins elsewhere; opaque `cellEditorParams`; `typeDefaults[dataType]` folds at chain bottom unless `templateIds: []`
- Authored from Formatting Toolbar (save) + Column Settings TEMPLATES band (apply / remove)
- No SettingsPanel; no `transformColumnDefs` — passive state holder

---

## 6. `column-customization` — per-column overrides

### State
- `assignments: Record<colId, ColumnAssignment>`

### `ColumnAssignment` fields
- `headerName`, `headerTooltip`
- `initialWidth`, `initialHide`, `initialPinned`
- `cellStyleOverrides`, `headerStyleOverrides`
- `valueFormatterTemplate`
- `filter: ColumnFilterConfig`
- `rowGrouping: RowGroupingConfig`
- `editable`
- `templateIds: string[]`

### `ColumnFilterConfig`
- Tri-state enable
- Kind picker — `agTextColumnFilter` / `agNumberColumnFilter` / `agDateColumnFilter` / `agSetColumnFilter` / `agMultiColumnFilter`
- Floating-filter switch
- Buttons multi-select — apply / clear / reset / cancel
- `debounce`, `closeOnApply`
- Set-filter sub-controls — mini-filter, select-all, alphabetical sort, Excel mode (Windows / Mac), default-to-nothing
- Multi-filter sub-list — ordered sub-filters with display-mode (inline / subMenu / accordion)

### `RowGroupingConfig`
- `enableRowGroup`, `enableValue`, `enablePivot` (tool-panel)
- `rowGroup` + index, `pivot` + index (initial)
- Agg function — `sum` / `min` / `max` / `count` / `avg` / `first` / `last` / `custom` (expression evaluated via shared engine, `[value]` exposed)
- Grid-level: `groupDisplayType`, `groupTotalRow`, `grandTotalRow`, `suppressAggFuncInHeader`

### Reducers (`packages/core/src/modules/column-customization/`)
- `applyTypographyReducer` — fontFamily, fontSize, fontWeight, italic, alignment
- `applyColorsReducer` — foreground, background
- `applyAlignmentReducer` — horizontal, vertical
- `applyBordersReducer`, `clearAllBordersReducer`
- `applyHeaderNameReducer`, `applyEditableReducer`
- `applyFormatterReducer`
- `applyTemplateToColumnsReducer`, `removeTemplateRefFromAssignmentsReducer`
- `clearAllStylesReducer`, `clearAllStylesInProfileReducer`
- `writeOverridesReducer` (cell vs header)
- `mergeOverrides`, `stripUndefined`, `overrideKey`

### Pipeline
- Header alignment falls back through `headerStyleOverrides → cellStyleOverrides`
- CSS rule injection via `ResourceScope` (cleaned up on unmount)
- Per-column classes `.gc-col-c-{colId}` / `.gc-hdr-c-{colId}`

### Panel
- ListPane with windowing past 60 columns (36px row, 8-row overscan)
- Override-badge memoized as `Set<colId>`; single `useDirtyColIds()` subscription

---

## 7. `calculated-columns` — virtual columns

### State
- `virtualColumns: VirtualColumnDef[]` (`id`, `headerName`, `expression`, `dataType?`, `valueFormatterTemplate?`)

### Behaviour
- Virtual columns appended via `transformColumnDefs`; appear in `api.getColumns()`
- Cross-row `EvaluationContext.allRows` populated from per-`GridApi` WeakMap
- Cache invalidates on `rowDataUpdated` / `modelUpdated` / `cellValueChanged`
- Aggregate refresh via `api.refreshCells({ columns: virtualColIds, force: true })` on edits
- Inherit column-customization styling pipeline + Excel `[Red]` / `[Green]` colour resolver
- Header alignment fallback chain applies to virtuals
- Picked up by Column Groups composer
- Compatible with `column-customization` filter / grouping configs

### Panel
- Master-detail with Monaco `ExpressionEditor` (column / function autocomplete, `[col]` hints)
- Shared `FormatterPicker` for value formatter

---

## 8. `column-groups` — nestable group editor

### State
- `groups: ColumnGroupNode[]` — children are `{ kind: 'col', colId, show? }` or `{ kind: 'group', group }`
- `openGroupIds: Record<groupId, boolean>`

### Per-group fields
- `groupId` (stable), `headerName`
- `openByDefault`, `marryChildren`
- `headerStyle` — bold, italic, underline, fontSize, color, background, align, borders

### Behaviour
- Runtime `columnGroupOpened` writes to `openGroupIds`; restored on transform
- Stale `openGroupIds` pruned on deserialize
- CSS injection — `gc-hdr-grp-{groupId}` class + `::after` border overlay
- Pure tree ops module — `flattenGroups`, `updateGroupAtPath`, `deleteGroupAtPath`, `moveGroupAtPath`, `findGroupByPath`
- Column visibility tri-state per chip — `always` / `open` / `closed` (maps to `columnGroupShow`)
- Add subgroup capped at depth 3 (UI rule)

---

## 9. `conditional-styling` — rule editor

### Per-rule fields
- `id`, `enabled`, `priority`
- `expression` (Monaco)
- `scope` — `cell` (column list) or `row`
- `targetColumns: colId[]`
- `valueFormatterTemplate?` (preset / excelFormat / expression / tick)
- `flash` — `enabled`, `target` (cells / headers / cells+headers), `flashDuration`, `fadeDuration`, continuous-pulse toggle
- `indicator` — icon (Lucide, looked up via `INDICATOR_ICONS` / `findIndicatorIcon`), color, position (top-left / top-right), target (cells / headers / both)

### Pipeline
- Cell rules emit `cellClassRules` (`gc-rule-{id}` class)
- Row rules emit `rowClassRules`
- Header pulse + indicators driven by DOM watcher (subscribes to `modelUpdated`, `filterChanged`, `cellValueChanged`, rule-state change)
- Indicators painted via CSS `::before`, excluding `.ag-floating-filter`

---

## 10. `grid-state` — native AG-Grid state persistence

### Captured (explicit Save only)
- Full `api.getState()` — column order / visibility / width / pinning / sort / filter model / column-group open-closed / pagination / sidebar / focus / selection / row-group expansion
- Viewport anchor — `firstRowIndex`, `leftColId`, `horizontalPixel`
- `quickFilter`

### Replay
- On `onGridReady` (cold mount) and `profile:loaded`
- Empty / new profile clears via `api.setState({})` + clear quickFilterText
- Selection column re-pinned + reordered post-`setState` via `applyColumnState` deferred to microtask + `firstDataRendered`
- Stale saved order merged with live column set (saved IDs first, then new IDs appended)

---

## 11. `saved-filters`

- Opaque host-defined state (`filters: unknown[]`)
- Host shape (`markets-grid/src/types.ts`): `{ id, label, filterModel, active }`
- No transforms / SettingsPanel; ships in profile snapshot for round-trip
- Pure logic in `filtersToolbarLogic.ts` — `generateLabel`, `doesRowMatchFilterModel`, `filterModelsEqual`, `mergeFilterModels`, `subtractFilterModel`, `isNewFilter`

---

## 12. `toolbar-visibility`

- `visible: Record<toolbarId, boolean>` (missing key = host default)
- Drops non-boolean values on deserialize
- First wired consumer — FiltersToolbar collapse state under key `filters-toolbar-pills`

---

## 13. Expression Engine — built-in functions

### Math
- `ABS`, `ROUND`, `FLOOR`, `CEIL`
- `SQRT`, `POW`, `MOD`, `LOG`, `EXP`

### Aggregation (column-ref via `[col]`)
- `SUM`, `COUNT`, `DISTINCT_COUNT`
- `MIN`, `MAX`

### Statistical (column-ref via `[col]`)
- `AVG`, `MEDIAN`, `STDEV`, `VARIANCE`

### String
- `CONCAT`, `UPPER`, `LOWER`, `TRIM`
- `SUBSTRING`, `REPLACE`, `LEN`
- `STARTS_WITH`, `ENDS_WITH`, `CONTAINS`, `REGEX_MATCH`

### Date
- `NOW`, `TODAY`
- `YEAR`, `MONTH`, `DAY`, `IS_WEEKDAY`
- `DATE_DIFF` (units: days/d, hours/h, minutes/m, seconds/s)
- `DATE_ADD` (units: days/d, months/mo, years/y, hours/h)

### Logic
- `IF`, `IFS`, `SWITCH`, `CASE` (alias of SWITCH)
- `ISNULL`, `ISNOTNULL`, `ISEMPTY`

### Engine exports
- `ExpressionEngine`, `tokenize`, `parse`, `Evaluator`
- `tryCompileToAgString`
- `migrateExpressionSyntax`, `migrateExpressionsInObject`

---

## 14. FormatterPicker — preset catalogue

### Number (`num-*`)
- `num-integer`, `num-2dp`, `num-4dp`
- `num-neg-parens`, `num-neg-red-parens`
- `num-green-red-nosign`, `num-green-red-usd`
- `num-scientific`, `num-bps`

### Tick (fixed-income, `tick-*`)
- `tick-32`, `tick-32-plus`
- `tick-64`, `tick-128`, `tick-256`
- `TickToken` constants — `TICK32`, `TICK32_PLUS`, `TICK64`, `TICK128`, `TICK256`

### Currency (`cur-*`)
- USD: `cur-usd`, `cur-usd-red-neg`, `cur-usd-parens`, `cur-usd-green-red-nosign`
- EUR: `cur-eur`, `cur-eur-green-red-nosign`
- GBP: `cur-gbp`, `cur-gbp-green-red-nosign` (SSF-quoted)
- JPY: `cur-jpy`, `cur-jpy-green-red-nosign` (no decimals)
- INR: `cur-inr`, `cur-inr-green-red-nosign` (SSF-quoted)

### Percent (`pct-*`)
- `pct-0`, `pct-2`, `pct-bps`

### Date (`date-*`)
- `date-iso`, `date-us`, `date-eu`, `date-long`

### DateTime (`dt-*`)
- `dt-iso`, `dt-us-short` (+ all date presets re-exposed)

### String (`str-*`)
- `str-default`, `str-suffix-units`

### Boolean (`bool-*`)
- `bool-yn`, `bool-yes-no`, `bool-check`

### Helpers
- `inferPickerDataType()`, `presetsForDataType(dataType)`

### Template kinds (`ValueFormatterTemplate`)
- `{ kind: 'preset', presetId }`
- `{ kind: 'excelFormat', format }`
- `{ kind: 'expression', expression }` (gated by CSP policy)
- `{ kind: 'tick', tick: TickToken }`

---

## 15. Cockpit / SettingsPanel UI primitives

`packages/core/src/ui/SettingsPanel/`:

- `PanelChrome`, `Band`, `FigmaPanelSection`
- `SubLabel`, `ObjectTitleRow`, `TitleInput`
- `ItemCard`, `PairRow`
- `IconInput`, `Stepper`
- `PillToggleGroup`, `PillToggleBtn`
- `SharpBtn` (default / action / ghost / danger)
- `TGroup`, `TBtn`, `TDivider`
- `MetaCell`, `GhostIcon`
- `DirtyDot`, `LedBar`
- `Caps`, `Mono`
- `TabStrip`
- `CockpitList`, `CockpitListItem` (cmdk-backed)

## 16. Format-editor primitives

`packages/core/src/ui/format-editor/`:

- `FormatPopover`, `FormatColorPicker`, `FormatDropdown`
- `BorderSidesEditor` (with `BorderSide`, `BorderStyle`, `BorderMode`, `SideSpec` types)
- `ExcelReferencePopover`
- `registerPopoverRoot`, `clickIsInsideAnyOpenPopover` (popover stack)

## 17. StyleEditor sections

- `TextSection`, `ColorSection`, `BorderSection`, `FormatSection`
- `BorderStyleEditor`
- Opt-in `sections={[…]}` API

---

## 18. ProfileManager — public methods

`packages/core/src/profiles/ProfileManager.ts`:

### Lifecycle
- `boot()` — resolve active id (ActiveIdSource → localStorage → reserved Default), load snapshot, wire auto-save / dirty tracker
- `dispose()`

### State
- `subscribe(listener)` → unsubscribe
- `getState()` → `{ activeId, profiles[], isLoading, isDirty }`

### Operations
- `save()` — flush debounce + persist
- `discard()` — reload from disk + clear dirty
- `load(id, { skipFlush? })`
- `create(name, { id? })`
- `remove(id)` (Default cannot be deleted)
- `rename(id, name)`
- `clone(sourceId, name, { id? })`

### Import / Export
- `export(id?)` → `ExportedProfilePayload`
- `import(payload, { name?, activate?, sanitize? })`

### Identity sources
- Pluggable `ActiveIdSource` (e.g. `createOpenFinViewProfileSource()` for per-view active profile in OpenFin)

### Constants
- `RESERVED_DEFAULT_PROFILE_ID`, `activeProfileKey`

---

## 19. Storage adapters

- `StorageAdapter` interface — `loadProfile`, `saveProfile`, `deleteProfile`, `listProfiles`, `loadGridLevelData?`, `saveGridLevelData?`
- `MemoryAdapter` — ephemeral
- `DexieAdapter` — IndexedDB
- `StorageAdapterFactory` — `(opts: { instanceId, appId?, userId? }) => StorageAdapter`
- ConfigService factory (separate package `@marketsui/config-service`) — bundles all profiles into one `AppConfigRow` with `componentType: 'markets-grid-profile-set'`

---

## 20. AdminAction (Settings Tools menu)

- `id`, `label`, `onClick`
- `icon?` (Lucide refs: `database`, `file-text`, `list-checks`, `activity`, `bar-chart-3`, `shield-check`, `users`, `terminal`, `eye`, `wrench`, `refresh-cw`; defaults to wrench)
- `description?`, `visible?`
- Test id `admin-action-${id}`

---

## 21. Expression security policy

`configureExpressionPolicy({ mode, onViolation })`:

- Modes — `allow` (default) / `warn` / `strict`
- Strict mode — `valueFormatterFromTemplate` returns identity for `kind: 'expression'`; `ProfileManager.import` rejects expression-kind templates
- `import({ sanitize: true })` rewrites expression templates to `{ kind: 'preset', presetId: 'num-integer' }` (or equivalent)
- Two enforcement points — runtime compile + import-time scan
- `onViolation({ kind, expression, reason })` observer; errors swallowed
- `getExpressionPolicy()` reader

---

## 22. Core platform exports (`@marketsui/core`)

### Platform
- `GridPlatform`, `EventBus`, `ApiHub`, `ResourceScope`, `CssInjector`, `PipelineRunner`, `topoSortModules`

### Hooks
- `GridProvider`, `useGridPlatform`
- `useModuleState`, `useModuleDraft`
- `useGridApi`, `useGridEvent`, `useGridColumns`
- `useProfileManager`
- `useDirty`, `useDirtyCount`
- `useUndoRedo`, `HistoryStack`

### Popout / portals
- `PopoutPortal`, `Poppable`
- `PortalContainerProvider`, `usePortalContainer`
- `openFinWindowOpener`, `isOpenFin`

### Editors
- `ExpressionEditor` (Monaco)

### CSS
- `cockpitCSS`, `COCKPIT_STYLE_ID`
- `v2SheetCSS`, `V2_SHEET_STYLE_ID` (aliases)

### shadcn re-exports
- `Button`, `Input`, `Textarea`, `Select`, `Switch`
- `Popover`, `AlertDialog`, `Tooltip`
- `Separator`, `Label`, `ToggleGroup`, `ColorPicker`

---

## 23. Cross-cutting invariants (from code)

- Single source of truth — IndexedDB profile snapshots (`gc-customizer-v2`)
- Per-module `schemaVersion` with optional `migrate(raw, fromVersion)`
- Save path — Save click → `captureGridStateInto` → `serializeAll` → persist → `profile:saved` event
- Auto-save 300ms debounce, opt-in (`disableAutoSave: true` is the production default)
- `grid-state` only writes on explicit Save
- Cross-module state read exclusively via `ctx.getModuleState<T>(moduleId)` — modules never import each other
- Module ordering: 0 → 5 → 10 → 15 → 18 → 20 → 200 → 1000 → 1001
