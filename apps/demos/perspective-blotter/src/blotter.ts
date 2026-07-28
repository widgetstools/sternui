/**
 * A blotter window on the REAL feed.
 *
 * Same AG Grid surface and the same datasource as the mock harness, but the
 * book behind it is a live STOMP book held once in the SharedWorker. Open this
 * page in three windows: none of them ever materializes the 20,000 rows, and
 * only the first pays for the snapshot.
 *
 * Column defs come from the Table's own schema rather than a hardcoded list —
 * whatever the broker sends is what the grid shows.
 */
import {
  AllCommunityModule,
  createGrid,
  GRAND_TOTAL_ROW_ID,
  ModuleRegistry,
  ValidationModule,
  themeQuartz,
  colorSchemeDarkBlue,
  type GridApi,
} from 'ag-grid-community';
import {
  ColumnMenuModule,
  ContextMenuModule,
  RowGroupingModule,
  ServerSideRowModelApiModule,
  ServerSideRowModelModule,
} from 'ag-grid-enterprise';
import { createPerspectiveDatasource, createViewManager } from '@starui/perspective-grid';
import { createHostHandle } from './hostClient';
import { BOOK_TABLE, KEY_COLUMN } from './feedConfig';

// The whole community bundle rather than a hand-picked list: AG Grid 36 gates
// api methods on modules and fails them SILENTLY at the call site.
ModuleRegistry.registerModules([
  AllCommunityModule,
  ServerSideRowModelModule,
  ServerSideRowModelApiModule,
  RowGroupingModule,
  ColumnMenuModule,
  ContextMenuModule,
  ...(import.meta.env.DEV ? [ValidationModule] : []),
]);

const who = document.getElementById('who')!;
const statsEl = document.getElementById('stats')!;
const logEl = document.getElementById('log')!;

const log = (line: string) => {
  logEl.textContent = `${line}\n${logEl.textContent}`.split('\n').slice(0, 40).join('\n');
};
const ms = (n: number) => `${n.toFixed(1)}ms`;

const metrics = { blocks: 0, blockMs: [] as number[], failed: 0, refreshes: 0, firstRowsAt: 0 };

function renderStats() {
  const list = metrics.blockMs;
  const mean = list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0;
  statsEl.innerHTML =
    `blocks <b>${metrics.blocks}</b> · mean <b>${ms(mean)}</b> · worst <b>${ms(Math.max(0, ...list))}</b>` +
    (metrics.refreshes ? ` · refreshes <b>${metrics.refreshes}</b>` : '') +
    (metrics.failed ? ` · <b>failed ${metrics.failed}</b>` : '') +
    (metrics.firstRowsAt ? ` · first rows <b>${ms(metrics.firstRowsAt)}</b>` : '');
}

/** Sums that make a group row worth reading; the rest stay ungrouped detail. */
const AGGREGATED: Record<string, string> = {
  quantity: 'sum',
  notionalAmount: 'sum',
  marketValue: 'sum',
  totalValue: 'sum',
  pnl: 'sum',
  unrealizedPnl: 'sum',
  dailyPnl: 'sum',
  dv01: 'sum',
  currentPrice: 'avg',
};

const GROUPINGS = [[], ['desk'], ['desk', 'region'], ['desk', 'region', 'trader']];

const numberFormatter = (params: { value: unknown }) =>
  typeof params.value === 'number'
    ? params.value.toLocaleString(undefined, { maximumFractionDigits: 2 })
    : '';

/** Build column defs from the Table's real schema. */
function columnDefsFrom(schema: Record<string, string>) {
  return Object.entries(schema).map(([field, type]) => {
    const numeric = type === 'float' || type === 'integer';
    return {
      field,
      width: field === KEY_COLUMN ? 210 : numeric ? 130 : 120,
      pinned: field === KEY_COLUMN ? ('left' as const) : undefined,
      filter: numeric ? 'agNumberColumnFilter' : 'agTextColumnFilter',
      ...(numeric
        ? { type: 'numericColumn', valueFormatter: numberFormatter, enableValue: true, aggFunc: AGGREGATED[field] }
        : { enableRowGroup: true }),
    };
  });
}

