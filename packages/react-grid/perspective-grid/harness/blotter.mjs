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
  ModuleRegistry,
  ValidationModule,
  themeQuartz,
  colorSchemeDarkBlue,
} from 'ag-grid-community';
import {
  ColumnMenuModule,
  ContextMenuModule,
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
    (metrics.failed ? ` · <b>failed ${metrics.failed}</b>` : '') +
    (metrics.firstRowsAt !== null ? ` · first rows <b>${ms(metrics.firstRowsAt)}</b>` : '');
}

const numberFormatter = (params) =>
  typeof params.value === 'number'
    ? params.value.toLocaleString(undefined, { maximumFractionDigits: 2 })
    : '';

const columnDefs = BOOK_COLUMNS.map(({ name, type }) =>
  type === 'string'
    ? {
        field: name,
        filter: 'agTextColumnFilter',
        width: name === 'positionId' ? 150 : 110,
        pinned: name === 'positionId' ? 'left' : undefined,
      }
    : {
        field: name,
        filter: 'agNumberColumnFilter',
        type: 'numericColumn',
        width: 120,
        valueFormatter: numberFormatter,
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

  /**
   * Perspective knows the exact row count of every View, and `num_rows()` is
   * effectively free, so there is no reason to make AG Grid discover the end
   * of the book by walking off it. `maxRowFound` is deliberately NOT passed:
   * the last short block still settles the count through
   * `success({rowCount})`, which is the shrink path that does not cap the
   * store (ARCHITECTURE.md, "Empty resolutions omit rowCount").
   */
  const publishRowCount = (rows) => {
    if (gridApi && typeof rows === 'number') gridApi.setRowCount(rows);
  };

  const views = createViewManager({
    table,
    onEvent: (event) => {
      if (event.type === 'view') {
        log(`view rebuilt in ${ms(event.ms)} — ${event.rows.toLocaleString()} rows — ${event.key}`);
        publishRowCount(event.rows);
      }
    },
  });

  const inner = createPerspectiveDatasource({
    getView: (request) => views.getView(request),
    getGeneration: () => views.getGeneration(),
    onError: (err) => log(`BLOCK FAILED — ${String(err?.message ?? err)}`),
  });

  // Wrapper measures the round trip AG Grid actually experiences. It must
  // preserve the one-settle contract exactly: every path through `inner`
  // lands in exactly one of these two callbacks.
  const datasource = {
    getRows(params) {
      const started = performance.now();
      const { startRow, endRow } = params.request;
      inner.getRows({
        request: params.request,
        success: (result) => {
          metrics.blocks += 1;
          metrics.blockMs.push(performance.now() - started);
          log(
            `block ${startRow}-${endRow} -> ${result.rowData.length} rows in ` +
              `${ms(performance.now() - started)}${result.rowCount === undefined ? '' : ` (rowCount ${result.rowCount})`}`,
          );
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
    defaultColDef: { sortable: true, resizable: true, filter: true },
    rowModelType: 'serverSide',
    serverSideDatasource: datasource,
    // 100 rows is the window size every measurement in ARCHITECTURE.md used.
    cacheBlockSize: 100,
    maxBlocksInCache: 20,
    blockLoadDebounceMillis: 0,
    getRowId: (params) => String(params.data.positionId),
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

  wireControls(gridApi, host, views);
}

function wireControls(api, host, views) {
  const tickButton = document.getElementById('tick');
  let ticking = false;
  tickButton.onclick = () => {
    ticking = !ticking;
    host.send({ cmd: 'tick', on: ticking, rows: 500, everyMs: 200 });
    tickButton.textContent = ticking ? 'stop feed' : 'start feed';
    log(ticking ? 'feed on — 500 rows / 200ms' : 'feed off');
  };

  // The feed writes to the Table; the grid only learns about it when blocks
  // are re-read. Refreshing without purge keeps the scroll position and
  // re-requests just the loaded blocks.
  const refreshButton = document.getElementById('autoRefresh');
  let refreshTimer = null;
  refreshButton.onclick = () => {
    if (refreshTimer !== null) {
      clearInterval(refreshTimer);
      refreshTimer = null;
      refreshButton.textContent = 'auto-refresh: off';
      return;
    }
    refreshTimer = setInterval(() => api.refreshServerSide({ purge: false }), 1_000);
    refreshButton.textContent = 'auto-refresh: 1s';
  };

  document.getElementById('scrollTest').onclick = () => void scrollTest(api);
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
