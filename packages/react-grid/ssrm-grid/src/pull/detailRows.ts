/**
 * Master-detail (P4b-2) — on-demand detail fetch for AG 36's
 * serverSide masterDetail contract.
 *
 * ## Vendor contract (AG Grid 36, studied against the shipped types)
 *
 * `masterDetail: true` + SSRM: the grid renders an expand arrow on
 * master rows (`isRowMaster` decides which) and, on expand, calls
 * `detailCellRendererParams.getDetailRowData(params)` with the master
 * row's `data`; the callback answers ASYNCHRONOUSLY via
 * `params.successCallback(rows)` — exactly an on-demand fetch seam.
 * There is no fail callback on that params shape, so failures here
 * warn and deliver an empty detail set (the panel renders "no rows",
 * never hangs on a spinner).
 *
 * ## Data plane
 *
 * The DEFAULT detail read is a keyed single-row read of the hosted
 * table — a transient Perspective view filtered
 * `keyColumn == masterRow[keyColumn]` — so the detail panel always
 * shows the TABLE's current values (post-tick, post-edit,
 * schema-coerced), not the grid block's possibly-older copy.
 *
 * Richer detail sources (a detail table, a per-master breakdown, an
 * unrelated service) plug in via the `detailQuery` hook: it receives
 * the master row and `{ table, keyColumn, key }` and returns the
 * detail rows; the fetcher still owns callback plumbing and error
 * containment.
 */

import type { PullTable } from './types.js';
import { isSsrmServerSideGroup } from './groupRows.js';

/** The connection slice the detail path needs (test seam). */
export interface SsrmDetailConnection {
  openTable(): Promise<PullTable>;
}

export interface SsrmDetailQueryContext {
  /** The hosted Perspective table. */
  table: PullTable;
  /** Row identity — the provider config's `keyColumn`. */
  keyColumn: string;
  /** The master row's key value. */
  key: unknown;
}

/**
 * Custom detail source: master row → detail rows. The default (when
 * omitted) is the keyed single-row read described in the module doc.
 */
export type SsrmDetailQuery = (
  masterRow: Record<string, unknown>,
  context: SsrmDetailQueryContext,
) => Promise<Record<string, unknown>[]>;

/** Structural slice of AG's `GetDetailRowDataParams`. */
export interface SsrmGetDetailParams {
  data?: unknown;
  successCallback(rowData: Record<string, unknown>[]): void;
}

export interface SsrmDetailFetcherOpts {
  connection: SsrmDetailConnection;
  /** Row identity — the provider config's `keyColumn`. */
  keyColumn: string;
  /** Custom detail source; omit for the keyed single-row read. */
  detailQuery?: SsrmDetailQuery;
  warn?: (message: string) => void;
}

/** Keyed single-row read over a TRANSIENT view (the default detail source). */
const singleRowDetailQuery: SsrmDetailQuery = async (_masterRow, { table, keyColumn, key }) => {
  const view = await table.view({
    filter: [[keyColumn, '==', key as string | number | boolean]],
  });
  try {
    return (await view.to_json()) as Record<string, unknown>[];
  } finally {
    void view.delete().catch(() => undefined);
  }
};

/**
 * `detailCellRendererParams.getDetailRowData` for grids served by the
 * pull datasource: fetches the master row's detail on demand (default:
 * keyed single-row table read; override via `detailQuery`). Rows
 * without a key (group rows, malformed data) and failed reads warn and
 * deliver an empty detail set.
 */
export function createSsrmDetailFetcher(
  opts: SsrmDetailFetcherOpts,
): (params: SsrmGetDetailParams) => void {
  const { connection, keyColumn } = opts;
  const warn = opts.warn ?? ((message: string) => console.warn(message));
  const detailQuery = opts.detailQuery ?? singleRowDetailQuery;
  return (params) => {
    const masterRow = (params.data ?? {}) as Record<string, unknown>;
    const key = masterRow[keyColumn];
    if (key === undefined || key === null) {
      warn(`[ssrm-detail] detail refused: master row has no '${keyColumn}' (group row?)`);
      params.successCallback([]);
      return;
    }
    void (async () => {
      const table = await connection.openTable();
      return detailQuery(masterRow, { table, keyColumn, key });
    })().then(
      (rows) => params.successCallback(rows),
      (err: unknown) => {
        warn(
          `[ssrm-detail] detail read failed for ${keyColumn}=${String(key)}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        params.successCallback([]);
      },
    );
  };
}

/**
 * AG `isRowMaster` for grids served by the pull datasource: leaf rows
 * with a key expand into detail; group rows and keyless rows don't.
 */
export function createSsrmRowMasterGetter(keyColumn: string): (data: unknown) => boolean {
  return (data) => {
    if (isSsrmServerSideGroup(data)) return false;
    const key = (data as Record<string, unknown> | null | undefined)?.[keyColumn];
    return key !== undefined && key !== null;
  };
}
