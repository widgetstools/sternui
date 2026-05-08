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
import { LOGGED_IN_USER_ID } from '@starui/runtime-port';

const APP_ID = 'TestApp';

const worker = new SharedWorker(
  new URL('./dataServices.sharedWorker.ts', import.meta.url),
  { type: 'module', name: `mkt-data-services:${APP_ID}` },
);

worker.addEventListener('error', (ev) => {
  // eslint-disable-next-line no-console
  console.error('[data-services SharedWorker] error event', ev);
});

export const dataServices = bootstrapDataServices({
  appName: APP_ID,
  worker,
  configManager: createConfigManager({}),
  userId: LOGGED_IN_USER_ID,
});
