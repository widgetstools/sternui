import type { ColumnStore } from './columnStore.js';
import { CALC_FUNCTIONS, applyBinary, applyUnary, isTruthy } from './calcOps.js';
import type { SsrmCalcColumnDef, SsrmExpressionNode } from './calcAst.js';

/**
 * Calculated columns, compiled ONCE PER EXPRESSION to a closure over the store.
 *
 * ## The shape, and why it is not an AST walk
 *
 * `compileCalcColumns` returns, per column, a `(offset: number) => unknown`.
 * The tree is walked at COMPILE time; every node becomes a closure that has
 * already resolved everything static about itself, and a `[px]` reference has
 * already resolved to that column's reader — so evaluating a cell is a chain of
 * direct calls over typed arrays with no `switch` on `node.type` and no `Map`
 * lookup by field name.
 *
 * That is the whole point of the columnar store restated one layer up. A scan
 * reads one contiguous array; a per-cell tree walk would re-dispatch on node
 * type and re-resolve the column name for every row and give that back. The
 * same reasoning is written down upstream, where `compileToFunction` exists
 * beside the tree-walking `Evaluator` for exactly this reason.
 *
 * **A row offset, not a row object.** The closure indexes the store directly,
 * so nothing is materialised to evaluate a cell. That is also what session 5
 * needs: sorting, filtering, grouping and aggregating a calculated column all
 * mean "evaluate it for these offsets", which is this closure called over an
 * index. Had it taken a row object, feeding `materialise` would have meant
 * building 20,000 row objects to sort one column.
 *
 * ## Errors never reach a block read
 *
 * `getRows` must settle exactly once — AG's `outboundRequests` is grid-global
 * with a limit of 2, so a calculated column that throws inside a block read
 * does not blank a column, it WEDGES THE GRID. Two guards, matching the
 * convention `buildColumnDefs` already established for the client-side path:
 *
 *   - **a compile failure falls back to the field binding.** The column is not
 *     installed, so a returned row keeps whatever the store holds under that
 *     name (usually nothing, since a calc column's id names no field), and the
 *     reason is recorded once;
 *   - **a runtime failure falls back to the field value**, per cell, and is
 *     recorded once per expression rather than once per row.
 *
 * The two conventions in this repo differ and it is worth being exact about
 * which one this follows. `buildColumnDefs` (the provider-column path) falls
 * back to the field and warns; `buildVirtualColDef` (the calculated-columns
 * module, and therefore the CSRM twin this is measured against) returns **null
 * silently** for both cases. They coincide for every genuine calculated column,
 * because a colId like `calc_pnlTotal` names no field and the field binding IS
 * null. They differ only for an expression whose colId OVERRIDES a real column,
 * where this engine shows the underlying value and the twin shows a blank. The
 * louder one is chosen deliberately: a confidently blank cell is
 * indistinguishable from a genuine null, which is the failure the skeleton
 * renderer was built for on the other path.
 *
 * ## The diagnostics are not decoration
 *
 * `console.warn` in a SharedWorker **reaches no console anywhere** — recorded
 * on this path and the reason every fault is pushed to attached clients. A
 * warn-once that only warns is therefore invisible in the topology this engine
 * actually runs in, so every diagnostic is also RETAINED and readable through
 * `engine.calcDiagnostics()`. A probe or a test can then assert that a column
 * compiled, which is the difference between a check that can fail and one that
 * cannot.
 */

/** A compiled cell reader. Never throws. */
export type SsrmCalcEvaluator = (offset: number) => unknown;

export interface SsrmCalcDiagnostic {
  colId: string;
  /**
   * `compile` — refused, the column is not installed;
   * `runtime`  — threw while evaluating a cell, that cell fell back;
   * `column`   — the expression names a field the book does not have. NOT an
   *              error: it evaluates to null, exactly as it does on the grid.
   *              Recorded because a whole column of nulls from a typo is the
   *              quietest way a calculated column goes wrong.
   */
  phase: 'compile' | 'runtime' | 'column';
  message: string;
  /** How many times this was hit. Warned once, counted always. */
  count: number;
}

export interface SsrmCalcColumn {
  colId: string;
  /** Absent when the column was refused — see {@link SsrmCalcColumn.error}. */
  evaluate?: SsrmCalcEvaluator;
  /** Why it was refused, if it was. */
  error?: string;
}

class CalcCompileError extends Error {}

