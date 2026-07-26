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
  const module = await compile_perspective(serverWasm.buffer as ArrayBuffer);
  let pollThread: PerspectivePollThread | null = null;
  const server: PerspectiveServer = new PerspectiveServer(module, {
    on_poll_request: (_server: PerspectiveServer) => {
      if (!pollThread) throw new Error('[ssrm] poll before pollThread initialized');
      return pollThread.on_poll_request();
    },
  });
  pollThread = new PerspectivePollThread(server);

  // Loopback client — vendor perspective.node.ts SYNC_CLIENT/SESSION.
  let localClient: PerspectiveClient;
  const localSession = server.make_session(async (resp: Uint8Array) => {
    await localClient.handle_response(resp);
  });
  localClient = new perspectiveClient.Client(async (req: Uint8Array) => {
    await localSession.handle_request(req);
  });

  return {
    makeSession: (send) => server.make_session(send),
    localClient,
  };
}
