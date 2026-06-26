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

import type { SsrmQueryOptions } from './types.js';

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
