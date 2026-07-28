import { describe, expect, it, vi } from 'vitest';
import {
  createPerspectiveTableFeed,
  type FeedDiagnostic,
  type FeedTable,
} from './perspectiveTableFeed.js';
import type { PerspectiveSchema } from './perspectiveSchema.js';

function makeHarness(overrides: Partial<Parameters<typeof createPerspectiveTableFeed>[0]> = {}) {
  const updates: unknown[][] = [];
  const created: { schema: PerspectiveSchema; index: string }[] = [];
  const diagnostics: FeedDiagnostic[] = [];
  let deleted = 0;
  let cleared = 0;

  const table: FeedTable = {
    update: vi.fn(async (rows) => {
      updates.push([...rows]);
    }),
    clear: vi.fn(async () => {
      cleared += 1;
    }),
    delete: vi.fn(async () => {
      deleted += 1;
    }),
  };

  const feed = createPerspectiveTableFeed({
    keyColumn: 'positionId',
    createTable: vi.fn(async (schema, index) => {
      created.push({ schema, index });
      return table;
    }),
    onDiagnostic: (d) => diagnostics.push(d),
    ...overrides,
  });

  const downstream = vi.fn();
  const emit = feed.tap(downstream);

  return {
    feed,
    emit,
    downstream,
    updates,
    created,
    diagnostics,
    table,
    get deleted() {
      return deleted;
    },
    get cleared() {
      return cleared;
    },
  };
}

const snapshotRows = (n: number, from = 0) =>
  Array.from({ length: n }, (_, i) => ({
    positionId: `p${from + i}`,
    pnl: (from + i) * 1.5,
    cusip: 'ABC',
  }));

describe('createPerspectiveTableFeed — pass-through', () => {
  it('forwards every event untouched, so the push path is unchanged', async () => {
    const h = makeHarness();
    const events = [
      { rows: snapshotRows(2), replace: true },
      { rowsReceived: 2 },
      { status: 'ready' as const },
      { byteSize: 10 },
    ];
    for (const e of events) h.emit(e);

    expect(h.downstream.mock.calls.map((c) => c[0])).toEqual(events);
    await h.feed.drain();
  });

  it('forwards synchronously — the hub must never wait on the Table', () => {
    const h = makeHarness({
      // A createTable that never settles would stall any awaited path.
      createTable: () => new Promise<FeedTable>(() => {}),
    });
    h.emit({ rows: snapshotRows(1), replace: true });
    h.emit({ status: 'ready' });

    expect(h.downstream).toHaveBeenCalledTimes(2);
  });
});

