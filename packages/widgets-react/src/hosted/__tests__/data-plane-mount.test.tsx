/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Parity row 9 — when `dataPlaneClient` is supplied, the wrapper
 * mounts a `<DataPlaneProvider>` around its children, and the
 * MarketsGridContainer subtree can resolve `useDataPlane()` without
 * throwing. With no client, the provider is omitted (consumers must
 * supply DataPlane context themselves).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import type { ConfigManager } from '@marketsui/config-service';
import type { DataPlane } from '@marketsui/data-plane/v2/client';
import { useDataPlane } from '@marketsui/data-plane-react/v2';

let captureClient: unknown = null;
let throwsOnRead = false;

vi.mock('../../v2/markets-grid-container/index.js', () => ({
  MarketsGridContainer: () => {
    try {
      const ctx = useDataPlane();
      captureClient = ctx.client;
      return <div data-testid="mgc-stub" data-has-dp="true" />;
    } catch {
      throwsOnRead = true;
      return <div data-testid="mgc-stub" data-has-dp="false" />;
    }
  },
}));

const { HostedMarketsGrid } = await import('../HostedMarketsGrid.js');

const fakeConfigManager = {
  deleteConfig: vi.fn().mockResolvedValue(undefined),
} as unknown as ConfigManager;

const fakeClient = { __fake: true } as unknown as DataPlane;

afterEach(() => {
  cleanup();
  captureClient = null;
  throwsOnRead = false;
});

describe('HostedMarketsGrid — DataPlane mount (row 9)', () => {
  it('mounts a DataPlaneProvider when dataPlaneClient is supplied', async () => {
    const { getByTestId } = render(
      <HostedMarketsGrid
        gridId="dp-1"
        defaultInstanceId="dp-1"
        componentName="DP"
        configManager={fakeConfigManager}
        dataPlaneClient={fakeClient}
      />,
    );
    const stub = await waitFor(() => {
      const el = getByTestId('mgc-stub');
      if (el.getAttribute('data-has-dp') !== 'true') throw new Error('not yet');
      return el;
    });
    expect(stub.getAttribute('data-has-dp')).toBe('true');
    expect(captureClient).toBe(fakeClient);
  });

  it('omits the provider when dataPlaneClient is absent', async () => {
    const { getByTestId } = render(
      <HostedMarketsGrid
        gridId="dp-2"
        defaultInstanceId="dp-2"
        componentName="DP"
        configManager={fakeConfigManager}
      />,
    );
    const stub = await waitFor(() => getByTestId('mgc-stub'));
    expect(stub.getAttribute('data-has-dp')).toBe('false');
    expect(throwsOnRead).toBe(true);
  });
});
