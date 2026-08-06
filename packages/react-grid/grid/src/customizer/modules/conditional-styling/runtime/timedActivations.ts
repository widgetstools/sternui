/**
 * Timed-rule activation engine.
 *
 * Two entry points:
 *
 *  - `processTimedActivations()` — bulk pass after `modelUpdated`. Walks
 *    every row, diffs against the previous-render snapshot per known
 *    column path, evaluates every timed rule whose triggers fired, and
 *    upserts cell/row activations into the module-scoped state.
 *
 *  - `attachCellValueChangedListener()` — per-tick path. Wires AG-Grid's
 *    `cellValueChanged` event to evaluate timed rules immediately for the
 *    one cell that changed, then enqueues a cross-column targeted refresh
 *    if the changed column was a "trigger" for any cell-scope rule (so
 *    the rule's verdict propagates uniformly across `scope.columns`).
 *
 * State owned by this module:
 *   - `previousByRow` — last-render path→value snapshots per row, used
 *     for diff-driven trigger detection in the bulk pass
 *   - the cellValueChanged disposer
 *
 * Dependencies are injected as a deps bag so the orchestrator wires
 * everything explicitly; this module never reaches across boundaries
 * to grab shared state.
 */

import type { PlatformHandle } from '@starui/engine';
import type { GridApi } from 'ag-grid-community';
import { getValueByPath } from '@starui/types';
import {
  pruneTimedRuleState,
  upsertTimedCellActivation,
  upsertTimedRowActivation,
} from '../transforms';
import type { DiffCacheByApi } from '../transforms';
import type { ConditionalStylingState } from '../state';
import {
  buildColumnsContextFromDiffs,
  normalizeDuration,
  resolveRowId,
  traceTimed,
} from './utils';
import type { TriggerCache } from './triggerCache';

/**
 * Does this expression read the CELL's own value?
 *
 * `value` and `x` are the two documented spellings (see the seeds' header
 * comment), and they are what `cellClassRules` binds when AG paints. A timed
 * activation used to bind both to `null`, which made every rule written that
 * way — `value < 0`, `value > 8`, `value != null` — false for every row.
 *
 * A source-text test rather than a walk of the parsed tree, deliberately: this
 * only chooses an EVALUATION STRATEGY, so a false positive costs one extra
 * evaluation per scoped column and a false negative is impossible for any
 * expression that really names one. `\\b` keeps `maxValue` and `xRate` out of
 * it. The parsed tree is not available here without parsing twice, and the
 * answer would be the same.
 */
const CELL_VALUE_REF = /\b(?:value|x)\b/;

/** Memoised per expression — this runs per rule per row per tick. */
const readsCellValueCache = new Map<string, boolean>();
function readsCellValue(expression: string): boolean {
  const held = readsCellValueCache.get(expression);
  if (held !== undefined) return held;
  const answer = CELL_VALUE_REF.test(expression);
  // Bounded: an author editing an expression produces a new string per
  // keystroke, and this map would otherwise grow for the life of the page.
  if (readsCellValueCache.size > 256) readsCellValueCache.clear();
  readsCellValueCache.set(expression, answer);
  return answer;
}

export interface TimedActivationsDeps {
  triggers: TriggerCache;
  diffCacheByApi: DiffCacheByApi;
  scheduleRefresh: () => void;
  scheduleTargetedRefresh: (
    rowIds: Iterable<string>,
    colIds: Iterable<string>,
    includesRowScope: boolean,
  ) => void;
  armNextExpiry: () => void;
  /** Header repaint after rule verdicts may have flipped. */
  evaluate: () => void;
}

export interface TimedActivations {
  /** Bulk pass — call from modelUpdated / onReady. */
  processTimedActivations: () => void;
  /** Wire up the per-tick cellValueChanged path. Returns a disposer. */
  attachCellValueChangedListener: () => () => void;
  /** Drop all in-memory snapshots (used by the orchestrator at teardown). */
  dispose: () => void;
}

