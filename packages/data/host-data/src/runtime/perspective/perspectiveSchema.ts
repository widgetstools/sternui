/**
 * Derive a Perspective table schema from observed provider rows.
 *
 * Perspective declares ONE type per column up front and then silently COERCES
 * anything that disagrees — a float arriving in an `integer` column is
 * truncated, not rejected, and `table.update()` reports nothing. This is the
 * only place in the pull-path migration where a mistake corrupts data instead
 * of throwing, so the rules below are deliberately conservative and every one
 * of them came from measuring the real feed
 * (`packages/react-grid/perspective-grid/scripts/stompSchemaProbe.mjs`).
 *
 * **Numeric columns are `float`, always, unless the caller explicitly opts a
 * column into `integer`.** Two measured facts force this:
 *
 *   - Sampling cannot tell them apart. Scanning all 20,000 snapshot rows,
 *     `totalValue` was integral in exactly ONE row and fractional in 19,999;
 *     `averagePrice` and `currentPrice` in two. Any sampler that happens to
 *     see one of those rows types the column `integer` and truncates the rest,
 *     permanently, in every window, with no error anywhere.
 *   - Even a complete scan cannot prove it. A column integral across the whole
 *     snapshot can still be repriced with a fraction by the next live delta.
 *
 * And the asymmetry settles it: an IEEE double represents every integer up to
 * 2^53 exactly, so typing an integer column `float` loses nothing at these
 * magnitudes, while typing a float column `integer` loses the fraction of
 * every row. Float is lossless in both directions; integer is lossy in one.
 * `integral` is still reported so a caller who wants integer semantics for an
 * id or a count can ask for it deliberately.
 */

/** The Perspective column types this maps onto. */
export type PerspectiveColumnType =
  | 'string'
  | 'integer'
  | 'float'
  | 'boolean'
  | 'date'
  | 'datetime';

export type PerspectiveSchema = Record<string, PerspectiveColumnType>;

