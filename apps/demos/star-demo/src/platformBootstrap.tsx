/**
 * star-demo platform bootstrap — optional data-plane topology (ADR).
 *
 * See `docs/ADR-optional-data-plane-topology.md`. This file is where the demo
 * opts into the lazy named SharedWorkers so tool windows are not forced through
 * the monolith data hub before paint.
 *
 * What changed for the new architecture
 * -------------------------------------
 * Phase 0 — Split bootstrap APIs:
 *   • `initConfigBootstrap` → ConfigManager only (P1 tool windows).
 *   • `initPlatformBootstrap` → config + hub (+ optional provider SWs) for P2.
 *   Routes pick a gate in `main.tsx` so Config Browser never awaits FullGate.
 *
 * Phase 2 — Config SharedWorker (`starui-config:{appId}`):
 *   Pass `configWorkerScriptUrl` so catalog cache / invalidate can live off the
 *   hot data hub. Main-thread ConfigManager remains the Dexie CRUD path;
 *   `wireConfigWorkerCatalogSync` keeps the Config SW aligned.
 *
 * Phase 3 — AppData SharedWorker (`starui-appdata:{appId}`):
 *   Pass `appDataWorkerScriptUrl` so named KV / template bags warm without
 *   requiring a streaming provider subscription.
 *
 * Phase 4d — Per-provider workers (`starui-provider:{appId}:{id}`):
 *   Pass `providerWorkerScriptUrl` so blotter `useDataProvider` / `getProvider`
 *   subscribe on dedicated workers. That also sets `hubStreamingDisabled` so
 *   the monolith rejects live attach (control-plane only).
 *
 * Control-plane split (post-4d):
 *   With Config + AppData worker URLs, UI AppData mirror attaches to AppData SW
 *   and `getProviderConfig` prefers Config SW. The monolith hub remains for
 *   catalog invalidate dual-path, hub inspector, and legacy callers without
 *   provider workers.
 *
 * Dual-run note: Config SW + AppData SW + thin monolith hub still coexist;
 * provider SWs own streaming.
 */

import {
  createContext,
  useContext,
  type ReactNode,
} from 'react';
import {
  ensureConfigReady,
  ensurePlatformReady,
  resolvePlatformBootstrapFromJson,
  type ConfigReadyBundle,
  type PlatformBootstrapConfig,
  type ResolvedDataServicesHubBundle,
} from '@wellsfargo-starui/host-data';
import {
  resolvePlatformBootstrapFromManifest,
  setConfigManager,
} from '@wellsfargo-starui/openfin-platform/config';

/** Monolith data hub — catalog + AppData mirror (+ legacy multi-provider path). */
import workerAssetUrl from '@wellsfargo-starui/host-data/assets/data-services-worker.mjs?url';
/** ADR Phase 2 — catalog authority worker. */
import configWorkerAssetUrl from '@wellsfargo-starui/host-data/assets/config-catalog-worker.mjs?url';
/** ADR Phase 3 — AppData KV worker. */
import appDataWorkerAssetUrl from '@wellsfargo-starui/host-data/assets/appdata-worker.mjs?url';
/** ADR Phase 4d — one SharedWorker per streaming provider id. */
import providerWorkerAssetUrl from '@wellsfargo-starui/host-data/assets/provider-worker.mjs?url';
/** SSRM pull plane — worker-hosted Perspective engine (`starui-psp:{appId}:{id}`). */
import perspectiveWorkerAssetUrl from '@wellsfargo-starui/host-data/assets/perspective-server.worker.mjs?url';

export interface PlatformBootstrapResult {
  config: PlatformBootstrapConfig;
  platform: ResolvedDataServicesHubBundle;
}

/**
 * Config-only bootstrap result — no `DataHubProvider` / no streaming attach.
 * `configClient` / `appDataClient` are present when the Phase 2–3 worker URLs
 * were passed (always, in this demo).
 */
export interface ConfigBootstrapResult {
  config: PlatformBootstrapConfig;
  configManager: ConfigReadyBundle['configManager'];
  configClient?: ConfigReadyBundle['configClient'];
  appDataClient?: ConfigReadyBundle['appDataClient'];
}

const PlatformBootstrapContext = createContext<PlatformBootstrapResult | null>(null);

export function PlatformBootstrapProvider({
  value,
  children,
}: {
  value: PlatformBootstrapResult;
  children: ReactNode;
}): ReactNode {
  return (
    <PlatformBootstrapContext.Provider value={value}>
      {children}
    </PlatformBootstrapContext.Provider>
  );
}

export function usePlatformBootstrap(): PlatformBootstrapResult {
  const ctx = useContext(PlatformBootstrapContext);
  if (!ctx) {
    throw new Error('usePlatformBootstrap() requires PlatformBootstrapProvider');
  }
  return ctx;
}

function isOpenFinRuntime(): boolean {
  if (typeof globalThis === 'undefined') return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fin = (globalThis as any).fin;
  return Boolean(fin?.Platform?.getCurrentSync);
}

let configBootstrapPromise: Promise<ConfigBootstrapResult> | undefined;
let platformBootstrapPromise: Promise<PlatformBootstrapResult> | undefined;

/**
 * P1 profile — Config (+ optional AppData) without the streaming data plane.
 *
 * Used by ConfigGate routes (`/config-browser`, `/workspace-setup`, dock paint).
 * Spawns/attaches:
 *   • main-thread ConfigManager (Dexie / REST)
 *   • `starui-config:{appId}` (Phase 2)
 *   • `starui-appdata:{appId}` (Phase 3)
 * Does **not** spawn `mkt-data-services:{appId}` or provider workers.
 *
 * Browser: `/app-config.json`. OpenFin: manifest `customSettings`.
 */
export function initConfigBootstrap(): Promise<ConfigBootstrapResult> {
  if (!configBootstrapPromise) {
    configBootstrapPromise = (async () => {
      const config = isOpenFinRuntime()
        ? await resolvePlatformBootstrapFromManifest()
        : await resolvePlatformBootstrapFromJson('/app-config.json');
      const { configManager, configClient, appDataClient } = await ensureConfigReady(config, {
        configWorkerScriptUrl: configWorkerAssetUrl,
        appDataWorkerScriptUrl: appDataWorkerAssetUrl,
      });
      setConfigManager(configManager);
      return { config, configManager, configClient, appDataClient };
    })();
  }
  return configBootstrapPromise;
}

/**
 * P2 profile — full hosted blotter bootstrap.
 *
 * Reuses ConfigManager from {@link initConfigBootstrap}. Connects the monolith
 * hub for catalog/AppData mirror, and enables per-provider SharedWorkers for
 * live subscribe (`providerWorkerScriptUrl` → `useDataProvider` demux).
 */
export function initPlatformBootstrap(): Promise<PlatformBootstrapResult> {
  if (!platformBootstrapPromise) {
    platformBootstrapPromise = (async () => {
      const { config } = await initConfigBootstrap();
      const platform = await ensurePlatformReady(config, {
        workerScriptUrl: workerAssetUrl,
        configWorkerScriptUrl: configWorkerAssetUrl,
        appDataWorkerScriptUrl: appDataWorkerAssetUrl,
        providerWorkerScriptUrl: providerWorkerAssetUrl,
        perspectiveWorkerScriptUrl: perspectiveWorkerAssetUrl,
      });
      setConfigManager(platform.configManager);
      return { config, platform };
    })();
  }
  return platformBootstrapPromise;
}
