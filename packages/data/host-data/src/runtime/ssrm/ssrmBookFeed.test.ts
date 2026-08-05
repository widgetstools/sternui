import { describe, expect, it, vi } from 'vitest';
import { createSsrmBookFeed, inferSsrmSchema, type SsrmBookSink } from './ssrmBookFeed.js';
import type { ProviderEmitEvent } from '../providers/Provider.js';

/**
 * A book sink that records what it was told, in order.
 *
 * The engine itself is not the thing under test here — the emit SEQUENCE is.
 * Every case below is one of the three rules the Perspective feed got wrong
 * before the real transport was run against it.
 */
function sink() {
  const calls: Array<{ op: 'snapshot' | 'update'; ids: unknown[] }> = [];
  const rows = new Map<unknown, Record<string, unknown>>();
  const book: SsrmBookSink = {
    applySnapshot(next) {
      calls.push({ op: 'snapshot', ids: next.map((r) => r.id) });
      rows.clear();
      for (const row of next) rows.set(row.id, { ...row });
      return { changed: [], removed: [] };
    },
    applyUpdate(next) {
      calls.push({ op: 'update', ids: next.map((r) => r.id) });
      for (const row of next) rows.set(row.id, { ...(rows.get(row.id) ?? {}), ...row });
      return { changed: [], removed: [] };
    },
    get size() {
      return rows.size;
    },
  };
  return { book, calls, rows };
}

const DECLARED = {
  keyField: 'id',
  fields: [
    { field: 'id', type: 'string' as const },
    { field: 'price', type: 'number' as const },
  ],
};

function feedWith(book: SsrmBookSink, declared = true) {
  const created = vi.fn(async () => book);
  const feed = createSsrmBookFeed({
    keyColumn: 'id',
    createBook: created,
    ...(declared ? { declaredSchema: DECLARED } : {}),
  });
  const seen: ProviderEmitEvent[] = [];
  const emit = feed.tap((event) => seen.push(event));
  return { feed, emit, seen, created };
}