export interface ColumnObservation {
  /** Rows in which the column was present at all. */
  seen: number;
  nulls: number;
  integers: number;
  floats: number;
  booleans: number;
  /** Strings that are not ISO date-like. */
  strings: number;
  isoDates: number;
  isoDateTimes: number;
  /** Objects and arrays — Perspective is flat, so these cannot be columns. */
  nested: number;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;

function blank(): ColumnObservation {
  return {
    seen: 0,
    nulls: 0,
    integers: 0,
    floats: 0,
    booleans: 0,
    strings: 0,
    isoDates: 0,
    isoDateTimes: 0,
    nested: 0,
  };
}

/**
 * Accumulate type evidence from a batch of rows.
 *
 * Call it repeatedly with the same map to fold in later batches — snapshot
 * chunks first, then live deltas, which is exactly how the provider emits
 * them. Sparse deltas carry only the columns that moved, so `seen` is per
 * column rather than per row.
 */
export function observeRows(
  rows: readonly unknown[],
  into: Map<string, ColumnObservation> = new Map(),
): Map<string, ColumnObservation> {
  for (const row of rows) {
    if (row === null || typeof row !== 'object') continue;
    for (const [key, value] of Object.entries(row as Record<string, unknown>)) {
      let o = into.get(key);
      if (!o) {
        o = blank();
        into.set(key, o);
      }
      o.seen += 1;

      if (value === null || value === undefined) {
        o.nulls += 1;
      } else if (typeof value === 'boolean') {
        o.booleans += 1;
      } else if (typeof value === 'number') {
        if (Number.isInteger(value)) o.integers += 1;
        else o.floats += 1;
      } else if (typeof value === 'string') {
        if (ISO_DATETIME.test(value)) o.isoDateTimes += 1;
        else if (ISO_DATE.test(value)) o.isoDates += 1;
        else o.strings += 1;
      } else {
        o.nested += 1;
      }
    }
  }
  return into;
}

export interface SchemaOptions {
  /**
   * Columns to declare `integer` rather than the default `float`. Opt-in only
   * — see this module's header for why inference must not choose it.
   */
  integerColumns?: readonly string[];
  /** Map ISO date-like strings onto `date` / `datetime`. Default true. */
  inferDates?: boolean;
}

export interface DerivedSchema {
  schema: PerspectiveSchema;
  /** Dropped: Perspective is flat, so an object or array cannot be a column. */
  nested: string[];
  /** Typed `string` because the observed values disagreed about their kind. */
  mixed: { column: string; kinds: string[] }[];
  /** No non-null value ever observed; typed `string` as the only safe guess. */
  unknown: string[];
  /** Numeric columns integral in everything observed. Reported, NOT applied. */
  integral: string[];
}

export function toPerspectiveSchema(
  observations: Map<string, ColumnObservation>,
  options: SchemaOptions = {},
): DerivedSchema {
  const { integerColumns = [], inferDates = true } = options;
  const forceInteger = new Set(integerColumns);

  const schema: PerspectiveSchema = {};
  const nested: string[] = [];
  const mixed: { column: string; kinds: string[] }[] = [];
  const unknown: string[] = [];
  const integral: string[] = [];

  for (const [column, o] of observations) {
    const numeric = o.integers + o.floats;
    const dateish = o.isoDates + o.isoDateTimes;

    // Nested wins outright: a column that is EVER an object cannot be a flat
    // Perspective column, and including it would coerce every row to null.
    if (o.nested > 0) {
      nested.push(column);
      continue;
    }

    const kinds: string[] = [];
    if (numeric > 0) kinds.push('number');
    if (o.booleans > 0) kinds.push('boolean');
    if (o.strings > 0) kinds.push('string');
    if (dateish > 0) kinds.push('date');

    if (kinds.length === 0) {
      // Only ever null, or never present with a value.
      unknown.push(column);
      schema[column] = 'string';
      continue;
    }

    if (kinds.length > 1) {
      // Disagreeing kinds. `string` is the only type that keeps every value
      // readable — a string landing in a float column becomes null.
      mixed.push({ column, kinds });
      schema[column] = 'string';
      continue;
    }

    if (numeric > 0) {
      if (o.floats === 0) integral.push(column);
      schema[column] = forceInteger.has(column) ? 'integer' : 'float';
      continue;
    }
    if (o.booleans > 0) {
      schema[column] = 'boolean';
      continue;
    }
    if (dateish > 0 && inferDates) {
      // A datetime carries a date, so a column with both is `datetime`.
      schema[column] = o.isoDateTimes > 0 ? 'datetime' : 'date';
      continue;
    }
    schema[column] = 'string';
  }

  return { schema, nested, mixed, unknown, integral };
}

/**
 * Check a column is usable as the Table's `index`.
 *
 * The index is what makes `table.update()` an upsert, so a bad one is not a
 * cosmetic problem: a missing value silently drops the row's identity and a
 * duplicate makes two positions collapse into one.
 *
 * Returns null when usable, otherwise the reason.
 */
export function validateIndexColumn(
  schema: PerspectiveSchema,
  index: string,
  observations: Map<string, ColumnObservation>,
  rowsObserved?: number,
): string | null {
  const type = schema[index];
  if (!type) return `index column "${index}" is not in the schema`;
  if (type !== 'string' && type !== 'integer' && type !== 'float') {
    return `index column "${index}" is ${type}; Perspective indexes must be a scalar key`;
  }

  const o = observations.get(index);
  if (!o) return `index column "${index}" was never observed`;
  if (o.nulls > 0) return `index column "${index}" is null in ${o.nulls} observed row(s)`;
  if (rowsObserved !== undefined && o.seen < rowsObserved) {
    return `index column "${index}" is missing from ${rowsObserved - o.seen} observed row(s)`;
  }
  return null;
}
