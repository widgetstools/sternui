/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { useViewTabTitle } from '../useViewTabTitle.js';

function Harness({ fallback }: { fallback: string }) {
  const { title, setTitle } = useViewTabTitle(fallback);
  return (
    <button type="button" data-testid="title" onClick={() => setTitle('Edited Caption')}>
      {title}
    </button>
  );
}

afterEach(() => {
  cleanup();
  delete (globalThis as any).fin;
  vi.useRealTimers();
});

describe('useViewTabTitle — outside OpenFin', () => {
  it('returns the fallback and setTitle only updates local state', () => {
    const { getByTestId } = render(<Harness fallback="Markets" />);
    const btn = getByTestId('title');
    expect(btn.textContent).toBe('Markets');
    act(() => btn.click());
    expect(btn.textContent).toBe('Edited Caption');
  });
});

describe('useViewTabTitle — under OpenFin', () => {
  let getOptions: ReturnType<typeof vi.fn>;
  let updateOptions: ReturnType<typeof vi.fn>;
  let customData: Record<string, unknown>;

  beforeEach(() => {
    vi.useFakeTimers();
    customData = {};
    getOptions = vi.fn(async () => ({ customData }));
    updateOptions = vi.fn(async (opts: any) => {
      customData = { ...customData, ...opts.customData };
    });
    (globalThis as any).fin = { me: { getOptions, updateOptions } };
  });

  it('seeds the caption from customData.savedTitle', async () => {
    customData = { savedTitle: 'Saved Tab Name' };
    const { getByTestId } = render(<Harness fallback="Markets" />);
    // Initial render shows the fallback before the async seed resolves.
    expect(getByTestId('title').textContent).toBe('Markets');
    await act(async () => {
      await Promise.resolve();
    });
    expect(getByTestId('title').textContent).toBe('Saved Tab Name');
  });

  it('reflects an external "Save Tab As…" rename within the poll interval', async () => {
    const { getByTestId } = render(<Harness fallback="Markets" />);
    await act(async () => {
      await Promise.resolve();
    });
    // External rename writes savedTitle into this view's customData.
    customData = { savedTitle: 'Renamed Externally' };
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(getByTestId('title').textContent).toBe('Renamed Externally');
  });

  it('setTitle writes document.title and persists savedTitle to customData', async () => {
    const { getByTestId } = render(<Harness fallback="Markets" />);
    await act(async () => {
      getByTestId('title').click();
      await Promise.resolve();
    });
    expect(document.title).toBe('Edited Caption');
    expect(updateOptions).toHaveBeenCalledWith({
      customData: { savedTitle: 'Edited Caption' },
    });
  });
});
