/**
 * Alerts module runtime — listens to the platform's shared row-change signal
 * and routes hits through the dispatcher. No CSS injection, no DOM watchers;
 * alerts are pure event-driven.
 *
 * Wiring:
 *   - cellValueChanged   → evaluate dataChange + relativeChange rules for the
 *                          one edited cell (user edits, immediate)
 *   - platform.rows      → the rAF-coalesced row-change delta from streaming
 *       · delta (full=false): evaluate ONLY the changed/added nodes, and read
 *         row add/remove straight from the transaction delta — NO whole-grid
 *         `forEachNode` scan per tick. This is the hot path.
 *       · full  (full=true):  a structural change (sort/filter/setRowData) with
 *         no per-row delta → fall back to a whole-grid pass. Rare, user-driven.
 *   - platform.subscribe (rules changed) → reset dispatcher timers
 *
 * GATE: when no alert rule is enabled the subscriber returns immediately, so an
 * idle alerts module costs nothing per tick. Previously this module walked
 * every row via `forEachNode` on EVERY `modelUpdated` (even with zero rules,
 * and synchronously in 'realtime' mode) — the dominant per-tick cost that made
 * large live grids sluggish.
 *
 * The previous-values store is per-grid, in-memory, and cleared on teardown. It
 * is intentionally NOT persisted with the profile — a fresh load should not
 * falsely fire relativeChange alerts against a stale baseline.
 */

import type { GridApi, Module, PlatformHandle, RowChange } from '@starui/engine';
import { detectRowChanges, type AlertsState } from '@starui/engine';

