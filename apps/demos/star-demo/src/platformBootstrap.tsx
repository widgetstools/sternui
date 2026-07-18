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
} from '@starui/host-data';
import {
  resolvePlatformBootstrapFromManifest,
  setConfigManager,
} from '@starui/openfin-platform/config';
import workerAssetUrl from '@starui/host-data/assets/data-services-worker.mjs?url';
import configWorkerAssetUrl from '@starui/host-data/assets/config-catalog-worker.mjs?url';

export interface PlatformBootstrapResult {
  config: PlatformBootstrapConfig;
  platform: ResolvedDataServicesHubBundle;
}

/** Config-only bootstrap result — ConfigManager without the data hub. */
export interface ConfigBootstrapResult {
  config: PlatformBootstrapConfig;
  configManager: ConfigReadyBundle['configManager'];
  configClient?: ConfigReadyBundle['configClient'];
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
 * Config-only bootstrap: manifest/app-config identity + ConfigManager +
 * Config SharedWorker (`starui-config:{appId}`, ADR Phase 2). Windows that
 * never touch the data plane suspend on this instead of
 * {@link initPlatformBootstrap}.
 *
 * Browser: `/app-config.json` (seedConfigUrl only). OpenFin: manifest
 * `customSettings` (prefer pinned `appId` / `userId`; else seed identity).
 */
export function initConfigBootstrap(): Promise<ConfigBootstrapResult> {
  if (!configBootstrapPromise) {
    configBootstrapPromise = (async () => {
      const config = isOpenFinRuntime()
        ? await resolvePlatformBootstrapFromManifest()
        : await resolvePlatformBootstrapFromJson('/app-config.json');
      const { configManager, configClient } = await ensureConfigReady(config, {
        configWorkerScriptUrl: configWorkerAssetUrl,
      });
      setConfigManager(configManager);
      return { config, configManager, configClient };
    })();
  }
  return configBootstrapPromise;
}

/**
 * Full platform bootstrap: config bootstrap plus the data-services hub
 * (SharedWorker connect, AppData mirror snapshot, catalog preload).
 * `ensurePlatformReady` reuses the ConfigManager from
 * {@link initConfigBootstrap}, so upgrading a window from config-only
 * to full costs no second IndexedDB connection.
 */
export function initPlatformBootstrap(): Promise<PlatformBootstrapResult> {
  if (!platformBootstrapPromise) {
    platformBootstrapPromise = (async () => {
      const { config } = await initConfigBootstrap();
      const platform = await ensurePlatformReady(config, {
        workerScriptUrl: workerAssetUrl,
        configWorkerScriptUrl: configWorkerAssetUrl,
      });
      setConfigManager(platform.configManager);
      return { config, platform };
    })();
  }
  return platformBootstrapPromise;
}