describe('the SSRM book feed', () => {
  /**
   * Rule 1 of the decorator contract: the push path must not wait on the book,
   * or change shape because the book is there.
   */
  it('forwards every event synchronously and unmodified', () => {
    const { emit, seen } = feedWith(sink().book);
    const event = { rows: [{ id: 'A' }], replace: true };
    emit(event);
    emit({ status: 'ready' } as ProviderEmitEvent);
    expect(seen).toEqual([event, { status: 'ready' }]);
    // Same object, not a copy: nothing downstream may be reshaped.
    expect(seen[0]).toBe(event);
  });

  /**
   * The measured sequence: an empty `replace: true`, then a FLAGGED first
   * chunk, then unflagged chunks that are still snapshot. Treating only the
   * flagged chunk as snapshot builds the book from the first chunk alone.
   */
  it('treats the unflagged chunks after a replace as snapshot', async () => {
    const s = sink();
    const { feed, emit } = feedWith(s.book);
    // The book exists before the first chunk — the declared-schema fast path.
    await feed.whenReady();

    emit({ rows: [], replace: true });
    emit({ rows: [{ id: 'A', price: 1 }], replace: true });
    emit({ rows: [{ id: 'B', price: 2 }] });
    emit({ rows: [{ id: 'C', price: 3 }] });
    emit({ status: 'ready' } as ProviderEmitEvent);
    await feed.drain();

    expect(s.book.size).toBe(3);
    // The empty replace clears — it is the only signal when the new book turns
    // out to be empty. Then only the FIRST batch replaces and the rest upsert
    // into what it started: applying every chunk as a snapshot would leave the
    // book holding C alone, which is what it did before `loadedOnce` was
    // decided synchronously.
    expect(s.calls).toEqual([
      { op: 'snapshot', ids: [] },
      { op: 'snapshot', ids: ['A'] },
      { op: 'update', ids: ['B'] },
      { op: 'update', ids: ['C'] },
    ]);
  });

  /**
   * The other half of the same rule: rows that arrive BEFORE the book is
   * created are staged and land as one snapshot, not as a snapshot per chunk.
   * A window opening during the snapshot is exactly when this path runs.
   */
  it('loads rows staged before the book existed as one snapshot', async () => {
    const s = sink();
    const { feed, emit } = feedWith(s.book);

    emit({ rows: [], replace: true });
    emit({ rows: [{ id: 'A', price: 1 }], replace: true });
    emit({ rows: [{ id: 'B', price: 2 }] });
    emit({ rows: [{ id: 'C', price: 3 }] });
    await feed.drain();

    expect(s.calls).toEqual([{ op: 'snapshot', ids: ['A', 'B', 'C'] }]);
    expect(s.book.size).toBe(3);
  });

  it('upserts live deltas rather than appending', async () => {
    const s = sink();
    const { feed, emit } = feedWith(s.book);

    emit({ rows: [], replace: true });
    emit({ rows: [{ id: 'A', price: 1 }], replace: true });
    emit({ status: 'ready' } as ProviderEmitEvent);
    emit({ rows: [{ id: 'A', price: 9 }] });
    await feed.drain();

    expect(s.book.size).toBe(1);
    expect(s.rows.get('A')).toEqual({ id: 'A', price: 9 });
  });

  /**
   * An empty `replace` is NOT a no-op. It is the signal that a fresh book is
   * coming, and the ONLY signal when the new book turns out to be empty —
   * treat it as one and a stale book stays on screen forever.
   */
  it('empties the book on a replace with nothing after it', async () => {
    const s = sink();
    const { feed, emit } = feedWith(s.book);

    emit({ rows: [{ id: 'A' }, { id: 'B' }], replace: true });
    await feed.drain();
    expect(s.book.size).toBe(2);

    emit({ rows: [], replace: true });
    await feed.drain();
    expect(s.book.size).toBe(0);
  });

  /**
   * A `replace` discards staged rows UNCONDITIONALLY, not just when a book
   * already exists. A restart landing while an earlier snapshot is still
   * buffering leaves no book to check, and merging the abandoned rows into the
   * new one is silent corruption.
   */
  it('discards rows staged for an abandoned snapshot', async () => {
    const s = sink();
    // No declared schema, so rows buffer until `ready` — the window in which a
    // restart has nothing to check against.
    const created = vi.fn(async () => s.book);
    const feed = createSsrmBookFeed({ keyColumn: 'id', createBook: created });
    const emit = feed.tap(() => {});

    emit({ rows: [], replace: true });
    emit({ rows: [{ id: 'STALE-1' }, { id: 'STALE-2' }], replace: true });
    expect(feed.buffered).toBe(2);

    // The restart lands before `ready`: no book exists yet.
    emit({ rows: [], replace: true });
    expect(feed.buffered).toBe(0);
    emit({ rows: [{ id: 'FRESH' }], replace: true });
    emit({ status: 'ready' } as ProviderEmitEvent);
    await feed.drain();

    expect([...s.rows.keys()]).toEqual(['FRESH']);
  });

  /**
   * A restart under a DECLARED schema keeps the book, so windows attached to it
   * keep reading across the restart instead of losing their handle.
   */
  it('keeps one book across a restart when the schema was declared', async () => {
    const s = sink();
    const { feed, emit, created } = feedWith(s.book);

    emit({ rows: [{ id: 'A' }], replace: true });
    emit({ status: 'ready' } as ProviderEmitEvent);
    await feed.drain();

    emit({ rows: [], replace: true });
    emit({ rows: [{ id: 'B' }], replace: true });
    await feed.drain();

    expect(created).toHaveBeenCalledTimes(1);
    expect([...s.rows.keys()]).toEqual(['B']);
  });

  /** With a declaration the book exists before a single row — a window can attach. */
  it('builds the book immediately from a declared schema', async () => {
    const s = sink();
    const { feed } = feedWith(s.book);
    await expect(feed.whenReady()).resolves.toBe(s.book);
    expect(feed.schema).toEqual(DECLARED);
  });

  it('refuses a schema with no index column rather than growing forever', async () => {
    const diagnostics: unknown[] = [];
    const feed = createSsrmBookFeed({
      keyColumn: 'missing',
      createBook: async () => sink().book,
      declaredSchema: DECLARED,
      onDiagnostic: (d) => diagnostics.push(d),
    });
    await feed.drain();
    expect(diagnostics).toEqual([
      { kind: 'index-invalid', reason: 'no index column "missing" in the schema' },
    ]);
    expect(feed.book).toBeNull();
  });

  /**
   * A provider with no end token never says `ready` and flags nothing, so
   * without the row threshold the book would never be built at all.
   */
  it('builds from buffered rows when a provider has no snapshot phase', async () => {
    const s = sink();
    const feed = createSsrmBookFeed({
      keyColumn: 'id',
      createBook: async () => s.book,
      buildAfterRows: 3,
    });
    const emit = feed.tap(() => {});

    emit({ rows: [{ id: 'A' }, { id: 'B' }] });
    await feed.drain();
    expect(feed.book).toBeNull();

    emit({ rows: [{ id: 'C' }] });
    await feed.drain();
    expect(feed.book).toBe(s.book);
  });

  /**
   * The threshold must NOT fire once a snapshot is in progress: building at
   * 2,000 of 20,000 rows derives the schema from a partial book, and a column
   * that is all-null in the first chunk gets the wrong type for the rest.
   */
  it('does not build early once a replace has been seen', async () => {
    const s = sink();
    const feed = createSsrmBookFeed({
      keyColumn: 'id',
      createBook: async () => s.book,
      buildAfterRows: 2,
    });
    const emit = feed.tap(() => {});

    emit({ rows: [], replace: true });
    emit({ rows: [{ id: 'A' }, { id: 'B' }, { id: 'C' }], replace: true });
    await feed.drain();
    expect(feed.book).toBeNull();
    expect(feed.buffered).toBe(3);

    emit({ status: 'ready' } as ProviderEmitEvent);
    await feed.drain();
    expect(feed.book).toBe(s.book);
  });
});

