/**
 * buildColumnDefs — turn persisted `ColumnDefinition[]` (from a data
 * provider config) into AG-Grid `ColDef[]` for MarketsGrid.
 *
 * Three behaviours, in precedence order, per column:
 *
 *   1. `valueGetter` expression present → compile it once with the
 *      CSP-safe `@starui/engine` ExpressionEngine and install a
 *      `valueGetter` that walks the AST per row. Column refs use bracket
 *      syntax with optional-chaining nested paths: `[cusip]`,
 *      `[pnl.wrapper.rdiInventoryName]` (a missing segment yields null,
 *      never throws). The getter NEVER throws — a parse failure falls
 *      back to the plain field binding, and a runtime failure falls back
 *      to the field's own value.
 *
 *   2. No expression but a dotted `field` → the existing nested-path
 *      default getter (`getValueByPath`). AG-Grid's native dot-walk
 *      can't tell a nested object (`row.a.b`) from a literal-dot key
 *      (`row['a.b']`); our helper tries the flat key first, then walks.
 *
 *   3. Flat field, no expression → untouched; AG-Grid's native fast path.
 *
 * Parsing is memoised by expression string (module-level cache) so the
 * per-row hot path is a pure AST walk — no re-parse, no `new Function`.
 */

import type { ColDef, ValueGetterParams } from 'ag-grid-community';
import { ExpressionEngine, type ExpressionNode } from '@starui/engine';
import { getValueByPath } from '@starui/shared-types';

// One shared engine + parse cache for the whole app. The engine is
// stateless across evaluations; the cache dedupes identical expressions
// so flipping providers or re-rendering never re-parses.
const engine = new ExpressionEngine();

type Compiled = { node: ExpressionNode } | { error: string };
const parseCache = new Map<string, Compiled>();

function compile(expression: string): Compiled {
  let entry = parseCache.get(expression);
  if (entry) return entry;
  try {
    entry = { node: engine.parse(expression) };
  } catch (err) {
    entry = { error: err instanceof Error ? err.message : String(err) };
    // One warning per unique bad expression — never per row.
    console.warn('[markets-grid] invalid column valueGetter expression:', expression, err);
  }
  parseCache.set(expression, entry);
  return entry;
}

/** Field value used as the runtime fallback + the `value`/`x` context. */
function fieldValue(data: unknown, field: string | undefined): unknown {
  return field ? getValueByPath(data, field) ?? null : null;
}

function makeExpressionGetter(node: ExpressionNode, field: string | undefined) {
  return (params: ValueGetterParams): unknown => {
    const raw = params.data;
    const data = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    try {
      return engine.evaluate(node, {
        data,
        columns: data,
        // Lazy so the field lookup only runs when the expression
        // actually references `value`/`x`.
        get value() {
          return fieldValue(data, field);
        },
        get x() {
          return fieldValue(data, field);
        },
      });
    } catch {
      // Never throw out of a valueGetter — degrade to the field value.
      return fieldValue(data, field);
    }
  };
}

/**
 * Convert one persisted column definition into an AG-Grid ColDef.
 * `def` is the loosely-typed config object (a `ColumnDefinition` widened
 * to `ColDef` by the caller); it may carry a string `valueGetter` which
 * we always replace with a function or strip.
 */
function toColDef<TData>(def: ColDef<TData>): ColDef<TData> {
  const field = typeof def.field === 'string' ? def.field : undefined;
  // `valueGetter` on the persisted shape is our DSL string; AG-Grid's
  // own `valueGetter` is string | func, so read it defensively.
  const expr = typeof def.valueGetter === 'string' ? def.valueGetter.trim() : '';

  if (expr) {
    const compiled = compile(expr);
    if ('node' in compiled) {
      return {
        ...def,
        colId: def.colId ?? field,
        valueGetter: makeExpressionGetter(compiled.node, field),
      };
    }
    // Parse failed: drop the unusable DSL string and fall through to the
    // default binding so the column still shows its raw field value.
  }

  if (field && field.includes('.')) {
    return {
      ...def,
      colId: def.colId ?? field,
      valueGetter: (params) => getValueByPath(params.data, field),
    };
  }

  // Flat field, no (valid) expression. Strip any stray DSL string so
  // AG-Grid doesn't try to interpret it as a native string expression.
  return expr ? { ...def, valueGetter: undefined } : def;
}

/**
 * Build the AG-Grid column defs for a provider's `columnDefinitions`.
 * Returns `null` when there are none (MarketsGrid treats null as
 * "no provider columns yet").
 */
export function buildColumnDefs<TData>(
  columnDefinitions: ColDef<TData>[] | null | undefined,
): ColDef<TData>[] | null {
  if (!columnDefinitions || columnDefinitions.length === 0) return null;
  return columnDefinitions.map((def) => toColDef<TData>(def));
}

/** Test-only: clear the expression parse cache between suites. */
export function __resetColumnDefExpressionCache(): void {
  parseCache.clear();
}
