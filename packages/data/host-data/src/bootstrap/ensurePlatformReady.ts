import { createConfigManager, isSeedIdentityCached, type ConfigManager } from '@starui/host-config';
import {
  validatePlatformBootstrapConfig,
  resolveConfigServiceRestUrl,
  type PlatformBootstrapConfig,
} from './PlatformBootstrapConfig.js';
import { PlatformBootstrapConfigError } from './resolvePlatformBootstrap.js';
import {
  ensureDataServicesHub,
  warmHubConnection,
  type ResolvedDataServicesHubBundle,
} from '../hub/ensureDataServicesHub.js';
import { wireWorkerCatalogSync } from '../hub/wireWorkerCatalogSync.js';
import {
  _resetPlatformWarmSessionForTests,
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

/** Result of {@link ensureConfigReady} — ConfigManager-only bootstrap. */
export interface ConfigReadyBundle {
  configManager: ConfigManager;
  /** True when seeding was skipped because a prior window already ran full bootstrap. */
  attachMode: boolean;
}

const configReadyPromises = new Map<string, Promise<ConfigReadyBundle>>();
const platformPromises = new Map<string, Promise<ResolvedDataServicesHubBundle>>();

function validateOrThrow(config: PlatformBootstrapConfig): void {
  const validation = validatePlatformBootstrapConfig(config);
  if (!validation.valid) {
    throw new PlatformBootstrapConfigError(
      `Invalid platform bootstrap config: ${validation.errors.join('; ')}`,
      validation.errors,
      validation.warnings,
    );
  }
}

/**
 * Attach (skip `seedIfEmpty`) when a prior window already completed a full
 * bootstrap for this deployment. Seeding lands in IndexedDB, which outlives
 * both the windows and the SharedWorker, so the cross-window warm marker is
 * a sufficient signal — no worker round-trip needed. If the marker is stale
 * (manually wiped DB with surviving localStorage), the worker's own
 * `seedIfEmpty` at hub boot re-seeds for data windows; config-only windows
 * see an empty store until then, same as a cold first launch.
 */
function resolveAttachMode(config: PlatformBootstrapConfig): boolean {
  if (config.seedConfigUrl && !isSeedIdentityCached(config.seedConfigUrl)) {
    return false;
  }
  return isPlatformWarm(config.appId);
}

/**
 * Lightweight bootstrap: resolve attach mode, init the window's ConfigManager.
 * Does NOT touch the SharedWorker hub — windows that only read/write config
 * rows (tool windows, editors) suspend on this instead of the full
 * {@link ensurePlatformReady}, skipping hub connect + AppData snapshot +
 * catalog preload. Idempotent per `appId`; {@link ensurePlatformReady} reuses
 * the same ConfigManager, so a window can upgrade from config-only to full
 * without a second IndexedDB connection.
 */
export function ensureConfigReady(
  config: PlatformBootstrapConfig,
): Promise<ConfigReadyBundle> {
  try {
    validateOrThrow(config);
  } catch (err) {
    // Reject (don't sync-throw) so the contract matches ensurePlatformReady.
    return Promise.reject(err);
  }

  const existing = configReadyPromises.get(config.appId);
  if (existing) return existing;

  const pending = bootstrapConfigOnce(config);
  configReadyPromises.set(config.appId, pending);
  pending.catch(() => {
    if (configReadyPromises.get(config.appId) === pending) {
      configReadyPromises.delete(config.appId);
    }
  });

  return pending;
}

async function bootstrapConfigOnce(
  config: PlatformBootstrapConfig,
): Promise<ConfigReadyBundle> {
  const attachMode = resolveAttachMode(config);
  const configManager = createConfigManager({
    appId: config.appId,
    identity: { userId: config.userId, displayName: config.userId },
    configServiceRestUrl: resolveConfigServiceRestUrl(config),
    seedConfigUrl: attachMode ? undefined : config.seedConfigUrl,
    seedConfigReload: attachMode ? undefined : config.seedConfigReload,
  });
  await configManager.init(attachMode ? { mode: 'attach' } : undefined);
  return { configManager, attachMode };
}

/**
 * Resolve platform identity, init ConfigManager, spawn/connect SharedWorker hub.
 * Idempotent per `appId` within the current window.
 */
export async function ensurePlatformReady(
  config: PlatformBootstrapConfig,
  opts: EnsurePlatformReadyOpts,
): Promise<ResolvedDataServicesHubBundle> {
  validateOrThrow(config);

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
  // Open the window's single SharedWorker connection now so the worker
  // spawns (and seeds, on cold start) while the main-thread ConfigManager
  // opens IndexedDB. The same connection is reused by the hub below —
  // one port per window, no throwaway probe connection.
  warmHubConnection({ ...config, workerScriptUrl: opts.workerScriptUrl });

  const { configManager } = await ensureConfigReady(config);

  const bundle = await ensureDataServicesHub({
    ...config,
    workerScriptUrl: opts.workerScriptUrl,
    mainThreadConfigManager: configManager,
  });

  wireWorkerCatalogSync(configManager, bundle.client);

  await bundle.ready;

  // Warm marker drives resolveAttachMode in later windows: bundle.ready
  // implies the worker catalog hydrated, which implies seeding completed.
  markPlatformWarm(config.appId);

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
  configReadyPromises.clear();
  platformPromises.clear();
  _resetPlatformWarmSessionForTests();
}
