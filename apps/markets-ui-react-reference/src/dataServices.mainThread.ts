/**
 * dataServices.mainThread.ts — bootstrap the per-app data-services
 * bundle for this app.
 *
 * SharedWorker is constructed here (at the app call site) so Vite's
 * worker plugin can statically analyse `new SharedWorker(new URL(...))`
 * and emit a worker chunk. Do not use `createDataServicesClient()` from
 * the library — its worker URL is relative to the library module and
 * breaks once Vite prebundles `@starui/host-data` into `.vite/deps/`.
 *
 * Consumers import `dataServices` (the bundle) and pass it to
 * `<DataServicesProvider services={dataServices}>` /
 * `<HostedMarketsGrid dataServices={dataServices}>`.
 */

import { bootstrapDataServices } from '@starui/host-data';
import { createConfigManager } from '@starui/host-config';
import { getConfigServiceRestUrlFromManifest } from '@starui/openfin-platform/config';
import { LOGGED_IN_USER_ID } from '@starui/types';

const APP_ID = 'markets-ui-react-reference';

// REST endpoint for the config service. Single source of truth: the
// OpenFin manifest's `customSettings.{useRest, configServiceRestUrl}`
// (resolved by `getConfigServiceRestUrlFromManifest()` to a URL or
// `undefined`). Same gate every other ConfigManager in the platform
// reads from — flipping `useRest` in the manifest flips ALL three
// ConfigManagers (Provider + main-thread bundle + SharedWorker hub)
// in lockstep. Out of OpenFin → `undefined` → local-only.
const CONFIG_SERVICE_REST_URL = await getConfigServiceRestUrlFromManifest();

const workerUrl = new URL('./sharedWorker/entry.ts', import.meta.url);
if (CONFIG_SERVICE_REST_URL) {
  workerUrl.searchParams.set('configServiceRestUrl', CONFIG_SERVICE_REST_URL);
}

const worker = new SharedWorker(workerUrl, {
  type: 'module',
  name: `mkt-data-services:${APP_ID}`,
});

worker.addEventListener('error', (ev) => {
  // eslint-disable-next-line no-console
  console.error('[@starui/host-data] SharedWorker error event', ev);
});

const configManager = createConfigManager({
  configServiceRestUrl: CONFIG_SERVICE_REST_URL,
});

export const dataServices = bootstrapDataServices({
  appName: APP_ID,
  worker,
  configManager,
  userId: LOGGED_IN_USER_ID,
});
