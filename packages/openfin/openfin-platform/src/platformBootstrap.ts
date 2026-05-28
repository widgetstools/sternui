/**
 * OpenFin manifest → {@link PlatformBootstrapConfig} resolution.
 *
 * Browser-safe consumers import from `@starui/openfin-platform/config`.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
declare const fin: any;

import type OpenFin from '@openfin/core';
import {
  DEV_PLATFORM_BOOTSTRAP,
  PlatformBootstrapConfigError,
  resolvePlatformBootstrapFromObject,
  type PlatformBootstrapConfig,
} from '@starui/host-data';

import type { CustomSettings } from './types.js';

/** Default dev userId when manifest omits `customSettings.userId`. */
export const DEFAULT_MANIFEST_USER_ID = 'dev1';

/**
 * Pure helper: map manifest `customSettings` to bootstrap config.
 * Throws {@link PlatformBootstrapConfigError} when `appId` is missing.
 */
export function resolvePlatformBootstrapFromCustomSettings(
  customSettings: CustomSettings | undefined,
): PlatformBootstrapConfig {
  return resolvePlatformBootstrapFromObject({
    appId: customSettings?.appId,
    userId: customSettings?.userId ?? DEFAULT_MANIFEST_USER_ID,
    useRest: customSettings?.useRest,
    configServiceRestUrl: customSettings?.configServiceRestUrl,
    seedConfigUrl: customSettings?.seedConfigUrl,
  });
}

/**
 * Read `customSettings` from the current OpenFin manifest and resolve
 * {@link PlatformBootstrapConfig}.
 *
 * Outside OpenFin (`fin` undefined), returns {@link DEV_PLATFORM_BOOTSTRAP}
 * so plain-browser dev harnesses can import without crashing.
 */
export async function resolvePlatformBootstrapFromManifest(): Promise<PlatformBootstrapConfig> {
  if (typeof fin === 'undefined') {
    return DEV_PLATFORM_BOOTSTRAP;
  }

  try {
    const app = await fin.Application.getCurrent();
    const manifest = (await app.getManifest()) as OpenFin.Manifest & {
      customSettings?: CustomSettings;
    };
    return resolvePlatformBootstrapFromCustomSettings(manifest.customSettings);
  } catch (err) {
    if (err instanceof PlatformBootstrapConfigError) {
      throw err;
    }
    throw new PlatformBootstrapConfigError(
      'Failed to read OpenFin manifest for platform bootstrap',
    );
  }
}