describe('createPerspectiveTableFeed — building the Table', () => {
  it('buffers the snapshot and builds on ready, not on the first chunk', async () => {
    const h = makeHarness();

    // Real transport shape: only chunk 0 is flagged.
    h.emit({ rows: snapshotRows(50), replace: true });
    h.emit({ rows: snapshotRows(50, 50) });
    // A schema derived from chunk 0 alone can be wrong: one row in 20,000
    // decides a column's type against the real feed.
    expect(h.created).toHaveLength(0);
    expect(h.feed.buffered).toBe(100);

    h.emit({ status: 'ready' });
    await h.feed.drain();

    expect(h.created).toHaveLength(1);
    expect(h.created[0].index).toBe('positionId');
    expect(h.updates[0]).toHaveLength(100);
    expect(h.feed.buffered).toBe(0);
  });

  it('derives the schema from every buffered chunk, not just the first', async () => {
    const h = makeHarness();
    // `extra` only appears in the second chunk; a first-chunk-only schema
    // would drop it and `update()` would silently ignore it forever.
    h.emit({ rows: [{ positionId: 'p1', pnl: 1 }], replace: true });
    h.emit({ rows: [{ positionId: 'p2', pnl: 2, extra: 'x' }] });
    h.emit({ status: 'ready' });
    await h.feed.drain();

    expect(Object.keys(h.created[0].schema).sort()).toEqual(['extra', 'pnl', 'positionId']);
  });

  it('builds without a ready once buffered rows reach the threshold', async () => {
    // A provider with no end token cannot tell snapshot from live and emits
    // everything as deltas; without this the Table would never be built.
    const h = makeHarness({ buildAfterRows: 10 });
    h.emit({ rows: snapshotRows(10) });
    await h.feed.drain();

    expect(h.created).toHaveLength(1);
    expect(h.updates[0]).toHaveLength(10);
  });

  // MEASURED against the real transport: only the FIRST snapshot chunk carries
  // `replace: true` — every chunk after it rides as a plain `{rows}` delta.
  it('buffers the unflagged chunks that follow the first, and builds from all of them', async () => {
    const h = makeHarness();
    h.emit({ rows: [], replace: true }); // the empty clear that opens a snapshot
    h.emit({ rows: snapshotRows(10), replace: true }); // chunk 0
    h.emit({ rows: snapshotRows(10, 10) }); // chunk 1 — NOT flagged
    h.emit({ rows: snapshotRows(10, 20) }); // chunk 2 — NOT flagged
    h.emit({ status: 'ready' });
    await h.feed.drain();

    expect(h.created).toHaveLength(1);
    expect(h.updates[0]).toHaveLength(30);
  });

  it('does not build early mid-snapshot, which would derive the schema from a partial book', async () => {
    // Once a `replace` has been seen a snapshot IS in progress, so the row
    // threshold must not fire: a column that is all-null in the first chunks
    // would be typed `string`, and one that turns out nested silently dropped.
    const h = makeHarness({ buildAfterRows: 10 });
    h.emit({ rows: snapshotRows(10), replace: true });
    h.emit({ rows: snapshotRows(10, 10) });
    await h.feed.drain();
    expect(h.created).toHaveLength(0);

    h.emit({ status: 'ready' });
    await h.feed.drain();
    expect(h.updates[0]).toHaveLength(20);
  });

  it('resolves whenReady with the loaded Table', async () => {
    const h = makeHarness();
    h.emit({ rows: snapshotRows(3), replace: true });
    h.emit({ status: 'ready' });

    await expect(h.feed.whenReady()).resolves.toBe(h.table);
  });

  it('does nothing on ready when no rows ever arrived', async () => {
    const h = makeHarness();
    h.emit({ status: 'ready' });
    await h.feed.drain();

    expect(h.created).toHaveLength(0);
  });
});

describe('createPerspectiveTableFeed — live deltas', () => {
  it('applies a whole frame in ONE update call', async () => {
    const h = makeHarness();
    h.emit({ rows: snapshotRows(5), replace: true });
    h.emit({ status: 'ready' });
    await h.feed.drain();

    // Per-row updates measured ~0.7ms each against the real engine; the feed
    // sends ~100 rows per frame.
    h.emit({ rows: [{ positionId: 'p1', pnl: 9 }, { positionId: 'p2', pnl: 8 }] });
    await h.feed.drain();

    expect(h.updates[1]).toEqual([
      { positionId: 'p1', pnl: 9 },
      { positionId: 'p2', pnl: 8 },
    ]);
  });

  it('keeps deltas behind the snapshot load, never overtaking it', async () => {
    let releaseLoad: (() => void) | null = null;
    const order: string[] = [];
    const table: FeedTable = {
      update: vi.fn(async (rows) => {
        const label = rows.length === 5 ? 'snapshot' : 'delta';
        if (label === 'snapshot') {
          await new Promise<void>((resolve) => {
            releaseLoad = resolve;
          });
        }
        order.push(label);
      }),
    };
    const h = makeHarness({ createTable: async () => table });

    h.emit({ rows: snapshotRows(5), replace: true });
    h.emit({ status: 'ready' });
    await Promise.resolve();
    await Promise.resolve();
    // Delta arrives while the snapshot load is still in flight.
    h.emit({ rows: [{ positionId: 'p1', pnl: 99 }] });
    releaseLoad?.();
    await h.feed.drain();

    // Reversed, the delta would be overwritten by the snapshot behind it.
    expect(order).toEqual(['snapshot', 'delta']);
  });

  it('buffers live rows that arrive before the Table exists', async () => {
    const h = makeHarness();
    h.emit({ rows: snapshotRows(2), replace: true });
    h.emit({ rows: [{ positionId: 'p9', pnl: 1 }] });
    h.emit({ status: 'ready' });
    await h.feed.drain();

    expect(h.updates[0]).toHaveLength(3);
  });

  it('reports columns the schema does not have, which update() would ignore', async () => {
    const h = makeHarness();
    h.emit({ rows: snapshotRows(2), replace: true });
    h.emit({ status: 'ready' });
    await h.feed.drain();

    h.emit({ rows: [{ positionId: 'p1', brandNew: 5 }] });
    await h.feed.drain();

    expect(h.diagnostics).toContainEqual({ kind: 'unknown-columns', columns: ['brandNew'] });
  });
});

