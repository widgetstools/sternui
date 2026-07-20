import type { CellDiffEntry, RowDiffMap } from '@wellsfargo-starui/engine';
import { PreviousValuesStore, type FieldDiff } from './previousValuesStore.js';

/**
 * Both stores are module-scope and therefore shared by every grid instance
 * in the window; rows key by row id, so two grids on the SAME provider
 * share identical diffs harmlessly, while distinct providers with
 * colliding generic ids may cross-read (accepted — diffs are transient
 * styling hints). Growth is BOUNDED: oldest-inserted rows evict once the
 * cap is exceeded, so a long-running window can't grow without limit
 * (worklog B3).
 */
const MAX_TRACKED_ROWS = 50_000;

const previousValues = new PreviousValuesStore(MAX_TRACKED_ROWS);
const latestDiffsByRow = new Map<string, RowDiffMap>();

function evictDiffOverflow(): void {
  while (latestDiffsByRow.size > MAX_TRACKED_ROWS) {
    const oldest = latestDiffsByRow.keys().next().value;
    if (oldest === undefined) break;
    latestDiffsByRow.delete(oldest);
  }
}

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
  evictDiffOverflow();
}

/** Latest tick diffs for a row — used by SSRM conditional-styling `.old`/`.new` refs. */
export function getSsrmRowDiff(rowId: string): RowDiffMap | undefined {
  return latestDiffsByRow.get(rowId);
}

export function clearSsrmRowDiffs(): void {
  previousValues.clear();
  latestDiffsByRow.clear();
}
