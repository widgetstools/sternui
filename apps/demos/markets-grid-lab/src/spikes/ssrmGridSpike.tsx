/**
 * SSRM STOMP provider V2 — P2 grid consumer spike (served at
 * /spikes/ssrmGrid.html, driven by Playwright).
 *
 * A real AG Grid (enterprise, serverSide row model) reads THE hosted
 * Perspective table through `@starui/ssrm-grid/pull`:
 * `connectSsrmProvider` (control + direct Perspective client on the
 * provider SharedWorker) + `createSsrmPullDatasource` (viewport block
 * LRU, serve-then-refresh, tick patches via keyed transactions).
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
  RowApiModule,
  type ColDef,
  type GetRowIdParams,
  type GridApi,
} from 'ag-grid-community';
import '@starui/ssrm-grid/ag-grid-modules';

// The shared ssrm-grid registration covers the grid itself; the spike's
// probe surface additionally reads rows/columns through the api.
ModuleRegistry.registerModules([RowApiModule, ColumnApiModule]);
import {
  connectSsrmProvider,
  createSsrmPullDatasource,
  type DatasetStateSnapshot,
  type SsrmDatasetConfig,
  type SsrmProviderConnection,
} from '@starui/ssrm-grid/pull';
import SSRM_WORKER_URL from '@starui/host-data/assets/data-services-ssrm-worker.mjs?url';
import SERVER_WASM_URL from '@finos/perspective/dist/wasm/perspective-server.wasm?url';
import CLIENT_WASM_URL from '@finos/perspective/dist/wasm/perspective-js.wasm?url';

// ─── scenario config (URL-tunable, mirrors the P1 spike) ───────────

const PROVIDER_ID = 'positions-ssrm-grid';
const CLIENT_TAG = 'GRID1';
const KEY_COLUMN = 'positionId';

const params = new URLSearchParams(window.location.search);
const SNAPSHOT_ROWS = Number(params.get('rows') ?? 20_000);
const TICK_RATE = Number(params.get('rate') ?? 5); // ticks/sec
const UPDATES_PER_TICK = Number(params.get('upt') ?? 500);

const config: SsrmDatasetConfig = {
  websocketUrl: 'ws://localhost:8081',
  listenerTopic: `/snapshot/positions/${CLIENT_TAG}`,
  requestMessage: `/snapshot/positions/${CLIENT_TAG}/${TICK_RATE}/1000`,
  requestBody: '',
  requestHeaders: {
    'snapshot-rows': String(SNAPSHOT_ROWS),
    'updates-per-tick': String(UPDATES_PER_TICK),
  },
  snapshotEndToken: 'Success',
  keyColumn: KEY_COLUMN,
  tableName: 'positions',
};

const COLUMN_DEFS: ColDef[] = [
  { field: 'positionId', filter: 'agTextColumnFilter' },
  { field: 'cusip', filter: 'agTextColumnFilter' },
  { field: 'bookName', filter: 'agTextColumnFilter' },
  { field: 'trader', filter: 'agTextColumnFilter' },
  { field: 'quantity', filter: 'agNumberColumnFilter' },
  { field: 'marketValue', filter: 'agNumberColumnFilter' },
  { field: 'currentPrice', filter: 'agNumberColumnFilter' },
  { field: 'pnl', filter: 'agNumberColumnFilter' },
];

// ─── probe surface ──────────────────────────────────────────────────

interface TimelineEntry extends DatasetStateSnapshot {
  at: number;
}

interface SsrmGridSpikeProbes {
  timeline: TimelineEntry[];
  mounts: number;
  api: GridApi | null;
  state: () => DatasetStateSnapshot | null;
  displayedRowCount: () => number;
  viewportColumn: (colId: string, n?: number) => unknown[];
  sortBy: (colId: string, dir: 'asc' | 'desc' | null) => void;
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
}: {
  connection: SsrmProviderConnection;
  generation: number;
}): React.JSX.Element {
  const datasource = useMemo(
    () => createSsrmPullDatasource({ connection, keyColumn: KEY_COLUMN }),
    [connection, generation],
  );
  useEffect(() => {
    window.__ssrmGridSpike.mounts += 1;
    return () => datasource.destroy();
  }, [datasource]);

  return (
    <AgGridReact
      rowModelType="serverSide"
      serverSideDatasource={datasource}
      cacheBlockSize={100}
      maxBlocksInCache={10}
      columnDefs={COLUMN_DEFS}
      defaultColDef={{ sortable: true, resizable: true, enableCellChangeFlash: true }}
      getRowId={(p: GetRowIdParams) => String((p.data as Record<string, unknown>)[KEY_COLUMN])}
      onGridReady={(event) => {
        window.__ssrmGridSpike.api = event.api;
      }}
      onGridPreDestroyed={() => {
        window.__ssrmGridSpike.api = null;
      }}
    />
  );
}

function App({ connection }: { connection: SsrmProviderConnection }): React.JSX.Element {
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
    <div data-phase={state.phase} style={{ height: '100%' }}>
      <GridHost
        key={`${PROVIDER_ID}:${state.generation}`}
        connection={connection}
        generation={state.generation}
      />
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
    loadingRowCount: () =>
      document.querySelectorAll('.ag-row-loading').length +
      document.querySelectorAll('.ag-loading').length,
    loadingOverlayVisible: () => document.querySelector('.ag-overlay-loading-center') !== null,
    restart: () => Promise.reject(new Error('not connected yet')),
  };

  const connection = await connectSsrmProvider({
    appId: 'markets-grid-lab',
    providerId: PROVIDER_ID,
    workerUrl: SSRM_WORKER_URL,
    config,
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

  createRoot(document.getElementById('root')!).render(<App connection={connection} />);
}

void main();
