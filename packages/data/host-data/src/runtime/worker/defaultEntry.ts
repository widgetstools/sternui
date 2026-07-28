/**
 * Default SharedWorker entry for `@starui/host-data`.
 *
 * Shipped prebuilt as `assets/data-services-worker.mjs`; apps import that URL
 * and hand it to `ensurePlatformReady` rather than writing a worker file.
 *
 * Deliberately carries NO Perspective loader. This asset is bundled once and
 * loaded by every app, and the inline Perspective build embeds its wasm as
 * base64 — including it here would cost megabytes to workers that never open a
 * blotter. Apps on the pull path import
 * `assets/data-services-perspective-worker.mjs` instead, which is this entry
 * plus that one option.
 *
 * Apps that need bespoke worker setup can still keep their own worker file and
 * call `installSharedWorkerHub({...})` directly.
 */

import { bootWorkerEntry, reportBootFailure } from './bootWorkerEntry.js';

const LABEL = '@starui/host-data worker';

bootWorkerEntry({ label: LABEL }).catch((err) => reportBootFailure(LABEL, err));
