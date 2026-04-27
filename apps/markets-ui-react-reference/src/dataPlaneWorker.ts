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
 * STOMP + REST. Wrapping with a custom factory (e.g. to inject auth
 * middleware) happens here, not in app code.
 */

import { Router, installWorker } from '@marketsui/data-plane/worker';

const router = new Router();

installWorker({ router });
