import type { CellDiffEntry, RowDiffMap } from '@starui/engine';
import { PreviousValuesStore, type FieldDiff } from './previousValuesStore.js';

const previousValues = new PreviousValuesStore();
const latestDiffsByRow = new Map<string, RowDiffMap>();

/** Resolve row id from tick payload — prefer `id`, else configured rowIdField. */
export function resolveSsrmTickRowId(
  row: Record<string, unknown>,
  rowIdField?: string,
): string | null {
  const id = row.id;
  if (typeof id === 'string' && id.length > 0) return id;
  if (rowIdField) {
    const v = row[rowIdField];
    if (typeof v === 'string' && v.length > 0) return v;
    if (v != null) return String(v);
  }
  return null;
}

function toRowDiffMap(diffs: Map<string, FieldDiff>): RowDiffMap {
  const out: RowDiffMap = new Map();
  for (const [k, v] of diffs) {
    out.set(k, v as CellDiffEntry);
  }
  return out;
}

/** Record tick diffs before SSRM applyTransaction — keyed by row id for expression ctx. */
export function recordSsrmTickDiffs(
  rows: Record<string, unknown>[],
  rowIdField?: string,
): void {
  for (const row of rows) {
    const rowId = resolveSsrmTickRowId(row, rowIdField);
    if (!rowId) continue;
    const diffs = previousValues.diffAndUpdate(rowId, row);
    if (diffs.size === 0) continue;
    const hasPriorValues = [...diffs.values()].some((d) => d.oldValue !== undefined);
    if (!hasPriorValues) continue;
    let rowMap = latestDiffsByRow.get(rowId);
    if (!rowMap) {
      rowMap = new Map();
      latestDiffsByRow.set(rowId, rowMap);
    }
    for (const [k, v] of diffs) rowMap.set(k, v);
  }
}

/** Latest tick diffs for a row — used by SSRM conditional-styling `.old`/`.new` refs. */
export function getSsrmRowDiff(rowId: string): RowDiffMap | undefined {
  return latestDiffsByRow.get(rowId);
}

export function forgetSsrmRowDiff(rowId: string): void {
  previousValues.forget(rowId);
  latestDiffsByRow.delete(rowId);
}

export function clearSsrmRowDiffs(): void {
  previousValues.clear();
  latestDiffsByRow.clear();
}
