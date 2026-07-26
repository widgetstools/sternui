import { describe, expect, it } from 'vitest';
import { TableWriter, type SsrmRow, type SsrmTableSurface } from './TableWriter.js';

type Op =
  | { op: 'clear' }
  | { op: 'update'; rows: SsrmRow[] };

/**
 * Fake table with manual write release — each update/clear parks until
 * `release()` so tests can interleave enqueues with in-flight writes.
 */
function fakeTable(opts: { manual?: boolean } = {}) {
  const ops: Op[] = [];
  const releases: Array<() => void> = [];
  const gate = () =>
    opts.manual
      ? new Promise<void>((resolve) => releases.push(resolve))
      : Promise.resolve();
  const table: SsrmTableSurface = {
    clear: async () => {
      await gate();
      ops.push({ op: 'clear' });
    },
    update: async (rows) => {
      await gate();
      ops.push({ op: 'update', rows: rows.slice() });
    },
    size: async () => {
      let count = 0;
      const keys = new Set<unknown>();
      for (const op of ops) {
        if (op.op === 'clear') keys.clear();
        else for (const row of op.rows) keys.add(row.id);
        count = keys.size;
      }
      return count;
    },
  };
  return {
    table,
    ops,
    release: () => releases.shift()?.(),
    releaseAll: () => {
      while (releases.length > 0) releases.shift()?.();
    },
  };
}

const rows = (...ids: number[]): SsrmRow[] => ids.map((id) => ({ id, v: id * 10 }));

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('TableWriter — pre-table buffer', () => {
  it('parks rows until the table exists, flushes once on attach, then drops the buffer', async () => {
    const { table, ops } = fakeTable();
    const writer = new TableWriter();
    writer.enqueue(1, rows(1, 2));
    writer.enqueue(1, rows(3));
    expect(writer.bufferedRowCount).toBe(3);
    await writer.attachTable(1, table);
    expect(ops).toEqual([{ op: 'update', rows: rows(1, 2, 3) }]);
    expect(writer.bufferedRowCount).toBe(0);
    // Post-attach rows go straight through — no re-buffering.
    writer.enqueue(1, rows(4));
    await writer.settled();
    expect(ops).toHaveLength(2);
  });

  it('bounded: overflow is a hard error and drops the shim, not a second book', async () => {
    const errors: Array<{ generation: number; error: unknown }> = [];
    const writer = new TableWriter({
      maxBufferedRows: 5,
      onError: (generation, error) => errors.push({ generation, error }),
    });
    writer.enqueue(1, rows(1, 2, 3));
    writer.enqueue(1, rows(4, 5, 6)); // 6 > 5 — overflow
    expect(errors).toHaveLength(1);
    expect(errors[0]!.generation).toBe(1);
    expect(String(errors[0]!.error)).toMatch(/buffer overflow/);
    expect(writer.bufferedRowCount).toBe(0);
    // Writer refuses further rows for the failed generation…
    writer.enqueue(1, rows(7));
    expect(writer.bufferedRowCount).toBe(0);
    // …but a restart (new generation) recovers.
    writer.beginGeneration(2);
    writer.enqueue(2, rows(8));
    expect(writer.bufferedRowCount).toBe(1);
  });
});

describe('TableWriter — ordered, coalesced writes', () => {
  it('serializes writes and coalesces rows that arrive while one is in-flight', async () => {
    const { table, ops, release, releaseAll } = fakeTable({ manual: true });
    const writer = new TableWriter();
    const attached = writer.attachTable(1, table);
    writer.enqueue(1, rows(1));
    await tick();
    // First update in-flight; these coalesce into ONE follow-up update.
    writer.enqueue(1, rows(2));
    writer.enqueue(1, rows(3, 4));
    release(); // finish update #1
    await tick();
    releaseAll();
    await attached;
    await writer.settled();
    expect(ops).toEqual([
      { op: 'update', rows: rows(1) },
      { op: 'update', rows: rows(2, 3, 4) },
    ]);
  });

  it('reports written row counts per generation', async () => {
    const writes: Array<{ generation: number; rows: number }> = [];
    const { table } = fakeTable();
    const writer = new TableWriter({ onWrite: (generation, n) => writes.push({ generation, rows: n }) });
    writer.enqueue(1, rows(1, 2));
    await writer.attachTable(1, table);
    writer.enqueue(1, rows(3));
    await writer.settled();
    expect(writes).toEqual([
      { generation: 1, rows: 2 },
      { generation: 1, rows: 1 },
    ]);
  });

  it('surfaces table write failures through onError with the generation', async () => {
    const errors: number[] = [];
    const failing: SsrmTableSurface = {
      clear: () => Promise.resolve(),
      update: () => Promise.reject(new Error('wasm oom')),
      size: () => Promise.resolve(0),
    };
    const writer = new TableWriter({ onError: (generation) => errors.push(generation) });
    writer.enqueue(1, rows(1));
    await writer.attachTable(1, failing);
    expect(errors).toEqual([1]);
  });
});

