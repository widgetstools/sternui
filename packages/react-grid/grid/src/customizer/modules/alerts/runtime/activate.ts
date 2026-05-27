/**
 * Alerts module runtime — listens to AG-Grid events and routes hits through
 * the dispatcher. No CSS injection, no DOM watchers; alerts are pure
 * event-driven.
 *
 * Wiring:
 *   - cellValueChanged  → evaluate dataChange + relativeChange rules
 *   - modelUpdated / rowDataUpdated
 *       → diff cell values vs. in-memory baselines (host `rowData` stream)
 *       → detect ROW_ADDED / ROW_REMOVED via id-set diff
 *   - platform.subscribe(rules changed) → reset dispatcher timers
 *
 * The previous-values store is per-grid, in-memory, and cleared on
 * teardown. It is intentionally NOT persisted with the profile — a fresh
 * load should not falsely fire relativeChange alerts against a stale
 * baseline.
 */

import type { GridApi, Module, PlatformHandle } from '@starui/engine';
import { detectRowChanges, type AlertsState } from '@starui/engine';
import { getValueByPath } from '@starui/types';
import { createAlertDispatcher } from './dispatch';
import {
  collectWatchedColIds,
  evaluateCellDelta,
  partitionEnabledRules,
} from './evaluateCellDelta';
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

function hasEnabledRowChangeRules(rules: ReadonlyArray<{ enabled: boolean; trigger: { kind: string } }>): boolean {
  return rules.some((r) => r.enabled && r.trigger.kind === 'rowChange');
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
  let modelPassRaf: number | null = null;

  const isEvaluationActive = (): boolean => {
    const settings = platform.getState().settings;
    return settings.enabled && settings.evaluationMode !== 'paused';
  };

  const processModelCellChanges = (): void => {
    const api = platform.api.api;
    if (!api || !isEvaluationActive()) return;

    const rules = platform.getState().rules;
    const { dataChange, relativeChange } = partitionEnabledRules(rules);
    if (dataChange.length === 0 && relativeChange.length === 0) return;

    const watchedCols = collectWatchedColIds(api, rules);
    if (watchedCols.size === 0) return;

    try {
      api.forEachNode((node) => {
        const rowId = resolveRowId(node);
        if (!rowId) return;
        const data = (node as { data?: Record<string, unknown> }).data ?? {};
        for (const colId of watchedCols) {
          const next = getValueByPath(data, colId);
          const prev = prevValues.get(rowId, colId);
          if (prev === undefined) {
            prevValues.set(rowId, colId, next);
            continue;
          }
          if (Object.is(prev, next)) continue;
          evaluateCellDelta({
            rowId,
            colId,
            prev,
            next,
            data,
            rules,
            engine,
            dispatcher,
            prevValues,
          });
        }
      });
    } catch {
      /* grid mid-teardown */
    }
  };

  const scheduleModelPass = (): void => {
    const mode = platform.getState().settings.evaluationMode;
    if (mode === 'throttled') {
      if (modelPassRaf !== null) return;
      modelPassRaf = requestAnimationFrame(() => {
        modelPassRaf = null;
        processModelCellChanges();
      });
      return;
    }
    processModelCellChanges();
  };

  const onCellValueChanged = (evt: CellValueChangedEvent) => {
    if (!isEvaluationActive()) return;

    const node = evt.node;
    const rowId = resolveRowId(node);
    if (!rowId) return;
    const colId = evt.column?.getColId?.();
    if (!colId) return;

    const data = evt.data ?? (node as { data?: Record<string, unknown> }).data ?? {};
    const newValue = evt.newValue;
    const prev = prevValues.get(rowId, colId);

    if (platform.getState().settings.evaluationMode === 'throttled') {
      // Coalesce with the modelUpdated pass — one evaluation per frame.
      scheduleModelPass();
      return;
    }

    evaluateCellDelta({
      rowId,
      colId,
      prev: prev ?? evt.oldValue,
      next: newValue,
      data,
      rules: platform.getState().rules,
      engine,
      dispatcher,
      prevValues,
    });
  };

  const onModelUpdated = () => {
    const api = platform.api.api;
    if (!api) return;

    const rules = platform.getState().rules;
    const next = snapshotRowIds(api);

    if (isEvaluationActive() && hasEnabledRowChangeRules(rules)) {
      const added: Array<{ id: string }> = [];
      const removed: Array<{ id: string }> = [];
      for (const id of next) if (!knownRowIds.has(id)) added.push({ id });
      for (const id of knownRowIds) if (!next.has(id)) removed.push({ id });
      if (added.length > 0 || removed.length > 0) {
        const hits = detectRowChanges(added, removed, rules);
        const rulesById = new Map(rules.map((r) => [r.id, r]));
        for (const hit of hits) {
          const rule = rulesById.get(hit.ruleId);
          if (rule) dispatcher.dispatch(rule, hit);
        }
      }
    }

    for (const id of knownRowIds) if (!next.has(id)) prevValues.deleteRow(id);
    knownRowIds = next;

    scheduleModelPass();
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
            prevValues.set(id, colId, getValueByPath(data, colId));
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
  disposers.push(platform.api.on('modelUpdated', onModelUpdated));
  disposers.push(platform.api.on('rowDataUpdated', onModelUpdated));

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
    if (modelPassRaf !== null) {
      cancelAnimationFrame(modelPassRaf);
      modelPassRaf = null;
    }
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
