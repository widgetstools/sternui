// Local SharedWorker entry for the mockdata-provider demo.
//
// Why this file lives in the app (and not behind `createDataServicesClient`):
// Vite's worker plugin needs to see a literal `new SharedWorker(new URL('./entry.ts', import.meta.url))`
// at the call site so it can statically emit a worker chunk and rewrite
// the URL. The library's `createDataServicesClient` shortcut points at
// `'../worker/defaultEntry.ts'` relative to its own source — that works
// when the package is resolved through a workspace alias (source path),
// but the published tarball ships only the compiled JS, so the `.ts`
// URL 404s and the SharedWorker silently never starts.
//
// The package documents this escape hatch in `defaultEntry.ts`:
//
//   > Apps that need bespoke worker setup ... should keep their own
//   > worker file and call `installSharedWorkerHub({...})` directly,
//   > then pass the worker to `bootstrapDataServices({ worker, ... })`.
//
// Verbatim copy of the package's `defaultEntry.ts` body, minus the
// REST URL plumbing (this demo is local-only).

import { installSharedWorkerHub } from '@starui/data-services/runtime/sharedWorker';
import { createConfigManager } from '@starui/config-service';

async function boot(): Promise<void> {
  const configManager = createConfigManager({});
  await configManager.init();
  // eslint-disable-next-line no-console
  console.info('[mockdata-demo worker] ConfigManager initialised (local)');
  await installSharedWorkerHub({ configManager });
  // eslint-disable-next-line no-console
  console.info('[mockdata-demo worker] booted; hub waiting for ports');
}

boot().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[mockdata-demo worker] boot failed', err);
  throw err;
});
