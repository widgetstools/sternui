/**
 * Spawn the AppData SharedWorker (`starui-appdata:{appId}`).
 */

import {
  writeWorkerBootstrapPayload,
  appDataSharedWorkerName,
  type WorkerBootstrapPayload,
} from '../../bootstrap/workerBootstrapPayload.js';

export interface CreateAppDataWorkerOpts {
  appId: string;
  userId: string;
  configServiceRestUrl?: string;
  seedConfigUrl?: string;
  seedConfigReload?: 'empty-only' | 'when-changed';
}

export const APPDATA_WORKER_ASSET = '@starui/host-data/assets/appdata-worker.mjs';

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

export function createAppDataWorker(
  workerScriptUrl: string,
  opts: CreateAppDataWorkerOpts,
): SharedWorker {
  const payload: WorkerBootstrapPayload = {
    appId: opts.appId,
    userId: opts.userId,
    seedConfigUrl: opts.seedConfigUrl,
    seedConfigReload: opts.seedConfigReload,
    configServiceRestUrl: opts.configServiceRestUrl,
  };
  writeWorkerBootstrapPayload(opts.appId, payload);

  const worker = new SharedWorker(resolveWorkerScriptUrl(workerScriptUrl), {
    type: 'module',
    name: appDataSharedWorkerName(opts.appId),
  });

  worker.addEventListener('error', (ev) => {
    // eslint-disable-next-line no-console
    console.error('[@starui/host-data] AppData SharedWorker error event', ev);
  });

  return worker;
}