/**
 * The emit sequence as a SEQUENCE, not as a handful of examples.
 *
 * The cases above are the ones somebody thought of, and rule 8 of the worklog
 * exists because the one nobody thought of shipped: the snapshot-vs-update
 * decision was being made inside queued work rather than synchronously in
 * `emit`, so every chunk of a snapshot was enqueued before the first one ran,
 * all of them believed they were the first, and the book ended up holding only
 * the LAST chunk. Nothing on screen would have shown it.
 *
 * The oracle is deliberately not a model of the feed. It is one rule:
 *
 *   **a `replace` clears the book, and every batch after it upserts.**
 *
 * That is what "the last complete snapshot plus the deltas after it" means, and
 * it is independent of how the feed decides which call to make. Rows carry
 * every field, so `applySnapshot` replacing a row and `applyUpdate` merging one
 * are indistinguishable — otherwise the oracle would have to know which of the
 * two the feed chose, which is the thing under test.
 */
function rng(seed: number): () => number {
  let state = (seed * 2654435761) >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

describe('the SSRM book feed — emit sequence fuzz', () => {
  /** Full rows, from a small pool of keys so batches overlap and re-write. */
  function chunk(random: () => number): Array<Record<string, unknown>> {
    const rows: Array<Record<string, unknown>> = [];
    const count = 1 + Math.floor(random() * 3);
    for (let i = 0; i < count; i++) {
      rows.push({
        id: `K${Math.floor(random() * 6)}`,
        price: Math.round(random() * 1000) / 10,
        size: Math.floor(random() * 100),
      });
    }
    return rows;
  }

  it('holds the last replace plus the batches after it, over 200 random sequences', async () => {
    for (let seed = 1; seed <= 200; seed++) {
      const random = rng(seed);
      const s = sink();
      const diagnostics: unknown[] = [];
      const feed = createSsrmBookFeed({
        keyColumn: 'id',
        createBook: async () => s.book,
        declaredSchema: DECLARED,
        onDiagnostic: (d) => diagnostics.push(d),
      });
      const emit = feed.tap(() => {});

      const expected = new Map<string, Record<string, unknown>>();
      const script: string[] = [];
      const check = async (where: string) => {
        await feed.drain();
        expect(
          [...s.rows.entries()]
            .map(([id, row]) => [String(id), row] as const)
            .sort((a, b) => (a[0] < b[0] ? -1 : 1)),
          `seed ${seed} at ${where} after [${script.join(', ')}]`,
        ).toEqual([...expected.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)));
      };

      const steps = 6 + Math.floor(random() * 12);
      for (let i = 0; i < steps; i++) {
        const roll = random();
        if (roll < 0.16) {
          // The empty clear that opens a snapshot — and, when nothing follows
          // it, the ONLY signal that the new book is empty.
          emit({ rows: [], replace: true });
          expected.clear();
          script.push('clear');
        } else if (roll < 0.44) {
          // The flagged first chunk. A restart landing here is a restart
          // landing mid-snapshot, which is the case that must not merge the
          // abandoned rows into the new book.
          const rows = chunk(random);
          emit({ rows, replace: true });
          expected.clear();
          for (const row of rows) expected.set(String(row.id), { ...row });
          script.push('flagged');
        } else if (roll < 0.78) {
          // Unflagged: a later snapshot chunk and a live delta are the same
          // event on the wire, and the feed cannot tell them apart.
          const rows = chunk(random);
          emit({ rows });
          for (const row of rows) expected.set(String(row.id), { ...expected.get(String(row.id)), ...row });
          script.push('chunk');
        } else if (roll < 0.88) {
          emit({ status: 'ready' } as ProviderEmitEvent);
          script.push('ready');
        } else {
          // A drain mid-sequence changes everything: it decides whether the
          // next event meets a book that exists or one still being built, and
          // those are different paths through `ingest`.
          await check(`step ${i}`);
          script.push('drain');
        }
      }

      await check('the end');
      // A swallowed failure would leave a book that looks merely stale.
      expect(diagnostics.filter((d) => (d as { kind: string }).kind === 'error')).toEqual([]);
    }
  }, 30_000);

  /**
   * The same sequences without a declared schema — the path that BUFFERS.
   *
   * A restart here lands while rows are staged and no book exists to check
   * against, and the book is discarded and rebuilt rather than replaced in
   * place. `createBook` hands back a fresh sink each time so an orphaned book
   * cannot be mistaken for the live one.
   */
  it('rebuilds from the last replace when the schema is inferred', async () => {
    for (let seed = 1; seed <= 60; seed++) {
      const random = rng(seed * 7);
      const books: ReturnType<typeof sink>[] = [];
      const feed = createSsrmBookFeed({
        keyColumn: 'id',
        createBook: async () => {
          const next = sink();
          books.push(next);
          return next.book;
        },
        // High enough that only `ready` builds: the threshold is for providers
        // with no snapshot phase, and these have one.
        buildAfterRows: 10_000,
      });
      const emit = feed.tap(() => {});

      const expected = new Map<string, Record<string, unknown>>();
      const script: string[] = [];

      const steps = 6 + Math.floor(random() * 10);
      for (let i = 0; i < steps; i++) {
        const roll = random();
        if (roll < 0.2) {
          emit({ rows: [], replace: true });
          expected.clear();
          script.push('clear');
        } else if (roll < 0.5) {
          const rows = chunk(random);
          emit({ rows, replace: true });
          expected.clear();
          for (const row of rows) expected.set(String(row.id), { ...row });
          script.push('flagged');
        } else if (roll < 0.85) {
          const rows = chunk(random);
          emit({ rows });
          for (const row of rows) expected.set(String(row.id), { ...expected.get(String(row.id)), ...row });
          script.push('chunk');
        } else {
          emit({ status: 'ready' } as ProviderEmitEvent);
          script.push('ready');
          await feed.drain();
        }
      }

      emit({ status: 'ready' } as ProviderEmitEvent);
      await feed.drain();
      script.push('ready');

      const live = books.at(-1);
      const held = feed.book === null ? new Map() : live!.rows;
      expect(
        [...held.entries()].map(([id, row]) => [String(id), row] as const).sort((a, b) => (a[0] < b[0] ? -1 : 1)),
        `seed ${seed} after [${script.join(', ')}]`,
      ).toEqual([...expected.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)));
    }
  }, 30_000);
});

describe('inferSsrmSchema', () => {
  /**
   * Every value, not a sample. Sampling row types on the Perspective path
   * truncated 19,999 of 20,000 values; a column that is null until row 2,000
   * and numeric after is a number column.
   */
  it('types a column from a value that appears late', () => {
    const rows = [{ id: 'A', late: null }, { id: 'B', late: null }, { id: 'C', late: 42 }];
    const schema = inferSsrmSchema(rows, 'id');
    expect(schema.fields).toContainEqual({ field: 'late', type: 'number' });
  });

  /** A column that held two kinds is a string column; anything else drops values. */
  it('falls back to string for a mixed column', () => {
    const schema = inferSsrmSchema([{ id: 'A', mixed: 1 }, { id: 'B', mixed: 'x' }], 'id');
    expect(schema.fields).toContainEqual({ field: 'mixed', type: 'string' });
  });

  it('always carries the key column, even if no row showed it', () => {
    const schema = inferSsrmSchema([{ price: 1 }], 'id');
    expect(schema.keyField).toBe('id');
    expect(schema.fields[0]).toEqual({ field: 'id', type: 'string' });
  });
});
