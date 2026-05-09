/**
 * dataServices.mainThread.ts — bootstrap the per-app data-services
 * bundle (SharedWorker client + AppDataMirror + ConfigManager).
 *
 * The `new SharedWorker(new URL(...))` literal must stay co-located
 * with its target file so Vite's worker plugin emits a separate
 * worker chunk and rewrites the URL. The construction stays here;
 * `bootstrapDataServices()` wraps the worker into a `DataServices`
 * bundle consumed by the rest of the app.
 *
 * Consumers import `dataServices` (the bundle) and pass it to
 * `<DataServicesProvider services={dataServices}>` /
 * `<HostedMarketsGrid dataServices={dataServices}>`.
 */

import { bootstrapDataServices } from '@starui/data-services';
import { createConfigManager } from '@starui/config-service';
import { getConfigServiceRestUrlFromManifest } from '@starui/openfin-platform/config';
import { LOGGED_IN_USER_ID } from '@starui/runtime-port';

const APP_ID = 'TestApp';

// REST endpoint for `@starui/config-service-server`. Single source of
// truth: the OpenFin manifest's `customSettings.{useRest, configServiceRestUrl}`
// (resolved by `getConfigServiceRestUrlFromManifest()` to a URL or
// `undefined`). Same gate every other ConfigManager in the platform
// reads from — flipping `useRest` in the manifest flips ALL three
// ConfigManagers (Provider + main-thread bundle + SharedWorker hub)
// in lockstep. Out of OpenFin → `undefined` → local-only.
const CONFIG_SERVICE_REST_URL = await getConfigServiceRestUrlFromManifest();

// Forward the resolved URL to the SharedWorker via a query-string param.
// SharedWorkers can't read OpenFin's `fin` global (no access to the
// host window), so the main thread does the manifest read once and
// inlines the result onto the worker's scriptURL where the worker can
// read it back from `self.location.search`. The first tab to spawn the
// worker fixes the URL — subsequent tabs with the same `name` reuse
// that running worker, so the URL stays consistent.
const workerUrl = new URL('./dataServices.sharedWorker.ts', import.meta.url);
if (CONFIG_SERVICE_REST_URL) {
  workerUrl.searchParams.set('configServiceRestUrl', CONFIG_SERVICE_REST_URL);
}

const worker = new SharedWorker(workerUrl, {
  type: 'module',
  name: `mkt-data-services:${APP_ID}`,
});

worker.addEventListener('error', (ev) => {
  // eslint-disable-next-line no-console
  console.error('[data-services SharedWorker] error event', ev);
});

export const dataServices = bootstrapDataServices({
  appName: APP_ID,
  worker,
  configManager: createConfigManager({ configServiceRestUrl: CONFIG_SERVICE_REST_URL }),
  userId: LOGGED_IN_USER_ID,
});
