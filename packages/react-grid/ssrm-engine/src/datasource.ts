import type { SsrmEngine } from './engine.js';
import type { SsrmGetRowsRequest, SsrmRow } from './types.js';

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
  success(result: {
    rowData: SsrmRow[];
    rowCount: number;
    /**
     * Pivot mode only. AG builds its secondary columns from these, so DROPPING
     * them is silent: the rows arrive carrying pivoted cells that no column
     * renders, and the grid shows a correct group hierarchy with nothing in it.
     * That is exactly what this adapter did until the browser probe reported
     * "8 rows · 0 generated columns" — the engine had produced the fields all
     * along and the boundary was throwing them away.
     */
    pivotResultFields?: string[];
    /**
     * The pinned grand total row, on a ROOT block only.
     *
     * AG CREATES that row from this and does not UPDATE it — five fresh totals
     * over five non-purging refreshes left the row showing the first. Keeping
     * it live needs the other documented path, a transaction whose row id is
     * the grand total's, so both are needed and they answer different moments.
     * See `rowEngine.ts`.
     */
    grandTotalData?: Record<string, unknown>;
  }): void;
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
      const succeed = (result: {
        rowData: SsrmRow[];
        rowCount: number;
        pivotResultFields?: string[];
      }) => {
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
        succeed({
          rowData: result.rowData,
          rowCount: result.rowCount,
          ...(result.pivotResultFields ? { pivotResultFields: result.pivotResultFields } : {}),
        });
      } catch (error) {
        giveUp(error);
      }
    },
  };
}

/**
 * Row identity for AG — ONE definition, and it lives in `rowId.ts`.
 *
 * Re-exported from here because this module is where the AG boundary is and
 * every existing caller imports it from here. It used to be a SECOND definition
 * (group path with a `g:` prefix, a bare leaf key) while the MarketsGrid surface
 * carried its own — so the fuzz tested a spelling the product does not use. See
 * `rowId.ts` for what that cost.
 */
export { makeSsrmGetRowId } from './rowId.js';
