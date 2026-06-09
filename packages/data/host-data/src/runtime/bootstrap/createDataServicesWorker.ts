/**
 * Construct a SharedWorker from the pre-built library asset URL.
 *
 * Vite apps import the bundled script at the app call site:
 *
 *     import workerAssetUrl from '@starui/host-data/assets/data-services-worker.mjs?url';
 *     const worker = createDataServicesWorker(workerAssetUrl, { appName, ... });
 *
 * The `?url` import must live in app code so Vite copies/serves the
 * asset. Bootstrap fields (appId, seed URL, …) are written to
 * localStorage — not query params — because Vite's dev `@fs/` handler
 * breaks when extra search params are appended to the worker script URL.
 */

import {
  writeWorkerBootstrapPayload,
  type WorkerBootstrapPayload,
} from '../../bootstrap/workerBootstrapPayload.js';

export interface CreateDataServicesWorkerOpts {
  /** Idempotency key — also used as SharedWorker `name` suffix. */
  appName: string;
  /**
   * ConfigService REST URL — stored in the worker bootstrap payload
   * (read by `defaultEntry` on hub boot).
   */
  configServiceRestUrl?: string;
  /** Deployment app id — worker ConfigManager uses this for scoped rows. */
  appId?: string;
  /** Signed-in user id — worker ConfigManager identity. */
  userId?: string;
  /**
   * Seed bundle URL — worker runs `seedIfEmpty` at hub boot so the first
   * connecting window does not block on a duplicate main-thread seed.
   */
  seedConfigUrl?: string;
  seedConfigReload?: 'empty-only' | 'when-changed';
}

/** Package export path for the bundled worker (after `npm run build`). */
export const DATA_SERVICES_WORKER_ASSET =
  '@starui/host-data/assets/data-services-worker.mjs';

function resolveWorkerScriptUrl(scriptUrl: string): string {
  try {
    return new URL(scriptUrl).href;
  } catch {
    const base =
      typeof globalThis.location === 'object' && globalThis.location?.href
        ? globalThis.location.href
        : 'http://localhost/';
    return new URL(scriptUrl, base).href;
  }
}

function persistWorkerBootstrap(opts: CreateDataServicesWorkerOpts): void {
  const appId = opts.appId ?? opts.appName;
  const userId = opts.userId;
  if (!userId) return;

  const payload: WorkerBootstrapPayload = {
    appId,
    userId,
    seedConfigUrl: opts.seedConfigUrl,
    seedConfigReload: opts.seedConfigReload,
    configServiceRestUrl: opts.configServiceRestUrl,
  };
  writeWorkerBootstrapPayload(opts.appName, payload);
}

export function createDataServicesWorker(
  workerScriptUrl: string,
  opts: CreateDataServicesWorkerOpts,
): SharedWorker {
  persistWorkerBootstrap(opts);

  const worker = new SharedWorker(resolveWorkerScriptUrl(workerScriptUrl), {
    type: 'module',
    name: `mkt-data-services:${opts.appName}`,
  });

  worker.addEventListener('error', (ev) => {
    // eslint-disable-next-line no-console
    console.error('[@starui/host-data] SharedWorker error event', ev);
  });

  return worker;
}
