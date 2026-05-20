// Local SharedWorker entry — same workaround as mockdata-provider-starui-app.
// See that app's sharedWorker/entry.ts for the full explanation of why the
// library's createDataServicesClient shortcut breaks for tarball consumers
// (literal '.ts' worker URL resolves to a missing file in published dist).

import { installSharedWorkerHub } from '@starui/host-data/runtime/sharedWorker';
import { createConfigManager } from '@starui/host-config';

async function boot(): Promise<void> {
  const configManager = createConfigManager({});
  await configManager.init();
  // eslint-disable-next-line no-console
  console.info('[dpe-demo worker] ConfigManager initialised (local)');
  await installSharedWorkerHub({ configManager });
  // eslint-disable-next-line no-console
  console.info('[dpe-demo worker] booted; hub waiting for ports');
}

boot().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[dpe-demo worker] boot failed', err);
  throw err;
});
