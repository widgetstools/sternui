/**
 * Default entry for `starui-provider:{appId}:{providerId}` SharedWorker.
 *
 * ADR Phase 4d: when bootstrap payload includes `appDataWorkerScriptUrl`,
 * connect `starui-appdata` and prefetch `{{…}}` into a sync lookup cache
 * before the transport starts.
 */

import { createConfigManager } from '@wellsfargo-starui/host-config';
import { installProviderHub } from './installProviderHub.js';
import {
  parseProviderWorkerName,
  readWorkerBootstrapPayload,
} from '../../bootstrap/workerBootstrapPayload.js';
import { AppDataClient } from '../appDataWorker/AppDataClient.js';
import { createAppDataWorker } from '../appDataWorker/createAppDataWorker.js';
import { ProviderAppDataLookupCache } from './providerAppDataLookupCache.js';

async function connectAppDataClient(opts: {
  appId: string;
  userId: string;
  workerScriptUrl: string;
  configServiceRestUrl?: string;
  seedConfigUrl?: string;
  seedConfigReload?: 'empty-only' | 'when-changed';
}): Promise<AppDataClient> {
  const worker = createAppDataWorker(opts.workerScriptUrl, {
    appId: opts.appId,
    userId: opts.userId,
    configServiceRestUrl: opts.configServiceRestUrl,
    seedConfigUrl: opts.seedConfigUrl,
    seedConfigReload: opts.seedConfigReload,
  });
  const client = new AppDataClient(worker.port);
  await client.ready;
  return client;
}

async function boot(): Promise<void> {
  const workerName = typeof self.name === 'string' ? self.name : '';
  const parsed = parseProviderWorkerName(workerName);
  if (!parsed) {
    throw new Error(
      `[@wellsfargo-starui/host-data provider-worker] invalid SharedWorker name '${workerName}' ` +
        `(expected starui-provider:{appId}:{providerId})`,
    );
  }

  const { appId, providerId } = parsed;
  const payload = readWorkerBootstrapPayload(appId);
  const userId = payload?.userId ?? 'worker';

  const configManager = createConfigManager({
    configServiceRestUrl: payload?.configServiceRestUrl,
    appId: payload?.appId ?? appId,
    identity: payload?.userId
      ? { userId: payload.userId, displayName: payload.userId }
      : undefined,
    seedConfigUrl: payload?.seedConfigUrl,
    seedConfigReload: payload?.seedConfigReload,
  });
  await configManager.init();

  const templateCache = new ProviderAppDataLookupCache();
  let appDataClient: AppDataClient | null = null;
  if (payload?.appDataWorkerScriptUrl) {
    try {
      appDataClient = await connectAppDataClient({
        appId: payload.appId ?? appId,
        userId,
        workerScriptUrl: payload.appDataWorkerScriptUrl,
        configServiceRestUrl: payload.configServiceRestUrl,
        seedConfigUrl: payload.seedConfigUrl,
        seedConfigReload: payload.seedConfigReload,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        '[@wellsfargo-starui/host-data provider-worker] AppData SW connect failed; using in-process AppData',
        err,
      );
    }
  }

  await installProviderHub({
    providerId,
    configManager,
    deferLiveFanOut: true,
    appDataLookup: appDataClient ? templateCache.lookup : undefined,
    templateCache: appDataClient ? templateCache : undefined,
    templateLookupAsync: appDataClient
      ? (name, key) => appDataClient!.lookup(name, key)
      : undefined,
  });

  // eslint-disable-next-line no-console
  console.info(
    `[@wellsfargo-starui/host-data provider-worker] ready ` +
      `(appId=${appId}, providerId=${providerId}, mode=${configManager.isRestMode() ? 'REST' : 'local'}` +
      `, appDataBridge=${Boolean(appDataClient)})`,
  );
}

boot().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[@wellsfargo-starui/host-data provider-worker] boot failed', err);
  throw err;
});
