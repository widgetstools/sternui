import { bootstrapDataServicesWithWorkerAsset } from '@starui/host-data';
import workerAssetUrl from '@starui/host-data/assets/data-services-worker.mjs?url';
import { LOGGED_IN_USER_ID } from '@starui/types';

export const dataServices = bootstrapDataServicesWithWorkerAsset(workerAssetUrl, {
  appName: 'my-stomp-app',
  userId: LOGGED_IN_USER_ID,
});
