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
 * P4b adds:
 * • **cell-edit write-back** — editable columns wired to
 *   `createSsrmCellEditHandler`: an edit posts a keyed partial row to
 *   the worker (`ssrm-update-rows`, generation-fenced, schema-coerced),
 *   so EVERY window converges on the next tick-refresh cycle;
 * • **full-filtered-set export** — `datasource.queryAll()` (bounded
 *   10k-row windowed reads over the current filtered+sorted view) →
 *   CSV via direct sheet building (`rowsToCsv`; AG's own SSRM export
 *   only walks loaded blocks) and Excel via AG's ExcelExportModule on
 *   a transient OFF-SCREEN client-side grid (the supported way to emit
 *   real .xlsx without hand-rolling OOXML);
 * • **full-filtered-set chart** — AG Charts standalone over the SAME
 *   `queryAll` rows (AG's integrated charts under SSRM also see only
 *   loaded blocks, so the chart is fed from the data plane).
 *
 * P4b-2 adds:
 * • **tree data** (`?tree=1`) — the catalog row's `treePathFields`
 *   (`['bookName', 'trader']`) synthesize a serverSide tree; the grid
 *   wires AG 36's tree contract (`isServerSideGroup` /
 *   `getServerSideGroupKey`) to the plane's group-row stamps;
 * • **master-detail** (`?master=1`) — expanding a row fetches its
 *   detail on demand via `createSsrmDetailFetcher` (default: keyed
 *   single-row read of the hosted table — always the CURRENT values);
 * • **calc column** — the catalog row's `calcExpressions`
 *   (`pnlPerUnit = pnl / quantity`) flows into every view: it sorts,
 *   filters, aggregates (grouped views + grand total) and exports
 *   (queryAll) like a real column.
 *
 * Mount-once contract: the grid mounts only once DatasetState is
 * known, keyed by `(providerId, generation)` — a restart bumps the
 * generation and REMOUNTS the grid; loading/empty/error are rendered
 * from DatasetState as plain text. Probes: `window.__ssrmGridSpike`.
 */

import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AgGridReact } from 'ag-grid-react';
// Dark StarUI AG theme (quartz + colorSchemeDark). Relative import — the
// package doesn't export it yet (same precedent as other lab spikes).
import { theme as agDarkTheme } from '../../../../../packages/react-grid/ssrm-grid/src/agGrid/theme.js';
import {
  ColumnApiModule, createGrid, ModuleRegistry, RenderApiModule, RowApiModule,
  type CellValueChangedEvent, type ColDef, type GridApi,
  type SetFilterValuesFuncParams,
} from 'ag-grid-community';
import {
  AgCharts, AllCommunityModule, ModuleRegistry as AgChartsModuleRegistry,
  type AgCartesianChartOptions, type AgChartInstance,
} from 'ag-charts-community';
import '@starui/ssrm-grid/ag-grid-modules';

// P4b: the STANDALONE chart path (the shared registration only wires
// charts for AG Grid's integrated pathway).
AgChartsModuleRegistry.registerModules(AllCommunityModule);

// The shared ssrm-grid registration covers the grid itself; the spike's
// probe surface additionally reads rows/columns through the api, and the
// datasource's live grand-total patch needs getRowNode + refreshCells.
ModuleRegistry.registerModules([RowApiModule, ColumnApiModule, RenderApiModule]);
import {
  CHILD_COUNT_FIELD,
  connectSsrmProvider,
  createSsrmCellEditHandler,
  createSsrmDetailFetcher,
  createSsrmPullDatasource,
  createSsrmRowIdGetter,
  createSsrmRowMasterGetter,
  getSsrmServerSideGroupKey,
  isSsrmServerSideGroup,
  rowsToCsv,
  toSsrmDatasetConfig,
  type DatasetStateSnapshot,
  type SsrmProviderConnection,
  type SsrmPullDatasource,
  type StompSsrmProviderConfig,
} from '@starui/ssrm-grid/pull';
import { Button, Input } from '@starui/ui';
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
/** P4b-2: `?tree=1` serves the config's treePathFields as a serverSide tree. */
const TREE_MODE = params.get('tree') === '1';
/** P4b-2: `?master=1` enables master-detail (tree and master are exclusive). */
const MASTER_MODE = !TREE_MODE && params.get('master') === '1';

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
    // P4b-2: window-side knobs — calc column + the synthesized tree.
    calcExpressions: { pnlPerUnit: '"pnl" / "quantity"' },
    treePathFields: ['bookName', 'trader'],
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
      // EVERY column is groupable — the engine groups by any column via
      // Perspective `group_by`. Grouping by a high-cardinality numeric
      // (e.g. pnl) is legal but produces ~one group per row; that is the
      // user's call to make, and group levels are paged like any other.
      enableRowGroup: true,
      enableValue: numeric,
      enablePivot: true,
      // P4b: every non-identity column is editable; the key column is
      // row identity (a re-keyed write would INSERT, not update) and
      // the edit handler refuses it anyway.
      editable: c.field !== 'positionId',
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

