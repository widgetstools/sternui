import type { ConfigManager } from '@wellsfargo-starui/host-config';
import type { PlatformBootstrapConfig } from '../bootstrap/PlatformBootstrapConfig.js';
import { resolveConfigServiceRestUrl } from '../bootstrap/PlatformBootstrapConfig.js';
import type { DataServices } from '../runtime/bootstrap/bootstrap.js';
import { bootstrapDataServices } from '../runtime/bootstrap/bootstrap.js';
import { createDataServicesWorker } from '../runtime/bootstrap/createDataServicesWorker.js';
import { SharedWorkerDataServicesClient } from '../runtime/client/SharedWorkerDataServicesClient.js';
import type { DataServicesHubBundle } from '../provider/IDataProvider.js';
import type { IDataProvider } from '../provider/IDataProvider.js';
import {
  ProviderClientAdapter,
  type ProviderWorkerRoutingOpts,
} from '../provider/ProviderClientAdapter.js';
import {
  markAppDataReady,
  markCatalogReady,
  markHubConnected,
} from '../bootstrap/loadMarks.js';
import type { AppDataClient } from '../runtime/appDataWorker/AppDataClient.js';
import type { ConfigClient } from '../runtime/configWorker/ConfigClient.js';
import { resolveProviderConfigFromConfigClient } from '../runtime/providerWorker/providerConfigBridge.js';

/** Hub bundle including legacy {@link DataServices} handles for migration. */
export interface ResolvedDataServicesHubBundle extends DataServicesHubBundle {
  readonly client: DataServices['client'];
  readonly appData: DataServices['appData'];
  readonly configManager: ConfigManager;
  /**
   * When set, {@link getProvider} / React `useDataProvider` route subscribe
   * to per-provider SharedWorkers (ADR Phase 4d).
   */
  readonly providerWorkerRouting?: ProviderWorkerRoutingOpts;
  /**
   * Config SharedWorker client when `configWorkerScriptUrl` was provided
   * (ADR single-writer catalog path).
   */
  readonly configClient?: ConfigClient;
}

/** Options for {@link ensureDataServicesHub}. */
export interface EnsureHubOpts extends PlatformBootstrapConfig {
  workerScriptUrl: string;
  /** Main-thread ConfigManager (initialized before hub connect). */
  mainThreadConfigManager: ConfigManager;
  /**
   * Opt-in per-provider SharedWorker asset URL (ADR Phase 4d).
   * When set, `getProvider` uses `createProviderClient` for data subscribe.
   */
  providerWorkerScriptUrl?: string;
  /**
   * Engine worker asset for the pull data path
   * (`assets/perspective-server.worker.mjs`). When set alongside
   * {@link providerWorkerScriptUrl}, pull-capable consumers
   * (`MarketsGridContainer dataPlane='pull'`) can attach worker-hosted
   * Perspective tables.
   */
  perspectiveWorkerScriptUrl?: string;
  /** Forwarded into provider-worker bootstrap for AppData template bridge. */
  appDataWorkerScriptUrl?: string;
  /** Forwarded into provider-worker bootstrap for Config SW bridge. */
  configWorkerScriptUrl?: string;
  /**
   * When set, UI AppData mirror attaches to AppData SW (ADR control-plane
   * split) instead of the monolith hub.
   */
  appDataClient?: AppDataClient;
  /**
   * When set, {@link ProviderClientAdapter} resolves catalog cfg via
   * Config SW instead of the monolith hub client.
   */
  configClient?: ConfigClient;
  /**
   * Reject streaming attach on the monolith hub. Default true when
   * {@link providerWorkerScriptUrl} is set.
   */
  hubStreamingDisabled?: boolean;
  /**
   * Skip AppData hydrate/serve on the monolith hub. Default true when
   * {@link appDataClient} or {@link appDataWorkerScriptUrl} is set.
   */
  hubAppDataDisabled?: boolean;
}

/** The window's single SharedWorker port + client for one `appId`. */
export interface HubConnection {
  worker: SharedWorker;
  client: SharedWorkerDataServicesClient;
}

