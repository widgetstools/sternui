import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ProviderCache,
  CacheState,
  isExpired,
  singleFlight,
  type CacheEntry,
} from './cache';

function seed<T>(pc: ProviderCache<T>, key: string, data: T, fetchedAt = Date.now()): CacheEntry<T> {
  const e = pc.newEntry();
  e.data = data;
  e.fetchedAt = fetchedAt;
  return pc.set(key, e);
}

describe('ProviderCache — basic get/set', () => {
  it('stores and retrieves an entry', () => {
    const pc = new ProviderCache<string>();
    seed(pc, 'k1', 'v1');
    expect(pc.peek('k1')?.data).toBe('v1');
  });

  it('overwrites existing entries (same key)', () => {
    const pc = new ProviderCache<string>();
    seed(pc, 'k1', 'v1');
    seed(pc, 'k1', 'v2');
    expect(pc.peek('k1')?.data).toBe('v2');
    expect(pc.size).toBe(1);
  });

  it('newEntry inherits provider defaultTtlMs', () => {
    const pc = new ProviderCache({ defaultTtlMs: 30_000 });
    const e = pc.newEntry();
    expect(e.ttlMs).toBe(30_000);
    expect(e.data).toBeUndefined();
    expect(e.fetchedAt).toBe(0);
    expect(e.seq).toBe(0);
    expect(e.subscribers.size).toBe(0);
  });

  it('newEntry inherits ttlMs=null when provider default is null', () => {
    const pc = new ProviderCache(); // default
    const e = pc.newEntry();
    expect(e.ttlMs).toBeNull();
  });
});

describe('ProviderCache — LRU eviction', () => {
  it('evicts the least-recently-used key when maxEntries is exceeded', () => {
    const pc = new ProviderCache<number>({ maxEntries: 3 });
    seed(pc, 'a', 1);
    seed(pc, 'b', 2);
    seed(pc, 'c', 3);
    // Capacity full. Insert 'd' → evicts 'a' (oldest by insertion).
    seed(pc, 'd', 4);
    expect(pc.size).toBe(3);
    expect(pc.peek('a')).toBeUndefined();
    expect(pc.peek('b')?.data).toBe(2);
    expect(pc.peek('c')?.data).toBe(3);
    expect(pc.peek('d')?.data).toBe(4);
  });

  it('touch() moves a key to the newest end, protecting it from eviction', () => {
    const pc = new ProviderCache<number>({ maxEntries: 3 });
    seed(pc, 'a', 1);
    seed(pc, 'b', 2);
    seed(pc, 'c', 3);
    // Touch 'a' — it's now newest. Insert 'd' → should evict 'b' (now oldest).
    pc.touch('a');
    seed(pc, 'd', 4);
    expect(pc.peek('a')?.data).toBe(1);
    expect(pc.peek('b')).toBeUndefined();
    expect(pc.peek('c')?.data).toBe(3);
    expect(pc.peek('d')?.data).toBe(4);
  });

  it('overwriting an existing key does not count as a new insertion toward capacity', () => {
    const pc = new ProviderCache<number>({ maxEntries: 2 });
    seed(pc, 'a', 1);
    seed(pc, 'b', 2);
    seed(pc, 'a', 99); // overwrite, not insert
    expect(pc.size).toBe(2);
    expect(pc.peek('a')?.data).toBe(99);
    expect(pc.peek('b')?.data).toBe(2);
  });

  it('default maxEntries is 1000', () => {
    const pc = new ProviderCache();
    expect(pc.maxEntries).toBe(1000);
  });
});

describe('isExpired', () => {
  it('returns false for entries with ttlMs=null', () => {
    const e: CacheEntry = {
      data: 'x',
      fetchedAt: 100,
      ttlMs: null,
      subscribers: new Set(),
      seq: 1,
    };
    expect(isExpired(e, 1_000_000_000)).toBe(false);
  });

  it('returns false for entries never written (fetchedAt=0)', () => {
    const e: CacheEntry = {
      data: undefined,
      fetchedAt: 0,
      ttlMs: 1000,
      subscribers: new Set(),
      seq: 0,
    };
    expect(isExpired(e, 1_000_000_000)).toBe(false);
  });

  it('returns true once elapsed time >= ttlMs', () => {
    const e: CacheEntry = {
      data: 'x',
      fetchedAt: 1000,
      ttlMs: 500,
      subscribers: new Set(),
      seq: 1,
    };
    expect(isExpired(e, 1499)).toBe(false);
    expect(isExpired(e, 1500)).toBe(true);
    expect(isExpired(e, 5000)).toBe(true);
  });
});

