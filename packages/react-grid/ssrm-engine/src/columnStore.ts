import type { SsrmFieldType, SsrmRow, SsrmSchema } from './types.js';

/**
 * The book, held columnar.
 *
 * One typed array per numeric column, dictionary codes per string column, and a
 * key -> offset map for upserts. This is the whole reason the engine is cheap:
 * a filter scan reads one contiguous array instead of chasing 20,000 object
 * pointers, and a sort permutes an `Int32Array` of offsets rather than moving
 * rows.
 *
 * MEASURED on the Perspective path and the reason for the shape: a book of
 * 20,000 x 120 with 101 numeric columns is ~16 MB of `Float64Array`. The same
 * book as JS row objects, which is what the client-side row model holds, was
 * the difference between a 140 MB renderer and a 1,286 MB one.
 *
 * **Strings are dictionary-encoded, and that is not a micro-optimisation.**
 * MEASURED against Perspective at 50,000 x 121: 53 high-cardinality string
 * columns cost 1,015 MB where 12 cost 69 MB. A blotter's strings are nearly all
 * dimensions — asset class, sector, currency, desk — with a handful of distinct
 * values repeated across the book, so a code per row plus one copy of each
 * value is the difference between kilobytes and megabytes.
 */

/** A column's storage. `codes` indexes `values` for strings. */
interface StoredColumn {
  type: SsrmFieldType;
  /** number | date -> Float64Array; boolean -> Uint8Array; string -> Int32Array codes. */
  data: Float64Array | Uint8Array | Int32Array;
  /** Dictionary, strings only. Index 0 is reserved for null. */
  values?: string[];
  lookup?: Map<string, number>;
  /** Per-row null flag. A float column cannot use NaN for this: NaN is a
   *  legitimate value a feed can send, and conflating them silently turns a
   *  bad tick into an empty cell. */
  nulls: Uint8Array;
}

const GROWTH = 1.6;

export class ColumnStore {
  readonly keyField: string;
  /** Insertion-ordered field list; `getRows` returns columns in this order. */
  readonly fields: readonly string[];

  private readonly columns = new Map<string, StoredColumn>();
  private readonly offsetByKey = new Map<unknown, number>();
  private capacity = 0;
  private length = 0;
  /** Tombstones. A removed row keeps its offset so live indexes stay valid. */
  private alive: Uint8Array = new Uint8Array(0);
  private liveCount = 0;

  constructor(schema: SsrmSchema, initialCapacity = 1024) {
    this.keyField = schema.keyField;
    this.fields = schema.fields.map((f) => f.field);
    this.capacity = Math.max(16, initialCapacity);
    this.alive = new Uint8Array(this.capacity);
    for (const field of schema.fields) {
      this.columns.set(field.field, this.makeColumn(field.type, this.capacity));
    }
    if (!this.columns.has(schema.keyField)) {
      throw new Error(
        `[ssrm-engine] schema does not declare its keyField '${schema.keyField}'`,
      );
    }
  }

  private makeColumn(type: SsrmFieldType, capacity: number): StoredColumn {
    if (type === 'string') {
      return {
        type,
        data: new Int32Array(capacity),
        // Index 0 is the null sentinel so a zeroed array reads as all-null.
        values: [''],
        lookup: new Map([['', 0]]),
        nulls: new Uint8Array(capacity),
      };
    }
    if (type === 'boolean') {
      return { type, data: new Uint8Array(capacity), nulls: new Uint8Array(capacity) };
    }
    return { type, data: new Float64Array(capacity), nulls: new Uint8Array(capacity) };
  }

  /** Rows that have not been removed. */
  get size(): number {
    return this.liveCount;
  }

  /** Highest offset ever allocated — the bound for an index scan. */
  get extent(): number {
    return this.length;
  }

  isAlive(offset: number): boolean {
    return this.alive[offset] === 1;
  }

  hasField(field: string): boolean {
    return this.columns.has(field);
  }

  fieldType(field: string): SsrmFieldType | undefined {
    return this.columns.get(field)?.type;
  }

  private grow(needed: number): void {
    if (needed <= this.capacity) return;
    let next = this.capacity;
    while (next < needed) next = Math.ceil(next * GROWTH);

    for (const column of this.columns.values()) {
      const grown =
        column.data instanceof Float64Array
          ? new Float64Array(next)
          : column.data instanceof Int32Array
            ? new Int32Array(next)
            : new Uint8Array(next);
      grown.set(column.data as never);
      column.data = grown;
      const nulls = new Uint8Array(next);
      nulls.set(column.nulls);
      column.nulls = nulls;
    }
    const alive = new Uint8Array(next);
    alive.set(this.alive);
    this.alive = alive;
    this.capacity = next;
  }

  private intern(column: StoredColumn, value: string): number {
    const existing = column.lookup!.get(value);
    if (existing !== undefined) return existing;
    const code = column.values!.length;
    column.values!.push(value);
    column.lookup!.set(value, code);
    return code;
  }

