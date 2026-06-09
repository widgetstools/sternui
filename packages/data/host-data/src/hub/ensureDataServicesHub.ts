import type { ConfigManager } from '@starui/host-config';
import type { PlatformBootstrapConfig } from '../bootstrap/PlatformBootstrapConfig.js';
import { resolveConfigServiceRestUrl } from '../bootstrap/PlatformBootstrapConfig.js';
import type { DataServices } from '../runtime/bootstrap/bootstrap.js';
import { bootstrapDataServices } from '../runtime/bootstrap/bootstrap.js';
import { createDataServicesWorker } from '../runtime/bootstrap/createDataServicesWorker.js';
import type { DataServicesHubBundle } from '../provider/IDataProvider.js';
import type { IDataProvider } from '../provider/IDataProvider.js';
import { ProviderClientAdapter } from '../provider/ProviderClientAdapter.js';

/** Hub bundle including legacy {@link DataServices} handles for migration. */
export interface ResolvedDataServicesHubBundle extends DataServicesHubBundle {
  readonly client: DataServices['client'];
  readonly appData: DataServices['appData'];
  readonly configManager: ConfigManager;
}

/** Options for {@link ensureDataServicesHub}. */
export interface EnsureHubOpts extends PlatformBootstrapConfig {
  workerScriptUrl: string;
  /** Main-thread ConfigManager (initialized before hub connect). */
  mainThreadConfigManager: ConfigManager;
}

const hubPromises = new Map<string, Promise<ResolvedDataServicesHubBundle>>();

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
    },
    client: services.client,
    appData: services.appData,
    configManager: services.configManager,
  };
}

async function bootstrapHubOnce(opts: EnsureHubOpts): Promise<ResolvedDataServicesHubBundle> {
  const configServiceRestUrl = resolveConfigServiceRestUrl(opts);
  const worker = createDataServicesWorker(opts.workerScriptUrl, {
    appName: opts.appId,
    configServiceRestUrl,
    appId: opts.appId,
    userId: opts.userId,
    seedConfigUrl: opts.seedConfigUrl,
    seedConfigReload: opts.seedConfigReload,
  });
  const services = bootstrapDataServices({
    appName: opts.appId,
    worker,
    configManager: opts.mainThreadConfigManager,
    userId: opts.userId,
  });
  const ready = combineReady(services);
  await ready;
  return adaptDataServicesToHubBundle(services, opts.appId, ready);
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
}
