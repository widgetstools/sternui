import { createConfigManager } from '@starui/host-config';
import {
  validatePlatformBootstrapConfig,
  resolveConfigServiceRestUrl,
  type PlatformBootstrapConfig,
} from './PlatformBootstrapConfig.js';
import { PlatformBootstrapConfigError } from './resolvePlatformBootstrap.js';
import { ensureDataServicesHub, type ResolvedDataServicesHubBundle } from '../hub/ensureDataServicesHub.js';
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

async function bootstrapPlatformOnce(
  config: PlatformBootstrapConfig,
  opts: EnsurePlatformReadyOpts,
): Promise<ResolvedDataServicesHubBundle> {
  const configServiceRestUrl = resolveConfigServiceRestUrl(config);

  const configManager = createConfigManager({
    appId: config.appId,
    identity: { userId: config.userId, displayName: config.userId },
    configServiceRestUrl,
    seedConfigUrl: config.seedConfigUrl,
    seedConfigReload: config.seedConfigReload,
  });
  await configManager.init();

  const bundle = await ensureDataServicesHub({
    ...config,
    workerScriptUrl: opts.workerScriptUrl,
    mainThreadConfigManager: configManager,
  });

  await bundle.ready;

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
}
