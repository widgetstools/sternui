/**
 * Perspective table schema derivation — config `columnDefinitions`
 * first, refined from the first snapshot rows while `seeding`.
 *
 * The config is the single declaration of table schema and grid
 * columns (no drift); refinement only fills what the config leaves
 * open: columns without a usable `cellDataType`, and columns present
 * in the data but absent from the config when the config declares no
 * columns at all. Refinement runs BEFORE the table is created — a
 * Perspective schema is fixed at table creation.
 */

import type { ColumnDefinition } from '@starui/types';
import type { SsrmRow } from './TableWriter.js';

/** Perspective column types we emit (subset of the engine's set). */
export type PerspectiveColumnType =
  | 'string'
  | 'float'
  | 'integer'
  | 'boolean'
  | 'datetime'
  | 'date';

export type PerspectiveSchema = Record<string, PerspectiveColumnType>;

const CELL_DATA_TYPE_TO_PSP: Record<string, PerspectiveColumnType> = {
  text: 'string',
  number: 'float',
  boolean: 'boolean',
  date: 'datetime',
  // AG's dateString stays a string column — no timezone coercion.
  dateString: 'string',
};

/**
 * Schema from the config's column definitions. Columns with no
 * mappable `cellDataType` (absent, or `object`) are left OUT so
 * row refinement can type them; the key column is always present
 * (default `string`) — the table index must exist.
 */
export function schemaFromColumnDefinitions(
  columnDefinitions: readonly ColumnDefinition[] | undefined,
  keyColumn: string,
): PerspectiveSchema {
  const schema: PerspectiveSchema = {};
  for (const col of columnDefinitions ?? []) {
    if (!col.field) continue;
    const mapped = col.cellDataType ? CELL_DATA_TYPE_TO_PSP[col.cellDataType] : undefined;
    if (mapped) schema[col.field] = mapped;
  }
  if (!schema[keyColumn]) schema[keyColumn] = 'string';
  return schema;
}

/** Infer a Perspective type from one JS value; `null`/objects → undefined. */
export function inferPerspectiveType(value: unknown): PerspectiveColumnType | undefined {
  switch (typeof value) {
    case 'string':
      return 'string';
    case 'number':
      // Integer-looking samples still map to float: live ticks routinely
      // turn an int-valued first sample fractional, and Perspective
      // truncates floats written into an integer column.
      return Number.isFinite(value) ? 'float' : undefined;
    case 'boolean':
      return 'boolean';
    default:
      return undefined;
  }
}

export interface RefineSchemaResult {
  schema: PerspectiveSchema;
  /** Fields refinement added beyond the config-declared ones. */
  addedFields: string[];
}

/**
 * Refine a config-derived schema from sample rows (the first snapshot
 * batches). Two cases:
 *
 * 1. The config declared columns: only those columns may enter the
 *    table — sampling types the declared-but-untyped ones (fields in
 *    `declaredFields` missing from `schema`).
 * 2. The config declared NO columns: the sample defines the schema —
 *    every primitive-valued field found in the rows is added.
 *
 * Fields that never show a typable value fall back to `string`.
 */
export function refineSchemaFromRows(
  schema: PerspectiveSchema,
  declaredFields: readonly string[],
  rows: readonly SsrmRow[],
): RefineSchemaResult {
  const refined: PerspectiveSchema = { ...schema };
  const addedFields: string[] = [];
  const openDeclared = declaredFields.filter((f) => !(f in refined));
  const discoverAll = declaredFields.length === 0;

  const wanted = new Set(openDeclared);
  for (const row of rows) {
    for (const [field, value] of Object.entries(row)) {
      if (field in refined) continue;
      if (!discoverAll && !wanted.has(field)) continue;
      const type = inferPerspectiveType(value);
      if (!type) continue;
      refined[field] = type;
      addedFields.push(field);
    }
  }

  // Declared columns whose sampled values were all null/objects still
  // need to exist in the table — string is the lossless fallback.
  for (const field of openDeclared) {
    if (!(field in refined)) {
      refined[field] = 'string';
      addedFields.push(field);
    }
  }

  return { schema: refined, addedFields };
}