/**
 * Functions whose meaning changes with a bare `[col]` argument, and are
 * therefore REFUSED at that call site.
 *
 * `@starui/engine` marks `SUM`, `COUNT`, `AVG`, `MIN`, `MAX`, `MEDIAN`,
 * `STDEV`, `VARIANCE` and `DISTINCT_COUNT` with `aggregateColumnRefs`: given a
 * direct `[col]` argument they expand it to EVERY ROW's value from
 * `ctx.allRows`, so `SUM([px])` is the whole column, not this row's price. The
 * calculated-columns module supplies `allRows` from `api.forEachNode`, so on
 * CSRM those really are cross-row.
 *
 * There is no honest per-offset equivalent. "Every row" against a server row
 * model means the FILTERED BOOK, which depends on the request rather than on
 * the row — a different question, answered by a different mechanism, and one
 * that has to be decided with session 5's materialise-or-compute measurement
 * rather than guessed at here.
 *
 * So it is refused with the function named. The alternative is the trap the
 * parity worklog already records once: **`avg("col")` in Perspective is
 * row-wise, parses, never errors, and answers the column's own value — so
 * `"col" > avg("col")` is false for every row, silently.** Producing a row-wise
 * answer to a cross-row question is the same defect with a different spelling.
 *
 * A computed argument is fine and is not refused: `MAX([bid] * 1, 0)` is
 * row-wise on both surfaces, because only a DIRECT `columnRef` argument is
 * expanded.
 */
function refuseCrossRow(name: string, args: readonly SsrmExpressionNode[]): void {
  const fn = CALC_FUNCTIONS[name];
  if (fn?.crossRowOnColumnRef !== true) return;
  if (!args.some((arg) => arg.type === 'columnRef')) return;
  throw new CalcCompileError(
    `${name}([column]) is a CROSS-ROW aggregate on the grid (it reads every row), ` +
      `and this engine evaluates one row at a time — refused rather than answered row-wise`,
  );
}

interface CompileContext {
  store: ColumnStore;
  /** Fields the expression named that the book does not have. */
  missing: Set<string>;
}

function compileNode(node: SsrmExpressionNode, ctx: CompileContext): SsrmCalcEvaluator {
  switch (node.type) {
    case 'literal': {
      const value = node.value;
      return () => value;
    }

    case 'columnRef': {
      const id = node.columnId;
      // `.old` / `.new` are viewport-only — they mean "the value before this
      // tick", which lives in the window's own previous-values store and not in
      // the book. The Perspective backend refuses them for the same reason.
      if (id.endsWith('.old') || id.endsWith('.new')) {
        throw new CalcCompileError(
          `[${id}] is viewport-only (.old/.new): the book holds current values only`,
        );
      }
      const reader = ctx.store.reader(id);
      if (reader === undefined) {
        // NOT an error. `resolveColumnRef` on the grid answers null for a field
        // the row does not carry, so this does too — but it is counted, because
        // a column of nulls produced by a typo looks exactly like a column of
        // genuine nulls.
        ctx.missing.add(id);
        return () => null;
      }
      return reader;
    }

    case 'variable': {
      const name = node.name;
      // The cell's own value. `buildVirtualColDef` passes null for both, so a
      // calculated column reading `x` reads null there; matched here rather
      // than invented, because a calculated column has no "current cell".
      if (name === 'x' || name === 'value') return () => null;
      if (name === 'data' || name === 'row') {
        throw new CalcCompileError(
          `'${name}' hands the whole row object to the expression; this engine evaluates ` +
            `against the columnar book by offset and materialises no row — use [colId]`,
        );
      }
      if (name === 'oldValue' || name === 'newValue') {
        throw new CalcCompileError(`'${name}' is viewport-only: the book holds current values only`);
      }
      const reader = ctx.store.reader(name);
      if (reader === undefined) {
        ctx.missing.add(name);
        // `undefined`, not null, and deliberately: `resolveVariable` answers
        // `undefined` for a name that is in neither `data` nor `columns`, where
        // `resolveColumnRef` answers null. Two spellings of "not here" that the
        // grid distinguishes, so this does too.
        return () => undefined;
      }
      return reader;
    }

    case 'member':
      throw new CalcCompileError(
        'member access (a.b) needs a row object; the book is flat and columnar — use [a.b] as a column id',
      );

    case 'unary': {
      const op = node.operator;
      if (op !== 'NOT' && op !== '-') {
        throw new CalcCompileError(`unsupported unary operator '${op}'`);
      }
      const operand = compileNode(node.operand, ctx);
      return (offset) => applyUnary(op, operand(offset));
    }

    case 'binary': {
      const op = node.operator;
      const left = compileNode(node.left, ctx);
      const right = compileNode(node.right, ctx);
      // AND/OR short-circuit and answer the OPERAND, not a boolean —
      // `null AND 1` is null, `0 OR 'x'` is 'x'. That is the grid's rule and it
      // is why they cannot go through `applyBinary`.
      if (op === 'AND') {
        return (offset) => {
          const l = left(offset);
          return isTruthy(l) ? right(offset) : l;
        };
      }
      if (op === 'OR') {
        return (offset) => {
          const l = left(offset);
          return isTruthy(l) ? l : right(offset);
        };
      }
      if (!BINARY_OPERATORS.has(op)) {
        throw new CalcCompileError(`unsupported binary operator '${op}'`);
      }
      return (offset) => applyBinary(op, left(offset), right(offset));
    }

    case 'ternary': {
      const condition = compileNode(node.condition, ctx);
      const consequent = compileNode(node.consequent, ctx);
      const alternate = compileNode(node.alternate, ctx);
      // `isTruthy`, not JavaScript's — so NaN takes the consequent here and the
      // false branch of `IF()`. Upstream's inconsistency, reproduced.
      return (offset) => (isTruthy(condition(offset)) ? consequent(offset) : alternate(offset));
    }

    case 'array': {
      // Only reachable as the right side of `IN`, which the parser builds as an
      // array node. Evaluated per row because its elements may be columns.
      const elements = node.elements.map((el) => compileNode(el, ctx));
      return (offset) => elements.map((el) => el(offset));
    }

    case 'call': {
      const name = node.name.toUpperCase();
      const fn = CALC_FUNCTIONS[name];
      if (fn === undefined) {
        throw new CalcCompileError(
          `unknown function '${node.name}' — this backend evaluates ${
            Object.keys(CALC_FUNCTIONS).length
          } functions and refuses the rest by name rather than answering null`,
        );
      }
      if (node.args.length < fn.minArgs || node.args.length > fn.maxArgs) {
        throw new CalcCompileError(
          `${name} takes ${fn.minArgs}-${fn.maxArgs} arguments, got ${node.args.length}`,
        );
      }
      refuseCrossRow(name, node.args);
      const args = node.args.map((arg) => compileNode(arg, ctx));
      const evaluate = fn.evaluate;
      // EAGER, because a function call on the grid is eager: every argument is
      // evaluated before the body runs, so `IF(cond, a, b)` evaluates `a` and
      // `b` both. Only the ternary and AND/OR short-circuit.
      return (offset) => evaluate(args.map((arg) => arg(offset)));
    }

    default:
      throw new CalcCompileError(
        `unsupported expression node '${(node as { type: string }).type}'`,
      );
  }
}

