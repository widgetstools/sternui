/**
 * Config SharedWorker public barrel (ADR Phase 2).
 */

export type {
  ConfigWorkerRequest,
  ConfigWorkerResponse,
  ConfigWorkerEvent,
  ConfigWorkerInbound,
} from './protocol.js';
export { isConfigWorkerRequest } from './protocol.js';

export { ConfigCatalogHub, type ConfigCatalogHubOpts, type ConfigPortLike } from './ConfigCatalogHub.js';
export {
  installConfigCatalogHub,
  type InstallConfigCatalogHubOpts,
  type InstalledConfigWorker,
} from './installConfigCatalogHub.js';

export {
  createConfigWorker,
  CONFIG_WORKER_ASSET,
  type CreateConfigWorkerOpts,
} from './createConfigWorker.js';

export {
  ConfigClient,
  type CatalogChangedHandler,
} from './ConfigClient.js';

export {
  createConfigClient,
  _resetConfigClientsForTests,
  type CreateConfigClientOpts,
} from './createConfigClient.js';

export { wireConfigWorkerCatalogSync } from './wireConfigWorkerCatalogSync.js';
