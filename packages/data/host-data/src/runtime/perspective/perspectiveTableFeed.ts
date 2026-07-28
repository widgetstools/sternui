/**
 * Feed a Perspective Table from a provider's emit stream.
 *
 * This is the seam ARCHITECTURE.md calls "the Table is the only shared
 * contract". `startStomp(cfg, emit)` already emits exactly what a Table needs
 * — `{ rows, replace: true }` for snapshot chunks and `{ rows }` for live
 * deltas — so the Table is fed by DECORATING `ProviderEmit`. No transport
 * changes, and any provider that speaks the same contract gets windowing for
 * free.
 *
 * Two ordering rules make this safe to drop in front of the hub:
 *
 *   1. `tap` forwards every event to the wrapped emit SYNCHRONOUSLY and
 *      unmodified, before doing any Table work. The existing push path must
 *      not wait on Perspective, and must not change shape because Perspective
 *      is present.
 *   2. All Table work is serialized on one promise chain. `table.update()` is
 *      async and emit is not, so without a queue a slow snapshot load would
 *      let the first live deltas overtake it and be overwritten.
 *
 * The Table cannot exist until its schema does, and the schema cannot be
 * trusted until enough rows have been seen (see `perspectiveSchema.ts` — one
 * row in 20,000 can flip a column's inferred type). So snapshot rows are
 * buffered, and the Table is built when the provider says `ready`.
 */
import type { ProviderEmit, ProviderEmitEvent } from '../providers/Provider.js';
import {
  observeRows,
  toPerspectiveSchema,
  validateIndexColumn,
  type ColumnObservation,
  type PerspectiveSchema,
} from './perspectiveSchema.js';

/** The slice of a Perspective `Table` this needs. */
export interface FeedTable {
  update(rows: readonly unknown[]): Promise<void>;
  delete?(): Promise<void>;
}

export type FeedDiagnostic =
  | { kind: 'schema'; schema: PerspectiveSchema; rows: number; nested: string[]; mixed: string[] }
  | { kind: 'index-invalid'; reason: string }
  | { kind: 'unknown-columns'; columns: string[] }
  | { kind: 'error'; stage: 'create' | 'load' | 'update'; message: string };

export interface PerspectiveTableFeedOpts {
  /** Index column, from the provider config's `keyColumn`. */
  keyColumn: string;
  /** Build the Table once the schema is known. */
  createTable(schema: PerspectiveSchema, index: string): Promise<FeedTable>;
  /** Columns to declare `integer` rather than the default `float`. */
  integerColumns?: readonly string[];
  /**
   * Build the Table after this many buffered rows even if `ready` never
   * arrives. A provider with no configured end token cannot tell snapshot from
   * live and emits everything as deltas, so without this the Table would never
   * be built at all.
   */
  buildAfterRows?: number;
  onDiagnostic?(diagnostic: FeedDiagnostic): void;
}

export interface PerspectiveTableFeed {
  /** Wrap a `ProviderEmit`. The returned emit forwards everything untouched. */
  tap(emit: ProviderEmit): ProviderEmit;
  /** The Table once built, else null. */
  readonly table: FeedTable | null;
  /** The schema the Table was built with, else null. */
  readonly schema: PerspectiveSchema | null;
  /** Resolves with the Table when it has been built and loaded. */
  whenReady(): Promise<FeedTable>;
  /** Rows buffered but not yet loaded. */
  readonly buffered: number;
  /** Settle all queued Table work — for tests and shutdown. */
  drain(): Promise<void>;
  stop(): Promise<void>;
}

