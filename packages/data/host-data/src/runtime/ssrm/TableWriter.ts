/**
 * TableWriter — the frame→table path. Routes snapshot batches and live
 * ticks into the Perspective table through an injectable surface, with
 * exactly one transient buffer: rows that arrive BEFORE the table
 * exists are held (bounded) and flushed on `attachTable`, after which
 * the buffer is dropped — the table is the only repository.
 *
 * Guarantees:
 *
 * • **Ordered writes.** All table calls are serialized on an internal
 *   promise chain; a batch never overtakes the one before it.
 *
 * • **Backpressure conflation.** Rows enqueued while a write is
 *   in-flight coalesce into a single `update` on drain (order
 *   preserved; keyed upsert makes the merge equivalent).
 *
 * • **Generation fencing.** Every enqueue is stamped; `beginGeneration`
 *   fences — rows and in-flight flushes from older generations are
 *   discarded, never written. The new generation's first write is a
 *   `clear()` when a table is attached, so a reseed atomically starts
 *   from an empty book without dropping the table identity windows
 *   hold open.
 *
 * • **Bounded pre-table buffer.** Overflow (table creation stalled or
 *   failed) is a hard error surfaced via `onError` — the buffer must
 *   never grow into a second copy of the book.
 */

export type SsrmRow = Record<string, unknown>;

/** Injectable table surface — the real one wraps a Perspective Table. */
export interface SsrmTableSurface {
  /** Remove all rows (start of a reseed). */
  clear(): Promise<void>;
  /** Keyed (indexed) upsert of row objects. */
  update(rows: readonly SsrmRow[]): Promise<void>;
  /** Current row count — the authoritative book size. */
  size(): Promise<number>;
}

export interface TableWriterOpts {
  /** Pre-table buffer bound (rows). Default 100_000. */
  maxBufferedRows?: number;
  /** Write/overflow failures (stamped with the generation they hit). */
  onError?: (generation: number, error: unknown) => void;
  /** Fires after each successful table write with the written row count. */
  onWrite?: (generation: number, rows: number) => void;
  /**
   * Largest single `table.update()` this writer will issue. A drain
   * bigger than this is split, yielding the worker between chunks.
   *
   * This bounds WRITE LATENCY, not total work: one 100k-row write pins
   * the thread for its whole duration, and every window read queues
   * behind it. Chunking lets reads interleave, which is what keeps a
   * grid responsive while a snapshot lands.
   *
   * Default 25_000 — high enough that ordinary live ticks (hundreds of
   * rows) take exactly the same single-write path as before, so this is
   * inert outside seeding and burst catch-up.
   */
  maxRowsPerWrite?: number;
}

/** Ingest counters for backpressure telemetry — monotonic within a generation. */
export interface TableWriterStats {
  /** Rows waiting for the next drain. Sustained growth = falling behind. */
  pendingRows: number;
  /** Rows still parked pre-table (the table has not been created yet). */
  bufferedRows: number;
  /** `table.update()` calls issued. */
  writes: number;
  /** Rows written. */
  rowsWritten: number;
  /** Duration of the most recent write. */
  lastWriteMs: number;
  /** Slowest single write seen — the tail that stalls reads. */
  maxWriteMs: number;
  /** Drains split because they exceeded `maxRowsPerWrite`. */
  chunkedWrites: number;
}

const DEFAULT_MAX_BUFFERED_ROWS = 100_000;
const DEFAULT_MAX_ROWS_PER_WRITE = 25_000;

export class TableWriter {
  private readonly maxBufferedRows: number;
  private readonly onError: ((generation: number, error: unknown) => void) | undefined;
  private readonly onWrite: ((generation: number, rows: number) => void) | undefined;

  private generation = 1;
  private table: SsrmTableSurface | null = null;
  /** Pre-table shim only; dropped (nulled) once the table attaches. */
  private buffer: SsrmRow[] | null = [];
  private overflowed = false;

  /** Rows awaiting the next drain (table attached, write in-flight). */
  private pending: SsrmRow[] = [];
  private chain: Promise<void> = Promise.resolve();
  private draining = false;

  private readonly maxRowsPerWrite: number;
  private readonly stats: TableWriterStats = {
    pendingRows: 0,
    bufferedRows: 0,
    writes: 0,
    rowsWritten: 0,
    lastWriteMs: 0,
    maxWriteMs: 0,
    chunkedWrites: 0,
  };

