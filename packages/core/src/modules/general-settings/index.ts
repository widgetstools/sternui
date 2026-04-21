/**
 * Grid Options — the "vitals" module. Carries the Top-40 curated AG-Grid
 * options (see `/ag-grid-customizer-input-controls.md`).
 *
 * Priority `0` — runs FIRST in the transform pipeline so every other
 * module sees a canonical `defaultColDef` + row sizing + selection
 * config shaped by the user's preferences.
 *
 * `schemaVersion: 2` — a v1 snapshot (smaller subset) migrates by
 * additively filling every new field from `INITIAL_GENERAL_SETTINGS`.
 */
import type { GridOptions } from 'ag-grid-community';
import type { Module } from '../../platform/types';
import { INITIAL_GENERAL_SETTINGS, type GeneralSettingsState } from './state';
import { GridOptionsPanel } from './GridOptionsPanel';

export const GENERAL_SETTINGS_MODULE_ID = 'general-settings';

export const generalSettingsModule: Module<GeneralSettingsState> = {
  id: GENERAL_SETTINGS_MODULE_ID,
  name: 'Grid Options',
  code: '00',
  schemaVersion: 2,
  priority: 0,

  getInitialState: () => ({ ...INITIAL_GENERAL_SETTINGS }),

  serialize: (state) => state,
  deserialize: (raw) => ({
    ...INITIAL_GENERAL_SETTINGS,
    ...((raw as Partial<GeneralSettingsState> | null) ?? {}),
  }),
  // Additive migration: always fill current defaults, overlay stored
  // values. New fields drop in transparently across version bumps.
  migrate: (raw) =>
    !raw || typeof raw !== 'object'
      ? { ...INITIAL_GENERAL_SETTINGS }
      : { ...INITIAL_GENERAL_SETTINGS, ...(raw as Partial<GeneralSettingsState>) },

  transformGridOptions(opts: Partial<GridOptions>, s: GeneralSettingsState): Partial<GridOptions> {
    // Compound multi-sort → three AG-Grid flags.
    const multi = {
      replace: { suppressMultiSort: true, alwaysMultiSort: false, multiSortKey: undefined as 'ctrl' | undefined },
      shift:   { suppressMultiSort: false, alwaysMultiSort: false, multiSortKey: undefined as 'ctrl' | undefined },
      ctrl:    { suppressMultiSort: false, alwaysMultiSort: false, multiSortKey: 'ctrl' as const },
      always:  { suppressMultiSort: false, alwaysMultiSort: true,  multiSortKey: undefined as 'ctrl' | undefined },
    }[s.multiSortMode];

    // Compound enter-navigation → two AG-Grid flags.
    const enterNav = {
      default:   { enterNavigatesVertically: false, enterNavigatesVerticallyAfterEdit: false },
      always:    { enterNavigatesVertically: true,  enterNavigatesVerticallyAfterEdit: false },
      afterEdit: { enterNavigatesVertically: false, enterNavigatesVerticallyAfterEdit: true  },
      both:      { enterNavigatesVertically: true,  enterNavigatesVerticallyAfterEdit: true  },
    }[s.enterNavigation];

    return {
      ...opts,

      // ── Tier 1 ──
      rowHeight: s.rowHeight,
      headerHeight: s.headerHeight,
      pagination: s.pagination,
      paginationPageSize: s.pagination ? s.paginationPageSize : undefined,
      paginationAutoPageSize: s.pagination ? s.paginationAutoPageSize : undefined,
      suppressPaginationPanel: s.pagination ? s.suppressPaginationPanel : undefined,
      rowSelection: s.rowSelection
        ? { mode: s.rowSelection, checkboxes: s.checkboxSelection }
        : undefined,
      // Re-emit AG-Grid's default selection column pinned to the left.
      // `pinned: 'left'` (NOT `initialPinned`) re-applies on every
      // `setColumnDefs`, otherwise the selection column silently drifts
      // rightward by one slot each time a formatting change triggers a
      // columnDefs re-derive (user sees the checkbox column jump from
      // position 0 to position 1 after the first style is applied).
      // `initialPinned` is a mount-only hint AG-Grid drops on subsequent
      // setColumnDefs calls; `pinned` is the load-bearing equivalent.
      // `suppressMovable: false, lockPosition: false` still lets the
      // user drag within the left-pinned area.
      selectionColumnDef: s.rowSelection && s.checkboxSelection
        ? { suppressMovable: false, lockPosition: false, pinned: 'left' }
        : undefined,
      cellSelection: s.cellSelection,
      rowDragManaged: s.rowDragging,
      animateRows: s.animateRows,
      cellFlashDuration: s.cellFlashDuration,
      cellFadeDuration: s.cellFadeDuration,
      quickFilterText: s.quickFilterText || undefined,

      // ── Tier 2 — grouping / pivoting ──
      groupDisplayType: s.groupDisplayType,
      groupDefaultExpanded: s.groupDefaultExpanded,
      rowGroupPanelShow: s.rowGroupPanelShow,
      pivotMode: s.pivotMode,
      pivotPanelShow: s.pivotPanelShow,
      grandTotalRow: s.grandTotalRow,
      groupTotalRow: s.groupTotalRow,
      groupHideOpenParents: s.groupHideOpenParents,
      suppressAggFuncInHeader: s.suppressAggFuncInHeader,
      showOpenedGroup: s.showOpenedGroup,
      groupHideColumnsUntilExpanded: s.groupHideColumnsUntilExpanded,
      groupHideParentOfSingleChild: s.groupHideParentOfSingleChild,
      groupAllowUnbalanced: s.groupAllowUnbalanced,
      groupMaintainOrder: s.groupMaintainOrder,
      suppressGroupRowsSticky: s.suppressGroupRowsSticky,
      rowGroupPanelSuppressSort: s.rowGroupPanelSuppressSort,
      groupLockGroupColumns: s.groupLockGroupColumns,
      suppressGroupChangesColumnVisibility: s.suppressGroupChangesColumnVisibility,
      ssrmExpandAllAffectsAllRows: s.ssrmExpandAllAffectsAllRows,
      refreshAfterGroupEdit: s.refreshAfterGroupEdit,

      // ── Tier 3 — filtering / sorting / clipboard ──
      enableAdvancedFilter: s.enableAdvancedFilter,
      includeHiddenColumnsInQuickFilter: s.includeHiddenColumnsInQuickFilter,
      ...multi,
      accentedSort: s.accentedSort,
      copyHeadersToClipboard: s.copyHeadersToClipboard,
      clipboardDelimiter: s.clipboardDelimiter,

      // ── Tier 4 — editing ──
      singleClickEdit: s.singleClickEdit,
      stopEditingWhenCellsLoseFocus: s.stopEditingWhenCellsLoseFocus,
      ...enterNav,
      undoRedoCellEditing: s.undoRedoCellEditing,
      undoRedoCellEditingLimit: s.undoRedoCellEditing ? s.undoRedoCellEditingLimit : undefined,
      tooltipShowDelay: s.tooltipShowDelay,
      tooltipShowMode: s.tooltipShowMode,

      // ── Tier 5 — styling ──
      suppressRowHoverHighlight: s.suppressRowHoverHighlight,
      columnHoverHighlight: s.columnHoverHighlight,

      // ── Shared flags ──
      enableCellTextSelection: s.enableCellTextSelection,
      suppressDragLeaveHidesColumns: s.suppressDragLeaveHidesColumns,
      suppressColumnMoveAnimation: s.suppressColumnMoveAnimation,

      // ── Default ColDef — host `opts.defaultColDef` wins on conflict ──
      defaultColDef: {
        resizable: s.defaultResizable,
        minWidth: s.defaultMinWidth,
        maxWidth: s.defaultMaxWidth,
        width: s.defaultWidth,
        flex: s.defaultFlex,
        suppressSizeToFit: s.suppressSizeToFit,
        suppressAutoSize: s.suppressAutoSize,
        sortable: s.defaultSortable,
        filter: s.defaultFilterable,
        unSortIcon: s.unSortIcon,
        floatingFilter: s.floatingFilter,
        editable: s.defaultEditable,
        suppressPaste: s.suppressPaste,
        suppressNavigable: s.suppressNavigable,
        wrapHeaderText: s.wrapHeaderText,
        autoHeaderHeight: s.autoHeaderHeight,
        suppressHeaderMenuButton: s.suppressHeaderMenuButton,
        suppressMovable: s.suppressMovable,
        lockPosition: s.lockPosition,
        lockVisible: s.lockVisible,
        lockPinned: s.lockPinned,
        wrapText: s.wrapText,
        autoHeight: s.autoHeight,
        enableCellChangeFlash: s.enableCellChangeFlash,
        enableRowGroup: s.enableRowGroup,
        enablePivot: s.enablePivot,
        enableValue: s.enableValue,
        ...opts.defaultColDef,
      },

      // ── Performance ──
      rowBuffer: s.rowBuffer,
      suppressScrollOnNewData: s.suppressScrollOnNewData,
      suppressColumnVirtualisation: s.suppressColumnVirtualisation,
      suppressMaxRenderedRowRestriction: s.suppressMaxRenderedRowRestriction,
      suppressAnimationFrame: s.suppressAnimationFrame,
      debounceVerticalScrollbar: s.debounceVerticalScrollbar,
    } as Partial<GridOptions>;
  },

  SettingsPanel: GridOptionsPanel,
};

export type { GeneralSettingsState };
export { INITIAL_GENERAL_SETTINGS };
