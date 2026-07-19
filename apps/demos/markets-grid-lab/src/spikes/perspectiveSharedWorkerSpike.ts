/**
 * SSRM pull-architecture demo — live STOMP feed → Perspective table in a
 * SharedWorker → viewport reads (ADR-ssrm-worker-hosted-engine.md).
 *
 * This exercises the REAL modules end-to-end, which is the live-table
 * verification the unit tests (fakes) cannot give:
 *   - `ProviderTableBridge`  — conflating writer  (@wellsfargo-starui/host-data)
 *   - `createPerspectiveEngine` / `PerspectiveViewCache` — SSRM reads (ssrm-grid)
 *
 * Open in TWO windows: the second ATTACHES to the table the first built. That
 * is the whole thesis — N blotters, one dataset copy.
 *
 * Needs `npm run dev:stomp` on :8081.
 */
import { Client as StompClient } from '@stomp/stompjs';
import perspective from '@finos/perspective';
import SERVER_WASM from '@finos/perspective/dist/wasm/perspective-server.wasm?url';
import CLIENT_WASM from '@finos/perspective/dist/wasm/perspective-js.wasm?url';
import PSP_WORKER from '@finos/perspective/dist/cdn/perspective-server.worker.js?url';
import { ProviderTableBridge } from '../../../../../packages/data/host-data/src/runtime/perspective/ProviderTableBridge.js';
import { createPerspectiveEngine } from '../../../../../packages/react-grid/ssrm-grid/src/engine/perspectiveEngine.js';

const WS = 'ws://localhost:8081';
const TOPIC = '/snapshot/positions/trd1';
const TRIGGER = '/snapshot/positions/trd1/10/10';
const END_TOKEN = 'Success';
const TABLE = 'ssrm_demo_positions';
const KEY = 'positionId';

const el = (id: string) => document.getElementById(id)!;
const set = (id: string, v: string | number) => { el(id).textContent = String(v); };
const log = (msg: string, cls = '') => {
  el('log').innerHTML = `<div class="${cls}">${msg}</div>` + el('log').innerHTML;
};

let rowsSeen = 0;
let ticks = 0;
let snapshotDone = false;

async function main(): Promise<void> {
  const t0 = performance.now();
  log('module loaded — booting Perspective SharedWorker…');

  // ── 1. Engine SharedWorker: one Perspective server for every window ──
  const sw = new SharedWorker(PSP_WORKER, { type: 'module', name: `starui-psp:lab:${TABLE}` });
  perspective.init_server(fetch(SERVER_WASM));
  perspective.init_client(fetch(CLIENT_WASM));
  const client = await perspective.worker(Promise.resolve(sw));
  set('boot', `${(performance.now() - t0).toFixed(0)} ms`);

  // ── 2. Attach vs create — the property that makes the Nth window cheap ──
  const hosted: string[] = await client.get_hosted_table_names();
  const isFirst = !hosted.includes(TABLE);
  let table;
  if (isFirst) {
    table = await client.table(
      { positionId: 'string', instrumentName: 'string', currency: 'string',
        quantity: 'float', price: 'float', marketValue: 'float', pnl: 'float' },
      { index: KEY, name: TABLE },
    );
    log('<b>CREATED</b> table — this window owns the feed', 'ok');
  } else {
    table = await client.open_table(TABLE);
    log('<b>ATTACHED</b> to the existing table — no dataset copy, no second feed', 'ok big');
  }
  set('role', isFirst ? 'CREATED table' : 'ATTACHED (shared table)');

  // ── 3. SSRM engine — viewport reads over the shared table ──
  const engine = createPerspectiveEngine({ client: client as never, attachToHostedTable: true });
  await engine.configure({
    dataset: TABLE,
    index: KEY,
    schema: { positionId: 'string', instrumentName: 'string', currency: 'string',
              quantity: 'float', price: 'float', marketValue: 'float', pnl: 'float' },
  });

  // ── 4. Exactly ONE feeder across all windows, elected by a Web Lock.
  //      Held for the window's lifetime; released on close so another
  //      window is promoted automatically.
  void navigator.locks.request('ssrm-demo-feeder', { ifAvailable: true }, async (lock) => {
    if (!lock) {
      log('another window is feeding — this one only reads');
      return;
    }
    set('role', 'FEEDER (holds lock)');
    log('<b>elected FEEDER</b> — connecting to STOMP', 'ok');
    startFeed(table);
    // Hold the lock until this window goes away.
    await new Promise(() => {});
  });

  // ── 5. Poll a viewport the way AG Grid SSRM would ──
  setInterval(() => { void renderBlock(engine); }, 1000);
  setInterval(() => { void renderGrouped(engine); }, 2000);
}

