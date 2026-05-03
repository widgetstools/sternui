/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Parity row 7 — document.title is set on mount and restored on
 * unmount. When `documentTitle` is omitted it defaults to
 * `componentName`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import type { ConfigManager } from '@marketsui/config-service';

vi.mock('../../v2/markets-grid-container/index.js', () => ({
  MarketsGridContainer: () => <div data-testid="mgc-stub" />,
}));

const { HostedMarketsGrid } = await import('../HostedMarketsGrid.js');

const fakeConfigManager = {
  deleteConfig: vi.fn().mockResolvedValue(undefined),
} as unknown as ConfigManager;

afterEach(() => {
  cleanup();
  document.title = '';
  delete (globalThis as any).fin;
});

describe('HostedMarketsGrid — document.title (row 7)', () => {
  it('falls back to componentName when documentTitle is omitted', async () => {
    document.title = 'Original';
    const { unmount, getByTestId } = render(
      <HostedMarketsGrid
        gridId="dt-1"
        defaultInstanceId="dt-1"
        componentName="DefaultedTitle"
        configManager={fakeConfigManager}
      />,
    );
    await waitFor(() => getByTestId('mgc-stub'));
    expect(document.title).toBe('DefaultedTitle');
    unmount();
    expect(document.title).toBe('Original');
  });
});
