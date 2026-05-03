# Implemented Features

AG-Grid Customization Platform — an AdapTable alternative for the MarketsUI
FI Trading Terminal.

> The legacy v1 surface area is fully retired. Earlier removal pulled
> the v1 packages (`@grid-customizer/markets-grid`-v1, the v1 modules
> inside `@grid-customizer/core`, and the v1 e2e specs); a follow-up
> pass removed the deserializer back-compat shims for v1-shape profile
> snapshots (`migrateFromLegacy`, `LegacyOverride`,
> `LegacyColumnCustomizationState`) and rewrote the in-source comments
> that still referenced "v1 / v2" historical decisions. The branch now
> ships v2 only — no version qualifier is meaningful in this codebase.
> History for v1 is preserved on the backup tag taken prior to the
> original removal.

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

- **Cockpit list rail unified on shadcn / cmdk Command** — the four
  master-detail settings panels (Column Settings, Conditional
  Styling, Column Groups, Calculated Columns) used to hand-roll the
  same `<ul><li><button>` rail. Replaced with a shared
  `<CockpitList>` / `<CockpitListItem>` primitive in
  `packages/core/src/ui/SettingsPanel/CockpitList.tsx` that wraps
  `cmdk` directly (the same primitive shadcn's Command is built on,
  used un-styled so the `gc-popout-list-item` cockpit theme stays
  the single source of truth). Wins:
  - Free keyboard navigation (Up/Down/Enter), `role="listbox"` /
    `role="option"` semantics, and ARIA wiring without per-panel
    bookkeeping.
  - One markup pattern for all four panels — future panels just use
    the same primitive.
  - Selection model split: cmdk's transient `aria-selected`
    (keyboard / hover highlight) is now visually distinct from the
    persistent `data-active="true"` attribute that marks the card
    open in the editor. The cockpit CSS keys the green left-border
    on `data-active` only; `aria-selected` falls back to a softer
    surface tint so keyboard nav stays discoverable.
  - jsdom test environment learned `ResizeObserver` and
    `Element.prototype.scrollIntoView` shims so cmdk mounts cleanly
    under Vitest. All 242 core unit tests still pass; every panel's
    `data-testid` is preserved character-for-character (`cols-item-`,
    `cs-rule-card-`, `cs-rules-list`, `cg-group-`, `cc-virtual-`).

- **Column Settings list-rail perf pass** — `ColumnSettingsList` now
  scales cleanly to grids with hundreds of columns. Three changes
  layered on top of the shared `<CockpitList>` migration; zero
  behavior change, all 7 panel tests still pass:
  1. Override badge — `Object.keys(...).some(...)` recomputed per row
     on every render, replaced with a single `useMemo`-built
     `Set<colId>` keyed on `state.assignments`.
  2. Dirty LED — N `useDirty(key)` subscriptions (one per column) →
     a single `useDirtyColIds()` subscription against the platform
     DirtyBus that yields a `Set<colId>` filtered by the
     `column-customization:` prefix. Stable identity via shallow set
     equality so unrelated bus traffic doesn't re-render the rail.
  3. Inline windowing — when `columns.length > 60`, the rail walks
     up to the first scrolling ancestor (`.gc-popout-list` or the
     legacy `<aside>`) and slices to the visible range +
     8-row overscan (fixed `ROW_HEIGHT = 36`). Padding spacers above
     and below the visible window keep the scrollbar honest. Falls
     through to full render when no scroll parent is found (jsdom
     tests, edge containers).

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

- **Save semantics** — same draft/dirty pattern as every other editor (`useModuleDraft` scoped to `<groupId>`); explicit SAVE pill commits into module state. Module state changes flip the profile-level dirty flag until the user clicks the primary Save button (profile-level auto-save is off as of 2026-04-20).

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

- **Interaction surface** lives in `FiltersToolbar` (documented in §1.x). Pure logic extracted to `filtersToolbarLogic.ts` with 34 unit tests covering `generateLabel`, `doesRowMatchFilterModel`, `filterModelsEqual`, `mergeFilterModels`, and `isNewFilter` (per-pill count predicates, echo detection for `+` button enabling, multi-filter OR merge with `set`-value union, duplicate-vs-inactive-pill guard).

- **+ button uniqueness spans active AND inactive pills** — the `+` button enables only when the live AG-Grid filter model doesn't match any existing pill's model (active OR inactive) AND doesn't match the merged-active echo. Prevents duplicates: if the user toggles a pill off and then re-enters the same filter into the grid, `+` stays disabled because the pill still exists (just muted). Before this fix, the check only compared against the merged-ACTIVE set, so that flow created a duplicate pill. The `isNewFilter(live, pills)` helper in `filtersToolbarLogic.ts` encapsulates the rule; `handleAdd` also runs the same guard defensively.

- **New pill captures the DELTA, not the merged model** — when the user adds a column filter while one or more pills are active, AG-Grid reports the combined model `{ <active pills' criteria> ⊕ <new column> }`. Capturing that as the new pill's `filterModel` would duplicate the active pills' criteria inside the new pill, breaking toggle semantics (toggling an active pill off would still leave its criterion enforced by the new pill). `subtractFilterModel(live, mergedActive)` in `filtersToolbarLogic.ts` returns only the columns the user actually added or changed; `handleAdd` persists that delta. Example: pill A active with `{side: BUY}` → user filters `price > 100` → AG-Grid live = `{side: BUY, price > 100}` → new pill stores only `{price > 100}`.

- **Save path** — every add / toggle / rename / remove writes through `useModuleState(...)` setState; the profile-level dirty flag trips and the primary Save button becomes the commit point. Reload restores every pill (including active/inactive state) before the grid's first `modelUpdated`, provided the user hit Save before reloading.

- **No settings panel** — the toolbar IS the editor. Nav entry intentionally omitted from the settings sheet.

