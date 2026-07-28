/**
 * Milestone 1, step 2 — the harness blotter.
 *
 * A real AG Grid, in server-side row model, fed by
 * `createPerspectiveDatasource` reading windows out of a View on the
 * SharedWorker-held Table. Open it in three windows: the claim under test is
 * that the 2nd and 3rd open as fast as the 1st and scroll as smoothly,
 * because none of them ever materializes the book.
 *
 * Every number the page reports is measured here, not asserted:
 *   - time from navigation to first painted row;
 *   - per-block round trip (AG asks -> rows delivered);
 *   - frame times during a scripted scroll, which is what "smooth" means.
 */
import {
  AllCommunityModule,
  createGrid,
  GRAND_TOTAL_ROW_ID,
  ModuleRegistry,
  ValidationModule,
  themeQuartz,
  colorSchemeDarkBlue,
} from 'ag-grid-community';
import {
  ColumnMenuModule,
  ContextMenuModule,
  RowGroupingModule,
  ServerSideRowModelApiModule,
  ServerSideRowModelModule,
} from 'ag-grid-enterprise';

import { createPerspectiveDatasource } from '../src/perspectiveDatasource.js';
import { createHostHandle } from './hostClient.mjs';
import { createViewManager } from './viewManager.mjs';
import { BOOK_COLUMNS, BOOK_NAME } from './mockBook.mjs';

// The whole community bundle rather than a hand-picked list. AG Grid 36 gates
// api methods on modules and fails them SILENTLY at the call site — an
// unregistered `ColumnApiModule` makes `applyColumnState({sort})` a no-op,
// which reads exactly like "sorting is broken in the datasource".
ModuleRegistry.registerModules([
  AllCommunityModule,
  ServerSideRowModelModule,
  ServerSideRowModelApiModule,
  RowGroupingModule,
  ColumnMenuModule,
  ContextMenuModule,
  ...(import.meta.env.DEV ? [ValidationModule] : []),
]);

const who = document.getElementById('who');
const statsEl = document.getElementById('stats');
const logEl = document.getElementById('log');

function log(line) {
  logEl.textContent = `${line}\n${logEl.textContent}`.split('\n').slice(0, 40).join('\n');
}

const ms = (n) => `${n.toFixed(1)}ms`;

/** Everything the page reports. */
const metrics = {
  blocks: 0,
  blockMs: [],
  failed: 0,
  refreshes: 0,
  firstRowsAt: null,
  worstFrameMs: 0,
};

function renderStats() {
  const mean =
    metrics.blockMs.length > 0
      ? metrics.blockMs.reduce((a, b) => a + b, 0) / metrics.blockMs.length
      : 0;
  const worst = metrics.blockMs.length > 0 ? Math.max(...metrics.blockMs) : 0;
  statsEl.innerHTML =
    `blocks <b>${metrics.blocks}</b> · mean <b>${ms(mean)}</b> · worst <b>${ms(worst)}</b>` +
    (metrics.refreshes ? ` · refreshes <b>${metrics.refreshes}</b>` : '') +
    (metrics.failed ? ` · <b>failed ${metrics.failed}</b>` : '') +
    (metrics.firstRowsAt !== null ? ` · first rows <b>${ms(metrics.firstRowsAt)}</b>` : '');
}

const numberFormatter = (params) =>
  typeof params.value === 'number'
    ? params.value.toLocaleString(undefined, { maximumFractionDigits: 2 })
    : '';

/** The columns aggregated when grouping is on. Every numeric column COULD be,
 *  and Perspective would not care, but a focused set keeps the group rows
 *  readable and makes a wrong total obvious at a glance. */
const AGGREGATED = {
  quantity: 'sum',
  notional: 'sum',
  marketValue: 'sum',
  pnl: 'sum',
  dayPnl: 'sum',
  exposure: 'sum',
  var95: 'sum',
  price: 'avg',
};

/** Group-by presets — the cycle the toolbar button walks through. */
const GROUPINGS = [[], ['sector'], ['sector', 'book'], ['sector', 'book', 'trader']];

const columnDefs = BOOK_COLUMNS.map(({ name, type }) =>
  type === 'string'
    ? {
        field: name,
        filter: 'agTextColumnFilter',
        width: name === 'positionId' ? 150 : 110,
        pinned: name === 'positionId' ? 'left' : undefined,
        enableRowGroup: true,
      }
    : {
        field: name,
        filter: 'agNumberColumnFilter',
        type: 'numericColumn',
        width: 120,
        valueFormatter: numberFormatter,
        enableValue: true,
        aggFunc: AGGREGATED[name],
      },
);

