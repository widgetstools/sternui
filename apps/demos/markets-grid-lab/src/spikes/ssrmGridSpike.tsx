/**
 * SSRM STOMP provider V2 — P2/P3/P4a grid consumer spike (served at
 * /spikes/ssrmGrid.html, driven by Playwright).
 *
 * A real AG Grid (enterprise, serverSide row model) reads THE hosted
 * Perspective table through `@starui/ssrm-grid/pull`:
 * `connectSsrmProvider` (control + direct Perspective client on the
 * provider SharedWorker) + `createSsrmPullDatasource` (viewport block
 * LRU, serve-then-refresh, tick patches via keyed transactions).
 *
 * P3: the config comes FROM the provider catalog. The spike seeds a
 * `StompSsrmProviderConfig` row through `DataProviderConfigStore`
 * (exactly like the other demos' ensure*Provider helpers), reads it
 * back, validates it, and maps it with `toSsrmDatasetConfig` — the
 * row's `columnDefinitions` are the SINGLE declaration driving both
 * the worker's table schema and the grid columns below.
 *
 * P4a adds the query-feature-parity surface: row grouping (multi-level
 * capable) with live group-header aggregates + child counts, AG's
 * native `grandTotalRow: 'bottom'` fed by the datasource's rollup
 * reads, a set filter on `bookName` backed by `getDistinctValues`, and
 * a quick-filter box (design-system Input) folded into the query plan.
 *
 * Mount-once contract: the grid mounts only once DatasetState is
 * known, keyed by `(providerId, generation)` — a restart bumps the
 * generation and REMOUNTS the grid; loading/empty/error are rendered
 * from DatasetState as plain text. Probes: `window.__ssrmGridSpike`.
 */

import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AgGridReact } from 'ag-grid-react';
import {
  ColumnApiModule,
  ModuleRegistry,
  RenderApiModule,
  RowApiModule,
  type ColDef,
  type GridApi,
  type SetFilterValuesFuncParams,
} from 'ag-grid-community';
import '@starui/ssrm-grid/ag-grid-modules';

// The shared ssrm-grid registration covers the grid itself; the spike's
// probe surface additionally reads rows/columns through the api, and the
// datasource's live grand-total patch needs getRowNode + refreshCells.
ModuleRegistry.registerModules([RowApiModule, ColumnApiModule, RenderApiModule]);
import {
  CHILD_COUNT_FIELD,
  connectSsrmProvider,
  createSsrmPullDatasource,
  createSsrmRowIdGetter,
  toSsrmDatasetConfig,
  type DatasetStateSnapshot,
  type SsrmProviderConnection,
  type SsrmPullDatasource,
  type StompSsrmProviderConfig,
} from '@starui/ssrm-grid/pull';
import { Input } from '@starui/ui';
import { createConfigManager } from '@starui/host-config';
import { DataProviderConfigStore } from '@starui/host-data/runtime';
import { validateStompSsrmConfig, type ColumnDefinition, type DataProviderConfig } from '@starui/types';
import SSRM_WORKER_URL from '@starui/host-data/assets/data-services-ssrm-worker.mjs?url';
import SERVER_WASM_URL from '@finos/perspective/dist/wasm/perspective-server.wasm?url';
import CLIENT_WASM_URL from '@finos/perspective/dist/wasm/perspective-js.wasm?url';

// ─── scenario config (URL-tunable, mirrors the P1 spike) ───────────

const APP_ID = 'markets-grid-lab';
const USER_ID = 'dev1';
const PROVIDER_NAME = 'positions-ssrm-grid-spike';
const CLIENT_TAG = 'GRID1';

const params = new URLSearchParams(window.location.search);
const SNAPSHOT_ROWS = Number(params.get('rows') ?? 20_000);
const TICK_RATE = Number(params.get('rate') ?? 5); // ticks/sec
const UPDATES_PER_TICK = Number(params.get('upt') ?? 500);

