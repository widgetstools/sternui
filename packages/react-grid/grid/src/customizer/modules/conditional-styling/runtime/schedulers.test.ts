import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { PlatformHandle } from '@starui/engine';
import { createRefreshScheduler } from './schedulers';
import type { ConditionalStylingState } from '../state';

/**
 * Minimal platform + AG api double. Captures event listeners so the test
 * can fire `bodyScroll` / `bodyScrollEnd`, and counts `refreshCells`.
 */
function makePlatform() {
  const listeners = new Map<string, Set<() => void>>();
  const refreshCells = vi.fn();
  const api = {
    refreshCells,
    addEventListener: (t: string, l: () => void) => {
      if (!listeners.has(t)) listeners.set(t, new Set());
      listeners.get(t)!.add(l);
    },
    removeEventListener: (t: string, l: () => void) => {
      listeners.get(t)?.delete(l);
    },
  };
  const fire = (t: string) => {
    for (const l of [...(listeners.get(t) ?? [])]) l();
  };
  const platform = { api: { api } } as unknown as PlatformHandle<ConditionalStylingState>;
  return { platform, refreshCells, fire, listeners };
}

describe('createRefreshScheduler — scroll-quiet gate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Run rAF synchronously so a scheduled refresh resolves without an extra
    // frame tick; the settle window uses setTimeout (faked above).
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('refreshes immediately when not scrolling', () => {
    const { platform, refreshCells } = makePlatform();
    const s = createRefreshScheduler(platform);
    s.scheduleRefresh();
    expect(refreshCells).toHaveBeenCalledTimes(1);
    s.dispose();
  });

  it('defers refreshes during a scroll and flushes exactly once on settle', () => {
    const { platform, refreshCells, fire } = makePlatform();
    const s = createRefreshScheduler(platform);

    // First call wires the scroll listeners (lazy) and refreshes normally.
    s.scheduleRefresh();
    expect(refreshCells).toHaveBeenCalledTimes(1);
    refreshCells.mockClear();

    // Fling begins; refreshes requested mid-fling must NOT repaint.
    fire('bodyScroll');
    s.scheduleRefresh();
    s.scheduleRefresh();
    s.scheduleRefresh();
    expect(refreshCells).not.toHaveBeenCalled();

    // A continued scroll re-arms the settle window — still deferred.
    vi.advanceTimersByTime(100);
    fire('bodyScroll');
    vi.advanceTimersByTime(100);
    expect(refreshCells).not.toHaveBeenCalled();

    // Scrolling stops → settle window elapses → ONE coalesced refresh.
    vi.advanceTimersByTime(120);
    expect(refreshCells).toHaveBeenCalledTimes(1);
    s.dispose();
  });

  it('dispose unwires the scroll listeners', () => {
    const { platform, fire, listeners } = makePlatform();
    const s = createRefreshScheduler(platform);
    s.scheduleRefresh(); // wires listeners
    expect(listeners.get('bodyScroll')?.size).toBe(1);
    s.dispose();
    expect(listeners.get('bodyScroll')?.size ?? 0).toBe(0);
    // Firing after dispose is inert (no throw, no work).
    expect(() => fire('bodyScroll')).not.toThrow();
  });
});
