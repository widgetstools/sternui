/**
 * Scroll-aware refresh scheduler — the anti-jank core of the SSRM grid.
 *
 * A live feed and a scrolling user compete for the same main thread. Under a
 * 20k-row book ticking continuously, the naive loop is:
 *
 *   tick → refresh loaded blocks → AG Grid re-requests → decode → repaint
 *
 * …which lands mid-drag, fights the scroll, and can reset the viewport. This
 * scheduler decides *when* a dirty signal is allowed to reach the grid.
 *
 * Rules, in priority order:
 *
 * 1. **Never refresh while the user is scrolling.** Dirty signals accumulate
 *    and flush once motion settles. A row the user is scrolling past does not
 *    need to be up to date mid-flight; a jank-free drag matters more.
 * 2. **Coalesce.** Many ticks inside one window produce one refresh. Purge
 *    beats surgical when both are pending, since a purge subsumes it.
 * 3. **Prefer surgical transactions.** Leaf update/add can be applied in place
 *    without dropping loaded blocks — the difference between a repainted cell
 *    and a viewport that jumps.
 * 4. **Bound staleness.** Even under continuous scrolling, force a flush after
 *    `maxStallMs` so a user dragging a scrollbar for ten seconds is not
 *    looking at frozen prices.
 *
 * Pure and timer-injectable so the policy is testable without a DOM.
 */

/** What a flush should do to the grid. */
export type RefreshKind = 'surgical' | 'purge';

export interface RefreshSchedulerOpts {
  /**
   * Applies a coalesced refresh. `midScroll` is true when the flush was
   * forced by the `maxStallMs` ceiling while the user was still scrolling —
   * heavy work (store refreshes) should be deferred to the settle flush.
   */
  flush: (kind: RefreshKind, midScroll?: boolean) => void;
  /**
   * Quiet period after the last scroll event before refreshing. ~2 frames:
   * long enough to ride out momentum, short enough to feel immediate.
   */
  scrollSettleMs?: number;
  /** Minimum gap between flushes when not scrolling. */
  minIntervalMs?: number;
  /** Hard ceiling on how long a dirty signal may be withheld. */
  maxStallMs?: number;
  setTimer?: (cb: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  now?: () => number;
}

export const REFRESH_DEFAULTS = {
  scrollSettleMs: 32,
  minIntervalMs: 60,
  maxStallMs: 1_000,
} as const;

export class RefreshScheduler {
  private readonly flushFn: (kind: RefreshKind, midScroll?: boolean) => void;
  private readonly scrollSettleMs: number;
  private readonly minIntervalMs: number;
  private readonly maxStallMs: number;
  private readonly setTimer: (cb: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;
  private readonly now: () => number;

  private timer: unknown = null;
  private pending: RefreshKind | null = null;
  /** When the oldest withheld signal arrived — drives `maxStallMs`. */
  private pendingSince = 0;
  private lastFlushAt = 0;
  private scrolling = false;
  private disposed = false;

  constructor(opts: RefreshSchedulerOpts) {
    this.flushFn = opts.flush;
    this.scrollSettleMs = opts.scrollSettleMs ?? REFRESH_DEFAULTS.scrollSettleMs;
    this.minIntervalMs = opts.minIntervalMs ?? REFRESH_DEFAULTS.minIntervalMs;
    this.maxStallMs = opts.maxStallMs ?? REFRESH_DEFAULTS.maxStallMs;
    this.setTimer = opts.setTimer ?? ((cb, ms) => setTimeout(cb, ms));
    this.clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as never));
    this.now = opts.now ?? (() => Date.now());
  }

  get hasPending(): boolean {
    return this.pending !== null;
  }

  get isScrolling(): boolean {
    return this.scrolling;
  }

  /** Record a dirty signal. Cheap — safe to call per tick. */
  request(kind: RefreshKind): void {
    if (this.disposed) return;
    if (this.pending === null) {
      this.pending = kind;
      this.pendingSince = this.now();
    } else if (kind === 'purge') {
      // A purge subsumes any pending surgical refresh.
      this.pending = 'purge';
    }
    this.schedule();
  }

  /**
   * Called on grid scroll. Re-arms the settle window, so continuous scrolling
   * keeps deferring — bounded by `maxStallMs`.
   */
  onScroll(): void {
    if (this.disposed) return;
    this.scrolling = true;
    this.schedule();
  }

  /** Force any pending refresh out now (test hook / teardown drain). */
  flushNow(): void {
    if (this.disposed) return;
    this.cancel();
    const kind = this.pending;
    this.pending = null;
    if (kind === null) return;
    // Stall-ceiling flushes fire while the drag is still in motion; the
    // settle-timer path clears `scrolling` before calling here.
    const midScroll = this.scrolling;
    this.lastFlushAt = this.now();
    this.scrolling = false;
    this.flushFn(kind, midScroll);
  }

  dispose(): void {
    this.disposed = true;
    this.cancel();
    this.pending = null;
  }

  private schedule(): void {
    if (this.pending === null || this.disposed) return;

    const now = this.now();
    const stalledFor = now - this.pendingSince;
    if (stalledFor >= this.maxStallMs) {
      // Staleness ceiling wins over scroll smoothness.
      this.flushNow();
      return;
    }

    const sinceFlush = now - this.lastFlushAt;
    const wait = this.scrolling
      ? this.scrollSettleMs
      : Math.max(0, this.minIntervalMs - sinceFlush);

    // Deadline moved further out (still scrolling) — re-arm rather than let an
    // earlier timer fire mid-drag.
    this.cancel();
    this.timer = this.setTimer(() => {
      this.timer = null;
      if (this.scrolling) {
        // No scroll event since the settle window opened ⇒ motion has stopped.
        this.scrolling = false;
      }
      this.flushNow();
    }, Math.min(wait, this.maxStallMs - stalledFor));
  }

  private cancel(): void {
    if (this.timer === null) return;
    this.clearTimer(this.timer);
    this.timer = null;
  }
}