/** The catalog draft — ONE declaration of transport + schema + columns. */
function buildProviderDraft(): DataProviderConfig {
  const config: StompSsrmProviderConfig = {
    providerType: 'stomp-ssrm',
    websocketUrl: 'ws://localhost:8081',
    listenerTopic: `/snapshot/positions/${CLIENT_TAG}`,
    requestMessage: `/snapshot/positions/${CLIENT_TAG}/${TICK_RATE}/1000`,
    requestBody: '',
    requestHeaders: {
      'snapshot-rows': String(SNAPSHOT_ROWS),
      'updates-per-tick': String(UPDATES_PER_TICK),
    },
    snapshotEndToken: 'Success',
    keyColumn: 'positionId',
    tableName: 'positions',
    columnDefinitions: [
      { field: 'positionId', headerName: 'Position', cellDataType: 'text' },
      { field: 'cusip', headerName: 'CUSIP', cellDataType: 'text' },
      { field: 'bookName', headerName: 'Book', cellDataType: 'text' },
      { field: 'trader', headerName: 'Trader', cellDataType: 'text' },
      { field: 'quantity', headerName: 'Quantity', cellDataType: 'number' },
      { field: 'marketValue', headerName: 'Market Value', cellDataType: 'number' },
      { field: 'currentPrice', headerName: 'Price', cellDataType: 'number' },
      { field: 'pnl', headerName: 'PnL', cellDataType: 'number' },
    ],
  };
  return {
    name: PROVIDER_NAME,
    description: 'SSRM V2 grid spike — seeded programmatically',
    providerType: 'stomp-ssrm',
    config,
    userId: USER_ID,
    public: false,
  };
}

/**
 * Seed (or refresh — the URL knobs must take effect on every load) the
 * catalog row and read it BACK from the store, so what drives the
 * worker is what a real consumer would load, not the in-memory draft.
 */
async function loadSeededProvider(): Promise<{
  providerId: string;
  config: StompSsrmProviderConfig;
}> {
  const cm = createConfigManager({ appId: APP_ID });
  await cm.init();
  const store = new DataProviderConfigStore(cm);

  const existing = (await store.list(USER_ID, { subtype: 'stomp-ssrm' })).find(
    (p) => p.name === PROVIDER_NAME,
  );
  const draft = buildProviderDraft();
  const saved = await store.save(
    existing?.providerId ? { ...draft, providerId: existing.providerId } : draft,
    USER_ID,
  );
  if (!saved.providerId) throw new Error('provider save did not return a providerId');

  const row = await store.get(saved.providerId);
  if (!row || row.providerType !== 'stomp-ssrm') {
    throw new Error(`catalog round-trip failed for ${saved.providerId}`);
  }
  const config = row.config as StompSsrmProviderConfig;
  const issues = validateStompSsrmConfig(config);
  if (issues.length > 0) {
    throw new Error(`invalid stomp-ssrm config: ${issues.map((i) => i.message).join('; ')}`);
  }
  return { providerId: saved.providerId, config };
}

/** Grid columns derived from the SAME declaration the table schema uses. */
function toColDefs(columns: readonly ColumnDefinition[] | undefined): ColDef[] {
  return (columns ?? []).map((c): ColDef => {
    const numeric = c.cellDataType === 'number';
    const def: ColDef = {
      field: c.field,
      headerName: c.headerName,
      filter: numeric ? 'agNumberColumnFilter' : 'agTextColumnFilter',
      enableRowGroup: !numeric,
      enableValue: numeric,
    };
    if (c.field === 'bookName') {
      // P4a: set filter fed by the datasource's distinct-values read.
      def.filter = 'agSetColumnFilter';
      def.filterParams = {
        values: (p: SetFilterValuesFuncParams) => {
          const ds = window.__ssrmGridSpike.datasource;
          if (!ds) {
            p.success([]);
            return;
          }
          void ds
            .getDistinctValues('bookName')
            .then((vals) => p.success(vals.map((v) => (v == null ? null : String(v)))))
            .catch(() => p.success([]));
        },
      };
    }
    return def;
  });
}

// ─── probe surface ──────────────────────────────────────────────────

interface TimelineEntry extends DatasetStateSnapshot {
  at: number;
}

