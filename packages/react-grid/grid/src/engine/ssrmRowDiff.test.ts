import { afterEach, describe, expect, it, beforeEach, vi } from 'vitest';
import {
  clearSsrmRowDiffs,
  getSsrmRowDiff,
  recordSsrmTickDiffs,
  resolveSsrmTickRowId,
} from './ssrmRowDiff.js';

describe('ssrmRowDiff', () => {
  beforeEach(() => {
    clearSsrmRowDiffs();
  });

  it('resolveSsrmTickRowId prefers id then rowIdField', () => {
    expect(resolveSsrmTickRowId({ id: 'a', sym: 'MSFT' })).toBe('a');
    expect(resolveSsrmTickRowId({ sym: 'MSFT' }, 'sym')).toBe('MSFT');
  });

  it('recordSsrmTickDiffs stashes diffs readable via getSsrmRowDiff', () => {
    recordSsrmTickDiffs([{ id: 'r1', price: 100 }]);
    expect(getSsrmRowDiff('r1')).toBeUndefined();

    recordSsrmTickDiffs([{ id: 'r1', price: 105 }]);
    expect(getSsrmRowDiff('r1')?.get('price')).toEqual({ oldValue: 100, newValue: 105 });
  });

  it('diffs are TICK-LOCAL: expire after the TTL so styling clears', () => {
    // Without expiry a full-book sweep leaves a diff on every row and
    // `.old/.new` rules light the whole grid permanently.
    vi.useFakeTimers();
    try {
      recordSsrmTickDiffs([{ id: 'r1', price: 100 }]); // prime
      recordSsrmTickDiffs([{ id: 'r1', price: 105 }]); // diff
      expect(getSsrmRowDiff('r1')?.get('price')).toEqual({
        oldValue: 100,
        newValue: 105,
      });

      vi.advanceTimersByTime(2_100); // past SSRM_DIFF_TTL_MS
      expect(getSsrmRowDiff('r1')).toBeUndefined();

      // A fresh tick after expiry starts a clean window — no stale fields.
      recordSsrmTickDiffs([{ id: 'r1', price: 110 }]);
      expect(getSsrmRowDiff('r1')?.get('price')).toEqual({
        oldValue: 105,
        newValue: 110,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('evicts oldest tracked rows once the cap is exceeded (B3)', () => {
    // Establish baselines, then diff, for cap+1 rows — oldest must fall out.
    const cap = 50_000;
    const batchOf = (offset: number, n: number, price: number) =>
      Array.from({ length: n }, (_, i) => ({ id: `row-${offset + i}`, price }));
    for (let offset = 0; offset < cap + 1; offset += 10_000) {
      const n = Math.min(10_000, cap + 1 - offset);
      recordSsrmTickDiffs(batchOf(offset, n, 1));
      recordSsrmTickDiffs(batchOf(offset, n, 2));
    }
    expect(getSsrmRowDiff('row-0')).toBeUndefined();
    expect(getSsrmRowDiff(`row-${cap}`)?.get('price')).toEqual({ oldValue: 1, newValue: 2 });
  });
});