describe('createPerspectiveTableFeed — restart', () => {
  it('drops and rebuilds the Table when the book is re-sent', async () => {
    const h = makeHarness();
    h.emit({ rows: snapshotRows(3), replace: true });
    h.emit({ status: 'ready' });
    await h.feed.drain();
    expect(h.created).toHaveLength(1);

    // A second `replace` is a restart. Upserting into the old Table would
    // leave rows that no longer exist upstream sitting in the book.
    h.emit({ rows: snapshotRows(2, 100), replace: true });
    h.emit({ status: 'ready' });
    await h.feed.drain();

    expect(h.created).toHaveLength(2);
    expect(h.deleted).toBe(1);
    expect(h.updates.at(-1)).toHaveLength(2);
  });

  it('drops the Table on an EMPTY replace — the only signal when the new book is empty', async () => {
    const h = makeHarness();
    h.emit({ rows: snapshotRows(3), replace: true });
    h.emit({ status: 'ready' });
    await h.feed.drain();

    // The transport opens every snapshot with `emit({rows: [], replace: true})`.
    // Treating it as a no-op would leave a stale book on screen when the
    // restarted snapshot turns out to be empty.
    h.emit({ rows: [], replace: true });
    await h.feed.drain();

    expect(h.feed.table).toBeNull();
    expect(h.deleted).toBe(1);
  });

  it('discards rows buffered for a snapshot that gets restarted mid-flight', async () => {
    const h = makeHarness();
    h.emit({ rows: snapshotRows(5), replace: true });
    h.emit({ status: 'ready' });
    await h.feed.drain();

    h.emit({ rows: snapshotRows(3, 50), replace: true });
    h.emit({ rows: snapshotRows(2, 60) });
    // A second restart lands before the first finished: the half-buffered
    // book must not be merged into the new one.
    h.emit({ rows: snapshotRows(4, 90), replace: true });
    h.emit({ status: 'ready' });
    await h.feed.drain();

    expect(h.updates.at(-1)).toHaveLength(4);
  });
});

describe('createPerspectiveTableFeed — refusing to corrupt', () => {
  it('refuses to build when the index column is invalid', async () => {
    const h = makeHarness();
    // No positionId: without a valid index, update() appends instead of
    // upserting and every tick grows the book.
    h.emit({ rows: [{ other: 1 }, { other: 2 }], replace: true });
    h.emit({ status: 'ready' });
    await h.feed.drain();

    expect(h.created).toHaveLength(0);
    expect(h.diagnostics.some((d) => d.kind === 'index-invalid')).toBe(true);
  });

  it('refuses when the index is null in some rows', async () => {
    const h = makeHarness();
    h.emit({ rows: [{ positionId: 'p1' }, { positionId: null }], replace: true });
    h.emit({ status: 'ready' });
    await h.feed.drain();

    expect(h.created).toHaveLength(0);
  });

  it('reports a failed createTable instead of throwing into the emit path', async () => {
    const h = makeHarness({
      createTable: async () => {
        throw new Error('wasm not initialised');
      },
    });
    h.emit({ rows: snapshotRows(2), replace: true });
    h.emit({ status: 'ready' });
    await h.feed.drain();

    expect(h.diagnostics).toContainEqual({
      kind: 'error',
      stage: 'create',
      message: 'wasm not initialised',
    });
  });

  it('reports a failed update without breaking the queue', async () => {
    const table: FeedTable = {
      update: vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('borrowed'))
        .mockResolvedValue(undefined),
    };
    const h = makeHarness({ createTable: async () => table });
    h.emit({ rows: snapshotRows(2), replace: true });
    h.emit({ status: 'ready' });
    await h.feed.drain();

    h.emit({ rows: [{ positionId: 'p1' }] });
    await h.feed.drain();
    h.emit({ rows: [{ positionId: 'p2' }] });
    await h.feed.drain();

    expect(h.diagnostics.some((d) => d.kind === 'error' && d.message === 'borrowed')).toBe(true);
    // The queue survived: the third update still ran.
    expect(table.update).toHaveBeenCalledTimes(3);
  });

  it('reports the derived schema so a wrong type is visible, not silent', async () => {
    const h = makeHarness();
    h.emit({ rows: [{ positionId: 'p1', pnl: 1, nested: { a: 1 } }], replace: true });
    h.emit({ status: 'ready' });
    await h.feed.drain();

    const schemaDiag = h.diagnostics.find((d) => d.kind === 'schema');
    expect(schemaDiag).toMatchObject({ rows: 1, nested: ['nested'] });
  });
});