interface SsrmGridSpikeProbes {
  timeline: TimelineEntry[];
  mounts: number;
  api: GridApi | null;
  /** P4a — the live datasource (quick filter / distinct values). */
  datasource: SsrmPullDatasource | null;
  /** P3 — the seeded catalog row driving the whole path. */
  catalog: { providerId: string; name: string } | null;
  state: () => DatasetStateSnapshot | null;
  displayedRowCount: () => number;
  viewportColumn: (colId: string, n?: number) => unknown[];
  sortBy: (colId: string, dir: 'asc' | 'desc' | null) => void;
  /** P4a — group by a column (sum PnL/MV ride along); null clears. */
  groupBy: (colId: string | null) => void;
  /** P4a — displayed row data + group metadata at an index. */
  displayedRow: (i: number) => Record<string, unknown> | null;
  /** P4a — expand/collapse the displayed row at an index. */
  expandDisplayedRow: (i: number, expanded: boolean) => void;
  /** P4a — the grand-total row's current data (null until present). */
  grandTotalData: () => Record<string, unknown> | null;
  setFilterModel: (model: Record<string, unknown> | null) => void;
  setQuickFilter: (text: string | null) => void;
  getDistinctValues: (field: string) => Promise<unknown[]>;
  /**
   * CONTROL read for filter probes: row count of a transient
   * Perspective view with NATIVE clauses, straight off the hosted
   * table — bypasses AG, the filter mapping and the datasource.
   */
  countRows: (filter: Array<[string, string, unknown]>) => Promise<number>;
  loadingRowCount: () => number;
  loadingOverlayVisible: () => boolean;
  restart: () => Promise<DatasetStateSnapshot>;
}

declare global {
  interface Window {
    __ssrmGridSpike: SsrmGridSpikeProbes;
  }
}

// ─── grid host (one mount per generation) ───────────────────────────

function GridHost({
  connection,
  generation,
  keyColumn,
  columnDefs,
  quickFilterColumns,
}: {
  connection: SsrmProviderConnection;
  generation: number;
  keyColumn: string;
  columnDefs: ColDef[];
  quickFilterColumns: string[];
}): React.JSX.Element {
  const datasource = useMemo(
    () => createSsrmPullDatasource({ connection, keyColumn, quickFilterColumns }),
    [connection, generation, keyColumn, quickFilterColumns],
  );
  const getRowId = useMemo(() => createSsrmRowIdGetter(keyColumn), [keyColumn]);
  useEffect(() => {
    window.__ssrmGridSpike.mounts += 1;
    window.__ssrmGridSpike.datasource = datasource;
    return () => {
      if (window.__ssrmGridSpike.datasource === datasource) {
        window.__ssrmGridSpike.datasource = null;
      }
      datasource.destroy();
    };
  }, [datasource]);

  return (
    <AgGridReact
      rowModelType="serverSide"
      serverSideDatasource={datasource}
      cacheBlockSize={100}
      maxBlocksInCache={10}
      columnDefs={columnDefs}
      defaultColDef={{ sortable: true, resizable: true, enableCellChangeFlash: true }}
      autoGroupColumnDef={{ headerName: 'Group', minWidth: 220 }}
      grandTotalRow="bottom"
      suppressAggFuncInHeader
      getChildCount={(data) =>
        (data as Record<string, unknown> | undefined)?.[CHILD_COUNT_FIELD] as number
      }
      getRowId={getRowId}
      onGridReady={(event) => {
        window.__ssrmGridSpike.api = event.api;
      }}
      onGridPreDestroyed={() => {
        window.__ssrmGridSpike.api = null;
      }}
    />
  );
}

function App({
  connection,
  providerId,
  keyColumn,
  columnDefs,
  quickFilterColumns,
}: {
  connection: SsrmProviderConnection;
  providerId: string;
  keyColumn: string;
  columnDefs: ColDef[];
  quickFilterColumns: string[];
}): React.JSX.Element {
  const [state, setState] = useState<DatasetStateSnapshot | null>(connection.state);
  useEffect(() => connection.onState(setState), [connection]);

  if (!state || state.phase === 'connecting') {
    return <div data-phase={state?.phase ?? 'unknown'}>connecting to the SSRM provider…</div>;
  }
  if (state.phase === 'error') {
    return <div data-phase="error">dataset error: {state.error}</div>;
  }
  if (state.phase === 'empty') {
    return <div data-phase="empty">dataset is empty (0 rows)</div>;
  }
  return (
    <div data-phase={state.phase} style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: 4 }}>
        <Input
          data-testid="quick-filter"
          placeholder="Quick filter…"
          onChange={(e) => window.__ssrmGridSpike.setQuickFilter(e.target.value)}
        />
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <GridHost
          key={`${providerId}:${state.generation}`}
          connection={connection}
          generation={state.generation}
          keyColumn={keyColumn}
          columnDefs={columnDefs}
          quickFilterColumns={quickFilterColumns}
        />
      </div>
    </div>
  );
}

