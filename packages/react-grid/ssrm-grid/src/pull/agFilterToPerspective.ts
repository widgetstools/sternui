/**
 * AG Grid column filterModel → Perspective filter clauses (P4a — full
 * simple-filter parity).
 *
 * Native operator mapping wherever Perspective has the operator
 * (verified against the 3.8 engine — `contains`/`begins with`/
 * `ends with` are case-INSENSITIVE literal matches, i.e. AG's default
 * text semantics; `==`/`!=` are case-sensitive); everything Perspective
 * cannot express as an AND-joined clause list is rendered as a boolean
 * EXPRESSION column filtered `== true` (see `filterExpressions.ts`):
 *
 * • per-column OR-combined conditions (`operator: 'OR'`) — Perspective's
 *   `filter_op` is view-global, so mixed AND/OR across columns is
 *   inexpressible natively; the per-column expression keeps AG's exact
 *   semantics (OR within the column, AND across columns);
 * • `notContains` (no native operator);
 * • set selections including `null` (`in` never matches nulls);
 * • date `equals`/`before`/`after`/`inRange`/`blank`/`notBlank` on
 *   `date` columns map natively (string terms parse, normalized to
 *   date-only when the time component is midnight); `dateString`
 *   columns compare lexicographically as ISO strings, which the same
 *   native clauses already handle.
 *
 * Anything genuinely inexpressible (sub-day terms against date
 * filters, unknown operators, advanced filter models) is reported in
 * `unsupported` — applied filters NEVER silently diverge from what the
 * user asked.
 */

import type {
  DateFilterModel,
  NumberFilterModel,
  SetFilterModel,
  TextFilterModel,
} from 'ag-grid-community';
import {
  conditionExpr,
  filterExprName,
  setWithNullExpr,
} from './filterExpressions.js';
import type { PullFilter } from './types.js';

type SimpleModel = TextFilterModel | NumberFilterModel | DateFilterModel;

interface CombinedSimpleModel {
  operator: 'AND' | 'OR';
  conditions: SimpleModel[];
}

export interface FilterMappingResult {
  filters: PullFilter[];
  /** Boolean expression columns; each also appears as a `== true` clause. */
  expressions: Record<string, string>;
  /** Human-readable descriptions of clauses that cannot be expressed. */
  unsupported: string[];
}

type ColumnFilterModel =
  | SimpleModel
  | SetFilterModel
  | CombinedSimpleModel
  | Record<string, unknown>;

function isCombined(model: ColumnFilterModel): model is CombinedSimpleModel {
  return Array.isArray((model as CombinedSimpleModel).conditions);
}

function isSetModel(model: ColumnFilterModel): model is SetFilterModel {
  return (model as SetFilterModel).filterType === 'set';
}

function isDateModel(model: SimpleModel): model is DateFilterModel {
  return (model as DateFilterModel).filterType === 'date';
}

/** `'2026-07-02 00:00:00'` → `'2026-07-02'`; sub-day terms → null. */
function dateTerm(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const m = /^(\d{4}-\d{2}-\d{2})(?:[ T]00:00:00)?$/.exec(value.trim());
  return m ? m[1]! : null;
}

/** One simple text/number condition → zero-or-more Perspective clauses. */
function mapSimpleCondition(
  colId: string,
  model: TextFilterModel | NumberFilterModel,
  out: FilterMappingResult,
): void {
  const type = model.type ?? undefined;
  const value = model.filter ?? null;
  switch (type) {
    case 'equals':
      out.filters.push([colId, '==', value]);
      return;
    case 'notEqual':
      out.filters.push([colId, '!=', value]);
      return;
    case 'contains':
      out.filters.push([colId, 'contains', value]);
      return;
    case 'notContains': {
      const expr = conditionExpr(colId, 'notContains', value, null, model.filterType);
      if (expr) pushExpression(colId, expr, out);
      else out.unsupported.push(`${colId}: notContains ${String(value)}`);
      return;
    }
    case 'startsWith':
      out.filters.push([colId, 'begins with', value]);
      return;
    case 'endsWith':
      out.filters.push([colId, 'ends with', value]);
      return;
    case 'greaterThan':
      out.filters.push([colId, '>', value]);
      return;
    case 'greaterThanOrEqual':
      out.filters.push([colId, '>=', value]);
      return;
    case 'lessThan':
      out.filters.push([colId, '<', value]);
      return;
    case 'lessThanOrEqual':
      out.filters.push([colId, '<=', value]);
      return;
    case 'inRange': {
      const to = (model as NumberFilterModel).filterTo ?? null;
      out.filters.push([colId, '>=', value]);
      out.filters.push([colId, '<=', to]);
      return;
    }
    case 'blank':
      out.filters.push([colId, 'is null', null]);
      return;
    case 'notBlank':
      out.filters.push([colId, 'is not null', null]);
      return;
    default:
      out.unsupported.push(`${colId}: ${String(type)}`);
  }
}

