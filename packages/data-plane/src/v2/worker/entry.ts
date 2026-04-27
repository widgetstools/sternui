/**
 * Worker entry — installs the Hub on a SharedWorker / dedicated Worker
 * global. Consumers import this from their own worker file:
 *
 *     // app/dataPlaneWorker.ts
 *     import { installWorker } from '@marketsui/data-plane/v2/worker';
 *     installWorker();
 *
 * The colocated `new SharedWorker(new URL('./dataPlaneWorker.ts', import.meta.url))`
 * still has to live in the consuming app for Vite's worker plugin to
 * emit a separate chunk — that's a bundler constraint we can't move.
 */

import { Hub, type HubOpts, type PortLike } from './Hub.js';
import { isRequest } from '../protocol.js';

interface SharedWorkerLike {
  onconnect: ((ev: { ports: readonly MessagePort[] }) => void) | null;
}

interface DedicatedWorkerLike {
  onmessage: ((ev: MessageEvent) => void) | null;
  postMessage(message: unknown): void;
}

export interface InstallOpts extends HubOpts {
  /** Inject the global for tests. Defaults to `globalThis`. */
  selfRef?: unknown;
}

export interface InstalledWorker {
  hub: Hub;
  /** Stop accepting new ports, dispose the Hub. Used by tests. */
  stop(): Promise<void>;
}

export function installWorker(opts: InstallOpts = {}): InstalledWorker {
  const hub = new Hub(opts);
  const globalRef = (opts.selfRef ?? globalThis) as
    Partial<SharedWorkerLike> & Partial<DedicatedWorkerLike>;

  const attach = (port: MessagePort) => {
    const portLike: PortLike = { postMessage: (m) => port.postMessage(m) };
    port.addEventListener('message', (ev: MessageEvent) => {
      if (isRequest(ev.data)) hub.handleRequest(portLike, ev.data);
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
    };
  }

  return {
    hub,
    stop: () => hub.dispose(),
  };
}