// ─── boot ───────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const timeline: TimelineEntry[] = [];
  window.__ssrmGridSpike = {
    timeline,
    mounts: 0,
    api: null,
    datasource: null,
    catalog: null,
    state: () => null,
    displayedRowCount: () => window.__ssrmGridSpike.api?.getDisplayedRowCount() ?? -1,
    viewportColumn: (colId, n = 10) => {
      const api = window.__ssrmGridSpike.api;
      if (!api) return [];
      const out: unknown[] = [];
      for (let i = 0; i < n; i += 1) {
        const data = api.getDisplayedRowAtIndex(i)?.data as Record<string, unknown> | undefined;
        out.push(data?.[colId]);
      }
      return out;
    },
    sortBy: (colId, dir) => {
      window.__ssrmGridSpike.api?.applyColumnState({
        state: [{ colId, sort: dir }],
        defaultState: { sort: null },
      });
    },
    groupBy: (colId) => {
      const api = window.__ssrmGridSpike.api;
      if (!api) return;
      api.applyColumnState({
        state:
          colId === null
            ? []
            : [
                { colId, rowGroup: true },
                { colId: 'pnl', aggFunc: 'sum' },
                { colId: 'marketValue', aggFunc: 'sum' },
              ],
        defaultState: { rowGroup: false, aggFunc: null },
      });
    },
    displayedRow: (i) => {
      const node = window.__ssrmGridSpike.api?.getDisplayedRowAtIndex(i);
      if (!node) return null;
      return {
        ...(node.data as Record<string, unknown> | undefined),
        __group: node.group ?? false,
        __expanded: node.expanded ?? false,
        __key: node.key,
      };
    },
    expandDisplayedRow: (i, expanded) => {
      window.__ssrmGridSpike.api?.getDisplayedRowAtIndex(i)?.setExpanded(expanded);
    },
    grandTotalData: () => {
      const api = window.__ssrmGridSpike.api;
      if (!api) return null;
      const node = api.getRowNode('rowGroupFooter_ROOT_NODE_ID');
      return (node?.data as Record<string, unknown> | undefined) ?? null;
    },
    setFilterModel: (model) => {
      void window.__ssrmGridSpike.api?.setFilterModel(model as never);
    },
    setQuickFilter: (text) => {
      window.__ssrmGridSpike.datasource?.setQuickFilter(text);
    },
    getDistinctValues: (field) =>
      window.__ssrmGridSpike.datasource?.getDistinctValues(field) ?? Promise.resolve([]),
    countRows: () => Promise.reject(new Error('not connected yet')),
    loadingRowCount: () =>
      document.querySelectorAll('.ag-row-loading').length +
      document.querySelectorAll('.ag-loading').length,
    loadingOverlayVisible: () => document.querySelector('.ag-overlay-loading-center') !== null,
    restart: () => Promise.reject(new Error('not connected yet')),
  };

  // P3 seam: catalog row → validated config → worker config.
  const { providerId, config } = await loadSeededProvider();
  window.__ssrmGridSpike.catalog = { providerId, name: PROVIDER_NAME };

  const connection = await connectSsrmProvider({
    appId: APP_ID,
    providerId,
    workerUrl: SSRM_WORKER_URL,
    config: toSsrmDatasetConfig(config),
    wasm: { clientWasmUrl: CLIENT_WASM_URL, serverWasmUrl: SERVER_WASM_URL },
  });
  connection.onState((state) => {
    timeline.push({ ...state, at: Date.now() });
    // eslint-disable-next-line no-console
    console.log(
      `[ssrm-grid-spike] state → gen=${state.generation} phase=${state.phase} rows=${state.rowCount}`,
    );
  });
  window.__ssrmGridSpike.state = () => connection.state;
  window.__ssrmGridSpike.restart = () => connection.restart();
  window.__ssrmGridSpike.countRows = async (filter) => {
    const table = await connection.openTable();
    const view = await table.view({ filter: filter as never });
    try {
      return await view.num_rows();
    } finally {
      void view.delete().catch(() => undefined);
    }
  };

  const quickFilterColumns = (config.columnDefinitions ?? [])
    .filter((c) => c.cellDataType === 'text')
    .map((c) => c.field);

  createRoot(document.getElementById('root')!).render(
    <App
      connection={connection}
      providerId={providerId}
      keyColumn={config.keyColumn}
      columnDefs={toColDefs(config.columnDefinitions)}
      quickFilterColumns={quickFilterColumns}
    />,
  );
}

void main();
