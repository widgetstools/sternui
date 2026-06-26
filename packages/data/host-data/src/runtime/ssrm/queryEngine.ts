/**
 * Pure SSRM query engine — runs entirely inside the SharedWorker.
 *
 * Given the provider's row cache and an {@link SsrmGetRowsRequest}, it
 * filters → sorts → slices and returns just the requested block plus the
 * exact total count. No DOM, no AG-Grid, no React — safe to run in a
 * worker thread and unit-testable in isolation.
 *
 * Phase 1 scope: flat filtering (text / number / date / set, with AND/OR
 * combined conditions) and multi-column null-safe sorting. Grouping,
 * aggregation and pivot are not yet honoured (the request carries them
 * but they're ignored) — see docs/SSRM_WORKER_PLAN.md for the roadmap.
 */

import type {
  SsrmGetRowsRequest,
  SsrmQueryOptions,
  SsrmQueryResult,
  SsrmSortModelItem,
} from './types.js';

/** Read `obj.a.b.c` for colId `"a.b.c"`; plain key lookup for flat ids. */
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

// ─── Filtering ──────────────────────────────────────────────────────

interface SimpleFilterModel {
  filterType?: string;
  type?: string;
  filter?: unknown;
  filterTo?: unknown;
  dateFrom?: string | null;
  dateTo?: string | null;
  values?: readonly unknown[];
}

interface CombinedFilterModel {
  filterType?: string;
  operator?: 'AND' | 'OR';
  /** New-style AG-Grid combined model. */
  conditions?: readonly SimpleFilterModel[];
  /** Legacy two-condition shape. */
  condition1?: SimpleFilterModel;
  condition2?: SimpleFilterModel;
}

const isBlank = (v: unknown): boolean =>
  v === null || v === undefined || v === '';

function asNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '') return Number(v);
  return Number.NaN;
}

/** Parse AG-Grid date filter strings (`YYYY-MM-DD[ HH:mm:ss]`) + cell values. */
function asTime(v: unknown): number {
  if (v == null) return Number.NaN;
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') return v;
  const t = Date.parse(String(v).replace(' ', 'T'));
  return Number.isNaN(t) ? Number.NaN : t;
}

function matchesText(value: unknown, m: SimpleFilterModel): boolean {
  const type = m.type ?? 'contains';
  if (type === 'blank') return isBlank(value);
  if (type === 'notBlank') return !isBlank(value);
  const hay = value == null ? '' : String(value).toLowerCase();
  const needle = m.filter == null ? '' : String(m.filter).toLowerCase();
  switch (type) {
    case 'equals': return hay === needle;
    case 'notEqual': return hay !== needle;
    case 'contains': return hay.includes(needle);
    case 'notContains': return !hay.includes(needle);
    case 'startsWith': return hay.startsWith(needle);
    case 'endsWith': return hay.endsWith(needle);
    default: return true;
  }
}

function matchesNumber(value: unknown, m: SimpleFilterModel): boolean {
  const type = m.type ?? 'equals';
  if (type === 'blank') return isBlank(value);
  if (type === 'notBlank') return !isBlank(value);
  const v = asNumber(value);
  const a = asNumber(m.filter);
  if (Number.isNaN(v)) return false;
  switch (type) {
    case 'equals': return v === a;
    case 'notEqual': return v !== a;
    case 'greaterThan': return v > a;
    case 'greaterThanOrEqual': return v >= a;
    case 'lessThan': return v < a;
    case 'lessThanOrEqual': return v <= a;
    case 'inRange': {
      const b = asNumber(m.filterTo);
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      return v >= lo && v <= hi;
    }
    default: return true;
  }
}

function matchesDate(value: unknown, m: SimpleFilterModel): boolean {
  const type = m.type ?? 'equals';
  if (type === 'blank') return isBlank(value);
  if (type === 'notBlank') return !isBlank(value);
  const v = asTime(value);
  const from = asTime(m.dateFrom);
  if (Number.isNaN(v)) return false;
  switch (type) {
    case 'equals': return v === from;
    case 'notEqual': return v !== from;
    case 'greaterThan': return v > from;
    case 'lessThan': return v < from;
    case 'inRange': {
      const to = asTime(m.dateTo);
      const lo = Math.min(from, to);
      const hi = Math.max(from, to);
      return v >= lo && v <= hi;
    }
    default: return true;
  }
}

function matchesSet(value: unknown, m: SimpleFilterModel): boolean {
  // No `values` key ⇒ "select all" ⇒ everything passes.
  if (!m.values) return true;
  const key = value == null ? null : String(value);
  for (const candidate of m.values) {
    if ((candidate == null ? null : String(candidate)) === key) return true;
  }
  return false;
}

function matchesSimple(value: unknown, m: SimpleFilterModel): boolean {
  switch (m.filterType) {
    case 'number': return matchesNumber(value, m);
    case 'date': return matchesDate(value, m);
    case 'set': return matchesSet(value, m);
    case 'text':
    default: return matchesText(value, m);
  }
}

