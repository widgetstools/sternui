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
/** The full ancestor path of a group row, outermost first. */
export const SSRM_GROUP_PATH = '__ssrmPath';
/** Leaf rows beneath a group row — what AG shows as the group's child count. */
export const SSRM_CHILD_COUNT = '__ssrmChildCount';
