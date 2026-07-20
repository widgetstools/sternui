/**
 * THE pull-architecture demo (worklog Phase 4 preview): N real SSRM blotters
 * over ONE STOMP provider and ONE worker-hosted Perspective table.
 *
 *  - STOMP runs inside `starui-provider:lab:pullblot` (the real bundle);
 *  - rows land once in a Perspective table in `starui-psp:lab:pullblot`;
 *  - every blotter is the production `SsrmGrid` with an injected
 *    `createPerspectiveEngine` (pull mode: NO rowData prop — the grid only
 *    fetches viewport blocks, never a dataset copy).
 *
 * The headline: once the table exists, a new blotter (or a second browser
 * window on this URL) shows data in milliseconds — it attaches, it does not
 * copy. Needs `npm run dev:stomp`. Deleted with the container pull path.
 */
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import perspective from '@finos/perspective';
import SERVER_WASM from '@finos/perspective/dist/wasm/perspective-server.wasm?url';
import CLIENT_WASM from '@finos/perspective/dist/wasm/perspective-js.wasm?url';
import providerWorkerUrl from '@wellsfargo-starui/host-data/assets/provider-worker.mjs?url';
import pspWorkerUrl from '@wellsfargo-starui/host-data/assets/perspective-server.worker.mjs?url';
import { linkProviderToPerspective } from '../../../../../packages/data/host-data/src/runtime/perspective/perspectiveWorkerLink.js';
import {
  SsrmGrid,
  type SsrmGridHandle,
  type SSRMColDef,
} from '@wellsfargo-starui/ssrm-grid';
import { createPerspectiveEngine } from '../../../../../packages/react-grid/ssrm-grid/src/engine/perspectiveEngine.js';
import type { PerspectiveClient } from '../../../../../packages/react-grid/ssrm-grid/src/engine/perspectiveTypes.js';

const APP_ID = 'lab';
const PROVIDER_ID = 'pullblot';
const DATASET = 'main'; // must match SsrmGrid's internal dataset id
const KEY = 'positionId';
const SUB_ID = 'pull-blotters-1';

const STOMP_CFG = {
  providerType: 'stomp',
  websocketUrl: 'ws://localhost:8081',
  listenerTopic: '/snapshot/positions/trd1',
  // rate=1000 (live pace); batchSize=2000 rows per 10ms server batch -
  // the third segment is BATCH SIZE, not rate; 10 meant 1k rows/s and a
  // 20s snapshot.
  requestMessage: '/snapshot/positions/trd1/1000/2000',
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

const COLUMN_DEFS: SSRMColDef[] = [
  { field: 'positionId', headerName: 'Position', cellDataType: 'text' },
  { field: 'ticker', headerName: 'Ticker', cellDataType: 'text' },
  { field: 'instrumentName', headerName: 'Instrument', cellDataType: 'text' },
  { field: 'trader', headerName: 'Trader', cellDataType: 'text' },
  { field: 'desk', headerName: 'Desk', cellDataType: 'text' },
  { field: 'currency', headerName: 'Ccy', cellDataType: 'text' },
  { field: 'currentPrice', headerName: 'Price', cellDataType: 'number' },
  { field: 'pnl', headerName: 'PnL', cellDataType: 'number' },
];

/** Test hook — blotter handles, for headless driving (spike page only). */
const blotterHandles: (SsrmGridHandle | null)[] =
  ((window as { __blotters?: (SsrmGridHandle | null)[] }).__blotters ??= []);

/** One production SsrmGrid over its own Perspective engine (pull mode). */
function Blotter({ client, index }: { client: PerspectiveClient; index: number }) {
  const ref = React.useRef<SsrmGridHandle>(null);
  const hostRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    blotterHandles[index] = ref.current;
    return () => {
      blotterHandles[index] = null;
    };
  }, [index]);
  const engine = React.useMemo(
    () => createPerspectiveEngine({ client, attachToHostedTable: true }),
    [client],
  );
  const mountedAt = React.useMemo(() => performance.now(), []);
  const [loadMs, setLoadMs] = React.useState<number | null>(null);

  React.useEffect(() => {
    // DOM probe (RowApiModule not registered): any painted cell with text
    // wins (the first cell in DOM order is the blank selection checkbox).
    const timer = setInterval(() => {
      const cells = hostRef.current?.querySelectorAll('.ag-row .ag-cell') ?? [];
      for (const cell of cells) {
        if ((cell.textContent ?? '').trim() !== '') {
          setLoadMs(performance.now() - mountedAt);
          clearInterval(timer);
          return;
        }
      }
    }, 25);
    return () => clearInterval(timer);
  }, [mountedAt]);

  return (
    <div
      ref={hostRef}
      style={{ flex: 1, minWidth: 480, display: 'flex', flexDirection: 'column', gap: 4 }}
    >
      <div style={{ font: '12px ui-monospace, monospace', color: '#8a94a6' }}>
        blotter #{index + 1} ·{' '}
        {loadMs === null ? (
          'loading…'
        ) : (
          <b
            data-testid={`blotter-${index}-load-ms`}
            style={{ color: '#6ee7a8' }}
          >
            first rows in {loadMs.toFixed(0)} ms
          </b>
        )}{' '}
        · viewport blocks only — no dataset copy
      </div>
      <div style={{ height: 420 }}>
        <SsrmGrid
          ref={ref}
          engine={engine}
          columnDefs={COLUMN_DEFS}
          getRowId={KEY}
          height="100%"
        />
      </div>
    </div>
  );
}

