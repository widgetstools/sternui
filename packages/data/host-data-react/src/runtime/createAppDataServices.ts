import {
  bootstrapDataServicesWithWorkerAsset,
  type DataServices,
} from '@starui/host-data/runtime';
import { LOGGED_IN_USER_ID } from '@starui/types';

export interface CreateAppDataServicesOpts {
  appName: string;
  userId?: string;
  /**
   * Resolved URL of `@starui/host-data/assets/data-services-worker.mjs`
   * from a Vite `?url` import at the app call site.
   */
  workerScriptUrl: string;
  /** Static REST URL — forwarded to the SharedWorker via scriptURL query param. */
  configServiceRestUrl?: string;
  /** Async resolver (e.g. OpenFin manifest read on the main thread). */
  resolveConfigServiceRestUrl?: () => Promise<string | undefined>;
}

/**
 * One-call app bootstrap for the data-services SharedWorker bundle.
 * Uses the library's esbuild-bundled worker asset — no app-local
 * `sharedWorker/entry.ts` required.
 */
export async function createAppDataServices(
  opts: CreateAppDataServicesOpts,
): Promise<DataServices> {
  const configServiceRestUrl =
    opts.configServiceRestUrl ??
    (opts.resolveConfigServiceRestUrl
      ? await opts.resolveConfigServiceRestUrl()
      : undefined);

  return bootstrapDataServicesWithWorkerAsset(opts.workerScriptUrl, {
    appName: opts.appName,
    userId: opts.userId ?? LOGGED_IN_USER_ID,
    configServiceRestUrl,
  });
}