async function main() {
  const host = createHostHandle();
  const client = await host.client;
  const ready = await host.ready;
  who.textContent = `window #${ready.attached} · host booted in ${ms(ready.timings.totalMs)}`;

  const table = await client.open_table(BOOK_NAME);
  log(`attached and opened '${BOOK_NAME}' at ${ms(performance.now())}`);

  let gridApi = null;
  let grouping = [];

  /**
   * Perspective knows the exact row count of every View, and `num_rows()` is
   * effectively free, so there is no reason to make AG Grid discover the end
   * of the book by walking off it. `maxRowFound` is deliberately NOT passed:
   * the last short block still settles the count through
   * `success({rowCount})`, which is the shrink path that does not cap the
   * store (ARCHITECTURE.md, "Empty resolutions omit rowCount").
   *
   * Illegal while grouping: `setRowCount` raises AG error #28 whenever there
   * is a row-group column, and the error is SILENT without ValidationModule.
   * Grouped levels are small enough to discover by walking off the end anyway.
   */
  const publishRowCount = (rows) => {
    if (!gridApi || typeof rows !== 'number') return;
    if (grouping.length > 0) return;
    gridApi.setRowCount(rows);
  };

  /**
   * Live updates. The feed writes to the Table in the worker; Perspective
   * notifies this window's View; the window re-reads the blocks it already
   * holds. Nothing is pushed — the pull path stays the only way rows reach the
   * grid, which is the whole architecture in miniature.
   *
   * Throttled because the feed ticks faster than a re-read is worth doing, and
   * `refreshServerSide({purge:false})` re-requests EVERY loaded block, not just
   * the visible one. `purge:false` keeps scroll position and row nodes, so AG
   * updates rows in place by id and the changed cells flash.
   */
  const REFRESH_MS = 250;
  let live = true;
  let refreshTimer = null;
  let pendingUpdate = false;

  const scheduleRefresh = () => {
    if (!live || !gridApi) return;
    pendingUpdate = true;
    if (refreshTimer !== null) return;
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      if (!pendingUpdate || !live) return;
      pendingUpdate = false;
      metrics.refreshes += 1;
      refreshEveryLevel();
      void pushGrandTotal();
    }, REFRESH_MS);
  };

  /**
   * Refresh the root store AND every expanded group's store.
   *
   * MEASURED: `refreshServerSide({purge:false})` does NOT cascade into child
   * stores. With `sector > book` expanded it refreshed the six sector rows and
   * their footer, and left the six book rows underneath frozen at their
   * opening values — aggregates that look live at the top level and are stale
   * one row down, which is worse than obviously not updating. Each expanded
   * level is its own store and needs its own route.
   */
  const refreshEveryLevel = () => {
    gridApi.refreshServerSide({ purge: false });
    const routes = [];
    gridApi.forEachNode((node) => {
      if (!node.group || !node.expanded) return;
      const route = [];
      for (let n = node; n && n.level >= 0; n = n.parent) route.unshift(n.key);
      routes.push(route);
    });
    for (const route of routes) gridApi.refreshServerSide({ route, purge: false });
  };

  const views = createViewManager({
    table,
    onUpdate: scheduleRefresh,
    onEvent: (event) => {
      if (event.type !== 'view') return;
      const where = event.groupColId === null ? 'leaf' : `group by ${event.groupColId}`;
      log(
        `view built in ${ms(event.ms)} — depth ${event.depth} · ${where} · ` +
          `${event.rows.toLocaleString()} rows`,
      );
      if (event.depth === 0) publishRowCount(event.rows);
    },
  });

  /**
   * The grand total, supplied through AG's own contract rather than a pinned
   * row of our own: `grandTotalRow: 'pinnedBottom'` plus `grandTotalData` on
   * the block response, whose row id the grid assigns itself
   * (`GRAND_TOTAL_ROW_ID`). AG treats `needsGrandTotal` as a hint and accepts
   * an update at any time, which is exactly what keeps the total live under a
   * feed — every throttled refresh re-reads a root block and carries a fresh
   * total with it.
   *
   * The number is Perspective's own `__ROW_PATH__: []` row, aggregated over
   * the whole filtered book in the worker — NOT summed from the rows this
   * window happens to be holding.
   */
  const getGrandTotal = async (request) => {
    const total = await views.readGrandTotal(request);
    if (!total) return null;
    // The caption goes on `positionId`: it is pinned left and always visible,
    // whereas AG hides a column as soon as it is grouped by. Its aggregated
    // value here is a distinct count, which is not worth showing.
    // `__grandTotal` is how `getRowId` recognises this row — see below.
    return { ...total, positionId: 'GRAND TOTAL', __grandTotal: true };
  };

  /**
   * Keep the grand total moving under the feed.
   *
   * MEASURED: `grandTotalData` on the block response CREATES the row and
   * updates it after a purge, but a `refreshServerSide({purge:false})` does
   * NOT apply it — supplying five distinct fresh totals over five refreshes
   * left the row showing the first one. The documented path for updating an
   * existing grand total is a transaction whose row id is
   * `GRAND_TOTAL_ROW_ID`, so both mechanisms are used: `grandTotalData` to
   * establish the row, a transaction to keep it live.
   */
  const pushGrandTotal = async () => {
    if (!gridApi || !gridApi.getRowNode(GRAND_TOTAL_ROW_ID)) return;
    try {
      const total = await getGrandTotal(lastRootRequest);
      if (total) gridApi.applyServerSideTransaction({ update: [total] });
    } catch (err) {
      log(`grand total update failed — ${String(err?.message ?? err)}`);
    }
  };

  /** The last root-level request, so the live total matches the grid's shape. */
  let lastRootRequest = {};

  const inner = createPerspectiveDatasource({
    getView: (request) => views.getView(request),
    getGeneration: () => views.getGeneration(),
    getGrandTotal,
    onError: (err) => log(`BLOCK FAILED — ${String(err?.message ?? err)}`),
  });

  // Wrapper measures the round trip AG Grid actually experiences. It must
  // preserve the one-settle contract exactly: every path through `inner`
  // lands in exactly one of these two callbacks.
  const datasource = {
    getRows(params) {
      const started = performance.now();
      const { startRow, endRow } = params.request;
      if (!params.request.groupKeys?.length) lastRootRequest = { ...params.request };
      inner.getRows({
        request: params.request,
        needsGrandTotal: params.needsGrandTotal,
        success: (result) => {
          const took = performance.now() - started;
          metrics.blocks += 1;
          metrics.blockMs.push(took);
          // A live feed re-reads every loaded block several times a second, so
          // only the opening blocks and the slow ones are worth a line — the
          // rest would bury the view rebuilds and failures.
          if (metrics.blocks <= 3 || took > 25) {
            log(
              `block ${startRow}-${endRow} -> ${result.rowData.length} rows in ${ms(took)}` +
                `${result.rowCount === undefined ? '' : ` (rowCount ${result.rowCount})`}`,
            );
          }
          renderStats();
          params.success(result);
        },
        fail: () => {
          metrics.failed += 1;
          log(`block ${startRow}-${endRow} failed`);
          renderStats();
          params.fail();
        },
      });
    },
  };

  const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;

  gridApi = createGrid(document.getElementById('grid'), {
    theme: dark ? themeQuartz.withPart(colorSchemeDarkBlue) : themeQuartz,
    columnDefs,
    defaultColDef: {
      sortable: true,
      resizable: true,
      filter: true,
      // Ticks are the point; without the flash a re-read is invisible.
      enableCellChangeFlash: true,
    },
    cellFlashDuration: 600,
    rowModelType: 'serverSide',
    serverSideDatasource: datasource,
    // 100 rows is the window size every measurement in ARCHITECTURE.md used.
    cacheBlockSize: 100,
    maxBlocksInCache: 20,
    blockLoadDebounceMillis: 0,
    autoGroupColumnDef: { headerName: 'Group', width: 240, pinned: 'left' },
    // Aggregation at both levels the request asked about: `groupTotalRow`
    // gives every expanded group its own subtotal footer, `grandTotalRow` the
    // book-wide total. Both are fed by Perspective, never by AG summing rows
    // it happens to hold — a window only ever holds a viewport.
    groupTotalRow: 'bottom',
    grandTotalRow: 'pinnedBottom',
    suppressAggFuncInHeader: true,
    // Group rows have no positionId — they are aggregates, not positions — so
    // an id built from it would collide across every group at a level, and
    // duplicate ids turn a successful block into a failed one (AG warn 205).
    // The id has to be the path: parent keys plus this row's own key.
    getRowId: ({ level, parentKeys = [], data, api }) => {
      // The grand total row must carry AG's own id, or a transaction cannot
      // find it to update.
      if (data?.__grandTotal) return GRAND_TOTAL_ROW_ID;
      const groupCols = api.getRowGroupColumns?.() ?? [];
      if (level < groupCols.length) {
        const field = groupCols[level].getColDef().field;
        return [...parentKeys, data[field]].join('/');
      }
      return [...parentKeys, data.positionId].join('/');
    },
    // `onFirstDataRendered` does not fire for the server-side row model when
    // the first block arrives, so time-to-rows is taken from the first model
    // update that actually has rows in it.
    onModelUpdated: (event) => {
      if (metrics.firstRowsAt !== null) return;
      if (event.api.getDisplayedRowCount() === 0) return;
      metrics.firstRowsAt = performance.now();
      log(`first rows on screen at ${ms(metrics.firstRowsAt)} after navigation`);
      renderStats();
    },
  });

  // The first View can finish building before `createGrid` has returned, so
  // its row count has to be re-published once the api exists.
  publishRowCount(views.rows);

  // Debug handle: lets sort/filter/refresh be driven from the console (or a
  // driver script) without clicking through column menus.
  globalThis.__blotter = { api: gridApi, views, host, metrics };

  // The feed is host-wide: if another window already started it, this window
  // is already receiving updates and its button must say so.
  const tickButton = document.getElementById('tick');
  let ticking = false;
  tickButton.onclick = () => {
    ticking = !ticking;
    host.send({ cmd: 'tick', on: ticking, rows: 500, everyMs: 200 });
    log(ticking ? 'feed on — 500 rows / 200ms (host-wide)' : 'feed off');
  };
  host.onMessage((message) => {
    if (message?.type !== 'tick') return;
    ticking = message.on;
    tickButton.textContent = ticking ? 'stop feed' : 'start feed';
  });

  // Grouping is applied through AG, not around it: setting the row-group
  // columns makes AG issue level-by-level requests carrying `groupKeys`, and
  // every aggregate in those levels is computed by Perspective in the worker.
  const groupButton = document.getElementById('group');
  let groupIndex = 0;
  const applyGrouping = () => {
    grouping = GROUPINGS[groupIndex];
    groupButton.textContent = `group: ${grouping.length ? grouping.join(' > ') : 'none'}`;
    gridApi.setRowGroupColumns(grouping);
    gridApi.setValueColumns(grouping.length > 0 ? Object.keys(AGGREGATED) : []);
    // Changing the grouping purges the store, so the root block AG re-requests
    // brings a matching grand total with it.
  };
  groupButton.onclick = () => {
    groupIndex = (groupIndex + 1) % GROUPINGS.length;
    applyGrouping();
  };
  applyGrouping();

  const liveButton = document.getElementById('live');
  liveButton.textContent = 'live: on';
  liveButton.onclick = () => {
    live = !live;
    liveButton.textContent = live ? 'live: on' : 'live: off';
    if (live) scheduleRefresh();
  };

  document.getElementById('scrollTest').onclick = () => void scrollTest(gridApi);
}

