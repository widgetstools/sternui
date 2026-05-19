/**
 * dataServices.mainThread.ts — bootstrap the per-app data-services
 * bundle for this app.
 *
 * Delegates to `createDataServicesClient` (in `@starui/host-data`)
 * which owns the SharedWorker construction + `bootstrapDataServices`
 * wrapping. The previous in-app worker file
 * (`dataServices.sharedWorker.ts`) and the manual `new SharedWorker(...)`
 * call site have moved into the package's default worker entry.
 *
 * Apps that need a bespoke worker (extra services, custom hub wiring)
 * should keep their own worker file and use the lower-level
 * `bootstrapDataServices(...)` API directly.
 *
 * Consumers import `dataServices` (the bundle) and pass it to
 * `<DataServicesProvider services={dataServices}>` /
 * `<HostedMarketsGrid dataServices={dataServices}>`.
 */

import { createDataServicesClient } from '@starui/host-data';
import { getConfigServiceRestUrlFromManifest } from '@starui/openfin-platform/config';
import { LOGGED_IN_USER_ID } from '@starui/types';

const APP_ID = 'TestApp';

// REST endpoint for the config service. Single source of truth: the
// OpenFin manifest's `customSettings.{useRest, configServiceRestUrl}`
// (resolved by `getConfigServiceRestUrlFromManifest()` to a URL or
// `undefined`). Same gate every other ConfigManager in the platform
// reads from — flipping `useRest` in the manifest flips ALL three
// ConfigManagers (Provider + main-thread bundle + SharedWorker hub)
// in lockstep. Out of OpenFin → `undefined` → local-only.
const CONFIG_SERVICE_REST_URL = await getConfigServiceRestUrlFromManifest();

export const dataServices = createDataServicesClient({
  appName: APP_ID,
  userId: LOGGED_IN_USER_ID,
  configServiceRestUrl: CONFIG_SERVICE_REST_URL,
});
