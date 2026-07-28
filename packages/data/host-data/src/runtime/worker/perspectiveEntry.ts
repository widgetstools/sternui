/**
 * SharedWorker entry for apps on the Perspective pull path.
 *
 * Identical to the default entry plus one hub option: the Perspective loader
 * that `stomp-perspective` providers build their Table on. Shipped prebuilt as
 * `assets/data-services-perspective-worker.mjs`, so an app switches paths by
 * changing ONE import — no worker file of its own:
 *
 *     import workerAssetUrl from '@starui/host-data/assets/data-services-perspective-worker.mjs?url';
 *     await ensurePlatformReady(config, { workerScriptUrl: workerAssetUrl });
 *
 * It is a SEPARATE asset rather than a flag on the default one because the
 * inline Perspective build embeds its wasm as base64: bundling it into the
 * entry every app loads would cost megabytes to workers that never open a
 * blotter. Everything else — ConfigManager, catalog and AppData hydration,
 * every provider type — behaves exactly as in the default entry, so an app can
 * move between them without changing anything else.
 */

import { bootWorkerEntry, reportBootFailure } from './bootWorkerEntry.js';

const LABEL = '@starui/host-data perspective worker';

bootWorkerEntry({
  label: LABEL,
  hub: {
    // Dynamic so the engine is fetched by this worker only, and only when a
    // provider actually needs a Table.
    loadPerspective: () => import('@perspective-dev/client/inline'),
  },
}).catch((err) => reportBootFailure(LABEL, err));
