import { createConfigManager, isSeedIdentityCached } from '@starui/host-config';
import {
  validatePlatformBootstrapConfig,
  resolveConfigServiceRestUrl,
  type PlatformBootstrapConfig,
} from './PlatformBootstrapConfig.js';
import { PlatformBootstrapConfigError } from './resolvePlatformBootstrap.js';
import { ensureDataServicesHub, type ResolvedDataServicesHubBundle } from '../hub/ensureDataServicesHub.js';
import { probeWorkerHubReady } from '../hub/probeWorkerHub.js';
import { wireWorkerCatalogSync } from '../hub/wireWorkerCatalogSync.js';
import {
  _resetPlatformWarmSessionForTests,
  clearPlatformWarm,
  isPlatformWarm,
  markPlatformWarm,
} from './platformWarmSession.js';
import {
  runAppDataBootstrap,
  type AppDataBootstrapHookRegistry,
} from './appDataBootstrap.js';

export interface EnsurePlatformReadyOpts {
  workerScriptUrl: string;
  /** App-authored hook registry keyed by stable ids from app-config.json. */
  appDataBootstrapHooks?: AppDataBootstrapHookRegistry;
}

const platformPromises = new Map<string, Promise<ResolvedDataServicesHubBundle>>();

/**
 * Resolve platform identity, init ConfigManager, spawn/connect SharedWorker hub.
 * Idempotent per `appId` within the current window.
 */
export async function ensurePlatformReady(
  config: PlatformBootstrapConfig,
  opts: EnsurePlatformReadyOpts,
): Promise<ResolvedDataServicesHubBundle> {
  const validation = validatePlatformBootstrapConfig(config);
  if (!validation.valid) {
    throw new PlatformBootstrapConfigError(
      `Invalid platform bootstrap config: ${validation.errors.join('; ')}`,
      validation.errors,
      validation.warnings,
    );
  }

  const existing = platformPromises.get(config.appId);
  if (existing) return existing;

  const pending = bootstrapPlatformOnce(config, opts);
  platformPromises.set(config.appId, pending);
  pending.catch(() => {
    if (platformPromises.get(config.appId) === pending) {
      platformPromises.delete(config.appId);
    }
  });

  return pending;
}

async function resolveAttachBootstrap(
  config: PlatformBootstrapConfig,
  workerScriptUrl: string,
  configServiceRestUrl: string | undefined,
): Promise<boolean> {
  if (config.seedConfigUrl && !isSeedIdentityCached(config.seedConfigUrl)) {
    return false;
  }

  const workerUp = await probeWorkerHubReady({
    workerScriptUrl,
    appName: config.appId,
    appId: config.appId,
    userId: config.userId,
    configServiceRestUrl,
    seedConfigUrl: config.seedConfigUrl,
    seedConfigReload: config.seedConfigReload,
  });
  if (!workerUp) {
    clearPlatformWarm(config.appId);
    return false;
  }
  return true;
}

async function bootstrapPlatformOnce(
  config: PlatformBootstrapConfig,
  opts: EnsurePlatformReadyOpts,
): Promise<ResolvedDataServicesHubBundle> {
  const configServiceRestUrl = resolveConfigServiceRestUrl(config);
  const attachMode = await resolveAttachBootstrap(
    config,
    opts.workerScriptUrl,
    configServiceRestUrl,
  );

  const configManager = createConfigManager({
    appId: config.appId,
    identity: { userId: config.userId, displayName: config.userId },
    configServiceRestUrl,
    seedConfigUrl: attachMode ? undefined : config.seedConfigUrl,
    seedConfigReload: attachMode ? undefined : config.seedConfigReload,
  });

  const initPromise = configManager.init(attachMode ? { mode: 'attach' } : undefined);
  const bundlePromise = ensureDataServicesHub({
    ...config,
    workerScriptUrl: opts.workerScriptUrl,
    mainThreadConfigManager: configManager,
  });

  const [bundle] = await Promise.all([bundlePromise, initPromise]);

  wireWorkerCatalogSync(configManager, bundle.client);

  await bundle.ready;

  if (!attachMode) {
    markPlatformWarm(config.appId);
  }

  if (config.appDataBootstrap && opts.appDataBootstrapHooks) {
    await runAppDataBootstrap({
      manifest: config.appDataBootstrap,
      registry: opts.appDataBootstrapHooks,
      appId: config.appId,
      userId: config.userId,
      appData: bundle.appData,
      configManager: bundle.configManager,
    });
  }

  return bundle;
}

/** Test-only — clears platform singleton registry. */
export function _resetEnsurePlatformReadyForTests(): void {
  platformPromises.clear();
  _resetPlatformWarmSessionForTests();
}
