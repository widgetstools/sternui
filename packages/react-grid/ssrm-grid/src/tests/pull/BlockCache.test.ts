import { describe, expect, it } from 'vitest';
import { BlockCache, type CachedBlock } from '../../pull/BlockCache.js';

const block = (generation: number, rows = [{ id: 1 }]): CachedBlock => ({
  rows: rows as Record<string, unknown>[],
  total: 100,
  generation,
  endRow: 100,
});

describe('BlockCache', () => {
  it('stores and serves blocks per view shape and start row', () => {
    const cache = new BlockCache();
    cache.set('view-a', 0, block(1));
    expect(cache.get('view-a', 0, 1)?.rows).toEqual([{ id: 1 }]);
    expect(cache.get('view-a', 100, 1)).toBeUndefined();
    expect(cache.get('view-b', 0, 1)).toBeUndefined();
  });

  it('never serves a stale generation (and drops it)', () => {
    const cache = new BlockCache();
    cache.set('view-a', 0, block(1));
    expect(cache.get('view-a', 0, 2)).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it('evicts least-recently-used blocks beyond capacity', () => {
    const cache = new BlockCache(2);
    cache.set('v', 0, block(1));
    cache.set('v', 100, block(1));
    cache.get('v', 0, 1); // refresh recency: LRU is now startRow 100
    cache.set('v', 200, block(1));
    expect(cache.size).toBe(2);
    expect(cache.get('v', 100, 1)).toBeUndefined();
    expect(cache.get('v', 0, 1)).toBeDefined();
    expect(cache.get('v', 200, 1)).toBeDefined();
  });

  it('lists cached blocks for one shape + generation', () => {
    const cache = new BlockCache();
    cache.set('v1', 0, block(1));
    cache.set('v1', 100, block(1));
    cache.set('v2', 0, block(1));
    cache.set('v1', 200, block(2));
    const entries = cache.entriesFor('v1', 1);
    expect(entries.map((e) => e.startRow).sort((a, b) => a - b)).toEqual([0, 100]);
  });

  it('clear() empties everything', () => {
    const cache = new BlockCache();
    cache.set('v', 0, block(1));
    cache.clear();
    expect(cache.size).toBe(0);
  });
});
