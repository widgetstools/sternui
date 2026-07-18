/**
 * Default entry for `starui-appdata:{appId}` SharedWorker.
 */

import { createConfigManager } from '@wellsfargo-starui/host-config';
import { installAppDataHub } from './installAppDataHub.js';
import {
  appIdFromAppDataWorkerName,
  readWorkerBootstrapPayload,
} from '../../bootstrap/workerBootstrapPayload.js';

async function boot(): Promise<void> {
  const workerName = typeof self.name === 'string' ? self.name : '';
  const appName = appIdFromAppDataWorkerName(workerName);
  const payload = appName ? readWorkerBootstrapPayload(appName) : null;

  const appId = payload?.appId ?? appName ?? undefined;
  const userId = payload?.userId;

  const configManager = createConfigManager({
    configServiceRestUrl: payload?.configServiceRestUrl,
    appId,
    identity: userId ? { userId, displayName: userId } : undefined,
    seedConfigUrl: payload?.seedConfigUrl,
    seedConfigReload: payload?.seedConfigReload,
  });
  await configManager.init();
  await installAppDataHub({ configManager });
  // eslint-disable-next-line no-console
  console.info(
    `[@wellsfargo-starui/host-data appdata-worker] ready (appId=${appId ?? '?'}, mode=${configManager.isRestMode() ? 'REST' : 'local'})`,
  );
}

boot().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[@wellsfargo-starui/host-data appdata-worker] boot failed', err);
  throw err;
});
