/**
 * Spawn the Config SharedWorker (`starui-config:{appId}`).
 */

import {
  writeWorkerBootstrapPayload,
  configSharedWorkerName,
  type WorkerBootstrapPayload,
} from '../../bootstrap/workerBootstrapPayload.js';

export interface CreateConfigWorkerOpts {
  appId: string;
  userId: string;
  configServiceRestUrl?: string;
  seedConfigUrl?: string;
  seedConfigReload?: 'empty-only' | 'when-changed';
}

export const CONFIG_WORKER_ASSET = '@starui/host-data/assets/config-catalog-worker.mjs';

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

export function createConfigWorker(
  workerScriptUrl: string,
  opts: CreateConfigWorkerOpts,
): SharedWorker {
  const payload: WorkerBootstrapPayload = {
    appId: opts.appId,
    userId: opts.userId,
    seedConfigUrl: opts.seedConfigUrl,
    seedConfigReload: opts.seedConfigReload,
    configServiceRestUrl: opts.configServiceRestUrl,
  };
  // Reuse the same bootstrap key as the data hub so both workers share
  // deployment identity without a second localStorage write schema.
  writeWorkerBootstrapPayload(opts.appId, payload);

  const worker = new SharedWorker(resolveWorkerScriptUrl(workerScriptUrl), {
    type: 'module',
    name: configSharedWorkerName(opts.appId),
  });

  worker.addEventListener('error', (ev) => {
    // eslint-disable-next-line no-console
    console.error('[@starui/host-data] Config SharedWorker error event', ev);
  });

  return worker;
}
