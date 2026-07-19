/**
 * The real `connect` for {@link PerspectiveAttachHandler} — stands up a
 * Perspective client over a `MessagePort` handed to the provider worker.
 *
 * ## The handshake
 *
 * Perspective's server worker (`perspective-server.worker.js`) expects, on any
 * port it binds:
 *
 * 1. `{ cmd: 'init', id, args: [serverWasmBuffer] }` — compiles the server
 *    WASM (once per worker) and makes a session for this port;
 * 2. a reply `{ id }` echoing the same id;
 * 3. thereafter, **binary** frames: requests in, responses out.
 *
 * So a client is: send `init`, await the ack, then bridge `Client.send_request`
 * → `port.postMessage(bytes)` and `port.onmessage` → `client.handle_response`.
 * This mirrors `@finos/perspective/src/ts/wasm/browser.ts::worker()`, which we
 * cannot reuse directly because it constructs its own `SharedWorker` — the
 * constructor Chromium does not expose in worker scopes (see
 * `perspectiveWorkerLink`).
 *
 * Both WASM payloads are fetched by the caller and passed in, so this module
 * stays free of bundler-specific `?url` imports.
 */

import type { AttachClient } from './PerspectiveAttachHandler.js';

/** Perspective's `Client` constructor surface. */
interface PerspectiveClientCtor {
  new (
    send_request: (proto: Uint8Array) => Promise<void> | void,
    close?: () => Promise<void> | void,
  ): AttachClient & { handle_response(value: unknown): Promise<void> };
}

export interface ConnectPerspectivePortOpts {
  /**
   * `@finos/perspective` module namespace. Injected rather than imported so
   * the provider worker controls when the client WASM is initialised, and so
   * this stays unit-testable.
   */
  perspective: {
    init_client(wasm: unknown): void | Promise<void>;
    Client?: PerspectiveClientCtor;
  };
  /** `Client` constructor when not exposed on the module namespace. */
  ClientCtor?: PerspectiveClientCtor;
  /** Compiled/fetched `perspective-js.wasm` for the client side (~0.2 MB). */
  clientWasm: unknown;
  /** Fetched `perspective-server.wasm` for the `init` handshake (~2.2 MB). */
  serverWasm: ArrayBuffer;
  /** Handshake timeout. The engine worker may be cold-starting its WASM. */
  timeoutMs?: number;
}

export const PERSPECTIVE_HANDSHAKE_TIMEOUT_MS = 30_000;

/**
 * Perform the `init` handshake on `port` and return a connected client.
 *
 * Rejects (rather than hanging) if the engine worker never acks — a missing or
 * CSP-blocked worker asset fires `error` on the SharedWorker instead of
 * throwing, so without a timeout the provider would wait forever with no
 * signal, exactly the failure mode fixed for the Config/AppData clients.
 */
export async function connectPerspectivePort(
  port: MessagePort,
  opts: ConnectPerspectivePortOpts,
): Promise<AttachClient> {
  const Ctor = opts.ClientCtor ?? opts.perspective.Client;
  if (!Ctor) {
    throw new Error(
      '[perspective] Client constructor unavailable — pass ClientCtor explicitly',
    );
  }

  await opts.perspective.init_client(opts.clientWasm);

  const timeoutMs = opts.timeoutMs ?? PERSPECTIVE_HANDSHAKE_TIMEOUT_MS;
  const initId = `psp-init-${Date.now()}`;

  let client: (AttachClient & { handle_response(v: unknown): Promise<void> }) | null = null;
  let acked = false;
  let resolveAck: () => void = () => undefined;

  const onMessage = (ev: MessageEvent): void => {
    const data: unknown = ev.data;
    // Phase 1: the `{ id }` ack. Phase 2 onward: binary protocol frames.
    if (!acked) {
      if (data && typeof data === 'object' && (data as { id?: unknown }).id === initId) {
        acked = true;
        resolveAck();
      }
      return;
    }
    if (client) void client.handle_response(data);
  };

  let ackTimer: ReturnType<typeof setTimeout> | null = null;
  const ack = new Promise<void>((resolve, reject) => {
    ackTimer = setTimeout(() => {
      port.removeEventListener('message', onMessage);
      reject(new Error(
        `[perspective] engine worker did not complete the init handshake within `
        + `${timeoutMs}ms (worker asset missing, blocked, or wedged)`,
      ));
    }, timeoutMs);
    resolveAck = () => {
      if (ackTimer !== null) clearTimeout(ackTimer);
      resolve();
    };
  });

  port.addEventListener('message', onMessage);
  port.start();

  // The server compiles this on first init and reuses it for later sessions.
  port.postMessage({ cmd: 'init', id: initId, args: [opts.serverWasm] });
  await ack;

  client = new Ctor(
    async (proto: Uint8Array) => {
      // Copy out of the WASM heap before transferring — the view is not stable.
      const buf = proto.slice().buffer;
      port.postMessage(buf, [buf]);
    },
    () => {
      port.removeEventListener('message', onMessage);
      try {
        port.close();
      } catch {
        /* already closed */
      }
    },
  );

  return client;
}
