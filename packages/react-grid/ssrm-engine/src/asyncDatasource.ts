/**
 * The AG boundary when the book is in a worker.
 *
 * `createSsrmDatasource` calls a synchronous engine and can only leak a request
 * by throwing. This one awaits a port, and that changes what RULE 1 is worth.
 *
 * **RULE 1 — every `getRows` settles exactly once.** AG's `outboundRequests` is
 * grid-global, decremented only in `success`/`fail`, default limit 2. Against a
 * synchronous engine a leak needed a bug; across a port a leak needs only a
 * worker that is busy, gone, or wrong — and the grid it wedges does not recover
 * on a purge, a sort, or a filter change. Two of them and the surface is dead
 * until reload.
 *
 * So there are two independent timers, and the redundancy is deliberate:
 *
 * - the RPC client's timeout rejects the CALL, names the method, and is the
 *   path a real worker stall takes;
 * - the latch below fails the BLOCK regardless of what the layer above it did.
 *   It is what makes the rule hold against a bug in the RPC layer itself — a
 *   handler that never settles, a promise that is never returned. It is set
 *   longer than the RPC timeout so the named error is what a user normally
 *   sees.
 *
 * A timeout that FAILS is strictly better than one that waits. AG paints a
 * failed block and the user can scroll off it; a pending one takes the grid
 * with it. The hand-rolled engine evaluated here in July had no timeout at all,
 * and that was filed as exactly this defect class.
 */
import type { SsrmDatasourceLike, SsrmGetRowsParamsLike } from './datasource.js';
import type { SsrmGetRowsRequest, SsrmGetRowsResult } from './types.js';

/** Anything that can answer a block. The worker client is the one that does. */
export interface AsyncSsrmSource {
  getRows(request: SsrmGetRowsRequest): Promise<SsrmGetRowsResult>;
}

export interface AsyncSsrmDatasourceOptions {
  /**
   * The block latch. Deliberately longer than the RPC timeout beneath it, and
   * enormous next to a measured block read of single-digit milliseconds: this
   * is not a latency budget, it is the line past which a reply is treated as
   * lost. AG never retries a block it was told failed, so it must not be tight.
   */
  timeoutMs?: number;
  onError?(error: unknown, request: SsrmGetRowsRequest): void;
  /** Level totals, for a host driving a pinned grand-total row. */
  onLevelTotals?(totals: Record<string, unknown>, request: SsrmGetRowsRequest): void;
  /**
   * End-to-end cost of one block, measured at the boundary AG actually waits
   * on: entry to `getRows` until `success`/`fail`. The difference between this
   * and the in-process figure IS the worker boundary — which is the number
   * that decides whether hosting the book elsewhere was worth it.
   */
  onBlock?(ms: number, outcome: 'ok' | 'fail', request: SsrmGetRowsRequest): void;
}

export const SSRM_BLOCK_TIMEOUT_MS = 20_000;

export function createAsyncSsrmDatasource(
  source: AsyncSsrmSource,
  options: AsyncSsrmDatasourceOptions = {},
): SsrmDatasourceLike {
  const timeoutMs = options.timeoutMs ?? SSRM_BLOCK_TIMEOUT_MS;

  return {
    getRows(params: SsrmGetRowsParamsLike) {
      const started = now();
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;

      const succeed = (result: SsrmGetRowsResult) => {
        if (settled) return;
        settled = true;
        if (timer !== undefined) clearTimeout(timer);
        options.onBlock?.(now() - started, 'ok', params.request);
        params.success({
          rowData: result.rowData,
          rowCount: result.rowCount,
          ...(result.pivotResultFields ? { pivotResultFields: result.pivotResultFields } : {}),
        });
      };

      const giveUp = (error: unknown) => {
        if (settled) return;
        settled = true;
        if (timer !== undefined) clearTimeout(timer);
        options.onBlock?.(now() - started, 'fail', params.request);
        options.onError?.(error, params.request);
        params.fail();
      };

      timer = setTimeout(
        () => giveUp(new Error(`ssrm block did not settle within ${timeoutMs} ms`)),
        timeoutMs,
      );

      try {
        source.getRows(params.request).then((result) => {
          // Totals before the success call: a host that drives its grand-total
          // row from here should have it in hand by the time AG paints.
          if (result.groupLevelInfo) options.onLevelTotals?.(result.groupLevelInfo, params.request);
          succeed(result);
        }, giveUp);
      } catch (error) {
        // A source that throws SYNCHRONOUSLY rather than rejecting. Rare, and
        // exactly the shape that leaks a request if it is not caught here.
        giveUp(error);
      }
    },
  };
}

function now(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}
