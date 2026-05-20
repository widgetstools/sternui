import { createConfigManager, type ConfigManager } from '@starui/host-config';
import { bootstrapDataServices, type DataServices } from './bootstrap.js';
import {
  createDataServicesWorker,
  type CreateDataServicesWorkerOpts,
} from './createDataServicesWorker.js';

export interface BootstrapDataServicesWithWorkerAssetOpts
  extends CreateDataServicesWorkerOpts {
  userId: string;
  mainThreadConfigManager?: ConfigManager;
}

/**
 * One-call bootstrap when the app supplies the bundled worker URL from
 * Vite's `?url` import. Keeps `new SharedWorker(...)` out of library
 * code while avoiding a hand-written app-local worker entry file.
 */
export function bootstrapDataServicesWithWorkerAsset(
  workerScriptUrl: string,
  opts: BootstrapDataServicesWithWorkerAssetOpts,
): DataServices {
  const worker = createDataServicesWorker(workerScriptUrl, opts);

  const configManager =
    opts.mainThreadConfigManager ??
    createConfigManager({ configServiceRestUrl: opts.configServiceRestUrl });

  return bootstrapDataServices({
    appName: opts.appName,
    worker,
    configManager,
    userId: opts.userId,
  });
}
