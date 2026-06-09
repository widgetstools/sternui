import { SharedWorkerDataServicesClient } from '../runtime/client/SharedWorkerDataServicesClient.js';
import { createDataServicesWorker } from '../runtime/bootstrap/createDataServicesWorker.js';
import type { CreateDataServicesWorkerOpts } from '../runtime/bootstrap/createDataServicesWorker.js';

export interface ProbeWorkerHubOpts extends CreateDataServicesWorkerOpts {
  workerScriptUrl: string;
}

/**
 * Check whether the SharedWorker hub already hydrated its catalog.
 * Opens a short-lived MessagePort — does not block on `catalog-ready`.
 */
export async function probeWorkerHubReady(opts: ProbeWorkerHubOpts): Promise<boolean> {
  const worker = createDataServicesWorker(opts.workerScriptUrl, {
    appName: opts.appName ?? opts.appId,
    configServiceRestUrl: opts.configServiceRestUrl,
    appId: opts.appId,
    userId: opts.userId,
    seedConfigUrl: opts.seedConfigUrl,
    seedConfigReload: opts.seedConfigReload,
  });
  const client = new SharedWorkerDataServicesClient(worker.port);
  try {
    return await client.isCatalogReady();
  } catch {
    return false;
  } finally {
    client.close();
  }
}
