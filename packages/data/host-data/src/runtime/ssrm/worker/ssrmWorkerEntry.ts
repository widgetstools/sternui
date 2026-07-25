/**
 * SSRM provider SharedWorker entry — bundled by `scripts/buildWorker.mjs`
 * into `dist/assets/data-services-ssrm-worker.mjs` with the two
 * Perspective wasm binaries copied alongside as siblings.
 *
 * Spawn per dataset with a stable name (`starui-ssrm:{appId}:{providerId}`)
 * so every window of the app shares the one worker — and the one book:
 *
 *   new SharedWorker(workerAssetUrl, {
 *     name: `starui-ssrm:${appId}:${providerId}`,
 *     type: 'module',
 *   })
 */

import { installSsrmWorker } from './installSsrmWorker.js';

const handle = installSsrmWorker();

handle.ready
  .then(() => {
    // eslint-disable-next-line no-console
    console.info(
      `[@starui/host-data ssrm worker] perspective server booted; waiting for ports (name: ${String(
        (self as unknown as { name?: string }).name ?? '',
      )})`,
    );
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[@starui/host-data ssrm worker] boot failed', err);
  });