/** P4b-2: calc columns are first-class grid columns (computed per view). */
function toCalcColDefs(calc: Record<string, string> | undefined): ColDef[] {
  return Object.keys(calc ?? {}).map((name): ColDef => ({
    field: name,
    headerName: name,
    filter: 'agNumberColumnFilter',
    enableValue: true,
    // Calc columns group/aggregate like real ones — the expression is
    // attached to every view the plane builds, including group-level.
    enableRowGroup: true,
    enablePivot: true,
    editable: false, // computed — nothing to write back
  }));
}

/** P4b-2: detail panel columns (real table columns; the detail read is a keyed single-row table read). */
const DETAIL_COL_DEFS: ColDef[] = ['positionId', 'cusip', 'bookName', 'trader', 'quantity', 'currentPrice', 'pnl']
  .map((field): ColDef => ({ field }));

// ─── P4b actions (populated by main(); buttons + probes share them) ─

const p4b: {
  downloadCsv?: () => Promise<void>;
  downloadExcel?: () => Promise<void>;
  chart?: () => Promise<void>;
} = {};

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
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
  /**
   * P4b — programmatic stand-in for typing into a cell: sets the value
   * on the displayed row node, which fires `onCellValueChanged` → the
   * write-back handler. Returns false when the row is not displayed.
   */
  setCellValue: (i: number, field: string, value: unknown) => boolean;
  /** P4b — full-filtered-set read: exact view total + rows fetched. */
  queryAllCount: (chunkSize?: number) => Promise<{ total: number; rows: number }>;
  /** P4b — queryAll → rowsToCsv. `lines` excludes the header row. */
  exportFilteredCsv: () => Promise<{ total: number; rows: number; lines: number }>;
  /** P4b — queryAll → off-screen CSRM grid → ExcelExportModule blob. */
  exportFilteredExcel: () => Promise<{ total: number; gridRows: number; blobBytes: number }>;
  /** P4b — queryAll → AG Charts standalone; returns plotted-point count. */
  chartFilteredSet: (yField?: string) => Promise<{ total: number; points: number }>;
  /** P4b-2 — full filtered+sorted leaf rows (control math for calc/tree probes). */
  queryAllRows: (columns?: string[]) => Promise<Record<string, unknown>[]>;
  /** P4b-2 — every mounted detail grid's rows (master-detail evidence). */
  detailGrids: () => Array<{ id: string; rows: Record<string, unknown>[] }>;
  /** P4b-2 — CONTROL read: the hosted table's CURRENT row for a key. */
  readRowByKey: (key: unknown) => Promise<Record<string, unknown> | null>;
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
  calcExpressions,
  treePathFields,
}: {
  connection: SsrmProviderConnection;
  generation: number;
  keyColumn: string;
  columnDefs: ColDef[];
  quickFilterColumns: string[];
  calcExpressions?: Record<string, string>;
  treePathFields?: string[];
}): React.JSX.Element {
  const datasource = useMemo(
    () =>
      createSsrmPullDatasource({
        connection,
        keyColumn,
        quickFilterColumns,
        ...(calcExpressions ? { calcExpressions } : {}),
        // P4b-2: tree mode serves the config's synthesized hierarchy.
        ...(TREE_MODE && treePathFields ? { treePathFields } : {}),
      }),
    [connection, generation, keyColumn, quickFilterColumns, calcExpressions, treePathFields],
  );
  const getRowId = useMemo(() => createSsrmRowIdGetter(keyColumn), [keyColumn]);
  // P4b: edits post keyed partial rows to the worker-hosted table.
  const onCellValueChanged = useMemo(
    () => createSsrmCellEditHandler({ connection, keyColumn }),
    [connection, keyColumn],
  );
  // P4b-2: master-detail — expand fetches the row's detail on demand
  // (keyed single-row read of the hosted table = CURRENT values).
  const isRowMaster = useMemo(() => createSsrmRowMasterGetter(keyColumn), [keyColumn]);
  const detailCellRendererParams = useMemo(
    () => ({
      detailGridOptions: { columnDefs: DETAIL_COL_DEFS, defaultColDef: { resizable: true } },
      getDetailRowData: createSsrmDetailFetcher({ connection, keyColumn }),
    }),
    [connection, keyColumn],
  );
  const displayColumnDefs = useMemo(
    () =>
      MASTER_MODE
        ? columnDefs.map((def, i) =>
            i === 0 ? { ...def, cellRenderer: 'agGroupCellRenderer' } : def,
          )
        : columnDefs,
    [columnDefs],
  );
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
      theme={agDarkTheme}
      rowModelType="serverSide"
      serverSideDatasource={datasource}
      cacheBlockSize={100}
      // 24 (was 10): AG evicting blocks the datasource still holds
      // defeats serve-then-refresh — a re-request of an AG-evicted block
      // became a cold stub read even though the data plane had it. Keep
      // this BELOW the datasource's maxBlocks (32) so the BlockCache
      // always covers what AG can re-request.
      maxBlocksInCache={24}
      // Scroll-aware sweep deferral: while the user scrolls, tick sweeps
      // yield the worker to viewport block reads (one sweep on settle).
      onBodyScroll={() => datasource.onScroll()}
      columnDefs={displayColumnDefs}
      defaultColDef={{
        sortable: true,
        resizable: true,
        enableCellChangeFlash: true,
        // Belt-and-braces: anything not covered by toColDefs/toCalcColDefs
        // (e.g. a column added later) is still groupable from the panel.
        enableRowGroup: true,
      }}
      autoGroupColumnDef={{ headerName: TREE_MODE ? 'Tree' : 'Group', minWidth: 220 }}
      // Drag-to-group. Hidden in TREE_MODE: AG tree data and row grouping
      // are mutually exclusive, and the plane serves the tree from
      // `treePathFields` rather than from rowGroupCols.
      rowGroupPanelShow={TREE_MODE ? 'never' : 'always'}
      // Columns + filters tool panels. Collapsed by default (no
      // `defaultToolPanel`) so the grid keeps its full width until asked.
      sideBar={{
        toolPanels: [
          {
            id: 'columns',
            labelDefault: 'Columns',
            labelKey: 'columns',
            iconKey: 'columns',
            toolPanel: 'agColumnsToolPanel',
            toolPanelParams: {
              suppressPivotMode: true, // pivot is not incremental on this plane
              suppressValues: false,
              suppressRowGroups: TREE_MODE,
            },
          },
          {
            id: 'filters',
            labelDefault: 'Filters',
            labelKey: 'filters',
            iconKey: 'filter',
            toolPanel: 'agFiltersToolPanel',
          },
        ],
      }}
      // Status bar. Row counts come from the store, which the datasource
      // keeps authoritative via `rowCount` on every load success, so they
      // track the server-side filtered set rather than loaded blocks.
      // The aggregation panel needs a cell selection to have anything to
      // sum, hence `cellSelection` below.
      statusBar={{
        statusPanels: [
          { statusPanel: 'agTotalAndFilteredRowCountComponent', align: 'left' },
          { statusPanel: 'agSelectedRowCountComponent', align: 'center' },
          {
            statusPanel: 'agAggregationComponent',
            align: 'right',
            statusPanelParams: { aggFuncs: ['count', 'sum', 'min', 'max', 'avg'] },
          },
        ],
      }}
      cellSelection
      grandTotalRow="bottom"
      suppressAggFuncInHeader
      getChildCount={(data) =>
        (data as Record<string, unknown> | undefined)?.[CHILD_COUNT_FIELD] as number
      }
      getRowId={getRowId}
      // P4b-2: AG 36 serverSide tree-data contract → the plane's stamps.
      {...(TREE_MODE
        ? {
            treeData: true,
            isServerSideGroup: isSsrmServerSideGroup,
            getServerSideGroupKey: getSsrmServerSideGroupKey,
          }
        : {})}
      {...(MASTER_MODE
        ? { masterDetail: true, isRowMaster, detailCellRendererParams, detailRowAutoHeight: true }
        : {})}
      onCellValueChanged={(event: CellValueChangedEvent) => onCellValueChanged(event)}
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
  calcExpressions,
  treePathFields,
}: {
  connection: SsrmProviderConnection;
  providerId: string;
  keyColumn: string;
  columnDefs: ColDef[];
  quickFilterColumns: string[];
  calcExpressions?: Record<string, string>;
  treePathFields?: string[];
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
      <div style={{ padding: 4, display: 'flex', gap: 8, alignItems: 'center' }}>
        <Input
          data-testid="quick-filter"
          placeholder="Quick filter…"
          style={{ maxWidth: 240 }}
          onChange={(e) => window.__ssrmGridSpike.setQuickFilter(e.target.value)}
        />
        {/* P4b: full-FILTERED-set actions (queryAll, not loaded blocks) */}
        <Button
          data-testid="export-csv-full"
          variant="outline"
          size="sm"
          onClick={() => void p4b.downloadCsv?.().catch(console.warn)}
        >
          Export CSV (full set)
        </Button>
        <Button
          data-testid="export-excel-full"
          variant="outline"
          size="sm"
          onClick={() => void p4b.downloadExcel?.().catch(console.warn)}
        >
          Export Excel (full set)
        </Button>
        <Button
          data-testid="chart-full"
          variant="outline"
          size="sm"
          onClick={() => void p4b.chart?.().catch(console.warn)}
        >
          Chart PnL (full set)
        </Button>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <GridHost
          key={`${providerId}:${state.generation}`}
          connection={connection}
          generation={state.generation}
          keyColumn={keyColumn}
          columnDefs={columnDefs}
          quickFilterColumns={quickFilterColumns}
          calcExpressions={calcExpressions}
          treePathFields={treePathFields}
        />
      </div>
      {/* P4b chart overlay — hidden until the first chart render. */}
      <div
        id="ssrm-chart-full"
        data-testid="ssrm-chart-full"
        style={{ display: 'none', height: 320, minHeight: 320 }}
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
                // P4b-2: the calc column aggregates like a real column
                { colId: 'pnlPerUnit', aggFunc: 'sum' },
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
    setCellValue: (i, field, value) => {
      const node = window.__ssrmGridSpike.api?.getDisplayedRowAtIndex(i);
      if (!node) return false;
      node.setDataValue(field, value);
      return true;
    },
    queryAllCount: () => Promise.reject(new Error('not connected yet')),
    exportFilteredCsv: () => Promise.reject(new Error('not connected yet')),
    exportFilteredExcel: () => Promise.reject(new Error('not connected yet')),
    chartFilteredSet: () => Promise.reject(new Error('not connected yet')),
    queryAllRows: () => Promise.reject(new Error('not connected yet')),
    detailGrids: () => {
      const api = window.__ssrmGridSpike.api;
      if (!api) return [];
      const out: Array<{ id: string; rows: Record<string, unknown>[] }> = [];
      api.forEachDetailGridInfo((info) => {
        const rows: Record<string, unknown>[] = [];
        info.api?.forEachNode((node) => {
          if (node.data) rows.push(node.data as Record<string, unknown>);
        });
        out.push({ id: info.id, rows });
      });
      return out;
    },
    readRowByKey: () => Promise.reject(new Error('not connected yet')),
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
  window.__ssrmGridSpike.readRowByKey = async (key) => {
    const table = await connection.openTable();
    const view = await table.view({ filter: [[config.keyColumn, '==', key]] as never });
    try {
      const rows = (await view.to_json()) as Record<string, unknown>[];
      return rows[0] ?? null;
    } finally {
      void view.delete().catch(() => undefined);
    }
  };

  // ─── P4b: full-filtered-set export + chart (queryAll data plane) ──

  const exportColumns = [
    ...(config.columnDefinitions ?? []).map((c) => ({
      field: c.field,
      headerName: c.headerName,
    })),
    // P4b-2: calc columns export like real columns (queryAll serves them)
    ...Object.keys(config.calcExpressions ?? {}).map((name) => ({
      field: name,
      headerName: name,
    })),
  ];

  const liveDatasource = (): SsrmPullDatasource => {
    const ds = window.__ssrmGridSpike.datasource;
    if (!ds) throw new Error('[ssrm-grid-spike] datasource not mounted');
    return ds;
  };

  const buildCsv = async (): Promise<{ csv: string; rows: number; total: number }> => {
    const { rows, total } = await liveDatasource().queryAll();
    return { csv: rowsToCsv(rows, exportColumns), rows: rows.length, total };
  };

  /**
   * Excel route: AG's ExcelExportModule on a transient OFF-SCREEN
   * client-side grid fed with the queryAll rows — the supported way to
   * emit a real .xlsx (AG's own SSRM export walks only loaded blocks).
   */
  const buildExcel = async (): Promise<{ blob: Blob; gridRows: number; total: number }> => {
    const { rows, total } = await liveDatasource().queryAll();
    const holder = document.createElement('div');
    holder.style.cssText = 'position:fixed;left:-10000px;top:0;width:1000px;height:500px;';
    document.body.appendChild(holder);
    const offscreen = createGrid(holder, {
      columnDefs: exportColumns.map((c): ColDef => ({ field: c.field, headerName: c.headerName })),
      rowData: rows,
    });
    try {
      const deadline = Date.now() + 10_000;
      while (offscreen.getDisplayedRowCount() < total && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      const data = offscreen.getDataAsExcel();
      const blob =
        data instanceof Blob
          ? data
          : new Blob([String(data ?? '')], { type: 'application/vnd.ms-excel' });
      return { blob, gridRows: offscreen.getDisplayedRowCount(), total };
    } finally {
      offscreen.destroy();
      holder.remove();
    }
  };

  /** Chart route: AG Charts STANDALONE over the queryAll series. */
  let chartInstance: AgChartInstance | null = null;
  const renderChart = async (yField: string): Promise<{ total: number; points: number }> => {
    const { rows, total } = await liveDatasource().queryAll({ columns: [yField] });
    const data = rows.map((row, idx) => ({ idx, value: Number(row[yField] ?? 0) }));
    const container = document.getElementById('ssrm-chart-full');
    if (!container) throw new Error('[ssrm-grid-spike] chart container missing');
    container.style.display = 'block';
    chartInstance?.destroy();
    const options: AgCartesianChartOptions = {
      container,
      data,
      series: [{ type: 'line', xKey: 'idx', yKey: 'value', marker: { enabled: false } }],
      axes: {
        x: { type: 'number', title: { text: 'row # (filtered+sorted order)' } },
        y: { type: 'number', title: { text: yField } },
      },
      title: { text: `${yField} — full filtered set (${total} rows)` },
    };
    chartInstance = AgCharts.create(options);
    return { total, points: data.length };
  };

  window.__ssrmGridSpike.queryAllCount = async (chunkSize) => {
    const { rows, total } = await liveDatasource().queryAll(chunkSize ? { chunkSize } : {});
    return { total, rows: rows.length };
  };
  window.__ssrmGridSpike.queryAllRows = async (columns) => {
    const { rows } = await liveDatasource().queryAll(columns ? { columns } : {});
    return rows;
  };
  window.__ssrmGridSpike.exportFilteredCsv = async () => {
    const { csv, rows, total } = await buildCsv();
    const lines = csv === '' ? 0 : csv.split('\r\n').length - 1; // minus header
    return { total, rows, lines };
  };
  window.__ssrmGridSpike.exportFilteredExcel = async () => {
    const { blob, gridRows, total } = await buildExcel();
    return { total, gridRows, blobBytes: blob.size };
  };
  window.__ssrmGridSpike.chartFilteredSet = (yField = 'pnl') => renderChart(yField);

  p4b.downloadCsv = async () => {
    const { csv } = await buildCsv();
    downloadBlob(new Blob([csv], { type: 'text/csv' }), 'ssrm-filtered-set.csv');
  };
  p4b.downloadExcel = async () => {
    const { blob } = await buildExcel();
    downloadBlob(blob, 'ssrm-filtered-set.xlsx');
  };
  p4b.chart = async () => {
    await renderChart('pnl');
  };

  const quickFilterColumns = (config.columnDefinitions ?? [])
    .filter((c) => c.cellDataType === 'text')
    .map((c) => c.field);

  createRoot(document.getElementById('root')!).render(
    <App
      connection={connection}
      providerId={providerId}
      keyColumn={config.keyColumn}
      columnDefs={[...toColDefs(config.columnDefinitions), ...toCalcColDefs(config.calcExpressions)]}
      quickFilterColumns={quickFilterColumns}
      calcExpressions={config.calcExpressions}
      treePathFields={config.treePathFields}
    />,
  );
}

void main();
