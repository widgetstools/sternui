/**
 * AG Grid column filterModel → Perspective filter clauses.
 *
 * P2 keeps the mapping table deliberately small (text / number /
 * set; single conditions or AND-combined). Everything else is
 * reported in `unsupported` — the datasource applies what mapped and
 * warns, full filter parity is P4 (date filters, OR-combined
 * conditions via Perspective `filter_op`, case-insensitive contains,
 * advanced filter models).
 */

import type {
  NumberFilterModel,
  SetFilterModel,
  TextFilterModel,
} from 'ag-grid-community';
import type { PullFilter } from './types.js';

interface CombinedSimpleModel {
  operator: 'AND' | 'OR';
  conditions: Array<TextFilterModel | NumberFilterModel>;
}

export interface FilterMappingResult {
  filters: PullFilter[];
  /** Human-readable descriptions of clauses P2 cannot express yet. */
  unsupported: string[];
}

type ColumnFilterModel =
  | TextFilterModel
  | NumberFilterModel
  | SetFilterModel
  | CombinedSimpleModel
  | Record<string, unknown>;

function isCombined(model: ColumnFilterModel): model is CombinedSimpleModel {
  return Array.isArray((model as CombinedSimpleModel).conditions);
}

function isSetModel(model: ColumnFilterModel): model is SetFilterModel {
  return (model as SetFilterModel).filterType === 'set';
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
      // notContains and friends — no Perspective operator. P4.
      out.unsupported.push(`${colId}: ${String(type)}`);
  }
}

function mapColumnModel(
  colId: string,
  model: ColumnFilterModel,
  out: FilterMappingResult,
): void {
  if (isSetModel(model)) {
    out.filters.push([colId, 'in', model.values]);
    return;
  }
  if (isCombined(model)) {
    if (model.operator === 'OR') {
      // Perspective joins clauses with AND (filter_op is view-global).
      // TODO(P4): express OR via view filter_op / expression columns.
      out.unsupported.push(`${colId}: OR-combined conditions`);
      return;
    }
    for (const condition of model.conditions) mapSimpleCondition(colId, condition, out);
    return;
  }
  const filterType = (model as TextFilterModel).filterType;
  if (filterType === 'text' || filterType === 'number' || filterType === undefined) {
    mapSimpleCondition(colId, model as TextFilterModel | NumberFilterModel, out);
    return;
  }
  // date / multi / custom — TODO(P4).
  out.unsupported.push(`${colId}: filterType '${String(filterType)}'`);
}

/**
 * Map an AG `filterModel` (column-keyed) onto Perspective filter
 * clauses. Clauses join with AND — exactly AG's cross-column
 * semantics. Unmappable clauses are collected, never guessed.
 */
export function agFilterModelToPerspective(
  filterModel: Record<string, unknown> | null | undefined,
): FilterMappingResult {
  const out: FilterMappingResult = { filters: [], unsupported: [] };
  if (!filterModel) return out;
  for (const [colId, model] of Object.entries(filterModel)) {
    if (!model || typeof model !== 'object') continue;
    mapColumnModel(colId, model as ColumnFilterModel, out);
  }
  return out;
}