function App({ client }: { client: PerspectiveClient }) {
  const [blotters, setBlotters] = React.useState([0]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <button
          data-testid="add-blotter"
          onClick={() => setBlotters((b) => [...b, b.length])}
          style={{
            font: '13px ui-monospace, monospace',
            background: '#1b2333',
            color: '#d5dae2',
            border: '1px solid #2c3a52',
            borderRadius: 6,
            padding: '6px 14px',
            cursor: 'pointer',
          }}
        >
          + Add blotter (attaches — does not copy)
        </button>
        <span style={{ font: '12px ui-monospace, monospace', color: '#6b7686', marginLeft: 12 }}>
          or open this URL in a second window — same table, still one STOMP connection
        </span>
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {blotters.map((i) => (
          <Blotter key={i} client={client} index={i} />
        ))}
      </div>
    </div>
  );
}

const el = (id: string) => document.getElementById(id)!;
const log = (msg: string, cls = '') => {
  el('log').innerHTML = `<div class="${cls}">${msg}</div>` + el('log').innerHTML;
};

async function main(): Promise<void> {
  // 1. Real provider SharedWorker — starts STOMP on attach; idempotent when
  //    the worker (and its snapshot) already exist from an earlier window.
  const providerSW = new SharedWorker(providerWorkerUrl, {
    type: 'module',
    name: `starui-provider:${APP_ID}:${PROVIDER_ID}`,
  });
  providerSW.port.start();
  providerSW.port.addEventListener('message', (ev: MessageEvent) => {
    const data = ev.data as { kind?: string; status?: string; linked?: boolean; error?: string };
    if (data?.kind === 'status') {
      el('status').textContent = data.status ?? '…';
    } else if (data?.kind === 'psp-attach-ok') {
      log(
        data.linked
          ? '<b>provider worker linked to the table</b>'
          : `link deferred (${data.error ?? 'already linked by another window'})`,
        data.linked ? 'ok' : '',
      );
    }
  });
  providerSW.port.postMessage({
    kind: 'attach', subId: SUB_ID, providerId: PROVIDER_ID, mode: 'data', cfg: STOMP_CFG,
  });
  // 2. Hand-off IMMEDIATELY — the attach handler infers the table schema from
  //    the provider's first cached rows, so the engine worker's WASM
  //    fetch/compile overlaps the STOMP snapshot instead of following it.
  linkProviderToPerspective({
    appId: APP_ID,
    providerId: PROVIDER_ID,
    dataset: DATASET,
    keyColumn: KEY,
    workerScriptUrl: pspWorkerUrl,
    providerPort: providerSW.port,
  });
  log('psp-attach hand-off posted (parallel with the snapshot)');
  setInterval(() => {
    providerSW.port.postMessage({ kind: 'ping', subId: SUB_ID });
  }, 10_000);
  window.addEventListener('beforeunload', () => {
    providerSW.port.postMessage({ kind: 'detach', subId: SUB_ID });
  });
  log('provider attach posted — STOMP runs inside the worker');

  // 3. This window's own Perspective connection (read side).
  perspective.init_server(fetch(SERVER_WASM));
  perspective.init_client(fetch(CLIENT_WASM));
  const readSW = new SharedWorker(pspWorkerUrl, {
    type: 'module',
    name: `starui-psp:${APP_ID}:${PROVIDER_ID}`,
  });
  const client = (await perspective.worker(Promise.resolve(readSW))) as unknown as PerspectiveClient;
  log('read-side Perspective client connected');

  // 4. Mount blotters the moment the table exists (first-ever run waits for
  //    the upstream snapshot; every later window/blotter attaches instantly).
  const t0 = performance.now();
  for (;;) {
    const hosted = (await (client as unknown as {
      get_hosted_table_names(): Promise<string[]>;
    }).get_hosted_table_names());
    if (hosted.includes(DATASET)) break;
    el('status').textContent = `waiting for first snapshot… ${((performance.now() - t0) / 1000).toFixed(0)}s`;
    await new Promise((r) => setTimeout(r, 200));
  }
  el('status').textContent = 'table hosted';
  log(`<b>table available after ${((performance.now() - t0) / 1000).toFixed(1)}s — mounting blotters</b>`, 'ok');

  createRoot(el('root')).render(<App client={client} />);
}

main().catch((err: unknown) => {
  log(`<b>FAILED:</b> ${err instanceof Error ? err.message : String(err)}`, 'bad');
  // eslint-disable-next-line no-console
  console.error('[pull-blotters]', err);
});
