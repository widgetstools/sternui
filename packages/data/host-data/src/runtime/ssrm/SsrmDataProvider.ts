/**
 * Client-side SSRM datasource — a vanilla TS class with no AG-Grid or
 * React import. It implements the structural shape AG-Grid's
 * `IServerSideDatasource` requires (`getRows` + optional `destroy`), so
 * it can be handed straight to a grid's `serverSideDatasource` option,
 * but it stays framework-agnostic: all it does is turn each block
 * request into a worker `query` RPC and resolve `success` / `fail`.
 *
 * Data shaping, filtering, sorting and counting all happen in the
 * worker — this class only moves a request across the wire and a block
 * of already-shaped rows back.
 */

import type { SsrmGetRowsRequest, SsrmQueryResult } from './types.js';

/** Structural mirror of AG-Grid `IServerSideGetRowsParams` (no AG-Grid dep). */
export interface SsrmGetRowsParamsLike {
  request: SsrmGetRowsRequest;
  success(result: { rowData: unknown[]; rowCount?: number }): void;
  fail(): void;
}

/** Structural mirror of AG-Grid `IServerSideDatasource`. */
export interface SsrmDatasourceLike {
  getRows(params: SsrmGetRowsParamsLike): void;
  destroy?(): void;
}

/** Fetches one block from the worker. Injected so this class never
 *  imports the transport client directly. */
export type SsrmFetchBlock = (request: SsrmGetRowsRequest) => Promise<SsrmQueryResult>;

export class SsrmDataProvider implements SsrmDatasourceLike {
  private destroyed = false;

  constructor(private readonly fetchBlock: SsrmFetchBlock) {}

  getRows(params: SsrmGetRowsParamsLike): void {
    this.fetchBlock(params.request)
      .then((result) => {
        if (this.destroyed) return;
        if (result.error) {
          params.fail();
          return;
        }
        params.success({ rowData: result.rows, rowCount: result.lastRow });
      })
      .catch(() => {
        if (!this.destroyed) params.fail();
      });
  }

  destroy(): void {
    this.destroyed = true;
  }
}
