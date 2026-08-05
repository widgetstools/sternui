import { parse, tokenize } from '@starui/engine';
import type { ExpressionEngineLike } from '@starui/engine';
import type { ExpressionNode } from '@starui/engine';
import type { SSRMColDef } from './ssrmgrid-entry.js';
import { compileStarUiExpressionToPerspective } from './ssrmExpressionCompile.js';

/**
 * Which server-side engine a calculated column is being planned FOR.
 *
 * `perspective` is the original target and stays the default, so every existing
 * caller keeps its behaviour. `ssrm-engine` is `@starui/ssrm-engine`, which
 * evaluates the StarUI AST itself, in the worker, over the columnar book.
 */
export type SsrmCalcBackend = 'perspective' | 'ssrm-engine';

export type SsrmCalcPlan =
  | {
      kind: 'perspective';
      colId: string;
      perspectiveExpression: string;
      perspectiveType?: 'float' | 'integer' | 'string' | 'boolean';
    }
  /**
   * The expression goes to `@starui/ssrm-engine` as an AST, and the engine
   * computes it where the book is.
   *
   * A plan KIND rather than a second planner, deliberately. The three existing
   * kinds already answer one question — "who computes this column" — and a
   * parallel `planSsrmEngineCalcColumn` would mean two functions to keep in
   * step, two shapes for a caller to switch on, and a third one the day another
   * backend appears. `applyPerspectivePlansToColDefs` handles this kind in one
   * added branch, which is the property being bought.
   *
   * It differs from `materialize` in where the work happens, and that is the
   * whole point: `materialize` evaluates in the WINDOW over the rows a block
   * already returned, so the column can be displayed but never sorted,
   * filtered or grouped on — the engine is asked for rows in an order it
   * computed without knowing the value. This kind is computed inside the
   * engine, so a sort, a filter, a group and an aggregation all see it.
   */
  | { kind: 'ssrm-engine'; colId: string; expression: string; ast: ExpressionNode }
  | { kind: 'materialize'; colId: string; expression: string }
  | { kind: 'unsupported'; colId: string; reason: string };

const MATERIALIZE_FUNCTIONS = new Set(['IF', 'IFS']);

function isPhase2Materializable(node: ExpressionNode): boolean {
  switch (node.type) {
    case 'literal':
    case 'columnRef':
      return true;
    case 'binary':
      return isPhase2Materializable(node.left) && isPhase2Materializable(node.right);
    case 'unary':
      return isPhase2Materializable(node.operand);
    case 'call': {
      const name = node.name.toUpperCase();
      if (!MATERIALIZE_FUNCTIONS.has(name)) return false;
      return node.args.every((arg) => isPhase2Materializable(arg));
    }
    case 'variable':
    case 'member':
    case 'ternary':
    case 'array':
      return false;
    default:
      return false;
  }
}

function canMaterializeExpression(
  expression: string,
): { ok: true } | { ok: false; reason: string } {
  try {
    const node = parse(tokenize(expression));
    if (!isPhase2Materializable(node)) {
      return { ok: false, reason: 'Expression uses unsupported operations for SSRM materialize' };
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: message };
  }
}

/**
 * Plan one calculated column for a backend.
 *
 * **For `ssrm-engine` this only PARSES, and that is a decision rather than an
 * omission.** The engine has a refusal list — cross-row reducers over a bare
 * `[col]`, `NOW`/`TODAY`, unknown functions by name, member access, `.old` /
 * `.new` — and re-stating it here would be a second copy that drifts from the
 * one that actually runs. This repo already records the cost of that: two error
 * conventions exist for calculated columns and they differ, and a green unit
 * test pinning a spelling the real consumer does not have has caught nobody out
 * three separate times. The engine refuses BY NAME and retains every refusal in
 * `calcDiagnostics()`, which is the channel session 4 built precisely because
 * `console.warn` in a SharedWorker reaches no console anywhere.
 *
 * So a parse failure is `unsupported` with the parser's own message — the
 * planner does own that, since it is the thing doing the parsing — and
 * everything that parses is handed over.
 */
export function planSsrmCalcColumn(
  col: {
    colId: string;
    expression: string;
  },
  options?: { backend?: SsrmCalcBackend },
): SsrmCalcPlan {
  if (options?.backend === 'ssrm-engine') {
    try {
      return {
        kind: 'ssrm-engine',
        colId: col.colId,
        expression: col.expression,
        ast: parse(tokenize(col.expression)),
      };
    } catch (err) {
      return {
        kind: 'unsupported',
        colId: col.colId,
        reason: err instanceof Error ? err.message : String(err),
      };
    }
  }

  const compiled = compileStarUiExpressionToPerspective(col.expression);
  if (compiled.ok) {
    return {
      kind: 'perspective',
      colId: col.colId,
      perspectiveExpression: compiled.perspectiveExpression,
      perspectiveType: compiled.perspectiveType,
    };
  }

  const materialize = canMaterializeExpression(col.expression);
  if (materialize.ok) {
    return {
      kind: 'materialize',
      colId: col.colId,
      expression: col.expression,
    };
  }

  return {
    kind: 'unsupported',
    colId: col.colId,
    reason: materialize.reason || compiled.reason,
  };
}

