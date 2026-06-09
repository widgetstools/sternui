/**
 * buildColumnDefs — turn persisted `ColumnDefinition[]` (from a data
 * provider config) into AG-Grid `ColDef[]` for MarketsGrid.
 *
 * Three behaviours, in precedence order, per column:
 *
 *   1. `valueGetter` expression present → compile it once with the
 *      CSP-safe `@starui/engine` ExpressionEngine and install a
 *      `valueGetter` that calls the compiled closure per row. Column
 *      refs use bracket syntax with optional-chaining nested paths:
 *      `[cusip]`, `[pnl.wrapper.rdiInventoryName]` (a missing segment
 *      yields null, never throws). The getter NEVER throws — a parse
 *      failure falls back to the plain field binding, and a runtime
 *      failure falls back to the field's own value.
 *
 *   2. No expression but a dotted `field` → cached nested-path accessor
 *      (`getPathAccessor`). AG-Grid's native dot-walk can't tell a
 *      nested object (`row.a.b`) from a literal-dot key (`row['a.b']`);
 *      our helper tries the flat key first, then walks.
 *
 *   3. Flat field, no expression → untouched; AG-Grid's native fast path.
 *
 * Compile + parse are memoised by expression string (bounded FIFO cache).
 * Per-row evaluation reuses one mutable `EvaluationContext` per getter
 * (safe — AG-Grid calls valueGetters synchronously on the main thread).
 */

import type { ColDef, ValueGetterParams } from 'ag-grid-community';
import { ExpressionEngine, type ExpressionNode } from '@starui/engine';

type CompiledFn = ReturnType<ExpressionEngine['compile']>;
import { getPathAccessor, getValueByPath } from '@starui/shared-types';

/** Match ExpressionEngine parse-cache policy — grids have few distinct expressions. */
const COMPILE_CACHE_MAX = 1000;

const EMPTY_ROW: Record<string, unknown> = Object.freeze({});

const engine = new ExpressionEngine();

type CompiledEntry =
  | { fn: CompiledFn; usesCellValue: boolean; runtimeWarned?: boolean }
  | { error: string };

const compileCache = new Map<string, CompiledEntry>();

function evictOldest<V>(map: Map<string, V>): void {
  if (map.size >= COMPILE_CACHE_MAX) {
    const oldest = map.keys().next().value;
    if (oldest !== undefined) map.delete(oldest);
  }
}

function logRuntimeFailureOnce(expression: string, err: unknown): void {
  const entry = compileCache.get(expression);
  if (!entry || !('fn' in entry) || entry.runtimeWarned) return;
  entry.runtimeWarned = true;
  console.warn(
    '[markets-grid] column valueGetter expression failed at runtime — falling back to field value:',
    expression,
    err,
  );
}

function expressionUsesCellValue(node: ExpressionNode): boolean {
  switch (node.type) {
    case 'variable':
      return node.name === 'value' || node.name === 'x';
    case 'literal':
    case 'columnRef':
      return false;
    case 'member':
      return expressionUsesCellValue(node.object);
    case 'unary':
      return expressionUsesCellValue(node.operand);
    case 'binary':
      return expressionUsesCellValue(node.left) || expressionUsesCellValue(node.right);
    case 'ternary':
      return (
        expressionUsesCellValue(node.condition) ||
        expressionUsesCellValue(node.consequent) ||
        expressionUsesCellValue(node.alternate)
      );
    case 'call':
      return node.args.some(expressionUsesCellValue);
    case 'array':
      return node.elements.some(expressionUsesCellValue);
    default:
      return false;
  }
}

function compileExpression(expression: string): CompiledEntry {
  const cached = compileCache.get(expression);
  if (cached) return cached;

  let entry: CompiledEntry;
  try {
    const node = engine.parse(expression);
    entry = {
      fn: engine.compile(expression),
      usesCellValue: expressionUsesCellValue(node),
    };
  } catch (err) {
    entry = { error: err instanceof Error ? err.message : String(err) };
    console.warn('[markets-grid] invalid column valueGetter expression:', expression, err);
  }

  evictOldest(compileCache);
  compileCache.set(expression, entry);
  return entry;
}

/** Field value used as the runtime fallback + the `value`/`x` context. */
function fieldValue(data: Record<string, unknown>, field: string | undefined): unknown {
  return field ? getValueByPath(data, field) ?? null : null;
}

function makeExpressionGetter(
  expression: string,
  compiledFn: CompiledFn,
  usesCellValue: boolean,
  field: string | undefined,
) {
  const ctx = {
    x: null as unknown,
    value: null as unknown,
    data: EMPTY_ROW,
    columns: EMPTY_ROW,
  };

  return (params: ValueGetterParams): unknown => {
    const raw = params.data;
    const data =
      raw != null && typeof raw === 'object' ? (raw as Record<string, unknown>) : EMPTY_ROW;

    ctx.data = data;
    ctx.columns = data;

    if (usesCellValue) {
      const cell = fieldValue(data, field);
      ctx.value = cell;
      ctx.x = cell;
    }

    try {
      return compiledFn(ctx);
    } catch (err) {
      logRuntimeFailureOnce(expression, err);
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
  const expr = typeof def.valueGetter === 'string' ? def.valueGetter.trim() : '';

  if (expr) {
    const compiled = compileExpression(expr);
    if ('fn' in compiled) {
      return {
        ...def,
        colId: def.colId ?? field,
        valueGetter: makeExpressionGetter(
          expr,
          compiled.fn,
          compiled.usesCellValue,
          field,
        ),
      };
    }
  }

  if (field && field.includes('.')) {
    const accessor = getPathAccessor(field);
    return {
      ...def,
      colId: def.colId ?? field,
      valueGetter: (params) => accessor(params.data),
    };
  }

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

/** Test-only: clear expression compile + runtime-warning state between suites. */
export function __resetColumnDefExpressionCache(): void {
  compileCache.clear();
}

/** Test-only: read compile-cache size for bounded-growth regression guards. */
export function __getCompileCacheSizeForTests(): number {
  return compileCache.size;
}
