/**
 * App-local SharedWorker entry for markets-ui-react-reference.
 *
 * Vite's worker plugin requires a literal
 *   `new SharedWorker(new URL('./sharedWorker/entry.ts', import.meta.url))`
 * at the app call site (`dataServices.mainThread.ts`). The library's
 * `createDataServicesClient()` constructs the worker URL relative to its
 * own module; once that code is prebundled into `.vite/deps/`, the URL
 * no longer resolves and the browser reports "Failed to fetch a worker script".
 *
 * Body matches `@starui/host-data` `defaultEntry.ts` — REST URL arrives
 * via `?configServiceRestUrl=…` on the worker scriptURL (stamped by the
 * main thread from the OpenFin manifest).
 */

import { installSharedWorkerHub } from '@starui/host-data/runtime/sharedWorker';
import { createConfigManager } from '@starui/host-config';

const CONFIG_SERVICE_REST_URL =
  new URLSearchParams(self.location.search).get('configServiceRestUrl') ||
  undefined;

async function boot(): Promise<void> {
  const configManager = createConfigManager({
    configServiceRestUrl: CONFIG_SERVICE_REST_URL,
  });
  // Register onconnect (via installSharedWorkerHub) BEFORE any await so
  // the main thread's `new SharedWorker(...)` connect event is not lost.
  const installed = installSharedWorkerHub({ configManager });
  await configManager.init();
  await installed;
  // eslint-disable-next-line no-console
  console.info(
    `[@starui/host-data worker] ConfigManager initialised (mode: ${configManager.isRestMode() ? 'REST' : 'local'})`,
  );
  // eslint-disable-next-line no-console
  console.info('[@starui/host-data worker] booted; hub waiting for ports');
}

boot().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[@starui/host-data worker] boot failed', err);
  throw err;
});