  constructor(opts: TableWriterOpts = {}) {
    this.maxBufferedRows = opts.maxBufferedRows ?? DEFAULT_MAX_BUFFERED_ROWS;
    this.maxRowsPerWrite = Math.max(1, opts.maxRowsPerWrite ?? DEFAULT_MAX_ROWS_PER_WRITE);
    this.onError = opts.onError;
    this.onWrite = opts.onWrite;
  }

  /** Ingest telemetry — surface it; a growing `pendingRows` is the warning. */
  getStats(): TableWriterStats {
    return {
      ...this.stats,
      pendingRows: this.pending.length,
      bufferedRows: this.buffer?.length ?? 0,
    };
  }

  get currentGeneration(): number {
    return this.generation;
  }

  /** True while rows are parked pre-table (diagnostics/tests). */
  get bufferedRowCount(): number {
    return this.buffer?.length ?? 0;
  }

  /**
   * Fence to a new generation. Pending/buffered rows from older
   * generations are discarded; if a table is attached its next
   * serialized operation is a `clear()` so the reseed starts empty.
   */
  beginGeneration(generation: number): void {
    this.generation = generation;
    this.pending = [];
    this.overflowed = false;
    if (this.table) {
      const table = this.table;
      this.enqueueOp(generation, () => table.clear());
    } else {
      this.buffer = [];
    }
  }

  /** Route rows (snapshot batch or live tick — both keyed upserts). */
  enqueue(generation: number, rows: readonly SsrmRow[]): void {
    if (generation !== this.generation || rows.length === 0 || this.overflowed) return;
    if (this.table) {
      this.pending.push(...rows);
      this.scheduleDrain(generation);
      return;
    }
    const buffer = this.buffer ?? (this.buffer = []);
    if (buffer.length + rows.length > this.maxBufferedRows) {
      this.overflowed = true;
      this.buffer = [];
      this.onError?.(
        generation,
        new Error(
          `[ssrm] pre-table buffer overflow (> ${this.maxBufferedRows} rows) — table was never attached`,
        ),
      );
      return;
    }
    buffer.push(...rows);
  }

  /**
   * The table now exists for `generation`: flush the pre-table buffer
   * into it (one keyed update) and drop the buffer for good. Resolves
   * when the flush has been written.
   */
  attachTable(generation: number, table: SsrmTableSurface): Promise<void> {
    if (generation !== this.generation) return Promise.resolve();
    this.table = table;
    const parked = this.buffer;
    this.buffer = null; // the table is the only repository from here on
    if (parked && parked.length > 0) this.pending.unshift(...parked);
    this.scheduleDrain(generation);
    return this.settled();
  }

  /** Resolves when every write enqueued so far has settled. */
  settled(): Promise<void> {
    return this.chain;
  }

  private scheduleDrain(generation: number): void {
    if (this.draining || !this.table || this.pending.length === 0) return;
    this.draining = true;
    this.enqueueOp(generation, async () => {
      // Coalesce everything that accumulated while we waited our turn.
      const rows = this.pending;
      this.pending = [];
      this.draining = false;
      if (generation !== this.generation || rows.length === 0) return;
      // Bounded writes: a drain larger than `maxRowsPerWrite` is split so
      // window reads can interleave instead of queueing behind one long
      // update. Ordinary ticks are far below the bound and take the
      // identical single-write path.
      if (rows.length > this.maxRowsPerWrite) this.stats.chunkedWrites += 1;
      for (let offset = 0; offset < rows.length; offset += this.maxRowsPerWrite) {
        if (generation !== this.generation) return; // fenced mid-drain
        const chunk =
          rows.length <= this.maxRowsPerWrite
            ? rows
            : rows.slice(offset, offset + this.maxRowsPerWrite);
        const started = Date.now();
        await this.table!.update(chunk);
        const elapsed = Date.now() - started;
        this.stats.writes += 1;
        this.stats.rowsWritten += chunk.length;
        this.stats.lastWriteMs = elapsed;
        if (elapsed > this.stats.maxWriteMs) this.stats.maxWriteMs = elapsed;
        this.onWrite?.(generation, chunk.length);
      }
      // Rows may have landed while the update was in-flight.
      this.scheduleDrain(this.generation);
    });
  }

  /** Serialize an operation; stale-generation ops become no-ops. */
  private enqueueOp(generation: number, op: () => Promise<void>): void {
    this.chain = this.chain.then(async () => {
      if (generation !== this.generation) {
        this.draining = false;
        return;
      }
      try {
        await op();
      } catch (err) {
        this.draining = false;
        this.onError?.(generation, err);
      }
    });
  }
}
