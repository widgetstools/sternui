import type { SsrmEngine } from './engine.js';
import {
  SSRM_GROUP_FLAG,
  SSRM_GROUP_PATH,
  type SsrmGetRowsRequest,
  type SsrmRow,
} from './types.js';

/**
 * The boundary between the engine and AG Grid.
 *
 * The engine is synchronous and cannot leak a request; AG's datasource callback
 * can, and that is the one rule that has to live here rather than inside:
 *
 * **RULE 1 — every `getRows` settles exactly once.** AG's `outboundRequests` is
 * grid-global, decremented only in `success`/`fail`, and its default limit is 2.
 * Two leaked calls wedge the grid permanently and no purge recovers it. Hence
 * the `settled` latch below and the try/catch that guarantees a `fail()` on any
 * throw — a datasource that throws without calling back is a leaked request.
 */

/** The subset of AG's `IServerSideGetRowsParams` this needs. */
export interface SsrmGetRowsParamsLike {
  request: SsrmGetRowsRequest;
  success(result: { rowData: SsrmRow[]; rowCount: number }): void;
  fail(): void;
}

export interface SsrmDatasourceLike {
  getRows(params: SsrmGetRowsParamsLike): void;
}

export interface SsrmDatasourceOptions {
  /** Reported when a block cannot be served. AG never retries one on its own. */
  onError?(error: unknown): void;
  /**
   * Called with the totals for the level a block came from, so a host can drive
   * a pinned grand-total row. AG's `grandTotalRow` creates that row but will
   * not refresh it — that needs a transaction keyed on its row id.
   */
  onLevelTotals?(totals: Record<string, unknown>, request: SsrmGetRowsRequest): void;
}

export function createSsrmDatasource(
  engine: SsrmEngine,
  options: SsrmDatasourceOptions = {},
): SsrmDatasourceLike {
  return {
    getRows(params) {
      let settled = false;
      const succeed = (result: { rowData: SsrmRow[]; rowCount: number }) => {
        if (settled) return;
        settled = true;
        params.success(result);
      };
      const giveUp = (error: unknown) => {
        if (settled) return;
        settled = true;
        options.onError?.(error);
        params.fail();
      };

      try {
        const result = engine.getRows(params.request);
        if (result.groupLevelInfo) options.onLevelTotals?.(result.groupLevelInfo, params.request);
        succeed({ rowData: result.rowData, rowCount: result.rowCount });
      } catch (error) {
        giveUp(error);
      }
    },
  };
}

/**
 * Row identity for AG.
 *
 * **RULE 3 — a group row is identified by its PATH, not a leaf key.** Group rows
 * carry no key column of their own, so an id derived from one collides across
 * every group at a level, and duplicate ids make AG DISCARD the block (warn 205)
 * rather than warn visibly. The engine stamps the full path on; this reads it.
 */
export function makeSsrmGetRowId(keyField: string) {
  return (params: { data: SsrmRow }): string => {
    const row = params.data;
    const path = row[SSRM_GROUP_PATH];
    if (row[SSRM_GROUP_FLAG] === true && Array.isArray(path)) {
      return `g:${path.map((k) => (k === null || k === undefined ? '' : String(k))).join('/')}`;
    }
    return String(row[keyField]);
  };
}
