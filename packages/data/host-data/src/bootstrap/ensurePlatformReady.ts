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
  createConfigClient,
  wireConfigWorkerCatalogSync,
  type ConfigClient,
} from '../runtime/configWorker/index.js';
import {
  _resetPlatformWarmSessionForTests,
  isPlatformWarm,
  markPlatformWarm,
} from './platformWarmSession.js';
import { markConfigReady, markPlatformReady } from './loadMarks.js';
import {
  runAppDataBootstrap,
  type AppDataBootstrapHookRegistry,
} from './appDataBootstrap.js';

export interface EnsurePlatformReadyOpts {
  workerScriptUrl: string;
  /**
   * Optional Config SharedWorker asset URL (ADR Phase 2). When set,
   * `ensureConfigReady` / platform bootstrap also connect
   * `starui-config:{appId}` and wire catalog invalidate to it.
   */
  configWorkerScriptUrl?: string;
  /** App-authored hook registry keyed by stable ids from app-config.json. */
  appDataBootstrapHooks?: AppDataBootstrapHookRegistry;
}

export interface EnsureConfigReadyOpts {
  /** Spawn/connect `starui-config:{appId}` and wire invalidate (ADR Phase 2). */
  configWorkerScriptUrl?: string;
}

/** Result of {@link ensureConfigReady} — ConfigManager-only bootstrap. */
export interface ConfigReadyBundle {
  configManager: ConfigManager;
  /** True when seeding was skipped because a prior window already ran full bootstrap. */
  attachMode: boolean;
  /** Present when {@link EnsureConfigReadyOpts.configWorkerScriptUrl} was provided. */
  configClient?: ConfigClient;
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
 * Does NOT touch the data-services SharedWorker hub — windows that only
 * read/write config rows (tool windows, editors) suspend on this instead of
 * the full {@link ensurePlatformReady}.
 *
 * When {@link EnsureConfigReadyOpts.configWorkerScriptUrl} is set, also
 * connects the Config SharedWorker (`starui-config:{appId}`) and wires
 * catalog invalidate (ADR Phase 2 / P1 profile). Idempotent per `appId`;
 * {@link ensurePlatformReady} reuses the same ConfigManager.
 */
export function ensureConfigReady(
  config: PlatformBootstrapConfig,
  opts: EnsureConfigReadyOpts = {},
): Promise<ConfigReadyBundle> {
  try {
    validateOrThrow(config);
  } catch (err) {
    // Reject (don't sync-throw) so the contract matches ensurePlatformReady.
    return Promise.reject(err);
  }

  const existing = configReadyPromises.get(config.appId);
  if (existing) {
    // Upgrade path: first caller omitted config worker URL; a later caller
    // wants it — still return the same promise (worker warm is best-effort
    // fire-and-forget below on first creation only).
    return existing;
  }

  const pending = bootstrapConfigOnce(config, opts);
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
  opts: EnsureConfigReadyOpts,
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
  markConfigReady();

  let configClient: ConfigClient | undefined;
  if (opts.configWorkerScriptUrl) {
    try {
      configClient = await createConfigClient({
        appId: config.appId,
        userId: config.userId,
        workerScriptUrl: opts.configWorkerScriptUrl,
        seedConfigUrl: config.seedConfigUrl,
        seedConfigReload: config.seedConfigReload,
        configServiceRestUrl: resolveConfigServiceRestUrl(config),
      });
      wireConfigWorkerCatalogSync(configManager, configClient);
    } catch (err) {
      // Config SW is optional for CRUD — main-thread ConfigManager still works.
      // eslint-disable-next-line no-console
      console.warn('[ensureConfigReady] Config SharedWorker connect failed', err);
    }
  }

  return { configManager, attachMode, configClient };
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

  const { configManager } = await ensureConfigReady(config, {
    configWorkerScriptUrl: opts.configWorkerScriptUrl,
  });

  const bundle = await ensureDataServicesHub({
    ...config,
    workerScriptUrl: opts.workerScriptUrl,
    mainThreadConfigManager: configManager,
  });

  wireWorkerCatalogSync(configManager, bundle.client);

  // Phase 2: return once config + hub connection are established. Full
  // hydration (AppData snapshot + catalog preload) settles in the background;
  // consumers paint the shell now and await `bundle.appDataReady` /
  // `bundle.catalogReady` only where they need it.
  void bundle.ready
    .then(() => {
      markPlatformReady();
      // Warm marker drives resolveAttachMode in later windows: bundle.ready
      // implies the worker catalog hydrated, which implies seeding completed.
      // Firing it only after full hydration keeps attach-mode correct.
      markPlatformWarm(config.appId);
    })
    .catch(() => {
      /* hydration failure already surfaces to awaiters of bundle.ready */
    });

  if (config.appDataBootstrap && opts.appDataBootstrapHooks) {
    const { appDataBootstrap } = config;
    const { appDataBootstrapHooks } = opts;
    // AppData hooks need the mirror hydrated — run them off appDataReady in the
    // background so they don't gate the window's first paint.
    void bundle.appDataReady
      .then(() =>
        runAppDataBootstrap({
          manifest: appDataBootstrap,
          registry: appDataBootstrapHooks,
          appId: config.appId,
          userId: config.userId,
          appData: bundle.appData,
          configManager: bundle.configManager,
        }),
      )
      .catch((err) => {
        console.error(`[ensurePlatformReady:${config.appId}] AppData bootstrap failed:`, err);
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