describe('singleFlight — thundering-herd dedup', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('two concurrent callers share a single factory invocation', async () => {
    const pc = new ProviderCache<string>();
    const entry = pc.set('k', pc.newEntry());
    const factory = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 10));
      return 'resolved';
    });

    const p1 = singleFlight(entry, factory);
    const p2 = singleFlight(entry, factory);

    expect(factory).toHaveBeenCalledTimes(1);
    expect(entry.inFlight).toBeDefined();

    await vi.advanceTimersByTimeAsync(10);
    const [v1, v2] = await Promise.all([p1, p2]);

    expect(v1).toBe('resolved');
    expect(v2).toBe('resolved');
    expect(factory).toHaveBeenCalledTimes(1);
    expect(entry.inFlight).toBeUndefined();
  });

  it('clears inFlight after a rejected fetch so the next caller can retry', async () => {
    const pc = new ProviderCache<string>();
    const entry = pc.set('k', pc.newEntry());
    const factory = vi.fn(async () => {
      throw new Error('boom');
    });

    await expect(singleFlight(entry, factory)).rejects.toThrow('boom');
    expect(entry.inFlight).toBeUndefined();

    // Next call: should re-invoke the factory (not reuse rejected promise).
    const factory2 = vi.fn(async () => 'recovered');
    const v = await singleFlight(entry, factory2);
    expect(v).toBe('recovered');
    expect(factory2).toHaveBeenCalledTimes(1);
  });

  it('three concurrent callers still invoke the factory once', async () => {
    const pc = new ProviderCache<number>();
    const entry = pc.set('k', pc.newEntry());
    const factory = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 5));
      return 42;
    });

    const promises = [
      singleFlight(entry, factory),
      singleFlight(entry, factory),
      singleFlight(entry, factory),
    ];

    expect(factory).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5);
    const values = await Promise.all(promises);
    expect(values).toEqual([42, 42, 42]);
    expect(factory).toHaveBeenCalledTimes(1);
  });
});

describe('CacheState — provider isolation', () => {
  it('creates a new ProviderCache per providerId on first access', () => {
    const s = new CacheState();
    const p1 = s.provider('stomp-1');
    const p2 = s.provider('stomp-1');
    expect(p1).toBe(p2); // same instance on repeat access
    expect(s.size).toBe(1);

    const p3 = s.provider('stomp-2');
    expect(p3).not.toBe(p1);
    expect(s.size).toBe(2);
  });

  it('passes opts only on first creation', () => {
    const s = new CacheState();
    const first = s.provider('p', { maxEntries: 5, defaultTtlMs: 1000 });
    expect(first.maxEntries).toBe(5);
    expect(first.defaultTtlMs).toBe(1000);
    const second = s.provider('p', { maxEntries: 999 });
    expect(second).toBe(first);
    expect(second.maxEntries).toBe(5);
  });

  it('drop removes a provider and its entries', () => {
    const s = new CacheState();
    const p = s.provider('p');
    seed(p, 'k', 'v');
    expect(s.drop('p')).toBe(true);
    expect(s.has('p')).toBe(false);
    expect(s.drop('p')).toBe(false);
    // Re-provision yields a new empty cache.
    const p2 = s.provider('p');
    expect(p2.size).toBe(0);
  });

  it('one provider filling to capacity does not evict another providers entries', () => {
    const s = new CacheState();
    const a = s.provider('a', { maxEntries: 2 });
    const b = s.provider('b', { maxEntries: 10 });
    seed(a, 'k1', 1);
    seed(a, 'k2', 2);
    seed(a, 'k3', 3); // evicts a.k1
    seed(b, 'k1', 'B1');
    seed(b, 'k2', 'B2');

    expect(a.peek('k1')).toBeUndefined();
    expect(a.peek('k2')?.data).toBe(2);
    expect(a.peek('k3')?.data).toBe(3);
    expect(b.peek('k1')?.data).toBe('B1');
    expect(b.peek('k2')?.data).toBe('B2');
  });
});
