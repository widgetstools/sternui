/**
 * Lightweight row-sample-based column datatype inference.
 *
 * Runs once on first data render so subsequent rowData updates don't
 * thrash the inferred types (a ticker feed that only ever contains
 * price numbers shouldn't flip the column to 'text' just because the
 * first two ticks happened to be nulls). The sample size is deliberately
 * small — 20 rows is enough to rule out the nominal case where a
 * string-typed column has one numeric-looking row near the top.
 *
 * Output maps to AG-Grid's `ColDef.cellDataType` vocabulary:
 *
 *   'number'  — all non-null values are numbers (or numeric strings).
 *   'date'    — all non-null values are Date objects or ISO-8601
 *               date-like strings (`yyyy-mm-dd` optionally followed
 *               by `Thh:mm...`).
 *   'boolean' — all non-null values are `true` / `false`.
 *   'text'    — fallback when the sample is empty, mixed, or contains
 *               anything non-primitive.
 *
 * When every sampled value is null / undefined / '', returns
 * `undefined` so the caller can decide to leave cellDataType unset
 * rather than guess.
 */

export type InferredCellDataType = 'number' | 'date' | 'boolean' | 'text';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}|$)/;

/**
 * Infer the dominant datatype of a list of cell values. Null,
 * undefined, and empty strings are skipped — they don't disambiguate.
 * Returns `undefined` when nothing usable is in the sample.
 */
export function inferCellDataType(samples: ReadonlyArray<unknown>): InferredCellDataType | undefined {
  const usable: unknown[] = [];
  for (const v of samples) {
    if (v === null || v === undefined) continue;
    if (typeof v === 'string' && v.length === 0) continue;
    usable.push(v);
  }
  if (usable.length === 0) return undefined;

  // Date first — a Date object is also `typeof === 'object'` so it
  // would fail the number/boolean checks anyway, but ISO-date strings
  // look numeric to a naive check (`Number('2026-04-17')` is NaN, but
  // ordering still matters once per-type refinement grows).
  if (usable.every((v) => v instanceof Date || (typeof v === 'string' && ISO_DATE.test(v)))) {
    return 'date';
  }

  if (usable.every((v) => typeof v === 'boolean')) return 'boolean';

  // Accept numbers and numeric strings (`'101.5'` etc.) since AG-Grid's
  // default value parsers coerce them and desk data often arrives
  // stringified from APIs.
  if (
    usable.every((v) => {
      if (typeof v === 'number') return Number.isFinite(v);
      if (typeof v === 'string') {
        const n = Number(v);
        return Number.isFinite(n);
      }
      return false;
    })
  ) {
    return 'number';
  }

  return 'text';
}

/**
 * Sample a column's values across up to `maxSample` rows.
 * `rowData` is the raw host-supplied array; `field` is the column's
 * data key (colDef.field or colId). Returns the raw values — inference
 * happens via `inferCellDataType(...)` below.
 */
export function sampleColumn(
  rowData: ReadonlyArray<Record<string, unknown>> | undefined | null,
  field: string,
  maxSample = 20,
): unknown[] {
  if (!Array.isArray(rowData) || rowData.length === 0) return [];
  const limit = Math.min(maxSample, rowData.length);
  const out: unknown[] = [];
  for (let i = 0; i < limit; i++) out.push(rowData[i]?.[field]);
  return out;
}

/**
 * Convenience: `sampleColumn(...) + inferCellDataType(...)` in one
 * call. Returns the inferred type or `undefined` if the sample was
 * empty / all-null.
 */
export function inferCellDataTypeFromRows(
  rowData: ReadonlyArray<Record<string, unknown>> | undefined | null,
  field: string,
  maxSample = 20,
): InferredCellDataType | undefined {
  return inferCellDataType(sampleColumn(rowData, field, maxSample));
}
