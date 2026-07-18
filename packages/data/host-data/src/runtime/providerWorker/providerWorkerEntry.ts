/**
 * Default entry for `starui-provider:{appId}:{providerId}` SharedWorker.
 */

import { createConfigManager } from '@wellsfargo-starui/host-config';
import { installProviderHub } from './installProviderHub.js';
import {
  parseProviderWorkerName,
  readWorkerBootstrapPayload,
} from '../../bootstrap/workerBootstrapPayload.js';

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
  await installProviderHub({
    providerId,
    configManager,
    deferLiveFanOut: true,
  });
  // eslint-disable-next-line no-console
  console.info(
    `[@wellsfargo-starui/host-data provider-worker] ready ` +
      `(appId=${appId}, providerId=${providerId}, mode=${configManager.isRestMode() ? 'REST' : 'local'})`,
  );
}

boot().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[@wellsfargo-starui/host-data provider-worker] boot failed', err);
  throw err;
});