/**
 * Scripted scroll with frame timing.
 *
 * "Scrolls smoothly" has to mean something measurable, so this drives the
 * real viewport (not `ensureIndexVisible`, which jumps) and records the frame
 * intervals. A block arriving late shows up as a long frame.
 */
async function scrollTest(api) {
  // AG Grid 36 renamed the scrolling element: `.ag-body-viewport` is gone and
  // `.ag-body-vertical-scroll-viewport` is the scrollbar chrome, not the rows.
  // `.ag-grid-viewport` is the one that actually scrolls.
  const viewport = document.querySelector('.ag-grid-viewport');
  if (!viewport) {
    log('scroll test: no scroll viewport yet');
    return;
  }

  const blocksBefore = metrics.blocks;
  const frames = [];
  let last = performance.now();
  const started = last;
  viewport.scrollTop = 0;

  await new Promise((resolve) => {
    const step = () => {
      const now = performance.now();
      frames.push(now - last);
      last = now;
      viewport.scrollTop += 60;
      if (now - started > 5_000 || viewport.scrollTop >= viewport.scrollHeight - viewport.clientHeight) {
        resolve();
        return;
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });

  // Drop the first frame: it carries the click's own layout work.
  const sample = frames.slice(1);
  const mean = sample.reduce((a, b) => a + b, 0) / sample.length;
  const worst = Math.max(...sample);
  const janky = sample.filter((f) => f > 32).length;
  metrics.worstFrameMs = Math.max(metrics.worstFrameMs, worst);
  log(
    `scroll test — ${sample.length} frames, mean ${ms(mean)} (${(1000 / mean).toFixed(0)} fps), ` +
      `worst ${ms(worst)}, ${janky} frames > 32ms, ${metrics.blocks - blocksBefore} blocks loaded`,
  );
}

window.addEventListener('unhandledrejection', (event) =>
  log(`UNHANDLED — ${String(event.reason?.message ?? event.reason)}`),
);

void main();
