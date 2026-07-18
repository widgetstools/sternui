/**
 * Install {@link AppDataHub} on a SharedWorker / dedicated Worker global.
 */

import type { ConfigManager } from '@wellsfargo-starui/host-config';
import { AppDataHub, isAppDataHubRequest, type AppDataPortLike } from './AppDataHub.js';

interface SharedWorkerLike {
  onconnect: ((ev: { ports: readonly MessagePort[] }) => void) | null;
}

interface DedicatedWorkerLike {
  onmessage: ((ev: MessageEvent) => void) | null;
  postMessage(message: unknown): void;
}

export interface InstallAppDataHubOpts {
  configManager: ConfigManager;
  selfRef?: unknown;
}

export interface InstalledAppDataWorker {
  hub: AppDataHub;
  stop(): void;
}

export async function installAppDataHub(
  opts: InstallAppDataHubOpts,
): Promise<InstalledAppDataWorker> {
  const hub = new AppDataHub({ configManager: opts.configManager });

  const globalRef = (opts.selfRef ?? globalThis) as
    Partial<SharedWorkerLike> & Partial<DedicatedWorkerLike>;

  const pendingPorts: MessagePort[] = [];
  let attachPort: ((port: MessagePort) => void) | null = null;

  const attach = (port: MessagePort) => {
    const portLike: AppDataPortLike = {
      postMessage: (message) => port.postMessage(message),
    };
    hub.trackPort(portLike);
    const onMessage = (ev: MessageEvent) => {
      if (!isAppDataHubRequest(ev.data)) return;
      void hub.handleRequest(portLike, ev.data);
    };
    port.addEventListener('message', onMessage);
    port.start();
  };

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
    const portLike: AppDataPortLike = {
      postMessage: (message) => dedicated.postMessage(message),
    };
    hub.trackPort(portLike);
    dedicated.onmessage = (ev: MessageEvent) => {
      if (!isAppDataHubRequest(ev.data)) return;
      void hub.handleRequest(portLike, ev.data);
    };
  }

  return {
    hub,
    stop() {
      /* ports tear down with the worker realm */
    },
  };
}
