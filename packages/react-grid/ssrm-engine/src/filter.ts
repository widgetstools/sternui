import type { SsrmColumnAccess, SsrmColumnResolver } from './columnAccess.js';
import type { SsrmFilterItem, SsrmFilterModel } from './types.js';

/**
 * AG filter models compiled to predicates over a column ACCESSOR.
 *
 * Every operator AG's text, number, date and set filters emit is handled, plus
 * compound `conditions` with AND/OR and the multi-filter wrapper. Unlike the
 * Perspective path there is no "unmappable" case: this engine evaluates the
 * filter itself, so it never has to choose between a wrong book and an
 * unfiltered one.
 *
 * ## A calculated column filters like any other
 *
 * Nothing below knows whether a column is stored or computed. `compileFilter`
 * resolves each entry through {@link SsrmColumnResolver}, which answers a
 * compiled expression and a typed array through the same five reads — so the
 * one line that used to skip a column the store did not have (and therefore
 * turned every filter on a calculated column into a silent no-op) is gone
 * rather than duplicated.
 *
 * ## Null handling, which is where grids disagree
 *
 * A null is NOT less than everything and it does not satisfy a comparison.
 * MEASURED on the Perspective path, where it cost real time: `null > 95` is
 * false in JavaScript — so on the client-side row model a null row never
 * matches `greaterThan` — but Perspective's expression language answers TRUE
 * for the same comparison, so the same rule painted different rows on the two
 * surfaces. This engine follows the JavaScript/AG semantics: **only `blank`
 * matches a null.** Anything else excludes it.
 *
 * **`blank` does not match a NaN**, and that holds for a calculated NaN too:
 * `access.isNull` is true only for null and undefined. A NaN is a value the
 * feed sent or the expression produced, and folding it into "blank" would make
 * a bad tick indistinguishable from a missing quote.
 */

export type RowPredicate = (offset: number) => boolean;

const ALWAYS: RowPredicate = () => true;

/** AG sends dates as 'YYYY-MM-DD HH:mm:ss' local strings in the filter model. */
function parseFilterDate(value: unknown): number {
  if (value === null || value === undefined || value === '') return Number.NaN;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  const text = String(value).trim().replace(' ', 'T');
  return Date.parse(text);
}

function numberOf(access: SsrmColumnAccess, offset: number): number | null {
  if (access.isNull(offset)) return null;
  return access.numberAt(offset);
}

/**
 * One simple (non-compound) condition.
 *
 * Returns null for a shape this does not recognise, so the caller can decide.
 * It does NOT silently pass everything: an unrecognised condition that quietly
 * matched every row would widen the book, which on a blotter is the dangerous
 * direction.
 */
function simplePredicate(access: SsrmColumnAccess, item: SsrmFilterItem): RowPredicate | null {
  const kind = item.filterType ?? 'text';

  if (item.type === 'blank') return (o) => access.isNull(o);
  if (item.type === 'notBlank') return (o) => !access.isNull(o);

  if (kind === 'set') {
    const values = item.values ?? [];
    // AG represents "blank" in a set filter as null in `values`.
    const wanted = new Set(values.map((v) => (v === null || v === undefined ? null : String(v))));
    return (o) => {
      const raw = access.isNull(o) ? null : String(access.valueAt(o));
      return wanted.has(raw);
    };
  }

  if (kind === 'number') {
    const a = item.filter === null || item.filter === undefined ? null : Number(item.filter);
    const b = item.filterTo === null || item.filterTo === undefined ? null : Number(item.filterTo);
    switch (item.type) {
      case 'equals': return (o) => numberOf(access, o) === a;
      case 'notEqual': return (o) => { const v = numberOf(access, o); return v !== null && v !== a; };
      case 'greaterThan': return (o) => { const v = numberOf(access, o); return v !== null && a !== null && v > a; };
      case 'greaterThanOrEqual': return (o) => { const v = numberOf(access, o); return v !== null && a !== null && v >= a; };
      case 'lessThan': return (o) => { const v = numberOf(access, o); return v !== null && a !== null && v < a; };
      case 'lessThanOrEqual': return (o) => { const v = numberOf(access, o); return v !== null && a !== null && v <= a; };
      case 'inRange': return (o) => {
        const v = numberOf(access, o);
        return v !== null && a !== null && b !== null && v >= Math.min(a, b) && v <= Math.max(a, b);
      };
      default: return null;
    }
  }

  if (kind === 'date') {
    const a = parseFilterDate(item.dateFrom ?? item.filter);
    const b = parseFilterDate(item.dateTo ?? item.filterTo);
    const at = (o: number) => numberOf(access, o);
    switch (item.type) {
      case 'equals': return (o) => { const v = at(o); return v !== null && sameDay(v, a); };
      case 'notEqual': return (o) => { const v = at(o); return v !== null && !sameDay(v, a); };
      case 'greaterThan': return (o) => { const v = at(o); return v !== null && !Number.isNaN(a) && v > a; };
      case 'lessThan': return (o) => { const v = at(o); return v !== null && !Number.isNaN(a) && v < a; };
      case 'inRange': return (o) => {
        const v = at(o);
        return v !== null && !Number.isNaN(a) && !Number.isNaN(b) && v >= a && v <= b;
      };
      default: return null;
    }
  }

  // Text. AG compares case-insensitively unless `caseSensitive` is set, and the
  // default is insensitive — matching that is what makes a filter typed in the
  // grid behave the same here.
  const needle = item.filter === null || item.filter === undefined ? '' : String(item.filter).toLowerCase();
  const hay = (o: number) => access.stringAt(o)?.toLowerCase() ?? null;
  switch (item.type) {
    case 'equals': return (o) => hay(o) === needle;
    case 'notEqual': return (o) => { const v = hay(o); return v !== null && v !== needle; };
    case 'contains': return (o) => (hay(o) ?? '').includes(needle) && !access.isNull(o);
    case 'notContains': return (o) => { const v = hay(o); return v !== null && !v.includes(needle); };
    case 'startsWith': return (o) => { const v = hay(o); return v !== null && v.startsWith(needle); };
    case 'endsWith': return (o) => { const v = hay(o); return v !== null && v.endsWith(needle); };
    default: return null;
  }
}

