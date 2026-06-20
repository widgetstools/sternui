/**
 * serverSideQuery — the hub-side in-memory query engine for Server-Side Row
 * Model views: compile AG-Grid `filterModel` / `sortModel` into row predicates
 * and comparators, and extract distinct values for the Set Filter. Grouping +
 * aggregation build on these (see serverSideGroup).
 *
 * Pure and framework-free so the whole query layer unit-tests without a grid.
 * Only the filter/sort/set-filter shapes the blotter actually emits are handled;
 * unknown shapes fail OPEN (row passes) so a new filter type never silently
 * blanks the grid.
 */

export type Row = Record<string, unknown>;

// ─── Filter model shapes (subset of AG-Grid's) ──────────────────────

interface SimpleTextFilter {
  filterType: 'text';
  type: 'contains' | 'notContains' | 'equals' | 'notEqual' | 'startsWith' | 'endsWith' | 'blank' | 'notBlank';
  filter?: string;
}
interface SimpleNumberFilter {
  filterType: 'number';
  type: 'equals' | 'notEqual' | 'lessThan' | 'lessThanOrEqual' | 'greaterThan' | 'greaterThanOrEqual' | 'inRange' | 'blank' | 'notBlank';
  filter?: number;
  filterTo?: number;
}
interface SetFilter {
  filterType: 'set';
  values?: (string | null)[];
}
interface DateFilter {
  filterType: 'date';
  type: 'equals' | 'notEqual' | 'lessThan' | 'greaterThan' | 'inRange' | 'blank' | 'notBlank';
  dateFrom?: string;
  dateTo?: string;
}
interface CombinedFilter {
  filterType?: string;
  operator: 'AND' | 'OR';
  conditions: ColumnFilter[];
}
interface MultiFilter {
  filterType: 'multi';
  filterModels: (ColumnFilter | null)[];
}
type ColumnFilter =
  | SimpleTextFilter | SimpleNumberFilter | SetFilter | DateFilter | CombinedFilter | MultiFilter;

export type FilterModel = Record<string, ColumnFilter>;
export interface SortModelItem { colId: string; sort: 'asc' | 'desc' }
export type SortModel = SortModelItem[];

const asString = (v: unknown): string => (v == null ? '' : String(v));
const asNumber = (v: unknown): number => (typeof v === 'number' ? v : Number(v));

function textPass(f: SimpleTextFilter, raw: unknown): boolean {
  const v = asString(raw).toLowerCase();
  const q = (f.filter ?? '').toLowerCase();
  switch (f.type) {
    case 'contains': return v.includes(q);
    case 'notContains': return !v.includes(q);
    case 'equals': return v === q;
    case 'notEqual': return v !== q;
    case 'startsWith': return v.startsWith(q);
    case 'endsWith': return v.endsWith(q);
    case 'blank': return v === '';
    case 'notBlank': return v !== '';
    default: return true;
  }
}

function numberPass(f: SimpleNumberFilter, raw: unknown): boolean {
  if (f.type === 'blank') return raw == null;
  if (f.type === 'notBlank') return raw != null;
  const v = asNumber(raw);
  const a = asNumber(f.filter);
  if (Number.isNaN(v)) return false;
  switch (f.type) {
    case 'equals': return v === a;
    case 'notEqual': return v !== a;
    case 'lessThan': return v < a;
    case 'lessThanOrEqual': return v <= a;
    case 'greaterThan': return v > a;
    case 'greaterThanOrEqual': return v >= a;
    case 'inRange': return v >= a && v <= asNumber(f.filterTo);
    default: return true;
  }
}

function datePass(f: DateFilter, raw: unknown): boolean {
  if (f.type === 'blank') return raw == null;
  if (f.type === 'notBlank') return raw != null;
  const v = asString(raw);
  const a = (f.dateFrom ?? '').slice(0, 10);
  const cell = v.slice(0, 10);
  switch (f.type) {
    case 'equals': return cell === a;
    case 'notEqual': return cell !== a;
    case 'lessThan': return cell < a;
    case 'greaterThan': return cell > a;
    case 'inRange': return cell >= a && cell <= (f.dateTo ?? '').slice(0, 10);
    default: return true;
  }
}

function setPass(f: SetFilter, raw: unknown): boolean {
  // No `values` = filter inactive (everything passes). Empty array = nothing.
  if (!f.values) return true;
  const v = raw == null ? null : String(raw);
  return f.values.some((sv) => sv === v);
}

/** Compile one column's filter (handles combined AND/OR + multi-filter). */
function compileColumn(field: string, def: ColumnFilter): (row: Row) => boolean {
  if ((def as CombinedFilter).operator && (def as CombinedFilter).conditions) {
    const c = def as CombinedFilter;
    const preds = c.conditions.map((cond) => compileColumn(field, cond));
    return c.operator === 'AND'
      ? (row) => preds.every((p) => p(row))
      : (row) => preds.some((p) => p(row));
  }
  if ((def as MultiFilter).filterType === 'multi') {
    const m = def as MultiFilter;
    const preds = m.filterModels.filter(Boolean).map((sub) => compileColumn(field, sub!));
    // AG Multi Filter: a row shows only if it passes EVERY active sub-filter.
    return (row) => preds.every((p) => p(row));
  }
  const ft = (def as { filterType?: string }).filterType;
  if (ft === 'text') return (row) => textPass(def as SimpleTextFilter, row[field]);
  if (ft === 'number') return (row) => numberPass(def as SimpleNumberFilter, row[field]);
  if (ft === 'date') return (row) => datePass(def as DateFilter, row[field]);
  if (ft === 'set') return (row) => setPass(def as SetFilter, row[field]);
  return () => true; // unknown shape → fail open
}

