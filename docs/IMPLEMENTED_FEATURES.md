# Implemented Features

AG-Grid Customization Platform — an AdapTable alternative for the MarketsUI
FI Trading Terminal.

> This document is **v2-only**. The legacy v1 packages
> (`@grid-customizer/markets-grid`, the v1 modules inside
> `@grid-customizer/core`, and the v1 e2e specs) were removed from the
> branch. History for v1 is preserved on the backup tag taken prior to
> the removal.

---

## 1. Feature Catalog

The feature catalogue below is organised by area rather than chronologically.
It covers the full Cockpit editor surface — shared primitives, the settings
shell, every module's panel, and the correctness + UX fixes that make v2
production-ready for the FI blotter use case.

### 1.1 Figma-inspired Format Editor primitives

A shared set of primitives used by every v2 editor that authors cell / header
styling. All live in `packages/core/src/ui/format-editor/` and are promoted
through the package barrel for core-v2 consumers.

- **`FormatPopover`** — Radix-Popover wrapper. Portal-based (escapes
  `overflow: hidden`), collision-detected (flip + shift), registered with
  a shared popover stack so nested popovers (border-editor → color-picker →
  thickness dropdown) don't close each other on outside-click.
- **`FormatColorPicker`** — saturation-value square + hue slider + alpha
  slider + hex input + recent-swatch strip. One component replaces every
  earlier colour picker variants.
- **`FormatSwatch`** / **`FormatDropdown`** — compact colour swatch with
  drill-in picker, dropdown primitive that portals its menu.
- **`BorderSidesEditor`** — 5-row table (All / Top / Bottom / Left / Right)
  with colour + thickness (1-5px) + style (solid/dashed/dotted) per side.
  Emits `BorderSpec` shapes consumed by both column-customization and
  conditional-styling.
- **`ExcelReferencePopover`** — dark-mode-aware scrollable panel listing the
  8 categories of Excel format string tokens, accessible from every format
  input via an info icon. Theme-aware scrollbar colours (fixed a white-bar
  bug when portaled out of the gc-sheet scope).
