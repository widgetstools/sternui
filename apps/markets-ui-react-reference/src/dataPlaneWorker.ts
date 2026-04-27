/**
 * dataPlaneWorker.ts — SharedWorker entry for this app's data plane.
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
 * The Router uses the default factory which covers Mock + AppData +
 * STOMP + REST.
 *
 * Top-level logs let you confirm the worker is alive: open
 * chrome://inspect → Shared Workers → click "inspect" next to
 * `mkt-data-plane:<appId>`. If you DON'T see "[dataPlaneWorker]
 * booted" there, the worker script either failed to load or threw
 * before installWorker ran — that's the source of the
 * "subscribe-stream hangs forever" symptom.
 */

// eslint-disable-next-line no-console
console.info('[dataPlaneWorker] script loaded');

import { Router, installWorker } from '@marketsui/data-plane/worker';

// eslint-disable-next-line no-console
console.info('[dataPlaneWorker] imports resolved');

try {
  const router = new Router();
  installWorker({ router });
  // eslint-disable-next-line no-console
  console.info('[dataPlaneWorker] booted; router waiting for ports');
} catch (err) {
  // eslint-disable-next-line no-console
  console.error('[dataPlaneWorker] boot failed', err);
  throw err;
}
