/**
 * Install {@link ConfigCatalogHub} on a SharedWorker / dedicated Worker global.
 */

import { ConfigCatalogHub, type ConfigPortLike } from './ConfigCatalogHub.js';
import { isConfigWorkerRequest } from './protocol.js';
import type { ConfigManager } from '@wellsfargo-starui/host-config';

interface SharedWorkerLike {
  onconnect: ((ev: { ports: readonly MessagePort[] }) => void) | null;
}

interface DedicatedWorkerLike {
  onmessage: ((ev: MessageEvent) => void) | null;
  postMessage(message: unknown): void;
}

export interface InstallConfigCatalogHubOpts {
  configManager: ConfigManager;
  selfRef?: unknown;
}

export interface InstalledConfigWorker {
  hub: ConfigCatalogHub;
  stop(): void;
}

export async function installConfigCatalogHub(
  opts: InstallConfigCatalogHubOpts,
): Promise<InstalledConfigWorker> {
  const hub = new ConfigCatalogHub({ configManager: opts.configManager });

  const globalRef = (opts.selfRef ?? globalThis) as
    Partial<SharedWorkerLike> & Partial<DedicatedWorkerLike>;

  const pendingPorts: MessagePort[] = [];
  let attachPort: ((port: MessagePort) => void) | null = null;

  const attach = (port: MessagePort) => {
    const portLike: ConfigPortLike = {
      postMessage: (message) => port.postMessage(message),
    };
    hub.trackPort(portLike);
    const onMessage = (ev: MessageEvent) => {
      const data = ev.data;
      if (!isConfigWorkerRequest(data)) return;
      void hub.handleRequest(portLike, data);
    };
    port.addEventListener('message', onMessage);
    port.start();
  };

  // Register onconnect before hydrate so early connects are queued.
  if ('onconnect' in globalRef) {
    (globalRef as SharedWorkerLike).onconnect = (ev) => {
      const port = ev.ports[0];
      if (!port) return;
      if (attachPort) attachPort(port);
      else pendingPorts.push(port);
    };
  }

  await hub.hydrate();

  attachPort = attach;
  for (const port of pendingPorts) attach(port);
  pendingPorts.length = 0;

  if (!('onconnect' in globalRef) && 'onmessage' in globalRef && 'postMessage' in globalRef) {
    const dedicated = globalRef as DedicatedWorkerLike;
    const portLike: ConfigPortLike = {
      postMessage: (message) => dedicated.postMessage(message),
    };
    hub.trackPort(portLike);
    dedicated.onmessage = (ev: MessageEvent) => {
      const data = ev.data;
      if (!isConfigWorkerRequest(data)) return;
      void hub.handleRequest(portLike, data);
    };
  }

  return {
    hub,
    stop() {
      /* ports tear down with the worker realm */
    },
  };
}
