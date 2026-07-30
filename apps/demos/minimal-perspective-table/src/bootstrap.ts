/**
 * Platform bootstrap — runs once before React mounts (see main.tsx).
 *
 * Identical to `stomp-marketsgrid-minimal` except for ONE import: the worker
 * asset. `data-services-perspective-worker.mjs` is the same hub with a
 * Perspective loader wired in, so `stomp-perspective` providers can build
 * their Table. It ships prebuilt — this app has no worker file of its own.
 *
 * It is a separate asset rather than a flag because the inline Perspective
 * build embeds its wasm as base64: bundling it into the entry every app loads
 * would cost megabytes to workers that never open a blotter.
 */

import {
  ensurePlatformReady,
  resolvePlatformBootstrapFromJson,
  type ResolvedDataServicesHubBundle,
} from '@starui/host-data';
import workerAssetUrl from '@starui/host-data/assets/data-services-perspective-worker.mjs?url';
import { appDataBootstrapHooks } from './platform/appDataBootstrap.js';

/** Set by bootstrap(); read by App for HostedMarketsGrid layout persistence. */
let platform: ResolvedDataServicesHubBundle | undefined;

export function getPlatform(): ResolvedDataServicesHubBundle {
  if (!platform) throw new Error('Call bootstrap() first');
  return platform;
}

export async function bootstrap() {
  const config = await resolvePlatformBootstrapFromJson('/app-config.json');

  platform = await ensurePlatformReady(config, {
    workerScriptUrl: workerAssetUrl,
    appDataBootstrapHooks,
  });

  return { config, platform };
}
