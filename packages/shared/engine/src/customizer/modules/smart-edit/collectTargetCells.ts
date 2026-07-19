import { isNumericCellDataType } from './isNumericCellDataType.js';

/** Minimal grid reader — framework-agnostic (React + future Angular). */
export interface SmartEditGridReader {
  getCellRanges(): Array<{
    columns: Array<{ getColId(): string | undefined }>;
    startRow?: { rowIndex: number };
    endRow?: { rowIndex: number };
  }> | null;
  getDisplayedRowAtIndex(index: number): SmartEditRowNode | undefined;
  getColumn(colId: string): {
    getColDef(): { editable?: boolean | ((p: unknown) => boolean); field?: string; cellDataType?: string };
  } | null;
  getCellValue(params: { rowNode: unknown; colKey: string }): unknown;
}

export interface SmartEditRowNode {
  id?: string;
  data?: Record<string, unknown>;
  /** SSRM loading placeholder — the row is NOT loaded. */
  stub?: boolean;
  /** Group header — legitimately has no leaf data. */
  group?: boolean;
  /** Aggregate footer — legitimately has no leaf data. */
  footer?: boolean;
}

export interface TargetCell {
  rowId: string;
  colId: string;
  field: string;
  value: unknown;
}

export interface TargetCellScan {
  cells: TargetCell[];
  /**
   * Rows inside the selection that are not loaded (SSRM stubs / missing
   * nodes). Callers MUST refuse the edit when this is non-zero — applying
   * to the loaded subset silently is a data-integrity bug (worklog T6).
   */
  unloadedRowCount: number;
}

/** True when the range row is an unloaded SSRM placeholder (not a group/footer). */
export function isUnloadedRangeRow(node: SmartEditRowNode | undefined): boolean {
  if (!node) return true;
  if (node.stub === true) return true;
  return node.data == null && node.group !== true && node.footer !== true;
}

function isEditable(
  editable: boolean | ((p: unknown) => boolean) | undefined,
  rowNode: unknown,
): boolean {
  if (editable === false) return false;
  if (typeof editable === 'function') {
    try {
      return !!editable({ node: rowNode, data: (rowNode as { data?: unknown })?.data });
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * Range scan that also reports unloaded rows so callers can refuse partial
 * edits under SSRM instead of silently applying to the loaded subset.
 */
export function scanTargetCells(
  api: SmartEditGridReader,
  getRowId: (data: Record<string, unknown>) => string,
): TargetCellScan {
  const ranges = api.getCellRanges() ?? [];
  const out: TargetCell[] = [];
  const seen = new Set<string>();
  const unloadedRows = new Set<number>();

  for (const range of ranges) {
    const start = range.startRow?.rowIndex ?? 0;
    const end = range.endRow?.rowIndex ?? start;
    const rowFrom = Math.min(start, end);
    const rowTo = Math.max(start, end);

    for (let ri = rowFrom; ri <= rowTo; ri += 1) {
      const rowNode = api.getDisplayedRowAtIndex(ri);
      if (!rowNode?.data) {
        if (isUnloadedRangeRow(rowNode)) unloadedRows.add(ri);
        continue;
      }
      const data = rowNode.data;
      const rowId = rowNode.id ?? getRowId(data);

      for (const col of range.columns ?? []) {
        const colId = col.getColId?.();
        if (!colId || colId === 'ag-Grid-SelectionColumn') continue;

        const column = api.getColumn(colId);
        if (!column) continue;
        const colDef = column.getColDef();
        if (!isEditable(colDef.editable, rowNode)) continue;
        if (colDef.cellDataType && !isNumericCellDataType(colDef.cellDataType)) continue;

        const field = colDef.field ?? colId;
        const key = `${rowId}:${colId}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const value = api.getCellValue({ rowNode, colKey: colId });
        out.push({ rowId, colId, field, value });
      }
    }
  }

  return { cells: out, unloadedRowCount: unloadedRows.size };
}

export function collectTargetCells(
  api: SmartEditGridReader,
  getRowId: (data: Record<string, unknown>) => string,
): TargetCell[] {
  return scanTargetCells(api, getRowId).cells;
}

/** Single focused cell when no range selection exists. */
export function collectFocusedCell(
  api: SmartEditGridReader & {
    getFocusedCell(): { rowIndex: number; column: { getColId(): string | undefined } } | null;
  },
  getRowId: (data: Record<string, unknown>) => string,
): TargetCell[] {
  const focused = api.getFocusedCell();
  if (!focused) return [];

  const colId = focused.column.getColId?.();
  if (!colId) return [];

  const rowNode = api.getDisplayedRowAtIndex(focused.rowIndex);
  if (!rowNode?.data) return [];

  const column = api.getColumn(colId);
  if (!column) return [];
  const colDef = column.getColDef();
  if (!isEditable(colDef.editable, rowNode)) return [];
  if (colDef.cellDataType && !isNumericCellDataType(colDef.cellDataType)) return [];

  const data = rowNode.data;
  const rowId = rowNode.id ?? getRowId(data);
  const field = colDef.field ?? colId;
  const value = api.getCellValue({ rowNode, colKey: colId });

  return [{ rowId, colId, field, value }];
}
