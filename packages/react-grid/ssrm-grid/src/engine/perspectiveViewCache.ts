/**
 * LRU cache of Perspective `View`s, keyed by query shape.
 *
 * Why this exists (ADR-ssrm-worker-hosted-engine.md):
 *
 * - **Views are engine resources, not JS objects.** They hold allocations in
 *   the WASM heap and are NOT garbage collected — a dropped reference leaks
 *   until the worker dies, invisible to JS heap tooling. Every eviction path
 *   here must `delete()`.
 * - **Blotters share shapes.** Ten windows on the default layout produce one
 *   view, not ten. Cost scales with distinct query shapes, not window count —
 *   which is the property that makes N blotters affordable.
 * - **Group drill-down multiplies keys.** Each expanded group node is served
 *   by its own path-filtered view, so the key includes `groupKeys`. LRU bounds
 *   what that can grow to.
 */

import type { PerspectiveView } from './perspectiveTypes.js';

/** Stable key for a view shape — same shape must produce the same string. */
export function viewCacheKey(parts: {
  dataset: string;
  groupBy: readonly string[];
  splitBy: readonly string[];
  filter: readonly unknown[];
  filterOp: string;
  sort: readonly unknown[];
  aggregates: Record<string, string>;
  expressions: Record<string, string>;
  groupKeys: readonly string[];
}): string {
  // Object key order is insertion-ordered, so sort the record keys to keep
  // structurally-identical shapes from producing different strings.
  const sortRecord = (r: Record<string, string>): [string, string][] =>
    Object.entries(r).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return JSON.stringify({
    d: parts.dataset,
    g: parts.groupBy,
    s: parts.splitBy,
    f: parts.filter,
    fo: parts.filterOp,
    so: parts.sort,
    a: sortRecord(parts.aggregates),
    e: sortRecord(parts.expressions),
    k: parts.groupKeys,
  });
}

interface Entry {
  view: PerspectiveView;
  /** Monotonic use counter — cheaper and more stable than a clock. */
  lastUsed: number;
  /** Pending `on_update` handle, if a dirty subscription was attached. */
  subscribed: boolean;
}

export interface PerspectiveViewCacheOpts {
  /** Max live views before LRU eviction. Default 32. */
  maxViews?: number;
  /** Notified when a view is evicted, so callers can drop derived state. */
  onEvict?: (key: string) => void;
}

export class PerspectiveViewCache {
  private readonly entries = new Map<string, Entry>();
  private readonly maxViews: number;
  private readonly onEvict?: (key: string) => void;
  private useSeq = 0;
  private disposed = false;

  constructor(opts: PerspectiveViewCacheOpts = {}) {
    this.maxViews = Math.max(1, opts.maxViews ?? 32);
    this.onEvict = opts.onEvict;
  }

  get size(): number {
    return this.entries.size;
  }

  /** Existing view for this shape, marking it most-recently-used. */
  peek(key: string): PerspectiveView | undefined {
    const hit = this.entries.get(key);
    if (!hit) return undefined;
    hit.lastUsed = ++this.useSeq;
    return hit.view;
  }

  hasSubscription(key: string): boolean {
    return this.entries.get(key)?.subscribed === true;
  }

  markSubscribed(key: string): void {
    const hit = this.entries.get(key);
    if (hit) hit.subscribed = true;
  }

  /**
   * Insert a freshly created view. If the cache is full the least-recently
   * used view is evicted **and deleted**. Inserting into a disposed cache
   * deletes the incoming view rather than retaining it.
   */
  async put(key: string, view: PerspectiveView): Promise<void> {
    if (this.disposed) {
      await safeDelete(view);
      return;
    }
    const existing = this.entries.get(key);
    if (existing && existing.view !== view) {
      // Concurrent creation raced us — keep the incumbent, drop the duplicate.
      await safeDelete(view);
      existing.lastUsed = ++this.useSeq;
      return;
    }
    this.entries.set(key, { view, lastUsed: ++this.useSeq, subscribed: false });
    await this.evictIfNeeded();
  }

  /** Drop and delete one view. */
  async release(key: string): Promise<void> {
    const hit = this.entries.get(key);
    if (!hit) return;
    this.entries.delete(key);
    this.onEvict?.(key);
    await safeDelete(hit.view);
  }

  /** Drop and delete every view (window close / engine dispose). */
  async dispose(): Promise<void> {
    this.disposed = true;
    const all = [...this.entries.entries()];
    this.entries.clear();
    for (const [key, entry] of all) {
      this.onEvict?.(key);
      await safeDelete(entry.view);
    }
  }

  private async evictIfNeeded(): Promise<void> {
    while (this.entries.size > this.maxViews) {
      let oldestKey: string | null = null;
      let oldestUse = Number.POSITIVE_INFINITY;
      for (const [key, entry] of this.entries) {
        if (entry.lastUsed < oldestUse) {
          oldestUse = entry.lastUsed;
          oldestKey = key;
        }
      }
      if (oldestKey === null) return;
      await this.release(oldestKey);
    }
  }
}

/** `delete()` must never reject the caller — a dead view is already gone. */
async function safeDelete(view: PerspectiveView): Promise<void> {
  try {
    await view.delete();
  } catch {
    /* view already deleted, or its worker went away */
  }
}
