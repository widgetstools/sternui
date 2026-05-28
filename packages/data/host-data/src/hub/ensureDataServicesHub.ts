import type { ConfigManager } from '@starui/host-config';
import type { DataServices } from '../runtime/bootstrap/bootstrap.js';
import { bootstrapDataServicesWithWorkerAsset } from '../runtime/bootstrap/bootstrapWithWorkerAsset.js';
import type { DataServicesHubBundle } from '../provider/IDataProvider.js';
import type { IDataProvider } from '../provider/IDataProvider.js';

/** Hub bundle including legacy {@link DataServices} handles for migration. */
export interface ResolvedDataServicesHubBundle extends DataServicesHubBundle {
  readonly client: DataServices['client'];
  readonly appData: DataServices['appData'];
  readonly configManager: ConfigManager;
}

/** Options for {@link ensureDataServicesHub}. */
export interface EnsureHubOpts {
  appId: string;
  userId: string;
  configServiceRestUrl?: string;
  workerScriptUrl: string;
  mainThreadConfigManager: ConfigManager;
}

const hubPromises = new Map<string, Promise<ResolvedDataServicesHubBundle>>();

function notImplementedProvider(providerId: string): never {
  throw new Error(
    `IDataProvider adapter is not implemented yet (providerId=${providerId}). ` +
      'Use client.attach() until ProviderClientAdapter lands in Phase 3.',
  );
}

function adaptDataServicesToHubBundle(
  services: DataServices,
  appId: string,
): ResolvedDataServicesHubBundle {
  return {
    ready: services.ready,
    getProvider(providerId: string): IDataProvider {
      notImplementedProvider(providerId);
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

/**
 * Lazy hub entry — one SharedWorker + client bundle per `appId` per window.
 * Phase 2: wraps legacy bootstrap until catalog preload lands (PR2).
 */
export function ensureDataServicesHub(opts: EnsureHubOpts): Promise<ResolvedDataServicesHubBundle> {
  const existing = hubPromises.get(opts.appId);
  if (existing) return existing;

  const pending = (async () => {
    const services = bootstrapDataServicesWithWorkerAsset(opts.workerScriptUrl, {
      appName: opts.appId,
      userId: opts.userId,
      configServiceRestUrl: opts.configServiceRestUrl,
      mainThreadConfigManager: opts.mainThreadConfigManager,
    });
    await services.ready;
    return adaptDataServicesToHubBundle(services, opts.appId);
  })();

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
