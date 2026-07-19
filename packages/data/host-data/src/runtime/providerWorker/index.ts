/**
 * Provider SharedWorker public barrel (ADR Phase 4a).
 */

export {
  ProviderHub,
  isProviderHubRequest,
  type ProviderHubOpts,
  type ProviderHubRequest,
  type ProviderWorkerReadyRequest,
  type ProviderWorkerReadyResponse,
} from './ProviderHub.js';

export {
  installProviderHub,
  type InstallProviderHubOpts,
  type InstalledProviderWorker,
} from './installProviderHub.js';

export {
  createProviderWorker,
  PROVIDER_WORKER_ASSET,
  type CreateProviderWorkerOpts,
} from './createProviderWorker.js';

export { ProviderClient } from './ProviderClient.js';

export {
  createProviderClient,
  isProviderWorkerRunning,
  _resetProviderClientsForTests,
  type CreateProviderClientOpts,
} from './createProviderClient.js';

export {
  ProviderAppDataLookupCache,
  createProviderAppDataLookupCache,
  type AsyncAppDataLookup,
} from './providerAppDataLookupCache.js';

export { resolveProviderConfigFromConfigClient } from './providerConfigBridge.js';
