import type { ConfigManager } from '@starui/host-config';
import type { PlatformBootstrapConfig } from '../bootstrap/PlatformBootstrapConfig.js';
import { resolveConfigServiceRestUrl } from '../bootstrap/PlatformBootstrapConfig.js';
import type { DataServices } from '../runtime/bootstrap/bootstrap.js';
import { bootstrapDataServices } from '../runtime/bootstrap/bootstrap.js';
import { createDataServicesWorker } from '../runtime/bootstrap/createDataServicesWorker.js';
import { SharedWorkerDataServicesClient } from '../runtime/client/SharedWorkerDataServicesClient.js';
import type { DataServicesHubBundle } from '../provider/IDataProvider.js';
import type { IDataProvider } from '../provider/IDataProvider.js';
import { ProviderClientAdapter } from '../provider/ProviderClientAdapter.js';
import { WorkerConfigManagerClient } from './WorkerConfigManagerClient.js';

/** Hub bundle including legacy {@link DataServices} handles for migration. */
export interface ResolvedDataServicesHubBundle extends DataServicesHubBundle {
  readonly client: DataServices['client'];
  readonly appData: DataServices['appData'];
  /** Worker-authoritative config facade (or legacy main-thread ConfigManager). */
  readonly configManager: ConfigManager | WorkerConfigManagerClient;
}

/** Options for {@link ensureDataServicesHub}. */
export interface EnsureHubOpts extends PlatformBootstrapConfig {
  workerScriptUrl: string;
  /**
   * Optional main-thread ConfigManager for migration / config-only attach.
   * Omitted in production data windows — the worker ConfigManager is used
   * via {@link WorkerConfigManagerClient}.
   */
  mainThreadConfigManager?: ConfigManager;
}

/** The window's single SharedWorker port + client for one `appId`. */
export interface HubConnection {
  worker: SharedWorker;
  client: SharedWorkerDataServicesClient;
}

/** Options for {@link warmHubConnection} — hub opts minus the ConfigManager. */
export type WarmHubConnectionOpts = PlatformBootstrapConfig & {
  workerScriptUrl: string;
};

const hubPromises = new Map<string, Promise<ResolvedDataServicesHubBundle>>();
const hubConnections = new Map<string, HubConnection>();

/**
 * Get or create this window's single SharedWorker connection for `appId`.
 * One MessagePort per window: the hub bundle wraps this client, so callers
 * that connect early (to overlap worker spawn with other init) don't leave
 * a second throwaway port behind.
 */
function getOrCreateHubConnection(opts: WarmHubConnectionOpts): HubConnection {
  const existing = hubConnections.get(opts.appId);
  if (existing) return existing;

  const worker = createDataServicesWorker(opts.workerScriptUrl, {
    appName: opts.appId,
    configServiceRestUrl: resolveConfigServiceRestUrl(opts),
    appId: opts.appId,
    userId: opts.userId,
    seedConfigUrl: opts.seedConfigUrl,
    seedConfigReload: opts.seedConfigReload,
  });
  const connection: HubConnection = {
    worker,
    client: new SharedWorkerDataServicesClient(worker.port),
  };
  hubConnections.set(opts.appId, connection);
  return connection;
}

/**
 * Fire-and-forget worker spawn/connect so the SharedWorker boots (and
 * seeds, on cold start) while the caller does other init. Never throws —
 * environments without SharedWorker surface the real error later from
 * {@link ensureDataServicesHub}.
 */
export function warmHubConnection(opts: WarmHubConnectionOpts): void {
  try {
    getOrCreateHubConnection(opts);
  } catch {
    /* hub connect will surface the real error */
  }
}

function combineReady(services: DataServices): Promise<void> {
  return (async () => {
    await services.ready;
    await services.client.waitForCatalogReady();
  })();
}

function adaptDataServicesToHubBundle(
  services: DataServices,
  appId: string,
  ready: Promise<void>,
  configManager: ConfigManager | WorkerConfigManagerClient,
): ResolvedDataServicesHubBundle {
  return {
    ready,
    getProvider(providerId: string): IDataProvider {
      return new ProviderClientAdapter({
        client: services.client,
        providerId,
      });
    },
    stopProvider(providerId: string): Promise<void> {
      services.client.stop(providerId);
      return Promise.resolve();
    },
    dispose(): void {
      services.dispose();
      hubPromises.delete(appId);
      hubConnections.delete(appId);
    },
    client: services.client,
    appData: services.appData,
    configManager,
  };
}

async function bootstrapHubOnce(opts: EnsureHubOpts): Promise<ResolvedDataServicesHubBundle> {
  const connection = getOrCreateHubConnection(opts);
  const workerClient = new WorkerConfigManagerClient(connection.client, {
    appId: opts.appId,
    userId: opts.userId,
  });
  const configManager = opts.mainThreadConfigManager ?? workerClient;
  const services = bootstrapDataServices({
    appName: opts.appId,
    worker: connection.worker,
    client: connection.client,
    configManager: configManager as ConfigManager,
    userId: opts.userId,
  });
  const ready = combineReady(services);
  await ready;
  return adaptDataServicesToHubBundle(services, opts.appId, ready, configManager);
}

/**
 * Lazy hub entry — one SharedWorker + client bundle per `appId` per window.
 * Waits for AppData mirror snapshot and worker catalog preload before resolving.
 */
export function ensureDataServicesHub(opts: EnsureHubOpts): Promise<ResolvedDataServicesHubBundle> {
  const existing = hubPromises.get(opts.appId);
  if (existing) return existing;

  const pending = bootstrapHubOnce(opts);
  hubPromises.set(opts.appId, pending);
  pending.catch(() => {
    if (hubPromises.get(opts.appId) === pending) {
      hubPromises.delete(opts.appId);
    }
  });

  return pending;
}

/** Test-only — clears hub singleton registry. */
export function _resetEnsureDataServicesHubForTests(): void {
  hubPromises.clear();
  for (const connection of hubConnections.values()) {
    try { connection.client.close(); } catch { /* best-effort */ }
  }
  hubConnections.clear();
}
