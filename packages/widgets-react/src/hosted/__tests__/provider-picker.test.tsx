/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Parity row 16 — provider picker via Alt+Shift+P. The picker itself
 * lives in MarketsGridContainer (and is covered by that package's
 * own tests). At the wrapper boundary the contract is: dispatching
 * the chord while the wrapper is mounted reaches a chord listener
 * registered on `document` — the wrapper neither swallows nor
 * stopsPropagation on the keydown.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import type { ConfigManager } from '@marketsui/config-service';
import { useChordHotkey } from '../../v2/markets-grid-container/useChordHotkey.js';

let chordFires = 0;

vi.mock('../../v2/markets-grid-container/index.js', () => ({
  MarketsGridContainer: () => {
    useChordHotkey('Alt+Shift+P', () => {
      chordFires += 1;
    });
    return <div data-testid="mgc-stub" />;
  },
}));

const { HostedMarketsGrid } = await import('../HostedMarketsGrid.js');

const fakeConfigManager = {
  deleteConfig: vi.fn().mockResolvedValue(undefined),
} as unknown as ConfigManager;

afterEach(() => {
  cleanup();
  chordFires = 0;
});

describe('HostedMarketsGrid — provider picker chord (row 16)', () => {
  it('does not block Alt+Shift+P from reaching a document chord listener', async () => {
    const { getByTestId } = render(
      <HostedMarketsGrid
        gridId="pp-1"
        defaultInstanceId="pp-1"
        componentName="PP"
        configManager={fakeConfigManager}
      />,
    );
    await waitFor(() => getByTestId('mgc-stub'));

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'P',
          altKey: true,
          shiftKey: true,
          bubbles: true,
        }),
      );
    });
    expect(chordFires).toBe(1);
  });
});
