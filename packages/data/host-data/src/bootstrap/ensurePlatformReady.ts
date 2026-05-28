import { createConfigManager } from '@starui/host-config';
import {
  validatePlatformBootstrapConfig,
  type PlatformBootstrapConfig,
} from './PlatformBootstrapConfig.js';
import { PlatformBootstrapConfigError } from './resolvePlatformBootstrap.js';
import { ensureDataServicesHub } from '../hub/ensureDataServicesHub.js';
import type { DataServicesHubBundle } from '../provider/IDataProvider.js';

export interface EnsurePlatformReadyOpts {
  workerScriptUrl: string;
}

const platformPromises = new Map<string, Promise<DataServicesHubBundle>>();

function resolveConfigServiceRestUrl(
  config: PlatformBootstrapConfig,
): string | undefined {
  return config.useRest ? config.configServiceRestUrl : undefined;
}

/**
 * Resolve platform identity, init ConfigManager, spawn/connect SharedWorker hub.
 * Idempotent per `appId` within the current window.
 */
export async function ensurePlatformReady(
  config: PlatformBootstrapConfig,
  opts: EnsurePlatformReadyOpts,
): Promise<DataServicesHubBundle> {
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
): Promise<DataServicesHubBundle> {
  const configServiceRestUrl = resolveConfigServiceRestUrl(config);

  const configManager = createConfigManager({
    appId: config.appId,
    identity: { userId: config.userId, displayName: config.userId },
    configServiceRestUrl,
    seedConfigUrl: config.seedConfigUrl,
  });
  await configManager.init();

  return ensureDataServicesHub({
    appId: config.appId,
    userId: config.userId,
    configServiceRestUrl,
    workerScriptUrl: opts.workerScriptUrl,
    mainThreadConfigManager: configManager,
  });
}

/** Test-only — clears platform singleton registry. */
export function _resetEnsurePlatformReadyForTests(): void {
  platformPromises.clear();
}
