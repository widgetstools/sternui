/**
 * Perspective expression rendering for AG filter conditions the native
 * filter operators cannot express (P4a):
 *
 * • `notContains` — no native operator; rendered as
 *   `is_null(col) or not(match(lower(col), 'needle'))` (nulls pass,
 *   matching AG's semantics — a missing value "does not contain").
 * • OR-combined per-column conditions — Perspective's `filter_op` is
 *   VIEW-GLOBAL ("and" | "or"), so it cannot express AG's semantics of
 *   (colA cond1 OR colA cond2) AND (colB …). Instead each OR-combined
 *   column becomes ONE boolean expression column filtered `== true`,
 *   preserving clause-level AND across columns.
 * • set filters whose selection includes `null` — native `in` never
 *   matches nulls (verified against the engine), so these render as
 *   `is_null(col) or string(col) == 'v1' or …` (the `string()` cast
 *   keeps the comparison type-safe on non-string columns).
 * • the quick filter — one boolean expression ORing a case-insensitive
 *   `match` across the configured string columns.
 *
 * Text matching notes (verified against Perspective 3.8, see the P4a
 * probes): native `contains` / `begins with` / `ends with` are
 * case-INSENSITIVE literal (non-regex) matches — AG's default text
 * semantics. `match()` in expressions IS regex, so needles rendered
 * here are regex-escaped then ExprTK-string-escaped, and lower() is
 * applied to both sides for the same case-insensitive behavior.
 * Native `==`/`!=` are case-SENSITIVE (a documented divergence from
 * AG's default case-insensitive text `equals`).
 */

import { escapePerspectiveString } from '../filters/perspectiveExpr.js';

/** Reserved prefix for every expression column the pull plane creates. */
export const EXPR_PREFIX = '__ssrm_';
/** Boolean expression column carrying the quick filter. */
export const QUICK_FILTER_EXPR = `${EXPR_PREFIX}qf`;
/** Constant expression column used to group the grand-total rollup view. */
export const ROLLUP_GROUP_EXPR = `${EXPR_PREFIX}rollup`;

/** Alias of the boolean expression column carrying `colId`'s filter. */
export function filterExprName(colId: string): string {
  return `${EXPR_PREFIX}f_${colId}`;
}

/** `"col"` — a Perspective expression column reference. */
export function columnRef(field: string): string {
  return `"${field.replace(/"/g, '\\"')}"`;
}

const REGEX_SPECIALS = /[\\^$.|?*+()[\]{}]/g;

/**
 * Literal needle → regex-safe → ExprTK-string-safe, lowercased for
 * case-insensitive matching against `lower(col)`.
 */
export function regexNeedle(needle: string): string {
  return escapePerspectiveString(needle.toLowerCase().replace(REGEX_SPECIALS, '\\$&'));
}

/** ExprTK string literal (single-quoted; escapes `\` and `'`). */
export function stringLiteral(value: string): string {
  return `'${escapePerspectiveString(value)}'`;
}

// ─── condition → boolean expression fragment ────────────────────────

/**
 * A simple AG condition rendered as a boolean Perspective expression
 * fragment, or `null` when the condition is inexpressible (the caller
 * reports it — never guesses).
 */
export function conditionExpr(
  field: string,
  type: string | undefined,
  value: unknown,
  valueTo: unknown,
  filterType: string | undefined,
): string | null {
  const col = columnRef(field);
  const isDate = filterType === 'date';
  const term = (v: unknown): string | null => {
    if (typeof v === 'number') return String(v);
    if (typeof v === 'boolean') return String(v);
    if (typeof v !== 'string') return null;
    return isDate ? dateLiteral(v) : stringLiteral(v);
  };
  switch (type) {
    case 'equals':
      return wrap(col, '==', term(value));
    case 'notEqual':
      return wrap(col, '!=', term(value));
    case 'greaterThan':
      return wrap(col, '>', term(value));
    case 'greaterThanOrEqual':
      return wrap(col, '>=', term(value));
    case 'lessThan':
      return wrap(col, '<', term(value));
    case 'lessThanOrEqual':
      return wrap(col, '<=', term(value));
    case 'inRange': {
      const from = wrap(col, '>=', term(value));
      const to = wrap(col, '<=', term(valueTo));
      return from && to ? `(${from} and ${to})` : null;
    }
    case 'blank':
      return `is_null(${col})`;
    case 'notBlank':
      return `not(is_null(${col}))`;
    case 'contains':
      return typeof value === 'string'
        ? `match(lower(${col}), '${regexNeedle(value)}')`
        : null;
    case 'notContains':
      return typeof value === 'string'
        ? `(is_null(${col}) or not(match(lower(${col}), '${regexNeedle(value)}')))`
        : null;
    case 'startsWith':
      return typeof value === 'string'
        ? `match(lower(${col}), '^${regexNeedle(value)}')`
        : null;
    case 'endsWith':
      return typeof value === 'string'
        ? `match(lower(${col}), '${regexNeedle(value)}$')`
        : null;
    default:
      return null;
  }
}

function wrap(col: string, op: string, term: string | null): string | null {
  return term === null ? null : `${col} ${op} ${term}`;
}

/**
 * AG date filter terms are `'YYYY-MM-DD HH:mm:ss'` strings; inside an
 * expression a `date` column compares against `date(y, m, d)`
 * (verified). Sub-day precision cannot target a date column — `null`
 * (inexpressible) rather than silently truncating.
 */
function dateLiteral(value: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T]00:00:00)?$/.exec(value.trim());
  if (!m) return null;
  return `date(${Number(m[1])}, ${Number(m[2])}, ${Number(m[3])})`;
}

/**
 * Set-filter selection including null → boolean expression. `string()`
 * casts the column so equality is type-safe whatever the column type.
 */
export function setWithNullExpr(field: string, values: Array<string | null>): string {
  const col = columnRef(field);
  const parts = values
    .filter((v): v is string => v !== null)
    .map((v) => `string(${col}) == ${stringLiteral(v)}`);
  return [`is_null(${col})`, ...parts].join(' or ');
}

/**
 * Quick filter: case-insensitive contains across the configured string
 * columns (AG's quick filter tokenizes on spaces and ANDs the tokens —
 * mirrored here: every token must match at least one column).
 */
export function quickFilterExpr(text: string, columns: readonly string[]): string | null {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0 || columns.length === 0) return null;
  const perToken = tokens.map((token) => {
    const needle = regexNeedle(token);
    const perColumn = columns.map((c) => `match(lower(${columnRef(c)}), '${needle}')`);
    return perColumn.length === 1 ? perColumn[0]! : `(${perColumn.join(' or ')})`;
  });
  return perToken.join(' and ');
}
