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

/**
 * Tick-locality window: `.old`/`.new` styling is a "this just changed"
 * signal, not a permanent property. Without expiry, a full-book update
 * sweep eventually leaves a diff on EVERY row and diff-based rules light
 * the whole grid permanently (field report: "conditional styling flashes
 * the whole grid"). A diff is readable for this window after it was
 * recorded, then reads as absent — the style clears on the row's next
 * repaint.
 */
const SSRM_DIFF_TTL_MS = 2_000;

const previousValues = new PreviousValuesStore(MAX_TRACKED_ROWS);
const latestDiffsByRow = new Map<string, { at: number; map: RowDiffMap }>();

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
    const existing = latestDiffsByRow.get(rowId);
    // A fresh tick supersedes an expired window entirely — stale field
    // diffs from a prior tick must not ride along with the new one.
    const rowEntry =
      existing && Date.now() - existing.at <= SSRM_DIFF_TTL_MS
        ? existing
        : { at: Date.now(), map: new Map() as RowDiffMap };
    rowEntry.at = Date.now();
    for (const [k, v] of diffs) rowEntry.map.set(k, v);
    // Re-insert to refresh eviction order.
    latestDiffsByRow.delete(rowId);
    latestDiffsByRow.set(rowId, rowEntry);
  }
  evictDiffOverflow();
}

/**
 * Latest tick diffs for a row — used by SSRM conditional-styling
 * `.old`/`.new` refs. Tick-local: reads as absent once the TTL passes.
 */
export function getSsrmRowDiff(rowId: string): RowDiffMap | undefined {
  const entry = latestDiffsByRow.get(rowId);
  if (!entry) return undefined;
  if (Date.now() - entry.at > SSRM_DIFF_TTL_MS) {
    latestDiffsByRow.delete(rowId);
    return undefined;
  }
  return entry.map;
}

export function clearSsrmRowDiffs(): void {
  previousValues.clear();
  latestDiffsByRow.clear();
}
