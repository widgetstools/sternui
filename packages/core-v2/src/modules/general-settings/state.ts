/**
 * Grid Options state — the single source of truth for AG-Grid configuration
 * the user can tweak from the Grid Options panel.
 *
 * Mirrors the curated "Top 40" set from
 * `ag-grid-customizer-input-controls.md`, organised by tier so the panel
 * can lay them out 1:1 without ad-hoc regrouping. `schemaVersion` bumped
 * to 2 — older snapshots get every new field filled from
 * `INITIAL_GENERAL_SETTINGS` by the module's `migrate()`.
 */
export interface GeneralSettingsState {
  // ─── Tier 1 — Essential ──────────────────────────────────────────────────
  rowHeight: number;
  headerHeight: number;
  pagination: boolean;
  paginationPageSize: number;
  paginationAutoPageSize: boolean;
  suppressPaginationPanel: boolean;
  /** AG-Grid v35 prefers the object form; we keep `undefined | 'singleRow' | 'multiRow'`
   *  on disk and materialise the object at transform time. */
  rowSelection: 'singleRow' | 'multiRow' | undefined;
  checkboxSelection: boolean;
  /** Enterprise · boolean shortcut for the AG-Grid cell-range selection. */
  cellSelection: boolean;
  rowDragging: boolean;
  animateRows: boolean;
  cellFlashDuration: number;
  cellFadeDuration: number;
  quickFilterText: string;

  // ─── Tier 2 — Grouping, Pivoting, Aggregation ────────────────────────────
  groupDisplayType: 'singleColumn' | 'multipleColumns' | 'groupRows' | 'custom' | undefined;
  /** `0` = none · `-1` = expand all · positive integer = level count. */
  groupDefaultExpanded: number;
  rowGroupPanelShow: 'always' | 'onlyWhenGrouping' | 'never';
  pivotMode: boolean;
  pivotPanelShow: 'always' | 'onlyWhenPivoting' | 'never';
  grandTotalRow: 'top' | 'bottom' | 'pinnedTop' | 'pinnedBottom' | undefined;
  groupTotalRow: 'top' | 'bottom' | undefined;
  groupHideOpenParents: boolean;
  suppressAggFuncInHeader: boolean;

  // ─── Row grouping — extended options (per AG-Grid v35 reference) ─────────
  /** Show the open group in the group column for non-group rows. */
  showOpenedGroup: boolean;
  /** Hide group columns for levels that have not yet been expanded (CSRM only).
   *  Only meaningful with `groupDisplayType='multipleColumns'` or
   *  `groupHideOpenParents=true`. */
  groupHideColumnsUntilExpanded: boolean;
  /** Display the child row in place of the group row when the group has a
   *  single child. `'leafGroupsOnly'` restricts the behaviour to leaf groups. */
  groupHideParentOfSingleChild: boolean | 'leafGroupsOnly';
  /** Don't create a "(Blanks)" group for nodes missing a grouping value —
   *  display them alongside regular group nodes instead. */
  groupAllowUnbalanced: boolean;
  /** Preserve the current group order when sorting on non-group columns. */
  groupMaintainOrder: boolean;
  /** Prevent group rows from sticking to the top of the viewport (Initial). */
  suppressGroupRowsSticky: boolean;
  /** Suppress sort indicators + actions on the row-group-panel chips. */
  rowGroupPanelSuppressSort: boolean;
  /** Lock the first N group columns. `-1` locks all group columns. */
  groupLockGroupColumns: number;
  /** Prevent column visibility changes when grouped columns are changed.
   *  Enum form lets you suppress only the hide-on-group OR show-on-ungroup
   *  half of the default behaviour. */
  suppressGroupChangesColumnVisibility: boolean | 'suppressHideOnGroup' | 'suppressShowOnUngroup';
  /** SSRM only — expandAll / collapseAll apply to all rows (not just loaded
   *  ones), and group interactions override the `isServerSideGroupOpenByDefault`
   *  default. Must also supply `getRowId` when enabled. */
  ssrmExpandAllAffectsAllRows: boolean;
  /** Re-evaluate the grouping hierarchy after editing a grouped column value —
   *  moves the row to the correct group immediately. */
  refreshAfterGroupEdit: boolean;

  // ─── Tier 3 — Filtering, Sorting, Clipboard ──────────────────────────────
  enableAdvancedFilter: boolean;
  includeHiddenColumnsInQuickFilter: boolean;
  /**
   * Compound multi-sort mode — spec calls for three underlying flags, but
   * the panel presents them as a single radio group. Mapping:
   *   - `'replace'`  → suppressMultiSort=true,  alwaysMultiSort=false, multiSortKey=undefined
   *   - `'shift'`    → suppressMultiSort=false, alwaysMultiSort=false, multiSortKey=undefined  (default)
   *   - `'ctrl'`     → suppressMultiSort=false, alwaysMultiSort=false, multiSortKey='ctrl'
   *   - `'always'`   → suppressMultiSort=false, alwaysMultiSort=true,  multiSortKey=undefined
   */
  multiSortMode: 'replace' | 'shift' | 'ctrl' | 'always';
  accentedSort: boolean;
  copyHeadersToClipboard: boolean;
  clipboardDelimiter: string;

