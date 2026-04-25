/**
 * entry.ts — reusable SharedWorker / Worker bootstrap.
 *
 * Consumers create a Vite-asset worker module that calls
 * `installWorker({ router })` to wire the router into
 * `onconnect` (SharedWorker) OR `onmessage` (dedicated Worker):
 *
 *   // apps/demo-react/src/dataPlaneWorker.ts
 *   import { installWorker, Router } from '@marketsui/data-plane/worker';
 *   const router = new Router();
 *   installWorker({ router });
 *
 *   // Then the client side:
 *   const { client } = connectSharedWorker(
 *     new URL('./dataPlaneWorker.ts', import.meta.url),
 *     { name: 'demo-data-plane' }
 *   );
 *
 * What this file handles
 * ----------------------
 *   • Normalises SharedWorker (one onconnect per client) and
 *     dedicated Worker (one onmessage per tab) into the same
 *     "route (port, request)" shape that the Router expects.
 *   • Port-close detection via a periodic heartbeat sweep — any
 *     port that hasn't sent a message in `deadPortTimeoutMs` gets
 *     removed from the router. Matches stern-1's cleanup heuristic.
 *
 * What it deliberately doesn't do
 * -------------------------------
 *   • Construct or configure providers. That's the router's job via
 *     its factory.
 *   • Enforce auth / rate-limits / per-origin policies. Those belong
 *     in a wrapping router decorator, not here.
 */

import type { Router } from './router';

/** Minimal shape the entry needs from a port — easy to fake in tests. */
type PortLike = Pick<MessagePort, 'postMessage' | 'addEventListener' | 'start'>;

type SharedWorkerGlobal = {
  onconnect: ((ev: { ports: readonly MessagePort[] }) => void) | null;
};

type DedicatedWorkerGlobal = {
  onmessage: ((ev: MessageEvent) => void) | null;
  postMessage: (v: unknown) => void;
};

export interface InstallOpts {
  router: Router;
  /**
   * Optional: auto-remove ports that go silent for this long. Default
   * 60_000ms (matches stern-1). Set to `null` to disable the sweep.
   */
  deadPortTimeoutMs?: number | null;
  /** Sweep interval. Default 30_000ms. */
  sweepIntervalMs?: number;
  /**
   * Inject the global `self` for tests / non-worker environments.
   * Defaults to `globalThis` which in workers is the worker global.
   */
  selfRef?: unknown;
}

interface TrackedPort {
  port: MessagePort;
  lastSeen: number;
}

/**
 * Wire the Router into the ambient worker global. Works for both
 * SharedWorker and dedicated Worker — the `onconnect` branch takes
 * precedence when both surfaces are present.
 */
export function installWorker(opts: InstallOpts): { stop: () => void } {
  const {
    router,
    deadPortTimeoutMs = 60_000,
    sweepIntervalMs = 30_000,
  } = opts;
  const globalRef = (opts.selfRef ?? globalThis) as
    & Partial<SharedWorkerGlobal>
    & Partial<DedicatedWorkerGlobal>;

  const tracked = new Map<MessagePort, TrackedPort>();

  const attachPort = (port: MessagePort) => {
    tracked.set(port, { port, lastSeen: Date.now() });
    port.addEventListener('message', (ev: MessageEvent) => {
      const entry = tracked.get(port);
      if (entry) entry.lastSeen = Date.now();
      void router.handleRequest(port, ev.data);
    });
    port.addEventListener('messageerror', () => {
      tracked.delete(port);
      void router.onPortClosed(port);
    });
    port.start();
  };

  // SharedWorker path.
  if (typeof (globalRef as SharedWorkerGlobal).onconnect !== 'undefined') {
    (globalRef as SharedWorkerGlobal).onconnect = (ev) => {
      const p = ev.ports[0];
      if (p) attachPort(p);
    };
  }

  // Dedicated Worker path — listen on the worker's own global message
  // channel AND on any port arriving in the bootstrap message (see
  // `connectDedicatedWorker` in `client/connect.ts`).
  const asDedicated = globalRef as DedicatedWorkerGlobal;
  asDedicated.onmessage = (ev: MessageEvent) => {
    const raw = ev.data as { __dataPlaneBootstrap?: true; port?: MessagePort } | unknown;
    if (raw && typeof raw === 'object' && (raw as { __dataPlaneBootstrap?: true }).__dataPlaneBootstrap) {
      const port = (raw as { port?: MessagePort }).port;
      if (port) attachPort(port);
      return;
    }
    // If no bootstrap marker, treat the worker's own global port as the
    // client port — callers who use `new Worker()` without a channel
    // exchange messages directly via `postMessage`. We re-attach on
    // every message; harmless because Maps dedupe.
    // In that mode the "port" is the global; emulate postMessage here.
    // (Most consumers should use the bootstrap-port path; this branch
    // is a last-resort for legacy Worker wiring.)
    const selfPort: MessagePort = {
      postMessage: (v: unknown) => asDedicated.postMessage(v),
      addEventListener: () => {},
      removeEventListener: () => {},
      close: () => {},
      start: () => {},
      dispatchEvent: () => false,
      onmessage: null,
      onmessageerror: null,
    } as unknown as MessagePort;
    void router.handleRequest(selfPort, ev.data);
  };

  // Dead-port sweep.
  let timer: ReturnType<typeof setInterval> | null = null;
  if (deadPortTimeoutMs !== null) {
    timer = setInterval(() => {
      const now = Date.now();
      for (const [port, info] of tracked) {
        if (now - info.lastSeen > deadPortTimeoutMs) {
          tracked.delete(port);
          void router.onPortClosed(port);
        }
      }
    }, sweepIntervalMs);
  }

  return {
    stop: () => {
      if (timer) clearInterval(timer);
      tracked.clear();
    },
  };
}

// Keep the PortLike export private — callers pass real MessagePorts.
export type { PortLike };
