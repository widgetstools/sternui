/**
 * Default SharedWorker entry for `@stargrid/host-data`.
 *
 * Apps that don't need a customised hub can use this directly via
 * `createDataServicesClient()` (see `../bootstrap/createDataServicesClient.ts`).
 * The factory passes the resolved ConfigService REST URL to the worker
 * by appending `?configServiceRestUrl=…` to the worker's scriptURL;
 * this entry reads it back from `self.location.search` and constructs
 * its ConfigManager accordingly.
 *
 * Why a query param: SharedWorkers run in their own global scope with
 * no access to OpenFin's `fin` object or the main thread's modules.
 * The main thread reads the URL once from the manifest and forwards
 * it here on the scriptURL. The first tab to spawn the worker fixes
 * the URL — subsequent tabs with the same `name` attach to the
 * running instance.
 *
 * Apps that need bespoke worker setup (extra services, custom
 * ConfigManager wiring) should keep their own worker file and call
 * `installSharedWorkerHub({...})` directly, then pass the worker to
 * `bootstrapDataServices({ worker, ... })`.
 */

import { installSharedWorkerHub } from './index.js';
import { createConfigManager } from '@stargrid/host-config';

const CONFIG_SERVICE_REST_URL =
  new URLSearchParams(self.location.search).get('configServiceRestUrl') ||
  undefined;

async function boot(): Promise<void> {
  const configManager = createConfigManager({
    configServiceRestUrl: CONFIG_SERVICE_REST_URL,
  });
  await configManager.init();
  // eslint-disable-next-line no-console
  console.info(
    `[@stargrid/host-data worker] ConfigManager initialised (mode: ${configManager.isRestMode() ? 'REST' : 'local'})`,
  );
  await installSharedWorkerHub({ configManager });
  // eslint-disable-next-line no-console
  console.info('[@stargrid/host-data worker] booted; hub waiting for ports');
}

boot().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[@stargrid/host-data worker] boot failed', err);
  // Re-throw so the worker surfaces the error in DevTools — without
  // this, a Dexie open failure looks like a silently-stuck worker.
  throw err;
});