function startFeed(table: unknown): void {
  const bridge = new ProviderTableBridge({
    table: table as never,
    keyColumn: KEY,
    flushMs: 100,
    onFlush: (n) => { set('flushed', n); },
    onError: (e) => log(`write failed: ${String(e)}`, 'bad'),
  });

  const snapshotRows: Record<string, unknown>[] = [];
  const stomp = new StompClient({ brokerURL: WS, reconnectDelay: 2000 });

  stomp.onConnect = () => {
    log('STOMP connected → requesting snapshot');
    stomp.subscribe(TOPIC, (msg) => {
      const body = msg.body?.trim();
      if (!body) return;
      if (body === END_TOKEN || body.includes(END_TOKEN)) {
        snapshotDone = true;
        void bridge.snapshot(snapshotRows).then(() => {
          log(`<b>snapshot committed: ${snapshotRows.length} rows</b>`, 'ok');
          set('rows', snapshotRows.length);
        });
        return;
      }
      let parsed: unknown;
      try { parsed = JSON.parse(body); } catch { return; }
      const batch = Array.isArray(parsed) ? parsed : [parsed];
      rowsSeen += batch.length;
      set('upstream', rowsSeen);
      if (!snapshotDone) {
        snapshotRows.push(...(batch as Record<string, unknown>[]));
      } else {
        ticks += 1;
        set('ticks', ticks);
        bridge.push(batch as Record<string, unknown>[]);   // conflated + flushed
        set('pending', bridge.pendingCount);
      }
    });
    stomp.publish({ destination: TRIGGER, body: '' });
  };
  stomp.onStompError = (f) => log(`STOMP error: ${f.headers.message}`, 'bad');
  stomp.activate();
}

async function renderBlock(engine: ReturnType<typeof createPerspectiveEngine>): Promise<void> {
  const t = performance.now();
  const res = await engine.getRows({
    dataset: TABLE, startRow: 0, endRow: 25,
    rowGroupCols: [], valueCols: [], pivotCols: [], pivotMode: false,
    groupKeys: [], filterModel: {},
    sortModel: [{ colId: 'marketValue', sort: 'desc' }],
  });
  set('blockMs', `${(performance.now() - t).toFixed(1)} ms`);
  set('rows', res.rowCount);

  const cols = ['positionId', 'instrumentName', 'currency', 'quantity', 'price', 'marketValue'];
  el('grid').innerHTML =
    `<tr>${cols.map((c) => `<th>${c}</th>`).join('')}</tr>` +
    res.rowData.slice(0, 25).map((r) =>
      `<tr>${cols.map((c) => `<td>${fmt(r[c])}</td>`).join('')}</tr>`).join('');
}

async function renderGrouped(engine: ReturnType<typeof createPerspectiveEngine>): Promise<void> {
  try {
    const res = await engine.getRows({
      dataset: TABLE, startRow: 0, endRow: 20,
      rowGroupCols: [{ id: 'currency', field: 'currency', displayName: 'Currency' }],
      valueCols: [{ id: 'marketValue', field: 'marketValue', aggFunc: 'sum' }],
      pivotCols: [], pivotMode: false, groupKeys: [], filterModel: {}, sortModel: [],
    });
    el('groups').innerHTML =
      '<tr><th>currency</th><th>children</th><th>sum(marketValue)</th></tr>' +
      res.rowData.map((r) =>
        `<tr><td>${fmt(r.currency)}</td><td>${fmt(r.childCount)}</td>` +
        `<td>${fmt(r.marketValue)}</td></tr>`).join('');
  } catch (err) {
    el('groups').innerHTML = `<tr><td class="bad">group read failed: ${String(err)}</td></tr>`;
  }
}

function fmt(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return String(v);
}

main().catch((err: unknown) => {
  log(`<b>FAILED:</b> ${err instanceof Error ? err.message : String(err)}`, 'bad');
  // eslint-disable-next-line no-console
  console.error('[ssrm-demo]', err);
});
