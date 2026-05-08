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
 * lifecycle + stats sampler; provider factories (Mock / STOMP / REST)
 * are registered at module init in `runtime/providers/registry.ts`.
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

// eslint-disable-next-line no-console
console.info('[dataServices.sharedWorker] imports resolved');

try {
  installSharedWorkerHub();
  // eslint-disable-next-line no-console
  console.info('[dataServices.sharedWorker] booted; hub waiting for ports');
} catch (err) {
  // eslint-disable-next-line no-console
  console.error('[dataServices.sharedWorker] boot failed', err);
  throw err;
}
