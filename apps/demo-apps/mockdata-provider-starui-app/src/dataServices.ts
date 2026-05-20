import { bootstrapDataServicesWithWorkerAsset } from '@starui/host-data';
import workerAssetUrl from '@starui/host-data/assets/data-services-worker.mjs?url';
import { LOGGED_IN_USER_ID } from '@starui/types';

type Bundle = ReturnType<typeof bootstrapDataServicesWithWorkerAsset>;

let bundle: Bundle | null = null;
let bootstrapError: Error | null = null;

try {
  bundle = bootstrapDataServicesWithWorkerAsset(workerAssetUrl, {
    appName: 'mockdata-provider-starui-app',
    userId: LOGGED_IN_USER_ID,
  });
} catch (err) {
  bootstrapError = err instanceof Error ? err : new Error(String(err));
}

export const dataServices: Bundle | null = bundle;
export const dataServicesBootstrapError: Error | null = bootstrapError;
