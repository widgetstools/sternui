/**
 * connect.ts — opens the best available transport and wraps it in a
 * DataPlaneClient.
 *
 * Three strategies:
 *
 *   1. `connectSharedWorker(url)` — default path. Spins up a named
 *      SharedWorker and returns its port. Sibling tabs on the same
 *      origin sharing the same worker name multiplex automatically.
 *
 *   2. `connectDedicatedWorker(url)` — per-tab fallback. Opens a
 *      regular Worker; each call creates an independent worker so
 *      no cross-tab sharing, but same code runs inside.
 *
 *   3. `connectInPage(router)` — no worker at all. Caller provides an
 *      already-constructed `Router` (from `../worker/router`); this
 *      wires the router to a fresh `MessageChannel` and returns the
 *      client side. Intended for tests and constrained environments
 *      (OpenFin views without worker support, SSR hydration, etc.).
 *
 * `connect()` picks the best available automatically.
 */

import { DataPlaneClient } from './DataPlaneClient';
import type { Router } from '../worker/router';
import { hasDedicatedWorker, hasSharedWorker, type TransportMode } from './fallbacks';

export interface ConnectedClient {
  client: DataPlaneClient;
  mode: TransportMode;
  close: () => void;
}

export interface ConnectSharedWorkerOpts {
  /** Worker name — SharedWorkers with different names are different worker instances. */
  name?: string;
  type?: WorkerType;
}

export function connectSharedWorker(
  url: string | URL,
  opts: ConnectSharedWorkerOpts = {},
): ConnectedClient {
  if (!hasSharedWorker()) {
    throw new Error('SharedWorker is not available in this environment');
  }
  const worker = new SharedWorker(url, {
    type: opts.type ?? 'module',
    name: opts.name ?? 'marketsui-data-plane',
  });
  const client = new DataPlaneClient(worker.port);
  return {
    client,
    mode: 'shared-worker',
    close: () => {
      client.close();
      // SharedWorker has no `.terminate()` on the client side — closing
      // the port is the correct handoff.
    },
  };
}

export interface ConnectDedicatedWorkerOpts {
  type?: WorkerType;
}

/**
 * Dedicated worker fallback. Returns a client talking to the worker's
 * own port (spun up via MessageChannel so the wire format stays the
 * same — the worker's `entry.ts` reads `self.onconnect` for
 * SharedWorker style AND `self.onmessage` for dedicated; the worker
 * bootstrap normalises both paths).
 */
export function connectDedicatedWorker(
  url: string | URL,
  opts: ConnectDedicatedWorkerOpts = {},
): ConnectedClient {
  if (!hasDedicatedWorker()) {
    throw new Error('Worker is not available in this environment');
  }
  const worker = new Worker(url, { type: opts.type ?? 'module' });

  // Bridge: a fresh MessageChannel so the client sees a MessagePort
  // even though the transport is a Worker. The worker is expected to
  // forward `onmessage` through its side of the channel; we transfer
  // the worker-side port across.
  const chan = new MessageChannel();
  worker.postMessage({ __dataPlaneBootstrap: true, port: chan.port2 }, [chan.port2]);

  const client = new DataPlaneClient(chan.port1);
  return {
    client,
    mode: 'dedicated-worker',
    close: () => {
      client.close();
      worker.terminate();
    },
  };
}

/**
 * In-page fallback. Wires a MessageChannel between a provided Router
 * and a fresh DataPlaneClient. Used by tests and by environments
 * where no worker is available.
 */
export function connectInPage(router: Router): ConnectedClient {
  const chan = new MessageChannel();
  chan.port2.addEventListener('message', (ev: MessageEvent) => {
    void router.handleRequest(chan.port2, ev.data);
  });
  chan.port2.start();

  const client = new DataPlaneClient(chan.port1);
  return {
    client,
    mode: 'in-page',
    close: () => {
      void router.onPortClosed(chan.port2);
      client.close();
      chan.port2.close();
    },
  };
}

/**
 * Auto-degrade. Tries SharedWorker → dedicated Worker → in-page. The
 * in-page branch requires the caller to pass a `router`; otherwise
 * connect() throws when it reaches it.
 */
export interface ConnectOpts extends ConnectSharedWorkerOpts {
  /** URL for SharedWorker / Worker constructor. */
  url?: string | URL;
  /** If provided, use in-page mode directly (skips worker probing). */
  router?: Router;
}

export function connect(opts: ConnectOpts): ConnectedClient {
  if (opts.router && !opts.url) return connectInPage(opts.router);
  if (!opts.url) throw new Error('connect() requires either `url` or `router`');
  if (hasSharedWorker()) return connectSharedWorker(opts.url, opts);
  if (hasDedicatedWorker()) return connectDedicatedWorker(opts.url, opts);
  if (opts.router) return connectInPage(opts.router);
  throw new Error('No transport available: neither SharedWorker nor Worker nor Router provided');
}
