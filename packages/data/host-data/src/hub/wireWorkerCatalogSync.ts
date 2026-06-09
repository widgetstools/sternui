import type { ConfigManager } from '@starui/host-config';
import type { SharedWorkerDataServicesClient } from '../runtime/client/SharedWorkerDataServicesClient.js';

/**
 * Keep the SharedWorker catalog cache aligned with IndexedDB writes.
 *
 * The worker preloads provider rows at startup; this wires every
 * `ConfigManager` save/delete (including Config Browser and cross-tab
 * writes via BroadcastChannel) to `client.invalidateConfig`, which
 * reloads the affected row from Dexie in the worker only.
 */
export function wireWorkerCatalogSync(
  configManager: ConfigManager,
  client: SharedWorkerDataServicesClient,
): () => void {
  return configManager.onConfigChanged((configId) => {
    void client.invalidateConfig(configId).catch((err) => {
      // eslint-disable-next-line no-console
      console.warn('[host-data] worker catalog invalidate failed', err);
    });
  });
}
