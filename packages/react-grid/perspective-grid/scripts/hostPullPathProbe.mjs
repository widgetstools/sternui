/**
 * The whole pull path in one process, with the real engine and the real feed.
 *
 *   STOMP provider -> createPerspectiveTableFeed -> Table (host-owned)
 *                     createPerspectiveHost.attach(port) -> ProxySession
 *                       -> a SECOND Client that never saw the rows
 *                          -> open_table -> View -> windowed read
 *
 * The claim under test is the one the architecture rests on: a window opens a
 * Table it did not create and reads only its viewport, while the book lives
 * once on the other side of the seam. Unit tests cannot show that — they fake
 * the engine, which is exactly the part that has to be real here.
 *
 * Run (needs the STOMP view server on 8081):
 *   npx tsx packages/react-grid/perspective-grid/scripts/hostPullPathProbe.mjs
 */
import * as psp from '@perspective-dev/client/node';
import { startStomp } from '../../../data/host-data/src/runtime/providers/transports/stomp.ts';
import { createPerspectiveTableFeed } from '../../../data/host-data/src/runtime/perspective/perspectiveTableFeed.ts';
import { createPerspectiveHost } from '../../../data/host-data/src/runtime/perspective/perspectiveHost.ts';

const CLIENT = process.env.CLIENT ?? 'TRADER001';
const RUN_MS = Number(process.env.RUN_MS ?? 40000);
const TABLE = 'positions';

const cfg = {
  providerType: 'stomp',
  websocketUrl: process.env.WS_URL ?? 'ws://localhost:8081',
  listenerTopic: `/snapshot/positions/${CLIENT}`,
  requestMessage: `/snapshot/positions/${CLIENT}/7/50`,
  requestBody: '',
  snapshotEndToken: 'Success',
  snapshotTimeoutMs: 60_000,
  dataType: 'positions',
  keyColumn: 'positionId',
  autoStart: true,
  snapshotChunkSize: 1000,
};

/** A host Client bound to the in-process engine — the node stand-in for what
 *  `perspective.worker()` returns inside a SharedWorker. */
async function makeHostClient() {
  let client;
  const session = await psp.make_session(async (response) => {
    await client.handle_response(response);
  });
  client = psp.make_client(async (request) => {
    await session.handle_request(request);
  });
  return client;
}

const errors = [];
const diagnostics = [];

const hostClient = await makeHostClient();
const host = createPerspectiveHost({
  loadPerspective: async () => ({ worker: async () => hostClient }),
  onError: (stage, err) => errors.push({ stage, message: String(err?.message ?? err) }),
});

const feed = createPerspectiveTableFeed({
  keyColumn: cfg.keyColumn,
  createTable: host.tableFactoryFor(TABLE),
  onDiagnostic: (d) => diagnostics.push(d.kind === 'schema' ? { kind: 'schema', rows: d.rows, nested: d.nested, mixed: d.mixed } : d),
});

const handle = startStomp(cfg, feed.tap(() => {}));

/**
 * Stand in for a blotter window: a Client on the far side of a port, which
 * only ever sees protocol frames — never a row.
 */
async function attachWindow() {
  let windowClient;
  let ackInit;
  const acked = new Promise((resolve) => {
    ackInit = resolve;
  });

  const port = {
    onmessage: null,
    start() {},
    postMessage(message) {
      // host -> window
      if (message && !(message instanceof ArrayBuffer) && typeof message === 'object') {
        ackInit();
        return;
      }
      void windowClient.handle_response(new Uint8Array(message));
    },
  };

  await host.attach(port);

  windowClient = psp.make_client(async (request) => {
    // window -> host, through the port the host is listening on
    const frame = request.slice().buffer;
    port.onmessage({ data: frame });
  });

  // The vendor handshake the host answers with exactly one message.
  port.onmessage({ data: { cmd: 'init', id: 1 } });
  await acked;
  return windowClient;
}

setTimeout(async () => {
  const report = { errors, diagnostics };
  try {
    await feed.whenReady();
    await feed.drain();

    const windowClient = await attachWindow();

    // 1. The window can SEE a table it never created.
    const t0 = Date.now();
    report.hostedTablesSeenByWindow = await windowClient.get_hosted_table_names();
    const table = await windowClient.open_table(TABLE);
    report.openTableMs = Date.now() - t0;
    report.rowsReportedToWindow = await table.size();

    // 2. Reads are windowed and flat with depth — no rows crossed until asked.
    const view = await table.view({ sort: [['pnl', 'desc']] });
    report.viewRows = await view.num_rows();
    const depths = [0, 10_000, 19_900];
    report.windowedReads = [];
    for (const start of depths) {
      const t = Date.now();
      const columns = await view.to_columns({ start_row: start, end_row: start + 100 });
      report.windowedReads.push({
        at: start,
        ms: Date.now() - t,
        rows: columns.positionId?.length ?? 0,
        cols: Object.keys(columns).length,
      });
    }

    // 3. The book keeps moving underneath while the window reads it.
    const before = await view.to_columns({ start_row: 0, end_row: 1 });
    await new Promise((r) => setTimeout(r, 3000));
    const after = await view.to_columns({ start_row: 0, end_row: 1 });
    report.bookMovedUnderTheWindow =
      JSON.stringify(before.pnl) !== JSON.stringify(after.pnl) ||
      before.positionId?.[0] !== after.positionId?.[0];
    report.rowsAfterTicking = await table.size();

    await view.delete();
  } catch (err) {
    report.fatal = String(err?.stack ?? err).slice(0, 500);
  }

  console.log(JSON.stringify(report, null, 1));
  await feed.stop();
  await host.stop();
  await handle.stop();
  process.exit(0);
}, RUN_MS);
