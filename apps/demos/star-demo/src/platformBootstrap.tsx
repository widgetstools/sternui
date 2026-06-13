import {
  createContext,
  useContext,
  type ReactNode,
} from 'react';
import {
  configureWorkerConfigHub,
  ensurePlatformReady,
  resolvePlatformBootstrapFromJson,
  type PlatformBootstrapConfig,
  type ResolvedDataServicesHubBundle,
  type WorkerConfigManagerClient,
} from '@starui/host-data';
import type { ConfigManager } from '@starui/host-config';
import {
  resolvePlatformBootstrapFromManifest,
  setConfigManager,
} from '@starui/openfin-platform/config';
import workerAssetUrl from '@starui/host-data/assets/data-services-worker.mjs?url';

configureWorkerConfigHub({ workerScriptUrl: workerAssetUrl });

export interface PlatformBootstrapResult {
  config: PlatformBootstrapConfig;
  platform: ResolvedDataServicesHubBundle;
}

/** Config-only bootstrap result — worker config facade (same hub as full bootstrap). */
export interface ConfigBootstrapResult {
  config: PlatformBootstrapConfig;
  configManager: ConfigManager | WorkerConfigManagerClient;
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

let platformBootstrapPromise: Promise<PlatformBootstrapResult> | undefined;

async function resolveBootstrapConfig(): Promise<PlatformBootstrapConfig> {
  return isOpenFinRuntime()
    ? resolvePlatformBootstrapFromManifest()
    : resolvePlatformBootstrapFromJson('/app-config.json');
}

/**
 * Full platform bootstrap: SharedWorker hub connect, AppData mirror
 * snapshot, catalog preload. Idempotent per window.
 */
export function initPlatformBootstrap(): Promise<PlatformBootstrapResult> {
  if (!platformBootstrapPromise) {
    platformBootstrapPromise = (async () => {
      const config = await resolveBootstrapConfig();
      const platform = await ensurePlatformReady(config, { workerScriptUrl: workerAssetUrl });
      setConfigManager(platform.configManager);
      return { config, platform };
    })();
  }
  return platformBootstrapPromise;
}

/**
 * Config-only bootstrap — same hub connection as {@link initPlatformBootstrap}
 * (worker-authoritative Dexie). Used by routes that do not mount
 * `DataHubProvider` but still read/write config rows.
 */
export function initConfigBootstrap(): Promise<ConfigBootstrapResult> {
  return initPlatformBootstrap().then(({ config, platform }) => ({
    config,
    configManager: platform.configManager,
  }));
}