const BINARY_OPERATORS = new Set([
  '+', '-', '*', '/', '%',
  '>', '<', '>=', '<=', '==', '!=',
  'IN', 'BETWEEN',
]);

/** Where a failed cell falls back to: this column's own field, else null. */
function fieldFallback(store: ColumnStore, colId: string): SsrmCalcEvaluator {
  const reader = store.reader(colId);
  return reader ?? (() => null);
}

export interface SsrmCalcCompileResult {
  columns: SsrmCalcColumn[];
  /** Live — a runtime failure appends to it as cells are evaluated. */
  diagnostics: SsrmCalcDiagnostic[];
}

/**
 * Compile every calculated column against a store.
 *
 * `warn` defaults to `console.warn` and fires ONCE per column per phase, which
 * is the convention `buildColumnDefs` set. In a SharedWorker it reaches nobody,
 * which is why the same information is also returned.
 */
export function compileCalcColumns(
  store: ColumnStore,
  defs: readonly SsrmCalcColumnDef[],
  warn: (message: string, detail?: unknown) => void = (message, detail) =>
    console.warn(message, detail),
): SsrmCalcCompileResult {
  const diagnostics: SsrmCalcDiagnostic[] = [];
  const columns: SsrmCalcColumn[] = [];
  // Keyed rather than scanned: a runtime failure fires PER CELL, so a linear
  // search would make a broken column quadratic in the block size.
  const seen = new Map<string, SsrmCalcDiagnostic>();

  const record = (
    colId: string,
    phase: SsrmCalcDiagnostic['phase'],
    message: string,
  ): SsrmCalcDiagnostic => {
    const key = `${colId} ${phase} ${message}`;
    const existing = seen.get(key);
    if (existing !== undefined) {
      existing.count += 1;
      return existing;
    }
    const entry: SsrmCalcDiagnostic = { colId, phase, message, count: 1 };
    seen.set(key, entry);
    diagnostics.push(entry);
    return entry;
  };

  for (const def of defs) {
    const ctx: CompileContext = { store, missing: new Set() };
    let compiled: SsrmCalcEvaluator;
    try {
      compiled = compileNode(def.ast, ctx);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      record(def.colId, 'compile', message);
      warn(
        `[ssrm-engine] calculated column '${def.colId}' refused — falling back to its field binding:`,
        message,
      );
      columns.push({ colId: def.colId, error: message });
      continue;
    }

    for (const field of ctx.missing) {
      record(def.colId, 'column', `expression names '${field}', which the book does not have`);
      warn(
        `[ssrm-engine] calculated column '${def.colId}' names '${field}', which the book does not have — every row reads null:`,
        def.colId,
      );
    }

    const fallback = fieldFallback(store, def.colId);
    let warned = false;
    // ONE try/catch, at the top of the column rather than around every node —
    // the same shape `makeExpressionGetter` uses. Per node it would be both
    // slower and wrong: an inner catch would swallow a failure into a partial
    // value instead of falling back to the field.
    const evaluate: SsrmCalcEvaluator = (offset) => {
      try {
        return compiled(offset);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        record(def.colId, 'runtime', message);
        if (!warned) {
          warned = true;
          warn(
            `[ssrm-engine] calculated column '${def.colId}' failed at runtime — falling back to the field value:`,
            message,
          );
        }
        return fallback(offset);
      }
    };

    columns.push({ colId: def.colId, evaluate });
  }

  return { columns, diagnostics };
}
