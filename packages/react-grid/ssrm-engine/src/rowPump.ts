/**
 * Turn a stream of pushed patches into AG transactions the frame can afford.
 *
 * Two things stand between "the worker sent a delta" and "the grid is correct",
 * and both were flagged as worth porting in the July engine evaluation and
 * never done:
 *
 *   1. **Conflation keyed by row id.** A book fed by a provider emits many
 *      small frames per second, and the same row can appear in several of them
 *      before the browser paints once. Applying each frame is N transactions
 *      and N re-renders for one visible change. Merging them by key first makes
 *      it one, and it is a MERGE rather than a replace because the patches are
 *      sparse: a frame naming `bid` and a frame naming `ask` are two cells of
 *      the same row, not two versions of it.
 *   2. **A time slice.** A snapshot-sized frame arriving at once is a
 *      transaction big enough to drop frames on its own. `sliceBudgetMs` caps
 *      what one flush spends; the remainder stays conflated and goes out on the
 *      next one, so a burst degrades into latency rather than into a stall.
 *
 * ## What it deliberately does not do
 *
 * It does not fetch. A patch for a row the grid does not hold is DROPPED, not
 * turned into a read: AG's server row model ignores a transaction for a row
 * outside its block cache, so building one is wasted work, and asking the
 * engine for it would invent a fetch the user never scrolled to. That is
 * counted (`dropped`) rather than hidden, because a `dropped` that dwarfs
 * `applied` means the worker is pushing rows nobody is looking at — which is
 * what the per-subscriber viewport exists to fix.
 *
 * The grid is structural, not `GridApi`: this package holds no AG Grid import,
 * and the pump is testable against three methods and no grid at all.
 */
import type { SsrmRow } from './types.js';

/** The slice of AG's `GridApi` this needs. */
export interface SsrmRowPumpGrid {
  getRowNode(id: string): { data?: unknown } | null | undefined;
  applyServerSideTransaction(tx: { update?: unknown[]; remove?: unknown[] }): unknown;
  isDestroyed?(): boolean;
}

export interface SsrmRowPumpOptions {
  /** Field carrying the row key — the same one `getRowId` is built on. */
  keyField: string;
  /**
   * Ceiling on one flush. 0 spends whatever a full flush costs.
   *
   * 4 ms by default: a third of a 60 Hz frame, leaving the rest for the layout
   * and paint the transaction causes. It bounds the pump's own work, not AG's
   * — a transaction handed over inside the budget can still cost more to render
   * than the budget allowed to build it.
   */
  sliceBudgetMs?: number;
  /**
   * When to flush. Defaults to `requestAnimationFrame`, falling back to a
   * timer — a hidden tab has no frames, and a pump that only ran on one would
   * accumulate forever in a background blotter.
   */
  schedule?(run: () => void): void;
  onFlush?(stats: SsrmRowPumpFlush): void;
}

export interface SsrmRowPumpFlush {
  /** Rows handed to AG in this flush. */
  applied: number;
  /** Rows still conflated, waiting for the next one. */
  pending: number;
  /** Rows dropped because the grid does not hold them. */
  dropped: number;
  ms: number;
}

export interface SsrmRowPumpStats {
  /** Patch rows received, before conflation. */
  received: number;
  applied: number;
  dropped: number;
  removed: number;
  flushes: number;
  pending: number;
  /** Largest backlog ever held. A rising one means the slice is too small. */
  maxPending: number;
  /** Flushes that hit `sliceBudgetMs` and deferred the rest. */
  sliced: number;
}

export interface SsrmRowPump {
  /** A delta as the worker pushed it. Sparse rows, plus removed keys. */
  push(delta: { rows: readonly SsrmRow[]; removed?: readonly unknown[] }): void;
  /** Apply everything now, budget ignored. For a test, or a settled surface. */
  flushNow(): void;
  stats(): SsrmRowPumpStats;
  dispose(): void;
}