describe('createPerspectiveTableFeed — stop', () => {
  it('deletes the Table and ignores later events', async () => {
    const h = makeHarness();
    h.emit({ rows: snapshotRows(2), replace: true });
    h.emit({ status: 'ready' });
    await h.feed.drain();

    await h.feed.stop();
    expect(h.deleted).toBe(1);

    h.emit({ rows: [{ positionId: 'p1' }] });
    await h.feed.drain();
    expect(h.updates).toHaveLength(1);
  });
});

describe('createPerspectiveTableFeed — declared schema', () => {
  const declaredSchema = { positionId: 'string', pnl: 'float' } as const;

  // THE reason this exists: without it the Table cannot exist until the
  // snapshot completes (~18s measured), and a window has nothing to open, so
  // the blotter sits blank behind a spinner.
  it('creates the Table immediately, before a single row arrives', async () => {
    const h = makeHarness({ declaredSchema });
    await h.feed.drain();

    expect(h.created).toHaveLength(1);
    expect(h.created[0].schema).toEqual(declaredSchema);
    expect(h.created[0].index).toBe('positionId');
  });

  it('resolves whenReady without any rows', async () => {
    const h = makeHarness({ declaredSchema });
    await expect(h.feed.whenReady()).resolves.toBe(h.table);
  });

  it('fills the Table that already exists rather than building a second one', async () => {
    const h = makeHarness({ declaredSchema });
    await h.feed.drain();

    h.emit({ rows: snapshotRows(5), replace: true });
    h.emit({ status: 'ready' });
    await h.feed.drain();

    expect(h.created).toHaveLength(1);
    expect(h.updates.flat()).toHaveLength(5);
  });

  it('lands rows that arrived while the Table was still being created', async () => {
    const h = makeHarness({ declaredSchema });
    // No drain first: emit into the window where creation is still queued.
    h.emit({ rows: snapshotRows(3), replace: true });
    await h.feed.drain();

    expect(h.updates.flat()).toHaveLength(3);
  });

  it('CLEARS on a restart instead of recreating, so attached Views survive', async () => {
    const h = makeHarness({ declaredSchema });
    await h.feed.drain();
    h.emit({ rows: snapshotRows(2), replace: true }); // first book
    await h.feed.drain();

    // The schema is known independently of the data, so the Table itself
    // survives. `clear()` keeps the schema, the index and every registered
    // View — attached windows keep reading instead of watching their table
    // vanish for the length of a snapshot.
    h.emit({ rows: [], replace: true }); // restart
    await h.feed.drain();

    expect(h.created).toHaveLength(1);
    expect(h.deleted).toBe(0);
    expect(h.cleared).toBe(2); // one per `replace`
    expect(h.feed.table).not.toBeNull();
  });

  it('refuses a declared schema that lacks the index column', async () => {
    const h = makeHarness({ declaredSchema: { pnl: 'float' } as never });
    await h.feed.drain();

    expect(h.created).toHaveLength(0);
    expect(h.diagnostics.some((d) => d.kind === 'index-invalid')).toBe(true);
  });

  it('still infers from rows when no schema was declared', async () => {
    const h = makeHarness();
    await h.feed.drain();
    expect(h.created).toHaveLength(0);

    h.emit({ rows: snapshotRows(3), replace: true });
    h.emit({ status: 'ready' });
    await h.feed.drain();
    expect(h.created).toHaveLength(1);
  });
});