export function createTimedActivations(
  platform: PlatformHandle<ConditionalStylingState>,
  deps: TimedActivationsDeps,
): TimedActivations {
  const previousByRow = new Map<string, Map<string, unknown>>();

  const processTimedActivations = (): void => {
    const api = platform.api.api;
    if (!api) return;
    const state = platform.getState();
    const engine = platform.resources.expression();
    const now = Date.now();
    const timedRules = state.rules.filter((r) => r.enabled && normalizeDuration(r.activeDurationMs) != null);
    if (timedRules.length === 0) return;
    const activeRowIds = new Set<string>();
    let activatedThisPass = false;

    // Path-keyed diff surface. Drive change detection by AG-Grid's
    // actual colIds (which carry dot-paths when a colDef's `field`
    // walks into a nested object), unioned with every column ANY
    // active rule's expression depends on (rule triggers may reference
    // fields that are part of the row data but not surfaced as
    // AG-Grid columns).
    //
    // Top-level `Object.entries(data)` walking misses nested changes:
    //   - For `{ x: { z: { price: 100 } } }`, entries yields `['x']`,
    //     never `'x.z.price'` — a tick that ONLY changes the deep
    //     leaf would either be invisible (in-place mutation: `x` is
    //     the same reference) or recorded under the wrong key (object
    //     replacement: diff stored under `'x'`, but the expression
    //     reads `[x.z.price.old]` which doesn't resolve through that
    //     entry). Both cases produce silent no-ops.
    //
    // Resolving each known path via `getValueByPath` walks the
    // current data on every read, so in-place mutation is detected
    // correctly and sparse rows (path absent on this row) compare
    // `undefined`-to-`undefined` cleanly without false positives.
    const knownPaths = new Set<string>();
    try {
      const cols = (api as { getColumns?: () => Array<{ getColId: () => string }> | null }).getColumns?.();
      if (cols) {
        for (const c of cols) knownPaths.add(c.getColId());
      }
    } catch {
      /* grid mid-teardown */
    }
    for (const rule of timedRules) {
      const trig = deps.triggers.get(rule);
      if (trig) for (const t of trig) knownPaths.add(t);
    }

    const rowDiffCache = deps.diffCacheByApi.get(api as object);
    api.forEachNode((node) => {
      const rowId = resolveRowId(node);
      if (!rowId) return;
      activeRowIds.add(rowId);
      const data = (node as { data?: Record<string, unknown> }).data ?? {};
      const prev = previousByRow.get(rowId) ?? new Map<string, unknown>();
      const changedKeys: string[] = [];
      const currentByPath = new Map<string, unknown>();
      for (const path of knownPaths) {
        const cur = getValueByPath(data, path);
        currentByPath.set(path, cur);
        if (!Object.is(prev.get(path), cur)) changedKeys.push(path);
      }
      if (changedKeys.length === 0) return;

      // Keep diff context in sync for expressions that use .old/.new refs.
      // Path-keyed entries so `[x.z.price.old]` resolves through the
      // own-property write in `buildColumnsContextFromDiffs`, not by
      // accidentally falling back to dot-walking the current data.
      if (rowDiffCache && typeof node === 'object' && node) {
        let rowDiffs = rowDiffCache.get(node as object);
        if (!rowDiffs) {
          rowDiffs = new Map();
          rowDiffCache.set(node as object, rowDiffs);
        }
        for (const path of changedKeys) {
          rowDiffs.set(path, { oldValue: prev.get(path), newValue: currentByPath.get(path) });
        }
      }

      const columns = buildColumnsContextFromDiffs(
        data,
        rowDiffCache?.get(node as object),
      );

      for (const rule of timedRules) {
        const ttlMs = normalizeDuration(rule.activeDurationMs);
        if (ttlMs == null) continue;
        if (rule.scope.type === 'row') {
          let match = false;
          try {
            match = Boolean(
              engine.parseAndEvaluate(rule.expression, {
                x: null,
                value: null,
                data,
                columns,
              }),
            );
          } catch {
            match = false;
          }
          if (!match) continue;
          upsertTimedRowActivation(rowId, rule.id, now + ttlMs);
          activatedThisPass = true;
          traceTimed('row rule activated (model diff)', { rowId, ruleId: rule.id, until: now + ttlMs });
          continue;
        }

        // Cross-column contract: the expression is a row-level
        // predicate, and `scope.columns` is the paint surface. Evaluate
        // ONCE per row (not per scoped column) and — if the predicate
        // is true — activate every column in `scope.columns`, even
        // ones whose own value didn't change in this transaction.
        //
        // Bounded re-evaluation: skip the rule entirely when NONE of
        // the columns its expression depends on appear in this row's
        // changedKeys, so untouched rows don't re-evaluate on every
        // modelUpdated. Falls back to "always evaluate" when we can't
        // identify trigger columns (parse failure, literal expression).
        const triggers = deps.triggers.get(rule);
        const hasRelevantChange =
          !triggers || triggers.size === 0 ||
          changedKeys.some((k) => triggers.has(k));
        if (!hasRelevantChange) continue;

        /**
         * **`value` / `x` are the CELL's value, and binding them to null made
         * every rule that reads one dead.**
         *
         * The cross-column contract above is why this used to evaluate once
         * per row with `value: null` — there is no single "current cell" for a
         * row-level predicate. But `value` is the documented way to write a
         * cell rule (`value < 0`, `value > 8`, `value != null`), it is what
         * `cellClassRules` binds when AG paints, and against `null` every one
         * of those predicates is false. So a timed rule written that way never
         * activated, on ANY surface: MEASURED on the lab's 50,000-row book,
         * where a rule reading `value` flashed 0 cells and the identical rule
         * written as `[esgScore] != null` flashed 11.
         *
         * The fix keeps the contract for every expression that does not read a
         * cell value — those still evaluate ONCE and light every scoped column,
         * including ones whose own value did not move. An expression that DOES
         * read one is evaluated per scoped column with that column's value
         * bound, which is the only answer that can be right: the predicate is
         * about a cell, so it has to be asked about each cell.
         */
        const perColumn = readsCellValue(rule.expression);
        const evaluateFor = (cellValue: unknown): boolean => {
          try {
            return Boolean(
              engine.parseAndEvaluate(rule.expression, {
                x: cellValue,
                value: cellValue,
                data,
                columns,
              }),
            );
          } catch {
            return false;
          }
        };

        if (!perColumn && !evaluateFor(null)) continue;
        for (const colId of rule.scope.columns) {
          if (perColumn && !evaluateFor(getValueByPath(data, colId))) continue;
          upsertTimedCellActivation(rowId, rule.id, colId, now + ttlMs);
          activatedThisPass = true;
          traceTimed('cell rule activated (model diff)', { rowId, ruleId: rule.id, colId, until: now + ttlMs });
        }
      }

      // Snapshot keyed by the same paths we just diffed against, so
      // the next pass can detect deep-leaf changes (in-place or by
      // object replacement) regardless of whether the parent ref
      // moved.
      previousByRow.set(rowId, currentByPath);
    });

    // Drop snapshots/timed activations for rows no longer present.
    for (const rowId of previousByRow.keys()) {
      if (!activeRowIds.has(rowId)) previousByRow.delete(rowId);
    }
    pruneTimedRuleState(activeRowIds);

    // Rearm coalesced expiry timer once per pass — cheaper than one
    // setTimeout per cell activation, regardless of mutationsPerTick.
    // Also force a `cellClassRules` re-evaluation: AG-Grid evaluates
    // class rules during the transaction, BEFORE firing modelUpdated,
    // so the predicates ran with the *old* (empty) timed state and
    // missed our just-written activations. Without this refresh the
    // timed style window appears to do nothing on live ticks.
    // Bounded firing: only fires when we actually wrote activations
    // this pass — at most once per modelUpdated (~3/sec at typical
    // tick rates), NOT once per cellValueChanged (~30/sec).
    if (activatedThisPass) {
      deps.armNextExpiry();
      deps.scheduleRefresh();
    }
  };

  const attachCellValueChangedListener = (): (() => void) => {
    const api = platform.api.api;
    if (!api) return () => {};
    let rowDiffCache = deps.diffCacheByApi.get(api as object);
    if (!rowDiffCache) {
      rowDiffCache = new WeakMap();
      deps.diffCacheByApi.set(api as object, rowDiffCache);
    }
    const safeRowDiffCache = rowDiffCache;
    const onCellValueChanged = (event: {
      node?: unknown;
      column?: { getColId?: () => string };
      api?: unknown;
      oldValue?: unknown;
      newValue?: unknown;
    }) => {
      onCellValueChangedHandler(event, api, safeRowDiffCache, platform, deps);
    };
    api.addEventListener('cellValueChanged', onCellValueChanged);
    return () => {
      api.removeEventListener('cellValueChanged', onCellValueChanged);
    };
  };

  const dispose = () => {
    previousByRow.clear();
  };

  return { processTimedActivations, attachCellValueChangedListener, dispose };
}

