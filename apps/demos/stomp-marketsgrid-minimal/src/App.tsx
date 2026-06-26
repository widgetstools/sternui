import { useEffect, useMemo, useState } from 'react';
import type { ColDef } from 'ag-grid-community';
import { MarketsGrid, createMarketsGridLocalStorageStorage } from '@starui/grid';
import { useDataServices, useUserIdFromContext } from '@starui/host-data-react/runtime';
import {
  useSsrmDataSource,
  type SsrmAggregation,
  type SsrmShapingSpec,
} from '@starui/host-data-react/runtime';
import {
  stompHistoricalProviderDraft,
  stompProviderDraft,
  STOMP_PROVIDER_CFG_VERSION,
  STOMP_LIVE_PROVIDER_ID,
  STOMP_HISTORICAL_PROVIDER_ID,
  POSITIONS_COLUMN_DEFS,
} from './stompProvider.js';

/**
 * SSRM (Server-Side Row Model) demo.
 *
 * Instead of `HostedMarketsGrid` (which binds the full snapshot to
 * `rowData` on the main thread), this wires the STOMP provider to a
 * plain `<MarketsGrid>` via `useSsrmDataSource(providerId)`. The grid
 * then pulls rows in blocks: all filtering, sorting and paging run in
 * the SharedWorker, off the UI thread — the dataset never crosses to the
 * main thread. See docs/SSRM_WORKER_PLAN.md.
 *
 * Requires the stomp-view-server running (`npm run dev:stomp`) so the
 * worker provider has data to query.
 */

/** Stable empty rowData — SSRM feeds rows via the datasource, not this prop. */
const EMPTY: never[] = [];

/** Persist grid layout/profiles in localStorage (no appId/userId needed). */
const storage = createMarketsGridLocalStorageStorage();

/**
 * Grand-total columns — computed in the worker over the FILTERED full
 * dataset (every matching row, not just the loaded blocks) and shown in
 * a pinned bottom row. Sums for money/P&L, averages for price/yield.
 */
/**
 * Calculated column baked in the worker: `Total PnL = realized +
 * unrealized`. The value is written onto each row by the worker, so its
 * colDef below is a plain `{ field: 'totalPnl' }` — NO `valueGetter`, so
 * the per-cell expression cost never touches the UI thread. (Phase 1
 * shaping bakes the block after filter/sort, so calc columns are
 * display-only — not yet sortable/filterable.)
 */
const SHAPING: SsrmShapingSpec = {
  calcColumns: [{ field: 'totalPnl', expression: '[realizedPnl] + [unrealizedPnl]' }],
};

const AGGREGATIONS: SsrmAggregation[] = [
  { colId: 'notionalAmount', func: 'sum' },
  { colId: 'marketValue', func: 'sum' },
  { colId: 'pnl', func: 'sum' },
  { colId: 'unrealizedPnl', func: 'sum' },
  { colId: 'realizedPnl', func: 'sum' },
  { colId: 'dailyPnl', func: 'sum' },
  { colId: 'currentPrice', func: 'avg' },
  { colId: 'yield', func: 'avg' },
  { colId: 'spread', func: 'avg' },
];

export function App() {
  const { configStore } = useDataServices();
  const userId = useUserIdFromContext();

  const [providerId, setProviderId] = useState<string | null>(null);

  // Seed the catalog rows so the worker can start the STOMP provider on
  // the SSRM `control` attach. (Same idempotent seeding as the hosted
  // demo — both live + historical rows; SSRM here uses the live one.)
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const rows = await configStore.list(userId, { subtype: 'stomp' });
      const liveExists = rows.some((p) => p.providerId === STOMP_LIVE_PROVIDER_ID);
      const histExists = rows.some((p) => p.providerId === STOMP_HISTORICAL_PROVIDER_ID);

      const storedVersion = localStorage.getItem('stomp-marketsgrid-minimal.stomp-cfg-version');
      const shouldRefresh = storedVersion !== String(STOMP_PROVIDER_CFG_VERSION);

      if (shouldRefresh || !liveExists) await configStore.save(stompProviderDraft, userId);
      if (shouldRefresh || !histExists) await configStore.save(stompHistoricalProviderDraft, userId);

      if (shouldRefresh) {
        localStorage.setItem(
          'stomp-marketsgrid-minimal.stomp-cfg-version',
          String(STOMP_PROVIDER_CFG_VERSION),
        );
      }

      if (!cancelled) setProviderId(STOMP_LIVE_PROVIDER_ID);
    })();
    return () => { cancelled = true; };
  }, [configStore, userId]);

  // SSRM binding — turns each grid block request into a worker `query`
  // RPC and keeps the provider running via a `control` subscription.
  const serverSide = useSsrmDataSource(providerId, {
    cacheBlockSize: 200,
    aggregations: AGGREGATIONS,
    shaping: SHAPING,
  });

  // Categorical columns get a set filter whose options come from the
  // worker's distinct-values index over the FULL cache (not just loaded
  // rows) — see useSsrmDataSource.getSetFilterValues.
  const getSetFilterValues = serverSide?.getSetFilterValues;
  const columnDefs = useMemo<ColDef[]>(() => {
    const base = POSITIONS_COLUMN_DEFS as unknown as ColDef[];
    const SET_FILTER_FIELDS = new Set([
      'instrumentType', 'bookName', 'portfolio', 'trader', 'desk', 'region',
      'country', 'rating.moody', 'rating.sp', 'rating.fitch',
    ]);
    const withFilters = getSetFilterValues
      ? base.map((col) => {
          const field = col.field;
          if (!field || !SET_FILTER_FIELDS.has(field)) return col;
          return {
            ...col,
            filter: 'agSetColumnFilter',
            filterParams: {
              values: (p: { success: (values: unknown[]) => void }) => {
                void getSetFilterValues(field).then((values) => p.success(values));
              },
            },
          } as ColDef;
        })
      : base;
    // Worker-baked calc column — plain field read, no valueGetter.
    // Display-only for now (shaped after filter/sort).
    const calc: ColDef = {
      field: 'totalPnl',
      headerName: 'Total PnL',
      cellDataType: 'number',
      sortable: false,
      filter: false,
      resizable: true,
    };
    return [...withFilters, calc];
  }, [getSetFilterValues]);

  if (!providerId || !serverSide) return null;

  return (
    <MarketsGrid
      gridId="stomp-blotter-ssrm"
      componentName="STOMP Positions (SSRM)"
      columnDefs={columnDefs}
      rowData={EMPTY}
      rowIdField="positionId"
      serverSide={serverSide}
      storage={storage}
      showFiltersToolbar
      showFormattingToolbar
    />
  );
}