/**
 * Build a row projector for a fixed schema: rows are projected to the
 * schema's fields (drop anything the table does not carry —
 * Perspective rejects unknown columns in keyed updates). Non-primitive
 * values in schema'd fields are nulled, not stringified: the SSRM
 * plane is dotted-leaf projected upstream of this point.
 *
 * The field list is precomputed ONCE — this projector runs per row on
 * the hot ingest path (measured top JS frame at a 60k rows/s feed when
 * it re-derived `Object.keys(schema)` per row).
 */
export function createRowProjector(schema: PerspectiveSchema): (row: SsrmRow) => SsrmRow {
  const fields = Object.keys(schema);
  // Named so worker CPU profiles attribute the hot path readably.
  return function projectRowHot(row: SsrmRow): SsrmRow {
    const out: SsrmRow = {};
    for (let i = 0; i < fields.length; i += 1) {
      const field = fields[i]!;
      const value = row[field];
      if (value === undefined) continue; // absent → partial update leaves cell untouched
      out[field] = value !== null && typeof value === 'object' ? null : value;
    }
    return out;
  };
}

/** One-shot convenience over {@link createRowProjector} (tests, cold paths). */
export function projectRowToSchema(schema: PerspectiveSchema, row: SsrmRow): SsrmRow {
  return createRowProjector(schema)(row);
}

// ─── Edit coercion (P4b cell-edit write-back) ──────────────────────
//
// Grid editors hand back strings (and the wire hands back whatever the
// window sent) — the worker owns the schema, so it owns the coercion:
// an edited value is coerced to its column's Perspective type BEFORE
// the keyed update, or nulled when it cannot represent one (a keyed
// partial update with null clears the cell; it never corrupts the
// column). `undefined` stays undefined = "leave the cell untouched".

/** Coerce one edited value to a Perspective column type (null = unrepresentable). */
export function coerceValueToType(
  type: PerspectiveColumnType,
  value: unknown,
): unknown {
  if (value === undefined) return undefined;
  if (value === null) return null;
  switch (type) {
    case 'float':
    case 'integer': {
      const num =
        typeof value === 'number'
          ? value
          : typeof value === 'string' && value.trim() !== ''
            ? Number(value)
            : typeof value === 'boolean'
              ? Number(value)
              : Number.NaN;
      if (!Number.isFinite(num)) return null;
      return type === 'integer' ? Math.trunc(num) : num;
    }
    case 'boolean': {
      if (typeof value === 'boolean') return value;
      if (typeof value === 'number') return value !== 0;
      if (typeof value === 'string') {
        const lowered = value.trim().toLowerCase();
        if (lowered === 'true') return true;
        if (lowered === 'false') return false;
      }
      return null;
    }
    case 'string': {
      if (typeof value === 'string') return value;
      if (typeof value === 'number' || typeof value === 'boolean') return String(value);
      return null;
    }
    case 'datetime':
    case 'date': {
      // Dates flatten to ISO strings (the ingest row projector nulls
      // object values); numbers are epoch ms; strings must parse —
      // Perspective accepts both on json updates.
      if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value.toISOString();
      }
      if (typeof value === 'number' && Number.isFinite(value)) return value;
      if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) return value;
      return null;
    }
    default:
      return null;
  }
}

/**
 * Coerce a keyed PARTIAL row to the table schema: schema'd fields are
 * value-coerced ({@link coerceValueToType}), fields the table does not
 * carry are DROPPED (Perspective rejects unknown columns on keyed
 * updates), `undefined` values are skipped (partial update semantics).
 */
export function coerceRowToSchema(schema: PerspectiveSchema, row: SsrmRow): SsrmRow {
  const out: SsrmRow = {};
  for (const [field, value] of Object.entries(row)) {
    const type = schema[field];
    if (!type || value === undefined) continue;
    out[field] = coerceValueToType(type, value);
  }
  return out;
}
