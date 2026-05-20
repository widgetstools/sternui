import {
  createDataServicesClient,
  type DataServices,
} from '@starui/host-data/runtime';
import { LOGGED_IN_USER_ID } from '@starui/types';

export interface CreateAppDataServicesOpts {
  appName: string;
  userId?: string;
  /** Static REST URL — forwarded to the SharedWorker via scriptURL query param. */
  configServiceRestUrl?: string;
  /** Async resolver (e.g. OpenFin manifest read on the main thread). */
  resolveConfigServiceRestUrl?: () => Promise<string | undefined>;
}

/**
 * One-call app bootstrap for the data-services SharedWorker bundle.
 * Wraps `createDataServicesClient` so apps never ship a local worker entry.
 */
export async function createAppDataServices(
  opts: CreateAppDataServicesOpts,
): Promise<DataServices> {
  const configServiceRestUrl =
    opts.configServiceRestUrl ??
    (opts.resolveConfigServiceRestUrl
      ? await opts.resolveConfigServiceRestUrl()
      : undefined);

  return createDataServicesClient({
    appName: opts.appName,
    userId: opts.userId ?? LOGGED_IN_USER_ID,
    configServiceRestUrl,
  });
}
