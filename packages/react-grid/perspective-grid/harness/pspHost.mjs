/**
 * The SharedWorker host — one Perspective engine and one Table for every
 * blotter window on the desktop.
 *
 * This is the piece ARCHITECTURE.md calls "the seam". Windows never
 * materialize the book; they open a View against the Table living here and
 * read only the rows their viewport asks for.
 *
 * Roles (forced by the runtime, see ARCHITECTURE.md "Process split"):
 *
 *   here (worker)   perspective.worker()          -> the host Client, owns the Table
 *                   client.new_proxy_session(cb)  -> one per attached window
 *                   session.handle_request(frame) <- frames from that window
 *
 *   there (window)  perspective.worker(port)      -> that window's Client
 *                   client.open_table('blotter')  -> Table handle -> View
 *
 * `perspective.worker()` here spawns the engine into a nested dedicated
 * worker and hands back a Client wired to it. That Client is what the
 * ProxySessions proxy onto, so all windows and the feed share ONE engine and
 * ONE copy of the book.
 *
 * Protocol on each window's SharedWorker port (control), which is kept
 * separate from the perspective frame port so neither has to sniff the
 * other's messages:
 *
 *   -> { cmd: 'attach' } + [framePort]   attach a window's Client
 *   -> { cmd: 'status' }                 boot timings + table size
 *   -> { cmd: 'tick', on, rows, everyMs } start/stop the mock feed
 *   <- { type: 'ready' | 'status' | 'tick' | 'error', ... }
 */
import './customElementsShim.mjs';
import perspective from '@perspective-dev/client/inline';
import { BOOK_NAME, BOOK_ROWS, bookSchema, makeBookColumns, makeTickColumns } from './mockBook.mjs';

/** Every connected control port — boot progress is broadcast to all of them,
 *  because a SharedWorker's own console output is not visible from any window
 *  and a stall here would otherwise be a silent hang. */
const ports = new Set();
function broadcast(message) {
  for (const port of ports) port.postMessage(message);
}

let stage = 'idle';
function enter(name) {
  stage = name;
  broadcast({ type: 'boot', stage: name, at: performance.now() });
}

/** Boot once, no matter how many windows connect or how fast. */
const boot = (async () => {
  const t0 = performance.now();
  enter('creating host Client (perspective.worker())');
  const client = await perspective.worker();
  const clientMs = performance.now() - t0;

  enter('creating Table');
  const t1 = performance.now();
  const table = await client.table(bookSchema(), { index: 'positionId', name: BOOK_NAME });
  const tableMs = performance.now() - t1;

  enter('generating the mock book');
  const t2 = performance.now();
  const columns = makeBookColumns(BOOK_ROWS);
  const generateMs = performance.now() - t2;

  enter('loading the book into the Table');
  const t3 = performance.now();
  await table.update(columns);
  const loadMs = performance.now() - t3;
  enter('ready');

  return {
    client,
    table,
    timings: {
      clientMs,
      tableMs,
      generateMs,
      loadMs,
      totalMs: performance.now() - t0,
    },
  };
})();

/** Windows attached so far — only for reporting. */
let attachedCount = 0;

/**
 * Bridge one window's Client to the host Client.
 *
 * The window speaks the same wire protocol the vendor's own server worker
 * speaks: one `{cmd:'init'}` handshake that must be answered with exactly one
 * message, then raw protocol frames in both directions. `_init` in
 * `wasm/browser.ts` resolves on the FIRST message it sees, so the ack must
 * not be batched with anything else.
 *
 * The `args[0]` of the init message is the window's copy of the server wasm.
 * We ignore it: the engine is already up here, and that is the entire point
 * of hosting it once.
 */
function attach(client, framePort) {
  const session = client.new_proxy_session((response) => {
    // COPY before it leaves. Protocol buffers are views over the wasm
    // HEAPU8, which DETACHES when wasm memory grows; every vendor transport
    // slices for the same reason.
    const frame = response.slice().buffer;
    framePort.postMessage(frame, [frame]);
  });

  // Requests are serialized. `handle_request` is async and MessagePort
  // delivery does not wait for it, so without this chain frame N+1 can enter
  // the engine while frame N is still being decoded.
  let queue = Promise.resolve();

  framePort.onmessage = (event) => {
    const data = event.data;
    if (data && data.cmd === 'init') {
      framePort.postMessage({ id: data.id });
      return;
    }
    queue = queue
      .then(() => session.handle_request(new Uint8Array(data)))
      .catch((err) => console.error('[psp-host] handle_request failed', err));
  };
  framePort.start();

  attachedCount += 1;
  return session;
}

/** The mock feed — stands in for the STOMP provider until it is wired up. */
let tickTimer = null;
let tickCount = 0;
let tickTotalMs = 0;
let ticks = 0;

async function setTicking(on, rows, everyMs) {
  if (tickTimer !== null) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
  if (!on) return;

  const { table } = await boot;
  let running = false;
  tickTimer = setInterval(() => {
    // Skip rather than pile up: a slow update must not queue behind itself.
    if (running) return;
    running = true;
    const started = performance.now();
    table
      .update(makeTickColumns(rows, tickCount++))
      .then(() => {
        tickTotalMs += performance.now() - started;
        ticks += 1;
      })
      .catch((err) => console.error('[psp-host] tick failed', err))
      .finally(() => {
        running = false;
      });
  }, everyMs);
}

async function onControl(port, event) {
  const msg = event.data ?? {};
  try {
    if (msg.cmd === 'attach') {
      const framePort = event.ports[0];
      if (!framePort) throw new Error('attach requires a transferred MessagePort');
      const { client, timings } = await boot;
      attach(client, framePort);
      port.postMessage({ type: 'ready', timings, attached: attachedCount });
      return;
    }

    if (msg.cmd === 'status') {
      const { table, timings } = await boot;
      port.postMessage({
        type: 'status',
        timings,
        attached: attachedCount,
        rows: await table.size(),
        ticks,
        meanTickMs: ticks > 0 ? tickTotalMs / ticks : null,
      });
      return;
    }

    if (msg.cmd === 'tick') {
      await setTicking(msg.on, msg.rows ?? 500, msg.everyMs ?? 200);
      ticks = 0;
      tickTotalMs = 0;
      port.postMessage({ type: 'tick', on: !!msg.on, rows: msg.rows ?? 500, everyMs: msg.everyMs ?? 200 });
      return;
    }

    port.postMessage({ type: 'error', detail: `unknown command ${String(msg.cmd)}` });
  } catch (err) {
    port.postMessage({ type: 'error', detail: String(err?.message ?? err) });
  }
}

self.onconnect = (event) => {
  const port = event.ports[0];
  ports.add(port);
  port.onmessage = (ev) => void onControl(port, ev);
  port.start();
  port.postMessage({ type: 'connected', stage, at: performance.now() });
  // Kick the boot off on the first connection rather than at module scope, so
  // the cost is attributed to a window that actually wants the book.
  void boot.catch((err) =>
    broadcast({ type: 'error', detail: `boot failed at "${stage}": ${String(err?.message ?? err)}` }),
  );
};

self.onerror = (err) => broadcast({ type: 'error', detail: `worker error: ${String(err?.message ?? err)}` });
