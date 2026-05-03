/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { useHostedIdentity } from '../useHostedIdentity.js';

afterEach(() => {
  cleanup();
  delete (globalThis as any).fin;
  window.history.replaceState({}, '', '/');
});

describe('useHostedIdentity — browser path', () => {
  beforeEach(() => {
    delete (globalThis as any).fin;
  });

  it('falls back to URL ?instanceId= when no OpenFin runtime is present', async () => {
    window.history.replaceState({}, '', '/?instanceId=B-FROM-URL');
    const { result } = renderHook(() =>
      useHostedIdentity({
        defaultInstanceId: 'unused-default',
        defaultAppId: 'browser-app',
        defaultUserId: 'browser-user',
        componentName: 'TestGrid',
      }),
    );
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.identity.instanceId).toBe('B-FROM-URL');
    expect(result.current.identity.appId).toBe('browser-app');
    expect(result.current.identity.userId).toBe('browser-user');
  });

  it('falls back to defaultInstanceId when no fin runtime and no URL param', async () => {
    window.history.replaceState({}, '', '/');
    const { result } = renderHook(() =>
      useHostedIdentity({
        defaultInstanceId: 'plain-default',
        componentName: 'TestGrid',
      }),
    );
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.identity.instanceId).toBe('plain-default');
  });
});