function matchesColumn(value: unknown, model: unknown): boolean {
  if (model == null || typeof model !== 'object') return true;
  const combined = model as CombinedFilterModel;
  const conditions =
    combined.conditions ??
    (combined.condition1 && combined.condition2
      ? [combined.condition1, combined.condition2]
      : null);
  if (conditions && conditions.length > 0) {
    const op = combined.operator ?? 'AND';
    return op === 'OR'
      ? conditions.some((c) => matchesSimple(value, c))
      : conditions.every((c) => matchesSimple(value, c));
  }
  // Multi-filter: every sub-model must pass.
  const multi = model as { filterType?: string; filterModels?: readonly (SimpleFilterModel | null)[] };
  if (multi.filterType === 'multi' && Array.isArray(multi.filterModels)) {
    return multi.filterModels.every((sub) => sub == null || matchesSimple(value, sub));
  }
  return matchesSimple(value, model as SimpleFilterModel);
}

function applyFilters(
  rows: readonly unknown[],
  filterModel: Record<string, unknown> | null | undefined,
  getValue: (row: unknown, colId: string) => unknown,
): readonly unknown[] {
  if (!filterModel) return rows;
  const entries = Object.entries(filterModel);
  if (entries.length === 0) return rows;
  return rows.filter((row) =>
    entries.every(([colId, model]) => matchesColumn(getValue(row, colId), model)),
  );
}

/**
 * Filter a row set by an AG-Grid filter model. Exposed so the aggregate
 * pass can reuse the exact same predicates the query engine applies, so
 * grand totals always match what the grid shows.
 */
export function filterRows(
  rows: readonly unknown[],
  filterModel: Record<string, unknown> | null | undefined,
  options: SsrmQueryOptions = {},
): readonly unknown[] {
  return applyFilters(rows, filterModel, options.getValue ?? getByPath);
}

// ─── Sorting ────────────────────────────────────────────────────────

const isNullish = (v: unknown): boolean => v == null || v === '';

/**
 * Type-aware comparison of two NON-null values. Numbers (and
 * numeric-looking strings) compare numerically; everything else by
 * locale-aware string compare so `"Apple" < "banana"`.
 */
function compareNonNull(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const an = asNumber(a);
  const bn = asNumber(b);
  if (!Number.isNaN(an) && !Number.isNaN(bn) && an !== bn) return an - bn;
  return String(a).localeCompare(String(b));
}

function applySort(
  rows: readonly unknown[],
  sortModel: readonly SsrmSortModelItem[] | undefined,
  getValue: (row: unknown, colId: string) => unknown,
): readonly unknown[] {
  if (!sortModel || sortModel.length === 0) return rows;
  // Slice first — Array.sort mutates, and the cache snapshot is shared.
  const out = rows.slice();
  out.sort((ra, rb) => {
    for (const { colId, sort } of sortModel) {
      const va = getValue(ra, colId);
      const vb = getValue(rb, colId);
      const aNull = isNullish(va);
      const bNull = isNullish(vb);
      if (aNull || bNull) {
        if (aNull && bNull) continue; // tie on this key — fall through
        // Nullish always sorts LAST, independent of asc/desc direction.
        return aNull ? 1 : -1;
      }
      const cmp = compareNonNull(va, vb);
      if (cmp !== 0) return sort === 'desc' ? -cmp : cmp;
    }
    return 0;
  });
  return out;
}

// ─── Entry point ────────────────────────────────────────────────────

/**
 * Row-shaping hook: given the sliced block and the full filtered set (for
 * dataset-wide aggregate expressions), return render-ready rows. Injected
 * by the caller so the query engine itself stays dependency-free — the
 * shaper (which pulls in the expression engine) lives in `shaping.ts`.
 */
export type SsrmShapeBlock = (
  block: readonly unknown[],
  allFiltered: readonly unknown[],
) => unknown[];

/**
 * Run one SSRM block request against an in-memory row set.
 *
 * @param rows       The full row set (e.g. `[...providerSlot.cache.values()]`).
 * @param request    The grid's block request.
 * @param options    Value resolution overrides.
 * @param shapeBlock Optional shaper applied to the block before return
 *                   (receives the full filtered set as `allRows`).
 */
export function runQuery(
  rows: readonly unknown[],
  request: SsrmGetRowsRequest,
  options: SsrmQueryOptions = {},
  shapeBlock?: SsrmShapeBlock,
): SsrmQueryResult {
  const getValue = options.getValue ?? getByPath;

  const filtered = applyFilters(rows, request.filterModel, getValue);
  const sorted = applySort(filtered, request.sortModel, getValue);

  const start = Math.max(0, request.startRow ?? 0);
  const end = request.endRow ?? sorted.length;
  const block = sorted.slice(start, end);

  const shaped = shapeBlock ? shapeBlock(block, filtered) : (block as unknown[]);
  return { rows: shaped, lastRow: sorted.length };
}
