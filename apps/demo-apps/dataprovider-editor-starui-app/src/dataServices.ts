import { bootstrapDataServices } from '@starui/data-services';
import { createConfigManager } from '@starui/config-service';
import { LOGGED_IN_USER_ID } from '@starui/runtime-port';

type Bundle = ReturnType<typeof bootstrapDataServices>;

let bundle: Bundle | null = null;
let bootstrapError: Error | null = null;

try {
  const worker = new SharedWorker(
    new URL('./sharedWorker/entry.ts', import.meta.url),
    { type: 'module', name: 'mkt-data-services:dataprovider-editor-starui-app' },
  );
  worker.addEventListener('error', (ev) => {
    // eslint-disable-next-line no-console
    console.error('[dataServices] SharedWorker error event', ev);
  });

  const configManager = createConfigManager({});
  bundle = bootstrapDataServices({
    appName: 'dataprovider-editor-starui-app',
    worker,
    configManager,
    userId: LOGGED_IN_USER_ID,
  });
} catch (err) {
  bootstrapError = err instanceof Error ? err : new Error(String(err));
}

export const dataServices: Bundle | null = bundle;
export const dataServicesBootstrapError: Error | null = bootstrapError;