/** Options for {@link warmHubConnection} — hub opts minus the ConfigManager. */
export type WarmHubConnectionOpts = PlatformBootstrapConfig & {
  workerScriptUrl: string;
  hubStreamingDisabled?: boolean;
  hubAppDataDisabled?: boolean;
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
    hubStreamingDisabled: opts.hubStreamingDisabled,
    hubAppDataDisabled: opts.hubAppDataDisabled,
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

/** The two hydration signals, resolved in parallel; `ready` = both. */
interface HubReadiness {
  ready: Promise<void>;
  appDataReady: Promise<void>;
  catalogReady: Promise<void>;
}

function buildReadiness(
  services: DataServices,
  configClient?: ConfigClient,
): HubReadiness {
  const appDataReady = (async () => {
    await services.ready;
    markAppDataReady();
  })();
  const catalogReady = (async () => {
    if (configClient) {
      await configClient.ready;
    } else {
      await services.client.waitForCatalogReady();
    }
    markCatalogReady();
  })();
  const ready = Promise.all([appDataReady, catalogReady]).then(() => undefined);
  // These may go unawaited (Phase 2: the bundle is returned before full
  // hydration). Attach no-op rejection handlers so a hydration failure can't
  // surface as an unhandled rejection — awaiters still observe the rejection.
  appDataReady.catch(() => {});
  catalogReady.catch(() => {});
  ready.catch(() => {});
  return { ready, appDataReady, catalogReady };
}

function adaptDataServicesToHubBundle(
  services: DataServices,
  appId: string,
  readiness: HubReadiness,
  opts: EnsureHubOpts,
): ResolvedDataServicesHubBundle {
  const providerWorkerRouting: ProviderWorkerRoutingOpts | undefined =
    opts.providerWorkerScriptUrl
      ? {
          workerScriptUrl: opts.providerWorkerScriptUrl,
          perspectiveWorkerScriptUrl: opts.perspectiveWorkerScriptUrl,
          appId: opts.appId,
          userId: opts.userId,
          configServiceRestUrl: resolveConfigServiceRestUrl(opts),
          seedConfigUrl: opts.seedConfigUrl,
          seedConfigReload: opts.seedConfigReload,
          appDataWorkerScriptUrl: opts.appDataWorkerScriptUrl,
          configWorkerScriptUrl: opts.configWorkerScriptUrl,
        }
      : undefined;

  const resolveProviderConfig = opts.configClient
    ? (providerId: string) =>
        resolveProviderConfigFromConfigClient(opts.configClient!, providerId)
    : undefined;

  return {
    ready: readiness.ready,
    appDataReady: readiness.appDataReady,
    catalogReady: readiness.catalogReady,
    providerWorkerRouting,
    getProvider(providerId: string): IDataProvider {
      return new ProviderClientAdapter({
        client: services.client,
        providerId,
        providerWorker: providerWorkerRouting,
        resolveProviderConfig,
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
    configManager: services.configManager,
    configClient: opts.configClient,
  };
}

async function bootstrapHubOnce(opts: EnsureHubOpts): Promise<ResolvedDataServicesHubBundle> {
  const hubStreamingDisabled =
    opts.hubStreamingDisabled ?? Boolean(opts.providerWorkerScriptUrl);
  const hubAppDataDisabled =
    opts.hubAppDataDisabled
    ?? Boolean(opts.appDataClient ?? opts.appDataWorkerScriptUrl);
  const connection = getOrCreateHubConnection({
    ...opts,
    hubStreamingDisabled,
    hubAppDataDisabled,
  });
  const services = bootstrapDataServices({
    appName: opts.appId,
    worker: connection.worker,
    client: connection.client,
    configManager: opts.mainThreadConfigManager,
    userId: opts.userId,
    appDataClient: opts.appDataClient,
  });
  markHubConnected();
  // Return as soon as the hub connection is established — the AppData snapshot
  // and catalog preload resolve in the background via the readiness promises.
  const readiness = buildReadiness(services, opts.configClient);
  return adaptDataServicesToHubBundle(services, opts.appId, readiness, opts);
}

/**
 * Lazy hub entry — one SharedWorker + client bundle per `appId` per window.
 * Resolves once the hub connection is established; the AppData mirror snapshot
 * and worker catalog preload settle in the background via the bundle's
 * `appDataReady` / `catalogReady` / `ready` promises.
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
