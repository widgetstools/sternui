/**
 * AppData SharedWorker public barrel (ADR Phase 3).
 */

export {
  AppDataHub,
  isAppDataHubRequest,
  type AppDataHubOpts,
  type AppDataHubRequest,
  type AppDataHubOutbound,
  type AppDataPortLike,
  type AppDataLookupRequest,
  type AppDataLookupResponse,
  type AppDataWorkerReadyRequest,
  type AppDataWorkerReadyResponse,
} from './AppDataHub.js';

export {
  installAppDataHub,
  type InstallAppDataHubOpts,
  type InstalledAppDataWorker,
} from './installAppDataHub.js';

export {
  createAppDataWorker,
  APPDATA_WORKER_ASSET,
  type CreateAppDataWorkerOpts,
} from './createAppDataWorker.js';

export { AppDataClient } from './AppDataClient.js';

export {
  createAppDataClient,
  _resetAppDataClientsForTests,
  type CreateAppDataClientOpts,
} from './createAppDataClient.js';