function sameDay(a: number, b: number): boolean {
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  const x = new Date(a);
  const y = new Date(b);
  return (
    x.getFullYear() === y.getFullYear() &&
    x.getMonth() === y.getMonth() &&
    x.getDate() === y.getDate()
  );
}

/** One column's entry, including compound and multi shapes. */
function columnPredicate(access: SsrmColumnAccess, item: SsrmFilterItem): RowPredicate | null {
  // Multi-filter: AG nests one entry per sub-filter, and they AND together.
  if (item.filterType === 'multi' && Array.isArray(item.filterModels)) {
    const parts = item.filterModels
      .filter((m): m is SsrmFilterItem => m !== null && m !== undefined)
      .map((m) => columnPredicate(access, m))
      .filter((p): p is RowPredicate => p !== null);
    if (parts.length === 0) return null;
    return (o) => parts.every((p) => p(o));
  }

  if (Array.isArray(item.conditions) && item.conditions.length > 0) {
    const parts = item.conditions
      .map((c) => columnPredicate(access, c))
      .filter((p): p is RowPredicate => p !== null);
    if (parts.length === 0) return null;
    // AG 33+ allows more than two conditions; OR/AND applies across all of them.
    return (item.operator ?? 'AND').toUpperCase() === 'OR'
      ? (o) => parts.some((p) => p(o))
      : (o) => parts.every((p) => p(o));
  }

  return simplePredicate(access, item);
}

/**
 * The whole filter model. Column entries AND together, which is what AG does.
 *
 * A column naming neither a field nor a calculated column is IGNORED rather
 * than matching nothing: a stale filter for a removed column would otherwise
 * empty the blotter with no way to tell why.
 */
export function compileFilter(
  columns: SsrmColumnResolver,
  model: SsrmFilterModel | null | undefined,
): RowPredicate {
  if (!model) return ALWAYS;
  const parts: RowPredicate[] = [];
  for (const field of Object.keys(model)) {
    const access = columns.get(field);
    if (access === undefined) continue;
    const predicate = columnPredicate(access, model[field]);
    if (predicate !== null) parts.push(predicate);
  }
  if (parts.length === 0) return ALWAYS;
  if (parts.length === 1) return parts[0];
  return (o) => parts.every((p) => p(o));
}

/**
 * Quick filter: every whitespace-separated token must appear in SOME column.
 *
 * AG's own quick filter is a client-side-row-model option and does nothing
 * under the server row model, so the text is handed here instead. Matching AG's
 * semantics means per-token OR across columns, then AND across tokens.
 */
export function compileQuickFilter(
  columns: SsrmColumnResolver,
  text: string | null | undefined,
  fields: readonly string[],
): RowPredicate {
  const tokens = (text ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0 || fields.length === 0) return ALWAYS;
  const searchable = fields
    .map((field) => columns.get(field))
    .filter((access): access is SsrmColumnAccess => access !== undefined);
  if (searchable.length === 0) return ALWAYS;

  return (offset) => {
    // Build the row's searchable text once per row, not once per token.
    let haystack = '';
    for (const access of searchable) {
      const value = access.stringAt(offset);
      if (value === null) continue;
      haystack += value.toLowerCase();
      haystack += ' ';
    }
    return tokens.every((token) => haystack.includes(token));
  };
}
