/**
 * AG Grid server-side datasource backed by a Perspective View.
 *
 * The book lives once as a Table in the SharedWorker; this datasource
 * serves the blocks AG Grid asks for by reading a window out of a View.
 * Measured on 4.5.2, a 100-row window read is ~2-6ms and is FLAT with
 * scroll depth — which is the whole reason for the engine swap. CSRM
 * has to materialize all 20k rows x 52 columns in every window.
 *
 * The rules encoded below come from decoding the shipped ag-grid-enterprise
 * 36.0.0 bundle; the public docs are silent on all of them, and violating
 * any one fails SILENTLY rather than throwing.
 */

/** Minimal shape of the Perspective View methods this datasource needs. */
export interface PerspectiveViewLike {
  to_columns(window?: {
    start_row?: number;
    end_row?: number;
  }): Promise<Record<string, unknown[]>>;
  num_rows(): Promise<number>;
}

/** The slice of AG Grid's `IServerSideGetRowsRequest` we consume. */
export interface SsrmRequestLike {
  startRow?: number;
  endRow?: number;
  sortModel?: readonly { colId: string; sort: string }[];
  filterModel?: unknown;
}

export interface SsrmGetRowsParamsLike {
  request: SsrmRequestLike;
  success(result: { rowData: Record<string, unknown>[]; rowCount?: number }): void;
  fail(): void;
}

/**
 * Pivot Perspective's columnar window into the row objects AG Grid wants.
 *
 * `to_columns` returns `{ col: [v0, v1, ...] }`. Row count is taken from the
 * longest column rather than any single one, so a column that is entirely
 * null in this window cannot silently truncate the block.
 */
export function columnsToRows(
  columns: Record<string, unknown[]>,
): Record<string, unknown>[] {
  const names = Object.keys(columns);
  if (names.length === 0) return [];

  let length = 0;
  for (const name of names) {
    const col = columns[name];
    if (Array.isArray(col) && col.length > length) length = col.length;
  }

  const rows: Record<string, unknown>[] = new Array(length);
  for (let i = 0; i < length; i++) {
    const row: Record<string, unknown> = {};
    for (const name of names) row[name] = columns[name]?.[i];
    rows[i] = row;
  }
  return rows;
}

/**
 * Snapshot the mutable parts of an AG Grid request.
 *
 * `sortModel` / `filterModel` are references into ONE shared `ssrmParams`
 * object that AG mutates in place. Retaining them by reference corrupts the
 * `oldSortModel` that `findChangedColumnsInSort` diffs against, which yields
 * an empty `changedColumns` and silently stops refresh-on-sort at group
 * levels. Anything we keep past the synchronous call must be cloned.
 */
export function cloneRequest(request: SsrmRequestLike): SsrmRequestLike {
  return {
    startRow: request.startRow,
    endRow: request.endRow,
    sortModel: request.sortModel?.map((s) => ({ colId: s.colId, sort: s.sort })),
    filterModel:
      request.filterModel === undefined
        ? undefined
        : (JSON.parse(JSON.stringify(request.filterModel)) as unknown),
  };
}

export interface PerspectiveDatasourceOpts {
  /** Resolve the View to read — re-resolved per block so sort/filter swaps are picked up. */
  getView(request: SsrmRequestLike): Promise<PerspectiveViewLike | null>;
  /** Optional generation fence; a block whose generation is stale resolves empty, never silently. */
  getGeneration?(): number;
  onError?(err: unknown): void;
}

export interface PerspectiveDatasource {
  getRows(params: SsrmGetRowsParamsLike): void;
}

/**
 * Build the datasource.
 *
 * RULE 1 (the one that matters): every `getRows` terminates in EXACTLY one
 * `success` or `fail`. AG Grid increments a grid-global `outboundRequests`
 * counter before calling us and only decrements it inside success/fail, with
 * `maxConcurrentDatasourceRequests` defaulting to 2. Two leaked calls and
 * `hasAvailableLoadBandwidth()` is false forever — no request is ever issued
 * again, for any store, for any reason, and purging does NOT recover it.
 * So there is no early `return` anywhere below: stale generations and null
 * views still resolve, they just resolve empty. Delivering a stale block is
 * safe (a dead cache discards it via `!live`); failing to resolve is fatal.
 */
export function createPerspectiveDatasource(
  opts: PerspectiveDatasourceOpts,
): PerspectiveDatasource {
  return {
    getRows(params: SsrmGetRowsParamsLike): void {
      const request = cloneRequest(params.request);
      const startRow = request.startRow ?? 0;
      const endRow = request.endRow ?? startRow;
      const generation = opts.getGeneration?.();

      void (async () => {
        try {
          const view = await opts.getView(request);

          // Stale fence or no view: resolve EMPTY rather than returning.
          // `rowCount` is omitted so AG keeps `isLastRowKnown` false —
          // passing 0 here would permanently cap the store (rule 2).
          if (
            view === null ||
            (generation !== undefined && opts.getGeneration?.() !== generation)
          ) {
            params.success({ rowData: [] });
            return;
          }

          const columns = await view.to_columns({
            start_row: startRow,
            end_row: endRow,
          });
          const rowData = columnsToRows(columns);

          // Only claim a total when the block came up short — that is the
          // signal AG uses to finalize the row count. Shrinking via
          // `success({rowCount})` is correct; `setRowCount(n, true)` is the
          // sort-specific trap that leaves sorting permanently dead.
          const short = rowData.length < endRow - startRow;
          params.success(
            short
              ? { rowData, rowCount: startRow + rowData.length }
              : { rowData },
          );
        } catch (err) {
          opts.onError?.(err);
          // Failed blocks are never retried automatically — the caller must
          // use `api.retryServerSideLoads()` — but failing is still the only
          // way to release the bandwidth counter.
          params.fail();
        }
      })();
    },
  };
}
