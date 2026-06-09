import { describe, it, expect, vi } from 'vitest';
import { resolveDefaultPlatformScope } from './platformScope';
import type { ConfigManager } from '@starui/host-config';

function fakeManager(over: {
  apps?: Array<{ appId: string; manifestUrl?: string }>;
  profiles?: Array<{ userId: string; appId: string }>;
}): ConfigManager {
  return {
    getAllApps: vi.fn(async () => over.apps ?? []),
    getAllUserProfiles: vi.fn(async () => over.profiles ?? []),
  } as unknown as ConfigManager;
}

describe('resolveDefaultPlatformScope', () => {
  it('prefers manifest customSettings appId and userId', async () => {
    const scope = await resolveDefaultPlatformScope(
      fakeManager({ apps: [{ appId: 'FromRegistry' }] }),
      { appId: 'StarDemo', userId: 'dev1' },
    );
    expect(scope).toEqual({ appId: 'StarDemo', userId: 'dev1' });
  });

  it('falls back to seeded appRegistry when manifest omits appId', async () => {
    const scope = await resolveDefaultPlatformScope(
      fakeManager({
        apps: [{ appId: 'StarDemo', manifestUrl: 'http://localhost:5175/platform/manifest.fin.json' }],
        profiles: [{ userId: 'dev1', appId: 'StarDemo' }],
      }),
      { userId: 'dev1' },
    );
    expect(scope.appId).toBe('StarDemo');
    expect(scope.userId).toBe('dev1');
  });

  it('uses TestApp only when manifest and registry are empty', async () => {
    const scope = await resolveDefaultPlatformScope(fakeManager({}), null);
    expect(scope).toEqual({ appId: 'TestApp', userId: 'dev1' });
  });
});
