/**
 * Perspective boot — hosts the Perspective SERVER inside this
 * SharedWorker and wires a local loopback CLIENT to it, mirroring the
 * two vendor reference wirings:
 *
 *   • server + poll thread: vendor `perspective-server.worker.ts`
 *     (their prebuilt worker) — `PerspectiveServer` with
 *     `on_poll_request` deferring view fan-out through
 *     `PerspectivePollThread`, one `make_session` per connected port.
 *
 *   • loopback client: vendor `perspective.node.ts` SYNC_CLIENT —
 *     `new Client(req => session.handle_request(req))` with the
 *     session's responses fed back through `client.handle_response`.
 *
 * Both shipped wasm binaries are pro_self_extracting_wasm payloads and
 * go through `load_wasm_stage_0` first. They are fetched as siblings
 * of the worker script (buildWorker.mjs copies them into dist/assets)
 * unless the caller overrides the URLs.
 */

import {
  PerspectivePollThread,
  PerspectiveServer,
  compile_perspective,
  load_wasm_stage_0,
  perspectiveClient,
  type PerspectiveClient,
  type PerspectiveSession,
} from './perspectiveVendor.mjs';

export interface PerspectiveWasmUrls {
  /** perspective-server.wasm (the engine). */
  serverWasmUrl: string | URL;
  /** perspective-js.wasm (the wasm-bindgen client, for the loopback client). */
  clientWasmUrl: string | URL;
}

export interface BootedPerspective {
  /** Accept path for window ports: one session per perspective client. */
  makeSession(send: (buffer: Uint8Array) => Promise<void>): PerspectiveSession;
  /** The worker's own client — creates/updates the Table. */
  localClient: PerspectiveClient;
}

/**
 * A NON-CLAMPED macrotask ("setImmediate" for workers). Used to get
 * re-entrant engine work out of the vendor's response-decode window —
 * see the loopback wiring below for why a microtask is not enough.
 * `setTimeout(0)` would do, but measured 10x slower and browsers clamp
 * it to 4ms once nested 5 deep.
 */
function createMacrotaskScheduler(): (fn: () => void) => void {
  const channel = new MessageChannel();
  const queue: Array<() => void> = [];
  channel.port1.onmessage = () => {
    queue.shift()?.();
  };
  channel.port1.start();
  return (fn) => {
    queue.push(fn);
    channel.port2.postMessage(0);
  };
}

async function fetchWasm(url: string | URL): Promise<ArrayBuffer> {
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`[ssrm] wasm fetch failed: ${resp.status} ${resp.statusText} — ${String(url)}`);
  }
  // Explicit arrayBuffer (not instantiateStreaming) so a dev server's
  // MIME type for .wasm can never break the boot.
  return resp.arrayBuffer();
}

/** Boot the server engine + poll thread + loopback client. Call once per worker. */
export async function bootPerspective(urls: PerspectiveWasmUrls): Promise<BootedPerspective> {
  const [serverBytes, clientBytes] = await Promise.all([
    fetchWasm(urls.serverWasmUrl),
    fetchWasm(urls.clientWasmUrl),
  ]);

  const [serverWasm, clientWasm] = await Promise.all([
    load_wasm_stage_0(serverBytes),
    load_wasm_stage_0(clientBytes),
  ]);

  // Client glue init (wasm-bindgen) — vendor browser.ts compilerize().
  await perspectiveClient.default({ module_or_path: clientWasm });
  perspectiveClient.init();

  // Server engine — vendor perspective-server.worker.ts bindPort().
  const scheduleMacrotask = createMacrotaskScheduler();

  const module = await compile_perspective(serverWasm.buffer as ArrayBuffer);
  let pollThread: PerspectivePollThread;
  const server: PerspectiveServer = new PerspectiveServer(module, {
    on_poll_request: () => pollThread.on_poll_request(),
  });
  pollThread = new PerspectivePollThread(server);

  // Loopback client — copy synchronously, deliver on a macrotask, batched.
  //
  // The vendor's `decode_api_responses` (engine.ts) holds DataViews over
  // `HEAPU8.buffer` across `await callback(resp)` and re-reads them in
  // its `finally` to free the protobuf frames. A wasm `memory.grow` in
  // that window DETACHES the buffer and kills the whole in-flight batch
  // (measured under forced growth: 18 of 18 concurrent ops rejected).
  //
  // Copying alone does NOT close the window — the engine still re-reads
  // ITS OWN views. Neither does `queueMicrotask`: measured, the
  // microtask runs BEFORE the `finally`. Only returning an
  // already-resolved promise and doing the re-entrant work on a
  // MACROTASK keeps allocating work out of the window. `setTimeout(0)`
  // is also safe but 10x slower (14.3ms vs 1.4ms per round trip, and
  // browsers clamp it to 4ms after 5 nesting levels); this batched
  // MessageChannel drain costs ~1%.
  //
  // This corrects the vendor's OWN loopback shape (perspective.node.ts
  // SYNC_CLIENT/SESSION) — that entrypoint carries the same hazard.
  let localClient: PerspectiveClient;
  const pendingResponses: Uint8Array[] = [];
  let drainScheduled = false;

  const localSession = server.make_session((resp: Uint8Array) => {
    pendingResponses.push(resp.slice()); // copy BEFORE returning — required
    if (!drainScheduled) {
      drainScheduled = true;
      scheduleMacrotask(() => {
        drainScheduled = false;
        for (const buffer of pendingResponses.splice(0)) {
          void localClient.handle_response(buffer); // deliberately not awaited
        }
      });
    }
    return Promise.resolve(); // resolve immediately — closes the window
  });

  localClient = new perspectiveClient.Client(async (req: Uint8Array) => {
    await localSession.handle_request(req);
  });

  return {
    makeSession: (send) => server.make_session(send),
    localClient,
  };
}
