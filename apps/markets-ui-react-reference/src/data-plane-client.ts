/**
 * data-plane-client.ts — owns the SharedWorker and the DataPlaneClient
 * that talks to it.
 *
 * Why this lives in the APP (and not via @marketsui/data-plane's
 * `connectSharedWorker`): Vite's worker plugin needs to see
 *   `new SharedWorker(new URL('./worker.ts', import.meta.url), { type: 'module' })`
 * as ONE literal expression at build time so it can emit a separate
 * worker chunk and rewrite the URL. When you instead build a `URL`
 * here and pass it to a `new SharedWorker(url)` call inside another
 * package, Vite has no way to trace the URL back to a worker source
 * file — it serves the .ts as a plain asset, the browser fails to
 * execute it, and every RPC times out with PROVIDER_NOT_CONFIGURED
 * never coming back.
 *
 * So the construction is colocated with the URL literal here, and
 * the rest of the app reads `dataPlaneClient` (and the matching
 * `<DataPlaneProvider client={...}>`) from this module.
 */

import { DataPlaneClient, buildSharedWorkerName } from '@marketsui/data-plane';

// ── Resolve the per-app worker name ───────────────────────────────
//
// The worker is keyed `sharedworker_<origin>_<appId>` (matches what
// `buildSharedWorkerName` does). We don't have the resolved appId at
// module-eval time (it comes from OpenFin customData async), so use
// the same fallback HostedComponent uses — `'TestApp'`. Multiple
// blotter views in the same app all attach to the same worker
// instance, which is the whole point of using a SharedWorker.
const APP_ID = 'TestApp';
const sharedWorkerName = buildSharedWorkerName(APP_ID);

// ── Construct the SharedWorker — Vite-visible literal ─────────────
//
// Both `new URL(...)` and `new SharedWorker(...)` appear together in
// this expression so Vite's worker plugin picks it up.
const worker = new SharedWorker(
  new URL('./dataPlaneWorker.ts', import.meta.url),
  { type: 'module', name: sharedWorkerName },
);

// `error` event surfaces script-load failures and uncaught throws on
// the worker side. Without this, a failing worker is invisible.
worker.addEventListener('error', (ev) => {
  // eslint-disable-next-line no-console
  console.error('[data-plane SharedWorker] error event', ev);
});

// Build the client. The constructor calls `port.start()` internally,
// so the channel is live as soon as the worker accepts the connect
// event.
export const dataPlaneClient = new DataPlaneClient(worker.port);
