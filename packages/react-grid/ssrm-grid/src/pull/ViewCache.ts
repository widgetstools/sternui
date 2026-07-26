/**
 * ViewCache — a small pool of live Perspective views keyed by query
 * shape (`QueryPlan.key`), with LEASED access.
 *
 * ## Why leases, and not an LRU that deletes on eviction
 *
 * Measured against the installed @finos/perspective 3.8.0:
 *
 * • A live view is NOT free. Views are eagerly maintained on every
 *   `table.update()`: ~`2.4ms + 2.6ms per live view` (202 cols x 20k
 *   rows). Eight live views cost ~26ms per update, ~45ms with row-mode
 *   subscriptions — on the SAME thread as STOMP ingest. A view is a
 *   recurring tax, not a free cache slot.
 *
 * • `view.delete()` zeroes the JS handle SYNCHRONOUSLY, before the wasm
 *   call is known to have succeeded, while async `&self` methods hold a
 *   long borrow for the whole future. Deleting a view with a read in
 *   flight yields `attempted to take ownership of Rust value while it
 *   was borrowed`, the delete promise NEVER SETTLES, and the
 *   server-side view is leaked with no way to reclaim it. That error is
 *   raised inside a wasm-futures microtask, so it is NOT catchable by
 *   `try { await view.num_rows() } catch {}` at the call site.
 *
 * • Dropping a view without deleting it reclaims nothing — the
 *   FinalizationRegistry frees only the client proxy and sends no
 *   ViewDelete. A leaked view keeps costing ~2.6ms/update and ~5MB
 *   forever; enough of them and the wasm32 heap hits its ceiling and
 *   the engine aborts (observed as `RuntimeError: unreachable`).
 *
 * So a racing eviction is not a transient glitch — it permanently
 * degrades throughput and leaks toward a crash. Every read therefore
 * takes a LEASE, and a view is deleted only once it is retired AND
 * un-leased. `withView`/`tryWithView` release automatically; there is
 * deliberately no bare `acquire` that a caller could forget to pair.
 */

import type { PullView, PullViewConfig } from './types.js';

export interface ViewCacheOpts {
  /**
   * Max views kept live. Beyond this the least-recently-used are
   * RETIRED (deleted once their last lease ends). Default 4 — each live
   * view costs on every table update, so this is a throughput knob.
   */
  maxViews?: number;
  /** Observes a view being retired, BEFORE any delete is attempted. */
  onRetire?: (key: string, view: PullView) => void;
}

interface ViewEntry {
  readonly pending: Promise<PullView>;
  /** Reads currently in flight against this view. */
  leases: number;
  /** Evicted/cleared: delete as soon as `leases` reaches 0. */
  retiring: boolean;
}

export class ViewCache {
  private readonly maxViews: number;
  private readonly onRetire: ((key: string, view: PullView) => void) | undefined;
  /** Insertion order = LRU order (re-set on every use). Live views only. */
  private readonly views = new Map<string, ViewEntry>();
  /** Retired-but-still-leased views, awaiting their last lease. */
  private readonly draining = new Set<ViewEntry>();

  constructor(opts: ViewCacheOpts = {}) {
    this.maxViews = opts.maxViews ?? 4;
    this.onRetire = opts.onRetire;
  }

  /** Live (non-retired) views. */
  get size(): number {
    return this.views.size;
  }

  /** Retired views still waiting on an in-flight read to finish. */
  get drainingCount(): number {
    return this.draining.size;
  }

  /**
   * Run `use` against the view for `key`, creating it on first use.
   * The view cannot be deleted for the duration, however long `use`
   * takes and whether it resolves or throws.
   */
  async withView<T>(
    key: string,
    config: PullViewConfig,
    factory: (config: PullViewConfig) => Promise<PullView>,
    use: (view: PullView) => Promise<T>,
  ): Promise<T> {
    return this.lease(this.entryFor(key, config, factory), use);
  }

  /**
   * Like `withView`, but never CREATES: resolves `undefined` when the
   * shape is not currently cached. Tick sweeps use this so a background
   * refresh can never resurrect a shape the user has moved away from.
   */
  async tryWithView<T>(key: string, use: (view: PullView) => Promise<T>): Promise<T | undefined> {
    const entry = this.views.get(key);
    if (!entry || entry.retiring) return undefined;
    // Recency is deliberately NOT refreshed: a background sweep must not
    // keep alive a shape that user-facing reads have abandoned.
    return this.lease(entry, use);
  }

  /** Ensure the view for `key` exists and is warming. Takes no lease. */
  warm(
    key: string,
    config: PullViewConfig,
    factory: (config: PullViewConfig) => Promise<PullView>,
  ): Promise<PullView> {
    return this.entryFor(key, config, factory).pending;
  }

  /** True when `key` currently has a live (non-retiring) view. */
  has(key: string): boolean {
    const entry = this.views.get(key);
    return entry !== undefined && !entry.retiring;
  }

  /**
   * Retire every view (generation change / dispose). Views with reads in
   * flight are deleted when those reads finish — never pulled out from
   * under them, which would leak them permanently.
   */
  retireAll(): void {
    for (const key of [...this.views.keys()]) this.retire(key);
  }

  private entryFor(
    key: string,
    config: PullViewConfig,
    factory: (config: PullViewConfig) => Promise<PullView>,
  ): ViewEntry {
    const existing = this.views.get(key);
    if (existing && !existing.retiring) {
      this.views.delete(key);
      this.views.set(key, existing); // refresh recency
      return existing;
    }
    const entry: ViewEntry = { pending: factory(config), leases: 0, retiring: false };
    this.views.set(key, entry);
    // Park a rejection handler: a failed create is dropped on the spot
    // and must not surface as an unhandled rejection from the cache slot.
    entry.pending.catch(() => {
      if (this.views.get(key) === entry) this.views.delete(key);
    });
    this.evictOver(this.maxViews);
    return entry;
  }

  private async lease<T>(entry: ViewEntry, use: (view: PullView) => Promise<T>): Promise<T> {
    entry.leases += 1;
    try {
      return await use(await entry.pending);
    } finally {
      entry.leases -= 1;
      if (entry.leases === 0 && entry.retiring) this.destroy(entry);
    }
  }

  /**
   * Retire the LRU views beyond capacity. Unlike a plain LRU this SKIPS
   * leased views rather than stopping at the first one: a single
   * long-running read would otherwise pin the pool over capacity, and
   * every extra live view is a recurring per-update tax.
   */
  private evictOver(capacity: number): void {
    let over = this.views.size - capacity;
    if (over <= 0) return;
    for (const key of [...this.views.keys()]) {
      if (over <= 0) break;
      this.retire(key);
      over -= 1;
    }
  }

  /** Remove from the live pool; delete now if idle, else once drained. */
  private retire(key: string): void {
    const entry = this.views.get(key);
    if (!entry) return;
    this.views.delete(key);
    entry.retiring = true;
    if (this.onRetire) {
      void entry.pending.then((view) => this.onRetire?.(key, view)).catch(() => undefined);
    }
    if (entry.leases === 0) this.destroy(entry);
    else this.draining.add(entry);
  }

  private destroy(entry: ViewEntry): void {
    this.draining.delete(entry);
    void entry.pending
      .then((view) => view.delete())
      .catch(() => {
        /* create failed, or already deleted — nothing to release */
      });
  }
}
