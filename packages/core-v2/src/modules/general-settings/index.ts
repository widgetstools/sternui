import type { GridOptions } from 'ag-grid-community';
import type { Module } from '../../core/types';
import { INITIAL_GENERAL_SETTINGS, type GeneralSettingsState } from './state';

/**
 * General Settings — pure transformGridOptions module. Carries no UI in
 * v2.0; the SettingsPanel comes back when MarketsGrid v2 lands and we've
 * defined the v2 panel registration surface.
 */
export const generalSettingsModule: Module<GeneralSettingsState> = {
  id: 'general-settings',
  name: 'General Settings',
  schemaVersion: 1,
  // Runs first so other modules see the canonical defaultColDef / row sizing.
  priority: 0,

  getInitialState: () => ({ ...INITIAL_GENERAL_SETTINGS }),

  transformGridOptions(opts: Partial<GridOptions>, state: GeneralSettingsState): Partial<GridOptions> {
    return {
      ...opts,
      rowHeight: state.rowHeight,
      headerHeight: state.headerHeight,
      // AG-Grid 35 expects the object form; undefined disables row selection.
      rowSelection: state.rowSelection ? { mode: state.rowSelection } : undefined,
      rowDragManaged: state.rowDragging,
      animateRows: state.animateRows,
      suppressRowHoverHighlight: state.suppressRowHoverHighlight,
      enableCellTextSelection: state.enableCellTextSelection,
      suppressDragLeaveHidesColumns: state.suppressDragLeaveHidesColumns,
      suppressColumnMoveAnimation: state.suppressColumnMoveAnimation,
      pagination: state.paginationEnabled,
      // Send these only when pagination is on — passing them with pagination
      // disabled triggers AG-Grid console warnings.
      paginationPageSize: state.paginationEnabled ? state.paginationPageSize : undefined,
      paginationAutoPageSize: state.paginationEnabled ? state.paginationAutoPageSize : undefined,
      suppressPaginationPanel: state.paginationEnabled ? state.suppressPaginationPanel : undefined,
      defaultColDef: {
        ...opts.defaultColDef,
        resizable: state.defaultResizable,
        sortable: state.defaultSortable,
        filter: state.defaultFilterable,
        editable: state.defaultEditable,
        minWidth: state.defaultMinWidth,
        maxWidth: state.defaultMaxWidth,
        wrapHeaderText: state.wrapHeaderText,
        suppressMovable: state.suppressMovable,
      },
    };
  },

  serialize: (state) => state,
  // Tolerant deserialize: spread initial defaults under the saved partial so
  // a v1 snapshot missing a v2 field gets the new field's initial value
  // automatically. The `Module.migrate` hook is reserved for shape changes;
  // this is just additive backfill.
  deserialize: (data) => ({
    ...INITIAL_GENERAL_SETTINGS,
    ...((data as Partial<GeneralSettingsState> | null) ?? {}),
  }),
};

export type { GeneralSettingsState };
export { INITIAL_GENERAL_SETTINGS };
