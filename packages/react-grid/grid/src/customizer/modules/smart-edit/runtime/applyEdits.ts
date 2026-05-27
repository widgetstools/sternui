import type { GridApi } from 'ag-grid-community';
import {
  applyNumericOp,
  collectFocusedCell,
  collectTargetCells,
  type SmartEditOp,
  type TargetCell,
} from '@starui/engine';

export function resolveTargetCells(api: GridApi, rowIdField = 'id'): TargetCell[] {
  const getRowId = (data: Record<string, unknown>) => String(data[rowIdField] ?? data.id ?? '');
  const fromRange = collectTargetCells(api as never, getRowId);
  if (fromRange.length > 0) return fromRange;
  return collectFocusedCell(api as never, getRowId);
}

export async function applyEdits(
  api: GridApi,
  cells: TargetCell[],
  op: SmartEditOp,
  operand: number,
  rowIdField = 'id',
): Promise<number> {
  const updatesByRowId = new Map<string, Record<string, unknown>>();

  for (const cell of cells) {
    const next = applyNumericOp(cell.value, op, operand);
    if (next === null) continue;

    let row = updatesByRowId.get(cell.rowId);
    if (!row) {
      const existing = api.getRowNode(cell.rowId)?.data;
      row =
        existing && typeof existing === 'object'
          ? { ...(existing as Record<string, unknown>) }
          : { [rowIdField]: cell.rowId };
      updatesByRowId.set(cell.rowId, row);
    }
    row[cell.field] = next;
  }

  const updates = [...updatesByRowId.values()];
  if (updates.length === 0) return 0;
  await api.applyTransactionAsync({ update: updates });
  return cells.length;
}
