/**
 * Default entry for `starui-config:{appId}` SharedWorker.
 */

import { createConfigManager } from '@starui/host-config';
import { installConfigCatalogHub } from './installConfigCatalogHub.js';
import {
  appIdFromConfigWorkerName,
  readWorkerBootstrapPayload,
} from '../../bootstrap/workerBootstrapPayload.js';

async function boot(): Promise<void> {
  const workerName = typeof self.name === 'string' ? self.name : '';
  const appName = appIdFromConfigWorkerName(workerName);
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
  // Full init — same rationale as data-services defaultEntry (seedIfEmpty
  // is a no-op when Dexie is already populated).
  await configManager.init();
  await installConfigCatalogHub({ configManager });
  // eslint-disable-next-line no-console
  console.info(
    `[@starui/host-data config-worker] ready (appId=${appId ?? '?'}, mode=${configManager.isRestMode() ? 'REST' : 'local'})`,
  );
}

boot().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[@starui/host-data config-worker] boot failed', err);
  throw err;
});