/** Structural shape of an AG-Grid row node — avoids leaking an ag-grid import. */
type RowNodeLike = { id?: unknown; data?: Record<string, unknown> };
import { getValueByPath } from '@starui/types';
import { createAlertDispatcher } from './dispatch';
import {
  collectWatchedColIds,
  evaluateCellDelta,
  partitionEnabledRules,
} from './evaluateCellDelta';
import { createPreviousValuesStore } from './previousValues';
import {
  getAlertsLeafFetcher,
  registerAlertsBaselineSeedBinding,
} from './alertsFullBookRescan';

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

  // Phase 4b: on-demand full-book baseline seed (SSRM Perspective fetch).
  registerAlertsBaselineSeedBinding(platform, {
    prevValues,
    getRules: () => platform.getState().rules,
  });
  disposers.push(() => registerAlertsBaselineSeedBinding(platform, null));

  let knownRowIds: Set<string> = new Set();

  const isEvaluationActive = (): boolean => {
    const settings = platform.getState().settings;
    return settings.enabled && settings.evaluationMode !== 'paused';
  };

  /** Dispatch ROW_ADDED / ROW_REMOVED hits for a given add/remove id set. */
  const dispatchRowChanges = (
    added: Array<{ id: string }>,
    removed: Array<{ id: string }>,
    rules: AlertsState['rules'],
  ): void => {
    if (added.length === 0 && removed.length === 0) return;
    const hits = detectRowChanges(added, removed, rules);
    if (hits.length === 0) return;
    const rulesById = new Map(rules.map((r) => [r.id, r]));
    for (const hit of hits) {
      const rule = rulesById.get(hit.ruleId);
      if (rule) dispatcher.dispatch(rule, hit);
    }
  };

  /**
   * Evaluate dataChange / relativeChange rules against ONE row node, comparing
   * each watched column against its stored baseline. Seeds the baseline on
   * first observation (no fire). Shared by the delta and full-pass paths.
   */
  const scanNode = (
    node: RowNodeLike,
    rules: AlertsState['rules'],
    watchedCols: ReadonlySet<string>,
  ): void => {
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
  };

  /**
   * Delta path (streaming hot path): evaluate ONLY the nodes the transaction
   * actually touched. No whole-grid `forEachNode`.
   */
  const runDelta = (change: RowChange, rules: AlertsState['rules']): void => {
    // Row add/remove alerts come straight from the transaction delta.
    if (hasEnabledRowChangeRules(rules)) {
      const added: Array<{ id: string }> = [];
      const removed: Array<{ id: string }> = [];
      for (const n of change.added) { const id = resolveRowId(n); if (id) added.push({ id }); }
      for (const n of change.removed) { const id = resolveRowId(n); if (id) removed.push({ id }); }
      dispatchRowChanges(added, removed, rules);
    }

    // Keep knownRowIds current (consumed by the full-pass diff) + drop
    // baselines for removed rows.
    for (const n of change.added) { const id = resolveRowId(n); if (id) knownRowIds.add(id); }
    for (const n of change.removed) {
      const id = resolveRowId(n);
      if (id) { knownRowIds.delete(id); prevValues.deleteRow(id); }
    }

    const { dataChange, relativeChange } = partitionEnabledRules(rules);
    if (dataChange.length === 0 && relativeChange.length === 0) return;
    const api = platform.api.api;
    if (!api) return;
    const watchedCols = collectWatchedColIds(api, rules);
    if (watchedCols.size === 0) return;

    for (const node of change.updated) scanNode(node, rules, watchedCols);
    // New rows: seed baselines so their first subsequent tick compares cleanly.
    for (const node of change.added) scanNode(node, rules, watchedCols);
  };

  /**
   * Full pass (structural change — sort/filter/setRowData): re-detect row
   * add/remove via id-set diff and re-scan every row for cell deltas. Rare and
   * user-driven, never the streaming hot path.
   */
  const runFullPass = (rules: AlertsState['rules']): void => {
    const api = platform.api.api;
    if (!api) return;

    const next = snapshotRowIds(api);
    if (hasEnabledRowChangeRules(rules)) {
      const added: Array<{ id: string }> = [];
      const removed: Array<{ id: string }> = [];
      for (const id of next) if (!knownRowIds.has(id)) added.push({ id });
      for (const id of knownRowIds) if (!next.has(id)) removed.push({ id });
      dispatchRowChanges(added, removed, rules);
    }
    for (const id of knownRowIds) if (!next.has(id)) prevValues.deleteRow(id);
    knownRowIds = next;

    const { dataChange, relativeChange } = partitionEnabledRules(rules);
    if (dataChange.length === 0 && relativeChange.length === 0) return;
    const watchedCols = collectWatchedColIds(api, rules);
    if (watchedCols.size === 0) return;
    try {
      api.forEachNode((node) => scanNode(node, rules, watchedCols));
    } catch {
      /* grid mid-teardown */
    }
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

  // Initial seeding + listener attachment, deferred until the grid is ready.
  disposers.push(
    platform.api.onReady((api) => {
      const isSsrm = (() => {
        try {
          return api.getGridOption?.('rowModelType') === 'serverSide';
        } catch {
          return false;
        }
      })();

      // SSRM: do not forEachNode the (partial) viewport to seed baselines —
      // first tick deltas seed via scanNode. CSRM keeps the mount-time seed.
      if (!isSsrm) {
        knownRowIds = snapshotRowIds(api);
        try {
          const rules = platform.getState().rules;
          const { dataChange, relativeChange } = partitionEnabledRules(rules);
          if (dataChange.length > 0 || relativeChange.length > 0) {
            const watchedCols = collectWatchedColIds(api, rules);
            if (watchedCols.size > 0) {
              api.forEachNode((node) => {
                const id = resolveRowId(node);
                if (!id) return;
                const data = (node as { data?: Record<string, unknown> }).data ?? {};
                for (const colId of watchedCols) {
                  prevValues.set(id, colId, getValueByPath(data, colId));
                }
              });
            }
          }
        } catch {
          /* grid mid-teardown */
        }
      } else {
        knownRowIds = new Set();
      }

      // AG-Grid expects raw handlers; cast through to keep this file
      // framework-thin (no ag-grid-community imports leak in).
      const handler = onCellValueChanged as unknown as () => void;
      api.addEventListener('cellValueChanged', handler);
      disposers.push(() => api.removeEventListener('cellValueChanged', handler));
    }),
  );

  /**
   * Whole-book evaluation for server-side row models.
   *
   * MEASURED (`docs/perspective-grid-issuetobefixed.md`): on the Perspective
   * surface the row-change bus emits ONLY `full` changes — 40 of them over 12 s
   * of ticking, and 0 deltas — because ticks reach the grid as a worker
   * `table.update()` then a block re-read, with no transaction for
   * `publishSsrmTransactionDelta` to publish from. The `full` branch below
   * discarded those, so alerts received 40 signals and used none: every live
   * rule was silently dead.
   *
   * Evaluated from the WHOLE book, not from the loaded blocks. Scoping it to
   * what this window happens to hold would make a rule fire or not depending
   * on where the user last scrolled — worse than not firing, because the dead
   * one is at least obvious.
   *
   * Cost is controlled three ways, since a whole-book read is not free (~547 ms
   * for 20,000 rows on the measured book): the caller has already gated on an
   * enabled rule existing, passes are throttled to `SERVER_SIDE_PASS_MIN_MS`,
   * and a pass in flight suppresses the next rather than queueing behind it.
   */
  const SERVER_SIDE_PASS_MIN_MS = 1_000;
  let lastServerSidePassAt = 0;
  let serverSidePassInFlight = false;

  const runServerSideWholeBookPass = (): void => {
    const fetcher = getAlertsLeafFetcher(platform);
    if (!fetcher) return;
    if (serverSidePassInFlight) return;
    const now = Date.now();
    if (now - lastServerSidePassAt < SERVER_SIDE_PASS_MIN_MS) return;
    lastServerSidePassAt = now;
    serverSidePassInFlight = true;

    void fetcher
      .fetch()
      .then((rows) => {
        if (!isEvaluationActive()) return;
        // Re-read: a profile switch may have changed the rules mid-fetch.
        const current = platform.getState().rules;
        if (!current.some((r) => r.enabled)) return;

        // Node-shaped, because `scanNode` / `resolveRowId` read `id` + `data`.
        // The id MUST match the grid's own row ids, or baselines would be kept
        // under a second key and every row would look new on every pass.
        const nodes: Array<{ id: string; data: Record<string, unknown> }> = [];
        for (const row of rows) {
          const raw = (row as Record<string, unknown>)[fetcher.rowIdField];
          const id = raw == null ? '' : String(raw);
          if (id) nodes.push({ id, data: row as Record<string, unknown> });
        }

        const next = new Set(nodes.map((n) => n.id));
        if (hasEnabledRowChangeRules(current)) {
          const added: Array<{ id: string }> = [];
          const removed: Array<{ id: string }> = [];
          for (const id of next) if (!knownRowIds.has(id)) added.push({ id });
          for (const id of knownRowIds) if (!next.has(id)) removed.push({ id });
          dispatchRowChanges(added, removed, current);
        }
        for (const id of knownRowIds) if (!next.has(id)) prevValues.deleteRow(id);
        knownRowIds = next;

        const { dataChange, relativeChange } = partitionEnabledRules(current);
        if (dataChange.length === 0 && relativeChange.length === 0) return;
        const api = platform.api.api;
        if (!api) return;
        const watchedCols = collectWatchedColIds(api, current);
        if (watchedCols.size === 0) return;
        for (const node of nodes) scanNode(node as never, current, watchedCols);
      })
      .catch(() => {
        /* a failed read must not take the subscription down */
      })
      .finally(() => {
        serverSidePassInFlight = false;
      });
  };

  // The shared, rAF-coalesced row-change signal replaces the per-tick
  // `modelUpdated` + `forEachNode` scan. GATE: no enabled rules → no work.
  disposers.push(
    platform.rows.subscribe((change) => {
      if (!isEvaluationActive()) return;
      const rules = platform.getState().rules;
      if (!rules.some((r) => r.enabled)) return;
      if (change.full) {
        // A client-side full pass here would scan the few hundred rows THIS
        // window holds and call it the book. Where a whole-book fetcher is
        // registered (the Perspective path registers one), evaluate from that
        // instead; otherwise fall through, which stays correct on CSRM because
        // there the client really does hold the whole book.
        try {
          const api = platform.api.api;
          if (api?.getGridOption?.('rowModelType') === 'serverSide') {
            runServerSideWholeBookPass();
            return;
          }
        } catch {
          /* ignore */
        }
        runFullPass(rules);
      } else {
        runDelta(change, rules);
      }
    }),
  );

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
