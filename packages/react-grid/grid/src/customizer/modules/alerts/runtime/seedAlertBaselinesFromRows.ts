/**
 * Seed relativeChange / dataChange baselines from an explicit row set
 * (Perspective full-book fetch). Does not fire alerts — first observation
 * only (same as CSRM mount-time seed).
 */

import type { AlertRule } from '@wellsfargo-starui/engine';
import { getValueByPath } from '@wellsfargo-starui/types';
import { partitionEnabledRules } from './evaluateCellDelta.js';
import type { PreviousValuesStore } from './previousValues.js';

export function seedAlertBaselinesFromRows(opts: {
  rows: readonly Record<string, unknown>[];
  rowIdField: string;
  rules: readonly AlertRule[];
  prevValues: PreviousValuesStore;
  /** Optional AG Grid api for collectWatchedColIds; when omitted, uses rule column ids. */
  watchedColIds?: ReadonlySet<string>;
}): { seededRows: number; seededCells: number } {
  const { rows, rowIdField, rules, prevValues } = opts;
  const { dataChange, relativeChange } = partitionEnabledRules(rules);
  if (dataChange.length === 0 && relativeChange.length === 0) {
    return { seededRows: 0, seededCells: 0 };
  }

  const watched =
    opts.watchedColIds ??
    (() => {
      const ids = new Set<string>();
      for (const r of dataChange) {
        if (r.trigger.column) ids.add(r.trigger.column);
      }
      for (const r of relativeChange) {
        ids.add(r.trigger.column);
      }
      return ids;
    })();

  if (watched.size === 0) return { seededRows: 0, seededCells: 0 };

  let seededRows = 0;
  let seededCells = 0;
  for (const data of rows) {
    const id = data[rowIdField];
    if (id == null) continue;
    const rowId = String(id);
    seededRows += 1;
    for (const colId of watched) {
      prevValues.set(rowId, colId, getValueByPath(data, colId));
      seededCells += 1;
    }
  }
  return { seededRows, seededCells };
}
