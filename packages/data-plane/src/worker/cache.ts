/**
 * cache.ts — per-provider cache for the data-plane worker.
 *
 * Shape
 * -----
 *   CacheState ─┬─> ProviderCache (for providerId 'p1')
 *               │     entries: Map<key, CacheEntry>
 *               │     lru:     doubly-linked insertion/access order
 *               │     maxEntries, defaultTtlMs
 *               │
 *               └─> ProviderCache (for providerId 'p2') ...
 *
 * CacheEntry carries
 *   • `data`      — the latest value (undefined during first fetch)
 *   • `fetchedAt` — epoch ms of the last successful write (0 if never)
 *   • `ttlMs`     — per-entry TTL override (null = inherit provider default)
 *   • `inFlight`  — promise shared by concurrent `get` callers (dedup)
 *   • `subscribers` — set of sub ids currently listening
 *   • `seq`       — monotonic sequence bumped on every broadcast
 *
 * Invariants
 * ----------
 * • Keyspace is per-provider. Two providers cannot collide.
 * • `maxEntries` is per-provider. A misbehaving provider cannot evict
 *   another provider's data.
 * • TTL of `null` (either per-entry or provider-default) means "never
 *   expires"; push-driven providers (STOMP/WS) use null and rely on
 *   subscribe-driven updates to keep data fresh.
 * • LRU touches happen on both `get` and `set` paths so read-heavy
 *   keys naturally survive eviction.
 *
 * Not covered here: broadcast delivery, port bookkeeping, fetch
 * orchestration — those live in `router.ts`. This file is a pure data
 * structure with no message / port imports so it's easy to unit test.
 */

export interface CacheEntry<T = unknown> {
  /** Latest value. Undefined until the first successful fetch. */
  data: T | undefined;
  /** Epoch ms of the last successful write. 0 if never written. */
  fetchedAt: number;
  /**
   * Per-entry TTL. null = no expiry; use the provider's default
   * when the entry doesn't override. Setters pass `undefined` to
   * inherit.
   */
  ttlMs: number | null;
  /**
   * Shared fetch promise. When two concurrent callers miss the
   * cache, the second one awaits this instead of starting a
   * duplicate fetch — this is the "thundering herd" guard.
   */
  inFlight?: Promise<T>;
  /** Subscription IDs currently receiving `update` messages for this entry. */
  subscribers: Set<string>;
  /** Monotonic per-entry sequence; bumped every time the entry is written. */
  seq: number;
  /** Last transport error — kept for observability; never served as data. */
  lastError?: { code: string; message: string; at: number };
}

export interface ProviderCacheOpts {
  maxEntries?: number;
  /** Provider-wide default TTL applied to new entries whose ttl is unset. */
  defaultTtlMs?: number | null;
}

/**
 * LRU bookkeeping: insertion order of a plain `Map` doubles as
 * recency order if we delete+re-insert on every access. Cheap, no
 * dependency, and tested independently below.
 */
export class ProviderCache<T = unknown> {
  readonly entries = new Map<string, CacheEntry<T>>();
  readonly maxEntries: number;
  readonly defaultTtlMs: number | null;

  constructor(opts: ProviderCacheOpts = {}) {
    this.maxEntries = opts.maxEntries ?? 1000;
    this.defaultTtlMs = opts.defaultTtlMs ?? null;
  }

  /** Read (and touch LRU). Returns undefined if missing. */
  peek(key: string): CacheEntry<T> | undefined {
    return this.entries.get(key);
  }

  /** Read + LRU-touch. */
  touch(key: string): CacheEntry<T> | undefined {
    const e = this.entries.get(key);
    if (e) {
      // Delete + re-insert moves the key to the "newest" end of the
      // insertion-ordered Map. O(1).
      this.entries.delete(key);
      this.entries.set(key, e);
    }
    return e;
  }

  /**
   * Insert or overwrite. Enforces `maxEntries` by evicting the LRU
   * (first insertion-ordered key) when capacity is reached.
   */
  set(key: string, entry: CacheEntry<T>): CacheEntry<T> {
    if (this.entries.has(key)) {
      // Overwriting: delete first so re-insert moves it to the newest end.
      this.entries.delete(key);
    } else if (this.entries.size >= this.maxEntries) {
      // At capacity — evict the oldest. Iterator's first key is LRU
      // because every touch re-inserts at the end.
      const lruKey = this.entries.keys().next().value;
      if (lruKey !== undefined) this.entries.delete(lruKey);
    }
    this.entries.set(key, entry);
    return entry;
  }

  /** Create an empty entry with provider defaults applied. */
  newEntry(): CacheEntry<T> {
    return {
      data: undefined,
      fetchedAt: 0,
      ttlMs: this.defaultTtlMs,
      subscribers: new Set<string>(),
      seq: 0,
    };
  }

  delete(key: string): boolean {
    return this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}

/**
 * Entry is expired if its TTL is set AND the elapsed time since
 * `fetchedAt` exceeds the TTL. Entries with `ttlMs: null` never expire.
 * Entries that have never been written (`fetchedAt === 0`) are treated
 * as NOT expired — they're simply empty and the next `get` will trigger
 * a fetch regardless.
 */
export function isExpired(entry: CacheEntry, now: number = Date.now()): boolean {
  if (entry.fetchedAt === 0) return false;
  if (entry.ttlMs === null) return false;
  return now - entry.fetchedAt >= entry.ttlMs;
}

/**
 * Single-flight dedup: returns a shared promise for a given key.
 *
 * First caller executes `factory()`; subsequent callers await the same
 * promise until it settles. On rejection the in-flight marker is
 * cleared so the next caller can retry. This is the function the
 * router wires into `get` — tests cover concurrent access directly.
 */
export async function singleFlight<T>(
  entry: CacheEntry<T>,
  factory: () => Promise<T>,
): Promise<T> {
  if (entry.inFlight) return entry.inFlight;
  const p = factory().finally(() => {
    entry.inFlight = undefined;
  });
  entry.inFlight = p;
  return p;
}

/**
 * Full cache state — one ProviderCache per configured provider.
 */
export class CacheState {
  private readonly caches = new Map<string, ProviderCache>();

  provider(providerId: string, opts?: ProviderCacheOpts): ProviderCache {
    let pc = this.caches.get(providerId);
    if (!pc) {
      pc = new ProviderCache(opts);
      this.caches.set(providerId, pc);
    }
    return pc;
  }

  has(providerId: string): boolean {
    return this.caches.has(providerId);
  }

  get(providerId: string): ProviderCache | undefined {
    return this.caches.get(providerId);
  }

  drop(providerId: string): boolean {
    return this.caches.delete(providerId);
  }

  clear(): void {
    this.caches.clear();
  }

  get size(): number {
    return this.caches.size;
  }
}
