/**
 * dataPlaneWorker.ts — SharedWorker entry for this app's v2 data plane.
 *
 * The provider window and every blotter view share one socket-set per
 * configured provider via this SharedWorker. Vite resolves the asset
 * URL at build time when the main thread does:
 *
 *     new SharedWorker(
 *       new URL('./dataPlaneWorker.ts', import.meta.url),
 *       { name: '...' },
 *     )
 *
 * `installWorker` from `@marketsui/data-plane/v2/worker` wires the
 * SharedWorker's `onconnect` to the new Hub. The Hub owns the cache
 * + provider lifecycle + stats sampler; provider factories
 * (Mock / STOMP / REST) are registered at module init in v2's
 * `providers/registry.ts`.
 *
 * Top-level logs let you confirm the worker is alive: open
 * chrome://inspect → Shared Workers → click "inspect" next to
 * `mkt-data-plane-v2:<appId>`. If you DON'T see "[dataPlaneWorker]
 * booted" there, the worker script failed to load or threw before
 * installWorker ran — the source of "subscribe never resolves"
 * symptoms.
 */

// eslint-disable-next-line no-console
console.info('[dataPlaneWorker] script loaded');

import { installWorker } from '@marketsui/data-plane/v2/worker';

// eslint-disable-next-line no-console
console.info('[dataPlaneWorker] imports resolved');

try {
  installWorker();
  // eslint-disable-next-line no-console
  console.info('[dataPlaneWorker] booted; hub waiting for ports');
} catch (err) {
  // eslint-disable-next-line no-console
  console.error('[dataPlaneWorker] boot failed', err);
  throw err;
}
