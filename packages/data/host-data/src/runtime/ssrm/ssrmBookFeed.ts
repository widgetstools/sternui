/**
 * Feed an SSRM book from a provider's emit stream.
 *
 * The peer of `perspectiveTableFeed.ts`, and deliberately the same shape: the
 * book is filled by DECORATING `ProviderEmit`, so no transport changes and any
 * provider that speaks the contract drives it. `startStomp(cfg, emit)` already
 * emits what a book needs — `{ rows, replace: true }` for snapshot chunks and
 * `{ rows }` for live deltas — and the sparse partial rows map straight onto
 * `applyUpdate`, which upserts by key and leaves omitted columns alone.
 *
 * ## The emit sequence, read off the transport rather than assumed
 *
 * `stomp.ts` emits `{ rows: chunk, replace: offset === 0 }`, which produces:
 *
 * ```
 * { rows: [],     replace: true }   empty clear — a snapshot is starting
 * { rows: chunk0, replace: true }   ONLY the first chunk is flagged
 * { rows: chunk1 }  …  { rows: chunkN }   the rest ride as plain deltas
 * { status: 'ready' }
 * { rows: … }                        live deltas from here
 * ```
 *
 * Each of the three consequences below was a bug on the Perspective feed before
 * the real transport was run against it, and they are not hypothetical here:
 *
 *   - **The unflagged chunks are still snapshot.** Treating only the flagged one
 *     as such would build the book from 1,000 rows instead of 20,000.
 *   - **An empty `replace` is not a no-op.** It is the signal that a fresh book
 *     is coming, and the ONLY signal when the new book turns out to be empty.
 *   - **A `replace` discards staged rows unconditionally**, not just when a book
 *     already exists. A restart landing while an earlier snapshot is still
 *     buffering leaves no book to check, and merging the abandoned rows into the
 *     new one is silent corruption.
 *
 * ## Two ordering rules
 *
 *   1. `tap` forwards every event to the wrapped emit SYNCHRONOUSLY and
 *      unmodified, before touching the book. The existing push path must not
 *      wait on the engine, or change shape because the engine is present.
 *   2. All engine work is serialized on one promise chain. The engine itself is
 *      synchronous, but `createBook` is not — so without a queue the first live
 *      deltas would land while the book was still being created and be lost.
 *
 * ## Why the schema does not have to be inferred
 *
 * The Perspective feed buffers the whole snapshot because one row in 20,000 can
 * flip a column's inferred type and a Perspective Table's schema is fixed at
 * creation. This engine's store takes a declared field list the same way, so
 * when the provider config declares its columns the book is created EMPTY and
 * IMMEDIATELY and a window can attach while the snapshot is still arriving.
 * Without a declaration there is nothing safe to do but buffer — the same trade,
 * for the same reason.
 */
import type { ProviderEmit, ProviderEmitEvent } from '../providers/Provider.js';

/** A field as the store types it. Restated here so this file imports no engine. */
export interface SsrmFieldLike {
  field: string;
  type: 'string' | 'number' | 'boolean' | 'date';
}

export interface SsrmSchemaLike {
  keyField: string;
  fields: SsrmFieldLike[];
}

/** The slice of `SsrmEngine` this needs. Structural, so it is testable alone. */
export interface SsrmBookSink {
  applyUpdate(rows: readonly Record<string, unknown>[]): unknown;
  applySnapshot(rows: readonly Record<string, unknown>[]): unknown;
  readonly size: number;
}

export type SsrmFeedDiagnostic =
  | { kind: 'schema'; schema: SsrmSchemaLike; rows: number }
  | { kind: 'index-invalid'; reason: string }
  | { kind: 'error'; stage: 'create' | 'load' | 'update'; message: string };

export interface SsrmBookFeedOpts {
  /** Index column, from the provider config's `keyColumn`. */
  keyColumn: string;
  /**
   * Columns the config declares. With them the book is created immediately and
   * empty; without them the snapshot is buffered and the schema derived from it.
   */
  declaredSchema?: SsrmSchemaLike;
  /** Build the book once the schema is known. */
  createBook(schema: SsrmSchemaLike): Promise<SsrmBookSink>;
  /**
   * Build after this many buffered rows even if `ready` never arrives. A
   * provider with no configured end token cannot tell snapshot from live and
   * emits everything as deltas, so without this the book is never built.
   */
  buildAfterRows?: number;
  onDiagnostic?(diagnostic: SsrmFeedDiagnostic): void;
}