Testids (all in FiltersToolbar): `filters-toolbar`, `filters-add-btn`, `filter-pill-{id}`, `filter-pill-count-{id}`, `filters-caret-left`, `filters-caret-right`, `filters-collapse-toggle`, `filters-summary-chip`. (The `style-toolbar-toggle` now lives in the primary row's action cluster outside FiltersToolbar — see §1.12c.)

- **Pill-row scrollbar is hidden** — once pills overflow the toolbar width, the browser's horizontal scrollbar would otherwise render underneath the pill row, stealing vertical space and looking noisy. Since the left/right chevron carets (`filters-caret-left` / `filters-caret-right`) already auto-reveal on overflow and scroll by 150px per click, the scrollbar is redundant UI. Hidden in `cockpit.ts` via `scrollbar-width: none` (Firefox) + `::-webkit-scrollbar { display: none }` (Chromium/WebKit) + `-ms-overflow-style: none` (legacy). Wheel-scroll + programmatic scroll still work; only the scrollbar chrome disappears.

- **Clear-all + add-new are sticky (always visible)** — clustered in `.gc-filters-actions` AFTER the right scroll caret, outside the scrollable `.gc-filter-scroll` container. When the pill row overflows and the user scrolls through pills, these action buttons never scroll off-screen. Previously they lived inside `.gc-filter-scroll` and scrolled with the pills, leaving the user unable to reach them without scrolling back. The layout order (collapse-toggle → summary-chip-OR-pills → right-caret → clear → add) keeps the carets hugging the carousel they control. **The formatter-toolbar toggle (Brush) has been hoisted out** — it now lives in the primary row's shared action cluster (MarketsGrid), decoupled from filter semantics.

- **Collapse / expand the pill carousel** — the first thing in the filters row is a chevron toggle (`filters-collapse-toggle`). Clicking it swaps the carousel for a compact summary chip `N filters · M active` (`filters-summary-chip`). Either the chevron OR the chip toggles back to the expanded view. State persists via the `toolbar-visibility` module under `filters-toolbar-pills`. Clear + add buttons remain reachable in both states because they live outside the collapsible section.

- **Primary-row redesign (MarketsGrid)** — the row hosting FiltersToolbar, the formatter-toolbar toggle (Brush), ProfileSelector, Save button, and Settings icon was refactored into a single `.gc-primary-row` flex strip. Previously every right-side action carried a full-height `border-left` and hard-coded inline-styled chrome, which read like a row of spreadsheet tabs. The new layout uses:
  - One shared `.gc-primary-action` class (30 × 30 icon button, hover-tint, teal-accented on active, amber on dirty, green on save-flash)
  - `.gc-primary-divider` 1 × 20 px hairlines between logical groups instead of per-button border-lefts
  - A single bottom hairline on `.gc-primary-row` owned by the outer container (inner components render against transparent backgrounds)

  Action order: filters (flex:1) → Brush → divider → ProfileSelector → divider → Save → divider → Settings.

### 1.8e Toolbar Visibility — hidden per-profile toolbar layout

Module `toolbar-visibility` (priority 1000). Tracks which optional toolbars (Filters, Formatting, etc.) the user has shown in the host app so the layout round-trips across profile load / save.

- **State shape**:
  ```ts
  interface ToolbarVisibilityState {
    visible: Record<string, boolean>;   // toolbar id → visible. Missing key = host default.
  }
  ```

- **Never appears in the settings nav** — no `SettingsPanel` field on the module. Consumed via `useModuleState<ToolbarVisibilityState>('toolbar-visibility')` from host chrome.

- **First wired consumer** — `FiltersToolbar` persists its collapse/expand state under the key `filters-toolbar-pills`. `visible[key] === false` collapses the pill carousel into a compact summary chip ("N filters · M active"). Missing key defaults to expanded. Reloading the profile restores the last state so users who prefer the compact view stay there.

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
- **SSF format auto-sanitizer** — `excelFormatter` runs every format
  through a try-and-quote loop before SSF.format: probes positive /
  negative / zero / text values to walk every section, and on
  `unrecognized character X` wraps each top-level occurrence of X in
  quotes (leaving `[Color]` tags and existing quoted literals
  untouched). Lets format strings authored with bare unicode glyphs
  (`▲ ▼ — ± °`) render correctly without hand-quoting — Excel itself
  is forgiving where SSF isn't, so unquoted glyphs survive copy-paste
  from Excel UI / docs / legacy profiles.
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

- **Inline column-caption rename** — when exactly one column is
  selected, the column-label chip in the formatter's context module
  becomes click-to-edit (Pencil hint on hover). Enter / blur commits
  the new caption through `applyHeaderNameReducer`, Escape cancels.
  Empty input clears the override so the host's original `headerName`
  takes back over. Multi-column selections fall back to the read-only
  pill — renaming N columns to one name doesn't make sense.
- **Cells-editable toggle** — small Pencil/Lock pill next to the
  column-label chip. Active = cells in the selected column(s) are
  editable, inactive = explicitly locked (writes `editable: false`,
  overriding any host default). Wired through
  `applyEditableReducer` → `colDef.editable` in
  `column-customization/transforms.ts`. Tooltip is the entire UI —
  no eyebrow label needed.
- **Clear-selected button (formatter toolbar + popout)** — second
  destructive action in the Clear module that resets only the
  currently-targeted column(s) instead of the whole profile. Wired
  to `clearAllStylesReducer(colIds)` so it drops cell + header
  styling, value formatter, borders, filter, and template references
  for the selected columns; saved templates and other columns are
  untouched. Confirms via a scoped AlertDialog that names the
  affected columns ("Clear styles for column \"price\"?" / "Clear
  styles for 3 columns?"). Disabled when no cell/column is selected.
  Renders icon-only (Eraser) in the horizontal in-grid toolbar and
  full label in the popped vertical panel footer, alongside the
  existing profile-wide "Clear all styles" button.
- **Section-eyebrow strip removal in the in-grid toolbar** — the
  `02 · TYPE`, `03 · PAINT`, `04 · FORMAT`, etc. eyebrow chips are
  hidden in horizontal mode (`.fx-shell--horizontal .fx-eyebrow {
  display: none }`). Tooltips on every action already self-document
  the toolbar; the eyebrows competed with the data grid for row
  real estate. The popped vertical panel keeps the eyebrows as
  section headers — the surface area is there.

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

- **Explicit-save profile contract** — as of 2026-04-20, profiles no
  longer auto-persist live state. `ProfileManager` is constructed with
  `disableAutoSave: true`; module state mutations flip an internal
  `isDirty` flag instead of scheduling a write. The primary Save
  button (top-right of the grid's chrome) is the sole write path; it
  calls `captureGridStateInto()` to capture AG-Grid native state then
  `profiles.save()` which clears dirty on success. Rationale: "profile
  = saved document" is a clearer mental model than "profile = live
  mirror"; users lose no edits they didn't intend to persist.
- **Dirty indicator on Save button** — `<DirtyDot/>` (teal pulsed
  badge) appears at the top-right of the Save icon whenever the live
  store diverges from the last persisted snapshot. Clears on successful
  save; covered by `save-all-dirty` testid.
- **Unsaved-changes prompt on profile switch** — switching profiles
  while dirty opens a shadcn `AlertDialog` with three explicit
  actions: `Save & switch`, `Discard changes`, `Cancel`. The prompt
  emits under testid `profile-switch-confirm`; actions under
  `profile-switch-save`, `profile-switch-discard`,
  `profile-switch-cancel`. No edit is ever silently dropped.
- **`beforeunload` warning** — a native `beforeunload` handler is
  registered whenever `isDirty === true` (and only then, so clean
  sessions don't warn on close). Modern browsers show a generic
  "unsaved changes" dialog.
- **New profile starts blank** — `resetAll()` runs before snapshotting
  in `createProfile`; the grid-state module handles `saved: null` by
  calling `api.setState({})` to clear AG-Grid-native state that lives
  outside module transforms. Profile creation itself is an explicit
  write — no debounce needed.
- **Auto-save still available** — `useProfileManager({ disableAutoSave: false })`
  restores the legacy 300ms-debounced contract; tests use this path.
- **Delete safety** — cancels pending auto-save (if any) before
  erasing the record, uses `skipFlush: true` when falling back to
  Default.
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

### 1.18a Pop-out settings sheet (detached OS window)

- **`<PopoutPortal/>`** in `packages/core/src/ui/PopoutPortal.tsx` — a
  generic React component that opens an OS window via `window.open`
  (browser) or `fin.Window.create` (OpenFin, via the
  `openFinWindowOpener()` helper in `packages/core/src/utils/openFin.ts`),
  clones the main document's `<head>` stylesheets into the popout,
  and returns `createPortal(children, popoutBody)`. Because the
  children stay in the MAIN window's React tree, they share the same
  `GridProvider`, Zustand store, `ProfileManager`, and theme — no
  BroadcastChannel or URL-routed re-hydration needed.
- **Button** — `ExternalLink` icon in the settings-sheet header next
  to Help / Maximize / Close. Testid `v2-settings-popout-btn`. Hides
  while popped (the OS window owns its own chrome). Clicking once
  opens a 960×700 window named `gc-popout-<gridId>`; clicking again
  while an open popout exists refocuses the existing window (real
  browsers reuse named windows).
- **Theme sync** — a MutationObserver on the main document's
  `<html data-theme>` mirrors the value onto the popout so
  dark/light toggling in main instantly repaints the popout. Cloned
  stylesheets carry the `--bn-*`, `--ck-*`, `--primary` token
  system.
- **Lifecycle** — closing the popout (OS close button, Cmd-W,
  `beforeunload`) flips the sheet back to inline mode. Closing the
  main window closes the popout too (via `window.addEventListener
  ('beforeunload', () => popout.close())`). Popup-blocker rejection
  falls back to inline mode with a console warning.
- **CSS** — `.gc-popout.is-popped` strips the fixed-overlay
  centering chrome (position/transform/width/height/border/shadow)
  so the sheet fills its new OS window edge-to-edge.
- **Coverage** — 7 unit tests in `PopoutPortal.test.tsx` (rendering
  into the portal doc, stylesheet cloning, beforeunload → onClose,
  cleanup on unmount, popup-blocker fallback, OpenFin override) +
  5 e2e tests in `v2-popout-window.spec.ts` (button presence, window
  features, data-popped flip, backdrop suppression, main-window
  buttons hidden).

### 1.18 `@grid-customizer/design-system` package

New workspace at `packages/design-system` lifted from the FI Trading
Terminal design-system reference. Gives the monorepo a single, typed
home for brand tokens and framework adapters so the demo (and future
Angular / PrimeNG apps) can consume one canonical palette.

- **Primitive tokens** (`tokens/primitives.ts`) — charcoal, teal, red,
  orange, blue, purple scales plus typography / spacing / radius /
  opacity / transition scales.
- **Semantic tokens** (`tokens/semantic.ts`) — `dark` / `light` / `shared`
  maps covering surface, text, border, accent, state, overlay.
- **Component tokens** (`tokens/components.ts`) — button / input / table
  sizing lifted from the semantic layer.
- **Themes** — pre-generated CSS files exposing `--bn-*`, legacy
  `--fi-*` aliases, order-book fill tokens (`--ob-bid-fill`,
  `--ob-ask-fill`) and trade-ticket strip tokens (`--tt-bid-strip`,
  `--tt-ask-strip`). Imported into `apps/demo/src/main.tsx` BEFORE
  `globals.css` so the demo's teal-brand hex block in globals.css still
  takes precedence — only the design-system's additive tokens flow
  through. Migration to the design-system's full HSL-triplet shadcn
  palette is a follow-up pass.
- **Framework adapters** — `agGridDarkParams` / `agGridLightParams`
  (fixed to use v35-valid `headerTextColor`, no `rowBorderColor`),
  `generateShadcnCSS()` with hex→HSL conversion, and
  `generatePrimeNGPreset()` for future Angular consumers.
- **Framework-agnostic cell renderers** (`cell-renderers.ts`) —
  vanilla-TS implementations of SideCellRenderer, StatusBadgeRenderer,
  ColoredValueRenderer, OasValueRenderer, SignedValueRenderer,
  TickerCellRenderer, RatingBadgeRenderer, PnlValueRenderer,
  FilledAmountRenderer, BookNameRenderer, ChangeValueRenderer,
  YtdValueRenderer, RfqStatusRenderer. Available to any grid host
  without pulling React into the renderer path.
- **Typecheck wired** — the new package participates in the monorepo
  `npm run typecheck` flow and the full build (`npm run build`) stays
  green.

### 1.X Expression-formatter security policy (CSP gate)

Runtime switch governing the `kind: 'expression'` branch of
`ValueFormatterTemplate` — the legacy escape hatch compiled via
`new Function(...)` and therefore incompatible with a `script-src` CSP
that forbids `unsafe-eval`.

- **Three modes** — `'allow'` (default, preserves historical behaviour),
  `'warn'` (compiles but fires `onViolation` + emits a one-shot
  `console.warn` per unique expression), `'strict'` (adapter returns an
  identity formatter; profile import rejects payloads containing
  expression-kind templates).
- **Public API** — `configureExpressionPolicy({ mode, onViolation })`
  and `getExpressionPolicy()` exported from `@grid-customizer/core`.
  Set once at application boot, before any `<MarketsGrid>` mounts.
- **Two enforcement points** — (1) runtime compile in
  `valueFormatterFromTemplate` (the identity fallback keeps cells
  rendering a raw value); (2) synchronous scan in
  `ProfileManager.import` that walks the payload before any storage
  write. Strict-mode rejections throw with the offending expression in
  the message so UIs can surface actionable errors.
- **Opt-in sanitizer** — strict-mode imports accept a
  `{ sanitize: true }` flag that rewrites every matching template to a
  safe `{ kind: 'preset', preset: 'number' }` stand-in in place, then
  completes the import. Lets ops migrate legacy profiles without a
  round-trip through an editor.
- **Observer hook** — `onViolation({ kind, expression, reason })` fires
  in all modes so telemetry can watch for legacy-formatter usage even
  under `'allow'`. Observer errors are swallowed so the import / format
  pipeline can't be broken by a buggy listener.
- **Test coverage** — 18 unit tests for the policy module (mode
  merging, cyclic-object walking, one-shot warn dedup,
  sanitize-in-place counting) + 6 integration tests against
  `ProfileManager.import` (strict rejects, strict+sanitize rewrites,
  warn observes, allow no-ops).

---

## 1.N MarketsGrid v2 API — imperative handle, storage factory, admin actions

Consumer-facing API additions on `<MarketsGrid>`. All four props are
**optional** and **additive** — apps on the today's API (`storageAdapter`
only) keep working unchanged. Plan doc:
[`docs/plans/MARKETS_GRID_API.md`](./plans/MARKETS_GRID_API.md).

### What shipped

| Prop | Purpose | Default |
|---|---|---|
| `ref` + `MarketsGridHandle` | Imperative handle exposing `{ gridApi, platform, profiles }` via `forwardRef`. `profiles` is `UseProfileManagerResult` (hook-shaped wrapper — ergonomic delta from the plan's original `ProfileManager` class). | no handle exposed |
| `onReady?` | Same handle delivered via callback; fires exactly once per mount after AG-Grid ready + platform mount + active profile applied. | no-op |
| `instanceId?` | Stable per-instance identity from a framework (OpenFin customData). | falls back to `gridId` |
| `storage?: StorageAdapterFactory` | Factory `(instanceId) => StorageAdapter`. Typically closes over `(appId, userId)` at app bootstrap. Takes precedence over `storageAdapter`. | falls back to `storageAdapter`, then `MemoryAdapter` |
| `adminActions?: AdminAction[]` | Entries rendered in the settings-sheet Tools dropdown (Wrench icon in header). Hidden entirely when array is empty or all-hidden. | no Tools button |

### ConfigService-backed persistence

`@marketsui/config-service` ships `createConfigServiceStorage({ configManager, appId, userId })` — a `StorageAdapterFactory` that persists **one `AppConfigRow` per instance** with all profiles bundled in the payload:

| Field | Value |
|---|---|
| `componentType` | `"markets-grid-profile-set"` |
| `componentSubType` | `""` (unused) |
| `configId` | `<instanceId>` |
| `appId` / `userId` | baked into the factory closure |
| `payload` | `{ profiles: ProfileSnapshot[] }` — the whole bundle |

Each adapter method does load-modify-write against the single row. ProfileManager sees the standard per-profile `StorageAdapter` API; the bundling is internal.

Also exports `migrateProfilesToConfigService({ source, target, gridId, ... })` — consumer-triggered, one-shot migration from `DexieAdapter`/`MemoryAdapter` → ConfigService storage. `skip-if-exists` default, `overwrite` available.

### ConfigBrowser integration

`@marketsui/config-browser` ships `createConfigBrowserAction({ launch })` — returns an `AdminAction` with default id / label / icon / description. Consumer supplies just the launch callback (route, OpenFin window, overlay — whatever fits the app). Apps that don't use ConfigBrowser omit the dep; no forced coupling.

### Demo app

`apps/demo-configservice-react` (port 5191) — forked from `apps/demo-react`, same three views (single / dashboard / depth), but persistence routes through the ConfigService factory. Demonstrates:

- Per-user profile scoping (Alice / Bob switcher in header)
- Cross-grid profile isolation under one `(appId, userId)` scope
- Full-screen ConfigBrowser overlay launched via the Tools menu
- Showcase profile seeded per-user via the same factory MarketsGrid uses (so seed rows are inspectable in the Config Browser)

Run side-by-side with `apps/demo-react` on 5190 for A/B comparison (different IndexedDB databases, no clobbering).

### Layer cleanliness

- `@marketsui/core`'s `StorageAdapter` interface unchanged — 242 existing tests untouched.
- `@marketsui/config-service` declares `@marketsui/core` as an **optional** peerDependency (type-only).
- `@marketsui/config-browser` declares `@marketsui/markets-grid` as an **optional** peerDependency (for the `AdminAction` type the helper returns).
- `<MarketsGrid>` does NOT import anything from `@marketsui/config-browser` or `@marketsui/config-service` — the admin-actions slot is the integration seam. Composition, not coupling.

### Angular mirror

Deferred to ANGULAR_PORT Phase 4 (`docs/plans/ANGULAR_PORT.md`) — the plan's Angular selectors (`mkt-markets-grid` with `[adminActions]` and `(ready)`) ship together with `@marketsui/markets-grid-angular`. React API is the frozen reference shape.

### Tests + verification

298 unit tests unchanged (242 core + 56 markets-grid). `npx turbo typecheck build test` → 55/55 green across 3 new files (`registry-host-env.ts`, `profile-storage.ts`, `helpers.ts`) + 2 modified components (`MarketsGrid.tsx`, `SettingsSheet.tsx`) + 1 new demo app (25 files).

---

## 1.O `@marketsui/data-plane` — Week 1 + 1.5 (protocol + dual cache + dual provider bases)

Per [`docs/plans/DATA_PLANE.md`](./plans/DATA_PLANE.md). Week 1 delivered protocol + cache + provider bases for keyed-resource mode; Week 1.5 adds the row-stream primitives that match stern-1's production architecture (`/Users/develop/Documents/projects/stern-1/client/src/workers/engine/`).

### Why two cache models + two provider bases

Reviewing the existing stern-1 STOMP implementation and the companion `/Users/develop/Documents/projects/stomp-server` surfaced a fundamental distinction the original plan conflated:

| Mode | Cache | Provider | Used by |
|---|---|---|---|
| **Keyed-resource** (Week 1) | `ProviderCache` — per-key LRU + TTL, `singleFlight` dedup | `ProviderBase` with `fetch(key)` / `subscribe(key, emit)` | AppData (kv store), future REST-per-endpoint, per-ticker price |
| **Row-stream** (Week 1.5) | `RowCache` — upsert keyed by `keyColumn`, no TTL, no LRU cap | `StreamProviderBase` with snapshot → snapshot-complete → realtime phases + late-joiner detection | STOMP / WebSocket / SocketIO blotters |

Both coexist in the same package and use the same wire protocol — the client picks opcodes by provider type.

### Package

- `packages/data-plane/` — workspace `@marketsui/data-plane@0.1.0`
- Depends only on `@marketsui/shared-types`.
- Subpath exports: `@marketsui/data-plane` (full barrel), `@marketsui/data-plane/protocol`, `@marketsui/data-plane/providers`.

### What landed

| File | What it is |
|---|---|
| `src/protocol.ts` | `DataPlaneRequest` / `DataPlaneResponse` discriminated unions. Opcodes for both modes: keyed-resource (`get` / `put` / `subscribe` + `update`) AND row-stream (`subscribe-stream` / `get-cached-rows` + `snapshot-batch` / `snapshot-complete` / `row-update`). `ErrorCode`, `isRequest` / `isResponse` type guards. JSON-safe + structured-clone-safe. |
| `src/protocol.test.ts` | 46 tests — round-trip coverage for every message shape under both JSON and native structured clone. |
| `src/worker/cache.ts` | Keyed-resource cache: `ProviderCache` (per-key LRU + TTL), `CacheState`, `isExpired`, `singleFlight` thundering-herd dedup. |
| `src/worker/cache.test.ts` | 20 tests — LRU eviction, TTL boundaries, concurrent `singleFlight` dedup, cross-provider isolation. |
| `src/worker/rowCache.ts` | Row-stream cache: `RowCache<TRow>` — upsert-by-`keyColumn`. Direct port of stern-1's `CacheManager`. Returns `{ accepted, skipped }` so the router can surface diagnostics when `keyColumn` is misconfigured (rows arriving but cache empty). |
| `src/worker/rowCache.test.ts` | 10 tests — upsert identity, row-copy-on-insert, skip-when-key-missing, remove, clear. |
| `src/providers/ProviderBase.ts` | Keyed-resource abstract base with `configure` / `fetch` / `subscribe?` / `teardown` + `track` / `untrack` refcount helpers. |
| `src/providers/MockProvider.ts` | Keyed-resource synthetic provider for demos + tests. |
| `src/providers/AppDataProvider.ts` | Keyed-resource reactive k/v — backbone for template bindings (`{{app1.token1}}`). |
| `src/providers/AppDataProvider.test.ts` | 12 tests — reactivity, unsubscribe-during-fanout safety, teardown. |
| `src/providers/StreamProviderBase.ts` | Row-stream abstract base. Manages `RowCache`, phase state (snapshot / realtime), listener fan-out, `registerSubscriber` / `shouldReceiveCached` late-joiner tracking, error + connect/disconnect statistics. Direct port of stern-1's `StompEngine` patterns, generalized so `StompStreamProvider`, `WebSocketStreamProvider`, `SocketIOStreamProvider` can all subclass it. |
| `src/providers/StreamProviderBase.test.ts` | 13 tests — snapshot phase transitions, snapshot-complete idempotency, upsert-on-realtime-update, late-joiner logic (early vs late port detection), listener safety (throwing + self-removing during fan-out), error + lifecycle reporting, reset for reconnects. |
| `src/index.ts` | Public barrel exporting both modes. |

### Design decisions worth calling out

- **Correction from earlier Week-1 doc:** my original take called `StompDatasourceProvider` "snapshot-only + not streaming." That's true of `packages/widgets-react/src/provider-editor/stomp/StompDatasourceProvider.ts` (which is a field-inference tool — fetches one snapshot, disconnects). The REAL streaming provider lives in stern-1 (`client/src/workers/engine/StompEngine.ts` + `CacheManager.ts` + `BroadcastManager.ts`). It's full snapshot + realtime with late-joiner support. The row-stream primitives added in Week 1.5 are the porting target for that architecture.
- **Phase machine is authoritative.** `StreamProviderBase.markSnapshotComplete()` is idempotent; any late `ingestSnapshotBatch()` after completion transparently routes to the update path. This matches stern-1's defensive behaviour and avoids clients seeing mode regressions.
- **`keyColumn` is REQUIRED for row-stream providers.** Unlike the keyed-resource mode where the caller chooses the key, row-stream rows carry their own identity in a configured field (`positionId`, `tradeId`, etc.). `RowCache` drops rows missing that field and exposes the count via `UpsertResult.skipped` so the protocol's `snapshot-batch.diagnostics.skipped` can surface the misconfiguration at grid bootstrap.
- **Late-joiner semantics ported 1:1 from stern-1.** A port subscribing during the snapshot phase is marked in `liveSnapshotPorts`. After `snapshot-complete`, `shouldReceiveCached(portId)` returns `false` for those ports — they already received the live data, sending cached rows would duplicate. Ports that subscribed after complete are not in the set, so they get the cached replay.
- **Listener iteration is crash + mutation safe.** `StreamProviderBase.dispatch` snapshots the listener set and catches per-listener exceptions so one bad consumer doesn't kill the provider or break iteration for other listeners. Tested with a listener that removes itself mid-dispatch and one that throws.
- **Existing `DataProviderEditor` UI stays put.** It persists through `dataProviderConfigService` → the shared-types `ProviderConfig` union. The data-plane consumes the same union verbatim at `configure()` time.
- **Existing `IBlotterDataProvider` contract kept.** It lives in `@marketsui/widgets-react/interfaces.ts` and drives `useBlotterDataConnection`. Legacy per-widget adapter; `StreamProviderBase` is the new multiplexed contract. Both coexist during migration.

### Tests + verification

- 97 tests in `@marketsui/data-plane`:
  - 46 protocol round-trip (keyed + row-stream opcodes)
  - 20 keyed-resource cache (LRU / TTL / dedup / isolation)
  - 10 row cache (upsert / skip / remove / clear)
  - 12 AppData reactivity
  - 13 StreamProviderBase (phases / late-joiner / listener safety / lifecycle)
- `npx turbo typecheck build test` → 58/58 tasks green across the monorepo.

---

## 1.O.W2 — Week 2 (Router + BroadcastManager + DataPlaneClient + transport ladder)

Week 2 bolts the dispatch + transport surface onto the Week-1/1.5 primitives. Nothing about the primitives changed; the new code is purely additive and tested end-to-end through `connectInPage` so every assertion exercises the real wire format.

### What landed in Week 2

| File | What it is |
|---|---|
| `src/worker/broadcastManager.ts` + 11 tests | Per-provider port registry with targeted + fan-out delivery, dead-port purge on `postMessage` throws, `removePortFromAll` for port-closed cleanup. Direct port of stern-1's `BroadcastManager` generalised to the data-plane's response union. |
| `src/worker/providerFactory.ts` | `ProviderFactory` type + `defaultProviderFactory`. Returns a discriminated `{ shape: 'keyed' \| 'stream', provider }` so the router can branch safely. Wrap to add STOMP / WebSocket / SocketIO without touching router code. |
| `src/worker/router.ts` + 14 tests | The dispatcher. Handles every opcode: `configure / get / put / subscribe / unsubscribe / invalidate / teardown / ping` (keyed-resource) AND `subscribe-stream / get-cached-rows` (row-stream). Owns: in-flight `ProviderCache` per keyed provider, single-flight dedup on `get`, monotonic per-provider `streamSeq` for row updates, port-id generation (`WeakMap<MessagePort, string>`), auto-teardown on idle — but ONLY for stream providers (keyed providers persist in-memory state and must not lose it when the last subscriber leaves). |
| `src/worker/entry.ts` | `installWorker({ router })` — wires `self.onconnect` (SharedWorker) AND `self.onmessage` (dedicated Worker bootstrap) into the router. Periodic dead-port sweep at configurable interval (default 30s / 60s timeout, matching stern-1). |
| `src/worker/index.ts` | Subpath barrel `@marketsui/data-plane/worker` for worker assets. |
| `src/client/DataPlaneClient.ts` + 9 tests | Main-thread SDK. Typed async APIs for every one-shot op (`configure/get/put/invalidate/teardown/ping`) plus `subscribe(k, onUpdate)` / `subscribeStream(listener)` / `getCachedRows()`. `close()` rejects every pending request with `TRANSPORT_CLOSED`. Typed `DataPlaneClientError` (extends `Error`) for every failure so callers can `catch` and branch on `.code` / `.retryable`. |
| `src/client/fallbacks.ts` | `hasSharedWorker` / `hasDedicatedWorker` probes + `TransportMode` type. |
| `src/client/connect.ts` | Three entry points: `connectSharedWorker(url)` (production), `connectDedicatedWorker(url)` (fallback for environments without SharedWorker — Safari old / OpenFin view contexts), `connectInPage(router)` (last resort + test path). Auto-degrading `connect({ url, router? })` picks the best available. |
| `src/client/index.ts` | Subpath barrel `@marketsui/data-plane/client` for main-thread code. |
| `package.json` exports | Added `./client` + `./worker` subpath exports so consumers can tree-shake. |

### Design decisions worth calling out

- **Two transport modes share one code path.** Everything the router does is `handleRequest(port, req)` — totally oblivious to whether the port came from `SharedWorker.port`, a dedicated `Worker` bootstrap message, or a local `MessageChannel`. This is why the `connectInPage` test path produces the same assertions the SharedWorker would: no simulation of wire-format, just a real Channel.
- **Keyed providers do NOT auto-teardown on idle.** AppData is pure memory. Tearing down a keyed provider when its last subscriber leaves would silently wipe state. Stream providers DO auto-teardown — they hold network connections we should release. The distinction is enforced in `maybeTeardownProvider` by checking `slot.instance.shape`.
- **In-flight dedup for `get`.** Three concurrent `client.get(p, k)` calls for the same `(providerId, key)` invoke `provider.fetch` exactly once and all three resolve with the same value. The router uses the `ProviderCache.singleFlight` helper from Week 1.
- **Row-stream late-joiner semantics preserved end-to-end.** When a port subscribes during the snapshot phase, `StreamProviderBase.registerSubscriber` marks it in `liveSnapshotPorts`. Post-complete, a `get-cached-rows` from that port replies with an empty batch + immediate complete (no double-delivery). Late joiners get the full cached set with `diagnostics.keyColumn` / `cacheSize` attached so the grid can surface key-column mismatches at bootstrap.
- **Client-side error routing is explicit.** `onSubscribeError` is optional per subscription; protocol `err` frames with a reqId correlate back to the pending promise, everything else fans out to registered listeners.
- **Dead-port detection is best-effort.** The `entry.ts` heartbeat sweep is the only reliable signal in a SharedWorker (ports don't fire a `close` event). Clients don't need to send explicit heartbeats — every request counts as liveness. 60s timeout (stern-1's value) is the default; consumers can tune via `installWorker({ deadPortTimeoutMs })`.

### Public API surface

```ts
// Main-thread consumer:
import { connect, connectInPage, DataPlaneClient } from '@marketsui/data-plane/client';
import type { AppDataProviderConfig } from '@marketsui/shared-types';

const { client, close } = connect({
  url: new URL('./myDataWorker.ts', import.meta.url),
  name: 'my-app-data-plane',
});

await client.configure('app', { providerType: 'appdata', variables: {} });
await client.put('app', 'token', 'abc');
const token = await client.get<string>('app', 'token');

const unsub = await client.subscribeStream<Position>('bond-blotter', {
  onSnapshotBatch: (b) => grid.applyTransaction({ add: [...b.rows] }),
  onSnapshotComplete: () => grid.hideLoadingOverlay(),
  onRowUpdate: (u) => grid.applyTransaction({ update: [...u.rows] }),
  onError: (err) => console.error(err),
});
```

```ts
// Worker side (Vite asset):
import { installWorker, Router } from '@marketsui/data-plane/worker';

const router = new Router({
  providerFactory: async (id, cfg) => {
    if (cfg.providerType === 'stomp') {
      const { StompStreamProvider } = await import('./providers/StompStreamProvider');
      const p = new StompStreamProvider(id);
      await p.configure(cfg);
      return { shape: 'stream', provider: p };
    }
    const { defaultProviderFactory } = await import('@marketsui/data-plane/worker');
    return defaultProviderFactory(id, cfg);
  },
});
installWorker({ router });
```

### Tests + verification

- 129 tests in `@marketsui/data-plane` (up from 97):
  - 46 protocol round-trip (unchanged)
  - 20 keyed-resource cache (unchanged)
  - 10 row cache (unchanged)
  - 12 AppData reactivity (unchanged)
  - 13 StreamProviderBase (unchanged)
  - **11 BroadcastManager (new)** — add/remove/count, fan-out, dead-port purge, targeted delivery
  - **14 Router (new)** — every opcode, keyed-resource dedup via singleFlight, row-stream snapshot/complete/update sequence, late-joiner via `get-cached-rows`, port-close cleanup distinguishing keyed from stream, ping/pong, BroadcastManager injection
  - **9 DataPlaneClient (new)** — end-to-end round-trip via `connectInPage`, keyed put/get/subscribe/unsubscribe, row-stream snapshot ordering, late-joiner replay, early-joiner empty replay, typed errors on unconfigured provider, `close()` rejecting pending with `TRANSPORT_CLOSED`
- `npx turbo typecheck build` on the package: clean
- Full monorepo sweep `npx turbo typecheck build test`: **58/58 tasks green** (fully cached after first run)

---

## 1.O.W3 — Week 3 (StompStreamProvider — real production STOMP)

Port of stern-1's `StompEngine` onto the Week-1.5 `StreamProviderBase`. Speaks the same wire format as `/Users/develop/Documents/projects/stomp-server/` (the reference broker): subscribe to a listener topic, optionally publish a trigger, consume snapshot batches until a `"Success"`-containing body arrives, then handle every subsequent message as a realtime update.

### What landed

| File | What it is |
|---|---|
| `src/providers/StompStreamProvider.ts` | Full subclass of `StreamProviderBase<StompProviderConfig, StompRow>`. `configure()` validates `keyColumn`/`websocketUrl`/`listenerTopic` and rebuilds the internal `RowCache` keyed by the configured column. `start()` constructs a `@stomp/stompjs` client via an injectable factory, resolves `{clientId}` template vars in both `listenerTopic` + `requestMessage`, publishes the optional trigger on `onConnect`. Message handling: trim body → if `body.toLowerCase().includes(snapshotEndToken.toLowerCase())` → `markSnapshotComplete()`; otherwise JSON-parse and route to snapshot/update ingest based on current phase. Supports four payload shapes: top-level array, `{rows: [...]}`, `{data: [...]}`, single-object. Rejects non-JSON frames silently (reference broker occasionally sends control frames). Missing-keyColumn rows counted in `UpsertResult.skipped`. |
| `src/providers/StompStreamProvider.test.ts` (18 tests) | Full protocol coverage without a live broker — a `FakeClient` implements `StompClientLike` so tests drive the protocol directly. Covers: configure validation (keyColumn / websocketUrl / listenerTopic), start-before-configure throws, onConnect → activate + subscribe + trigger publish, STOMP error propagation, WebSocket error propagation, stop tears down subscription + client + cache, all four payload shapes parse correctly, non-JSON bodies are dropped silently, snapshot-end detection is case-insensitive (`"success"` / `"SUCCESS"` / `"Success"` all match), updates post-complete route through realtime path and upsert the cache, listener ordering (snap → snap → complete → update), `{clientId}` template substitution in topic + trigger destination, stable clientId across stop/start cycles. |
| `src/worker/providerFactory.ts` | Updated: `defaultProviderFactory` now constructs `StompStreamProvider` for `providerType: 'stomp'`. Added `composeFactory(base, ...overrides)` helper for consumers wiring custom providers. Added `buildStompFactory(createClient)` for injecting the STOMP transport (auth middleware / telemetry). |

### Design decisions

- **Transport injection, not a hard dep.** `@stomp/stompjs` is a peerDependency marked `optional` in the package.json, and the module is `require`-imported lazily inside `defaultCreateClient` only when a real STOMP provider is constructed. Consumers who don't use STOMP pay nothing; consumers who do provide `{ createClient }` can substitute auth middleware without patching our module.
- **`StompClientLike` structural interface.** The provider doesn't depend on `@stomp/stompjs`'s concrete types at compile time — just a structural shape. That keeps tests totally offline (no live broker) and makes the provider portable to stomp-over-sockjs or stomp-over-webtransport adapters if those ever land.
- **`{clientId}` stability.** Generated at provider construction and cached in `this.clientId`. A stop/start cycle reuses the same id. This matches the broker's expectation that client identity is stable across reconnects (the broker uses it to index per-client stream state).
- **Late-joiner semantics inherited for free.** Because `StompStreamProvider` just extends `StreamProviderBase`, the live-snapshot / late-joiner dedup logic from Week 1.5 applies verbatim — no STOMP-specific code had to be written for it.

---

## 1.O.W4 — Week 4 (React bindings — new `@marketsui/data-plane-react` package)

New workspace. Framework isolation per the plan: `@marketsui/data-plane` stays framework-agnostic; every React import lives in the companion package.

### Package

- `packages/data-plane-react/` — `@marketsui/data-plane-react@0.1.0`
- peerDep: React `>=19.0.0`
- Depends on `@marketsui/data-plane` + `@marketsui/shared-types`

### What landed

| File | What it is |
|---|---|
| `src/context.tsx` | `<DataPlaneProvider>` + `useDataPlaneClient()`. Provider accepts either a pre-built `DataPlaneClient` (caller owns lifetime) or full `connect()` args (provider owns lifetime, tears down on unmount). Hook throws if called outside the provider. |
| `src/useDataPlaneValue.ts` | `useDataPlaneValue<T>(providerId, key)` — subscribes + fetches initial value. Returns `{ value, isLoading, error }`. Mount: subscribe first (don't miss an update during get), then fetch initial. Unmount / providerId-or-key change: unsubscribe + cancel pending. `fetchInitial: false` option for write-only keys. |
| `src/useDataPlaneAppData.ts` | `useDataPlaneAppData<T>(providerId, key)` — returns `{ value, setValue, isLoading, error }`. `setValue` is a stable `client.put` wrapper. The backbone of `{{app.token}}`-style bindings: one component writes, all subscribed components re-render. |
| `src/useDataPlaneRowStream.ts` | `useDataPlaneRowStream<TRow>(providerId, opts)` — two modes. Default: buffered. Hook maintains an internal Map keyed by the provider's `keyColumn`; `rows` reflects the current cached state after every snapshot batch / update. `opts.onEvent` mode: no buffering — every `snapshot-batch` / `snapshot-complete` / `row-update` is forwarded verbatim to the callback, and `rows` stays empty. The onEvent escape hatch is the primary integration point for AG-Grid's `applyTransaction` on large blotters (bypasses React re-renders). |
| `src/hooks.test.tsx` (5 tests) | RTL + `connectInPage` end-to-end round-trips. Covers: `useDataPlaneAppData` read + subscribe + setValue; `useDataPlaneValue` external-put triggers re-render; `useDataPlaneRowStream` buffered mode accumulates snapshot → flips on complete → upserts on update; `useDataPlaneRowStream` onEvent mode forwards events and keeps `rows` empty; `DataPlaneProvider` throws when hooks run outside. |
| `src/index.ts` | Public barrel. |

### Why buffered + onEvent

Row-stream providers can deliver 10k+ rows per snapshot. Pushing that into `useState([...prev, ...batch])` is O(n²) and re-renders the tree on every batch. The `onEvent` mode lets grid consumers pipe straight into an imperative sink (AG-Grid `applyTransaction`, Recharts dataset ref, etc.) without React re-renders. The buffered mode covers small-scale cases (app-state-ish streams, demo blotters) where the ergonomics win.

### Tests + verification

- **18 tests** on STOMP provider (offline, via FakeClient)
- **5 tests** on React hooks (jsdom + RTL + `connectInPage`)
- **165 tests** total across `@marketsui/data-plane` (up from 129)
- `npx turbo typecheck build test` on both new packages: clean
- Full monorepo sweep `npx turbo typecheck build test`: **61/61 tasks green** (up from 58 — new workspace adds typecheck/build/test)

### Consumer usage example

```tsx
// Near the app root:
import { DataPlaneProvider } from '@marketsui/data-plane-react';

function App() {
  return (
    <DataPlaneProvider connect={{ url: new URL('./dataWorker.ts', import.meta.url), name: 'my-app' }}>
      <Dashboard />
    </DataPlaneProvider>
  );
}

// AppData usage — a text input backed by a template-binding variable:
function TokenInput() {
  const { value, setValue } = useDataPlaneAppData<string>('app', 'token');
  return <input value={value ?? ''} onChange={(e) => void setValue(e.target.value)} />;
}

// Row-stream usage — a blotter fed by STOMP:
function PositionsBlotter() {
  const gridApiRef = useRef<GridApi>();
  useDataPlaneRowStream('bond-blotter', {
    onEvent: {
      onSnapshotBatch: (b) => gridApiRef.current?.applyTransaction({ add: [...b.rows] }),
      onSnapshotComplete: () => gridApiRef.current?.hideOverlay(),
      onRowUpdate: (u) => gridApiRef.current?.applyTransaction({ update: [...u.rows] }),
    },
  });
  return <AgGridReact onGridReady={(p) => { gridApiRef.current = p.api; }} getRowId={getRowId} />;
}
```

### What's NOT here yet

- `providers/RestStreamProvider.ts` / `WebSocketStreamProvider.ts` / `SocketIOStreamProvider.ts` — the STOMP pattern is trivially transposable to each, but each has quirks (REST polling backoff; WebSocket binary vs JSON; SocketIO event names). Defer until a consumer actually needs one.
- `worker/iab-bridge.ts` — cross-app routing (stern-1's AppData + OpenFin IAB pattern). Deferred to the `SHELL_AND_REGISTRY.md` plan rather than pinned to this package.
- Angular signal bindings (`@marketsui/data-plane-angular`) — analogous shape to the React package.
- `apps/demo-react` integration with a running STOMP server — requires `/Users/develop/Documents/projects/stomp-server` booted, so scoping as a local dev/e2e cycle rather than a CI artifact.
- E2E: 4-widgets-one-STOMP-topic assertion that only one outbound WebSocket connects.

---

## 1.O.X — Bracket-token resolver (`[xyz]` → per-attach unique IDs)

Companion to the `{{name.key}}` AppData resolver. Where `{{name.key}}` pulls deterministic values out of AppData, `[identifier]` MINTS a fresh per-attach short ID and reuses it for every occurrence of the same token name across the same provider config — so `[clientTag]` in `listenerTopic` and `[clientTag]` in `requestBody` line up to the same value, while a different token like `[corr]` gets a different value. The two systems coexist (different syntaxes, different timing) and work on the same provider configs.

### Why it exists

STOMP (and likely future REST) configs frequently need a session-unique correlation/client tag that appears in two or more string fields and must match. Today users would either (a) hand-edit both fields with the same magic string, or (b) publish a value to AppData first and use `{{appData.tag}}` in both places. Bracket tokens collapse both workarounds into one ergonomic syntax: `[clientTag]` anywhere → same generated ID everywhere within one provider attach.

### Token grammar

Regex: `/\[([A-Za-z_][A-Za-z0-9_-]*)\]/g`. Must start with a letter or underscore; body may contain letters, digits, underscores, hyphens. Anything that doesn't match (e.g. `[]`, `[1abc]`, `[a b]`, `[a.b]`, JSON `[1,2,3]`) is left in place verbatim — same fail-safe debug affordance as the brace resolver.

### Files

| File | What it is |
|---|---|
| `packages/data-plane/src/v2/template/bracket-resolver.ts` | New module. Exports `BracketCache = Map<string, string>`, `resolveBracketString(input, cache)`, and `resolveBracketCfg<T>(cfg, cache): T` that deep-walks objects/arrays mirroring the existing `resolveCfg` shape. The cache parameter is REQUIRED (no defaulting) so lifetime is explicit at the call site. |
| `packages/data-plane/src/v2/template/bracket-resolver.test.ts` | 10 unit tests: same-token-same-value, different-token-different-value, fresh-cache-fresh-values, grammar-rejection, JSON-array non-collision, identifier-body characters, deep walk through nested arrays/objects, non-string leaves preserved, cross-call cache sharing. |
| `packages/data-plane/src/v2/providers/registry.ts` | `startProvider` now mints a fresh `BracketCache` and runs `resolveBracketCfg(cfg, cache)` immediately before dispatching to the provider-specific factory. One insertion gives every provider type the feature (mock / stomp / rest today). |

### Unique-value generator

12-char alphanumeric IDs from `crypto.getRandomValues` over a 62-char alphabet (`0-9A-Za-z`) → ~71 bits of entropy. No external dep. Works in the SharedWorker, browser main thread, and Node 18+ (where `crypto` is global).

### Cache lifetime

Per `startProvider` call. Same `[name]` resolves identically across all string fields of one config; auto-reconnects within the same attach reuse the cache because the resolved cfg is captured in the factory closure; on stop + re-attach a fresh `BracketCache` mints fresh values. The cache is not persisted, not shared across providers, and not shared across user-registered factories' independent calls.

### Coexistence with `{{name.key}}`

The brace resolver runs upstream in the React hook `useResolvedCfg` (in `data-plane-react`) before the cfg crosses into the worker. By the time `startProvider` runs, only bracket tokens remain. Mixing `{{appData.userId}}` and `[sessionTag]` in the same field works correctly: the brace resolver fills `{{...}}` first, then the bracket resolver fills `[...]`.

### Tests + verification

- **10 new tests** on bracket-resolver (Vitest)
- **18 tests total** across `packages/data-plane/src/v2/template/` (8 brace + 10 bracket)
- **78 tests total** across `@marketsui/data-plane`: green
- `npm run typecheck --workspace=@marketsui/data-plane`: clean
- `npm run build --workspace=@marketsui/data-plane`: clean
- `npx turbo build --filter='...@marketsui/data-plane'`: 24/24 dependents build clean

### Consumer usage example

In a STOMP provider editor:

```
listenerTopic:  /topic/events/[clientTag]
requestMessage: /app/subscribe/[clientTag]
requestBody:    {"client":"[clientTag]","corr":"[corr]"}
```

At attach time, all three `[clientTag]` occurrences become the same 12-char ID (e.g. `aB3kLm9PqRsT`); `[corr]` becomes a different 12-char ID. On disconnect + re-attach, fresh values are minted.

### UX Polish — Help text

Editor-side help text has been added under all STOMP form fields that support the syntax:
- **WebSocket URL** — explains both `{{appData.key}}` and `[name]` syntax
- **Listener Topic** — explains session-unique ID behavior and cross-field sharing
- **Trigger Destination** — explains `[name]` token support
- **Trigger Body** — explains `[name]` tokens for correlation IDs and session-unique values

Help text is consistent across both React (`packages/widgets-react/src/v2/provider-editor/transports/StompFields.tsx`) and Angular (`packages/angular/src/components/data-provider-editor/stomp-form.component.ts`) implementations.

### What's NOT here yet

- Reserved well-known tokens (`[uuid]`, `[timestamp]`, etc.) — out of scope; every token is "stable random" within an attach.
- UI preview of resolved values inside the editor before save — out of scope; resolution is runtime-only.

---

## 1.P DockEditor + Component Registry — ConfigService alignment

DockEditor and Component Registry now save through the same canonical path as MarketsGrid profiles: generic `ConfigManager.saveConfig(AppConfigRow)` with kebab-case `componentType`, a scope-aware `configId`, and an optional `(appId, userId)` scope parameter.

### The change

Before the refactor, both editors wrote to unscoped global rows with inconsistent conventions: `ConfigManager` carried domain-specific shim methods (`saveDockConfig`, `loadDockConfig`, `clearDockConfig`) that hardcoded `configId: "dock-config"`, `appId: ""`, `userId: "system"`, `componentType: "DOCK"` (uppercase). Registry was analogous with `componentType: "REGISTRY"` and `componentSubType: "EDITOR"`. Neither followed the `markets-grid-profile-set` pattern established by `createConfigServiceStorage`.

### What shipped

| File | Change |
|---|---|
| `packages/shared-types/src/configuration.ts` | Added `COMPONENT_TYPES.DOCK_CONFIG = 'dock-config'`, `COMPONENT_TYPES.COMPONENT_REGISTRY = 'component-registry'`, `COMPONENT_TYPES.MARKETS_GRID_PROFILE_SET = 'markets-grid-profile-set'` as the canonical discriminators. |
| `packages/config-service/src/config-manager.ts` | Removed `saveDockConfig()`, `loadDockConfig()`, `clearDockConfig()` shims + the `DOCK_CONFIG_ID` constant. ConfigManager is now purely generic `(configId → AppConfigRow)`; domain knowledge lives in consumer packages. |
| `packages/openfin-platform/src/db.ts` | Rewritten. Exports `saveDockConfig(config, scope?)`, `loadDockConfig(scope?)`, `clearDockConfig(scope?)`, and the matching Registry trio. All build `AppConfigRow` directly and call generic `saveConfig`. Preserves `creationTime` on overwrite. New `ConfigScope` type. `scopedConfigId(base, scope)` composes a `${base}::${appId}::${userId}` primary key when scope differs from the default — legacy default-scope writes keep the bare `configId` for back-compat. Load paths tolerate legacy `componentType: "DOCK"` / `"REGISTRY"` rows so existing Dexie data survives the upgrade. |
| `packages/openfin-platform/src/workspace.ts` | `exportAllConfig()` now reads dock + registry rows via generic `cm.getConfig('dock-config')` / `cm.getConfig('component-registry')` instead of the deleted shims. |
| `packages/openfin-platform/src/index.ts` + `config-only.ts` | Export the new `ConfigScope` type. |
| `packages/dock-editor-react/src/hooks/useDockEditor.ts` | New `UseDockEditorOptions { scope? }` parameter. Hook threads `scope` through load/save/clear. Default behaviour unchanged (no scope → global singleton). |
| `packages/dock-editor-angular/src/dock-editor/dock-editor.service.ts` | Added `setScope(scope)` + private `scope` field; service threads it through load/save/clear. Same back-compat default. |
| `packages/registry-editor-react/src/hooks/useRegistryEditor.ts` | New `UseRegistryEditorOptions { scope? }` parameter; same threading pattern. |
| `packages/registry-editor-angular/src/registry-editor/registry-editor.service.ts` | Same `setScope()` pattern as dock editor. |

### Canonical `AppConfigRow` shape each editor now writes

```ts
// DockEditor:
{
  configId: 'dock-config' | `dock-config::${appId}::${userId}`,
  appId: 'system' | <hostApp>,
  userId: 'system' | <signedInUser>,
  displayText: 'Dock Configuration',
  componentType: 'dock-config',          // kebab-case, matches MarketsGrid style
  componentSubType: '',
  isTemplate: false,
  payload: DockEditorConfig,             // unchanged interior shape
  createdBy, updatedBy, creationTime, updatedTime,
}

// Component Registry:
{
  configId: 'component-registry' | `component-registry::${appId}::${userId}`,
  appId: 'system' | <hostApp>,
  userId: 'system' | <signedInUser>,
  displayText: 'Component Registry',
  componentType: 'component-registry',
  componentSubType: '',
  isTemplate: false,
  payload: RegistryEditorConfig,
  createdBy, updatedBy, creationTime, updatedTime,
}
```

### Back-compat story

- Existing rows with `componentType: "DOCK"` / `"REGISTRY"` at `configId: "dock-config"` / `"component-registry"` still load (the fallback branch in the new `loadDockConfig` / `loadRegistryConfig`).
- On the next save with default scope, they're overwritten with the canonical `dock-config` / `component-registry` componentType.
- The `exportAllConfig()` path in `workspace.ts` continues to see them either way.
- Non-default scope creates new `${base}::${appId}::${userId}` rows; legacy default-scope rows remain untouched until re-saved under the default scope.

### Per-user / per-app scoping

Host apps that want per-user registries or dock layouts opt in by passing scope:

```tsx
// React
const { save, ...rest } = useDockEditor({ scope: { appId, userId } });
const { save: saveReg, ...registryRest } = useRegistryEditor({ scope: { appId, userId } });

// Angular (DockEditorService / RegistryEditorService)
dockService.setScope({ appId, userId });
await dockService.init(); // (for RegistryEditorService — Dock service loads in constructor)
```

Without a scope argument, both services keep the historical global-singleton behaviour so existing call-sites are unaffected.

### Architecture win

`ConfigManager` is now a purely generic (configId → AppConfigRow) store — no domain-specific shims. Every editor that wants to persist config follows the same pattern as `createConfigServiceStorage`:

1. Build an `AppConfigRow` with your canonical componentType (kebab-case, exported from `shared-types`).
2. Compose a scope-aware `configId` if multiple instances per user/app are needed.
3. Call `manager.saveConfig(row)`.
4. Preserve `creationTime` by reading the existing row first.

Config Browser sees Dock + Registry rows in the same table as MarketsGrid's `markets-grid-profile-set` rows, with `appId` + `userId` filters working identically.

### Verification

- `npx turbo typecheck build test` → **61/61 tasks green**
- No changes to payload shapes — `DockEditorConfig` + `RegistryEditorConfig` are identical on the wire, so existing Dexie data + REST payloads continue to deserialize.
- All hook consumer call-sites are source-compatible (new `scope` parameter is optional).

---

## 1.Q DockEditor ↔ Component Registry integration

A dock menu item can now launch a component selected from the Component Registry. At edit time, the menu-item form shows a dropdown of every registered entry. At runtime, clicking the dock item resolves the entry from the live registry and launches it as an OpenFin View (default) or Window (opt-in).

### Why the design avoids a "registered component" flag

The dock editor reads a single, well-known ConfigService row (`componentType: 'component-registry'`) via `loadRegistryConfig()` and iterates its `payload.entries[]` directly. **Every entry in that array is, by definition, a registered component.** No additional "is-launchable" flag is needed; being in the registry's entries IS the signal. The `componentType` / `componentSubType` on each entry describe the registered thing (e.g. `'grid'` + `'stomp'`), not whether it's launchable.

### What landed

| File | Change |
|---|---|
| `packages/openfin-platform/src/iab-topics.ts` | New `ACTION_LAUNCH_COMPONENT = 'launch-component'` constant alongside the existing dock action IDs. |
| `packages/openfin-platform/src/launch.ts` | New `launchRegisteredComponent(entryId, { asWindow? })` helper. Loads the live registry, finds the entry by id, builds `customData` identical to `registry-editor/testComponent()`, and calls `platform.createView` (default) or `fin.Window.create` (when `asWindow`). Missing ids log a warning and no-op — never throw. |
| `packages/openfin-platform/src/workspace.ts` | Registers `[ACTION_LAUNCH_COMPONENT]` in both `customActions` (CustomButton / CustomDropdownItem callers) and `dockActionHandlers` (Dock3 launchEntry path). Each delegates to `launchRegisteredComponent`. |
| `packages/openfin-platform/src/dock.ts` + `index.ts` + `config-only.ts` | Re-export `ACTION_LAUNCH_COMPONENT` + `launchRegisteredComponent` + `LaunchRegisteredComponentOptions` so consumers can import from the main barrel or the `/config` subpath. |
| `packages/dock-editor-react/src/hooks/useDockEditor.ts` | Loads the registry on mount via `loadRegistryConfig(scope)`, subscribes to `IAB_REGISTRY_CONFIG_UPDATE` so edits in another window propagate live, exposes `registryEntries: RegistryEntry[]` on the hook return. |
| `packages/dock-editor-react/src/components/dock-editor/ItemFormDialog.tsx` | New `customData?: unknown` field on `ItemFormData`. New `registryEntries?: RegistryEntry[]` prop. When `actionId === ACTION_LAUNCH_COMPONENT`, renders a sorted `<select>` of entries (with `componentType / componentSubType` hint) and a "Launch in new window" checkbox. Quick-set "🧩 Launch a registered component…" button flips the action so users don't need to type the action id. |
| `packages/dock-editor-react/src/DockEditor.tsx` | Threads `registryEntries` to all three `<ItemFormDialog>` instances (add-toolbar, add-child, edit). All three save handlers preserve `customData` on ActionButton + menu-item paths. Edit seed reads existing `customData` so the dropdown pre-selects the saved registry id. |
| `packages/dock-editor-angular/src/dock-editor/dock-editor.service.ts` | Adds `_registryEntries: signal<RegistryEntry[]>` + public `registryEntries()` computed. `loadRegistryAndSubscribe()` runs in the constructor and binds an IAB unsubscribe to `ngOnDestroy`. |
| `packages/dock-editor-angular/src/dock-editor/item-form/item-form.component.ts` | `ItemFormData` extended with `customData?: unknown`. New `@Input() registryEntries: RegistryEntry[]`. Two `signal()`s back the launch-component fields. Template adds the registry `<select>`, the "Launch in new window" toggle, and the quick-set button. `onSave()` blocks when launch-component is selected without a registry pick. |
| `packages/dock-editor-angular/src/dock-editor/dock-editor.component.ts` | Passes `[registryEntries]="service.registryEntries()"` to `<mkt-item-form>`. `onEditItem` seeder reads existing `customData`; `onDialogSaved` writes it back through `addButton` / `updateButton` / `addMenuItem` / `updateMenuItem`. |

### Runtime flow

1. User opens the dock editor, picks a button or menu item, clicks the quick-set button.
2. Form switches to the `launch-component` action; a sorted dropdown of registry entries appears.
3. User picks an entry, optionally checks "Launch in new window", saves.
4. Dock config persists with `actionId: 'launch-component'` + `customData: { registryEntryId, asWindow? }` — schema-compatible with `AppConfigRow` (the dock saves through the canonical `dock-config` componentType from §1.P).
5. At runtime, OpenFin invokes the `customActions['launch-component']` handler in `workspace.ts`, which calls `launchRegisteredComponent`. That helper reads `loadRegistryConfig()`, finds the entry by id, and creates the View / Window with `customData = { instanceId, templateId, componentType, componentSubType, appId, configServiceUrl }` — the same shape `registry-editor/testComponent()` uses.

### Graceful failure

- Registry entry deleted between dock save + click → console warning, no crash.
- `customData.registryEntryId` missing or malformed → console warning, no crash.
- Registry not yet loaded → `loadRegistryConfig` returns `null`, helper logs the missing id and returns `undefined`.

### Verification

- `npx turbo typecheck build test` → **61/61 tasks green** (no regressions outside this feature).
- The `dock-config` AppConfigRow shape is unchanged; only optional `customData` payloads grow new structured fields. Existing dock configs without launch-component menu items load identically.
- Live propagation: editing a registry entry's `displayName` in the registry-editor window → IAB publishes → dock editor's open dropdown re-renders. No reload required.

### Deferred

- **"Add all from registry" bulk-import button** in the dock editor — cheap follow-up that creates one ActionButton per registry entry in a single click.
- **Visible warning badge** in the rendered dock when a referenced entry is missing — currently we log + no-op; a disabled/badged item would be a nicer UX. Out of scope for v1.

---

## 1.R Workspace Setup — unified editor redesign + persistence fix

The "Workspace Setup (new)" 3-pane editor (`packages/dock-editor-react/src/WorkspaceSetup.tsx`) was functionally working but had four user-reported issues. All four are now closed; the older standalone Dock Editor + Component Registry windows remain available unchanged.

### Persistence — components stop disappearing

Root cause: the child window opened with no scope context from the parent provider, so `db.ts`'s module-level `currentPlatformScope` defaulted to legacy `(system, system)`. Saves wrote to that scope while the provider's boot-time migrations (`migrateLegacyPlatformScope`, `realignAllConfigsToPlatformScope`, `migrateRegistryToGlobalScope`) relocated rows to the real `(appId, userId)` scope, and the next reload found nothing.

- All six dock/registry/workspace-setup launchers in `workspace.ts` now forward `customData: { appId, userId }` (matching the existing Config Browser pattern).
- `HostEnv` carries `userId` through `readHostEnv()`. Optional in the type so demo apps that build a manual `HostEnv` for `encodeHostEnvForQueryString` keep compiling.
- WorkspaceSetup reads `customData` at mount, calls `setPlatformDefaultScope`, and passes the scope explicitly into both `useRegistryEditor({ scope })` and `useDockEditor({ scope })` so the load + save effects target the right row even before the module-level default propagates.

### Discard no longer wipes IndexedDB

The previous Discard button called `registry.reset()` / `dock.reset()`, both of which invoked `clear*Config(scope)` and silently wiped the entire row. A user pressing Discard expecting "revert my unsaved edits" got their catalogue erased.

- Added `reload()` (non-destructive — re-reads from storage) to both `useRegistryEditor` and `useDockEditor`.
- Discard now wires through `reload()`. The destructive `reset()` is preserved for admin "Clear all" flows but no longer reachable from a Discard control.

### Cascade prune on registry deletion

Deleting a registry entry left orphaned dock items pointing at the dead `customData.registryEntryId`. The Inspector showed an orange "Component {uuid} was deleted" warning but the dock itself still rendered the broken button.

- `WorkspaceSetup.handleDelete` now walks the dock tree (top-level ActionButtons + nested DropdownButton menu items, recursively through sub-menus) and dispatches `REMOVE_BUTTON` / `REMOVE_MENU_ITEM` for every item that references the deleted entry. The orphan warning still exists for legacy stale rows but no longer accumulates from new deletions.

### Layout — fits its container, themed scrollbars

- Outer shell: `h-full w-full overflow-hidden` + three rows (`<header>` / `<main>` / `<footer>`). The previous `h-screen w-screen` ignored window resizing.
- Save / Discard moved from the header into a dedicated footer so primary actions stay anchored at the bottom regardless of which pane is scrolled. Header keeps the title, summary counts, and the unsaved-changes badge.
- Each pane's inner content is the only scrolling region; outer container has `overflow-hidden` so the shell never shows a scrollbar of its own.
- New `.bn-scrollbar` utility in `editor-styles.ts` resolves track + thumb colours through `--bn-bg2` / `--bn-border` / `--bn-t3`, so dark and light themes both render correctly without per-theme overrides. Pure CSS — `::-webkit-scrollbar` for Chromium and `scrollbar-color` for Firefox / recent WebKit.

### Icon picker (per-component default + per-placement override)

Replaced the placeholder "(per-item label/icon overrides land in a follow-up commit)" text in `DockItemInspector` with real fields backed by the shared `IconPicker`.

- `IconField` (Popover-hosted searchable grid) lives above the Name field in `ComponentForm` (writes `entry.iconId`) and beside the Label field in `DockItemInspector` (writes the dock button's `iconId`, treated as a per-placement override). Component default is shown as a hint underneath the override field.
- Fixed the existing `IconPicker` contract: was emitting display name (`"Bond"`) while the storage layer expects iconId (`"mkt:bond"`). The component had no live callers, so the signature change is a clean break.
- Added 33 curated trading-action icons under the user's `/svg` folder into `packages/icons-svg/svg/` and the corresponding entries in `ICON_PATHS` / `ICON_META` / `MARKET_ICON_SVGS` (`all-icons.ts`). These ship with hardcoded hex palettes (e.g. `#1ed8a0` / `#ff4d7d`) so they keep their stylized colour identity in both themes — `svgToDataUrl()`'s currentColor replacement is a no-op for them. Names that overlapped with existing icons-svg entries (alert, blotter, bond, candlestick, compliance, heatmap, line-chart, order-book, pnl, refresh, risk, settings, watchlist) were not imported; the existing currentColor variants stay because they theme correctly.

### Dropdown authoring — registered components reachable inside dropdown menus

Schema already supported nested dropdowns (`DockDropdownButtonConfig.options: DockMenuItemConfig[]`) and the older standalone Dock Editor authored them; the new editor was missing the affordances.

- `DockPane` now has a header **+ New menu** button that creates an empty `DropdownButton`.
- Each `DropdownButton` row carries a **+ Add** Popover listing every registered component with search; selecting one fires `ADD_MENU_ITEM` with the right `parentItemId`. Sub-menus are rendered recursively.
- Each row gets an **X** button that fires `REMOVE_MENU_ITEM` (top-level) or `REMOVE_BUTTON` (root).
- `InspectorPane` now resolves a selected dock-item id to either a top-level button or a nested menu item via a discriminated-union `resolveDockEntity`. Edit fields route to `onEditButton` (UPDATE_BUTTON) or `onEditMenuItem` (UPDATE_MENU_ITEM with the right `parentItemId` chain). Without that split, clicking a nested item silently mutated the parent dropdown.

### Files

| Path | Role |
|---|---|
| `packages/dock-editor-react/src/WorkspaceSetup.tsx` | Outer shell — scope init, header / body / footer, dock CRUD bridges |
| `packages/dock-editor-react/src/components/workspace-setup/DockPane.tsx` | Tree renderer + +New menu + +Add Popover + remove |
| `packages/dock-editor-react/src/components/workspace-setup/InspectorPane.tsx` | Component form + dock-item form (button OR menu item) with icon picker |
| `packages/dock-editor-react/src/components/dock-editor/editor-styles.ts` | `.bn-scrollbar` utility + token aliases |
| `packages/dock-editor-react/src/components/IconPicker.tsx` | Shared grid (now emits iconId, not display name) |
| `packages/dock-editor-react/src/hooks/useDockEditor.ts` | + non-destructive `reload()` |
| `packages/registry-editor-react/src/hooks/useRegistryEditor.ts` | + non-destructive `reload()` |
| `packages/openfin-platform/src/registry-host-env.ts` | `HostEnv.userId` (optional) + readHostEnv populates from `customData.userId` |
| `packages/openfin-platform/src/workspace.ts` | Six launchers forward `customData: { appId, userId }` |
| `packages/icons-svg/index.ts`, `all-icons.ts`, `svg/` | + 33 curated trading-action icons |

### Tests

Baseline preserved: 242 (`@marketsui/core`) + 56 (`@marketsui/markets-grid`) + 42 (`@marketsui/openfin-platform`) + 147 (`@marketsui/data-plane`) = 487 tests passing. No regressions; full `npx turbo typecheck test --force` is green across all 50 tasks.

---

## 1.S DataProvider integration — v2 redesign

Replaces the v1 data plane (~14k LOC of trial-and-error: dual configure/subscribe ops, late-joiner replay protocol, per-view gates, dual-mode REST/local persistence shim, mirrored STOMP+REST editor tabs) with a clean rewrite landed on a side branch and merged in one cutover commit. Old IndexedDB rows are wiped — users re-create providers in the new editor.

### Architecture

```
[main thread]                                    [SharedWorker]
                                                 ┌─────────────────────────┐
ConfigManager  ───────────read/write─────┐       │  Hub                    │
   (Dexie / REST, dual-mode)             │       │   providers: Map<id, H> │
                                         │       │   listeners: Map<id,Set>│
DataProvider editor (popout) ──save / list ┘     │   caches:    Map<id,Map>│
   STOMP / REST / Mock / AppData                 │   stats:     Map<id,S>  │
                                                 │                         │
DataPlane (client) ◄────MessagePort──────────────┤  startStomp / startRest │
   .attach(id, cfg, listener, opts?)             │  startMock — free fns   │
   .attachStats(id, listener)                    │     return {stop, restart}
   .detach(subId)                                │  Stats sampler: 1Hz     │
   .stop(id)  ← explicit teardown only           │  No auto-teardown       │
                                                 └─────────────────────────┘
MarketsGridContainer (toolbar hidden until Shift+Ctrl+P)
   liveProviderId / historicalProviderId / mode='live'|'historical'
   asOfDate → AppDataStore.set('positions','asOfDate',date)
   {{positions.asOfDate}} → resolveCfg → re-attach → Hub.restart(extra)
```

### Wire protocol (3 + 3)

```ts
// Client → Worker
type Req =
  | { kind: 'attach'; subId; providerId; cfg?; mode: 'data' | 'stats'; extra? }
  | { kind: 'detach'; subId }
  | { kind: 'stop';   providerId };

// Worker → Client
type Evt =
  | { subId; kind: 'delta';  rows; replace? }
  | { subId; kind: 'status'; status: 'loading' | 'ready' | 'error'; error? }
  | { subId; kind: 'stats';  stats: ProviderStats };
```

`attach` is configure-or-attach (no race window), the first emit on every attach is a guaranteed `delta { replace: true, rows: [...cache] }` plus the current status — late-joiner replay is built into attach instead of being a separate protocol step. `restart` is implicit: a second `attach` with the same `providerId` plus `extra` triggers `provider.restart(extra)` on the running provider.

### Key invariants

- **No auto-teardown.** Providers run until explicit `stop()` or worker death. Refresh + restart go through `attach({ extra: { __refresh: ts } })`.
- **Hub owns the cache.** Providers emit `{rows, replace?}` / `{status}` / `{byteSize}` via a single `emit` callback — no provider-side state.
- **Templates resolve on the main thread, before attach.** `{{appdata.key}}` substitution against an in-memory snapshot fed by the v2 `AppDataStore` (which wraps `ConfigManager`). When AppData mutates, `useResolvedCfg` swaps the cfg identity, the hook re-attaches, the Hub restarts the provider.
- **Two-provider MarketsGrid.** Required `liveProviderId` + optional `historicalProviderId`. Only one is active at a time; the toolbar (revealed via `Shift+Ctrl+P`) exposes a Calendar-popover date picker when historical is selected, and writes the picked value into AppData via `historicalDateAppDataRef`.
- **Editor as popout.** `openProviderEditorPopout({providerId?})` opens `/dataproviders` in a fixed-named window (OpenFin `fin.Window.create` or `window.open` fallback). Re-launches focus the existing window and navigate to the new id.

### Packages

| Path | Role |
|---|---|
| `packages/data-plane/src/v2/protocol.ts` | Wire types + `ProviderStats` + type guards |
| `packages/data-plane/src/v2/worker/Hub.ts` | Cache + listener fan-out + 1Hz stats sampler (no auto-teardown) |
| `packages/data-plane/src/v2/worker/entry.ts` | `installWorker` — boots the Hub on a SharedWorker / dedicated worker |
| `packages/data-plane/src/v2/providers/{stomp,rest,mock}.ts` | `start*(cfg, emit) → ProviderHandle` free functions |
| `packages/data-plane/src/v2/providers/registry.ts` | `startProvider(cfg, emit)` lookup table; `registerProvider` for app-side overrides |
| `packages/data-plane/src/v2/providers/inferFields.ts` | Completeness-weighted sampling (returns `FieldNode[]`) |
| `packages/data-plane/src/v2/template/resolver.ts` | `resolveTemplate` + `resolveCfg` (deep walk) |
| `packages/data-plane/src/v2/config/store.ts` | `DataProviderConfigStore` + `AppDataConfigStore` over `ConfigManager` |
| `packages/data-plane/src/v2/config/AppDataStore.ts` | Reactive in-memory snapshot + change subscription |
| `packages/data-plane/src/v2/client/DataPlane.ts` | Main-thread client (3-method surface + in-page wiring helper for tests) |
| `packages/data-plane-react/src/v2/index.tsx` | `<DataPlaneProvider>` + 7 hooks (`useDataPlane`, `useAppDataStore`, `useDataProviderConfig`, `useDataProvidersList`, `useResolvedCfg`, `useProviderStream`, `useProviderStats`) |
| `packages/widgets-react/src/v2/markets-grid-container/MarketsGridContainer.tsx` | Two-provider container, hidden toolbar (`useChordHotkey`), refresh, mode toggle |
| `packages/widgets-react/src/v2/markets-grid-container/{ProviderToolbar,DatePicker}.tsx` | Toolbar (selectors + mode + date) and shadcn Calendar+Popover date picker |
| `packages/widgets-react/src/v2/provider-editor/DataProviderEditor.tsx` | Outer list + form shell — popout-ready, viewport-fit (no outer scrollbars) |
| `packages/widgets-react/src/v2/provider-editor/EditorForm.tsx` | 4-tab form (Connection · Fields · Columns · Behaviour) + Diagnostics when editing existing |
| `packages/widgets-react/src/v2/provider-editor/tabs/{Connection,Fields,Columns,Diagnostics}Tab.tsx` | Tab bodies — Diagnostics surfaces live stats + Restart + Stop. FieldsTab flattens the inferred field tree and slices to the scroll viewport (inline windowing, no new dep) past 100 rows so wide STOMP payloads with thousands of nested fields stay nimble — same pattern as `ColumnSettingsPanel`. |
| `packages/widgets-react/src/v2/provider-editor/transports/{Stomp,Rest,Mock,AppData,Behaviour}Fields.tsx` | Per-transport Connection / Behaviour inputs (all shadcn primitives) |
| `packages/widgets-react/src/v2/data-provider-selector/DataProviderSelector.tsx` | Picker (dropdown / list); reads `useDataProvidersList`, no React Query |
| `packages/design-system/src/themes/scrollbars.css` | `.scrollbar-themed` + `.scrollbar-thin` reading the theme-flipping `--scrollbar-thumb` token |
| `apps/markets-ui-react-reference/src/data-providers-popout.ts` | `openProviderEditorPopout({providerId?})` — OpenFin + browser fallback |
| `apps/markets-ui-react-reference/src/dataPlaneWorker.ts` | SharedWorker entry — calls `installWorker()` |
| `apps/markets-ui-react-reference/src/data-plane-client.ts` | Constructs `new SharedWorker(new URL(...))` + the v2 `DataPlane` client |

### What got deleted

`packages/data-plane/src/{client/*, worker/{router,cache,bufferedDispatch,broadcastManager,providerFactory,rowCache,entry,index}.ts, protocol.ts}`, `packages/data-plane-react/src/{context.tsx, useDataPlane*.ts, hooks.test.tsx}`, `packages/widgets-react/src/{markets-grid-container, provider-editor, data-provider-selector}/*` (all v1), `apps/markets-ui-react-reference/src/data-providers-local.ts`. Three v1 modules survive at `packages/data-plane/src/{services, providers/{ProviderBase, StreamProviderBase, StompDataProvider, rowCache}}.ts` — only because `@marketsui/angular` still imports them; they retire on Angular's v2 cutover.

### Subpath surface

```ts
// Main-thread types + helpers
import { resolveCfg, AppDataStore, type ProviderStats } from '@marketsui/data-plane/v2';
// SharedWorker entry
import { installWorker } from '@marketsui/data-plane/v2/worker';
// Client
import { DataPlane } from '@marketsui/data-plane/v2/client';

// React bindings
import {
  DataPlaneProvider, useProviderStream, useResolvedCfg, useDataProvidersList,
} from '@marketsui/data-plane-react/v2';

// Widgets
import { MarketsGridContainer } from '@marketsui/widgets-react/v2/markets-grid-container';
import { DataProviderEditor }   from '@marketsui/widgets-react/v2/provider-editor';
import { DataProviderSelector } from '@marketsui/widgets-react/v2/data-provider-selector';
```

### Tests

| Package | Tests | Notes |
|---|---|---|
| `@marketsui/data-plane` | **59** v2 tests (Hub, STOMP, REST, Mock, inferFields, template resolver, AppDataStore, DataPlane client) + the surviving v1 `dataProviderConfigService.test.ts` (7) | Down from v1's ~175 tests because the v1 worker / client / providers are gone, not because of regression |
| `@marketsui/data-plane-react` | **3** (jsdom + in-page wiring) | v1 hooks deleted |

`npx turbo typecheck` covers all 45 packages with no regressions.

### Net code change

~12.7k LOC removed, ~3.7k LOC added across the v2 series. The new data plane is a single edit per feature.

---

## 1.T HostWrapper — runtime-port-driven hosting seam (Seam #2)

Apps render hosted components without those components knowing whether they live in OpenFin or a plain browser. Both the React and Angular flavors now ship.

### React (`@marketsui/host-wrapper-react`)

`<HostWrapper runtime={runtime} configManager={configManager}>` provides a `HostContext` that hosted components consume via `useHost()`. Reads identity, current theme, configManager, and lifecycle events (`onWindowShown`, `onWindowClosing`, `onCustomDataChanged`, `onWorkspaceSave`) without importing `@openfin/core`. Wired into `apps/demo-react`, `apps/demo-configservice-react`, and `apps/markets-ui-react-reference` (with an `Outlet` layout pattern that excludes the `/platform/provider` route).

### Angular (`@marketsui/host-wrapper-angular`)

`provideHostWrapper({ runtime, configManager })` registers three `InjectionToken`s (`HOST_RUNTIME`, `HOST_CONFIG_MANAGER`, `HOST_CONFIG_URL`). Hosted Angular components inject `HostService`, the DI mirror of `useHost()`:

- Identity getters (`instanceId`, `appId`, `userId`, `componentType`, `roles`, `permissions`, `customData`).
- Theme as **both** `themeSignal: Signal<Theme>` and `theme$: Observable<Theme>` so consumers pick whichever fits their template flavor.
- `windowShown$`, `windowClosing$`, `customData$`, `workspaceSave$` Observables bridged from the underlying `RuntimePort`.
- `dispose()` tears down listener subscriptions and completes every Subject. Wired automatically through `DestroyRef` so the singleton cleans itself up when the root injector tears down.

Built via `ng-packagr` (FESM2022 + `.d.ts`). Wired into `apps/markets-ui-angular-reference`: `app.config.ts` exports `buildAppConfig(): Promise<ApplicationConfig>` (async because `OpenFinRuntime.create()` is async), selects `OpenFinRuntime` when `isOpenFin()` else `BrowserRuntime`, and spreads `provideHostWrapper(...)` into the providers list. `main.ts` awaits `buildAppConfig()` before `bootstrapApplication`.

### Workspace-save event

The new `RuntimePort.onWorkspaceSave(fn)` method completes the lifecycle surface for both flavors. `OpenFinRuntime` bridges `fin.Platform.getCurrentSync().on('workspace-saved', …)`; `BrowserRuntime` is a no-op (no workspace concept in the browser). React's `HostContext` exposes it as `onWorkspaceSave`; Angular's `HostService` exposes it as `workspaceSave$`. Hosted components use this as a flush-to-disk hook.

### 1.O.VTR View-tab "Save Tab As…" rename + window-title binding

Two small platform additions that make OpenFin browser windows and view tabs honour user-facing names instead of internal-generated identifiers.

**Window title bound to active page.** `BrowserWorkspacePlatformWindowOptions.title` is set to `{ type: 'page-title' }` in both shell init paths so the OS taskbar entry tracks the current page name (no more `internal-generated-window-…`). Wired in [packages/openfin-platform/src/workspace.ts](../packages/openfin-platform/src/workspace.ts) and [packages/openfin-platform-stern/src/bootstrap.ts](../packages/openfin-platform-stern/src/bootstrap.ts).

**View-tab rename via right-click → "Save Tab As…".** Adds a custom item to the top of the view-tab context menu in both shells, mirroring the platform's "Save Page As" UX. Selecting it opens a small frameless popout window (a route in the reference app) prompting for a new tab name. On confirm the action does two things in the target view: (1) runs `document.title = "..."` via `executeJavaScript` so the workspace tabstrip mirrors the rename immediately (default `titlePriority: 'document'`), and (2) writes the new title to `customData.savedTitle` via `view.updateOptions(...)` so the rename rides through the workspace snapshot. `View.updateOptions({ title })` is intentionally NOT used: `title` lives on the create-time `ViewOptions` shape, not on `MutableViewOptions`, and is silently dropped at runtime.

**Persistence on workspace restore.** On the next workspace load, `OpenFinRuntime` reads `customData.savedTitle` from the resolved view options during construction and reapplies it to `document.title`. A `MutationObserver` on the `<title>` element pins the title back to `savedTitle` for a 3 s post-boot window, defeating the page's mount-time `document.title = ...` `useEffect` (used by `HostedComponent.tsx`, `DataProviders.tsx`, etc.) which would otherwise clobber the restored title. The observer disconnects after the window so live rename, notification badges, and other dynamic title updates work freely. The customData poll re-applies `savedTitle` on actual changes (guarded by `lastAppliedSavedTitle` so unrelated customData mutations like `activeProfileId` don't clobber dynamic titles).

| File | Change |
|---|---|
| `packages/openfin-platform/src/internal/viewTabRename.ts` | New. Exports `ACTION_RENAME_VIEW_TAB`, `RENAME_VIEW_TAB_WINDOW_NAME`, `injectRenameMenuItem(payload)` (template helper that's a no-op when `selectedViews.length !== 1`), and `createRenameViewTabAction(openChildWindow)` (CustomActionsMap factory guarded on `CustomActionCallerType.ViewTabContextMenu`). |
| `packages/openfin-platform/src/internal/customActions.ts` | Spreads `createRenameViewTabAction(openChildWindow)` into the returned `CustomActionsMap`. |
| `packages/openfin-platform/src/workspace-persistence.ts` | `MarketsUIWorkspaceProvider.openViewTabContextMenu` injects the rename item before delegating to `super`. |
| `packages/openfin-platform/src/index.ts` | Re-exports the four rename helpers from the main barrel. |
| `packages/openfin-platform-stern/src/internal/viewTabRename.ts` | New. Self-contained Stern copy — Stern is a parallel shell that intentionally doesn't depend on `@marketsui/openfin-platform`. |
| `packages/openfin-platform-stern/src/dock/openfinDock.ts` | `dockGetCustomActions()` spreads `createRenameViewTabAction(openSternChildWindow)`; new local helper `openSternChildWindow` wraps `fin.Window.create` with the platform's `buildUrl()`. |
| `packages/openfin-platform-stern/src/bootstrap.ts` | `SternPlatformProvider.openViewTabContextMenu` injects the rename item. `defaultWindowOptions.workspacePlatform.title` set to `{ type: 'page-title' }`. |
| `apps/markets-ui-react-reference/src/views/RenameViewTab.tsx` | Frameless popout that reads `view` + `currentTitle` from `fin.me.getOptions().customData`, renders a card matching the "Save Page As" layout (header icon + title row + single shadcn `Input` + Cancel/Save row), auto-focuses + selects on mount, Enter submits / Esc cancels. On confirm, runs `document.title = "..."` in the target view via `executeJavaScript` for the immediate tabstrip update, then calls `view.updateOptions({ customData: { ..., savedTitle } })` so the rename round-trips through the workspace snapshot. Theme-sensitive via the ambient `<ThemeProvider>`. |
| `packages/runtime-openfin/src/OpenFinRuntime.ts` | `applySavedViewTitle()` — reads `customData.savedTitle` during construction and reapplies it to `document.title`. The hook closes the persistence loop: without it, the rename would be lost on every workspace reload because `document.title` is a runtime-only DOM mutation that the snapshot never captures. |
| `apps/markets-ui-react-reference/src/main.tsx` | New `/rename-view-tab` route (lazy). |

Verified green: `npx turbo typecheck --filter=@marketsui/openfin-platform --filter=@marketsui/openfin-platform-stern --filter=@marketsui/markets-ui-react-reference` (22 tasks); `npx turbo test --filter=@marketsui/openfin-platform` (49 tests).

### 1.P Universal `<HostedFeatureView>` wrapper for OpenFin route views

Consolidates boilerplate across all feature route views (MarketsGrid, Charts, TradeTickets, Analytics Playground, etc.) into a single reusable component.

**Problem:** Every route view (BlottersMarketsGrid, DataProviders, etc.) was repeating the same pattern — wrapping with `HostedComponent` to resolve OpenFin identity + ConfigManager, then wrapping with `DataPlaneProvider`, then handling loading states and layout. This introduced duplication and a misleading naming convention (e.g., "BlottersMarketsGrid" reads like a grid-specific view, but most of it is generic infrastructure).

**Solution:** New `<HostedFeatureView>` component at `apps/markets-ui-react-reference/src/components/HostedFeatureView.tsx` that:
- Accepts a feature component as a **child** (either ReactNode or render-prop callback for context access)
- Wraps internally with `HostedComponent` (identity + storage factory). Identity (path, instanceId, appId, userId) is surfaced by the grid itself via the new toolbar ⓘ info popover — see `MarketsGrid` `componentName` prop.
- Mounts `DataPlaneProvider` automatically
- Handles loading states while ConfigManager resolves
- Exposes full `HostedContext` to children via render-prop so views can access `instanceId`, `storage`, `configManager`, `userId`, `appId`

**Result:** Route views become lean. Example refactoring of `BlottersMarketsGrid`:
- **Before:** 177 LOC (HostedComponent + DataPlaneProvider + BlotterShell + LoadingState sub-component)
- **After:** 120 LOC (HostedFeatureView wrapper + BlotterGrid sub-component), with identical functionality
- The component name is now honest — `BlottersMarketsGrid` is just the MarketsGrid feature mounted inside the generic wrapper

**Architecture:**
- `HostedFeatureView` lives at the app level since `HostedComponent` is app-specific (it knows about routes, theme context, data-providers popout, etc.)
- Scales to all feature views: Charts, TradeTickets, Analytics, Playground, etc. — any new view gets the boilerplate for free
- Maintains render-prop flexibility so views that need advanced context (storage, custom identity handling) can still access it
- No changes to the underlying `HostedComponent` or `HostedComponent` behavior — just a clean abstraction over the existing pattern

**Status:**
- New component created
- `BlottersMarketsGrid` refactored and tested
- All tests pass (build, typecheck, full suite: 298+ tests green)
- Design reusable for all future feature views in the same app

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
| Profile save contract | Explicit Save button only — dirty flag + beforeunload + switch-prompt guards |
| v2 E2E Test Suites | 10+ |
| v2 Approximate LOC | ~9,000 (core-v2 ~7,200 + markets-grid-v2 ~1,800) |

### Architecture invariants held across the v2 work

- Single source of truth: IndexedDB profile snapshots (`gc-customizer-v2` db).
- Per-module `schemaVersion` with optional `migrate(raw, fromVersion)`.
- Save path: Save-button click → `captureGridStateInto` → `serializeAll` → persist → `profile:saved` event. Auto-save (300ms debounce) is still implemented but opt-in — `MarketsGrid` ships with `disableAutoSave: true`. Internal `isDirty` flag drives the Save-button dirty-dot + profile-switch AlertDialog + `beforeunload` warning.
- `grid-state` module is the one deliberate exception — captures on explicit Save only so AG-Grid native state isn't touched on every keystroke.
- Module ordering (priority): `general-settings (0)` → `column-templates (1)` → `column-customization (10)` → `calculated-columns (15)` → `column-groups (18)` → `conditional-styling (20)` → `grid-state (200)`.
- Every cross-module read goes through `ctx.getModuleState<T>(moduleId)` — no direct imports between modules.

---

## 3. Editor coverage matrix — unit + e2e status

**As of 2026-04-19, every user-facing editor in the grid customizer has
meaningful behavioural e2e coverage.** The §3 backlog closed across
five sessions: column-customization → column-groups → conditional-
styling → calculated-columns → column-templates → general-settings.
Remaining non-UI surfaces (`toolbar-visibility` has no UI; `grid-state`
is auto-capture runtime state exercised indirectly by the autosave
spec).

**Legend:** ✅ solid · ◐ partial (smoke only / pure logic only) · ❌ none

| Module / Editor | Feature catalog (§) | Pure-logic unit tests | Panel unit tests | E2E |
|---|---|---|---|---|
| `general-settings` — Grid Options | §1.11 | — | ✅ `GridOptionsPanel.test.tsx` (10) | ✅ `v2-general-settings.spec.ts` (9 — row-height/animate/selection/quick-filter/pagination/discard/persist) |
| `column-customization` — Column Settings | §1.7b | ✅ `formattingActions.test.ts` (43) | ✅ `ColumnSettingsPanel.test.tsx` (7) | ✅ `v2-column-customization.spec.ts` (18 — all 8 bands + meta / discard / list marker) |
| `calculated-columns` — Virtual columns | §1.8 | — | ✅ `CalculatedColumnsPanel.test.tsx` (8) | ✅ `v2-calculated-columns.spec.ts` (11 — seed/add/rename/colId/delete/formatter/persist; grid-render flow deferred) |
| `column-groups` — Nestable group editor | §1.8b | ✅ `treeOps.test.ts` (11) | ✅ `ColumnGroupsPanel.test.tsx` (8) | ✅ `v2-column-groups.spec.ts` (14 — add/rename/columns/chip-cycle/subgroup/reorder/delete/style/persist/expand) |
| `column-templates` — Reusable bundles | §1.8c | ✅ `snapshotTemplate.test.ts` (20) | — | ✅ `v2-column-templates.spec.ts` (9 — save-from-toolbar / apply / replace vs stack / remove chip / picker / persist) |
| `conditional-styling` — Rule editor | §1.7 | — | ✅ `ConditionalStylingPanel.test.tsx` (9) | ✅ `v2-conditional-styling.spec.ts` (13 — empty/add/rename/row-paint/cell-paint/no-cols-warn/disable/priority/delete/flash/indicator/persist/multi-rule) |
| `saved-filters` — Filter pills | §1.8d | ✅ `filtersToolbarLogic.test.ts` (26) | — | ✅ 7 tests in `v2-filters-toolbar.spec.ts` |
| `toolbar-visibility` — Layout memory | §1.8e | — | — | ❌ |
| `grid-state` — Native state capture | §1.10 | — | — | ◐ via `v2-autosave.spec.ts` |
| Formatting Toolbar (host chrome) | §1.12 | ✅ formatter presets in-line | ✅ `FormattingToolbar.test.tsx` (15) | ✅ 10 tests in `v2-formatting-toolbar.spec.ts` |
| Inline column-caption rename + cell-editable toggle | §1.12 | — | (covered indirectly via `applyHeaderNameReducer` / `applyEditableReducer` in `formattingActions`) | — |

**Totals:** 10 surfaces · 5 with pure-logic coverage · 6 with panel unit coverage · **8 with meaningful behavioural e2e** (formatting toolbar, filters toolbar, column-customization, column-groups, conditional-styling, calculated-columns, column-templates, general-settings) + 2 non-UI surfaces (toolbar-visibility no-op, grid-state indirectly via autosave spec).

**Smoke coverage** lives in `e2e/v2-settings-panels.spec.ts` (8 tests) + the shared helper `e2e/helpers/settingsSheet.ts`. Every settings panel has at least a "mounts via dropdown nav" guard plus DOM-level assertions for the visible + hidden nav paths. The helper exports `bootCleanDemo` / `openPanel` / `forceNavigateToPanel` / `closeSettingsSheet` for reuse in future behavioural specs.

### Priority backlog for e2e coverage

Ordered by risk × churn, highest first. Strike-throughs mark completed.

1. ~~**`column-customization`** — largest surface area (8 bands, 4 sub-editors). Highest regression risk after the M3 split.~~ ✅ Done (`v2-column-customization.spec.ts`, 18 tests covering all 8 bands + meta count + discard + list marker).
2. ~~**`column-groups`** — just refactored, currently zero behavioural e2e after the retirement.~~ ✅ Done (`v2-column-groups.spec.ts`, 14 tests: add/rename/save, columns add+remove, show-tri-state cycle, subgroup creation, reorder up/down, delete, header-style band, SAVE-dirty gating, profile persistence, runtime expand/collapse via openGroupIds).
3. ~~**`conditional-styling` (non-smoke)** — rule create / enable-disable / delete cycle against a real blotter column.~~ ✅ Done (`v2-conditional-styling.spec.ts`, 13 tests: empty state, add/rename, row-scope paint + cell-scope paint (via `gc-rule-<id>` on AG-Grid cells/rows), no-cols warning, disable strips injected CSS, priority persistence, delete, flash band scope-gating, indicator band, profile round-trip, multi-rule cards).
4. ~~**`calculated-columns`** — virtual column create / edit expression / delete.~~ ✅ Done (`v2-calculated-columns.spec.ts`, 11 tests). **Known deferral:** virtual columns appear correctly in AG-Grid's filter tool panel but not in the main grid header in this demo's config. Tracked as a separate bug to investigate (spawned as a follow-up task); 4 previously-drafted grid-render tests will come back once resolved.
5. ~~**`column-templates` indirect flow** — save-from-toolbar → apply-to-another-column → remove-via-settings chip.~~ ✅ Done (`v2-column-templates.spec.ts`, 9 tests covering the three authoring surfaces: save-from-toolbar, apply-from-toolbar, Column-Settings picker + chip remove, plus a behaviour-telling test that documents toolbar apply = REPLACE semantics while picker = APPEND).
6. ~~**`general-settings`** — toggle representative options.~~ ✅ Done (`v2-general-settings.spec.ts`, 9 tests: panel mount / SAVE gating / row-height reflects in `.ag-row` inline height / animate-rows toggle + OVERRIDES counter / row-selection Select round-trip / quick-filter narrows grid to zero rows on no-match / pagination toggle reveals `.ag-paging-panel` / discard reverts / persist across reload).

Each item follows the `e2e/README.md` write-alongside policy: don't backfill in one pass; add tests as the surfaces get touched. The list above is the priority order when they do.

### 1.13 Per-view active-profile override (OpenFin)

Lets traders duplicate a MarketsGrid view in OpenFin and view a *different*
profile of the same grid instance in each duplicate, surviving workspace
save/restore.

- **`ActiveIdSource`** — pluggable pointer source on `ProfileManager`
  (`packages/core/src/profiles/ProfileManager.ts`). Read at `boot()`
  before localStorage; written through on every active-id commit
  (`boot`/`load`/`create`/`clone`/`import`/`remove-active`). Errors
  swallowed — best-effort, never blocks the manager. Exported from
  `@marketsui/core`.
- **OpenFin source** — `createOpenFinViewProfileSource()` in
  `packages/markets-grid/src/openfinViewProfile.ts`. Reads/writes
  `activeProfileId` on `fin.me.getOptions().customData`. Returns `null`
  when `fin` is unavailable, so non-OpenFin hosts (browser, Electron,
  tests) keep their existing localStorage behaviour.
- **Workspace round-trip** — `Platform.getSnapshot()` reads from the
  same view options that `updateOptions({ customData })` mutates, so
  the per-view active id is captured into the workspace JSON
  automatically. `packages/openfin-platform/src/workspace-persistence.ts`
  needed no changes.
- **Read priority** — OpenFin override → localStorage → reserved
  Default. Each layer falls through if its candidate row no longer
  exists on disk.
- **Duplicate semantics** — duplicates inherit the source view's
  `customData` (OpenFin's behaviour), then diverge as each user makes
  a switch. Exactly the desired UX.
- Worklog entry: `docs/FEATURE_WORKLOG.md` — Feature 1.

### 1.14 HostedMarketsGrid (consolidated hosting wrapper)

Single component that collapses the previous six-deep
`BlottersMarketsGrid → HostedFeatureView → HostedComponent →
BlotterGrid → MarketsGridContainer → MarketsGrid` stack into one call
site. Lives at
[`packages/widgets-react/src/hosted/HostedMarketsGrid.tsx`](../packages/widgets-react/src/hosted/HostedMarketsGrid.tsx);
the module's own README is the source of truth for the prop contract:
[`packages/widgets-react/src/hosted/README.md`](../packages/widgets-react/src/hosted/README.md).

**Added:**

- `<HostedMarketsGrid>` exported from `@marketsui/widgets-react/hosted`
  and the package root. Owns identity resolution (OpenFin +
  browser-fallback), ConfigService-backed storage with auto-injected
  registered-component metadata, the AG-Grid blotter theme, the
  DataPlane mount, the full-bleed layout, the ConfigManager loading
  guard, the document title, and a one-shot legacy view-state
  cleanup. Flat props per refactor decision D7 — no `gridProps`
  escape hatch.
- Public types `HostedContext`, `RegisteredComponentMetadata`,
  `ConfigManager`, and `StorageAdapterFactory` re-exported from
  `@marketsui/widgets-react/hosted` so external consumers have a
  documented integration contract.
- Public hooks `useHostedIdentity` and `useAgGridTheme` exported from
  the same module for consumers that want to compose their own hosted
  wrapper.
- Reference app's `BlottersMarketsGrid.tsx` collapsed from 163 LOC to
  a single `<HostedMarketsGrid>` call (38 LOC).
- 27 Vitest specs in `packages/widgets-react/src/hosted/__tests__/`
  covering every parity-matrix row at the wrapper boundary; 5
  Playwright specs in
  [`e2e/hosted-markets-grid.spec.ts`](../e2e/hosted-markets-grid.spec.ts)
  covering grid mount, profile lifecycle, Alt+Shift+P provider picker,
  toolbar info popover, and theme flip.

**Removed:**

- `apps/markets-ui-react-reference/src/components/HostedComponent.tsx`
- `apps/markets-ui-react-reference/src/components/HostedFeatureView.tsx`
- `packages/widgets-react/src/blotter/SimpleBlotter.tsx`
- `packages/widgets-react/src/blotter/BlotterGrid.tsx` (the
  package-level component — the empty `blotter/` directory was deleted
  with it)
- `SimpleBlotter` / `BlotterGrid` exports from
  `packages/widgets-react/src/index.ts`

Net change: 727 LOC removed across the four deleted files, replaced by
~225 LOC of wrapper + hooks. Updating
`agGridBlotter{Light,Dark}Params` in
`packages/design-system/src/adapters/ag-grid.ts` re-themes every
hosted blotter at once.

Worklog entry:
[`docs/HOSTED_MARKETS_GRID_REFACTOR_WORKLOG.md`](./HOSTED_MARKETS_GRID_REFACTOR_WORKLOG.md).

### 1.15 Hosted-view hooks (`useHostedView` + sub-hooks)

Hook-based public API exposing OpenFin runtime events to any feature
hosted inside the OpenFin shell. All live under
[`packages/widgets-react/src/hosted/`](../packages/widgets-react/src/hosted/)
and degrade safely outside OpenFin (subscriptions noop, state defaults).

**New hooks:**

- `useIab()` — `{ subscribe, publish }` over `fin.InterApplicationBus`,
  with auto-cleanup of every subscription on unmount.
- `useOpenFinChannel()` — `{ createProvider, connect }` Channel-API
  factory with provider/client teardown on unmount.
- `useTabsHidden()` — boolean tracking the parent OpenFin window's
  tab-strip visibility via the shared `options-changed` listener.
- `useWorkspaceSaveEvent(cb)` — connects to the platform-side Channel
  provider and registers an awaited flush handler so the workspace
  snapshot includes the latest in-memory state.
- `useColorLinking()` — `{ color, linked }` from the parent window's
  workspace-platform color/link state.
- `useFdc3Channel()` — `{ current, join, leave, addContextListener,
  broadcast }` thin wrapper over `window.fdc3` user channels.
- `useHostedView(args)` — composing entry point that calls every
  sub-hook above plus the existing `useHostedIdentity` and
  `useAgGridTheme`. Single result bag with stable identity-keyed
  callbacks.

**Platform-side fan-out:**
[`packages/openfin-platform/src/workspace-persistence.ts`](../packages/openfin-platform/src/workspace-persistence.ts)
creates a singleton Channel provider named
`marketsui-workspace-save-channel` and dispatches `'workspace-saving'`
to every connected client *before* `augmentSnapshotWithLiveCustomData`,
awaiting `Promise.allSettled` so async flushes complete before the
snapshot is captured. A fire-and-forget `'workspace-saved'` publish
follows successful `cm.saveConfig`.

**HostedMarketsGrid integration:**

- Now consumes `useHostedView` and forwards `onWorkspaceSave` to
  `MarketsGridHandle.profiles.saveActiveProfile()` — the same code path
  the toolbar Save button calls.
- New optional `caption?: string` prop. When the OpenFin shell hides
  the view-tab strip (`tabsHidden === true`), a top-left styled span is
  rendered via `MarketsGrid`'s new `caption` + `tabsHidden` props
  (design-system tokens, no new primitive). Caption falls back to
  `componentName` when omitted.
- Existing call sites untouched — every new prop is additive.

Worklog entry:
[`docs/HOSTED_VIEW_HOOKS_WORKLOG.md`](./HOSTED_VIEW_HOOKS_WORKLOG.md).

### Known gaps documented but not blocking

- **Toolbar Visibility wiring** (§1.8e) — module state ships in every profile but concrete toolbar-toggle bindings aren't routed through it yet. Non-blocking; current host chrome uses local React state. Wiring pass is a known follow-up.
- **Column Templates standalone panel** — today templates are authored indirectly (save-from-toolbar, remove-via-Column-Settings-chip). A dedicated Templates panel with rename / description / duplicate affordances would be additive, not required.
