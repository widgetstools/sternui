/**
 * Pure filter evaluator for AG-Grid filter models.
 * Used to check if a row passes all column filters in a saved filter model
 * (AND across columns). Called from doesExternalFilterPass when OR-combining
 * multiple saved filters.
 */

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function matchesTextFilter(cellValue: unknown, model: Record<string, any>): boolean {
  const type: string = model.type ?? '';
  const filterStr: string = String(model.filter ?? '').toLowerCase();
  const cell: string = String(cellValue ?? '').toLowerCase();

  switch (type) {
    case 'equals':
      return cell === filterStr;
    case 'notEqual':
      return cell !== filterStr;
    case 'contains':
      return cell.includes(filterStr);
    case 'notContains':
      return !cell.includes(filterStr);
    case 'startsWith':
      return cell.startsWith(filterStr);
    case 'endsWith':
      return cell.endsWith(filterStr);
    case 'blank':
      return cellValue === null || cellValue === undefined || String(cellValue).trim() === '';
    case 'notBlank':
      return cellValue !== null && cellValue !== undefined && String(cellValue).trim() !== '';
    default:
      return true;
  }
}

function matchesNumberFilter(cellValue: unknown, model: Record<string, any>): boolean {
  const type: string = model.type ?? '';
  const filterNum: number = Number(model.filter);
  const filterTo: number = Number(model.filterTo);
  const cell: number = Number(cellValue);

  switch (type) {
    case 'equals':
      return cell === filterNum;
    case 'notEqual':
      return cell !== filterNum;
    case 'lessThan':
      return cell < filterNum;
    case 'lessThanOrEqual':
      return cell <= filterNum;
    case 'greaterThan':
      return cell > filterNum;
    case 'greaterThanOrEqual':
      return cell >= filterNum;
    case 'inRange':
      return cell >= filterNum && cell <= filterTo;
    case 'blank':
      return cellValue === null || cellValue === undefined || cellValue === '';
    case 'notBlank':
      return cellValue !== null && cellValue !== undefined && cellValue !== '';
    default:
      return true;
  }
}

function matchesSetFilter(cellValue: unknown, model: Record<string, any>): boolean {
  const values: unknown[] = Array.isArray(model.values) ? model.values : [];
  const cellStr = String(cellValue ?? '');
  return values.map(String).includes(cellStr);
}

function matchesColumnFilter(cellValue: unknown, model: Record<string, any>): boolean {
  // Handle AG-Grid ICombinedSimpleModel (has operator + conditions array)
  if (model.operator && Array.isArray(model.conditions)) {
    const results = model.conditions.map((condition: Record<string, any>) =>
      matchesColumnFilter(cellValue, condition),
    );
    if (model.operator === 'AND') {
      return results.every(Boolean);
    }
    // OR
    return results.some(Boolean);
  }

  // Determine filter type
  let filterType: string = model.filterType ?? '';

  if (!filterType) {
    // Infer from typeof model.filter
    if (typeof model.filter === 'number') {
      filterType = 'number';
    } else {
      filterType = 'text';
    }
  }

  switch (filterType) {
    case 'text':
      return matchesTextFilter(cellValue, model);
    case 'number':
      return matchesNumberFilter(cellValue, model);
    case 'set':
      return matchesSetFilter(cellValue, model);
    default:
      return true;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns true if the row passes ALL column filters in the given filter model
 * (AND semantics across columns, mirroring AG-Grid's default behaviour).
 *
 * @param filterModel  A snapshot from `api.getFilterModel()`.
 * @param rowData      The plain row-data object for the row being tested.
 */
export function doesRowPassFilterModel(
  filterModel: Record<string, any>,
  rowData: Record<string, any>,
): boolean {
  for (const colId of Object.keys(filterModel)) {
    const model = filterModel[colId];
    const cellValue = rowData[colId];
    if (!matchesColumnFilter(cellValue, model)) {
      return false;
    }
  }
  return true;
}