export function createPerspectiveTableFeed(
  opts: PerspectiveTableFeedOpts,
): PerspectiveTableFeed {
  const {
    keyColumn,
    createTable,
    integerColumns,
    buildAfterRows = 2_000,
    onDiagnostic = () => {},
  } = opts;

  let table: FeedTable | null = null;
  let schema: PerspectiveSchema | null = null;
  let known: Set<string> | null = null;
  let buffer: unknown[] = [];
  let observations = new Map<string, ColumnObservation>();
  let stopped = false;
  /** Set once any `replace` arrives — i.e. this provider has a snapshot phase. */
  let sawReplace = false;
  /** Serializes every Table operation; see rule 2 in the header. */
  let queue: Promise<void> = Promise.resolve();
  let resolveReady: ((t: FeedTable) => void) | null = null;
  const ready = new Promise<FeedTable>((resolve) => {
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

  async function buildTable(): Promise<void> {
    if (stopped || table !== null || buffer.length === 0) return;

    const derived = toPerspectiveSchema(observations, { integerColumns });
    const indexProblem = validateIndexColumn(
      derived.schema,
      keyColumn,
      observations,
      buffer.length,
    );
    if (indexProblem !== null) {
      // Without a valid index `update()` appends instead of upserting, so
      // every tick would grow the book. Refuse rather than corrupt it.
      onDiagnostic({ kind: 'index-invalid', reason: indexProblem });
      buffer = [];
      observations = new Map();
      return;
    }

    onDiagnostic({
      kind: 'schema',
      schema: derived.schema,
      rows: buffer.length,
      nested: derived.nested,
      mixed: derived.mixed.map((m) => m.column),
    });

    try {
      table = await createTable(derived.schema, keyColumn);
    } catch (err) {
      onDiagnostic({
        kind: 'error',
        stage: 'create',
        message: String((err as Error)?.message ?? err),
      });
      return;
    }

    schema = derived.schema;
    known = new Set(Object.keys(derived.schema));

    const rows = buffer;
    buffer = [];
    try {
      await table.update(rows);
    } catch (err) {
      onDiagnostic({
        kind: 'error',
        stage: 'load',
        message: String((err as Error)?.message ?? err),
      });
      return;
    }
    resolveReady?.(table);
    resolveReady = null;
  }

  /** Columns absent from the schema are silently IGNORED by `update()`, so a
   *  drifting feed would quietly stop delivering a column. Report once. */
  let reportedUnknown = false;
  function checkColumns(rows: readonly unknown[]): void {
    if (reportedUnknown || known === null || rows.length === 0) return;
    const first = rows[0];
    if (first === null || typeof first !== 'object') return;
    const unknownColumns = Object.keys(first as Record<string, unknown>).filter(
      (k) => !known!.has(k),
    );
    if (unknownColumns.length > 0) {
      reportedUnknown = true;
      onDiagnostic({ kind: 'unknown-columns', columns: unknownColumns });
    }
  }

  function ingest(rows: readonly unknown[], replace: boolean): void {
    if (stopped) return;

    if (replace) {
      // MEASURED against the real transport: a snapshot opens with an EMPTY
      // `replace: true` clear, then the first chunk carries `replace: true`
      // and every chunk after it rides as a plain `{rows}` delta
      // (`stomp.ts`: `emit({ rows: chunk, replace: offset === 0 })`). So an
      // empty replace is not a no-op — it is the signal that a fresh book is
      // coming, and it is the ONLY signal when the new book is empty.
      sawReplace = true;

      // `replace` means "a fresh book starts here", so anything staged for
      // the previous one is discarded — unconditionally, NOT just when a
      // Table already exists. A restart landing while an earlier snapshot is
      // still buffering leaves no Table to check, and merging the abandoned
      // rows into the new book is silent corruption.
      buffer = [];
      observations = new Map();

      if (table !== null) {
        // Drop the old Table rather than upserting into it, or rows deleted
        // upstream would linger in the book forever.
        const old = table;
        table = null;
        schema = null;
        known = null;
        reportedUnknown = false;
        enqueue(async () => {
          await old.delete?.();
        });
      }
    }

    if (rows.length === 0) return;

    if (table === null) {
      // Everything before the Table exists is buffered, whether it was
      // flagged `replace` or not: after the first chunk the rest of the
      // snapshot arrives unflagged, and buffering it is what lets the schema
      // be derived from the whole book.
      buffer.push(...rows);
      observeRows(rows, observations);
      // The row threshold is ONLY for providers with no snapshot phase at all
      // (no end token — every frame is a delta and `ready` never comes).
      // Once a `replace` has been seen a snapshot IS in progress, and
      // building early would derive the schema from a partial book: a column
      // that is all-null in the first 2,000 rows would be typed `string`, and
      // one that turns out nested would be silently dropped.
      if (!sawReplace && buffer.length >= buildAfterRows) enqueue(buildTable);
      return;
    }

    checkColumns(rows);
    enqueue(async () => {
      // Whole frame in one call: the feed sends ~100 rows per frame and a
      // per-row update measured ~0.7ms each against the real engine.
      await table!.update(rows);
    });
  }

  return {
    get table() {
      return table;
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
        // Forward FIRST and synchronously — the push path must not wait on,
        // or be reshaped by, the Table.
        emit(event);

        if ('rows' in event) {
          ingest(event.rows, event.replace === true);
          return;
        }
        if ('status' in event && event.status === 'ready') {
          enqueue(buildTable);
        }
      };
    },

    async drain() {
      await queue;
    },

    async stop() {
      stopped = true;
      const old = table;
      table = null;
      schema = null;
      buffer = [];
      await queue;
      await old?.delete?.();
    },
  };
}
