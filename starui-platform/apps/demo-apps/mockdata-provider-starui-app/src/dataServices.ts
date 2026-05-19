import { bootstrapDataServices } from '@starui/host-data';
import { createConfigManager } from '@starui/host-config';
import { LOGGED_IN_USER_ID } from '@starui/types';

type Bundle = ReturnType<typeof bootstrapDataServices>;

let bundle: Bundle | null = null;
let bootstrapError: Error | null = null;

try {
  // SharedWorker is constructed here (at the call site) so Vite's
  // worker plugin can statically analyse `new SharedWorker(new URL(...))`
  // and emit a worker chunk pointing at the local TS entry. We avoid
  // `createDataServicesClient` from the library because its URL is
  // relative to the library's own source — which works under a
  // workspace alias but not from a tarball install (the published
  // dist ships only .js, so the literal '.ts' path 404s).
  const worker = new SharedWorker(
    new URL('./sharedWorker/entry.ts', import.meta.url),
    { type: 'module', name: 'mkt-data-services:mockdata-provider-starui-app' },
  );
  worker.addEventListener('error', (ev) => {
    // eslint-disable-next-line no-console
    console.error('[dataServices] SharedWorker error event', ev);
  });

  const configManager = createConfigManager({});
  bundle = bootstrapDataServices({
    appName: 'mockdata-provider-starui-app',
    worker,
    configManager,
    userId: LOGGED_IN_USER_ID,
  });
} catch (err) {
  bootstrapError = err instanceof Error ? err : new Error(String(err));
}

export const dataServices: Bundle | null = bundle;
export const dataServicesBootstrapError: Error | null = bootstrapError;