/**
 * One date condition → native clauses with normalized date-only terms.
 * AG's date filter uses `lessThan` for "Before" and `greaterThan` for
 * "After"; terms are `'YYYY-MM-DD HH:mm:ss'` strings.
 */
function mapDateCondition(colId: string, model: DateFilterModel, out: FilterMappingResult): void {
  const type = model.type ?? undefined;
  if (type === 'blank') {
    out.filters.push([colId, 'is null', null]);
    return;
  }
  if (type === 'notBlank') {
    out.filters.push([colId, 'is not null', null]);
    return;
  }
  const from = dateTerm(model.dateFrom);
  if (from === null) {
    out.unsupported.push(`${colId}: date ${String(type)} '${String(model.dateFrom)}' (date-only terms supported)`);
    return;
  }
  switch (type) {
    case 'equals':
      out.filters.push([colId, '==', from]);
      return;
    case 'notEqual':
      out.filters.push([colId, '!=', from]);
      return;
    case 'lessThan':
      out.filters.push([colId, '<', from]);
      return;
    case 'greaterThan':
      out.filters.push([colId, '>', from]);
      return;
    case 'inRange': {
      const to = dateTerm(model.dateTo);
      if (to === null) {
        out.unsupported.push(`${colId}: date inRange '${String(model.dateTo)}' (date-only terms supported)`);
        return;
      }
      out.filters.push([colId, '>=', from]);
      out.filters.push([colId, '<=', to]);
      return;
    }
    default:
      out.unsupported.push(`${colId}: date ${String(type)}`);
  }
}

/**
 * OR-combined conditions → ONE boolean expression column for the whole
 * column model (see module doc). If ANY branch is inexpressible the
 * whole column is reported unsupported — a partial OR would be wrong.
 */
function mapOrCombined(colId: string, model: CombinedSimpleModel, out: FilterMappingResult): void {
  const branches: string[] = [];
  for (const condition of model.conditions) {
    const isDate = isDateModel(condition);
    const expr = conditionExpr(
      colId,
      condition.type ?? undefined,
      isDate ? (condition.dateFrom ?? null) : (condition.filter ?? null),
      isDate ? (condition.dateTo ?? null) : ((condition as NumberFilterModel).filterTo ?? null),
      condition.filterType ?? undefined,
    );
    if (expr === null) {
      out.unsupported.push(
        `${colId}: OR-combined ${String(condition.filterType)} ${String(condition.type)}`,
      );
      return;
    }
    branches.push(expr);
  }
  if (branches.length === 0) return;
  pushExpression(colId, branches.join(' or '), out);
}

function pushExpression(colId: string, expr: string, out: FilterMappingResult): void {
  const name = filterExprName(colId);
  // Multiple expression-needing clauses on one column AND together.
  out.expressions[name] =
    name in out.expressions ? `(${out.expressions[name]}) and (${expr})` : expr;
  if (!out.filters.some(([col, op, term]) => col === name && op === '==' && term === true)) {
    out.filters.push([name, '==', true]);
  }
}

function mapColumnModel(colId: string, model: ColumnFilterModel, out: FilterMappingResult): void {
  if (isSetModel(model)) {
    const values = model.values ?? [];
    if (values.includes(null)) {
      pushExpression(colId, setWithNullExpr(colId, values), out);
    } else {
      out.filters.push([colId, 'in', values as string[]]);
    }
    return;
  }
  if (isCombined(model)) {
    if (model.operator === 'OR') {
      mapOrCombined(colId, model, out);
      return;
    }
    for (const condition of model.conditions) {
      if (isDateModel(condition)) mapDateCondition(colId, condition, out);
      else mapSimpleCondition(colId, condition, out);
    }
    return;
  }
  const filterType = (model as SimpleModel).filterType;
  if (filterType === 'date') {
    mapDateCondition(colId, model as DateFilterModel, out);
    return;
  }
  if (filterType === 'text' || filterType === 'number' || filterType === undefined) {
    mapSimpleCondition(colId, model as TextFilterModel | NumberFilterModel, out);
    return;
  }
  // multi / custom filter models — P4b.
  out.unsupported.push(`${colId}: filterType '${String(filterType)}'`);
}

/**
 * Map an AG `filterModel` (column-keyed) onto Perspective filter
 * clauses + expression columns. Clauses join with AND — exactly AG's
 * cross-column semantics. Unmappable clauses are collected, never
 * guessed.
 */
export function agFilterModelToPerspective(
  filterModel: Record<string, unknown> | null | undefined,
): FilterMappingResult {
  const out: FilterMappingResult = { filters: [], expressions: {}, unsupported: [] };
  if (!filterModel) return out;
  for (const [colId, model] of Object.entries(filterModel)) {
    if (!model || typeof model !== 'object') continue;
    mapColumnModel(colId, model as ColumnFilterModel, out);
  }
  return out;
}
