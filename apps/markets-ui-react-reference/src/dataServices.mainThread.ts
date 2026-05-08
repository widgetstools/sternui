/**
 * dataServices.mainThread.ts — owns the SharedWorker and the
 * SharedWorkerDataServicesClient that talks to it.
 *
 * Why this lives in the APP (and not via @starui/data-services's
 * public surface): Vite's worker plugin needs to see
 *   `new SharedWorker(new URL('./worker.ts', import.meta.url), { type: 'module' })`
 * as ONE literal expression at build time so it can emit a separate
 * worker chunk and rewrite the URL. Routing the construction through
 * a helper in another package defeats the static analysis — the
 * .ts gets served as a plain asset and the worker fails to boot.
 *
 * The construction stays here, colocated with the URL literal. The
 * rest of the app reads `dataServicesClient` (and the matching
 * `<DataServicesProvider client={...}>`) from this module.
 */

import { SharedWorkerDataServicesClient } from '@starui/data-services/runtime/client';

// SharedWorker name is keyed off the appId so different MarketsUI
// apps running in the same browser don't share a worker by accident.
// The reference app uses a single appId everywhere; multiple blotter
// views in the same app SHOULD share the worker (that's the whole
// point of using a SharedWorker).
const APP_ID = 'TestApp';
const sharedWorkerName = `mkt-data-services:${APP_ID}`;

// Both `new URL(...)` and `new SharedWorker(...)` appear together in
// this expression so Vite's worker plugin picks it up.
const worker = new SharedWorker(
  new URL('./dataServices.sharedWorker.ts', import.meta.url),
  { type: 'module', name: sharedWorkerName },
);

// `error` event surfaces script-load failures and uncaught throws on
// the worker side. Without this, a failing worker is invisible.
worker.addEventListener('error', (ev) => {
  // eslint-disable-next-line no-console
  console.error('[data-services SharedWorker] error event', ev);
});

// SharedWorkerDataServicesClient takes a MessagePort. The constructor
// calls `port.start()` internally so the channel is live as soon as
// the worker accepts the connect event.
export const dataServicesClient = new SharedWorkerDataServicesClient(worker.port);
