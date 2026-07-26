/**
 * Perspective boot — hosts the Perspective SERVER inside this
 * SharedWorker and wires a local loopback CLIENT to it: one
 * `make_session` per connected window port, plus the worker's own
 * client for table writes (vendor `perspective.node.ts` SYNC_CLIENT
 * shape — `new Client(req => session.handle_request(req))` with the
 * session's responses fed back through `client.handle_response`).
 *
 * It deliberately DIVERGES from the vendor's prebuilt
 * `perspective-server.worker.ts` in two places, both verified by
 * measurement rather than inherited by imitation:
 *
 *   • no `on_poll_request` / `PerspectivePollThread` — that wiring
 *     routes polling through an unguarded client lookup (the
 *     `this.clients.get(...) is not a function` crash) and costs 7x on
 *     writes and 49x on reads. See the boot sequence.
 *
 *   • the loopback response callback copies and hands off on a
 *     macrotask, so no engine work runs inside the vendor's
 *     response-decode window.
 *
 * Both shipped wasm binaries are pro_self_extracting_wasm payloads and
 * go through `load_wasm_stage_0` first. They are fetched as siblings
 * of the worker script (buildWorker.mjs copies them into dist/assets)
 * unless the caller overrides the URLs.
 */

import {
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

type ClientCallback = (buffer: Uint8Array) => Promise<void>;

const NOOP_CLIENT: ClientCallback = async () => {};
const reportedUnknownClientIds = new Set<number>();

/**
 * The server's `client_id -> callback` map, hardened so a lookup can
 * never yield a non-function. See the boot sequence for why.
 */
class ResilientClientMap extends Map<number, ClientCallback> {
  override get(clientId: number): ClientCallback | undefined {
    const callback = super.get(clientId);
    if (typeof callback === 'function') return callback;
    if (!reportedUnknownClientIds.has(clientId)) {
      reportedUnknownClientIds.add(clientId);
      // eslint-disable-next-line no-console
      console.error(
        `[ssrm] perspective: dropped response for unknown client_id ${clientId} ` +
          `(live sessions: ${[...super.keys()].join(', ')})`,
      );
    }
    return NOOP_CLIENT;
  }
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

  const scheduleMacrotask = createMacrotaskScheduler();
  const module = await compile_perspective(serverWasm.buffer as ArrayBuffer);

  // ── Server engine: deliberately NO `on_poll_request` ──────────────
  //
  // The vendor's own worker passes one; we must not. Two reasons, both
  // verified against 3.8.0:
  //
  // 1. CORRECTNESS. `PerspectiveServer.poll` (engine.ts:98) does
  //    `this.clients.get(msg.client_id)!(msg.data)` — no guard, and no
  //    `client_id === 0` case, even though `PerspectiveSession.poll`
  //    (engine.ts:150) HAS that case. Passing `on_poll_request` makes
  //    `handle_request` (engine.ts:137) route through the unguarded
  //    variant, which is the exact frame in the reported
  //    `this.clients.get(...) is not a function` crash. Omitting the
  //    option makes that line UNREACHABLE and falls back to the guarded
  //    session poll. Still unfixed on upstream master; there is no 4.x
  //    to upgrade to (3.8.0 is the last @finos release).
  //
  // 2. PERFORMANCE. `PerspectivePollThread` schedules `poll()` through
  //    `setTimeout` (engine.ts:33). Measured on a 20k-row table:
  //    writes 13.88 -> 1.97 ms/op (7x), reads 14.35 -> 0.29 ms/op (49x).
  //    It coalesces nothing useful in this topology — it is a pure
  //    per-request latency tax.
  //
  // Verified with it removed: every session still receives every
  // on_update (60/60/60 across 1 loopback + 2 ports), row counts agree.
  const server: PerspectiveServer = new PerspectiveServer(module);

  // Belt-and-braces. The vendor indexes `clients` with a non-null
  // assertion in THREE places. If an id ever arrives with no callback we
  // drop that one response — loudly, once — rather than throwing a
  // TypeError out of `decode_api_responses`, which would abort the whole
  // in-flight batch AND skip its `_psp_free` loop (leaking every frame
  // in that batch).
  //
  // This is generalised to ANY unknown id on purpose: probing could not
  // reproduce the id that fails in the field, and V8 renders
  // `map.get(...) is not a function` identically for 0 and 999999, so
  // the error text cannot identify it. The log line below is the ground
  // truth we could not obtain offline — if it ever fires, it names the id.
  server.clients = new ResilientClientMap();

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