/** Compile a full filterModel into one AND-across-columns predicate. */
export function compileFilter(model: FilterModel | undefined): (row: Row) => boolean {
  if (!model) return () => true;
  const preds = Object.entries(model).map(([field, def]) => compileColumn(field, def));
  if (preds.length === 0) return () => true;
  return (row) => preds.every((p) => p(row));
}

/** Type-aware compare: numbers numerically, everything else as strings. */
function compareValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const an = Number(a);
  const bn = Number(b);
  if (!Number.isNaN(an) && !Number.isNaN(bn) && typeof a !== 'boolean' && typeof b !== 'boolean') {
    return an - bn;
  }
  const as = String(a);
  const bs = String(b);
  return as < bs ? -1 : as > bs ? 1 : 0;
}

/** Compile a sortModel into a stable multi-column comparator. */
export function compileSort(model: SortModel | undefined): ((a: Row, b: Row) => number) | null {
  if (!model || model.length === 0) return null;
  return (a, b) => {
    for (const { colId, sort } of model) {
      const cmp = compareValues(a[colId], b[colId]);
      if (cmp !== 0) return sort === 'asc' ? cmp : -cmp;
    }
    return 0;
  };
}

/**
 * Distinct values of a column over the given rows, for the Set Filter's value
 * list. Sorted, stringified (Set Filter compares strings); `null` preserved as
 * the blank entry.
 */
export function distinctValues(rows: Iterable<Row>, field: string): (string | null)[] {
  const seen = new Set<string | null>();
  for (const row of rows) {
    const v = row[field];
    seen.add(v == null ? null : String(v));
  }
  const out = [...seen];
  out.sort((a, b) => (a == null ? -1 : b == null ? 1 : a < b ? -1 : a > b ? 1 : 0));
  return out;
}

// ─── Grouping + aggregation ──────────────────────────────────────────

export interface ColumnVO { id: string; field?: string }
export interface ValueColumnVO { id: string; field?: string; aggFunc?: string }

/**
 * The slice of AG-Grid's `IServerSideGetRowsRequest` the hub query honours.
 * `rowGroupCols` empty ⇒ a flat (leaf) view; otherwise `groupKeys` is the
 * parent path being expanded and we return the next level's group rows.
 */
export interface QueryRequest {
  filterModel?: FilterModel;
  sortModel?: SortModel;
  rowGroupCols?: ColumnVO[];
  valueCols?: ValueColumnVO[];
  groupKeys?: string[];
}

const colField = (c: ColumnVO): string => c.field ?? c.id;

function applyAgg(fn: string, rows: Row[], field: string): unknown {
  if (fn === 'count') return rows.length;
  const nums: number[] = [];
  for (const r of rows) {
    const n = asNumber(r[field]);
    if (!Number.isNaN(n)) nums.push(n);
  }
  switch (fn) {
    case 'sum': return nums.reduce((a, b) => a + b, 0);
    case 'avg': return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
    case 'min': return nums.length ? Math.min(...nums) : null;
    case 'max': return nums.length ? Math.max(...nums) : null;
    case 'first': return rows.length ? rows[0]![field] : null;
    case 'last': return rows.length ? rows[rows.length - 1]![field] : null;
    default: return nums.reduce((a, b) => a + b, 0); // unknown → sum
  }
}

function aggregateRows(rows: Row[], valueCols: ValueColumnVO[]): Row {
  const out: Row = {};
  for (const vc of valueCols) {
    const field = colField(vc);
    out[field] = applyAgg(vc.aggFunc ?? 'sum', rows, field);
  }
  return out;
}

/**
 * Run a full SSRM query against the provider's rows for ONE block level:
 * filter → descend to `groupKeys` → either group+aggregate the next level or
 * return leaf rows → sort. Returns the ordered result rows; the hub slices the
 * requested `[startRow, endRow)` and reports `length` as the row count.
 *
 * Group rows carry the group column's key under its field plus the aggregated
 * value columns — AG-Grid renders them as groups because `rowGroupCols` is set
 * and the level is non-leaf.
 */
export function runQuery(allRows: Iterable<Row>, req: QueryRequest): Row[] {
  const filter = compileFilter(req.filterModel);
  const groupCols = req.rowGroupCols ?? [];
  const groupKeys = req.groupKeys ?? [];

  const atPath: Row[] = [];
  for (const r of allRows) {
    if (!filter(r)) continue;
    let match = true;
    for (let i = 0; i < groupKeys.length; i++) {
      if (String(r[colField(groupCols[i]!)]) !== groupKeys[i]) { match = false; break; }
    }
    if (match) atPath.push(r);
  }

  const sort = compileSort(req.sortModel);

  if (groupKeys.length < groupCols.length) {
    const field = colField(groupCols[groupKeys.length]!);
    const valueCols = req.valueCols ?? [];
    const groups = new Map<string, Row[]>();
    for (const r of atPath) {
      const key = String(r[field]);
      const bucket = groups.get(key);
      if (bucket) bucket.push(r);
      else groups.set(key, [r]);
    }
    const groupRows: Row[] = [];
    for (const [key, rs] of groups) {
      groupRows.push({ [field]: key, ...aggregateRows(rs, valueCols) });
    }
    if (sort) groupRows.sort(sort);
    else groupRows.sort((a, b) => (String(a[field]) < String(b[field]) ? -1 : 1));
    return groupRows;
  }

  return sort ? atPath.sort(sort) : atPath;
}
