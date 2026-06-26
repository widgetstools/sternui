/**
 * useSsrmDataSource — wires a SharedWorker-backed provider to an
 * AG-Grid Server-Side Row Model grid (e.g. `<MarketsGrid serverSide={…}>`).
 *
 * What it does:
 *   1. Builds an {@link SsrmDataProvider} whose `getRows` turns every
 *      block request into a worker `query` RPC — filter/sort/paginate
 *      run off the UI thread.
 *   2. Opens a `control` subscription so the worker starts and keeps the
 *      provider running (its cache feeds the queries) WITHOUT streaming
 *      the dataset to this window. When the provider reaches `ready` (or
 *      re-snapshots) it refreshes the grid so blocks re-pull.
 *
 * Returns a binding object that plugs straight into `MarketsGrid`'s
 * `serverSide` prop — no other grid wiring needed. See
 * docs/SSRM_WORKER_PLAN.md.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { SsrmDataProvider, type SsrmDatasourceLike } from '@starui/host-data/runtime';
import { useDataServicesContext } from './DataServicesProvider.js';

/** Minimal structural view of the AG-Grid API this hook touches (no AG-Grid dep). */
interface GridApiLike {
  refreshServerSide?(params?: { route?: readonly string[]; purge?: boolean }): void;
  applyServerSideTransactionAsync?(transaction: { update?: unknown[]; add?: unknown[]; remove?: unknown[] }): void;
  isDestroyed?(): boolean;
}

export interface UseSsrmDataSourceOptions {
  /** Rows per `getRows` block. Default 100. */
  cacheBlockSize?: number;
  /** Async block flush latency. Default 0 (local worker → no need to debounce). */
  blockLoadDebounceMillis?: number;
  /** Pre-allocated row count for the first paint. Optional. */
  serverSideInitialRowCount?: number;
}

/**
 * Binding consumed by `MarketsGrid`'s `serverSide` prop. The grid merges
 * these into its construction-time grid options and invokes the
 * lifecycle callbacks. Structural — `MarketsGrid` accepts any object of
 * this shape, so no cross-package type import is required.
 */
export interface SsrmGridBinding {
  rowModelType: 'serverSide';
  serverSideDatasource: SsrmDatasourceLike;
  cacheBlockSize?: number;
  blockLoadDebounceMillis?: number;
  serverSideInitialRowCount?: number;
  /** Called by the grid host inside its `onGridReady`. */
  onGridReady?(api: unknown): void;
  /** Called by the grid host inside its `onGridPreDestroyed`. */
  onGridPreDestroyed?(): void;
  /**
   * Distinct values of a column across the FULL worker cache — wire into
   * an SSRM set filter's async `values` callback:
   * `filterParams: { values: (p) => binding.getSetFilterValues(colId).then(p.success) }`.
   */
  getSetFilterValues(colId: string): Promise<unknown[]>;
}

export function useSsrmDataSource(
  providerId: string | null | undefined,
  options: UseSsrmDataSourceOptions = {},
): SsrmGridBinding | null {
  const { client } = useDataServicesContext();
  const apiRef = useRef<GridApiLike | null>(null);

  const datasource = useMemo(() => {
    if (!providerId) return null;
    return new SsrmDataProvider((request) => client.query(providerId, request));
  }, [client, providerId]);

  // Open the control subscription: starts + keeps the provider alive so
  // queries have data, and refreshes the grid when the cache is ready.
  useEffect(() => {
    if (!providerId || !datasource) return;
    const subId = client.attachControl(providerId, {
      onStatus: (status) => {
        if (status !== 'ready') return;
        const api = apiRef.current;
        if (api && !api.isDestroyed?.()) api.refreshServerSide?.({ purge: true });
      },
      // Live ticks: apply the conflated delta to loaded blocks in place.
      // Rows outside loaded blocks are ignored by AG-Grid; new rows and
      // sort-position moves are reconciled on the next refresh (a later
      // phase makes those surgical too — see docs/SSRM_WORKER_PLAN.md).
      onTxn: (rows) => {
        const api = apiRef.current;
        if (!rows.length || !api || api.isDestroyed?.()) return;
        api.applyServerSideTransactionAsync?.({ update: rows as unknown[] });
      },
    });
    return () => {
      client.detach(subId);
      datasource.destroy?.();
    };
  }, [client, providerId, datasource]);

  const onGridReady = useCallback((api: unknown) => {
    apiRef.current = api as GridApiLike;
    // Cache may already be warm (a peer window started the provider) —
    // pull the first blocks immediately rather than waiting for a status.
    (api as GridApiLike).refreshServerSide?.({ purge: true });
  }, []);

  const onGridPreDestroyed = useCallback(() => {
    apiRef.current = null;
  }, []);

  const getSetFilterValues = useCallback(
    (colId: string): Promise<unknown[]> =>
      providerId ? client.getSetFilterValues(providerId, colId) : Promise.resolve([]),
    [client, providerId],
  );

  return useMemo(() => {
    if (!datasource) return null;
    return {
      rowModelType: 'serverSide',
      serverSideDatasource: datasource,
      cacheBlockSize: options.cacheBlockSize ?? 100,
      blockLoadDebounceMillis: options.blockLoadDebounceMillis ?? 0,
      serverSideInitialRowCount: options.serverSideInitialRowCount,
      onGridReady,
      onGridPreDestroyed,
      getSetFilterValues,
    };
  }, [
    datasource,
    options.cacheBlockSize,
    options.blockLoadDebounceMillis,
    options.serverSideInitialRowCount,
    onGridReady,
    onGridPreDestroyed,
    getSetFilterValues,
  ]);
}
