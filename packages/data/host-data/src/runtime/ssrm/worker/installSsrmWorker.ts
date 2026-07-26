/**
 * installSsrmWorker — the SSRM provider SharedWorker: STOMP ingest +
 * hosted Perspective server + DatasetState, one worker, one book.
 *
 * ## Port accept path (two dialects, one worker)
 *
 * Windows connect DIRECTLY with their own `new SharedWorker(url, name)`
 * ports — no window-brokered introductions. The FIRST message on each
 * port claims its dialect:
 *
 * • `{ cmd: 'init', id }` → the **Perspective client wire protocol**,
 *   exactly as the vendor's prebuilt server worker accepts it
 *   (`@finos/perspective` src/ts/perspective-server.worker.ts): make a
 *   server session whose responses post back as transferred
 *   ArrayBuffers, ack with `{ id }`, then treat every subsequent
 *   binary message as a protobuf request → `session.handle_request`.
 *   The vendor client ships its server wasm in `args[0]` (its worker
 *   compiles lazily); OUR server is already booted, so the payload is
 *   acknowledged and dropped.
 *
 * • `{ kind: 'ssrm-...' }` → the **control protocol** (`types.ts`):
 *   configure / restart / state, plus `ssrm-state` broadcasts to every
 *   control port on each DatasetState transition — nobody infers state
 *   from side effects.
 */

import type { PerspectiveSession } from './perspectiveVendor.mjs';
import { bootPerspective, type BootedPerspective, type PerspectiveWasmUrls } from './perspectiveBoot.js';
import { SsrmDataset } from './SsrmDataset.js';
import {
  isSsrmControlRequest,
  type DatasetStateSnapshot,
  type SsrmAckEvent,
  type SsrmControlRequest,
  type SsrmStateEvent,
} from '../types.js';
import type { OpenStompSessionOpts } from './stompIngest.js';

interface PortLike {
  postMessage(message: unknown, options?: { transfer?: Transferable[] }): void;
  addEventListener(type: 'message', cb: (ev: MessageEvent) => void): void;
  removeEventListener(type: 'message', cb: (ev: MessageEvent) => void): void;
  start?(): void;
  close?(): void;
}

interface SharedWorkerLike {
  onconnect: ((ev: { ports: readonly MessagePort[] }) => void) | null;
}

export interface InstallSsrmWorkerOpts {
  /** Inject the global for tests. Defaults to `globalThis`. */
  selfRef?: unknown;
  /**
   * WASM locations. Default: siblings of the worker script
   * (`perspective-server.wasm` / `perspective-js.wasm` next to the
   * bundled asset — buildWorker.mjs copies them there).
   */
  wasmUrls?: PerspectiveWasmUrls;
  /** Inject the perspective boot for tests. */
  bootPerspectiveImpl?: (urls: PerspectiveWasmUrls) => Promise<BootedPerspective>;
  /** Injected into every STOMP session (tests). */
  ingestOpts?: OpenStompSessionOpts;
}

export interface SsrmWorkerHandle {
  /** Resolves when the Perspective server is up (before any config). */
  ready: Promise<void>;
  stop(): Promise<void>;
}

function defaultWasmUrls(): PerspectiveWasmUrls {
  const base = (self as unknown as { location: { href: string } }).location.href;
  return {
    serverWasmUrl: new URL('./perspective-server.wasm', base),
    clientWasmUrl: new URL('./perspective-js.wasm', base),
  };
}

