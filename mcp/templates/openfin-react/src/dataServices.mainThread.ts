/**
 * dataServices.mainThread.ts — bootstrap the per-app data-services bundle.
 *
 * Constructs the SharedWorker INLINE here (URL + options as a single
 * expression) so Vite's worker plugin can statically analyse
 * `new SharedWorker(new URL(...))` and emit a worker chunk. We
 * deliberately avoid `createDataServicesClient()` from the library
 * because its split pattern (intermediate variable) defeats Vite's
 * static analyzer when the package is consumed from a tarball install,
 * resulting in the worker being inlined as a `data:video/mp2t` URL
 * with the wrong MIME type. See `./sharedWorker/entry.ts` for the
 * long-form explanation.
 *
 * Consumers import `dataServices` and pass it to
 * `<DataServicesProvider services={dataServices}>` /
 * `<HostedMarketsGrid dataServices={dataServices}>`.
 *
 * Enabling ConfigService REST mode: the main-thread ConfigManager
 * picks up the REST URL automatically from the manifest. The worker
 * defaults to local-only because the inline-URL pattern doesn't
 * accept dynamic query strings without confusing Vite. To flip the
 * worker to REST mode, replace the URL literal below with
 *   new URL("./sharedWorker/entry.ts?configServiceRestUrl=https://your-api", import.meta.url)
 * — the query string IS preserved when baked into the literal.
 */

import { bootstrapDataServices, type DataServices } from "@starui/data-services";
import { createConfigManager } from "@starui/config-service";
import { getConfigServiceRestUrlFromManifest } from "@starui/openfin-platform/config";
import { LOGGED_IN_USER_ID } from "@starui/runtime-port";

const APP_ID = "{{name}}";

// Single source of truth for the main-thread ConfigManager: the OpenFin
// manifest's `customSettings.{useRest, configServiceRestUrl}` pair.
// Out of OpenFin → `undefined` → local-only.
const CONFIG_SERVICE_REST_URL = await getConfigServiceRestUrlFromManifest();

// INLINE form is required — see header comment. Vite's worker plugin
// matches the literal new-URL-inside-new-SharedWorker pattern at the
// call site and emits a worker chunk with the correct MIME type.
const worker = new SharedWorker(
  new URL("./sharedWorker/entry.ts", import.meta.url),
  { type: "module", name: `mkt-data-services:${APP_ID}` },
);

worker.addEventListener("error", (ev) => {
  console.error("[{{name}}] SharedWorker error event", ev);
});

const configManager = createConfigManager({
  configServiceRestUrl: CONFIG_SERVICE_REST_URL,
});

export const dataServices: DataServices = bootstrapDataServices({
  appName: APP_ID,
  worker,
  configManager,
  userId: LOGGED_IN_USER_ID,
});

// @starui:add-provider-here
// Provider configs added by `add_dataprovider` register themselves here
// at boot. Use the in-app DataProvider editor to create live provider
// instances, or call `dataServices.registerProvider({...})` directly.
