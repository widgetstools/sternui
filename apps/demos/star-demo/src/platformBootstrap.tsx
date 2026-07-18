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
 *   • `initPlatformBootstrap` → config + monolith `mkt-data-services` hub (P2 blotters).
 *   Routes pick a gate in `main.tsx` so Config Browser never awaits FullGate.
 *
 * Phase 2 — Config SharedWorker (`starui-config:{appId}`):
 *   Pass `configWorkerScriptUrl` so catalog cache / invalidate can live off the
 *   hot data hub. Main-thread ConfigManager remains the Dexie CRUD path;
 *   `wireConfigWorkerCatalogSync` keeps the Config SW aligned.
 *
 * Phase 3 — AppData SharedWorker (`starui-appdata:{appId}`):
 *   Pass `appDataWorkerScriptUrl` so named KV / template bags warm without
 *   requiring a streaming provider subscription. The monolith hub still keeps
 *   in-process AppData for live providers until Phase 4 cutover.
 *
 * Phase 4 — Per-provider workers (`starui-provider:{appId}:{id}`):
 *   Not wired here yet. Demos still subscribe through the monolith hub via
 *   `DataHubProvider`. Opt-in later with `ProviderClientAdapter({ providerWorker })`.
 *
 * Dual-run note: Config SW + AppData SW are warmed alongside the data hub.
 * That is intentional during migration — single-writer cutover is a follow-up.
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

/** Monolith data hub (streaming providers + fan-out) — still required for P2 blotters. */
import workerAssetUrl from '@wellsfargo-starui/host-data/assets/data-services-worker.mjs?url';
/** ADR Phase 2 — catalog authority worker (optional for P1; warmed here for all config boots). */
import configWorkerAssetUrl from '@wellsfargo-starui/host-data/assets/config-catalog-worker.mjs?url';
/** ADR Phase 3 — AppData KV worker (template / session bags without the data hub). */
import appDataWorkerAssetUrl from '@wellsfargo-starui/host-data/assets/appdata-worker.mjs?url';

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
 * Does **not** spawn `mkt-data-services:{appId}`.
 *
 * Browser: `/app-config.json`. OpenFin: manifest `customSettings`.
 */
export function initConfigBootstrap(): Promise<ConfigBootstrapResult> {
  if (!configBootstrapPromise) {
    configBootstrapPromise = (async () => {
      const config = isOpenFinRuntime()
        ? await resolvePlatformBootstrapFromManifest()
        : await resolvePlatformBootstrapFromJson('/app-config.json');
      // Worker script URLs are the ADR Phase 2–3 opt-in. Omitting them keeps
      // ConfigManager-only behaviour (legacy); star-demo always passes both.
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
 * Reuses ConfigManager from {@link initConfigBootstrap} (no second IndexedDB
 * connection when upgrading ConfigGate → FullGate). Also re-passes Config /
 * AppData worker URLs so Phase 2–3 workers stay warm when a window opens
 * straight into a blotter route.
 *
 * Still connects the monolith data hub (`workerScriptUrl`). Per-provider
 * SharedWorkers (Phase 4) are not the demo default yet.
 */
export function initPlatformBootstrap(): Promise<PlatformBootstrapResult> {
  if (!platformBootstrapPromise) {
    platformBootstrapPromise = (async () => {
      const { config } = await initConfigBootstrap();
      const platform = await ensurePlatformReady(config, {
        workerScriptUrl: workerAssetUrl,
        configWorkerScriptUrl: configWorkerAssetUrl,
        appDataWorkerScriptUrl: appDataWorkerAssetUrl,
      });
      setConfigManager(platform.configManager);
      return { config, platform };
    })();
  }
  return platformBootstrapPromise;
}
