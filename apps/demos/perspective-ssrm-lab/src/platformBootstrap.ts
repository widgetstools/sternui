import {
  ensurePlatformReady,
  resolvePlatformBootstrapFromJson,
  type PlatformBootstrapConfig,
} from '@starui/host-data';
import type { DataServices } from '@starui/host-data/runtime';
import workerAssetUrl from '@starui/host-data/assets/data-services-perspective-worker.mjs?url';
import { asLegacyDataServices } from './bootstrap/asLegacyDataServices.js';

export interface PlatformBootstrapResult {
  config: PlatformBootstrapConfig;
  platform: Awaited<ReturnType<typeof ensurePlatformReady>>;
  dataServices: DataServices;
}

/**
 * Load `/app-config.json`, init ConfigManager + SharedWorker hub.
 *
 * ONE line differs from the CSRM lab: the worker asset.
 * `data-services-perspective-worker.mjs` is the same hub with a Perspective
 * loader wired in, so a `mock-perspective` provider can build its Table. It
 * ships prebuilt — this app has no worker file of its own. It is a separate
 * asset rather than a flag because the inline Perspective build embeds its
 * wasm as base64: bundling it into the entry every app loads would cost
 * megabytes to workers that never open a blotter.
 *
 * Worker name: `mkt-data-services:${config.appId}`, and `app-config.json`
 * gives this lab its OWN appId — so it gets its own worker and its own Tables
 * rather than sharing the CSRM lab's. That is what lets both run side by side
 * as an A/B pair.
 */
export async function initPlatformBootstrap(): Promise<PlatformBootstrapResult> {
  const config = await resolvePlatformBootstrapFromJson('/app-config.json');
  const platform = await ensurePlatformReady(config, { workerScriptUrl: workerAssetUrl });
  return {
    config,
    platform,
    dataServices: asLegacyDataServices(platform),
  };
}
