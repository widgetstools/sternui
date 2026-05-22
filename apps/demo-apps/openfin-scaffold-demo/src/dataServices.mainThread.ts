/**
 * Bootstrap the SharedWorker data-services hub for this app.
 *
 * Every window that needs ConfigManager / provider streams shares this bundle:
 * - Grid views (`StarGridApp` shell)
 * - Tool routes (`DataServicesProvider` only)
 *
 * The worker asset MUST be imported with `?url` at the app call site so Vite
 * emits and serves the bundled worker file.
 */
import { bootstrapDataServicesWithWorkerAsset } from '@starui/host-data';
import workerAssetUrl from '@starui/host-data/assets/data-services-worker.mjs?url';
import { getConfigServiceRestUrlFromManifest } from '@starui/openfin-platform/config';
import { LOGGED_IN_USER_ID } from '@starui/types';
import { APP_ID } from './constants';

const configServiceRestUrl = await getConfigServiceRestUrlFromManifest();

export const dataServices = bootstrapDataServicesWithWorkerAsset(workerAssetUrl, {
  appName: APP_ID,
  userId: LOGGED_IN_USER_ID,
  configServiceRestUrl,
});