async function main() {
  const started = performance.now();
  const host = createHostHandle();
  host.onMessage((message) => {
    if (message?.type === 'stage') who.textContent = `worker: ${message.stage}`;
    else if (message?.type === 'error') log(`WORKER ERROR — ${String(message.detail)}`);
  });

  const client = (await host.client) as {
    open_table(name: string): Promise<{ schema(): Promise<Record<string, string>> }>;
  };
  const attached = await host.attached;
  const attachedAt = performance.now();

  const table = await client.open_table(BOOK_TABLE);
  const schema = await table.schema();
  who.textContent =
    `window #${attached.attached} · attached in ${ms(attachedAt - started)} · ` +
    `${Object.keys(schema).length} columns from the broker`;
  log(`opened '${BOOK_TABLE}' at ${ms(performance.now())} — no rows crossed the port`);

  let gridApi: GridApi | null = null;
  let grouping: string[] = [];

  const publishRowCount = (rows: number | null) => {
    // `setRowCount` raises AG error #28 while grouping, silently without
    // ValidationModule.
    if (!gridApi || rows === null || grouping.length > 0) return;
    gridApi.setRowCount(rows);
  };

  const REFRESH_MS = 250;
  let live = true;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending = false;

  const scheduleRefresh = () => {
    if (!live || !gridApi) return;
    pending = true;
    if (timer !== null) return;
    timer = setTimeout(() => {
      timer = null;
      if (!pending || !live) return;
      pending = false;
      metrics.refreshes += 1;
      refreshEveryLevel();
      void pushGrandTotal();
    }, REFRESH_MS);
  };

  /** `refreshServerSide` does NOT cascade into child stores — each expanded
   *  level is its own store, and refreshing only the root leaves the rows
   *  under it frozen while the totals above them tick. */
  const refreshEveryLevel = () => {
    if (!gridApi) return;
    gridApi.refreshServerSide({ purge: false });
    const routes: string[][] = [];
    gridApi.forEachNode((node) => {
      if (!node.group || !node.expanded) return;
      const route: string[] = [];
      for (let n: typeof node | null = node; n && n.level >= 0; n = n.parent) route.unshift(n.key!);
      routes.push(route);
    });
    for (const route of routes) gridApi.refreshServerSide({ route, purge: false });
  };

  const views = createViewManager({
    table: table as never,
    onUpdate: scheduleRefresh,
    onEvent: (event) => {
      if (event.type !== 'view') return;
      const where = event.groupColId === null ? 'leaf' : `group by ${event.groupColId}`;
      log(`view built in ${ms(event.ms!)} — depth ${event.depth} · ${where} · ${event.rows!.toLocaleString()} rows`);
      if (event.depth === 0) publishRowCount(event.rows ?? null);
    },
  });

  const getGrandTotal = async (request: Parameters<typeof views.readGrandTotal>[0]) => {
    const total = await views.readGrandTotal(request);
    if (!total) return null;
    return { ...total, [KEY_COLUMN]: 'GRAND TOTAL', __grandTotal: true };
  };

  /** `grandTotalData` CREATES the row and updates it after a purge, but a
   *  non-purge refresh does not apply it — keeping it live needs a
   *  transaction whose row id is `GRAND_TOTAL_ROW_ID`. */
  let lastRootRequest: Record<string, unknown> = {};
  const pushGrandTotal = async () => {
    if (!gridApi || !gridApi.getRowNode(GRAND_TOTAL_ROW_ID)) return;
    const total = await getGrandTotal(lastRootRequest as never);
    if (total) gridApi.applyServerSideTransaction({ update: [total] });
  };

  const inner = createPerspectiveDatasource({
    getView: (request) => views.getView(request),
    getGeneration: () => views.getGeneration(),
    getGrandTotal,
    onError: (err) => log(`BLOCK FAILED — ${String((err as Error)?.message ?? err)}`),
  });

  gridApi = createGrid(document.getElementById('grid')!, {
    theme: window.matchMedia('(prefers-color-scheme: dark)').matches
      ? themeQuartz.withPart(colorSchemeDarkBlue)
      : themeQuartz,
    columnDefs: columnDefsFrom(schema),
    defaultColDef: { sortable: true, resizable: true, filter: true, enableCellChangeFlash: true },
    cellFlashDuration: 600,
    rowModelType: 'serverSide',
    serverSideDatasource: {
      getRows(params) {
        const begun = performance.now();
        if (!params.request.groupKeys?.length) lastRootRequest = { ...params.request };
        inner.getRows({
          request: params.request as never,
          needsGrandTotal: params.needsGrandTotal,
          success: (result) => {
            const took = performance.now() - begun;
            metrics.blocks += 1;
            metrics.blockMs.push(took);
            if (metrics.blocks <= 3 || took > 25) {
              log(`block ${params.request.startRow}-${params.request.endRow} -> ${result.rowData.length} rows in ${ms(took)}`);
            }
            renderStats();
            params.success(result as never);
          },
          fail: () => {
            metrics.failed += 1;
            renderStats();
            params.fail();
          },
        });
      },
    },
    cacheBlockSize: 100,
    maxBlocksInCache: 20,
    blockLoadDebounceMillis: 0,
    autoGroupColumnDef: { headerName: 'Group', width: 240, pinned: 'left' },
    groupTotalRow: 'bottom',
    grandTotalRow: 'pinnedBottom',
    suppressAggFuncInHeader: true,
    // Group rows have no key column of their own; an id derived from it would
    // collide across every group at a level (AG warn 205 turns the block into
    // a failure), so the id is the path.
    getRowId: ({ level, parentKeys = [], data, api }) => {
      if ((data as Record<string, unknown>)?.__grandTotal) return GRAND_TOTAL_ROW_ID;
      const groupCols = api.getRowGroupColumns?.() ?? [];
      if (level < groupCols.length) {
        const field = groupCols[level].getColDef().field!;
        return [...parentKeys, (data as Record<string, unknown>)[field]].join('/');
      }
      return [...parentKeys, (data as Record<string, unknown>)[KEY_COLUMN]].join('/');
    },
    onModelUpdated: (event) => {
      if (metrics.firstRowsAt || event.api.getDisplayedRowCount() === 0) return;
      metrics.firstRowsAt = performance.now();
      log(`first rows on screen at ${ms(metrics.firstRowsAt)} after navigation`);
      renderStats();
    },
  });

  publishRowCount(views.rowsAtRoot);
  (globalThis as Record<string, unknown>).__blotter = { api: gridApi, views, host, metrics };

  const groupButton = document.getElementById('group') as HTMLButtonElement;
  let groupIndex = 0;
  const applyGrouping = () => {
    grouping = GROUPINGS[groupIndex];
    groupButton.textContent = `group: ${grouping.length ? grouping.join(' > ') : 'none'}`;
    gridApi!.setRowGroupColumns(grouping);
    gridApi!.setValueColumns(grouping.length > 0 ? Object.keys(AGGREGATED) : []);
  };
  groupButton.onclick = () => {
    groupIndex = (groupIndex + 1) % GROUPINGS.length;
    applyGrouping();
  };
  applyGrouping();

  const liveButton = document.getElementById('live') as HTMLButtonElement;
  liveButton.onclick = () => {
    live = !live;
    liveButton.textContent = live ? 'live: on' : 'live: off';
    if (live) scheduleRefresh();
  };
}

window.addEventListener('unhandledrejection', (event) =>
  log(`UNHANDLED — ${String(event.reason?.message ?? event.reason)}`),
);

void main();
