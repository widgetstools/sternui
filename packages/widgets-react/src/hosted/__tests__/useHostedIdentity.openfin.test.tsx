/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ConfigManager } from '@marketsui/config-service';
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

  it('reads identity from fin.me.getOptions().customData', async () => {
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
    expect(result.current.identity.appId).toBe('OF-APP');
    expect(result.current.identity.userId).toBe('OF-USER');
    expect(result.current.identity.configManager).toBe(fakeConfigManager);
  });
});
