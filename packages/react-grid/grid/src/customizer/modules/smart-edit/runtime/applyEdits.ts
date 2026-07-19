import type { GridApi } from 'ag-grid-community';
import {
  applyForwardPatches,
  applyNumericOp,
  buildPatchesFromTargets,
  collectFocusedCell,
  scanTargetCells,
  type CellPatch,
  type EditGridWriter,
  type EditJournal,
  type SmartEditOp,
  type TargetCell,
  type TargetCellScan,
} from '@wellsfargo-starui/engine';
import { withJournalApplyGuard } from '../../../editing/journalApplyGuard.js';

/**
 * Range targets + unloaded-row count. When `unloadedRowCount > 0` the caller
 * MUST refuse the edit (worklog T6) — an SSRM range spanning unloaded rows
 * would otherwise apply to the loaded subset silently.
 */
export function resolveTargetCellScan(api: GridApi, rowIdField = 'id'): TargetCellScan {
  const getRowId = (data: Record<string, unknown>) => String(data[rowIdField] ?? data.id ?? '');
  const scan = scanTargetCells(api as never, getRowId);
  if (scan.cells.length > 0 || scan.unloadedRowCount > 0) return scan;
  return { cells: collectFocusedCell(api as never, getRowId), unloadedRowCount: 0 };
}

export function resolveTargetCells(api: GridApi, rowIdField = 'id'): TargetCell[] {
  return resolveTargetCellScan(api, rowIdField).cells;
}

/** Refusal notice — never partially apply an edit over unloaded rows. */
export function warnRefusedUnloadedTargets(module: string, unloadedRowCount: number): void {
  // eslint-disable-next-line no-console
  console.warn(
    `[markets-grid] ${module}: edit refused — ${unloadedRowCount} row(s) in the selection `
    + 'are not loaded (server row model). Narrow the selection or scroll the rows into view.',
  );
}

export function buildSmartEditPatches(
  cells: TargetCell[],
  op: SmartEditOp,
  operand: number,
): CellPatch[] {
  return buildPatchesFromTargets(cells, (cell) => applyNumericOp(cell.value, op, operand));
}

export interface ApplyEditsOptions {
  rowIdField?: string;
  journal?: EditJournal | null;
  journalLabel?: string;
  /** When set, apply this patch list instead of computing from cells/op/operand. */
  patches?: readonly CellPatch[];
  /** Grid id — wraps patch apply so cellValueChanged does not re-record. */
  journalApplyGridId?: string;
  /** Prefer host-routed writer (SSRM). Falls back to `api` when omitted. */
  writer?: EditGridWriter;
}

export async function applyEdits(
  api: GridApi,
  cells: TargetCell[],
  op: SmartEditOp,
  operand: number,
  options: ApplyEditsOptions = {},
): Promise<number> {
  const rowIdField = options.rowIdField ?? 'id';
  const patches = options.patches ?? buildSmartEditPatches(cells, op, operand);
  if (patches.length === 0) return 0;

  const writer = options.writer ?? (api as never as EditGridWriter);
  const applyPatches = () => applyForwardPatches(writer, patches, rowIdField);
  if (options.journalApplyGridId) {
    await withJournalApplyGuard(options.journalApplyGridId, applyPatches);
  } else {
    await applyPatches();
  }

  if (options.journal) {
    options.journal.record({
      source: 'smart-edit',
      label: options.journalLabel ?? `${op} (${operand}) · ${patches.length} cell${patches.length === 1 ? '' : 's'}`,
      patches,
    });
  }

  return patches.length;
}
