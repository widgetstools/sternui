/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ConfigManager } from '@marketsui/config-service';
import { LOGGED_IN_USER_ID } from '@marketsui/runtime-port';
import { useHostedIdentity } from '../useHostedIdentity.js';

afterEach(() => {
  cleanup();
  delete (globalThis as any).fin;
});

const fakeConfigManager = { __fake: true } as unknown as ConfigManager;

describe('useHostedIdentity — OpenFin path', () => {
  beforeEach(() => {
    (globalThis as any).fin = {
      me: {
        getOptions: vi.fn().mockResolvedValue({
          customData: {
            instanceId: 'OF-INSTANCE',
            appId: 'OF-APP',
            userId: 'OF-USER',
            componentType: 'MarketsGrid',
            componentSubType: 'FX',
            isTemplate: false,
            singleton: true,
          },
        }),
      },
    };
  });

  it('reads instanceId from fin.me.getOptions().customData; appId / userId are pinned', async () => {
    const { result } = renderHook(() =>
      useHostedIdentity({
        defaultInstanceId: 'fallback-instance',
        defaultAppId: 'fallback-app',
        defaultUserId: 'fallback-user',
        componentName: 'TestGrid',
        configManager: fakeConfigManager,
      }),
    );
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.identity.instanceId).toBe('OF-INSTANCE');
    // appId / userId are single-user-pinned — customData values for
    // them are intentionally ignored to keep persistence under one
    // canonical (appId, userId) scope. See useHostedIdentity for why.
    expect(result.current.identity.appId).toBe('TestApp');
    expect(result.current.identity.userId).toBe(LOGGED_IN_USER_ID);
    expect(result.current.identity.configManager).toBe(fakeConfigManager);
  });
});
