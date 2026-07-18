/**
 * Spawn one provider SharedWorker (`starui-provider:{appId}:{providerId}`).
 */

import {
  writeWorkerBootstrapPayload,
  providerSharedWorkerName,
  type WorkerBootstrapPayload,
} from '../../bootstrap/workerBootstrapPayload.js';

export interface CreateProviderWorkerOpts {
  appId: string;
  providerId: string;
  userId: string;
  configServiceRestUrl?: string;
  seedConfigUrl?: string;
  seedConfigReload?: 'empty-only' | 'when-changed';
}

export const PROVIDER_WORKER_ASSET = '@wellsfargo-starui/host-data/assets/provider-worker.mjs';

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

export function createProviderWorker(
  workerScriptUrl: string,
  opts: CreateProviderWorkerOpts,
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
    name: providerSharedWorkerName(opts.appId, opts.providerId),
  });

  worker.addEventListener('error', (ev) => {
    // eslint-disable-next-line no-console
    console.error(
      `[@wellsfargo-starui/host-data] Provider SharedWorker error (providerId=${opts.providerId})`,
      ev,
    );
  });

  return worker;
}
