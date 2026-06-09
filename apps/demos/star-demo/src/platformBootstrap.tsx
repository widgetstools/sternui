import {
  createContext,
  useContext,
  type ReactNode,
} from 'react';
import {
  ensurePlatformReady,
  resolvePlatformBootstrapFromJson,
  type PlatformBootstrapConfig,
  type ResolvedDataServicesHubBundle,
} from '@starui/host-data';
import {
  resolvePlatformBootstrapFromManifest,
  setConfigManager,
} from '@starui/openfin-platform/config';
import workerAssetUrl from '@starui/host-data/assets/data-services-worker.mjs?url';

export interface PlatformBootstrapResult {
  config: PlatformBootstrapConfig;
  platform: ResolvedDataServicesHubBundle;
}

let platformRef: ResolvedDataServicesHubBundle | undefined;
let configRef: PlatformBootstrapConfig | undefined;

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

export function getPlatform(): ResolvedDataServicesHubBundle {
  if (!platformRef) {
    throw new Error('Call initPlatformBootstrap() before getPlatform()');
  }
  return platformRef;
}

export function getBootstrapConfig(): PlatformBootstrapConfig {
  if (!configRef) {
    throw new Error('Call initPlatformBootstrap() first');
  }
  return configRef;
}

/**
 * Browser: `/app-config.json` (seedConfigUrl only). OpenFin: manifest
 * `customSettings` (prefer pinned `appId` / `userId`; else seed identity).
 */
export async function initPlatformBootstrap(): Promise<PlatformBootstrapResult> {
  const config = isOpenFinRuntime()
    ? await resolvePlatformBootstrapFromManifest()
    : await resolvePlatformBootstrapFromJson('/app-config.json');
  const platform = await ensurePlatformReady(config, { workerScriptUrl: workerAssetUrl });
  setConfigManager(platform.configManager);
  platformRef = platform;
  configRef = config;
  return { config, platform };
}
