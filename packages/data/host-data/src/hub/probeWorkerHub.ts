import { SharedWorkerDataServicesClient } from '../runtime/client/SharedWorkerDataServicesClient.js';
import { createDataServicesWorker } from '../runtime/bootstrap/createDataServicesWorker.js';

export interface ProbeWorkerHubOpts {
  workerScriptUrl: string;
  appId: string;
  configServiceRestUrl?: string;
}

/**
 * Check whether the SharedWorker hub already hydrated its catalog.
 * Opens a short-lived MessagePort — does not block on `catalog-ready`.
 */
export async function probeWorkerHubReady(opts: ProbeWorkerHubOpts): Promise<boolean> {
  const worker = createDataServicesWorker(opts.workerScriptUrl, {
    appName: opts.appId,
    configServiceRestUrl: opts.configServiceRestUrl,
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
