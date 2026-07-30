/**
 * One window-side strategy per Worker, so each gets a FRESH module instance.
 *
 * `init_client` writes a module-global that can only be set meaningfully once,
 * so five candidate incantations cannot be tried in one page — the second would
 * be answering the first's state. A dedicated Worker per mode is the cheapest
 * way to get five clean rooms, and it costs nothing extra to also read that
 * Worker's own `performance.getEntriesByType('resource')`, which is the exact
 * measurement the acceptance criterion asks for (does this window fetch 47 kB
 * or 5,070 kB).
 *
 * Each mode ends at the SAME assertion — open the SharedWorker's Table and
 * report its row count — because a strategy that initializes without throwing
 * and then cannot read a row has not worked. The frame port is attached to the
 * host by the page and transferred in.
 *
 * Modes:
 *   inline                 today's behaviour — the 5,070 kB build. Control.
 *   fetch                  slim build + the 521 kB wasm fetched as an asset.
 *                          Needs no cross-worker transfer at all.
 *   module-direct          slim build + `init_client(mod)`.
 *   module-promise         slim build + `init_client(Promise.resolve(mod))`.
 *   module-promise-raw     slim build + `init_client(Promise.resolve(mod), true)`.
 *
 * The three `module-*` modes exist because reading the vendor source says a
 * compiled `WebAssembly.Module` falls through `init_client`'s branches to the
 * bare `instanceof Object` arm, which stores it as if it were the JS glue
 * module — so the documented shape may simply not be wired up in 4.5.2. That is
 * a claim about minified vendor code, so it is measured rather than asserted.
 */
import './customElementsShim.mjs';
import { BOOK_NAME } from './mockBook.mjs';
import clientWasmUrl from '@perspective-dev/client/dist/wasm/perspective-js.wasm?url';

/**
 * The window never runs the server — the engine lives in the SharedWorker and
 * the host IGNORES the `args[0]` of the init handshake (see `perspectiveHost.ts`).
 * But `get_server()` throws outright when nothing was registered, so the slim
 * path has to hand it something. An empty buffer with stage 0 disabled is the
 * smallest thing that satisfies it, and it is never compiled or run.
 */
function registerUnusedServerWasm(perspective) {
  perspective.init_server(new ArrayBuffer(0), true);
}

async function loadPerspective(mode, clientModule) {
  if (mode === 'inline') {
    const perspective = await import('@perspective-dev/client/inline');
    return perspective.default ?? perspective;
  }

  const slim = await import('@perspective-dev/client');
  const perspective = slim.default ?? slim;

  if (mode === 'fetch') {
    perspective.init_client(await fetch(clientWasmUrl));
  } else if (mode === 'module-direct') {
    perspective.init_client(clientModule);
  } else if (mode === 'module-promise') {
    perspective.init_client(Promise.resolve(clientModule));
  } else if (mode === 'module-promise-raw') {
    perspective.init_client(Promise.resolve(clientModule), true);
  } else {
    throw new Error(`unknown mode ${mode}`);
  }

  registerUnusedServerWasm(perspective);
  return perspective;
}

/** Bytes this worker actually pulled over the network, biggest first. */
function resourceReport() {
  return performance
    .getEntriesByType('resource')
    .map((entry) => ({
      name: entry.name.slice(entry.name.lastIndexOf('/') + 1),
      transferSize: entry.transferSize,
      encodedBodySize: entry.encodedBodySize,
      decodedBodySize: entry.decodedBodySize,
    }))
    .sort((a, b) => b.decodedBodySize - a.decodedBodySize);
}

self.onmessage = async (event) => {
  const { mode, clientModule } = event.data ?? {};
  const framePort = event.ports[0];
  const t0 = performance.now();
  try {
    const perspective = await loadPerspective(mode, clientModule);
    const loadMs = performance.now() - t0;

    const client = await perspective.worker(Promise.resolve(framePort));
    const clientMs = performance.now() - t0 - loadMs;

    const table = await client.open_table(BOOK_NAME);
    const rows = await table.size();

    self.postMessage({
      mode,
      ok: true,
      rows,
      loadMs,
      clientMs,
      totalMs: performance.now() - t0,
      resources: resourceReport(),
    });
  } catch (err) {
    self.postMessage({
      mode,
      ok: false,
      error: String(err?.message ?? err),
      errorName: err?.name ?? null,
      totalMs: performance.now() - t0,
      resources: resourceReport(),
    });
  }
};
