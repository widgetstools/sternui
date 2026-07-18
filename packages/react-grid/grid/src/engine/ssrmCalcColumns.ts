import { parse, tokenize } from '@wellsfargo-starui/engine';
import type { ExpressionEngineLike } from '@wellsfargo-starui/engine';
import type { ExpressionNode } from '@wellsfargo-starui/engine';
import type { SSRMColDef } from './ssrmgrid-entry.js';
import { compileStarUiExpressionToPerspective } from './ssrmExpressionCompile.js';

export type SsrmCalcPlan =
  | {
      kind: 'perspective';
      colId: string;
      perspectiveExpression: string;
      perspectiveType?: 'float' | 'integer' | 'string' | 'boolean';
    }
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

export function planSsrmCalcColumn(col: {
  colId: string;
  expression: string;
}): SsrmCalcPlan {
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
): SsrmCalcPlan[] {
  return cols.map((col) => planSsrmCalcColumn(col));
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
