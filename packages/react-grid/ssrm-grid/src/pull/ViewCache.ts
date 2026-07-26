/**
 * ViewCache — a small LRU of live Perspective views keyed by query
 * shape (`QueryPlan.key`). Sort/filter flips between a handful of
 * shapes reuse the already-computed view instead of paying view
 * construction per block; evicted views are `delete()`d — vendor
 * views hold engine resources until deleted, GC never reclaims them.
 *
 * Creation is memoized by key (a Promise is cached immediately) so
 * concurrent block requests for one shape open exactly one view.
 */

import type { PullView, PullViewConfig } from './types.js';

export interface ViewCacheOpts {
  /** Max live views. Default 8. */
  maxViews?: number;
  /** Observes evictions/clears AFTER the view is removed (pre-delete). */
  onEvict?: (key: string, view: PullView) => void;
}

export class ViewCache {
  private readonly maxViews: number;
  private readonly onEvict: ((key: string, view: PullView) => void) | undefined;
  /** Insertion order = LRU order (re-set on every acquire). */
  private readonly views = new Map<string, Promise<PullView>>();
  /** Ref count prevents eviction while a view is being read. */
  private readonly refCount = new Map<string, number>();

  constructor(opts: ViewCacheOpts = {}) {
    this.maxViews = opts.maxViews ?? 8;
    this.onEvict = opts.onEvict;
  }

  get size(): number {
    return this.views.size;
  }

  /**
   * Get the view for `key`, creating it via `factory` on first use.
   * Marks the key most-recently-used; evicts the LRU view beyond
   * capacity (the just-acquired key is MRU, never the victim).
   */
  acquire(key: string, config: PullViewConfig, factory: (config: PullViewConfig) => Promise<PullView>): Promise<PullView> {
    const existing = this.views.get(key);
    if (existing) {
      this.views.delete(key);
      this.views.set(key, existing); // refresh recency
      return existing;
    }
    const created = factory(config);
    this.views.set(key, created);
    // Park a rejection handler: a failed create is evicted on the spot
    // and must not surface as an unhandled rejection from the cache slot.
    created.catch(() => {
      if (this.views.get(key) === created) this.views.delete(key);
    });
    this.evictOver(this.maxViews);
    return created;
  }

  /**
   * The cached view for `key` WITHOUT creating or refreshing recency —
   * tick refreshes use it so they never resurrect evicted shapes.
   */
  peek(key: string): Promise<PullView> | undefined {
    return this.views.get(key);
  }

  /** Increment ref count — prevents eviction while a view is being read. */
  hold(key: string): void {
    this.refCount.set(key, (this.refCount.get(key) ?? 0) + 1);
  }

  /** Decrement ref count — may trigger eviction if over capacity. */
  release(key: string): void {
    const current = this.refCount.get(key) ?? 0;
    if (current > 0) {
      this.refCount.set(key, current - 1);
      if (current === 1) {
        this.evictOver(this.maxViews); // evict once the last hold is released
      }
    }
  }

  /** Delete every cached view (e.g. on generation change / dispose). */
  clear(): void {
    this.refCount.clear();
    this.evictOver(0);
  }

  private evictOver(capacity: number): void {
    while (this.views.size > capacity) {
      const oldestKey = this.views.keys().next().value as string;
      // Skip views that are currently held
      if ((this.refCount.get(oldestKey) ?? 0) > 0) {
        break;
      }
      const oldest = this.views.get(oldestKey)!;
      this.views.delete(oldestKey);
      this.refCount.delete(oldestKey);
      void oldest
        .then((view) => {
          this.onEvict?.(oldestKey, view);
          return view.delete();
        })
        .catch(() => {
          /* create failed or view already deleted — nothing to release */
        });
    }
  }
}
