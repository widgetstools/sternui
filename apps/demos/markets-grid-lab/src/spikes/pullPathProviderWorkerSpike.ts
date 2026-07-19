/**
 * Worklog T3 verification — the REAL provider SharedWorker feeds a
 * worker-hosted Perspective table end-to-end:
 *
 *   1. boot `starui-provider:lab:pullpos` from the built bundle asset;
 *   2. raw-protocol `attach` with an inline STOMP cfg → the worker starts
 *      the transport (no page-side STOMP);
 *   3. `linkProviderToPerspective` hands a transferred port to the provider
 *      worker (`psp-attach`), which seeds the table from its cache and tees
 *      every subsequent frame into the bridge;
 *   4. this page reads viewports over its OWN Perspective connection — the
 *      main thread is out of the table's data path.
 *
 * Needs `npm run dev:stomp` on :8081 (ideally SWEEP_ROWS_PER_SEC=2000).
 * Deleted with the pull-path spikes once the container path lands.
 */
import perspective from '@finos/perspective';
import SERVER_WASM from '@finos/perspective/dist/wasm/perspective-server.wasm?url';
import CLIENT_WASM from '@finos/perspective/dist/wasm/perspective-js.wasm?url';
import providerWorkerUrl from '@wellsfargo-starui/host-data/assets/provider-worker.mjs?url';
import pspWorkerUrl from '@wellsfargo-starui/host-data/assets/perspective-server.worker.mjs?url';
import { linkProviderToPerspective } from '../../../../../packages/data/host-data/src/runtime/perspective/perspectiveWorkerLink.js';

const APP_ID = 'lab';
const PROVIDER_ID = 'pullpos';
const DATASET = 'positions';
const KEY = 'positionId';
const SUB_ID = 'pull-spike-1';

const STOMP_CFG = {
  providerType: 'stomp',
  websocketUrl: 'ws://localhost:8081',
  listenerTopic: '/snapshot/positions/trd1',
  requestMessage: '/snapshot/positions/trd1/1000/10',
  snapshotEndToken: 'Success',
  keyColumn: KEY,
  throttleEnabled: true,
  throttleMs: 100,
  conflateEnabled: true,
  conflateByKey: KEY,
  projectFields: false,
  wireFormat: 'columnar',
  reconnect: { initialDelayMs: 500 },
};

const t0 = performance.now();
const elapsed = () => `${((performance.now() - t0) / 1000).toFixed(1)}s`;
const el = (id: string) => document.getElementById(id)!;
const set = (id: string, v: string | number) => { el(id).textContent = String(v); };
const log = (msg: string, cls = '') => {
  el('log').innerHTML = `<div class="${cls}">${msg}</div>` + el('log').innerHTML;
};

interface SpikeResult {
  linked: boolean;
  providerStatus: string;
  tableSize: number;
  blockMs: number | null;
  updatesSeen: number;
  pushDeltasSeen: number;
  error?: string;
}

const result: SpikeResult = {
  linked: false,
  providerStatus: 'unknown',
  tableSize: 0,
  blockMs: null,
  updatesSeen: 0,
  pushDeltasSeen: 0,
};

function publishResult(done = false): void {
  el('result').textContent = JSON.stringify(result);
  if (done) el('result').setAttribute('data-done', '1');
}

