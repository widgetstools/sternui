import type { GridApi } from 'ag-grid-community';
import {
  applyForwardPatches,
  buildBulkUpdatePatchesFromRaw,
  scanBulkUpdateTargets,
  type BulkUpdateTarget,
  type BulkUpdateTargetScan,
  type EditGridWriter,
  type EditJournal,
} from '@wellsfargo-starui/engine';
import { withJournalApplyGuard } from '../../../editing/journalApplyGuard.js';

/**
 * Targets + unloaded-row count. When `unloadedRowCount > 0` the caller MUST
 * refuse the edit (worklog T6) — an SSRM range spanning unloaded rows would
 * otherwise apply to the loaded subset silently.
 */
export function resolveBulkUpdateTargetScan(
  api: GridApi,
  rowIdField = 'id',
): BulkUpdateTargetScan {
  const getRowId = (data: Record<string, unknown>) => String(data[rowIdField] ?? data.id ?? '');
  return scanBulkUpdateTargets(api as never, getRowId);
}

export function resolveBulkUpdateTargets(api: GridApi, rowIdField = 'id'): BulkUpdateTarget[] {
  return resolveBulkUpdateTargetScan(api, rowIdField).targets;
}

export interface ApplyBulkUpdateOptions {
  rowIdField?: string;
  journal?: EditJournal | null;
  journalLabel?: string;
  patches?: readonly import('@wellsfargo-starui/engine').CellPatch[];
  journalApplyGridId?: string;
  writer?: EditGridWriter;
}

export async function applyBulkUpdateEdits(
  api: GridApi,
  targets: BulkUpdateTarget[],
  rawValue: string,
  options: ApplyBulkUpdateOptions = {},
): Promise<number> {
  const rowIdField = options.rowIdField ?? 'id';
  const patches = options.patches ?? buildBulkUpdatePatchesFromRaw(targets, rawValue);
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
      source: 'bulk-update',
      label: options.journalLabel ?? `Set · ${patches.length} cell${patches.length === 1 ? '' : 's'}`,
      patches,
    });
  }

  return patches.length;
}
