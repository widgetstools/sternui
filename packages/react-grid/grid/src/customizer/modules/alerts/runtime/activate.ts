/**
 * Alerts module runtime — listens to AG-Grid events and routes hits through
 * the dispatcher. No CSS injection, no DOM watchers; alerts are pure
 * event-driven.
 *
 * Wiring:
 *   - cellValueChanged  → evaluate dataChange + relativeChange rules
 *   - modelUpdated      → detect ROW_ADDED / ROW_REMOVED via id-set diff
 *   - rowDataUpdated    → same row-diff path (handles snapshot replaces)
 *   - platform.subscribe(rules changed) → reset dispatcher timers
 *
 * The previous-values store is per-grid, in-memory, and cleared on
 * teardown. It is intentionally NOT persisted with the profile — a fresh
 * load should not falsely fire relativeChange alerts against a stale
 * baseline.
 */

import type { GridApi, Module, PlatformHandle } from '@starui/engine';
import {
  computeRelativeChange,
  detectRowChanges,
  evaluateDataChangeRule,
  type AlertHit,
  type AlertRule,
  type AlertsState,
  type DataChangeRule,
  type RelativeChangeRule,
} from '@starui/engine';
import { createAlertDispatcher } from './dispatch';
import { createPreviousValuesStore } from './previousValues';

function resolveRowId(node: unknown): string | null {
  if (!node || typeof node !== 'object') return null;
  const candidate = (node as { id?: unknown }).id;
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : null;
}

interface CellValueChangedEvent {
  node?: unknown;
  column?: { getColId?: () => string };
  oldValue?: unknown;
  newValue?: unknown;
  data?: Record<string, unknown>;
}

function partitionRules(rules: ReadonlyArray<AlertRule>): {
  dataChange: DataChangeRule[];
  relativeChange: RelativeChangeRule[];
  hasRowChange: boolean;
} {
  const dataChange: DataChangeRule[] = [];
  const relativeChange: RelativeChangeRule[] = [];
  let hasRowChange = false;
  for (const r of rules) {
    if (!r.enabled) continue;
    if (r.trigger.kind === 'dataChange') {
      dataChange.push(r as DataChangeRule);
    } else if (r.trigger.kind === 'relativeChange') {
      relativeChange.push(r as RelativeChangeRule);
    } else {
      hasRowChange = true;
    }
  }
  return { dataChange, relativeChange, hasRowChange };
}

function snapshotRowIds(api: GridApi): Set<string> {
  const ids = new Set<string>();
  try {
    api.forEachNode((node) => {
      const id = resolveRowId(node);
      if (id) ids.add(id);
    });
  } catch {
    /* grid mid-teardown */
  }
  return ids;
}

export function activateAlerts(
  platform: PlatformHandle<AlertsState>,
): ReturnType<NonNullable<Module<AlertsState>['activate']>> {
  const disposers: Array<() => void> = [];
  const dispatcher = createAlertDispatcher(platform);
  const prevValues = createPreviousValuesStore();
  const engine = platform.resources.expression();

  let knownRowIds: Set<string> = new Set();

  const onCellValueChanged = (evt: CellValueChangedEvent) => {
    const settings = platform.getState().settings;
    if (!settings.enabled || settings.evaluationMode === 'paused') return;

    const node = evt.node;
    const rowId = resolveRowId(node);
    if (!rowId) return;
    const colId = evt.column?.getColId?.();
    if (!colId) return;

    const data = evt.data ?? (node as { data?: Record<string, unknown> }).data ?? {};
    const newValue = evt.newValue;
    const { dataChange, relativeChange } = partitionRules(platform.getState().rules);

    // dataChange: evaluate every rule (subject to its own column-scope filter).
    for (const rule of dataChange) {
      const hit = evaluateDataChangeRule(
        rule,
        { rowId, data, changedColumn: colId, value: newValue },
        engine,
      );
      if (hit) dispatcher.dispatch(rule, hit);
    }

    // relativeChange: only rules bound to this column see this change.
    for (const rule of relativeChange) {
      if (rule.trigger.column !== colId) continue;
      const prev = prevValues.get(rowId, colId);
      const hit = computeRelativeChange(rule, rowId, prev, newValue);
      if (hit) dispatcher.dispatch(rule, hit);
    }

    // Always update the baseline after evaluation — even if no relativeChange
    // rule is currently bound, the next-loaded profile might add one.
    prevValues.set(rowId, colId, newValue);
  };

  const onRowsChanged = () => {
    const api = platform.api.api;
    if (!api) return;
    const settings = platform.getState().settings;
    if (!settings.enabled || settings.evaluationMode === 'paused') return;

    const { hasRowChange } = partitionRules(platform.getState().rules);
    const next = snapshotRowIds(api);

    if (hasRowChange) {
      const added: Array<{ id: string }> = [];
      const removed: Array<{ id: string }> = [];
      for (const id of next) if (!knownRowIds.has(id)) added.push({ id });
      for (const id of knownRowIds) if (!next.has(id)) removed.push({ id });
      if (added.length > 0 || removed.length > 0) {
        const hits = detectRowChanges(added, removed, platform.getState().rules);
        const rulesById = new Map(platform.getState().rules.map((r) => [r.id, r]));
        for (const hit of hits) {
          const rule = rulesById.get(hit.ruleId);
          if (rule) dispatcher.dispatch(rule, hit);
        }
      }
    }

    // Garbage-collect previous-value entries for vanished rows so the store
    // doesn't grow unbounded under churn.
    for (const id of knownRowIds) if (!next.has(id)) prevValues.deleteRow(id);
    knownRowIds = next;
  };

  // Initial seeding + listener attachment, deferred until the grid is ready.
  disposers.push(
    platform.api.onReady((api) => {
      knownRowIds = snapshotRowIds(api);
      // forEachNode to populate baselines for every (row, col) cell so
      // the FIRST cellValueChanged after activation isn't treated as the
      // first observation.
      try {
        const cols =
          (api as { getColumns?: () => Array<{ getColId: () => string }> | null }).getColumns?.() ??
          [];
        api.forEachNode((node) => {
          const id = resolveRowId(node);
          if (!id) return;
          const data = (node as { data?: Record<string, unknown> }).data ?? {};
          for (const c of cols) {
            const colId = c.getColId();
            if (colId in data) prevValues.set(id, colId, data[colId]);
          }
        });
      } catch {
        /* grid mid-teardown */
      }

      // AG-Grid expects raw handlers; cast through to keep this file
      // framework-thin (no ag-grid-community imports leak in).
      const handler = onCellValueChanged as unknown as () => void;
      api.addEventListener('cellValueChanged', handler);
      disposers.push(() => api.removeEventListener('cellValueChanged', handler));
    }),
  );
  disposers.push(platform.api.on('modelUpdated', onRowsChanged));
  disposers.push(platform.api.on('rowDataUpdated', onRowsChanged));

  // Reset dispatcher debounce timers when the rule list mutates (profile
  // switch, in-place edit). The previous-values store is preserved across
  // rule edits — relativeChange baselines are about the data stream, not
  // about which rules are watching it.
  disposers.push(
    platform.subscribe(() => {
      dispatcher.reset();
    }),
  );

  const safely = (label: string, fn: () => void): void => {
    try {
      fn();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[alerts] cleanup step failed:', label, err);
    }
  };

  return () => {
    for (const d of disposers) {
      try {
        d();
      } catch {
        /* swallow — per-disposer */
      }
    }
    safely('previousValues.clear', () => prevValues.clear());
    safely('dispatcher.reset', () => dispatcher.reset());
  };
}
