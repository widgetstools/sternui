/**
 * Worker entry — installs the SharedWorkerDataServicesHub on a
 * SharedWorker / dedicated Worker global. Consumers import this from
 * their own worker file:
 *
 *     // app/dataServices.sharedWorker.ts
 *     import { installSharedWorkerHub } from '@starui/host-data/runtime/sharedWorker';
 *     import { createConfigManager } from '@starui/host-config';
 *
 *     const cm = createConfigManager({});
 *     await cm.init();
 *     await installSharedWorkerHub({ configManager: cm });
 *
 * The colocated `new SharedWorker(new URL('./dataServices.sharedWorker.ts', import.meta.url))`
 * still has to live in the consuming app for Vite's worker plugin to
 * emit a separate chunk — that's a bundler constraint we can't move.
 *
 * `installSharedWorkerHub` is async so callers can await the hub's
 * AppData hydration before any port traffic flows. SharedWorker
 * `connect` events queue at the global level; the hub's `onconnect`
 * handler is registered ONLY after hydration completes, so first
 * attaches see the fully-loaded snapshot.
 */

import {
  SharedWorkerDataServicesHub,
  type SharedWorkerDataServicesHubOpts,
  type PortLike,
} from './SharedWorkerDataServicesHub.js';
import { isRequest, isAppDataRequest } from '../protocol.js';

interface SharedWorkerLike {
  onconnect: ((ev: { ports: readonly MessagePort[] }) => void) | null;
}

interface DedicatedWorkerLike {
  onmessage: ((ev: MessageEvent) => void) | null;
  postMessage(message: unknown): void;
}

export interface InstallOpts extends SharedWorkerDataServicesHubOpts {
  /** Inject the global for tests. Defaults to `globalThis`. */
  selfRef?: unknown;
  /**
   * userId passed to `hub.hydrateAppData()` — only used as a
   * placeholder argument since AppData rows are global. Default
   * `'worker'`.
   */
  hydrateUserId?: string;
}

export interface InstalledWorker {
  hub: SharedWorkerDataServicesHub;
  /** Stop accepting new ports, dispose the Hub. Used by tests. */
  stop(): Promise<void>;
}

export async function installSharedWorkerHub(opts: InstallOpts = {}): Promise<InstalledWorker> {
  const hub = new SharedWorkerDataServicesHub(opts);

  // Hydrate AppData from IndexedDB before accepting any port traffic.
  // No-op when no ConfigManager was supplied (e.g. test installs that
  // don't exercise persistence).
  if (opts.configManager) {
    await hub.hydrateAppData(opts.hydrateUserId ?? 'worker');
  }

  const globalRef = (opts.selfRef ?? globalThis) as
    Partial<SharedWorkerLike> & Partial<DedicatedWorkerLike>;

  const attach = (port: MessagePort) => {
    const portLike: PortLike = { postMessage: (m) => port.postMessage(m) };
    port.addEventListener('message', (ev: MessageEvent) => {
      if (isRequest(ev.data)) hub.handleRequest(portLike, ev.data);
      else if (isAppDataRequest(ev.data)) hub.handleAppDataRequest(portLike, ev.data);
    });
    port.addEventListener('messageerror', () => hub.onPortClosed(portLike));
    port.start();
  };

  // SharedWorker path.
  if ('onconnect' in globalRef) {
    (globalRef as SharedWorkerLike).onconnect = (ev) => {
      const port = ev.ports[0];
      if (port) attach(port);
    };
  }

  // Dedicated Worker path — the worker's own message channel.
  if ('onmessage' in globalRef && 'postMessage' in globalRef) {
    const dw = globalRef as DedicatedWorkerLike;
    const fakePort: PortLike = { postMessage: (m) => dw.postMessage(m) };
    dw.onmessage = (ev: MessageEvent) => {
      if (isRequest(ev.data)) hub.handleRequest(fakePort, ev.data);
      else if (isAppDataRequest(ev.data)) hub.handleAppDataRequest(fakePort, ev.data);
    };
  }

  return {
    hub,
    stop: () => hub.dispose(),
  };
}