export interface SsrmBookFeed {
  /** Wrap a `ProviderEmit`. The returned emit forwards everything untouched. */
  tap(emit: ProviderEmit): ProviderEmit;
  readonly book: SsrmBookSink | null;
  readonly schema: SsrmSchemaLike | null;
  /** Resolves with the book once it has been built and loaded. */
  whenReady(): Promise<SsrmBookSink>;
  readonly buffered: number;
  /** Settle all queued work — for tests and shutdown. */
  drain(): Promise<void>;
  stop(): Promise<void>;
}

type Row = Record<string, unknown>;

/**
 * Derive a schema from rows.
 *
 * Every value of a column is looked at, not a sample. On the Perspective path
 * sampling row types truncated 19,999 of 20,000 values and typed a column off
 * whatever the first row happened to hold — a column that is null for the first
 * 2,000 rows and numeric after is a number column, and typing it `string` puts
 * every later value in the wrong store.
 */
export function inferSsrmSchema(rows: readonly Row[], keyColumn: string): SsrmSchemaLike {
  const seen = new Map<string, Set<string>>();
  for (const row of rows) {
    for (const [field, value] of Object.entries(row)) {
      if (value === null || value === undefined) continue;
      let kinds = seen.get(field);
      if (kinds === undefined) {
        kinds = new Set();
        seen.set(field, kinds);
      }
      kinds.add(
        typeof value === 'number'
          ? 'number'
          : typeof value === 'boolean'
            ? 'boolean'
            : value instanceof Date
              ? 'date'
              : 'string',
      );
    }
  }
  const fields: SsrmFieldLike[] = [];
  for (const [field, kinds] of seen) {
    // A column that held more than one kind is a string column. Anything else
    // silently drops the values that do not fit the winner.
    const type: SsrmFieldLike['type'] =
      kinds.size === 1 ? ([...kinds][0] as SsrmFieldLike['type']) : 'string';
    fields.push({ field, type });
  }
  if (!fields.some((f) => f.field === keyColumn)) {
    fields.unshift({ field: keyColumn, type: 'string' });
  }
  return { keyField: keyColumn, fields };
}

