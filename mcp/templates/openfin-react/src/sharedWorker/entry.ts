/**
 * Local SharedWorker entry for this scaffolded app.
 *
 * Why this file lives in the app and not behind `createDataServicesClient()`:
 *
 * Vite's worker plugin only emits a worker chunk when it sees the
 * pattern as a SINGLE expression at the call site:
 *
 *     new SharedWorker(new URL('./entry.ts', import.meta.url), {...})
 *
 * The library's `createDataServicesClient()` uses a SPLIT pattern
 * (`const workerUrl = new URL(...); new SharedWorker(workerUrl, ...)`)
 * — Vite's static analyzer doesn't reliably bind those across
 * statements, so when the package is resolved from a tarball install
 * (no workspace alias to .ts source), the URL falls through to asset
 * handling and Vite inlines the .ts as a `data:video/mp2t` URL (the
 * `.ts` extension collides with MPEG-2 Transport Stream). Result:
 * "Failed to fetch a worker script" at runtime.
 *
 * Verbatim copy of the package's `defaultEntry.ts` body. To enable
 * ConfigService REST mode, edit the URL string in `../dataServices.mainThread.ts`
 * to include `?configServiceRestUrl=…` baked into the literal — Vite
 * preserves query strings on `new URL('./file.ts?…', import.meta.url)`
 * patterns — or migrate to a postMessage-based init handshake.
 */

import { installSharedWorkerHub } from "@starui/data-services/runtime/sharedWorker";
import { createConfigManager } from "@starui/config-service";

const CONFIG_SERVICE_REST_URL =
  new URLSearchParams(self.location.search).get("configServiceRestUrl") ||
  undefined;

async function boot(): Promise<void> {
  const configManager = createConfigManager({
    configServiceRestUrl: CONFIG_SERVICE_REST_URL,
  });
  await configManager.init();
  console.info(
    `[{{name}} worker] ConfigManager initialised (mode: ${
      configManager.isRestMode() ? "REST" : "local"
    })`,
  );
  await installSharedWorkerHub({ configManager });
  console.info("[{{name}} worker] booted; hub waiting for ports");
}

boot().catch((err) => {
  console.error("[{{name}} worker] boot failed", err);
  // Re-throw so the worker surfaces the error in DevTools — without
  // this, a Dexie open failure looks like a silently-stuck worker.
  throw err;
});
