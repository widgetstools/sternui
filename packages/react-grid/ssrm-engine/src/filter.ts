import type { ColumnStore } from './columnStore.js';
import type { SsrmFilterItem, SsrmFilterModel } from './types.js';

/**
 * AG filter models compiled to predicates over the store.
 *
 * Every operator AG's text, number, date and set filters emit is handled, plus
 * compound `conditions` with AND/OR and the multi-filter wrapper. Unlike the
 * Perspective path there is no "unmappable" case: this engine evaluates the
 * filter itself, so it never has to choose between a wrong book and an
 * unfiltered one.
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

function textOf(store: ColumnStore, field: string, offset: number): string | null {
  return store.stringAt(field, offset);
}

function numberOf(store: ColumnStore, field: string, offset: number): number | null {
  if (store.isNull(field, offset)) return null;
  return store.rawAt(field, offset);
}

/**
 * One simple (non-compound) condition.
 *
 * Returns null for a shape this does not recognise, so the caller can decide.
 * It does NOT silently pass everything: an unrecognised condition that quietly
 * matched every row would widen the book, which on a blotter is the dangerous
 * direction.
 */
function simplePredicate(
  store: ColumnStore,
  field: string,
  item: SsrmFilterItem,
): RowPredicate | null {
  const kind = item.filterType ?? 'text';

  if (item.type === 'blank') return (o) => store.isNull(field, o);
  if (item.type === 'notBlank') return (o) => !store.isNull(field, o);

  if (kind === 'set') {
    const values = item.values ?? [];
    // AG represents "blank" in a set filter as null in `values`.
    const wanted = new Set(values.map((v) => (v === null || v === undefined ? null : String(v))));
    return (o) => {
      const raw = store.isNull(field, o) ? null : String(store.valueAt(field, o));
      return wanted.has(raw);
    };
  }

  if (kind === 'number') {
    const a = item.filter === null || item.filter === undefined ? null : Number(item.filter);
    const b = item.filterTo === null || item.filterTo === undefined ? null : Number(item.filterTo);
    switch (item.type) {
      case 'equals': return (o) => numberOf(store, field, o) === a;
      case 'notEqual': return (o) => { const v = numberOf(store, field, o); return v !== null && v !== a; };
      case 'greaterThan': return (o) => { const v = numberOf(store, field, o); return v !== null && a !== null && v > a; };
      case 'greaterThanOrEqual': return (o) => { const v = numberOf(store, field, o); return v !== null && a !== null && v >= a; };
      case 'lessThan': return (o) => { const v = numberOf(store, field, o); return v !== null && a !== null && v < a; };
      case 'lessThanOrEqual': return (o) => { const v = numberOf(store, field, o); return v !== null && a !== null && v <= a; };
      case 'inRange': return (o) => {
        const v = numberOf(store, field, o);
        return v !== null && a !== null && b !== null && v >= Math.min(a, b) && v <= Math.max(a, b);
      };
      default: return null;
    }
  }

  if (kind === 'date') {
    const a = parseFilterDate(item.dateFrom ?? item.filter);
    const b = parseFilterDate(item.dateTo ?? item.filterTo);
    const at = (o: number) => (store.isNull(field, o) ? null : store.rawAt(field, o));
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
  const hay = (o: number) => textOf(store, field, o)?.toLowerCase() ?? null;
  switch (item.type) {
    case 'equals': return (o) => hay(o) === needle;
    case 'notEqual': return (o) => { const v = hay(o); return v !== null && v !== needle; };
    case 'contains': return (o) => (hay(o) ?? '').includes(needle) && !store.isNull(field, o);
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
function columnPredicate(
  store: ColumnStore,
  field: string,
  item: SsrmFilterItem,
): RowPredicate | null {
  // Multi-filter: AG nests one entry per sub-filter, and they AND together.
  if (item.filterType === 'multi' && Array.isArray(item.filterModels)) {
    const parts = item.filterModels
      .filter((m): m is SsrmFilterItem => m !== null && m !== undefined)
      .map((m) => columnPredicate(store, field, m))
      .filter((p): p is RowPredicate => p !== null);
    if (parts.length === 0) return null;
    return (o) => parts.every((p) => p(o));
  }

  if (Array.isArray(item.conditions) && item.conditions.length > 0) {
    const parts = item.conditions
      .map((c) => columnPredicate(store, field, c))
      .filter((p): p is RowPredicate => p !== null);
    if (parts.length === 0) return null;
    // AG 33+ allows more than two conditions; OR/AND applies across all of them.
    return (item.operator ?? 'AND').toUpperCase() === 'OR'
      ? (o) => parts.some((p) => p(o))
      : (o) => parts.every((p) => p(o));
  }

  return simplePredicate(store, field, item);
}

/**
 * The whole filter model. Column entries AND together, which is what AG does.
 *
 * A column naming a field the store does not have is IGNORED rather than
 * matching nothing: a stale filter for a removed column would otherwise empty
 * the blotter with no way to tell why.
 */
export function compileFilter(
  store: ColumnStore,
  model: SsrmFilterModel | null | undefined,
): RowPredicate {
  if (!model) return ALWAYS;
  const parts: RowPredicate[] = [];
  for (const field of Object.keys(model)) {
    if (!store.hasField(field)) continue;
    const predicate = columnPredicate(store, field, model[field]);
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
  store: ColumnStore,
  text: string | null | undefined,
  fields: readonly string[],
): RowPredicate {
  const tokens = (text ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0 || fields.length === 0) return ALWAYS;
  const searchable = fields.filter((f) => store.hasField(f));
  if (searchable.length === 0) return ALWAYS;

  return (offset) => {
    // Build the row's searchable text once per row, not once per token.
    let haystack = '';
    for (const field of searchable) {
      if (store.isNull(field, offset)) continue;
      haystack += String(store.valueAt(field, offset)).toLowerCase();
      haystack += ' ';
    }
    return tokens.every((token) => haystack.includes(token));
  };
}