  private writeCell(column: StoredColumn, offset: number, value: unknown): void {
    if (value === null || value === undefined) {
      column.nulls[offset] = 1;
      return;
    }
    column.nulls[offset] = 0;
    if (column.type === 'string') {
      (column.data as Int32Array)[offset] = this.intern(column, String(value));
      return;
    }
    if (column.type === 'boolean') {
      (column.data as Uint8Array)[offset] = value ? 1 : 0;
      return;
    }
    if (column.type === 'date') {
      const ms =
        value instanceof Date
          ? value.getTime()
          : typeof value === 'number'
            ? value
            : Date.parse(String(value));
      (column.data as Float64Array)[offset] = ms;
      column.nulls[offset] = Number.isNaN(ms) ? 1 : 0;
      return;
    }
    const n = typeof value === 'number' ? value : Number(value);
    (column.data as Float64Array)[offset] = n;
  }

  /**
   * Upsert rows by key. Returns the offsets touched, so a caller can drive
   * per-frame conflation and push only what moved.
   *
   * SPARSE by design: a row that names three fields writes three cells and
   * leaves the rest alone. A live feed sends the fields that moved, and
   * treating a partial row as a whole one would blank every column it omitted.
   */
  upsert(rows: readonly SsrmRow[]): number[] {
    const touched: number[] = [];
    this.grow(this.length + rows.length);

    for (const row of rows) {
      const key = row[this.keyField];
      if (key === null || key === undefined) continue;

      let offset = this.offsetByKey.get(key);
      if (offset === undefined) {
        offset = this.length;
        this.length += 1;
        this.grow(this.length);
        this.offsetByKey.set(key, offset);
        this.alive[offset] = 1;
        this.liveCount += 1;
        // A fresh row starts all-null, so a sparse insert does not read back
        // whatever happened to be in a reused slot.
        for (const column of this.columns.values()) column.nulls[offset] = 1;
      } else if (this.alive[offset] === 0) {
        this.alive[offset] = 1;
        this.liveCount += 1;
      }

      for (const field of Object.keys(row)) {
        const column = this.columns.get(field);
        if (column === undefined) continue;
        this.writeCell(column, offset, row[field]);
      }
      touched.push(offset);
    }
    return touched;
  }

  /** Remove by key. The offset is tombstoned, never reused, so a live index
   *  built before the removal stays valid until it is rebuilt. */
  remove(keys: readonly unknown[]): number[] {
    const touched: number[] = [];
    for (const key of keys) {
      const offset = this.offsetByKey.get(key);
      if (offset === undefined || this.alive[offset] === 0) continue;
      this.alive[offset] = 0;
      this.liveCount -= 1;
      this.offsetByKey.delete(key);
      touched.push(offset);
    }
    return touched;
  }

  offsetOf(key: unknown): number | undefined {
    return this.offsetByKey.get(key);
  }

  isNull(field: string, offset: number): boolean {
    const column = this.columns.get(field);
    return column === undefined || column.nulls[offset] === 1;
  }

  /**
   * Raw comparable for a cell: the number, the epoch ms, 0/1, or the string's
   * DICTIONARY CODE.
   *
   * Codes are assignment-ordered, not lexicographic, so this is for equality
   * and grouping only. Sorting strings goes through `stringAt`.
   */
  rawAt(field: string, offset: number): number {
    const column = this.columns.get(field);
    if (column === undefined) return 0;
    return (column.data as Float64Array)[offset];
  }

  stringAt(field: string, offset: number): string | null {
    const column = this.columns.get(field);
    if (column === undefined || column.nulls[offset] === 1) return null;
    if (column.type !== 'string') return String(this.valueAt(field, offset));
    return column.values![(column.data as Int32Array)[offset]] ?? null;
  }

  /** The cell as the grid should see it. */
  valueAt(field: string, offset: number): unknown {
    const column = this.columns.get(field);
    if (column === undefined) return undefined;
    if (column.nulls[offset] === 1) return null;
    switch (column.type) {
      case 'string':
        return column.values![(column.data as Int32Array)[offset]] ?? null;
      case 'boolean':
        return (column.data as Uint8Array)[offset] === 1;
      case 'date':
        return new Date((column.data as Float64Array)[offset]);
      default:
        return (column.data as Float64Array)[offset];
    }
  }

  /** Materialise one row. Only called for rows actually being returned. */
  rowAt(offset: number, fields?: readonly string[]): SsrmRow {
    const out: SsrmRow = {};
    for (const field of fields ?? this.fields) {
      out[field] = this.valueAt(field, offset);
    }
    return out;
  }

  /** Every distinct value of a column, for a set filter's list. */
  distinct(field: string): unknown[] {
    const column = this.columns.get(field);
    if (column === undefined) return [];
    // Strings answer from the dictionary — the values are already unique, so
    // this is a walk of the domain rather than of the book.
    if (column.type === 'string') {
      const seen = new Set<unknown>();
      for (let offset = 0; offset < this.length; offset++) {
        if (this.alive[offset] === 0) continue;
        seen.add(column.nulls[offset] === 1 ? null : column.values![(column.data as Int32Array)[offset]]);
      }
      return [...seen];
    }
    const seen = new Set<unknown>();
    for (let offset = 0; offset < this.length; offset++) {
      if (this.alive[offset] === 0) continue;
      seen.add(this.valueAt(field, offset));
    }
    return [...seen];
  }

  /** Offsets of every live row, in insertion order. */
  liveOffsets(): Int32Array {
    const out = new Int32Array(this.liveCount);
    let n = 0;
    for (let offset = 0; offset < this.length; offset++) {
      if (this.alive[offset] === 1) out[n++] = offset;
    }
    return out;
  }
}
