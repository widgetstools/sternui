/**
 * Construct a SharedWorker from the pre-built library asset URL.
 *
 * Vite apps import the bundled script at the app call site:
 *
 *     import workerAssetUrl from '@starui/host-data/assets/data-services-worker.mjs?url';
 *     const worker = createDataServicesWorker(workerAssetUrl, { appName, configServiceRestUrl });
 *
 * The `?url` import must live in app code so Vite copies/serves the
 * asset. This helper only stamps query params and names the worker.
 */

export interface CreateDataServicesWorkerOpts {
  /** Idempotency key — also used as SharedWorker `name` suffix. */
  appName: string;
  /**
   * ConfigService REST URL forwarded to the worker via
   * `?configServiceRestUrl=…` on the script URL.
   */
  configServiceRestUrl?: string;
}

/** Package export path for the bundled worker (after `npm run build`). */
export const DATA_SERVICES_WORKER_ASSET =
  '@starui/host-data/assets/data-services-worker.mjs';

function resolveWorkerScriptUrl(scriptUrl: string): URL {
  try {
    return new URL(scriptUrl);
  } catch {
    const base =
      typeof globalThis.location === 'object' && globalThis.location?.href
        ? globalThis.location.href
        : 'http://localhost/';
    return new URL(scriptUrl, base);
  }
}

export function createDataServicesWorker(
  workerScriptUrl: string,
  opts: CreateDataServicesWorkerOpts,
): SharedWorker {
  const workerUrl = resolveWorkerScriptUrl(workerScriptUrl);
  if (opts.configServiceRestUrl) {
    workerUrl.searchParams.set(
      'configServiceRestUrl',
      opts.configServiceRestUrl,
    );
  }

  const worker = new SharedWorker(workerUrl, {
    type: 'module',
    name: `mkt-data-services:${opts.appName}`,
  });

  worker.addEventListener('error', (ev) => {
    // eslint-disable-next-line no-console
    console.error('[@starui/host-data] SharedWorker error event', ev);
  });

  return worker;
}
