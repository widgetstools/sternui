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
 *      re-snapshots) it refreshes the grid so blocks re-pull; live ticks
 *      apply via `applyServerSideTransactionAsync`.
 *   3. When `aggregations` are supplied, maintains a grand-total pinned
 *      bottom row computed over the FILTERED full dataset in the worker
 *      (re-pulled on filter change, ready, and live ticks).
 *
 * Returns a binding object that plugs straight into `MarketsGrid`'s
 * `serverSide` prop — no other grid wiring needed. See
 * docs/SSRM_WORKER_PLAN.md.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  SsrmDataProvider,
  SSRM_CHILD_COUNT_FIELD,
  type SsrmDatasourceLike,
  type SsrmAggregation,
  type SsrmShapingSpec,
} from '@starui/host-data/runtime';
import { useDataServicesContext } from './DataServicesProvider.js';

/** Minimal structural view of the AG-Grid API this hook touches (no AG-Grid dep). */
interface GridApiLike {
  refreshServerSide?(params?: { route?: readonly string[]; purge?: boolean }): void;
  applyServerSideTransactionAsync?(transaction: { update?: unknown[]; add?: unknown[]; remove?: unknown[] }): void;
  getFilterModel?(): Record<string, unknown>;
  setGridOption?(key: string, value: unknown): void;
  addEventListener?(event: string, listener: () => void): void;
  removeEventListener?(event: string, listener: () => void): void;
  isDestroyed?(): boolean;
}

export interface UseSsrmDataSourceOptions {
  /** Rows per `getRows` block. Default 100. */
  cacheBlockSize?: number;
  /** Async block flush latency. Default 0 (local worker → no need to debounce). */
  blockLoadDebounceMillis?: number;
  /** Pre-allocated row count for the first paint. Optional. */
  serverSideInitialRowCount?: number;
  /**
   * Grand-total columns. When set, the hook maintains a pinned bottom row
   * whose values are computed over the FILTERED full dataset in the
   * worker (one aggregate per column id).
   */
  aggregations?: readonly SsrmAggregation[];
  /** Debounce (ms) for recomputing grand totals on live ticks. Default 300. */
  aggregateDebounceMs?: number;
  /**
   * Worker row-shaping — e.g. calculated columns baked into each block as
   * real fields, so their colDef is a plain `{ field }` with no
   * `valueGetter` and the per-cell cost stays off the UI thread.
   */
  shaping?: SsrmShapingSpec;
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
  /** Reads the worker-computed child count off a group row (for AG-Grid's
   *  `getChildCount` grid option), so grouped rows show "Value (N)". */
  getChildCount(data: unknown): number | undefined;
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

  // Keep the latest aggregation specs in a ref so the stable recompute
  // callback always reads current values without re-subscribing.
  const aggsRef = useRef<readonly SsrmAggregation[] | undefined>(options.aggregations);
  aggsRef.current = options.aggregations;
  const debounceMs = options.aggregateDebounceMs ?? 300;
  const aggTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Shaping config is read through a ref so the datasource stays
  // referentially stable (no grid reset) when only the spec changes.
  const shapingRef = useRef<SsrmShapingSpec | undefined>(options.shaping);
  shapingRef.current = options.shaping;

  const datasource = useMemo(() => {
    if (!providerId) return null;
    return new SsrmDataProvider((request) => {
      const shaping = shapingRef.current;
      return client.query(providerId, shaping ? { ...request, shaping } : request);
    });
  }, [client, providerId]);

  // Recompute grand totals over the filtered full set and push them into
  // the pinned bottom row. No-op when no aggregations are configured.
  const recomputeAggregates = useCallback(() => {
    const api = apiRef.current;
    const specs = aggsRef.current;
    if (!providerId || !api || api.isDestroyed?.() || !specs || specs.length === 0) return;
    const filterModel = api.getFilterModel?.() ?? null;
    client
      .aggregate(providerId, filterModel, specs)
      .then((values) => {
        const live = apiRef.current;
        if (live && !live.isDestroyed?.()) live.setGridOption?.('pinnedBottomRowData', [values]);
      })
      .catch(() => { /* transient — next trigger recomputes */ });
  }, [client, providerId]);

  const scheduleRecompute = useCallback(() => {
    if (aggTimer.current) clearTimeout(aggTimer.current);
    aggTimer.current = setTimeout(() => {
      aggTimer.current = null;
      recomputeAggregates();
    }, debounceMs);
  }, [recomputeAggregates, debounceMs]);

  // Open the control subscription: starts + keeps the provider alive so
  // queries have data, refreshes the grid when ready, and recomputes
  // grand totals on ready + each live tick.
  useEffect(() => {
    if (!providerId || !datasource) return;
    const subId = client.attachControl(providerId, {
      onStatus: (status) => {
        if (status !== 'ready') return;
        const api = apiRef.current;
        if (api && !api.isDestroyed?.()) api.refreshServerSide?.({ purge: true });
        recomputeAggregates();
      },
      // Live ticks: apply the conflated delta to loaded blocks in place.
      // Rows outside loaded blocks are ignored by AG-Grid; new rows and
      // sort-position moves are reconciled on the next refresh (a later
      // phase makes those surgical too — see docs/SSRM_WORKER_PLAN.md).
      onTxn: (rows) => {
        const api = apiRef.current;
        if (rows.length && api && !api.isDestroyed?.()) {
          api.applyServerSideTransactionAsync?.({ update: rows as unknown[] });
        }
        scheduleRecompute();
      },
    });
    return () => {
      client.detach(subId);
      datasource.destroy?.();
      if (aggTimer.current) clearTimeout(aggTimer.current);
    };
  }, [client, providerId, datasource, recomputeAggregates, scheduleRecompute]);

  // Stable handler so it can be removed on teardown.
  const filterChangedRef = useRef<() => void>(() => {});
  filterChangedRef.current = recomputeAggregates;

  const onGridReady = useCallback((api: unknown) => {
    const gridApi = api as GridApiLike;
    apiRef.current = gridApi;
    // Cache may already be warm (a peer window started the provider) —
    // pull the first blocks immediately rather than waiting for a status.
    gridApi.refreshServerSide?.({ purge: true });
    gridApi.addEventListener?.('filterChanged', () => filterChangedRef.current());
    recomputeAggregates();
  }, [recomputeAggregates]);

  const onGridPreDestroyed = useCallback(() => {
    apiRef.current = null;
    if (aggTimer.current) clearTimeout(aggTimer.current);
  }, []);

  const getSetFilterValues = useCallback(
    (colId: string): Promise<unknown[]> =>
      providerId ? client.getSetFilterValues(providerId, colId) : Promise.resolve([]),
    [client, providerId],
  );

  const getChildCount = useCallback((data: unknown): number | undefined => {
    const n = (data as Record<string, unknown> | null | undefined)?.[SSRM_CHILD_COUNT_FIELD];
    return typeof n === 'number' ? n : undefined;
  }, []);

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
      getChildCount,
    };
  }, [
    datasource,
    options.cacheBlockSize,
    options.blockLoadDebounceMillis,
    options.serverSideInitialRowCount,
    onGridReady,
    onGridPreDestroyed,
    getSetFilterValues,
    getChildCount,
  ]);
}
