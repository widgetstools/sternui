import { composeRowId } from '@starui/types';

export const PERSPECTIVE_COMPOSITE_INDEX = '__ssrm_row_id';

export function resolvePerspectiveIndexColumn(
  rowIdField: string | readonly string[] | null | undefined,
): string {
  if (!rowIdField) return 'id';
  if (typeof rowIdField === 'string') return rowIdField;
  return PERSPECTIVE_COMPOSITE_INDEX;
}

export function stampPerspectiveRows<T extends Record<string, unknown>>(
  rows: readonly T[],
  rowIdField: string | readonly string[] | null | undefined,
): T[] {
  if (!rowIdField || typeof rowIdField === 'string') {
    return rows.slice() as T[];
  }
  const stamped: T[] = [];
  for (const row of rows) {
    const id = composeRowId(row, rowIdField);
    if (id == null) continue;
    stamped.push({ ...row, [PERSPECTIVE_COMPOSITE_INDEX]: id } as T);
  }
  return stamped;
}
