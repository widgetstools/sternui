/**
 * AG Grid's server-side row model contract, restated structurally.
 *
 * Deliberately free of any AG Grid import — the same rule
 * `@starui/perspective-grid` follows. The engine is then testable without a
 * grid, runs in a worker where AG does not exist, and cannot accidentally
 * depend on AG internals that change between majors.
 *
 * Every field below is the AG 36 shape, taken from `IServerSideDatasource` and
 * `IServerSideGetRowsRequest`. The request carries NO column window: the whole
 * of it is startRow, endRow, rowGroupCols, valueCols, pivotCols, pivotMode,
 * groupKeys, filterModel, sortModel. Column virtualisation is a rendering
 * optimisation over row data AG already holds, so nothing in the protocol ever
 * says "the user scrolled right".
 */

/** A column the grid is grouping by, aggregating, or pivoting on. */
export interface SsrmColumnVO {
  id: string;
  displayName?: string;
  field?: string;
  aggFunc?: string | null;
}

export interface SsrmSortModelItem {
  colId: string;
  sort: 'asc' | 'desc';
}

/**
 * One column's entry in AG's filter model.
 *
 * AG nests compound filters under `conditions` with an `operator`, and set
 * filters carry `values`. Multi-filters wrap the lot again under
 * `filterType: 'multi'`.
 */
export interface SsrmFilterItem {
  filterType?: 'text' | 'number' | 'date' | 'set' | 'multi' | string;
  type?: string;
  filter?: unknown;
  filterTo?: unknown;
  values?: unknown[];
  dateFrom?: string | null;
  dateTo?: string | null;
  operator?: 'AND' | 'OR';
  conditions?: SsrmFilterItem[];
  filterModels?: (SsrmFilterItem | null)[];
}

export type SsrmFilterModel = Record<string, SsrmFilterItem>;

/** AG's `IServerSideGetRowsRequest`, verbatim in shape. */
export interface SsrmGetRowsRequest {
  startRow?: number;
  endRow?: number;
  rowGroupCols?: SsrmColumnVO[];
  valueCols?: SsrmColumnVO[];
  pivotCols?: SsrmColumnVO[];
  pivotMode?: boolean;
  /** Ancestor keys of the level being asked for; its length IS the depth. */
  groupKeys?: unknown[];
  filterModel?: SsrmFilterModel | null;
  sortModel?: SsrmSortModelItem[];
  /**
   * TREE DATA: the hierarchy this window is viewing the book through.
   *
   * On the REQUEST rather than only on the engine, and that is the whole point.
   * AG sends no `rowGroupCols` in tree mode, so something has to stand in for
   * them — but the book is held ONCE in a SharedWorker and read by N windows,
   * so a hierarchy configured on the engine would be a hierarchy every window
   * shared. One blotter viewing `region -> desk` while another views the same
   * book flat is the ordinary case, and it is the case sort, filter and
   * grouping already support by travelling on the request.
   *
   * The engine's own `treeFields` construction option remains as the default
   * for a book that has one shape; this WINS over it when present.
   */
  treeFields?: readonly string[];
}

export type SsrmRow = Record<string, unknown>;

/**
 * What the engine answers.
 *
 * `rowCount` is ALWAYS supplied here, and that is a property of holding the
 * whole book: the engine knows the exact size of every level, so the last row
 * is always known. The pull path against a remote store cannot say that, which
 * is why `@starui/perspective-grid` has a rule about omitting `rowCount` — a 0
 * there sets `isLastRowKnown` and caps the store permanently. Knowing the count
 * removes that entire failure mode.
 */
export interface SsrmGetRowsResult {
  rowData: SsrmRow[];
  rowCount: number;
  /** Aggregates for the requested level, for AG's group footer / totals row. */
  groupLevelInfo?: Record<string, unknown>;
  /**
   * Pivot mode only: every generated column name in this result.
   *
   * AG builds its secondary (pivot result) columns from these, splitting each
   * on `serverSidePivotResultFieldSeparator` — default `_` — to recover the
   * pivot values and the value column. So a name is
   * `<pivotValue>[<sep><pivotValue>...]<sep><valueColId>` and the separator must
   * not appear inside a pivot value, or AG will split it in the wrong place.
   */
  pivotResultFields?: string[];
}

/** Column types the store can hold. */
export type SsrmFieldType = 'number' | 'string' | 'boolean' | 'date';

export interface SsrmFieldDef {
  field: string;
  type: SsrmFieldType;
}

export interface SsrmSchema {
  /** Index column. Upserts key on it and it must be unique. */
  keyField: string;
  fields: SsrmFieldDef[];
}

/**
 * Aggregations AG names, plus the two a blotter always wants.
 *
 * `first`/`last` are ordinal in the group's CURRENT order, which is why they
 * are computed from the grouped index rather than from insertion order.
 */
export type SsrmAggFunc =
  | 'sum'
  | 'min'
  | 'max'
  | 'avg'
  | 'count'
  | 'first'
  | 'last';

/** Marks a row the engine produced as a group row rather than a leaf. */
export const SSRM_GROUP_FLAG = '__ssrmGroup';
/**
 * Tree mode markers.
 *
 * AG's SSRM **tree** mode has no row-group columns at all: the hierarchy is read
 * off the DATA through `isServerSideGroup(data)` and `getServerSideGroupKey(data)`.
 * Nothing in a book says which rows are parents, so the engine stamps it on.
 */
export const SSRM_TREE_GROUP = '__ssrmTreeGroup';
export const SSRM_TREE_KEY = '__ssrmTreeKey';
/** The full ancestor path of a group row, outermost first. */
export const SSRM_GROUP_PATH = '__ssrmPath';
/**
 * AG's own id for the grand total row.
 *
 * AG's rather than this package's — a transaction can only reach that row by
 * naming it, so `getRowId` has to answer this exact string for it. The same
 * literal `@starui/perspective-grid` exports.
 */
export const SSRM_GRAND_TOTAL_ROW_ID = 'rowGroupFooter_ROOT_NODE_ID';
/** Marks the row the engine builds as the grand total, so `getRowId` knows it. */
export const SSRM_GRAND_TOTAL_FLAG = '__grandTotal';
/** Leaf rows beneath a group row — what AG shows as the group's child count. */
export const SSRM_CHILD_COUNT = '__ssrmChildCount';
