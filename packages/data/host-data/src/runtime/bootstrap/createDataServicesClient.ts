/**
 * createDataServicesClient — one-call factory that owns the
 * SharedWorker construction + `bootstrapDataServices` wrapping.
 *
 * Before this helper, every consuming app duplicated the literal:
 *
 *     const workerUrl = new URL('./dataServices.sharedWorker.ts', import.meta.url);
 *     if (restUrl) workerUrl.searchParams.set('configServiceRestUrl', restUrl);
 *     const worker = new SharedWorker(workerUrl, { type: 'module', name: ... });
 *     export const dataServices = bootstrapDataServices({ ... });
 *
 * plus an app-local `dataServices.sharedWorker.ts` that did
 * `installSharedWorkerHub` + `createConfigManager`. Both pieces are
 * generic — only `appName`, `userId`, and `restUrl` vary per app.
 *
 * This factory:
 *   1. Builds the worker URL pointing at `./worker/defaultEntry.js`
 *      (shipped inside this package), stamping `configServiceRestUrl`
 *      onto its `searchParams` when supplied.
 *   2. Constructs the `SharedWorker` with `{ type: 'module', name: ... }`.
 *      The literal is co-located so Vite's worker plugin emits a
 *      separate chunk — see "Worker URL constraint" below.
 *   3. Constructs the main-thread `ConfigManager` (shared across
 *      editor flows).
 *   4. Calls `bootstrapDataServices(...)` and returns the bundle.
 *
 * Worker URL constraint (Vite + tarball consumers):
 *   Vite's worker plugin scans for the literal
 *     `new SharedWorker(new URL('./...', import.meta.url), {...})`
 *   at the **app call site**. When this factory runs inside
 *   `@starui/host-data`, Vite prebundling (`.vite/deps/`) rewrites
 *   `import.meta.url` so the worker script 404s ("Failed to fetch a
 *   worker script"). Tarball-installed apps MUST keep an app-local
 *   `sharedWorker/entry.ts` and call `bootstrapDataServices({ worker })`
 *   directly — see `apps/demo-apps/mockdata-provider-starui-app`.
 *
 *   This factory remains useful for non-Vite bundlers or tests that
 *   resolve the package source without prebundling.
 *
 * Escape hatch:
 *   Apps that need bespoke worker setup (extra services, custom
 *   ConfigManager wiring) should keep their own worker file and call
 *   `installSharedWorkerHub({...})` + `bootstrapDataServices({...})`
 *   directly. This factory is the default for the 99% case.
 */

import { createConfigManager, type ConfigManager } from '@starui/host-config';
import { bootstrapDataServices, type DataServices } from './bootstrap.js';

export interface CreateDataServicesClientOpts {
  /**
   * Idempotency key for `bootstrapDataServices`. Same `appName`
   * across calls = same `DataServices` object reference.
   *
   * Also used to name the SharedWorker (`mkt-data-services:<appName>`)
   * so multiple apps in the same browser cohabit cleanly.
   */
  appName: string;

  /**
   * Logged-in user id. Stamped onto AppData rows created by this
   * client.
   */
  userId: string;

  /**
   * ConfigService REST URL forwarded to the worker via
   * `?configServiceRestUrl=…` on the worker's scriptURL. The
   * worker re-reads it from `self.location.search` and constructs
   * its ConfigManager accordingly. Empty/missing → local Dexie only.
   */
  configServiceRestUrl?: string;

  /**
   * Optional override — supply a ConfigManager for the main-thread
   * bundle (editor flows). Defaults to a fresh
   * `createConfigManager({ configServiceRestUrl })` so the main
   * thread and the worker stay aligned automatically.
   */
  mainThreadConfigManager?: ConfigManager;
}

export function createDataServicesClient(
  opts: CreateDataServicesClientOpts,
): DataServices {
  // Stamp the REST URL onto the worker scriptURL. SharedWorkers
  // can't read OpenFin's `fin` global; main thread does the manifest
  // read once and forwards the resolved URL here.
  const workerUrl = new URL('../worker/defaultEntry.js', import.meta.url);
  if (opts.configServiceRestUrl) {
    workerUrl.searchParams.set('configServiceRestUrl', opts.configServiceRestUrl);
  }

  const worker = new SharedWorker(workerUrl, {
    type: 'module',
    name: `mkt-data-services:${opts.appName}`,
  });

  worker.addEventListener('error', (ev) => {
    // eslint-disable-next-line no-console
    console.error('[@starui/host-data] SharedWorker error event', ev);
  });

  const configManager =
    opts.mainThreadConfigManager ??
    createConfigManager({ configServiceRestUrl: opts.configServiceRestUrl });

  return bootstrapDataServices({
    appName: opts.appName,
    worker,
    configManager,
    userId: opts.userId,
  });
}
