/**
 * Resolve the canonical `(appId, userId)` platform scope after
 * ConfigManager seeding. Manifest `customSettings` wins, then seeded
 * `appRegistry` / `userProfile` tables, then dev fallbacks.
 */

import type { ConfigManager } from '@starui/host-config';
import { DEFAULT_APP_ID, DEFAULT_USER_ID } from './registryHostEnv';
import type { CustomSettings } from './types';

export interface PlatformScope {
  appId: string;
  userId: string;
}

function pickRegistryAppId(
  apps: Array<{ appId?: string; manifestUrl?: string }>,
): string | undefined {
  const entries = apps.filter(
    (e) => typeof e?.appId === 'string' && e.appId.trim().length > 0,
  );
  if (entries.length === 0) return undefined;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const matched = origin
    ? entries.find(
        (e) => typeof e.manifestUrl === 'string' && e.manifestUrl.startsWith(origin),
      )
    : undefined;
  return (matched ?? entries[0]).appId!.trim();
}

/**
 * Canonical scope for dock, registry, workspace persistence, and
 * child-tool `customData.appId` forwarding.
 */
export async function resolveDefaultPlatformScope(
  cm: ConfigManager,
  manifest?: Pick<CustomSettings, 'appId' | 'userId'> | null,
): Promise<PlatformScope> {
  let appId = typeof manifest?.appId === 'string' ? manifest.appId.trim() : '';
  let userId = typeof manifest?.userId === 'string' ? manifest.userId.trim() : '';

  if (!appId) {
    const fromRegistry = pickRegistryAppId(await cm.getAllApps());
    if (fromRegistry) appId = fromRegistry;
  }

  if (!userId) {
    const profiles = await cm.getAllUserProfiles();
    const forApp = appId
      ? profiles.filter((p) => p.appId === appId)
      : profiles;
    const pick = forApp[0] ?? profiles[0];
    if (pick?.userId && String(pick.userId).trim()) {
      userId = String(pick.userId).trim();
    }
  }

  return {
    appId: appId || DEFAULT_APP_ID,
    userId: userId || DEFAULT_USER_ID,
  };
}
