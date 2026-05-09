/**
 * dataServices.sharedWorker.ts — SharedWorker entry for this app's
 * data-services runtime.
 *
 * The provider window and every blotter view share one socket-set per
 * configured provider via this SharedWorker. Vite resolves the asset
 * URL at build time when the main thread does:
 *
 *     new SharedWorker(
 *       new URL('./dataServices.sharedWorker.ts', import.meta.url),
 *       { name: '...' },
 *     )
 *
 * `installSharedWorkerHub` from `@starui/data-services/runtime/sharedWorker`
 * wires the SharedWorker's `onconnect` to a new
 * SharedWorkerDataServicesHub. The hub owns the cache + provider
 * lifecycle + stats sampler PLUS AppData persistence — it constructs
 * its own ConfigManager (Dexie connection) here and stays the sole
 * IndexedDB writer for AppData rows. Every window's main-thread
 * `dataServices` bundle holds a SEPARATE ConfigManager for editor
 * persistence (DataProviderConfigStore); both connect to the same
 * Dexie database.
 *
 * Provider factories (Mock / STOMP / REST) are registered at module
 * init in `runtime/providers/registry.ts`.
 *
 * Top-level logs let you confirm the worker is alive: open
 * chrome://inspect → Shared Workers → click "inspect" next to
 * `mkt-data-services:<appId>`. If you DON'T see
 * "[dataServices.sharedWorker] booted" there, the worker script failed
 * to load or threw before installSharedWorkerHub ran — the source of
 * "subscribe never resolves" symptoms.
 */

// eslint-disable-next-line no-console
console.info('[dataServices.sharedWorker] script loaded');

import { installSharedWorkerHub } from '@starui/data-services/runtime/sharedWorker';
import { createConfigManager } from '@starui/config-service';

// eslint-disable-next-line no-console
console.info('[dataServices.sharedWorker] imports resolved');

// REST endpoint for `@starui/config-service-server`. Sourced from the
// `?configServiceRestUrl=…` param the main-thread bootstrap stamped onto
// our scriptURL. SharedWorkers run in their own global scope without
// access to OpenFin's `fin` object, so the manifest is read once on
// the main thread and forwarded here. See `dataServices.mainThread.ts`.
//
// Empty / missing → local Dexie only. The first tab to spawn the
// worker fixes the URL for the worker's lifetime; subsequent tabs
// (with the same worker `name`) attach to that running instance.
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
    `[dataServices.sharedWorker] ConfigManager initialised (mode: ${configManager.isRestMode() ? 'REST' : 'local'})`,
  );

  await installSharedWorkerHub({ configManager });
  // eslint-disable-next-line no-console
  console.info('[dataServices.sharedWorker] booted; hub waiting for ports');
}

boot().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[dataServices.sharedWorker] boot failed', err);
  // Re-throw so the worker surfaces the error in DevTools — without
  // this, a Dexie open failure looks like a silently-stuck worker.
  throw err;
});