- **Responsive popover height** — every `FormatPopover` caps content at
  `--radix-popover-content-available-height` with `overflowY: auto`, so a
  tall popover (e.g. the FormatterPicker's preset grid) scrolls internally
  instead of clipping off the viewport edge on short windows.

### 1.2 Cockpit SettingsPanel primitive kit

New in `packages/core-v2/src/ui/SettingsPanel/` — every v2 editor composes
from these instead of rolling its own chrome.

| Primitive | Purpose |
|---|---|
| `PanelChrome` | Panel-frame shell with grip, title, status, close |
| `Band` | Numbered section header (`01 EXPRESSION`…) + hairline rule |
| `FigmaPanelSection` | Collapsible grouping of Rows with header + actions |
| `SubLabel` | 11px uppercase subsection label |
| `ObjectTitleRow` | 18px object-title row with action pills |
| `TitleInput` | Inline rename input sized for object titles |
| `ItemCard` | Single-item shell: title + dirty-dot + Save pill + delete |
| `PairRow` | 2-column paired field (Size/Weight, Top/Right border) |
| `IconInput` | 30px input pill with left icon + right suffix, commit-on-blur |
| `PillToggleGroup` + `PillToggleBtn` | Butt-joined sharp-corner toggles |
| `SharpBtn` | 26px rectangular action button (4 variants: default/action/ghost/danger) |
| `Stepper` | Narrow numeric field for up/down |
| `TGroup` / `TBtn` / `TDivider` | Flat-tray toolbar buttons used by toolbars + editors |
| `MetaCell` | Cell for the 4-column meta strip (SCHEMA / OVERRIDES / DIRTY / …) |
| `GhostIcon` | Transparent icon button for row-end actions |
| `DirtyDot` / `LedBar` | Pulsed indicators for unsaved state |
| `Caps` / `Mono` | Typography primitives |
| `TabStrip` | Sub-tabs under chrome (Rule / Preview) |
| `Band` index scaffold | Consistent `01 ESSENTIALS` band-numbering style |

All primitives consume the `--ck-*` token system scoped to `.gc-sheet-v2`:
`--ck-bg / --ck-card / --ck-border / --ck-green / --ck-t0..t3 / --ck-font-sans /
--ck-font-mono`. Dark is the default; a `[data-theme='light']` variant remaps
everything.

### 1.3 Unified `<StyleEditor>` (shared across every panel)

One component edits the style of any AG-Grid element (cell, header, group
header). Lives at `packages/core-v2/src/ui/StyleEditor/`. Composes:
- **TextSection** — PillToggleGroup for B / I / U / S + alignment, Size +
  Weight pair via shadcn Select.
- **ColorSection** — two `CompactColorField`s (Text / Background).
- **BorderSection** — reuses `BorderSidesEditor` unchanged.
- **FormatSection** — `FormatterPicker` driven by `dataType`.

Value shape is `StyleEditorValue` with `bold / italic / underline /
strikethrough / align / fontSize / fontWeight / color / backgroundColor /
backgroundAlpha / borders / valueFormatter`. Consumers pass `sections={[…]}`
to opt into subsets (e.g. column-groups uses `['text', 'color']` only).

### 1.4 Compact `<ColorPicker>` (`CompactColorField` + `ColorPickerPopover`)

Replaces every swatch + custom hex input scattered through early v2
editors. `CompactColorField` is the 30px inline field (swatch + hex +
alpha + eye / clear). `ColorPickerPopover` is the full Figma popover:
Custom / Libraries tabs, fill-type strip, saturation square, hue + alpha
sliders, eyedropper, hex + mode dropdown, recent swatches.

### 1.5 Radix Popover migration

Every popover in the app (ColorPicker, FormatPopover, shadcn `<Popover>`,
`<Select>`, `<AlertDialog>`, AG-Grid menus adjacencies) now routes through
Radix primitives. Handles portal rendering, collision detection, focus
management, Escape dismiss, and accessibility out of the box.

### 1.6 ExpressionEditor hardening (Monaco-based)

- **Suggest widget body-mount** — the settings sheet uses `transform:
  translate(-50%, -50%)` which creates a containing block for `position:
  fixed`. Monaco's suggest widget was drifting hundreds of px below the
  cursor. Fix: body-mounted `data-gc-monaco-overflow` container with
  `overflowWidgetsDomNode` pointing to it; sheet-scoped `--ck-*` tokens
  rebound on the host so the widget paints with a solid background.
- **Live draft propagation** — both the calc-column editor and the
  conditional-styling rule editor now wire `<ExpressionEditor onChange>`
  into `useDraftModuleItem.setDraft`. Previously only `onCommit`
  (blur / Ctrl+Enter) fed the draft, so typing a new expression left the
  SAVE pill greyed out until the user explicitly blurred. Users filed
  this as "SUM doesn't work" because they never saw the button light up.

### 1.7 Conditional Styling — rich rule editor

Full rewrite of the Style Rules panel on the Cockpit primitives:
- Expression field (Monaco `<ExpressionEditor>`) with live column / function
  autocomplete and `[col]` hints.
- Scope pill (cell vs row) + target-columns chip picker + priority +
  APPLIED-rows live counter.
- `<StyleEditor>` embedded with all four sections enabled.
- Flash config band — target (row / cells / headers / cells+headers),
  duration, fade, continuous-pulse toggle.
- **Rule indicator badges** — per-rule icon (20+ Lucide glyphs) + color +
  position (top-left / top-right) + target (cells / headers / both).
  Renders via CSS `::before` on the `gc-rule-{id}` class so paint stays
  cheap; no per-cell React work. Indicators now explicitly exclude
  `.ag-floating-filter` so they don't double-paint on the filter row.
- **Per-rule value formatter** — a rule can carry a `valueFormatter` that
  wraps the column's existing formatter; the highest-priority matching
  rule wins. Same `ValueFormatterTemplate` shape every other format-aware
  module uses.
- Per-card Save + Dirty LED pattern via `useDraftModuleItem`.

### 1.7b Column Settings — per-column master-detail editor

New entry in the settings-sheet header dropdown: **Column Settings**
(module id `column-customization`, renamed from the earlier internal
"Columns" label). Replaces the hidden per-column editing surface that
previously only lived inside the Formatting Toolbar. Now every column
is addressable from one screen.

- **ListPane** — reads the live column set from
  `api.getColumns()` (re-subscribed on `columnEverythingChanged /
  displayedColumnsChanged / columnVisible / columnPinned / columnResized`)
  so the left rail always lists every column the grid currently has,
  including virtual / calculated cols. Internal columns with ids
  starting `ag-Grid-` (e.g. the auto-selection column) are filtered
  out — they're configured globally via Grid Options. Each row
  carries a dirty-state LED (via the shared `gc-dirty-change` custom
  event) and a green `•` marker when the column has any stored
  overrides.

- **EditorPane** — seven bands, all driven by `useDraftModuleItem`
  scoped to `state.assignments[colId]`:

  | Band | Controls |
  |---|---|
  | 01 HEADER | header name override, tooltip |
  | 02 LAYOUT | initial width, pinned (OFF/LEFT/RIGHT), initial hide, sortable/resizable as tri-state Selects (DEFAULT/ON/OFF) |
  | 03 TEMPLATES | **chip list of applied `column-templates`** with per-chip × to remove + shadcn-Select picker to add any unapplied template. Caption clarifies "APPLICATION ORDER — LATER TEMPLATES LAYER OVER EARLIER" since resolution is order-dependent. |
  | 04 CELL STYLE | embedded `<StyleEditor sections={['text','color','border']}>` wired through a local `CellStyleOverrides ↔ StyleEditorValue` bridge (typography / colors / alignment / per-side borders) |
  | 05 HEADER STYLE | same editor, scoped to `headerStyleOverrides`. Caption: "Blank alignment = follow the cell. Explicit value overrides." — matches the header-follows-cell fallback in reinjectCSS. |
  | 06 VALUE FORMAT | shared `FormatterPicker` in compact popover mode — same Figma-style preset grid the Formatting Toolbar + Style Rule editor + Calculated Column editor all use. |
  | 07 FILTER | rich per-column filter config (schemaVersion 4): master enable tri-state, kind picker (`agTextColumnFilter` / `agNumberColumnFilter` / `agDateColumnFilter` / `agSetColumnFilter` / `agMultiColumnFilter`), floating-filter Switch, button multi-select (apply/clear/reset/cancel), debounce, closeOnApply. When kind = `agSetColumnFilter`: mini-filter, select-all, alphabetical sort, Excel-mode Windows/Mac, default-to-nothing-selected. When kind = `agMultiColumnFilter`: ordered sub-filter list with per-row display-mode (inline / subMenu / accordion) + remove. The transform composes AG-Grid `filter` / `filterParams` / `floatingFilter` ColDef fields. |
  | 08 ROW GROUPING | per-column grouping / aggregation / pivot (schemaVersion 5). Switches for `enableRowGroup` / `enableValue` / `enablePivot` (tool-panel interactivity), `rowGroup` / `pivot` with their index stepper (initial state), agg-function Select (sum / min / max / count / avg / first / last / **custom expression**). Custom mode reveals a monospace textarea compiled by the shared `ExpressionEngine` — aggregate values array is exposed as `[value]`, so formulas like `SUM([value]) * 1.1` or `MAX([value]) - MIN([value])` work end-to-end. Compile errors are warned + the column falls back to no agg. The band also surfaces four **grid-level** controls (shared source-of-truth with Grid Options → general-settings module state): `groupDisplayType` (singleColumn / multipleColumns / groupRows / custom), `groupTotalRow` (subtotal rows per group), `grandTotalRow` (grand-total row for the dataset), `suppressAggFuncInHeader` (toggles "Sum(Price)" prefix). |

- **Save semantics** — explicit SAVE pill (draft / dirty pattern). A
  commit that clears every override deletes the assignment entry
  outright rather than leaving a `{ colId }`-only stub. Auto-save
  picks the commit up on the usual 300ms debounce.

- **Works for virtual columns** — calculated columns land in
  `api.getColumns()` once `calculated-columns.transformColumnDefs`
  has run at priority 15, so they show in the list automatically.
  Header-follows-cell alignment + the Excel-colour cellStyle
  resolver already cover the styling pipeline end-to-end for
  virtual cols (see 17.8).

- **Back-compat** — module id / schemaVersion / serialise contract
  unchanged. Existing profile snapshots round-trip without a
  migration bump; the rename is display-only.

Test IDs: `cols-item-{colId}`, `cols-editor-{colId}`, `cols-save-{colId}`,
`cols-discard-{colId}`, `cols-{colId}-header-name`,
`cols-{colId}-header-tooltip`, `cols-{colId}-width`,
`cols-{colId}-hide`, `cols-{colId}-sortable-default|on|off`,
`cols-{colId}-templates`, `cols-{colId}-template-{tplId}`,
`cols-{colId}-template-remove-{tplId}`, `cols-{colId}-template-picker`,
`cols-{colId}-cell-style`, `cols-{colId}-header-style`, `cols-{colId}-fmt`,
`cols-{colId}-filter-enabled`, `cols-{colId}-filter-kind`,
`cols-{colId}-filter-floating`, `cols-{colId}-filter-debounce`,
`cols-{colId}-filter-closeonapply`, `cols-{colId}-filter-btn-{apply|clear|reset|cancel}`,
`cols-{colId}-setfilter-minifilter` / `-selectall` / `-sorting` / `-excel` / `-dtn`,
`cols-{colId}-multi-add`, `cols-{colId}-multi-{idx}-kind` / `-display` / `-remove`,
`cols-{colId}-rg-enable-rowgroup`, `cols-{colId}-rg-rowgroup`,
`cols-{colId}-rg-rowgroup-index`, `cols-{colId}-rg-enable-value`,
`cols-{colId}-rg-aggfunc`, `cols-{colId}-rg-custom-expr`,
`cols-{colId}-rg-enable-pivot`, `cols-{colId}-rg-pivot`, `cols-{colId}-rg-pivot-index`.

Verified end-to-end in preview: 21 columns listed for the demo
blotter, selecting a column opens the full 6-band editor, applied
templates show as removable chips, × on a chip drops the template
from the draft and lights the SAVE pill.

### 1.8 Calculated Columns — full port + first-class citizenship

- Native v2 module with per-grid `ExpressionEngine`, schema v1, module
  dependencies enforced by the core.
- Master-detail panel (`CalculatedColumnsList` + `CalculatedColumnsEditor`)
  using the Cockpit primitives.
- Expression field with live column / function palette + diagnostics.
- **Value formatter** via the shared compact `FormatterPicker` (same
  popover the Formatting Toolbar uses; one picker everywhere).
- **First-class styling pipeline** — virtual columns honour every toolbar /
  style-rule / column-group write:
  - Typography, alignment, colours, borders from `column-customization`
    flow into `.gc-col-c-{colId}` and `.gc-hdr-c-{colId}` classes on the
    virtual colDef (parity with base columns).
  - Excel colour tags (`[Red]` / `[Green]`) inside formatters produce a
    `cellStyle` function via `excelFormatColorResolver`, mirroring the
    base-column path.
  - Header alignment follows cell alignment automatically — the
    `effectiveHeaderAlign` fallback chain (`headerStyleOverrides →
    cellStyleOverrides`) applies to virtual cols too.
  - Column groups composer (`composeGroups`) walks the full column tree by
    colId and picks virtual columns up naturally.
- **Column-wide aggregations** — `SUM([price])` now sums every row's
  `price`, not the current row's scalar. Implementation:
  - `EvaluationContext.allRows?: ReadonlyArray<Record<string, unknown>>`
    populated from a per-GridApi WeakMap cache that invalidates on
    `rowDataUpdated / modelUpdated / cellValueChanged`.
  - `FunctionDefinition.aggregateColumnRefs?: boolean` opts each function
    in. SUM, COUNT, DISTINCT_COUNT, AVG, MEDIAN, STDEV, VARIANCE, MIN,
    MAX are all flagged; a direct `[col]` arg is replaced with the full
    column array before the function runs. Falls back to scalar
    resolution when `allRows` isn't supplied (tests, server-side).
- **Aggregate-refresh on edits** — `cellValueChanged` / `rowValueChanged`
  / `rowDataUpdated` trigger `api.refreshCells({ columns: virtualColIds,
  force: true })` so column-wide aggregates re-evaluate across every
  visible row, not just the edited one.
- **Phase 4 — compat-shim cleanup, host chrome, and FormattingToolbar
  ApiHub migration**:
  - **Deleted** `packages/core/src/store/useDraftModuleItem.ts` (the v3
    draft hook replaced by `useModuleDraft` in phase 3, zero callers).
  - **Deleted** runtime `useGridCore()` / `useGridStore()` hooks from
    `hooks/GridContext.ts` — every module panel migrated to
    `useModuleState(id)` + `useModuleDraft` + platform context in
    phase 3, so the shims had zero runtime callers. The `GridCoreLike`
    TYPE stays exported; `GridCore` / `GridStore` type aliases stay too
    so FormattingToolbar's pure helpers can keep their prop-threading
    pattern.
  - **Dropped unused `core` + `store` props from `SettingsSheet`** — the
    props were explicitly `void`-ed out. Sheet now reads `gridId` from
    `useGridPlatform()` directly and wires DIRTY=NN via a new
    `useDirtyCount()` hook against the per-platform DirtyBus instead
    of a hardcoded `0` placeholder.
  - **New `useDirtyCount()` hook** (`hooks/useDirty.ts`) — subscribes
    via `useSyncExternalStore` and returns the live number of dirty
    keys. Used by the settings-sheet header so the `DIRTY=NN` counter
    actually reflects reality across all panel drafts. Tear-free under
    concurrent rendering. 1 regression test added.
  - **FormattingToolbar `useActiveColumns` rewrite** — the 300ms
    `setInterval` polling loop for the grid api (last remaining
    instance of that antipattern) replaced with
    `platform.api.onReady()` + three typed `platform.api.on(…)`
    subscriptions (`cellFocused`, `cellClicked`,
    `cellSelectionChanged`). All listeners auto-dispose with the
    platform, no leaked timers across StrictMode mount cycles.
  - **Stale doc polish** — `IconInput.tsx`'s comment now references
    `useModuleDraft` instead of the deleted `useDraftModuleItem`; the
    `useModuleDraft` file-level header drops its "vs the v3 shim"
    framing now that the shim is gone.

- **Column Settings v4 panel rewrite (phase 3e)** — the last of the five
  settings panels. Same three shared antipatterns removed:
  `dirtyRegistry + window.dispatchEvent('gc-dirty-change')` →
  `useDirty('column-customization:<colId>')`; `useAllColumns()` with
  local `tick` polling 5 AG-Grid events → platform `useGridColumns()`;
  `useDraftModuleItem({ store, … })` + `useModuleState(store, id)`
  compat shims → `useModuleDraft` + 1-arg `useModuleState(id)`. Plus
  one panel-specific cleanup: the CUSTOM AGGREGATION expression row
  was a native `<textarea>` (the last native form element on any
  settings panel) → swapped to shadcn `Textarea` per the v4
  UI-primitives rule. `module.ListPane` + `module.EditorPane` wired
  natively. All `cols-*` testIds preserved; panel 1614 → 1521 LOC; 7
  integration tests added against a fake GridApi harness. Every module
  panel in the project is now on the clean v4 pattern.

- **Conditional Styling v4 panel rewrite (phase 3d)** — same three
  antipatterns cleaned plus two extra that only this panel carried:
  - `new ExpressionEngine()` allocated at module load → switched to
    `useGridPlatform().resources.expression()`. Validation now runs
    through the same engine that evaluates rules at transform time.
  - `<RuleRow>` subscribed to the entire `conditional-styling` slice
    just to read a committed snapshot it `void`-ed out and never used —
    re-rendered every row on every keystroke. Dropped; `RuleRow` now
    re-renders only when its own `rule`/`active` props change, with the
    dirty LED subscribing independently via `useDirty`.
  - Plus the shared fixes: `dirtyRegistry + window.dispatchEvent('gc-
    dirty-change')` → `useDirty('conditional-styling:<ruleId>')`; local
    `useGridColumns()` with tick polling → platform `useGridColumns()`;
    compat shims `useDraftModuleItem` / `useModuleState(store, id)`
    replaced.
  All `cs-*` testIds preserved. `module.ListPane` + `module.EditorPane`
  wired. Panel 1115 → 1036 LOC; 9 integration tests added.

- **Column Groups v4 panel rewrite (phase 3c)** — same v2 antipatterns
  removed (file-level `dirtyRegistry` + `window.dispatchEvent('gc-dirty-
  change')`, a second local `useGridColumns()` with its own `tick`
  polling, compat shims `useDraftModuleItem` / `useModuleState(store,
  id)`). Tree-mutation helpers (`flattenGroups`, `updateGroupAtPath`,
  `deleteGroupAtPath`, `moveGroupAtPath`, `findGroupByPath`) extracted
  into a dedicated `treeOps.ts` module with 11 unit tests — they're pure
  data transforms and now individually exercised instead of only being
  hit through the panel. `module.ListPane` + `module.EditorPane` wired
  so the settings sheet renders master-detail natively. All `cg-*`
  testIds preserved; panel file 868 → 669 LOC; 8 integration tests added.

- **v4 panel rewrite (phase 3b)** — three v2 antipatterns stripped while
  preserving every `cc-*` testId:
  - File-level `dirtyRegistry = new Set<string>()` +
    `window.dispatchEvent('gc-dirty-change')` broadcast → replaced by
    `useDirty(key)` against the per-platform `DirtyBus`. Fixes the
    cross-grid dirty-bleed v2 had on multi-grid pages.
  - `useBaseGridColumns()` with local `tick` state + raw
    `api.addEventListener` → replaced by the stable fingerprint-cached
    `useGridColumns()` hook (ApiHub-wired, auto-disposed).
  - `useDraftModuleItem({ store, … })` + `useModuleState(store, id)` v3
    compat shims → `useModuleDraft` (no store arg, auto-registers on
    dirty bus) + `useModuleState(id)` 1-arg form.
  - `module.ListPane` + `module.EditorPane` now set so the settings
    sheet renders master-detail natively instead of falling back to the
    flat `SettingsPanel` composition. 8 integration tests added.

### 1.8b Column Groups — nestable group editor

Module `column-groups` (priority 18 — runs after column-customization + calculated-columns so group children include renamed + virtual cols; before conditional-styling so rules can target grouped columns). Authored settings panel under the `Column Groups` nav entry.

- **ListPane** (`cg-panel` root, `cg-add-group-btn` for creating a new top-level group) — flattens the tree with `flattenGroups()` so nested subgroups appear indented under their parent. Each row (`cg-group-{groupId}`) carries a dirty LED via `useDirty('column-groups:<groupId>')`. Groups inherit a stable `groupId` emitted as `ColGroupDef.groupId` so AG-Grid's expand/collapse state survives every `columnDefs` update.

- **EditorPane** (`cg-group-editor-{groupId}`):

  | Control | Testid | Effect |
  |---|---|---|
  | Header name (TitleInput) | `cg-name-{groupId}` | `ColumnGroupNode.headerName` |
  | Move up / Move down | `cg-up-{groupId}` / `cg-down-{groupId}` | Reorder sibling groups via `moveGroupAtPath` — disabled at list ends |
  | Save | `cg-save-{groupId}` | Commit draft into state (dirty LED clears) |
  | Delete | `cg-delete-{groupId}` | Remove via `deleteGroupAtPath` — drops the corresponding `openGroupIds[groupId]` in the same action |
  | OPEN BY DEFAULT Switch | (no testid) | `ColGroupDef.openByDefault` — overridden at runtime by `openGroupIds[groupId]` once the user expands/collapses manually |
  | MARRY CHILDREN Switch | (no testid) | AG-Grid `marryChildren` — prevents users dragging cols out of the group header |
  | DEPTH / CHILDREN readouts | — | Live count, updates as the user composes |

  **01 COLUMNS band** — chip list of `ColumnGroupChild` entries with add + subgroup affordances:
  - Column chips: `cg-chip-{groupId}-{colId}` — shows header name + a tri-state visibility toggle (`cg-chip-show-{groupId}-{colId}`) cycling through `always` / `open` / `closed` (Eye / EyeOff / Lock icons). Maps 1:1 to AG-Grid's native `ColDef.columnGroupShow`.
  - Add column: `cg-add-col-{groupId}` — Select that lists every unassigned column (`eligibleToAdd` = columns not yet assigned to any group via `collectAssignedColIds`).
  - Add subgroup: `cg-add-sub-{groupId}` — inserts a nested `ColumnGroupNode`. Disabled when depth ≥ 3 (nesting cap).
  - Remove column: per-chip × button.

  **Header-style band** — embedded `<StyleEditor sections={['text','color','border']} dataType="text">` with testid `cg-hdr-style-{groupId}`. Writes into `ColumnGroupNode.headerStyle`: `{ bold, italic, underline, fontSize, color, background, align, borders }`. Styles are applied via runtime CSS injection (`gc-hdr-grp-{groupId}` class targeting the header cell + its inner label span), with a `::after` overlay for per-side borders so dashed / dotted strokes render correctly (box-shadow can't).

- **Runtime expand/collapse memory** — `platform.api.on('columnGroupOpened')` (subscribed in `module.activate(...)` via a single `onReady` hook, not a polled reconnect) writes `{ [groupId]: isExpanded }` into `openGroupIds`. The next `transformColumnDefs` applies that to `ColGroupDef.openByDefault`, so reloading the profile restores the exact layout the user left. Stale entries pruned on deserialize via `collectGroupIds(state.groups)`.

- **State shape** (`ColumnGroupsState`):
  ```ts
  {
    groups: ColumnGroupNode[],
    openGroupIds: Record<string, boolean>,   // pruned on deserialize
  }
  ```
  Each `ColumnGroupNode.children` is a mixed array of `{ kind: 'col', colId, show? }` or `{ kind: 'group', group }`, so nesting is arbitrary-depth (capped at 3 by the panel UI, not the state).

- **Save semantics** — same draft/dirty pattern as every other editor (`useModuleDraft` scoped to `<groupId>`), explicit SAVE pill commits into module state, auto-save picks it up on the usual 300ms debounce.

- **Pure tree ops** — `treeOps.ts` hosts `updateGroupAtPath` / `deleteGroupAtPath` / `moveGroupAtPath` / `flattenGroups` as pure helpers with their own 11-test `treeOps.test.ts`. No rendering needed to regress group mutation logic.

Testids: `cg-panel`, `cg-add-group-btn`, `cg-group-{groupId}`, `cg-group-editor-{groupId}`, `cg-name-{groupId}`, `cg-up-{groupId}`, `cg-down-{groupId}`, `cg-save-{groupId}`, `cg-delete-{groupId}`, `cg-add-sub-{groupId}`, `cg-chip-{groupId}-{colId}`, `cg-chip-show-{groupId}-{colId}`, `cg-add-col-{groupId}`, `cg-hdr-style-{groupId}`.

### 1.8c Column Templates — reusable override bundles

Module `column-templates` (priority 5 — runs BEFORE column-customization so its state is settled when the customization walker reads it). Unlike the other editor modules, this one has NO dedicated settings panel — templates are authored from two existing surfaces:

- **Save-as-template (in Formatting Toolbar)** — `save-tpl-input` + `save-tpl-btn` inside the Templates popover (`templates-menu-trigger`). Reads the currently-selected column's `ColumnAssignment` via `snapshotTemplate(custState, tplState, colId, name, dataType)`, strips fields that match the column's `typeDefault` template (so the snapshot captures only user-authored overrides), and dispatches `addTemplateReducer(tpl)` into `column-templates` state.
- **Apply-template (in Formatting Toolbar)** — Templates popover lists every existing template; clicking `templates-menu-item-{tplId}` dispatches `applyTemplateToColumnsReducer` which writes the templateId into every selected column's `ColumnAssignment.templateIds[]`.
- **Remove-template (in Column Settings)** — the TEMPLATES band (`03`) on `ColumnSettingsPanel` renders each applied template as a chip with per-chip × (`cols-{colId}-template-remove-{tplId}`); the `cols-{colId}-template-picker` Select adds any unapplied template.

- **State shape** (`ColumnTemplatesState`):
  ```ts
  {
    templates: Record<string, ColumnTemplate>,
    typeDefaults: Partial<Record<ColumnDataType, string>>,   // numeric/date/string/boolean → templateId
  }
  ```
  Each `ColumnTemplate`:
  - `id` (stable), `name`, optional `description`
  - `cellStyleOverrides`, `headerStyleOverrides` (same shape as column-customization)
  - `valueFormatterTemplate` (discriminated union: `preset` / `expression` / `excelFormat` / `tick`)
  - Behaviour flags: `sortable`, `filterable`, `resizable`
  - Cell editor / renderer registry keys: `cellEditorName`, `cellEditorParams`, `cellRendererName`
  - `createdAt` / `updatedAt` audit timestamps

- **Resolution** (`resolveTemplates(assignment, state, dataType)`):
  1. `cellStyleOverrides` / `headerStyleOverrides` — merge per-field across the chain (later templates win individual facets).
  2. Every other field — last-writer-wins.
  3. `cellEditorParams` — opaque, no deep merge; last template's params object replaces earlier.
  4. If `assignment.templateIds` is undefined AND the column has a `dataType`, the `typeDefaults[dataType]` template folds in at the bottom of the chain. An explicit empty `templateIds: []` opts out of the typeDefault.

- **20-test `snapshotTemplate.test.ts`** covers: extracting bold / italic / color / borders from a styled column; stripping fields that equal the typeDefault; round-trip through add/remove reducers; null-safe empty-assignment paths.

- **No `SettingsPanel` / no `transformColumnDefs`** — column-templates is a passive state holder. `column-customization.transformColumnDefs` reads it via `ctx.getModuleState<ColumnTemplatesState>('column-templates')` and folds the chain through `resolveTemplates` before emitting the final per-column AG-Grid ColDef.

Testids (interaction surfaces, not direct state): `templates-menu-trigger`, `templates-menu`, `templates-menu-item-{tplId}`, `save-tpl-input`, `save-tpl-btn`, `cols-{colId}-templates`, `cols-{colId}-template-{tplId}`, `cols-{colId}-template-remove-{tplId}`, `cols-{colId}-template-picker`.

### 1.8d Saved Filters — opaque state holder

Module `saved-filters` (priority 1001 — effectively last in the module chain; no transforms, no ordering constraint). Core does NOT interpret the filter records. The host (`markets-grid`'s `FiltersToolbar`) defines the concrete `SavedFilter` shape and casts through `useModuleState<SavedFiltersState>('saved-filters')`. The module exists so the host's filter pills ride along inside the active profile snapshot via `serializeAll()` / `deserializeAll()`.

- **State shape**:
  ```ts
  interface SavedFiltersState {
    filters: unknown[];   // opaque — host defines SavedFilter
  }
  ```

- **Host-defined shape** (`markets-grid/src/types.ts:SavedFilter`):
  ```ts
  interface SavedFilter {
    id: string;                                  // `sf_<timestamp>_<random4>` (makeId)
    label: string;                               // user-editable, auto-generated from model
    filterModel: Record<string, unknown>;        // AG-Grid filter-model snapshot
    active: boolean;                             // whether this pill's model is currently applied
  }
  ```

- **Interaction surface** lives in `FiltersToolbar` (documented in §1.x). Pure logic extracted to `filtersToolbarLogic.ts` with 26 unit tests covering `generateLabel`, `doesRowMatchFilterModel`, `filterModelsEqual`, `mergeFilterModels` (per-pill count predicates, echo detection for `+` button enabling, multi-filter OR merge with `set`-value union).

- **Auto-save path** — every add / toggle / rename / remove writes through `useModuleState(...)` setState, which the profile-auto-save debounce picks up on the usual 300ms cycle. Reload restores every pill (including active/inactive state) before the grid's first `modelUpdated`.

- **No settings panel** — the toolbar IS the editor. Nav entry intentionally omitted from the settings sheet.

Testids (all in FiltersToolbar): `filters-toolbar`, `filters-add-btn`, `filter-pill-{id}`, `filter-pill-count-{id}`, `filters-caret-left`, `filters-caret-right`, `style-toolbar-toggle`.

### 1.8e Toolbar Visibility — hidden per-profile toolbar layout

Module `toolbar-visibility` (priority 1000). Tracks which optional toolbars (Filters, Formatting, etc.) the user has shown in the host app so the layout round-trips across profile load / save.

- **State shape**:
  ```ts
  interface ToolbarVisibilityState {
    visible: Record<string, boolean>;   // toolbar id → visible. Missing key = host default.
  }
  ```

- **Never appears in the settings nav** — no `SettingsPanel` field on the module. Consumed via `useModuleState<ToolbarVisibilityState>('toolbar-visibility')` from host chrome (the `FiltersToolbar`'s Brush toggle currently lives in `MarketsGrid` local state; a future wiring pass would move it through this module).

- **Forgiving deserialize** — missing keys mean "host default" (deliberately NOT seeded `false` so a host that adds a new toolbar id later doesn't have to migrate every old profile). Non-boolean values are dropped on deserialize so a stray `null` / string can't poison render.

- **Usage today** — registered in `MarketsGrid.DEFAULT_MODULES` so its state ships in every profile snapshot, but the concrete toolbar-toggle bindings (Brush pill, filters toolbar show/hide) are not yet routed through it. Documented here as a scaffold module — the missing wiring is one of the known follow-up items for host-chrome layout polish.

- **No testids** — purely state.

### 1.9 Expression Engine extensions

- **Multi-branch conditionals** — `IFS(cond1, val1, cond2, val2, …,
  default?)`, `SWITCH(expr, case1, val1, …, default?)`, and a `CASE`
  alias. Trailing default is optional (odd arg count); no-match returns
  `null` when absent.
- Column-aggregation semantics (see 17.8).
- Existing `IF` / chained ternary unchanged for back-compat.

### 1.10 Grid State Persistence (new `grid-state` module)

Captures the native AG-Grid state (column order / widths / pinning /
sort / filters / column-group open-closed / pagination / sidebar / focus
/ selection / row-group expansion) plus a viewport anchor + quick filter
**on explicit Save only** — every other module keeps its auto-save
cadence, but native grid state is explicit-save-only to match the user's
expectation that Save is a commit, not a keystroke write.

- Replayed on `onGridReady` (cold mount) and `profile:loaded` events
  (profile switch).
- Wire format matches the standalone `agGridStateManager.ts` reference
  (SavedGridState envelope, schema v3) so snapshots from either side
  are interchangeable.

Correctness fixes layered on top:
- **Blank-slate new profile** — `createProfile` now calls `core.resetAll()`
  before serializing, and the grid-state module resets the live grid
  (`api.setState({})` + clear quickFilterText) when the loaded profile
  has no saved state. Creating a new profile no longer inherits the
  previous profile's layout / rules / calc-cols / filters.
- **Delete doesn't resurrect** — `deleteProfile` cancels the pending
  auto-save debounce before erasing the record and passes `skipFlush:
  true` when falling back to Default, so the outgoing profile can't be
  rewritten by a post-delete flush.
- **Selection column position + pinning** — `api.setState` silently
  drops the auto-generated `ag-Grid-SelectionColumn`'s position AND
  pinning on reload. Fix: emit `selectionColumnDef: { suppressMovable:
  false, lockPosition: false, initialPinned: 'left' }` from
  `general-settings` so the column is a first-class participant, then
  re-apply order + pinning post-setState via `applyColumnState({ state:
  mergedOrder, applyOrder: true })` deferred to `queueMicrotask` +
  `firstDataRendered`. Each entry carries its `pinned` value derived
  from the saved `columnPinning` sets, so pinning round-trips.
- **Stale saved order doesn't hide new columns** — when a calc column
  is added after the last save, the reorder merges the live column set
  into the saved order: saved IDs first, then live IDs not in the
  snapshot appended at the end. Without this, adding a new virtual
  column made it disappear on reload because the stale `orderedColIds`
  list didn't reference it.
- **Save doesn't jolt the selection column** — stable-reference memo on
  `gridOptions` + diff-then-push in the setGridOption effect ensure
  the `rowSelection` + `selectionColumnDef` props aren't re-issued on
  every store tick. Previously every Save click fired setGridOption
  for both, which made AG-Grid regenerate the auto-injected selection
  column and lose its pinned / reordered position.

### 1.11 Grid Options Settings Panel (module renamed `general-settings`)

New dedicated editor at `Settings → Grid Options`. Dropdown label
`"Grid Options"` (renamed from `"General Settings"`); schema bumped v1 →
v2 with additive migrate.

**State coverage** — every user-actionable scalar / toggle / enum from the
curated Top-40 AG-Grid v35 options spec (`ag-grid-customizer-input-controls.md`)
plus the full Row Grouping surface:

| Band | Controls |
|---|---|
| **01 ESSENTIALS** | rowHeight, headerHeight, animate, rowSelection, checkbox + cellSelection, flash / fade duration, pagination (+auto-page + hide-panel), quickFilterText |
| **02 ROW GROUPING** | groupDisplay, defaultExpanded, rowGroupPanel (+ no-sort), hideOpenParents, hideColumnsUntilExpanded, showOpenedGroup, single-child flatten (bool \| leafGroupsOnly), allowUnbalanced, maintainOrder, stickyGroups, lockGroupColumns, dragLeaveHides, suppressGroupChangesColumnVisibility (4-way enum), refreshAfterGroupEdit, ssrmExpandAllAffectsAllRows |
| **03 PIVOT · TOTALS · AGGREGATION** | pivotMode, pivotPanel, grandTotalRow, groupTotalRow, suppressAggFuncInHeader |
| **04 FILTER · SORT · CLIPBOARD** | enableAdvancedFilter, includeHiddenColumnsInQuickFilter, multiSortMode (compound → suppressMultiSort + alwaysMultiSort + multiSortKey), accentedSort, copyHeadersToClipboard, clipboardDelimiter |
| **05 EDITING · INTERACTION** | singleClickEdit, stopEditingWhenCellsLoseFocus, enterNavigation (compound → enterNavigatesVertically + …AfterEdit), undoRedoCellEditing + limit, tooltipShowDelay, tooltipShowMode |
| **06 STYLING** | suppressRowHoverHighlight, columnHoverHighlight |
| **07 DEFAULT COLDEF** | 7 subsections: SIZING (resizable, min/max/width/flex, suppressSizeToFit, suppressAutoSize), SORT & FILTER (sortable, filter, unSortIcon, floatingFilter), EDITING (editable, suppressPaste, suppressNavigable), HEADER (wrapHeaderText, autoHeaderHeight, suppressHeaderMenuButton), MOVEMENT & LOCKING (suppressMovable, lockPosition enum, lockVisible, lockPinned), CELL CONTENT (wrapText, autoHeight, enableCellChangeFlash), GROUPING · PIVOT · VALUES (enableRowGroup, enablePivot, enableValue) |
| **08 PERFORMANCE (ADVANCED)** | rowBuffer (live), suppressScrollOnNewData (live), + 5 initial-only flags (suppressColumnVirtualisation, suppressRowVirtualisation, suppressMaxRenderedRowRestriction, suppressAnimationFrame, debounceVerticalScrollbar) |

**UI pattern** — every multi-option enum is a shadcn `<Select>` dropdown
(replaced earlier overlapping pill groups). Readable Title Case labels
(e.g. "Only when grouping" instead of "WHEN GROUPING"). `boolean |
'literal'` unions encode/decode through string sentinels at the
SelectControl boundary so TypeScript keeps the union typed while the
native select stays in string-value land.

**Header with explicit SAVE** — the panel has its own `<ObjectTitleRow>`
header with a teal SAVE pill (action when dirty, ghost when clean) and
a RESET pill. Runs through `useModuleDraft` (v4 replacement for
`useDraftModuleItem`) treating the whole state as the "item"; every
control edits a local draft and the grid doesn't re-render until the
user clicks SAVE. Dirty flag auto-registers on the per-platform
`DirtyBus` so the settings sheet's DIRTY=NN counter stays accurate.

60 total controls on one panel.

**v4 schema-driven rewrite (phase 3a)** — the 1425-LOC v2-verbatim panel
(hand-rolled `<Row>`/`<BooleanControl>`/… repeated 80×) collapsed to a
~130-LOC thin shell (`GridOptionsPanel.tsx`) + a pure-data schema
(`gridOptionsSchema.tsx`) + a generic `<BandRenderer>`
(`fieldSchema.tsx`). Adding a new grid option is now a single record in
the schema array, not a fresh JSX block. Visual fidelity is preserved
pixel-for-pixel — the renderer emits the same `<Band>` + `<Row>` markup
v2 used; tests cover all seven field kinds (bool / num / optNum / text
/ select / invert / conditional / custom). 10 integration tests added
(`GridOptionsPanel.test.tsx`).

### 1.12 Formatter Toolbar + FormatterPicker

- **Shared FormatterPicker** — one component (`packages/core-v2/src/ui/
  FormatterPicker/`) used by the Formatting Toolbar, the Style Rule
  editor, AND the Calculated Column editor. `compact` variant renders
  the Figma-style popover with preset tile grid grouped by DECIMALS /
  NEGATIVES / SCIENTIFIC / BASIS POINTS + CUSTOM EXCEL FORMAT row with
  currency quick-insert.
- **Value formatter presets** — Integer, 2 decimals, 4 decimals, parens-neg,
  red-parens-neg, Green / Red (no sign) with $ / € / £ / ¥ / ₹ / CHF
  variants, Scientific, Basis points, 5 tick formats (TICK32, TICK32_PLUS,
  TICK64, TICK128, TICK256) for fixed-income bond prices.
- **Tick button denominator** — the toolbar tick button shows the
  denominator (`32` / `32+` / `64` / `128` / `256`), not the ticks
  numerator portion of the sample string. Previously applying TICK32
  flipped the button label from `32` → `16` which was the numerator.
- **Currency quick-insert row** — $, €, £, ¥, ₹, CHF buttons smart-
  replace the currency symbol in the current custom format while
  leaving the rest of the pattern intact.
- **SSF-safe symbol handling** — £ / ¥ / ₹ / CHF wrapped in quoted
  literals (`"£"` etc.) because SSF rejects bare non-dollar/euro
  currency glyphs. Fixed a round-trip bug where INR failed
  `isValidExcelFormat` on the second click.
- **ISO date coercion** — Date objects + ISO-8601 strings (starts with
  `yyyy-mm-dd`) get parsed to Date before being handed to SSF so date
  formats like `dd-mm-yyyy` render, not raw ISO text.
- **Excel color resolver** — `[Red]` / `[Green]` tags in format
  strings produce a per-value `cellStyle` resolver that paints the
  cell colour. Now applies to virtual columns too.
- **Cell-datatype auto-detection** — on first data render, sample the
  first 20 rows of each column to infer `cellDataType` so the
  FormatterPicker filters its preset list by column type (number /
  date / string / boolean). Host-provided `cellDataType` wins.
- **Header alignment follows cell** — aligning cells via "Cell" target
  applies the same alignment to the column header by default; the user
  can override by explicitly selecting the "Header" target in the
  toolbar. Implementation: a fallback chain in `reinjectCSS`
  (`headerStyleOverrides → cellStyleOverrides`) + header-class
  attachment whenever either is set.

### 1.12b Floating / draggable Formatting Toolbar

- **Floating panel** — the Formatting Toolbar is no longer pinned
  inline below the main toolbar. It renders inside a position-fixed
  `DraggableFloat` wrapper (`packages/markets-grid-v2/src/DraggableFloat.tsx`)
  at `z-index: 9999` so it floats above the grid but below its own
  Radix popovers (`z-[2147483647]`).
- **Drag handle** — a 22px-tall bar at the top of the panel with the
  `GripVertical` icon, "FORMATTING" label, and a close (X) button. A
  single `pointerdown` on the handle starts a drag tracked on the
  window via `pointermove`/`pointerup`; position is clamped to the
  viewport so the handle can never be stranded offscreen.
- **Close any time** — the X button in the handle dismisses the panel
  instantly. Re-open via the `STYLE` pill (see below) — the panel
  returns at its last-dragged position (local state).
- **Style pill on the FiltersToolbar** — the toggle button was moved
  from the primary `gc-toolbar-primary` bar (where it lived alongside
  Save/Settings) to the inline filter pill row (`FiltersToolbar`).
  Styled as a teal pill with a `Brush` icon and "STYLE" label,
  matching the filter pill vocabulary. Test id `style-toolbar-toggle`.
- **Width** — the panel clamps to `min(1180px, 100vw - 32px)` so the
  toolbar's horizontal-scroll chrome inside keeps working on narrow
  viewports.
- **Window-resize clamp** — on `window.resize` the panel re-clamps
  its (x, y) back into the new viewport so a shrunk browser window
  can't leave the handle unreachable.

### 1.13 Column Reorder + Horizontal Scroll Chrome

- `maintainColumnOrder: true` on the AgGridReact props preserves the
  user's drag-reordered column positions when `columnDefs` re-derive
  (happens on every module-state change). Without this, applying a
  toolbar format would reset the column order to the base `columnDefs`
  sequence.
- Toolbar slot horizontal overflow contained (`min-w-0 overflow-x-auto
  overflow-y-visible`) so applying a formatter doesn't push the page
  into horizontal scroll.
- AG-Grid `theme` adjustments: `iconSize: 10` on shared params (both
  light + dark). Vertical column borders re-enabled in the demo theme.

### 1.14 Header / floating-filter icon hover chrome

- Menu button + filter funnel + floating-filter button render with
  `opacity: 0` + `pointer-events: none` in the idle state instead of
  collapsing `width` to zero. Hover / `:focus-within` /
  `[aria-expanded='true']` restore `opacity: 1` + `pointer-events:
  auto`. No layout thrash — previously every cursor pass reflowed the
  column header by ~32px.

### 1.15 Profile UX

- **Per-profile auto-save** — debounced 300ms. Explicit Save button
  flushes the debounce immediately.
- **New profile starts blank** — `resetAll()` runs before snapshotting
  in `createProfile`; the grid-state module handles `saved: null` by
  calling `api.setState({})` to clear AG-Grid-native state that lives
  outside module transforms.
- **Delete safety** — cancels pending auto-save before erasing the
  record, uses `skipFlush: true` when falling back to Default.
- **Shadcn AlertDialog** — replaced native `window.confirm` for delete
  confirmation with a proper modal (`@radix-ui/react-alert-dialog`).
  Adds `AlertDialog` / `AlertDialogContent` / `AlertDialogHeader` /
  `AlertDialogFooter` / `AlertDialogTitle` / `AlertDialogDescription`
  / `AlertDialogAction` (primary / destructive variants) /
  `AlertDialogCancel` to the shadcn primitive set.
- **Export / Import profiles as JSON** — every profile in the selector
  popover has a per-row `Download` button on hover; a footer row offers
  `Export` (active profile) and `Import` (file picker). Payload shape:
  ```json
  {
    "schemaVersion": 1,
    "kind": "gc-profile",
    "exportedAt": "2026-04-18T…",
    "profile": { "name": "T2", "gridId": "demo-blotter-v2", "state": { <9 modules> } }
  }
  ```
  The state is the same module → versioned envelope shape the store
  produces via `core.serializeAll()`, so round-tripping through
  export → import goes through each module's regular deserialize /
  migrate path. Import is always additive (generates a unique id +
  name on collision), flushes auto-save before exporting, and
  activates the imported profile. Test IDs: `profile-export-{id}`
  per-row, `profile-export-active-btn`, `profile-import-btn`,
  `profile-import-file`. New hook API:
  `useProfileManager().exportProfile(id?)` →
  `Promise<ExportedProfilePayload>`, and `.importProfile(payload,
  options)` → `Promise<ProfileMeta>`.

### 1.16 SettingsSheet chrome cleanup

- Removed the `PROFILE=<gridId>` status pill from the header — duplicated
  what the main toolbar's profile selector already shows.
- DIRTY counter stays.

### 1.17 Demo app

- **Price column is editable** (`editable: true` + `agNumberCellEditor`
  with 4-digit precision) — drives the cell-edit → aggregate-refresh
  flow in the Calculated Columns module.
- **Grid API debug hook** (opt-in, not committed by default) for
  preview-based E2E / manual testing of column-state APIs.

---

## 2. Summary Statistics

| Category | Count |
|----------|-------|
| **v2 Shipped Modules** | **9** — general-settings (Grid Options), column-templates, column-customization, calculated-columns, column-groups, conditional-styling, saved-filters, toolbar-visibility, grid-state |
| **v2 Settings Panels** | **5 dedicated editors** (Grid Options, Column Settings, Calculated Columns, Column Groups, Style Rules) + **3 indirect editors** (Column Templates via Formatter Toolbar + Column Settings, Saved Filters via FiltersToolbar, Toolbar Visibility auto-tracked) + Profile Selector |
| Built-in Expression Functions | **65+** across Math / Stats / Aggregation / String / Date / Logic / Type / Lookup / Coercion |
| → column-aware aggregation functions | 9 (SUM, COUNT, DISTINCT_COUNT, AVG, MEDIAN, STDEV, VARIANCE, MIN, MAX) |
| → multi-branch conditional functions | 4 (IF, IFS, SWITCH, CASE) |
| **Grid Options controls** | **60** across 8 bands (+ 7 subsections in DEFAULT COLDEF) |
| Value Formatter Presets | **14** (Integer / 2dp / 4dp / parens-neg / red-parens-neg / green-red-nosign / green-red-$, + 5 tick formats + Scientific + BPS) |
| Currency quick-insert symbols | 6 ($, €, £, ¥, ₹, CHF) |
| Cockpit SettingsPanel Primitives | 20+ |
| Shared `StyleEditor` sections | 4 (text / color / border / format) |
| Format Editor popover primitives | 6 (FormatPopover, FormatColorPicker, FormatSwatch, FormatDropdown, BorderSidesEditor, ExcelReferencePopover) |
| Shadcn UI Components (incl. AlertDialog) | 12 |
| Rule Indicator Icons (Lucide) | 20+ |
| Tick-format denominations | 5 (32, 32+, 64, 128, 256) |
| Profile Auto-save debounce | 300ms |
| v2 E2E Test Suites | 10+ |
| v2 Approximate LOC | ~9,000 (core-v2 ~7,200 + markets-grid-v2 ~1,800) |

### Architecture invariants held across the v2 work

- Single source of truth: IndexedDB profile snapshots (`gc-customizer-v2` db).
- Per-module `schemaVersion` with optional `migrate(raw, fromVersion)`.
- Auto-save path: store → 300ms debounce → serializeAll → persist → `profile:saved` event.
- `grid-state` module is the one deliberate exception — captures on explicit Save only so AG-Grid native state isn't touched on every keystroke.
- Module ordering (priority): `general-settings (0)` → `column-templates (1)` → `column-customization (10)` → `calculated-columns (15)` → `column-groups (18)` → `conditional-styling (20)` → `grid-state (200)`.
- Every cross-module read goes through `ctx.getModuleState<T>(moduleId)` — no direct imports between modules.

---

## 3. Editor coverage matrix — unit + e2e status

**Legend:** ✅ solid · ◐ partial (smoke only / pure logic only) · ❌ none

| Module / Editor | Feature catalog (§) | Pure-logic unit tests | Panel unit tests | E2E |
|---|---|---|---|---|
| `general-settings` — Grid Options | §1.11 | — | ✅ `GridOptionsPanel.test.tsx` (10) | ◐ smoke (mount) |
| `column-customization` — Column Settings | §1.7b | ✅ `formattingActions.test.ts` (43) | ✅ `ColumnSettingsPanel.test.tsx` (7) | ✅ `v2-column-customization.spec.ts` (18 — all 8 bands + meta / discard / list marker) |
| `calculated-columns` — Virtual columns | §1.8 | — | ✅ `CalculatedColumnsPanel.test.tsx` (8) | ◐ smoke (mount) |
| `column-groups` — Nestable group editor | §1.8b | ✅ `treeOps.test.ts` (11) | ✅ `ColumnGroupsPanel.test.tsx` (8) | ✅ `v2-column-groups.spec.ts` (14 — add/rename/columns/chip-cycle/subgroup/reorder/delete/style/persist/expand) |
| `column-templates` — Reusable bundles | §1.8c | ✅ `snapshotTemplate.test.ts` (20) | — | ❌ |
| `conditional-styling` — Rule editor | §1.7 | — | ✅ `ConditionalStylingPanel.test.tsx` (9) | ✅ `v2-conditional-styling.spec.ts` (13 — empty/add/rename/row-paint/cell-paint/no-cols-warn/disable/priority/delete/flash/indicator/persist/multi-rule) |
| `saved-filters` — Filter pills | §1.8d | ✅ `filtersToolbarLogic.test.ts` (26) | — | ✅ 7 tests in `v2-filters-toolbar.spec.ts` |
| `toolbar-visibility` — Layout memory | §1.8e | — | — | ❌ |
| `grid-state` — Native state capture | §1.10 | — | — | ◐ via `v2-autosave.spec.ts` |
| Formatting Toolbar (host chrome) | §1.12 | ✅ formatter presets in-line | ✅ `FormattingToolbar.test.tsx` (15) | ✅ 10 tests in `v2-formatting-toolbar.spec.ts` |

**Totals:** 10 surfaces · 5 with pure-logic coverage · 6 with panel unit coverage · 5 with meaningful behavioural e2e (formatting toolbar, filters toolbar, column-customization, column-groups, conditional-styling) + 3 smoke (calculated-columns, column-customization duplicate-mount, general-settings).

**Smoke coverage** lives in `e2e/v2-settings-panels.spec.ts` (8 tests) + the shared helper `e2e/helpers/settingsSheet.ts`. Every settings panel has at least a "mounts via dropdown nav" guard plus DOM-level assertions for the visible + hidden nav paths. The helper exports `bootCleanDemo` / `openPanel` / `forceNavigateToPanel` / `closeSettingsSheet` for reuse in future behavioural specs.

### Priority backlog for e2e coverage

Ordered by risk × churn, highest first. Strike-throughs mark completed.

1. ~~**`column-customization`** — largest surface area (8 bands, 4 sub-editors). Highest regression risk after the M3 split.~~ ✅ Done (`v2-column-customization.spec.ts`, 18 tests covering all 8 bands + meta count + discard + list marker).
2. ~~**`column-groups`** — just refactored, currently zero behavioural e2e after the retirement.~~ ✅ Done (`v2-column-groups.spec.ts`, 14 tests: add/rename/save, columns add+remove, show-tri-state cycle, subgroup creation, reorder up/down, delete, header-style band, SAVE-dirty gating, profile persistence, runtime expand/collapse via openGroupIds).
3. ~~**`conditional-styling` (non-smoke)** — rule create / enable-disable / delete cycle against a real blotter column.~~ ✅ Done (`v2-conditional-styling.spec.ts`, 13 tests: empty state, add/rename, row-scope paint + cell-scope paint (via `gc-rule-<id>` on AG-Grid cells/rows), no-cols warning, disable strips injected CSS, priority persistence, delete, flash band scope-gating, indicator band, profile round-trip, multi-rule cards).
4. **`calculated-columns`** — virtual column create / edit expression / delete. Target: expression evaluates against live rowData + survives reload.
5. **`column-templates` indirect flow** — save-from-toolbar → apply-to-another-column → remove-via-settings chip.
6. **`general-settings`** — toggle representative options (animate rows, pivotMode, groupDisplayType) and verify grid behaviour.

Each item follows the `e2e/README.md` write-alongside policy: don't backfill in one pass; add tests as the surfaces get touched. The list above is the priority order when they do.

### Known gaps documented but not blocking

- **Toolbar Visibility wiring** (§1.8e) — module state ships in every profile but concrete toolbar-toggle bindings aren't routed through it yet. Non-blocking; current host chrome uses local React state. Wiring pass is a known follow-up.
- **Column Templates standalone panel** — today templates are authored indirectly (save-from-toolbar, remove-via-Column-Settings-chip). A dedicated Templates panel with rename / description / duplicate affordances would be additive, not required.