async function main(): Promise<void> {
  log(`provider worker: ${providerWorkerUrl}`);

  // 1. Real provider SharedWorker.
  const providerSW = new SharedWorker(providerWorkerUrl, {
    type: 'module',
    name: `starui-provider:${APP_ID}:${PROVIDER_ID}`,
  });
  providerSW.port.start();

  providerSW.port.addEventListener('message', (ev: MessageEvent) => {
    const data = ev.data as { kind?: string; status?: string; linked?: boolean; error?: string };
    if (data?.kind === 'status') {
      result.providerStatus = data.status ?? 'unknown';
      set('status', result.providerStatus);
      if (data.error) log(`provider error: ${data.error}`, 'bad');
      publishResult();
    } else if (data?.kind === 'delta' || data?.kind === 'delta-bin') {
      result.pushDeltasSeen += 1;
      set('pushDeltas', result.pushDeltasSeen);
    } else if (data?.kind === 'config-snapshot') {
      const intro = (data as unknown as {
        introspect?: { providers?: { providerId: string; rowCount?: number; status?: string }[] };
      }).introspect;
      log(`introspect@${elapsed()}: ${JSON.stringify(intro?.providers?.map(
        (p) => ({ id: p.providerId, rows: p.rowCount, status: p.status }),
      ) ?? data).slice(0, 300)}`);
    } else if (data?.kind === 'psp-attach-ok') {
      result.linked = Boolean(data.linked);
      log(
        data.linked
          ? `<b>psp-attach-ok@${elapsed()} — provider worker linked to the table</b>`
          : `psp-attach-ok@${elapsed()} linked=false${data.error ? ` (${data.error})` : ''}`,
        data.linked ? 'ok big' : data.error ? 'bad' : '',
      );
      publishResult();
    }
  });

  // 2. Start the transport inside the worker (inline cfg attach).
  providerSW.port.postMessage({
    kind: 'attach', subId: SUB_ID, providerId: PROVIDER_ID, mode: 'data', cfg: STOMP_CFG,
  });
  const pingTimer = setInterval(() => {
    providerSW.port.postMessage({ kind: 'ping', subId: SUB_ID });
  }, 10_000);
  setInterval(() => {
    providerSW.port.postMessage({ kind: 'hub-introspect', reqId: 'spike-introspect' });
  }, 3_000);
  window.addEventListener('beforeunload', () => {
    clearInterval(pingTimer);
    providerSW.port.postMessage({ kind: 'detach', subId: SUB_ID });
  });
  log('attach posted — STOMP starts inside the provider worker');

  // 3. Hand-off once the snapshot is up (the container flow links after
  //    attach settles). The window introduces provider worker ↔ engine worker.
  let linkPosted = false;
  const postLink = () => {
    if (linkPosted) return;
    linkPosted = true;
    linkProviderToPerspective({
      appId: APP_ID,
      providerId: PROVIDER_ID,
      dataset: DATASET,
      keyColumn: KEY,
      workerScriptUrl: pspWorkerUrl,
      providerPort: providerSW.port,
    });
    log(`psp-attach hand-off posted@${elapsed()} (transferred port)`);
  };
  const linkWhenReady = (ev: MessageEvent) => {
    const data = ev.data as { kind?: string; status?: string };
    if (data?.kind === 'status' && data.status === 'ready') {
      providerSW.port.removeEventListener('message', linkWhenReady);
      postLink();
    }
  };
  providerSW.port.addEventListener('message', linkWhenReady);

  // 4. This page's own read connection to the same engine worker.
  perspective.init_server(fetch(SERVER_WASM));
  perspective.init_client(fetch(CLIENT_WASM));
  const readSW = new SharedWorker(pspWorkerUrl, {
    type: 'module',
    name: `starui-psp:${APP_ID}:${PROVIDER_ID}`,
  });
  const client = await perspective.worker(Promise.resolve(readSW));
  log('read-side Perspective client connected');

  // Wait for the provider worker to create the table (the link waits for
  // the snapshot, which takes tens of seconds at low sweep rates).
  let table: Awaited<ReturnType<typeof client.open_table>> | null = null;
  for (let i = 0; i < 1200 && !table; i++) {
    const hosted: string[] = await client.get_hosted_table_names();
    if (hosted.includes(DATASET)) table = await client.open_table(DATASET);
    else await new Promise((r) => setTimeout(r, 100));
  }
  if (!table) {
    result.error = 'table never appeared (provider worker did not link/seed)';
    log(result.error, 'bad');
    publishResult(true);
    return;
  }
  log('<b>table opened from the READ side — no dataset copy in this window</b>', 'ok');

  const view = await table.view({ sort: [['marketValue', 'desc']] });
  await view.on_update(() => {
    result.updatesSeen += 1;
    set('updates', result.updatesSeen);
  });

  const cols = [KEY, 'trader', 'desk', 'currentPrice', 'pnl'];
  const readBlock = async () => {
    const t = performance.now();
    const block = (await view.to_columns({ start_row: 0, end_row: 25 })) as Record<string, unknown[]>;
    result.blockMs = Number((performance.now() - t).toFixed(2));
    result.tableSize = await table!.size();
    set('rows', result.tableSize);
    set('blockMs', `${result.blockMs} ms`);
    const first = cols.filter((c) => c in block);
    const n = Math.min(25, (block[first[0] ?? KEY] ?? []).length);
    el('grid').innerHTML =
      `<tr>${first.map((c) => `<th>${c}</th>`).join('')}</tr>` +
      Array.from({ length: n }, (_, i) =>
        `<tr>${first.map((c) => `<td>${String(block[c]?.[i] ?? '')}</td>`).join('')}</tr>`,
      ).join('');
    publishResult();
  };

  await readBlock();
  setInterval(() => { void readBlock(); }, 1000);

  // Declare the run "done" once the table has real rows, the link acked,
  // and at least one incremental update has landed.
  const doneCheck = setInterval(() => {
    if (result.linked && result.tableSize > 0 && result.updatesSeen > 0) {
      clearInterval(doneCheck);
      log('<b>T3 acceptance met: provider → worker-hosted table, live updates flowing</b>', 'ok big');
      publishResult(true);
    }
  }, 500);
}

main().catch((err: unknown) => {
  result.error = err instanceof Error ? err.message : String(err);
  log(`<b>FAILED:</b> ${result.error}`, 'bad');
  publishResult(true);
  // eslint-disable-next-line no-console
  console.error('[pull-path-spike]', err);
});