/**
 * cellValueChanged handler — extracted to a top-level function purely so
 * the closure remains thin (was 220 LOC inline in the original; now lives
 * here where the parameter list documents the surface).
 */
function onCellValueChangedHandler(
  event: {
    node?: unknown;
    column?: { getColId?: () => string };
    api?: unknown;
    oldValue?: unknown;
    newValue?: unknown;
  },
  api: GridApi,
  rowDiffCache: WeakMap<object, Map<string, { oldValue: unknown; newValue: unknown }>>,
  platform: PlatformHandle<ConditionalStylingState>,
  deps: TimedActivationsDeps,
): void {
  const node = event.node;
  // Called ON the column, not as a detached reference. AG's `getColId()` is
  // `return this.colId`, so `const f = column.getColId; f()` throws
  // "Cannot read properties of undefined (reading 'colId')" from inside AG —
  // an error with no mention of this file in the top frame, raised out of AG's
  // async event queue on EVERY committed cell edit. The `typeof` guard was
  // right and the call was not.
  if (!node || typeof node !== 'object' || typeof event.column?.getColId !== 'function') return;
  const colId = event.column.getColId();
  if (!colId) return;
  const now = Date.now();
  traceTimed('cellValueChanged', {
    rowId: resolveRowId(node),
    colId,
    oldValue: event.oldValue,
    newValue: event.newValue,
  });
  let rowDiffs = rowDiffCache.get(node as object);
  if (!rowDiffs) {
    rowDiffs = new Map();
    rowDiffCache.set(node as object, rowDiffs);
  }
  rowDiffs.set(colId, { oldValue: event.oldValue, newValue: event.newValue });

  const rowData = (node as { data?: Record<string, unknown> }).data ?? {};
  const state = platform.getState();
  const engine = platform.resources.expression();
  let activatedThisEvent = false;
  for (const rule of state.rules) {
    if (!rule.enabled) continue;
    const ttlMs = normalizeDuration(rule.activeDurationMs);
    if (ttlMs == null) continue;
    traceTimed('evaluating timed rule', {
      ruleId: rule.id,
      scope: rule.scope.type,
      ttlMs,
    });
    if (rule.scope.type === 'row') {
      let match = false;
      try {
        const columns = buildColumnsContextFromDiffs(
          rowData,
          rowDiffCache.get(node as object),
        );
        match = Boolean(
          engine.parseAndEvaluate(rule.expression, {
            x: null,
            value: null,
            data: rowData,
            columns,
          }),
        );
      } catch {
        match = false;
      }
      traceTimed('row rule match result', { ruleId: rule.id, match });
      if (!match) continue;
      const rowId = resolveRowId(node);
      if (!rowId) continue;
      upsertTimedRowActivation(rowId, rule.id, now + ttlMs);
      traceTimed('row rule activated', { rowId, ruleId: rule.id, until: now + ttlMs });
      activatedThisEvent = true;
      continue;
    }
    for (const scopedColId of rule.scope.columns) {
      // Dot-walk for nested fields so `x` / `value` bindings see
      // the right leaf when a colDef's `field` is e.g.
      // `'position.price'`. Top-level subscript access would
      // return `undefined` for any nested column.
      const value = getValueByPath(rowData, scopedColId);
      let match = false;
      try {
        const columns = buildColumnsContextFromDiffs(
          rowData,
          rowDiffCache.get(node as object),
        );
        match = Boolean(
          engine.parseAndEvaluate(rule.expression, {
            x: value,
            value,
            data: rowData,
            columns,
          }),
        );
      } catch {
        match = false;
      }
      traceTimed('cell rule match result', { ruleId: rule.id, scopedColId, match });
      if ((globalThis as { __CS_CROSS_COL_TRACE__?: boolean }).__CS_CROSS_COL_TRACE__) {
        // eslint-disable-next-line no-console
        console.debug('[cs:cross-col] timed-rule cellValueChanged eval', {
          changedColId: colId,
          ruleId: rule.id,
          expression: rule.expression,
          scopeColumns: rule.scope.columns,
          scopedColId,
          match,
          ttlMs,
        });
      }
      if (!match) continue;
      const rowId = resolveRowId(node);
      if (!rowId) continue;
      upsertTimedCellActivation(rowId, rule.id, scopedColId, now + ttlMs);
      traceTimed('cell rule activated', {
        rowId,
        ruleId: rule.id,
        scopedColId,
        until: now + ttlMs,
      });
      activatedThisEvent = true;
    }
  }

  // Only refresh when we wrote a timed activation this event —
  // AG-Grid already re-evaluated class rules during the
  // transaction, so an unconditional refresh on every
  // cellValueChanged is what caused the input-focus theft.
  // Activations have to be picked up though, so refresh in that
  // case only.
  if (activatedThisEvent) {
    deps.armNextExpiry();
    deps.scheduleRefresh();
  }

  // Trigger-driven cross-column repaint.
  //
  // When the changed column is a "trigger" (referenced by some
  // cell-scope rule's expression), AG-Grid's own re-evaluation
  // covers only THIS cell — but the rule's verdict applies to
  // the whole `scope.columns` surface. Without this targeted
  // refresh, a rule like `[price.old] < [price.new]` with scope
  // `['side','quantity']` would never repaint `side`/`quantity`
  // when `price` ticks, which is the bug the user reported as
  // "only the first column gets styled".
  //
  // Surface accumulated here goes through the existing
  // `scheduleTargetedRefresh` batcher so multiple changes in the
  // same tick coalesce into one `refreshCells` call.
  const rowIdForRefresh = resolveRowId(node);
  const crossColTrace = (
    globalThis as { __CS_CROSS_COL_TRACE__?: boolean }
  ).__CS_CROSS_COL_TRACE__;
  if (crossColTrace) {
    // eslint-disable-next-line no-console
    console.debug('[cs:cross-col] cellValueChanged', {
      colId,
      rowId: rowIdForRefresh,
      ruleCount: state.rules.length,
    });
  }
  if (rowIdForRefresh) {
    const colsToRefresh = new Set<string>();
    for (const rule of state.rules) {
      if (!rule.enabled) continue;
      if (rule.scope.type !== 'cell') continue;
      const triggers = deps.triggers.get(rule);
      if (crossColTrace) {
        // eslint-disable-next-line no-console
        console.debug('[cs:cross-col] rule check', {
          ruleId: rule.id,
          expression: rule.expression,
          scopeColumns: rule.scope.columns,
          triggersFound: triggers ? [...triggers] : null,
          triggersHasChangedCol: triggers ? triggers.has(colId) : false,
        });
      }
      if (!triggers || !triggers.has(colId)) continue;
      for (const c of rule.scope.columns) {
        // The changed column is already refreshed by AG-Grid; no
        // need to enqueue it. Skipping here keeps the targeted
        // surface minimal.
        if (c === colId) continue;
        colsToRefresh.add(c);
      }
    }
    if (colsToRefresh.size > 0) {
      if (crossColTrace) {
        // eslint-disable-next-line no-console
        console.debug('[cs:cross-col] scheduling refresh', {
          rowId: rowIdForRefresh,
          columns: [...colsToRefresh],
        });
      }
      deps.scheduleTargetedRefresh([rowIdForRefresh], colsToRefresh, false);
    } else if (crossColTrace) {
      // eslint-disable-next-line no-console
      console.debug('[cs:cross-col] no cols to refresh — either no matching rule or only the changed col was scoped');
    }
  }

  deps.evaluate();
}
