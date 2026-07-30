/**
 * SharedWorker for the client-wasm sharing probe.
 *
 * ONE question, asked where the previous attempt failed: can the compiled
 * client `WebAssembly.Module` be obtained inside a SharedWorker, and can it
 * LEAVE one? The earlier attempt concluded `getCompiledClientWasm()` blocks the
 * worker's event loop; that conclusion was drawn from a symptom (the attach
 * never replied) that has at least two other causes, so this asks each half
 * separately and reports both instead of inferring one from the other.
 *
 * Reading the vendor source first narrowed it to two candidates:
 *
 *   1. ORDERING. `getCompiledClientWasm()` is a variable read — it answers
 *      `GLOBAL_CLIENT_MODULE`, which `compilerize()` only sets once the client
 *      wasm has finished compiling. Called before that, it THROWS. A rejected
 *      promise loses no race with a 1.5s timeout, it settles first — which is
 *      exactly what "the timeout did not rescue it" looks like.
 *   2. AGENT CLUSTERS. `WebAssembly.Module` is structured-cloneable, but the
 *      HTML spec forbids deserializing one in a different agent cluster. A
 *      dedicated Worker shares its owner's cluster (which is why the earlier
 *      round trip through one succeeded and proved less than it appeared to);
 *      a SharedWorker is its own cluster. If that is the rule, the transfer
 *      throws DataCloneError and no amount of ordering helps.
 *
 * So this probes, in order: the call BEFORE the client exists, the call AFTER
 * it exists, and the postMessage out. Each is reported with its own outcome.
 */
import './customElementsShim.mjs';
import perspective from '@perspective-dev/client/inline';
import { BOOK_NAME, BOOK_ROWS, bookSchema, makeBookColumns } from './mockBook.mjs';

/** Run `fn`, and answer what happened rather than throwing. */
async function attempt(fn) {
  const t0 = performance.now();
  try {
    const value = await fn();
    return { ok: true, ms: performance.now() - t0, value };
  } catch (err) {
    return {
      ok: false,
      ms: performance.now() - t0,
      error: String(err?.message ?? err),
      errorName: err?.name ?? null,
    };
  }
}

/**
 * The call BEFORE any client exists. Run at module scope, on purpose: this is
 * the "eagerly at boot" scope the worklog asks about, and it has to be sampled
 * before anything else can have initialized the client as a side effect.
 *
 * Note the inline build's own top-level `init_client(client_wasm)` has already
 * run by the time this module body executes — but `init_client` is NOT async
 * and the inline build's `await` on it is a no-op, so the compile it kicks off
 * is still in flight. That is the race the ordering hypothesis is about.
 */
const beforeClient = attempt(async () => {
  const mod = await perspective.getCompiledClientWasm();
  return { exports: WebAssembly.Module.exports(mod).length };
});

const ports = new Set();
let stage = 'idle';
function broadcast(message) {
  for (const port of ports) port.postMessage(message);
}
function enter(name) {
  stage = name;
  broadcast({ type: 'boot', stage: name, at: performance.now() });
}

/** Boot the host engine + a small book, once. */
const boot = (async () => {
  enter('creating host Client (perspective.worker())');
  const client = await perspective.worker();
  enter('creating Table');
  const table = await client.table(bookSchema(), { index: 'positionId', name: BOOK_NAME });
  enter('loading the book');
  await table.update(makeBookColumns(BOOK_ROWS));
  enter('ready');
  return { client, table };
})();

/** The call AFTER the host client is up — the ordering hypothesis' treatment. */
let afterClient = null;
function whenAfterClient() {
  if (afterClient === null) {
    afterClient = (async () => {
      await boot;
      return attempt(async () => {
        const mod = await perspective.getCompiledClientWasm();
        return { exports: WebAssembly.Module.exports(mod).length };
      });
    })();
  }
  return afterClient;
}

/** Same attach as the production host — see `pspHost.mjs` for why each line. */
function attach(client, framePort) {
  const session = client.new_proxy_session((response) => {
    const frame = response.slice().buffer;
    framePort.postMessage(frame, [frame]);
  });
  let queue = Promise.resolve();
  framePort.onmessage = (event) => {
    const data = event.data;
    if (data && data.cmd === 'init') {
      framePort.postMessage({ id: data.id });
      return;
    }
    queue = queue
      .then(() => session.handle_request(new Uint8Array(data)))
      .catch((err) => console.error('[wasm-share-host] handle_request failed', err));
  };
  framePort.start();
  return session;
}

async function onControl(port, event) {
  const msg = event.data ?? {};
  try {
    if (msg.cmd === 'probe') {
      const before = await beforeClient;
      const after = await whenAfterClient();

      // The transfer question, asked separately from the getter question. A
      // throw here is the agent-cluster rule; it must not be reported as the
      // getter failing.
      let transfer = { attempted: false };
      if (after.ok) {
        const mod = await perspective.getCompiledClientWasm();
        try {
          port.postMessage({ type: 'module', module: mod });
          transfer = { attempted: true, threw: false };
        } catch (err) {
          transfer = {
            attempted: true,
            threw: true,
            error: String(err?.message ?? err),
            errorName: err?.name ?? null,
          };
        }
      }
      port.postMessage({ type: 'probe', before, after, transfer });
      return;
    }

    if (msg.cmd === 'attach') {
      const framePort = event.ports[0];
      if (!framePort) throw new Error('attach requires a transferred MessagePort');
      const { client } = await boot;
      attach(client, framePort);
      port.postMessage({ type: 'attached', id: msg.id ?? null });
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
  void boot.catch((err) =>
    broadcast({ type: 'error', detail: `boot failed at "${stage}": ${String(err?.message ?? err)}` }),
  );
};
