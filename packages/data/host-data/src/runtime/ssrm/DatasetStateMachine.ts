/**
 * DatasetStateMachine — the worker-owned dataset lifecycle.
 *
 *   connecting ──dialed──────────► seeding(rowCount 0)
 *   seeding    ──snapshotBatch──► seeding(rowCount + n)
 *   seeding    ──snapshotEnd────► rowCount > 0 ? live : empty
 *   empty      ──liveRows───────► live   (late upstream rows resolve
 *                                         the 0-row ambiguity forward)
 *   any        ──streamError────► error(detail)
 *   any        ──restart────────► generation+1, connecting
 *
 * Design rules (docs/SSRM_PROVIDER_V2_DESIGN.md):
 *
 * • **Pure + injectable.** No timers, no IO — every method is a
 *   synchronous transition; the single side channel is the
 *   `onTransition` callback invoked AFTER internal state settles.
 *
 * • **One generation token.** `restart()` bumps it; every transport
 *   event carries the generation of the session that produced it and
 *   is DROPPED on mismatch (returns `false`). This designs out the
 *   restart-adoption race: a torn-down session's in-flight callbacks
 *   can never corrupt the new generation's state.
 *
 * • **Configure-vs-seed ordering.** A snapshot batch may beat the
 *   `dialed` bookkeeping through async seams (subscribe callback vs.
 *   publish accounting). A batch in `connecting` therefore implies the
 *   dial: it transitions to `seeding` and counts.
 *
 * • **0-rows ambiguity.** `snapshotEnd` at rowCount 0 is `empty`,
 *   never `live(0)` — consumers can distinguish "an empty book" from
 *   "no answer yet" without heuristics.
 */

import type { DatasetPhase, DatasetStateSnapshot } from './types.js';

export type DatasetStateListener = (state: DatasetStateSnapshot) => void;

export class DatasetStateMachine {
  private phase: DatasetPhase = 'connecting';
  private rowCount = 0;
  private gen = 1;
  private errorDetail: string | undefined;
  private readonly onTransition: DatasetStateListener | undefined;

  constructor(onTransition?: DatasetStateListener) {
    this.onTransition = onTransition;
  }

  get generation(): number {
    return this.gen;
  }

  get state(): DatasetStateSnapshot {
    const snapshot: DatasetStateSnapshot = {
      phase: this.phase,
      rowCount: this.rowCount,
      generation: this.gen,
    };
    if (this.errorDetail !== undefined) snapshot.error = this.errorDetail;
    return snapshot;
  }

  /**
   * Begin a new generation: bump THE token, reset to `connecting`.
   * The only event without a generation stamp — it mints the next one.
   * Returns the new generation for the caller to stamp its new session.
   */
  restart(): number {
    this.gen += 1;
    this.phase = 'connecting';
    this.rowCount = 0;
    this.errorDetail = undefined;
    this.emit();
    return this.gen;
  }

  /** Broker session established + snapshot requested → `seeding`. */
  dialed(generation: number): boolean {
    if (!this.accepts(generation)) return false;
    if (this.phase !== 'connecting') return false; // late duplicate — seed already progressed
    this.phase = 'seeding';
    this.rowCount = 0;
    this.emit();
    return true;
  }

  /**
   * Snapshot batch of `rows` rows arrived. Accepted in `seeding` and —
   * the configure-vs-seed ordering race — in `connecting`, where it
   * implies the dial.
   */
  snapshotBatch(generation: number, rows: number): boolean {
    if (!this.accepts(generation)) return false;
    if (this.phase !== 'seeding' && this.phase !== 'connecting') return false;
    this.phase = 'seeding';
    this.rowCount += rows;
    this.emit();
    return true;
  }

  /**
   * End-of-snapshot token. `seeding` with rows → `live`; zero rows
   * (including an end token that beat any batch, i.e. still
   * `connecting`) → `empty`.
   */
  snapshotEnd(generation: number): boolean {
    if (!this.accepts(generation)) return false;
    if (this.phase !== 'seeding' && this.phase !== 'connecting') return false;
    this.phase = this.rowCount > 0 ? 'live' : 'empty';
    this.emit();
    return true;
  }

  /**
   * Live activity for this generation. In `empty`, upstream rows
   * appearing after a 0-row seed promote the dataset to `live`; in
   * `live`, an optional `tableRowCount` refresh (read from the table,
   * the source of truth) updates the published count. No-op elsewhere.
   */
  liveRows(generation: number, tableRowCount?: number): boolean {
    if (!this.accepts(generation)) return false;
    if (this.phase === 'empty') {
      this.phase = 'live';
      if (tableRowCount !== undefined) this.rowCount = tableRowCount;
      this.emit();
      return true;
    }
    if (this.phase === 'live' && tableRowCount !== undefined && tableRowCount !== this.rowCount) {
      this.rowCount = tableRowCount;
      this.emit();
      return true;
    }
    return false;
  }

  /** Transport/ingest failure — terminal for this generation; `restart()` recovers. */
  streamError(generation: number, detail: string): boolean {
    if (!this.accepts(generation)) return false; // also latches: first error wins
    this.phase = 'error';
    this.errorDetail = detail;
    this.emit();
    return true;
  }

  /** Generation fence + error latch: stale or post-error events are dropped. */
  private accepts(generation: number): boolean {
    if (generation !== this.gen) return false;
    if (this.phase === 'error') return false;
    return true;
  }

  private emit(): void {
    this.onTransition?.(this.state);
  }
}
