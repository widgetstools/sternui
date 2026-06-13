import type { PlatformBootstrapConfig } from './PlatformBootstrapConfig.js';
import { getWorkerConfigHubScriptUrl } from './configureWorkerConfigHub.js';
import { ensurePlatformReady } from './ensurePlatformReady.js';
import {
  isWorkerConfigManagerClient,
  type WorkerConfigManagerClient,
} from '../hub/WorkerConfigManagerClient.js';

/**
 * Connect the SharedWorker hub and return the UI-thread config facade.
 * Requires {@link configureWorkerConfigHub} at app entry.
 */
export async function resolveWorkerConfigManager(
  config: PlatformBootstrapConfig,
): Promise<WorkerConfigManagerClient> {
  const workerScriptUrl = getWorkerConfigHubScriptUrl();
  if (!workerScriptUrl) {
    throw new Error(
      '[host-data] configureWorkerConfigHub({ workerScriptUrl }) must be called before resolveWorkerConfigManager()',
    );
  }
  const bundle = await ensurePlatformReady(config, { workerScriptUrl });
  const cm = bundle.configManager;
  if (!isWorkerConfigManagerClient(cm)) {
    throw new Error('[host-data] hub bundle did not yield WorkerConfigManagerClient');
  }
  await cm.ready();
  return cm;
}
