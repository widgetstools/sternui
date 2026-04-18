import type { GridOptions } from 'ag-grid-community';
import type { Module } from '../../core/types';
import { INITIAL_GENERAL_SETTINGS, type GeneralSettingsState } from './state';
import { GridOptionsPanel } from './GridOptionsPanel';

/**
 * Grid Options — the "vitals" module. Carries the Top-40 curated AG-Grid
 * options (see `/ag-grid-customizer-input-controls.md`). Runs first in the
 * transform pipeline so other modules see the canonical defaultColDef /
 * row sizing / selection config.
 *
 * `schemaVersion` bumped 1 → 2 when the state shape widened from the
 * original "general settings" subset. `migrate()` backfills every new
 * field from `INITIAL_GENERAL_SETTINGS` — additive only, no renames.
 */

export const generalSettingsModule: Module<GeneralSettingsState> = {
  id: 'general-settings',
  name: 'Grid Options',
  code: '00',
  schemaVersion: 2,
  // Runs first so other modules see the canonical defaultColDef / row sizing.
  priority: 0,

  getInitialState: () => ({ ...INITIAL_GENERAL_SETTINGS }),

  /**
   * v1 snapshots predate the Top-40 widening. Spread the current initial
   * state under the stored fields so every new key (`cellFlashDuration`,
   * `multiSortMode`, `enterNavigation`, performance flags, …) is
   * populated from defaults without losing anything the user had saved.
   */
  migrate(raw) {
    if (!raw || typeof raw !== 'object') return { ...INITIAL_GENERAL_SETTINGS };
    return {
      ...INITIAL_GENERAL_SETTINGS,
      ...(raw as Partial<GeneralSettingsState>),
    };
  },

  transformGridOptions(opts: Partial<GridOptions>, state: GeneralSettingsState): Partial<GridOptions> {
    // ── Tier 3: compound multi-sort → three AG-Grid flags ─────────────────
    // Keep the UI model's single enum and expand it here so AG-Grid sees
    // the exact shape it expects.
    const multiSort = {
      replace: { suppressMultiSort: true, alwaysMultiSort: false, multiSortKey: undefined as 'ctrl' | undefined },
      shift:   { suppressMultiSort: false, alwaysMultiSort: false, multiSortKey: undefined as 'ctrl' | undefined },
      ctrl:    { suppressMultiSort: false, alwaysMultiSort: false, multiSortKey: 'ctrl' as const },
      always:  { suppressMultiSort: false, alwaysMultiSort: true, multiSortKey: undefined as 'ctrl' | undefined },
    }[state.multiSortMode];

    // ── Tier 4: compound enter-navigation → two AG-Grid flags ─────────────
    const enterNav = {
      default:   { enterNavigatesVertically: false, enterNavigatesVerticallyAfterEdit: false },
      always:    { enterNavigatesVertically: true,  enterNavigatesVerticallyAfterEdit: false },
      afterEdit: { enterNavigatesVertically: false, enterNavigatesVerticallyAfterEdit: true  },
      both:      { enterNavigatesVertically: true,  enterNavigatesVerticallyAfterEdit: true  },
    }[state.enterNavigation];

    return {
      ...opts,

      // Tier 1
      rowHeight: state.rowHeight,
      headerHeight: state.headerHeight,
      pagination: state.pagination,
      paginationPageSize: state.pagination ? state.paginationPageSize : undefined,
      paginationAutoPageSize: state.pagination ? state.paginationAutoPageSize : undefined,
      suppressPaginationPanel: state.pagination ? state.suppressPaginationPanel : undefined,
      rowSelection: state.rowSelection
        ? {
            mode: state.rowSelection,
            // Expose a minimal, predictable default for the object form.
            checkboxes: state.checkboxSelection,
          }
        : undefined,
      // Override the auto-generated `ag-Grid-SelectionColumn` defaults so
      // its position round-trips through grid-state saves.
      //
      // Out of the box AG-Grid ships the selection column with
      // `suppressMovable: true` + `lockPosition: 'left'` — that means the
      // user literally cannot drag it AND `api.setState().columnOrder`
      // cannot reorder it. Result: users saw the checkbox column locked
      // wherever it first landed (usually after the last data column,
      // because `maintainColumnOrder: true` appends newly-added columns),
      // and grid-state restore appeared to silently drop its position.
      //
      // Re-emit both flags as permissive so the column is a first-class
      // participant in column reorder + state-save. `initialPinned: 'left'`
      // gives it a sensible default location on first mount — user can
      // unpin / drag freely after that, and the move is captured by
      // `api.getState()` like any other column.
      selectionColumnDef: state.rowSelection && state.checkboxSelection
        ? {
            suppressMovable: false,
            lockPosition: false,
            initialPinned: 'left',
          }
        : undefined,
      // Boolean shortcut — AG-Grid accepts `true` for a default cell-range
      // selection config. The sub-panel form (handle, suppressMultiRanges,
      // …) is out of scope for this pass.
      cellSelection: state.cellSelection,
      rowDragManaged: state.rowDragging,
      animateRows: state.animateRows,
      cellFlashDuration: state.cellFlashDuration,
      cellFadeDuration: state.cellFadeDuration,
      quickFilterText: state.quickFilterText || undefined,

      // Tier 2
      groupDisplayType: state.groupDisplayType,
      groupDefaultExpanded: state.groupDefaultExpanded,
      rowGroupPanelShow: state.rowGroupPanelShow,
      pivotMode: state.pivotMode,
      pivotPanelShow: state.pivotPanelShow,
      grandTotalRow: state.grandTotalRow,
      groupTotalRow: state.groupTotalRow,
      groupHideOpenParents: state.groupHideOpenParents,
      suppressAggFuncInHeader: state.suppressAggFuncInHeader,
      // Row grouping — extended
      showOpenedGroup: state.showOpenedGroup,
      groupHideColumnsUntilExpanded: state.groupHideColumnsUntilExpanded,
      groupHideParentOfSingleChild: state.groupHideParentOfSingleChild,
      groupAllowUnbalanced: state.groupAllowUnbalanced,
      groupMaintainOrder: state.groupMaintainOrder,
      suppressGroupRowsSticky: state.suppressGroupRowsSticky,
      rowGroupPanelSuppressSort: state.rowGroupPanelSuppressSort,
      groupLockGroupColumns: state.groupLockGroupColumns,
      suppressGroupChangesColumnVisibility: state.suppressGroupChangesColumnVisibility,
      ssrmExpandAllAffectsAllRows: state.ssrmExpandAllAffectsAllRows,
      refreshAfterGroupEdit: state.refreshAfterGroupEdit,

      // Tier 3
      enableAdvancedFilter: state.enableAdvancedFilter,
      includeHiddenColumnsInQuickFilter: state.includeHiddenColumnsInQuickFilter,
      ...multiSort,
      accentedSort: state.accentedSort,
      copyHeadersToClipboard: state.copyHeadersToClipboard,
      clipboardDelimiter: state.clipboardDelimiter,

      // Tier 4
      singleClickEdit: state.singleClickEdit,
      stopEditingWhenCellsLoseFocus: state.stopEditingWhenCellsLoseFocus,
      ...enterNav,
      undoRedoCellEditing: state.undoRedoCellEditing,
      undoRedoCellEditingLimit: state.undoRedoCellEditing
        ? state.undoRedoCellEditingLimit
        : undefined,
      tooltipShowDelay: state.tooltipShowDelay,
      tooltipShowMode: state.tooltipShowMode,

      // Tier 5
      suppressRowHoverHighlight: state.suppressRowHoverHighlight,
      columnHoverHighlight: state.columnHoverHighlight,

      // Legacy / shared flags
      enableCellTextSelection: state.enableCellTextSelection,
      suppressDragLeaveHidesColumns: state.suppressDragLeaveHidesColumns,
      suppressColumnMoveAnimation: state.suppressColumnMoveAnimation,

      // Default ColDef — spread host `opts.defaultColDef` last so a host
      // prop keeps winning over our module-wide defaults, matching the
      // pattern every other v2 transformer follows.
      defaultColDef: {
        // Sizing
        resizable: state.defaultResizable,
        minWidth: state.defaultMinWidth,
        maxWidth: state.defaultMaxWidth,
        width: state.defaultWidth,
        flex: state.defaultFlex,
        suppressSizeToFit: state.suppressSizeToFit,
        suppressAutoSize: state.suppressAutoSize,
        // Sorting & filtering
        sortable: state.defaultSortable,
        filter: state.defaultFilterable,
        unSortIcon: state.unSortIcon,
        floatingFilter: state.floatingFilter,
        // Editing
        editable: state.defaultEditable,
        suppressPaste: state.suppressPaste,
        suppressNavigable: state.suppressNavigable,
        // Header
        wrapHeaderText: state.wrapHeaderText,
        autoHeaderHeight: state.autoHeaderHeight,
        suppressHeaderMenuButton: state.suppressHeaderMenuButton,
        // Movement & locking
        suppressMovable: state.suppressMovable,
        lockPosition: state.lockPosition,
        lockVisible: state.lockVisible,
        lockPinned: state.lockPinned,
        // Cell content
        wrapText: state.wrapText,
        autoHeight: state.autoHeight,
        enableCellChangeFlash: state.enableCellChangeFlash,
        // Row grouping / pivoting (Enterprise — inert in community)
        enableRowGroup: state.enableRowGroup,
        enablePivot: state.enablePivot,
        enableValue: state.enableValue,
        // Host wins on conflict
        ...opts.defaultColDef,
      },

      // Performance
      rowBuffer: state.rowBuffer,
      suppressScrollOnNewData: state.suppressScrollOnNewData,
      suppressColumnVirtualisation: state.suppressColumnVirtualisation,
      // `suppressRowVirtualisation` is NOT a GridOption in AG-Grid — it's
      // the row model's behaviour. AG-Grid exposes it via individual row
      // model flags. Kept in state for completeness; emitted only when
      // the host reads it directly.
      suppressMaxRenderedRowRestriction: state.suppressMaxRenderedRowRestriction,
      suppressAnimationFrame: state.suppressAnimationFrame,
      debounceVerticalScrollbar: state.debounceVerticalScrollbar,
    } as Partial<GridOptions>;
  },

  serialize: (state) => state,
  deserialize: (data) => ({
    ...INITIAL_GENERAL_SETTINGS,
    ...((data as Partial<GeneralSettingsState> | null) ?? {}),
  }),

  SettingsPanel: GridOptionsPanel,
};

export type { GeneralSettingsState };
export { INITIAL_GENERAL_SETTINGS };