function defaultSchedule(run: () => void): void {
  const raf = (globalThis as { requestAnimationFrame?: (cb: () => void) => number })
    .requestAnimationFrame;
  if (typeof raf === 'function') raf(run);
  else setTimeout(run, 16);
}

function now(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}

export function createSsrmRowPump(
  grid: SsrmRowPumpGrid,
  options: SsrmRowPumpOptions,
): SsrmRowPump {
  const { keyField } = options;
  const budgetMs = options.sliceBudgetMs ?? 4;
  const schedule = options.schedule ?? defaultSchedule;

  /** Conflated patches, insertion-ordered so the oldest row flushes first. */
  const pending = new Map<string, SsrmRow>();
  const removing = new Set<unknown>();
  let scheduled = false;
  let disposed = false;
  const stats: SsrmRowPumpStats = {
    received: 0,
    applied: 0,
    dropped: 0,
    removed: 0,
    flushes: 0,
    pending: 0,
    maxPending: 0,
    sliced: 0,
  };

  const flush = (unbounded: boolean): void => {
    scheduled = false;
    if (disposed) return;
    if (grid.isDestroyed?.() === true) {
      pending.clear();
      removing.clear();
      return;
    }
    if (pending.size === 0 && removing.size === 0) return;

    const started = now();
    let applied = 0;
    let dropped = 0;

    // Removals first and whole. A row that left the book must leave every
    // window that holds it, and deferring one under a budget would leave a
    // deleted row on screen for as long as the backlog lasts.
    let remove: unknown[] | undefined;
    if (removing.size > 0) {
      remove = [...removing];
      removing.clear();
      stats.removed += remove.length;
    }

    const update: unknown[] = [];
    for (const [id, patch] of pending) {
      const node = grid.getRowNode(id);
      pending.delete(id);
      if (!node?.data) {
        dropped += 1;
        continue;
      }
      update.push({ ...(node.data as SsrmRow), ...patch });
      applied += 1;
      // Checked per row rather than per batch: the whole point is to stop
      // partway, and a check that only runs at the end never can.
      if (!unbounded && budgetMs > 0 && now() - started >= budgetMs) {
        stats.sliced += 1;
        break;
      }
    }

    if (update.length > 0 || remove !== undefined) {
      grid.applyServerSideTransaction({
        ...(update.length > 0 ? { update } : {}),
        ...(remove !== undefined ? { remove } : {}),
      });
    }

    stats.applied += applied;
    stats.dropped += dropped;
    stats.flushes += 1;
    stats.pending = pending.size;
    const ms = now() - started;
    options.onFlush?.({ applied, pending: pending.size, dropped, ms });

    // Whatever the budget left behind has to be picked up by a flush that is
    // scheduled now — nothing else will arrive to trigger one if the feed goes
    // quiet, and a backlog nobody drains is a grid that stopped updating.
    if (pending.size > 0 || removing.size > 0) ensureScheduled();
  };

  function ensureScheduled(): void {
    if (scheduled || disposed) return;
    scheduled = true;
    schedule(() => flush(false));
  }

  return {
    push(delta) {
      if (disposed) return;
      for (const key of delta.removed ?? []) {
        removing.add(key);
        // A row removed after a pending update is removed, not updated. The
        // reverse case — re-added after a removal — is handled below.
        pending.delete(String(key));
      }
      for (const row of delta.rows) {
        const raw = row[keyField];
        if (raw === undefined || raw === null) continue;
        const id = String(raw);
        removing.delete(raw);
        stats.received += 1;
        const held = pending.get(id);
        // MERGE, not replace: two frames naming different columns of one row
        // are two cells, and taking the later frame whole would discard the
        // earlier cell.
        if (held === undefined) pending.set(id, { ...row });
        else Object.assign(held, row);
      }
      if (pending.size > stats.maxPending) stats.maxPending = pending.size;
      if (pending.size > 0 || removing.size > 0) ensureScheduled();
    },

    flushNow() {
      flush(true);
    },

    stats: () => ({ ...stats, pending: pending.size }),

    dispose() {
      disposed = true;
      pending.clear();
      removing.clear();
    },
  };
}
