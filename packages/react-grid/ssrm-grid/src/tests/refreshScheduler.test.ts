/**
 * Refresh scheduler — the anti-jank policy.
 *
 * Deterministic clock + timers so scroll/tick interleavings are exact.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  RefreshScheduler,
  REFRESH_DEFAULTS,
  type RefreshKind,
} from '../ssrm/refreshScheduler.js';

function harness(overrides: Record<string, number> = {}) {
  let clock = 1_000;
  const queue: Array<{ at: number; cb: () => void; id: number }> = [];
  let seq = 0;
  const flushed: RefreshKind[] = [];

  const scheduler = new RefreshScheduler({
    flush: (k) => flushed.push(k),
    now: () => clock,
    setTimer: (cb, ms) => {
      const id = ++seq;
      queue.push({ at: clock + ms, cb, id });
      return id;
    },
    clearTimer: (h) => {
      const i = queue.findIndex((t) => t.id === h);
      if (i >= 0) queue.splice(i, 1);
    },
    ...overrides,
  });

  /** Advance the clock, firing any timer whose deadline passes. */
  const advance = (ms: number) => {
    const target = clock + ms;
    for (;;) {
      const next = queue.filter((t) => t.at <= target).sort((a, b) => a.at - b.at)[0];
      if (!next) break;
      queue.splice(queue.indexOf(next), 1);
      clock = next.at;
      next.cb();
    }
    clock = target;
  };

  return { scheduler, flushed, advance, get pendingTimers() { return queue.length; } };
}

describe('RefreshScheduler', () => {
  it('coalesces many ticks into one refresh', () => {
    const h = harness();
    for (let i = 0; i < 50; i++) h.scheduler.request('surgical');
    h.advance(200);
    expect(h.flushed).toEqual(['surgical']);
  });

  it('prefers surgical so loaded blocks are not dropped', () => {
    const h = harness();
    h.scheduler.request('surgical');
    h.advance(200);
    expect(h.flushed).toEqual(['surgical']);
  });

  it('lets a purge subsume a pending surgical refresh', () => {
    const h = harness();
    h.scheduler.request('surgical');
    h.scheduler.request('purge');      // structural change wins
    h.advance(200);
    expect(h.flushed).toEqual(['purge']);
  });

  it('does NOT refresh while the user is scrolling', () => {
    const h = harness();
    h.scheduler.request('surgical');
    h.scheduler.onScroll();
    h.advance(20);                     // inside the settle window
    expect(h.flushed).toEqual([]);     // nothing lands mid-drag
    expect(h.scheduler.hasPending).toBe(true);
  });

  it('flushes once scrolling settles', () => {
    const h = harness();
    h.scheduler.request('surgical');
    h.scheduler.onScroll();
    h.advance(REFRESH_DEFAULTS.scrollSettleMs + 5);
    expect(h.flushed).toEqual(['surgical']);
    expect(h.scheduler.isScrolling).toBe(false);
  });

  it('keeps deferring while scroll events continue', () => {
    const h = harness();
    h.scheduler.request('surgical');
    // A sustained drag: an event every 16ms for ~10 frames.
    for (let i = 0; i < 10; i++) {
      h.scheduler.onScroll();
      h.advance(16);
    }
    expect(h.flushed).toEqual([]);     // never interrupted the drag
    h.advance(REFRESH_DEFAULTS.scrollSettleMs + 5);
    expect(h.flushed).toEqual(['surgical']);
  });

  it('bounds staleness even under continuous scrolling', () => {
    const h = harness({ maxStallMs: 300 });
    h.scheduler.request('surgical');
    // Drag for well past the stall ceiling.
    for (let i = 0; i < 40; i++) {
      h.scheduler.onScroll();
      h.advance(16);
    }
    // Prices must not stay frozen just because the user keeps dragging.
    expect(h.flushed.length).toBeGreaterThanOrEqual(1);
  });

  it('rate-limits flushes when not scrolling', () => {
    const h = harness();
    h.scheduler.request('surgical');
    h.advance(1);                      // just enough to fire the first flush
    expect(h.flushed).toHaveLength(1);

    // A tick arriving immediately after must wait out minIntervalMs rather
    // than repainting the grid twice in consecutive frames.
    h.scheduler.request('surgical');
    h.advance(REFRESH_DEFAULTS.minIntervalMs - 20);
    expect(h.flushed).toHaveLength(1);
    h.advance(30);
    expect(h.flushed).toHaveLength(2);
  });

  it('does nothing without a pending signal', () => {
    const h = harness();
    h.scheduler.onScroll();
    h.advance(500);
    expect(h.flushed).toEqual([]);
  });

  it('flushNow() drains immediately and clears pending', () => {
    const h = harness();
    h.scheduler.request('purge');
    h.scheduler.flushNow();
    expect(h.flushed).toEqual(['purge']);
    expect(h.scheduler.hasPending).toBe(false);
  });

  it('drops everything after dispose and schedules no timers', () => {
    const h = harness();
    h.scheduler.dispose();
    h.scheduler.request('purge');
    h.scheduler.onScroll();
    h.advance(1000);
    expect(h.flushed).toEqual([]);
    expect(h.pendingTimers).toBe(0);
  });

  it('leaves no timer pending once idle', () => {
    const h = harness();
    h.scheduler.request('surgical');
    h.advance(500);
    expect(h.pendingTimers).toBe(0);
  });
});
