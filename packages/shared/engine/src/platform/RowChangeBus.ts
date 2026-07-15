import type { AsyncTransactionsFlushedEvent, IRowNode, RowNodeTransaction } from 'ag-grid-community';
import type { ApiHub } from './ApiHub';
import type { RowChange, RowChangeSignal } from './types';

/**
 * The platform's single, shared, timer-coalesced row-change emitter.
 *
 * WHY THIS EXISTS — before this, alerts, conditional-styling, and the filter
 * counts each wired their OWN `modelUpdated` listener and walked EVERY row via
 * `forEachNode` on EVERY streaming tick (often synchronously). As features and
 * rules accumulated, those per-tick whole-grid scans stacked up and the main
 * thread spent its frames re-scanning unchanged rows — the grid (and every
 * other interaction sharing the thread) went sluggish.
 *
 * This bus listens ONCE per grid and:
 *   - reads the exact changed nodes from AG's `asyncTransactionsFlushed`
 *     event (what `applyTransactionAsync` produces every streaming flush), so
 *     subscribers can evaluate ONLY the rows that actually changed;
 *   - coalesces a burst of flushes/updates within one task into a single emit,
 *     so N transactions in a frame cost ONE subscriber pass;
 *   - marks structural changes (sort / filter / `setRowData`) as `full` so
 *     subscribers that need correctness fall back to a whole-grid pass — but
 *     only on those rare, user-driven events, never on the streaming hot path.
 *
 * Coalescing uses a 0ms timer, NOT `requestAnimationFrame`, on purpose: rAF is
 * suspended while a window/OpenFin view is hidden, which would silently pause
 * data-change ALERTS for a backgrounded grid (the old synchronous 'realtime'
 * path fired regardless of visibility). A timer keeps firing when hidden.
 *
 * Lifecycle: `start()` on grid-ready (api attached), `dispose()` on destroy.
 */
export class RowChangeBus implements RowChangeSignal {
  private readonly handlers = new Set<(change: RowChange) => void>();
  private disposers: Array<() => void> = [];
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private started = false;

  // Per-frame accumulation, keyed by row id so repeated touches dedupe.
  private readonly pendingAdded = new Map<string, IRowNode>();
  private readonly pendingUpdated = new Map<string, IRowNode>();
  private readonly pendingRemoved = new Map<string, IRowNode>();
  private sawFlush = false;
  private sawStructural = false;

  constructor(private readonly api: ApiHub) {}

  subscribe(fn: (change: RowChange) => void): () => void {
    this.handlers.add(fn);
    return () => this.handlers.delete(fn);
  }

  /**
   * SSRM / non-AG producers: push row deltas into the same coalesced pipeline
   * as `asyncTransactionsFlushed` so alerts & peers stay on the hot path.
   *
   * Arrow property so callers may pass `bus.publishExternalDelta` without
   * losing `this` (class methods are not auto-bound).
   */
  publishExternalDelta = (delta: {
    added?: ReadonlyArray<{ id: string; data?: Record<string, unknown> }>;
    updated?: ReadonlyArray<{ id: string; data?: Record<string, unknown> }>;
    removed?: ReadonlyArray<{ id: string; data?: Record<string, unknown> }>;
  }): void => {
    const toNode = (row: {
      id: string;
      data?: Record<string, unknown>;
    }): IRowNode => ({ id: row.id, data: row.data }) as IRowNode;

    for (const row of delta.updated ?? []) {
      this.track(this.pendingUpdated, toNode(row));
    }
    for (const row of delta.added ?? []) {
      this.track(this.pendingAdded, toNode(row));
    }
    for (const row of delta.removed ?? []) {
      this.track(this.pendingRemoved, toNode(row));
    }
    this.sawFlush = true;
    this.schedule();
  };

  /** Begin listening. Idempotent. Called by GridPlatform once the api attaches. */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.disposers.push(this.api.on('asyncTransactionsFlushed', (e) => this.onFlushed(e)));
    this.disposers.push(this.api.on('rowDataUpdated', () => this.onStructural()));
    this.disposers.push(this.api.on('modelUpdated', () => this.onStructural()));
  }

  /** Tear down listeners + any pending emit. Called by GridPlatform.destroy(). */
  dispose(): void {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    for (const d of this.disposers) {
      try { d(); } catch { /* ignore — per-disposer isolation */ }
    }
    this.disposers = [];
    this.handlers.clear();
    this.resetPending();
    this.started = false;
  }

  private onFlushed(event?: unknown): void {
    const results = (event as AsyncTransactionsFlushedEvent | undefined)?.results;
    if (Array.isArray(results)) {
      for (const result of results) {
        const tx = result as Partial<RowNodeTransaction>;
        if (tx.update) for (const node of tx.update) this.track(this.pendingUpdated, node);
        if (tx.add) for (const node of tx.add) this.track(this.pendingAdded, node);
        if (tx.remove) for (const node of tx.remove) this.track(this.pendingRemoved, node);
      }
    }
    this.sawFlush = true;
    this.schedule();
  }

  private onStructural(): void {
    // `modelUpdated` / `rowDataUpdated` fire after a flush too — only treat the
    // frame as a `full` (structural) change when NO flush carried a delta. A
    // pure sort / filter / setRowData lands here with no preceding flush.
    this.sawStructural = true;
    this.schedule();
  }

  private track(map: Map<string, IRowNode>, node: IRowNode): void {
    const id = node?.id;
    if (typeof id === 'string') map.set(id, node);
  }

  private schedule(): void {
    if (this.timerId !== null) return;
    this.timerId = setTimeout(() => {
      this.timerId = null;
      this.flush();
    }, 0);
  }

  private flush(): void {
    const full = this.sawStructural && !this.sawFlush;
    const change: RowChange = {
      added: [...this.pendingAdded.values()],
      updated: [...this.pendingUpdated.values()],
      removed: [...this.pendingRemoved.values()],
      full,
    };
    this.resetPending();
    if (this.handlers.size === 0) return;
    for (const fn of [...this.handlers]) {
      try { fn(change); } catch { /* isolate subscriber */ }
    }
  }

  private resetPending(): void {
    this.pendingAdded.clear();
    this.pendingUpdated.clear();
    this.pendingRemoved.clear();
    this.sawFlush = false;
    this.sawStructural = false;
  }
}
