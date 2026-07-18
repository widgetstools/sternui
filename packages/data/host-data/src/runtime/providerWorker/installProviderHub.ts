/**
 * Install {@link ProviderHub} on a SharedWorker / dedicated Worker global.
 *
 * AppData mirror requests are intentionally ignored — UI mirrors attach
 * to `starui-appdata`. In-process AppData inside the wrapped hub still
 * backs provider template lookup until Phase 4b bridge.
 */

import type { ConfigManager } from '@starui/host-config';
import { isProviderHubRequest, ProviderHub, type ProviderHubOpts } from './ProviderHub.js';
import type { PortLike } from '../worker/hubTypes.js';

interface SharedWorkerLike {
  onconnect: ((ev: { ports: readonly MessagePort[] }) => void) | null;
}

interface DedicatedWorkerLike {
  onmessage: ((ev: MessageEvent) => void) | null;
  postMessage(message: unknown): void;
}

export interface InstallProviderHubOpts extends Omit<ProviderHubOpts, 'providerId'> {
  providerId: string;
  configManager?: ConfigManager;
  selfRef?: unknown;
  hydrateUserId?: string;
}

export interface InstalledProviderWorker {
  hub: ProviderHub;
  stop(): Promise<void>;
}

export async function installProviderHub(
  opts: InstallProviderHubOpts,
): Promise<InstalledProviderWorker> {
  const hub = new ProviderHub(opts);

  const globalRef = (opts.selfRef ?? globalThis) as
    Partial<SharedWorkerLike> & Partial<DedicatedWorkerLike>;

  const pendingPorts: MessagePort[] = [];
  let attachPort: ((port: MessagePort) => void) | null = null;

  const attach = (port: MessagePort) => {
    const onMessage = (ev: MessageEvent) => {
      if (!isProviderHubRequest(ev.data)) return;
      hub.handleRequest(portLike, ev.data);
    };
    const onError = () => hub.onPortClosed(portLike);
    const portLike: PortLike = {
      postMessage: (m) => port.postMessage(m),
      dispose: () => {
        try {
          port.removeEventListener('message', onMessage);
          port.removeEventListener('messageerror', onError);
        } catch {
          /* port may already be closed */
        }
      },
    };
    port.addEventListener('message', onMessage);
    port.addEventListener('messageerror', onError);
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

  if (opts.configManager) {
    await hub.hydrate(opts.hydrateUserId ?? 'worker');
  }

  attachPort = attach;
  for (const port of pendingPorts) attach(port);
  pendingPorts.length = 0;

  if (!('onconnect' in globalRef) && 'onmessage' in globalRef && 'postMessage' in globalRef) {
    const dedicated = globalRef as DedicatedWorkerLike;
    const portLike: PortLike = {
      postMessage: (message) => dedicated.postMessage(message),
    };
    dedicated.onmessage = (ev: MessageEvent) => {
      if (!isProviderHubRequest(ev.data)) return;
      hub.handleRequest(portLike, ev.data);
    };
  }

  return {
    hub,
    stop: () => hub.dispose(),
  };
}