export function planSsrmCalcColumns(
  cols: readonly { colId: string; expression: string }[],
  options?: { backend?: SsrmCalcBackend },
): SsrmCalcPlan[] {
  return cols.map((col) => planSsrmCalcColumn(col, options));
}

/**
 * The `{ colId, ast }` pairs `@starui/ssrm-engine` takes — what
 * `engine.setCalcColumns` / `client.setCalcColumns` are given.
 *
 * The AST and nothing else crosses the port: it is plain data, so it
 * structured-clones, where a compiled closure could not cross at all and
 * importing the whole expression platform into a worker entry would drag the
 * grid platform in with it.
 */
export function ssrmEngineCalcColumnDefs(
  plans: readonly SsrmCalcPlan[],
): { colId: string; ast: ExpressionNode }[] {
  return plans
    .filter((plan): plan is Extract<SsrmCalcPlan, { kind: 'ssrm-engine' }> => plan.kind === 'ssrm-engine')
    .map((plan) => ({ colId: plan.colId, ast: plan.ast }));
}

export function filterMaterializePlans(
  plans: readonly SsrmCalcPlan[],
): Extract<SsrmCalcPlan, { kind: 'materialize' }>[] {
  return plans.filter(
    (plan): plan is Extract<SsrmCalcPlan, { kind: 'materialize' }> =>
      plan.kind === 'materialize',
  );
}

function colDefKey(def: SSRMColDef): string | undefined {
  return def.colId ?? def.field ?? undefined;
}

export function applyPerspectivePlansToColDefs(
  defs: SSRMColDef[],
  plans: SsrmCalcPlan[],
): SSRMColDef[] {
  if (plans.length === 0) return defs;

  const byColId = new Map<string, SsrmCalcPlan>();
  for (const plan of plans) {
    if (plan.kind === 'unsupported') continue;
    byColId.set(plan.colId, plan);
  }
  if (byColId.size === 0) return defs;

  return defs.map((def) => {
    const key = colDefKey(def);
    if (!key) return def;
    const plan = byColId.get(key);
    if (!plan) return def;

    if (plan.kind === 'perspective') {
      const { valueGetter: _vg, ...rest } = def;
      return {
        ...rest,
        field: key,
        perspectiveExpression: plan.perspectiveExpression,
        ...(plan.perspectiveType ? { perspectiveType: plan.perspectiveType } : {}),
      };
    }

    /**
     * `ssrm-engine` and `materialize` both bind the FIELD and drop the
     * `valueGetter`, for the same reason and with one difference worth stating.
     *
     * The engine stamps the calculated value onto `data[colId]` of every leaf
     * row it returns, and an aggregation over the column onto `data[colId]` of
     * every group row — which is what `buildVirtualColDef`'s own getter falls
     * back to, with the comment "SSRM stamps the folded agg onto data[field]".
     * That fallback is a contract with somebody else's code and this matches
     * what it READS rather than what would have been convenient: binding the
     * field lands the value in exactly the place that getter looks.
     *
     * Keeping the `valueGetter` instead would re-evaluate the expression in the
     * window over a row that already carries the answer, and would return null
     * on a group row unless AG happened to have populated `aggData` — which
     * under a server row model it does not.
     */
    const { valueGetter: _vg, perspectiveExpression: _pe, ...rest } = def;
    return {
      ...rest,
      field: key,
    };
  });
}

export function materializeCalcFields(
  rows: Record<string, unknown>[],
  plans: Extract<SsrmCalcPlan, { kind: 'materialize' }>[],
  evalRow: (expression: string, row: Record<string, unknown>) => unknown,
): Record<string, unknown>[] {
  if (plans.length === 0 || rows.length === 0) return rows;

  return rows.map((row) => {
    let changed = false;
    const next: Record<string, unknown> = { ...row };
    for (const plan of plans) {
      const value = evalRow(plan.expression, row);
      if (!Object.is(next[plan.colId], value)) {
        next[plan.colId] = value;
        changed = true;
      }
    }
    return changed ? next : row;
  });
}

export type SsrmCalcMaterializeContext = {
  materializePlans: Extract<SsrmCalcPlan, { kind: 'materialize' }>[];
  evalRow: (expression: string, row: Record<string, unknown>) => unknown;
};

export function createSsrmCalcEvalRow(
  engine: ExpressionEngineLike,
): (expression: string, row: Record<string, unknown>) => unknown {
  const astCache = new Map<string, unknown>();
  return (expression, row) => {
    let ast = astCache.get(expression);
    if (ast === undefined) {
      try {
        ast = engine.parse(expression);
      } catch {
        ast = null;
      }
      astCache.set(expression, ast);
    }
    if (!ast) return null;
    try {
      return engine.evaluate(ast, {
        x: null,
        value: null,
        data: row,
        columns: row,
      });
    } catch {
      return null;
    }
  };
}

export function buildSsrmCalcMaterializeContext(
  virtualColumns: readonly { colId: string; expression: string }[],
  engine: ExpressionEngineLike,
): SsrmCalcMaterializeContext {
  const materializePlans = filterMaterializePlans(planSsrmCalcColumns(virtualColumns));
  return {
    materializePlans,
    evalRow: createSsrmCalcEvalRow(engine),
  };
}
