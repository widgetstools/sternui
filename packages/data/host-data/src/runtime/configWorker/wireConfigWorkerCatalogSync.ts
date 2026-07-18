/**
 * Keep the Config SharedWorker catalog aligned with main-thread
 * ConfigManager writes (ADR Phase 2).
 *
 * Complements {@link wireWorkerCatalogSync} (data hub). P1 apps that
 * never open the data hub still invalidate `starui-config:{appId}`.
 */

import type { ConfigManager } from '@wellsfargo-starui/host-config';
import { isCatalogConfigRow } from '../../hub/isCatalogConfigRow.js';
import type { ConfigClient } from './ConfigClient.js';

export function wireConfigWorkerCatalogSync(
  configManager: ConfigManager,
  client: ConfigClient,
): () => void {
  return configManager.onConfigChanged((configId) => {
    void (async () => {
      const row = await configManager.getConfig(configId);
      if (!row || !isCatalogConfigRow(row)) return;
      await client.invalidate(configId);
    })().catch((err) => {
      // eslint-disable-next-line no-console
      console.warn('[host-data] config-worker catalog invalidate failed', err);
    });
  });
}
