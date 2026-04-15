// State shape for the general-settings module. Mirrors the v1 surface so that
// migrating a v1 snapshot into v2 is a single shallow merge — no field
// renames or shape changes.
export interface GeneralSettingsState {
  // ─── Grid Options ────────────────────────────────────────────────────────
  rowHeight: number;
  headerHeight: number;
  rowSelection: 'singleRow' | 'multiRow' | undefined;
  checkboxSelection: boolean;
  rowDragging: boolean;
  animateRows: boolean;
  suppressRowHoverHighlight: boolean;
  enableCellTextSelection: boolean;
  suppressDragLeaveHidesColumns: boolean;
  suppressColumnMoveAnimation: boolean;

  // ─── Default Column Definitions ──────────────────────────────────────────
  defaultResizable: boolean;
  defaultSortable: boolean;
  defaultFilterable: boolean;
  defaultEditable: boolean;
  defaultMinWidth: number;
  defaultMaxWidth: number | undefined;
  wrapHeaderText: boolean;
  suppressMovable: boolean;

  // ─── Pagination ──────────────────────────────────────────────────────────
  paginationEnabled: boolean;
  paginationPageSize: number;
  paginationAutoPageSize: boolean;
  suppressPaginationPanel: boolean;
}

export const INITIAL_GENERAL_SETTINGS: GeneralSettingsState = {
  rowHeight: 36,
  headerHeight: 32,
  rowSelection: undefined,
  checkboxSelection: false,
  rowDragging: false,
  animateRows: true,
  suppressRowHoverHighlight: false,
  enableCellTextSelection: false,
  suppressDragLeaveHidesColumns: true,
  suppressColumnMoveAnimation: false,

  defaultResizable: true,
  defaultSortable: true,
  defaultFilterable: true,
  defaultEditable: false,
  defaultMinWidth: 80,
  defaultMaxWidth: undefined,
  wrapHeaderText: false,
  suppressMovable: false,

  paginationEnabled: false,
  paginationPageSize: 100,
  paginationAutoPageSize: false,
  suppressPaginationPanel: false,
};
