/**
 * Wire + engine types for the Server-Side Row Model (SSRM) query path.
 *
 * The SharedWorker acts as AG-Grid's SSRM "server": it holds the
 * canonical row cache and answers block requests
 * ({@link SsrmGetRowsRequest}) by filtering, sorting and slicing that
 * cache off the UI thread. These shapes mirror the subset of AG-Grid's
 * `IServerSideGetRowsRequest` the worker currently understands — they
 * are plain JSON so they cross the MessagePort unchanged.
 *
 * Phase 1 covers flat filter + sort + paginate. Grouping, aggregation
 * and pivot fields (`rowGroupCols`, `valueCols`, `pivotCols`,
 * `groupKeys`, `pivotMode`) are carried on the wire now but not yet
 * honoured by the engine — see docs/SSRM_WORKER_PLAN.md.
 */

/** One column's sort directive (mirrors AG-Grid `SortModelItem`). */
export interface SsrmSortModelItem {
  colId: string;
  sort: 'asc' | 'desc';
}

/** A grouped/value/pivot column reference (mirrors AG-Grid `ColumnVO`). */
export interface SsrmColumnVO {
  id: string;
  displayName?: string;
  field?: string;
  aggFunc?: string | null;
}

/**
 * Block request the grid sends per `getRows`. A subset of AG-Grid's
 * `IServerSideGetRowsRequest`. `startRow`/`endRow` are the half-open
 * block bounds; the rest describe the current sort/filter/group state.
 */
export interface SsrmGetRowsRequest {
  /** Inclusive first row index of the block. */
  startRow?: number;
  /** Exclusive last row index of the block. */
  endRow?: number;
  sortModel?: readonly SsrmSortModelItem[];
  /** `{ [colId]: filterModel }` — AG-Grid filter models, verbatim. */
  filterModel?: Record<string, unknown> | null;
  rowGroupCols?: readonly SsrmColumnVO[];
  valueCols?: readonly SsrmColumnVO[];
  pivotCols?: readonly SsrmColumnVO[];
  groupKeys?: readonly unknown[];
  pivotMode?: boolean;
}

/** Worker → grid block response. */
export interface SsrmQueryResult {
  /** The shaped rows for the requested block. */
  rows: unknown[];
  /**
   * Total row count of the full filtered result set. Because the worker
   * holds every row it always knows the exact count, so the grid never
   * has to guess the dataset size (no infinite-scroll "is there more?"
   * round-trips) — this is part of what makes SSRM feel like CSRM.
   */
  lastRow: number;
  /** Set when the query failed; `rows` is then empty and `lastRow` 0. */
  error?: string;
}

/** Options controlling how the engine reads values out of a row. */
export interface SsrmQueryOptions {
  /**
   * Resolve a column id to a cell value on a row. Defaults to a
   * dot-path getter (`getByPath`) so `field: 'a.b'` works out of the
   * box. Override to support nested-field aliases or value getters.
   */
  getValue?: (row: unknown, colId: string) => unknown;
}
