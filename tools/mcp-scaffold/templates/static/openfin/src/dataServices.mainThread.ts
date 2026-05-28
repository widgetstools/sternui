/**
 * dataServices.mainThread.ts — bootstrap the per-app data-services
 * bundle for this app.
 *
 * Uses the esbuild-bundled worker asset shipped in `@starui/host-data`.
 * The `?url` import must stay here (app call site) so Vite serves the
 * asset; the worker script itself is fully bundled inside the library.
 */

import { bootstrapDataServicesWithWorkerAsset } from '@starui/host-data';
import workerAssetUrl from '@starui/host-data/assets/data-services-worker.mjs?url';
import { getConfigServiceRestUrlFromManifest } from '@starui/openfin-platform/config';
import { LOGGED_IN_USER_ID } from '@starui/types';

const APP_ID = 'markets-ui-react-reference';

const CONFIG_SERVICE_REST_URL = await getConfigServiceRestUrlFromManifest();

export const dataServices = bootstrapDataServicesWithWorkerAsset(
  workerAssetUrl,
  {
    appName: APP_ID,
    userId: LOGGED_IN_USER_ID,
    configServiceRestUrl: CONFIG_SERVICE_REST_URL,
  },
);