  // ─── Tier 4 — Editing & Interaction ──────────────────────────────────────
  singleClickEdit: boolean;
  stopEditingWhenCellsLoseFocus: boolean;
  /** Combined radio group — maps to two AG-Grid flags at transform time.
   *   - `'default'` → both false
   *   - `'always'`  → enterNavigatesVertically=true, enterNavigatesVerticallyAfterEdit=false
   *   - `'afterEdit'` → enterNavigatesVertically=false, enterNavigatesVerticallyAfterEdit=true
   *   - `'both'`    → both true */
  enterNavigation: 'default' | 'always' | 'afterEdit' | 'both';
  undoRedoCellEditing: boolean;
  undoRedoCellEditingLimit: number;
  tooltipShowDelay: number;
  tooltipShowMode: 'standard' | 'whenTruncated';

  // ─── Tier 5 — Styling ────────────────────────────────────────────────────
  suppressRowHoverHighlight: boolean;
  columnHoverHighlight: boolean;

  // ─── Default ColDef ──────────────────────────────────────────────────────
  // (pre-existing; keeps behaviour consistent with v1 snapshots)
  defaultResizable: boolean;
  defaultSortable: boolean;
  defaultFilterable: boolean;
  defaultEditable: boolean;
  defaultMinWidth: number;
  defaultMaxWidth: number | undefined;
  wrapHeaderText: boolean;
  suppressMovable: boolean;
  enableCellTextSelection: boolean;
  suppressDragLeaveHidesColumns: boolean;
  suppressColumnMoveAnimation: boolean;

  // ─── Performance overrides (advanced / collapsed) ────────────────────────
  /** Live-editable. */
  rowBuffer: number;
  /** Live-editable. */
  suppressScrollOnNewData: boolean;
  /** Initial-only in AG-Grid — takes effect on next grid mount. */
  suppressColumnVirtualisation: boolean;
  /** Initial-only. */
  suppressRowVirtualisation: boolean;
  /** Initial-only. */
  suppressMaxRenderedRowRestriction: boolean;
  /** Initial-only. */
  suppressAnimationFrame: boolean;
  /** Initial-only. */
  debounceVerticalScrollbar: boolean;
}

export const INITIAL_GENERAL_SETTINGS: GeneralSettingsState = {
  // Tier 1
  rowHeight: 36,
  headerHeight: 32,
  pagination: false,
  paginationPageSize: 100,
  paginationAutoPageSize: false,
  suppressPaginationPanel: false,
  rowSelection: undefined,
  checkboxSelection: false,
  cellSelection: true,
  rowDragging: false,
  animateRows: true,
  cellFlashDuration: 500,
  cellFadeDuration: 1000,
  quickFilterText: '',

  // Tier 2
  groupDisplayType: undefined,
  groupDefaultExpanded: 0,
  rowGroupPanelShow: 'never',
  pivotMode: false,
  pivotPanelShow: 'never',
  grandTotalRow: undefined,
  groupTotalRow: undefined,
  groupHideOpenParents: false,
  suppressAggFuncInHeader: false,
  // Row grouping — extended options
  showOpenedGroup: false,
  groupHideColumnsUntilExpanded: false,
  groupHideParentOfSingleChild: false,
  groupAllowUnbalanced: false,
  groupMaintainOrder: false,
  suppressGroupRowsSticky: false,
  rowGroupPanelSuppressSort: false,
  groupLockGroupColumns: 0,
  suppressGroupChangesColumnVisibility: false,
  ssrmExpandAllAffectsAllRows: false,
  refreshAfterGroupEdit: false,

  // Tier 3
  enableAdvancedFilter: false,
  includeHiddenColumnsInQuickFilter: false,
  multiSortMode: 'shift',
  accentedSort: false,
  copyHeadersToClipboard: false,
  clipboardDelimiter: '\t',

  // Tier 4
  singleClickEdit: false,
  stopEditingWhenCellsLoseFocus: false,
  enterNavigation: 'default',
  undoRedoCellEditing: false,
  undoRedoCellEditingLimit: 10,
  tooltipShowDelay: 2000,
  tooltipShowMode: 'standard',

  // Tier 5
  suppressRowHoverHighlight: false,
  columnHoverHighlight: false,

  // Default ColDef
  defaultResizable: true,
  defaultSortable: true,
  defaultFilterable: true,
  defaultEditable: false,
  defaultMinWidth: 80,
  defaultMaxWidth: undefined,
  wrapHeaderText: false,
  suppressMovable: false,
  enableCellTextSelection: false,
  suppressDragLeaveHidesColumns: true,
  suppressColumnMoveAnimation: false,

  // Performance
  rowBuffer: 10,
  suppressScrollOnNewData: false,
  suppressColumnVirtualisation: false,
  suppressRowVirtualisation: false,
  suppressMaxRenderedRowRestriction: false,
  suppressAnimationFrame: false,
  debounceVerticalScrollbar: false,
};
