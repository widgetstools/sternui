/**
 * Shared evaluation for one (row, column) delta — used by both
 * `cellValueChanged` (user edits / API setValue) and the `modelUpdated`
 * diff pass (host `rowData` stream updates).
 */

import type { ExpressionEngineLike } from '@wellsfargo-starui/engine';
import {
  computeRelativeChange,
  evaluateDataChangeRule,
  type AlertHit,
  type AlertRule,
  type DataChangeRule,
  type RelativeChangeRule,
} from '@wellsfargo-starui/engine';
import type { AlertDispatcher } from './dispatch';
import type { PreviousValuesStore } from './previousValues';

export function partitionEnabledRules(rules: ReadonlyArray<AlertRule>): {
  dataChange: DataChangeRule[];
  relativeChange: RelativeChangeRule[];
} {
  const dataChange: DataChangeRule[] = [];
  const relativeChange: RelativeChangeRule[] = [];
  for (const r of rules) {
    if (!r.enabled) continue;
    if (r.trigger.kind === 'dataChange') {
      dataChange.push(r as DataChangeRule);
    } else if (r.trigger.kind === 'relativeChange') {
      relativeChange.push(r as RelativeChangeRule);
    }
  }
  return { dataChange, relativeChange };
}

export interface EvaluateCellDeltaArgs {
  rowId: string;
  colId: string;
  prev: unknown;
  next: unknown;
  data: Record<string, unknown>;
  rules: ReadonlyArray<AlertRule>;
  engine: ExpressionEngineLike;
  dispatcher: AlertDispatcher;
  prevValues: PreviousValuesStore;
}

/** Evaluate dataChange + relativeChange for one cell delta; updates baseline. */
export function evaluateCellDelta(args: EvaluateCellDeltaArgs): void {
  const { rowId, colId, prev, next, data, rules, engine, dispatcher, prevValues } = args;
  const { dataChange, relativeChange } = partitionEnabledRules(rules);

  for (const rule of dataChange) {
    const hit = evaluateDataChangeRule(
      rule,
      { rowId, data, changedColumn: colId, value: next },
      engine,
    );
    if (hit) dispatcher.dispatch(rule, hit);
  }

  for (const rule of relativeChange) {
    if (rule.trigger.column !== colId) continue;
    const hit = computeRelativeChange(rule, rowId, prev, next);
    if (hit) dispatcher.dispatch(rule, hit);
  }

  prevValues.set(rowId, colId, next);
}

export function collectWatchedColIds(
  api: { getColumns?: () => Array<{ getColId: () => string }> | null },
  rules: ReadonlyArray<AlertRule>,
): Set<string> {
  const ids = new Set<string>();
  try {
    const cols = api.getColumns?.();
    if (cols) {
      for (const c of cols) ids.add(c.getColId());
    }
  } catch {
    /* grid mid-teardown */
  }
  for (const r of rules) {
    if (!r.enabled) continue;
    if (r.trigger.kind === 'relativeChange') ids.add(r.trigger.column);
    if (r.trigger.kind === 'dataChange' && r.trigger.column) ids.add(r.trigger.column);
  }
  return ids;
}