export function createSsrmBookFeed(opts: SsrmBookFeedOpts): SsrmBookFeed {
  const {
    keyColumn,
    createBook,
    declaredSchema,
    buildAfterRows = 2_000,
    onDiagnostic = () => {},
  } = opts;

  let book: SsrmBookSink | null = null;
  let schema: SsrmSchemaLike | null = null;
  let buffer: Row[] = [];
  let stopped = false;
  /** Set once any `replace` arrives — i.e. this provider has a snapshot phase. */
  let sawReplace = false;
  /**
   * Rows staged for the book's FIRST load are a snapshot, not an update.
   * Everything after it is an upsert, whatever flag it carried.
   */
  let loadedOnce = false;
  let queue: Promise<void> = Promise.resolve();
  let resolveReady: ((b: SsrmBookSink) => void) | null = null;
  const ready = new Promise<SsrmBookSink>((resolve) => {
    resolveReady = resolve;
  });

  const enqueue = (work: () => Promise<void>): void => {
    queue = queue.then(work).catch((err) => {
      onDiagnostic({
        kind: 'error',
        stage: 'update',
        message: String((err as Error)?.message ?? err),
      });
    });
  };

  async function build(derived: SsrmSchemaLike, rowsSeen: number): Promise<void> {
    if (stopped || book !== null) return;
    if (!derived.fields.some((f) => f.field === keyColumn)) {
      // Without a key column an upsert has nothing to match on and every tick
      // would append. Refuse rather than grow the book forever.
      onDiagnostic({ kind: 'index-invalid', reason: `no index column "${keyColumn}" in the schema` });
      buffer = [];
      return;
    }

    onDiagnostic({ kind: 'schema', schema: derived, rows: rowsSeen });

    let created: SsrmBookSink;
    try {
      created = await createBook(derived);
    } catch (err) {
      onDiagnostic({
        kind: 'error',
        stage: 'create',
        message: String((err as Error)?.message ?? err),
      });
      return;
    }
    book = created;
    schema = derived;

    const staged = buffer;
    buffer = [];
    if (staged.length > 0) {
      // One snapshot for everything staged, not one per chunk — the whole point
      // of buffering. `loadedOnce` is set before the call for the same reason
      // it is set synchronously in `ingest`.
      loadedOnce = true;
      try {
        created.applySnapshot(staged);
      } catch (err) {
        onDiagnostic({
          kind: 'error',
          stage: 'load',
          message: String((err as Error)?.message ?? err),
        });
        return;
      }
    }
    resolveReady?.(created);
    resolveReady = null;
  }

  const buildDeclared = () => build(declaredSchema!, 0);
  const buildInferred = () => {
    if (stopped || book !== null || buffer.length === 0) return Promise.resolve();
    return build(inferSsrmSchema(buffer, keyColumn), buffer.length);
  };

  function ingest(rows: readonly Row[], replace: boolean): void {
    if (stopped) return;

    if (replace) {
      sawReplace = true;
      // Unconditionally — see the header. A restart landing mid-snapshot leaves
      // no book to check, and merging the abandoned rows is silent corruption.
      buffer = [];

      if (book !== null) {
        // The book SURVIVES a restart: `applySnapshot` replaces its contents
        // and reports what was removed, so attached windows keep reading across
        // it rather than watching their book disappear. That is only safe while
        // the schema is known independently of the data — an inferred one may
        // not match the next book, so it is rebuilt instead.
        if (declaredSchema) {
          // An EMPTY replace with nothing after it means the new book is
          // empty, and that has to land NOW.
          //
          // It costs one extra broadcast on a restart — the clear removes
          // every key and the chunk that follows re-adds them — and that is
          // deliberate. Deferring the clear until rows arrive would be cheaper
          // and would leave a stale book on screen forever for any provider
          // that clears and then says nothing, which is the failure this
          // signal exists to prevent.
          if (rows.length === 0) {
            const live = book;
            enqueue(async () => {
              live.applySnapshot([]);
            });
          }
          loadedOnce = false;
        } else {
          book = null;
          schema = null;
          loadedOnce = false;
        }
      }
    }

    if (rows.length === 0) return;

    if (book === null) {
      // Everything before the book exists is buffered whether it was flagged or
      // not: after the first chunk the rest of the snapshot arrives unflagged.
      buffer.push(...(rows as Row[]));
      // The row threshold is ONLY for providers with no snapshot phase at all.
      // Once a `replace` has been seen a snapshot IS in progress, and building
      // early would derive the schema from a partial book.
      if (!sawReplace && buffer.length >= buildAfterRows) enqueue(buildInferred);
      return;
    }

    const live = book;
    const batch = rows as Row[];
    // Decided HERE, synchronously, and not inside the queued work. `emit` is
    // synchronous and the queue is not, so every chunk of a snapshot is
    // enqueued before the first one has run — flipping the flag in the work
    // left all of them believing they were the first, and the book ended up
    // holding only the LAST chunk.
    const isSnapshotChunk = !loadedOnce;
    loadedOnce = true;
    enqueue(async () => {
      // The FIRST batch after a replace replaces the book's contents; the
      // chunks after it upsert into what that started.
      if (isSnapshotChunk) live.applySnapshot(batch);
      else live.applyUpdate(batch);
    });
  }

  // Create the book NOW when the config declared its columns — not on the first
  // rows, and not on `ready`. This is what a window attaches to while the
  // snapshot is still streaming.
  if (declaredSchema) enqueue(buildDeclared);

  return {
    get book() {
      return book;
    },
    get schema() {
      return schema;
    },
    get buffered() {
      return buffer.length;
    },
    whenReady: () => ready,

    tap(emit: ProviderEmit): ProviderEmit {
      return (event: ProviderEmitEvent) => {
        // Forward FIRST and synchronously — the push path must not wait on, or
        // be reshaped by, the book.
        emit(event);

        if ('rows' in event) {
          ingest(event.rows as readonly Row[], event.replace === true);
          return;
        }
        if ('status' in event && event.status === 'ready') {
          enqueue(buildInferred);
        }
      };
    },

    async drain() {
      await queue;
    },

    async stop() {
      stopped = true;
      book = null;
      schema = null;
      buffer = [];
      await queue;
    },
  };
}
