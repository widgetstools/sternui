/**
 * Worker-side index helpers over the provider row cache.
 *
 * Phase 2 covers the SSRM set-filter values endpoint: distinct values
 * for a column computed across the FULL dataset (every cached row), not
 * just the rows the grid currently has loaded — the whole point being
 * that a paginated grid can't compute these itself. Scanned on demand
 * here; an incrementally-maintained `Map<value,count>` index is a later
 * optimization (see docs/SSRM_WORKER_PLAN.md §5).
 */

import type { SsrmAggregation, SsrmQueryOptions } from './types.js';

/** Default dot-path value getter (mirrors the query engine's). */
function getByPath(row: unknown, path: string): unknown {
  if (row == null || typeof row !== 'object') return undefined;
  if (!path.includes('.')) return (row as Record<string, unknown>)[path];
  let cur: unknown = row;
  for (const part of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

/**
 * Distinct, display-sorted values of `colId` across every row. Nullish
 * cells are skipped (AG-Grid's set filter renders its own "(Blanks)"
 * entry). Dedup is by string identity — set filters compare values as
 * strings — but the original value is preserved for the grid.
 */
export function distinctValues(
  rows: readonly unknown[],
  colId: string,
  options: SsrmQueryOptions = {},
): unknown[] {
  const getValue = options.getValue ?? getByPath;
  const seen = new Set<string>();
  const out: unknown[] = [];
  for (const row of rows) {
    const v = getValue(row, colId);
    if (v == null || v === '') continue;
    const key = String(v);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  out.sort((a, b) => {
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a).localeCompare(String(b));
  });
  return out;
}

/**
 * Grand-total aggregates over a row set (the caller filters first, so
 * these are over the FILTERED full dataset, not the loaded rows). One
 * aggregate per column id, keyed by colId. Nullish / non-numeric cells
 * are skipped; an empty column yields 0.
 */
export function computeAggregates(
  rows: readonly unknown[],
  specs: readonly SsrmAggregation[],
  options: SsrmQueryOptions = {},
): Record<string, number> {
  const getValue = options.getValue ?? getByPath;
  const out: Record<string, number> = {};
  for (const { colId, func } of specs) {
    let sum = 0;
    let count = 0;
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const row of rows) {
      const v = getValue(row, colId);
      if (v == null || v === '') continue;
      const n = typeof v === 'number' ? v : Number(v);
      if (Number.isNaN(n)) continue;
      sum += n;
      count += 1;
      if (n < min) min = n;
      if (n > max) max = n;
    }
    out[colId] =
      func === 'sum' ? sum
      : func === 'avg' ? (count ? sum / count : 0)
      : func === 'min' ? (count ? min : 0)
      : func === 'max' ? (count ? max : 0)
      : count;
  }
  return out;
}