describe('TableWriter — restart adoption (generation fencing)', () => {
  it('drops stale-generation enqueues outright', async () => {
    const { table, ops } = fakeTable();
    const writer = new TableWriter();
    await writer.attachTable(1, table);
    writer.beginGeneration(2);
    writer.enqueue(1, rows(1)); // stale session still emitting
    await writer.settled();
    expect(ops).toEqual([{ op: 'clear' }]); // only the reseed clear — no stale write
  });

  it('a reseed on an attached table clears first, then writes the new seed in order', async () => {
    const { table, ops } = fakeTable();
    const writer = new TableWriter();
    writer.enqueue(1, rows(1, 2));
    await writer.attachTable(1, table);
    writer.beginGeneration(2);
    writer.enqueue(2, rows(9));
    await writer.settled();
    expect(ops).toEqual([
      { op: 'update', rows: rows(1, 2) },
      { op: 'clear' },
      { op: 'update', rows: rows(9) },
    ]);
    expect(await table.size()).toBe(1);
  });

  it('rows of the old generation already coalesced but not yet written are fenced out', async () => {
    const { table, ops, release, releaseAll } = fakeTable({ manual: true });
    const writer = new TableWriter();
    const attached = writer.attachTable(1, table);
    writer.enqueue(1, rows(1));
    await tick();
    writer.enqueue(1, rows(2)); // pending behind in-flight write #1
    writer.beginGeneration(2); // restart NOW — row 2 must never land
    release();
    await tick();
    releaseAll();
    await attached;
    await writer.settled();
    expect(ops).toEqual([
      { op: 'update', rows: rows(1) }, // in-flight write of gen 1 completes
      { op: 'clear' }, // gen 2 reseed
    ]);
  });

  it('pre-table buffer is fenced too: restart before attach discards parked rows', async () => {
    const { table, ops } = fakeTable();
    const writer = new TableWriter();
    writer.enqueue(1, rows(1, 2, 3));
    writer.beginGeneration(2);
    expect(writer.bufferedRowCount).toBe(0);
    writer.enqueue(2, rows(4));
    await writer.attachTable(2, table);
    expect(ops).toEqual([{ op: 'update', rows: rows(4) }]);
  });

  // ─── bounded writes + telemetry ───────────────────────────────────

  it('splits an oversized drain so reads can interleave', async () => {
    const { table, ops } = fakeTable();
    const writer = new TableWriter({ maxRowsPerWrite: 10 });
    await writer.attachTable(1, table);
    writer.enqueue(1, rows(...Array.from({ length: 25 }, (_, i) => i + 1)));
    await writer.settled();

    // 25 rows / bound 10 -> 3 writes, in order, covering every row once.
    expect(ops).toHaveLength(3);
    expect(ops.map((o) => (o.op === 'update' ? o.rows.length : 0))).toEqual([10, 10, 5]);
    const written = ops.flatMap((o) => (o.op === 'update' ? o.rows.map((r) => r.id) : []));
    expect(written).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
    expect(writer.getStats().chunkedWrites).toBe(1);
  });

  it('leaves ordinary batches on the single-write path', async () => {
    const { table, ops } = fakeTable();
    const writer = new TableWriter(); // default bound 25_000
    await writer.attachTable(1, table);
    writer.enqueue(1, rows(1, 2, 3));
    await writer.settled();
    expect(ops).toEqual([{ op: 'update', rows: rows(1, 2, 3) }]);
    expect(writer.getStats().chunkedWrites).toBe(0);
  });

  it('reports ingest telemetry', async () => {
    const { table } = fakeTable();
    const writer = new TableWriter();
    expect(writer.getStats().writes).toBe(0);
    await writer.attachTable(1, table);
    writer.enqueue(1, rows(1, 2, 3));
    await writer.settled();

    const stats = writer.getStats();
    expect(stats.writes).toBe(1);
    expect(stats.rowsWritten).toBe(3);
    expect(stats.pendingRows).toBe(0);
    expect(stats.bufferedRows).toBe(0);
    expect(stats.maxWriteMs).toBeGreaterThanOrEqual(0);
  });

  it('surfaces a growing backlog while a write is in flight', async () => {
    const { table, releaseAll } = fakeTable({ manual: true });
    const writer = new TableWriter();
    const attached = writer.attachTable(1, table);
    writer.enqueue(1, rows(1));
    await tick();
    // Rows arriving behind an in-flight write are the backlog signal.
    writer.enqueue(1, rows(2, 3, 4));
    expect(writer.getStats().pendingRows).toBe(3);

    // Each release only frees the writes gated SO FAR; draining the
    // backlog opens another one, so pump until it settles.
    for (let i = 0; i < 5 && writer.getStats().pendingRows > 0; i += 1) {
      releaseAll();
      await tick();
    }
    await attached;
    expect(writer.getStats().pendingRows).toBe(0);
  });

  it('attachTable for a superseded generation is a no-op', async () => {
    const { table, ops } = fakeTable();
    const writer = new TableWriter();
    writer.enqueue(1, rows(1));
    writer.beginGeneration(2);
    await writer.attachTable(1, table); // stale attach from gen 1's async table create
    expect(ops).toEqual([]);
  });
});
