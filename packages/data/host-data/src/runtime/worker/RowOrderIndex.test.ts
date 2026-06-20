import { describe, expect, it } from 'vitest';
import { RowOrderIndex } from './RowOrderIndex';

describe('RowOrderIndex', () => {
  it('reset establishes order, count, and block slices', () => {
    const v = new RowOrderIndex();
    v.reset(['a', 'b', 'c', 'd']);
    expect(v.count()).toBe(4);
    expect(v.indexOf('c')).toBe(2);
    expect(v.rangeKeys(1, 3)).toEqual(['b', 'c']);
    // Block clamps to bounds.
    expect(v.rangeKeys(2, 99)).toEqual(['c', 'd']);
    expect(v.rangeKeys(-5, 2)).toEqual(['a', 'b']);
  });

  it('add appends new keys; a known key (update) does not move', () => {
    const v = new RowOrderIndex();
    v.reset(['a', 'b']);
    v.add('c');
    expect(v.count()).toBe(3);
    expect(v.indexOf('c')).toBe(2);
    // Re-adding an existing key is a no-op (an UPDATE keeps its slot).
    v.add('a');
    expect(v.count()).toBe(3);
    expect(v.indexOf('a')).toBe(0);
  });

  it('remove re-indexes the tail', () => {
    const v = new RowOrderIndex();
    v.reset(['a', 'b', 'c', 'd']);
    v.remove('b');
    expect(v.count()).toBe(3);
    expect(v.rangeKeys(0, 3)).toEqual(['a', 'c', 'd']);
    expect(v.indexOf('c')).toBe(1);
    expect(v.indexOf('d')).toBe(2);
    expect(v.indexOf('b')).toBe(-1);
    v.remove('zzz'); // absent → no-op
    expect(v.count()).toBe(3);
  });

  it('changesInRange keeps only in-range changes, with their row index', () => {
    const v = new RowOrderIndex();
    v.reset(['k0', 'k1', 'k2', 'k3', 'k4', 'k5']);
    // Subscriber has rows [2,5) loaded. Ticks touch k0, k3, k4, k5, unknown.
    const hits = v.changesInRange(['k0', 'k3', 'k4', 'k5', 'nope'], 2, 5);
    expect(hits).toEqual([
      { key: 'k3', rowIndex: 3 },
      { key: 'k4', rowIndex: 4 },
    ]);
    // k0 (index 0) is below range; k5 (index 5) is at the exclusive end; both dropped.
  });

  it('changesInRange returns nothing when the loaded range is empty', () => {
    const v = new RowOrderIndex();
    v.reset(['a', 'b', 'c']);
    expect(v.changesInRange(['a', 'b'], 1, 1)).toEqual([]);
  });
});