export function installSsrmWorker(opts: InstallSsrmWorkerOpts = {}): SsrmWorkerHandle {
  const globalRef = (opts.selfRef ?? globalThis) as Record<string, unknown>;
  const boot = opts.bootPerspectiveImpl ?? bootPerspective;

  const controlPorts = new Set<PortLike>();
  const pspSessions = new Set<PerspectiveSession>();
  let dataset: SsrmDataset | null = null;

  const pspReady: Promise<BootedPerspective> = boot(opts.wasmUrls ?? defaultWasmUrls());
  pspReady.catch((err) => {
    // Surfaced per-request too — this keeps the failure visible in the
    // worker console even before any client asks.
    // eslint-disable-next-line no-console
    console.error('[ssrm worker] perspective boot failed', err);
  });

  const stateEvent = (state: DatasetStateSnapshot): SsrmStateEvent => ({
    kind: 'ssrm-state',
    state,
    tableName: dataset?.tableName ?? null,
  });

  const broadcastState = (state: DatasetStateSnapshot): void => {
    const event = stateEvent(state);
    for (const port of controlPorts) {
      try {
        port.postMessage(event);
      } catch {
        controlPorts.delete(port); // port died — drop it
      }
    }
  };

  // ─── control dialect ──────────────────────────────────────────

  const handleControl = async (port: PortLike, req: SsrmControlRequest): Promise<void> => {
    const ack = (state: DatasetStateSnapshot, error?: string): void => {
      const event: SsrmAckEvent = {
        kind: 'ssrm-ack',
        reqId: req.reqId,
        state,
        tableName: dataset?.tableName ?? null,
        ...(error !== undefined ? { error } : {}),
      };
      port.postMessage(event);
    };

    const unconfigured: DatasetStateSnapshot = { phase: 'connecting', rowCount: 0, generation: 0 };

    try {
      switch (req.kind) {
        case 'ssrm-configure': {
          const psp = await pspReady;
          if (!dataset) {
            // First configure wins; the worker owns exactly one dataset.
            dataset = new SsrmDataset(req.config, psp, broadcastState, opts.ingestOpts ?? {});
            dataset.start();
          }
          ack(dataset.state);
          return;
        }
        case 'ssrm-restart': {
          if (!dataset) {
            ack(unconfigured, 'restart before configure');
            return;
          }
          ack(dataset.restart());
          return;
        }
        case 'ssrm-state': {
          ack(dataset?.state ?? unconfigured, dataset ? undefined : 'not configured');
          return;
        }
        case 'ssrm-update-rows': {
          // Cell-edit write-back: the worker owns the table, so edits
          // route through it. Stale generations / unkeyed rows throw
          // inside updateRows → acked as an error, nothing written.
          if (!dataset) {
            ack(unconfigured, 'update-rows before configure');
            return;
          }
          dataset.updateRows(req.generation, req.rows);
          ack(dataset.state);
          return;
        }
      }
    } catch (err) {
      ack(
        dataset?.state ?? unconfigured,
        err instanceof Error ? err.message : String(err),
      );
    }
  };

  const bindControlPort = (port: PortLike, firstMessage: SsrmControlRequest): void => {
    controlPorts.add(port);
    port.addEventListener('message', (ev) => {
      if (isSsrmControlRequest(ev.data)) void handleControl(port, ev.data);
    });
    void handleControl(port, firstMessage);
  };

  // ─── perspective dialect (vendor accept path) ─────────────────

  const bindPerspectivePort = async (
    port: PortLike,
    initMessage: { id?: unknown },
  ): Promise<void> => {
    let psp: BootedPerspective;
    try {
      psp = await pspReady;
    } catch (err) {
      port.postMessage({
        id: initMessage.id,
        error: `perspective boot failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      return;
    }
    // Copy synchronously and do NO allocating work: the vendor decodes
    // responses over views into the wasm heap and re-reads them after
    // awaiting this callback, so anything that can grow the heap in
    // here detaches those views and fails the whole in-flight batch.
    // Safety is a GLOBAL invariant — one session awaiting engine work
    // inline endangers every other session's decodes, including poll().
    // postMessage never touches the wasm heap, so this is safe as long
    // as it stays synchronous and returns an already-resolved promise.
    const session = psp.makeSession((resp) => {
      const buffer = resp.slice().buffer;
      port.postMessage(buffer, { transfer: [buffer] });
      return Promise.resolve();
    });
    pspSessions.add(session);
    port.addEventListener('message', (ev) => {
      const data: unknown = ev.data;
      if (data instanceof ArrayBuffer) {
        void session.handle_request(new Uint8Array(data));
      } else if (ArrayBuffer.isView(data)) {
        void session.handle_request(
          new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
        );
      }
    });
    // Vendor ack: the client's `_init` resolves on the first message.
    port.postMessage({ id: initMessage.id });
  };

  // ─── first-message dialect discrimination ─────────────────────

  const attachPort = (port: PortLike): void => {
    const onFirst = (ev: MessageEvent): void => {
      const data: unknown = ev.data;
      port.removeEventListener('message', onFirst);
      if (data && typeof data === 'object' && (data as { cmd?: unknown }).cmd === 'init') {
        void bindPerspectivePort(port, data as { id?: unknown });
      } else if (isSsrmControlRequest(data)) {
        bindControlPort(port, data);
      }
      // Anything else pre-claim is a protocol violation — ignore.
    };
    port.addEventListener('message', onFirst);
    port.start?.();
  };

  if ('onconnect' in globalRef) {
    (globalRef as unknown as SharedWorkerLike).onconnect = (ev) => {
      const port = ev.ports[0];
      if (port) attachPort(port);
    };
  }

  return {
    ready: pspReady.then(() => undefined),
    stop: async () => {
      for (const session of pspSessions) {
        try {
          session.close();
        } catch {
          /* already closed */
        }
      }
      pspSessions.clear();
      controlPorts.clear();
      await dataset?.dispose();
      dataset = null;
    },
  };
}
