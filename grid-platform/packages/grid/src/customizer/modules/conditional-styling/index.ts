/**
 * Conditional Styling — expression-driven rules that paint cells or rows.
 *
 * Priority 20 (after column-customization=10). Carries into AG-Grid via
 * `ColDef.cellClassRules` (cell-scope) + `GridOptions.rowClassRules`
 * (row-scope); all styling delivered via injected CSS classes so dark/light
 * theming is a CSS event, not a JS recompute.
 *
 * Header flash + header indicator badges can't ride cellClassRules
 * (AG-Grid has no `headerClassRules`), so the module opens a thin DOM
 * watcher in `activate()` that toggles per-column classes whenever the
 * underlying rule state changes match.
 */
import type { Module, PlatformHandle } from '@stargrid/engine';
import { getValueByPath } from '@stargrid/types';
import {
  INITIAL_CONDITIONAL_STYLING,
  type ConditionalRule,
  type ConditionalStylingState,
  type FlashColor,
  type FlashConfig,
  type FlashMode,
} from './state';

const FLASH_COLOR_NAMES: readonly FlashColor[] = [
  'amber',
  'emerald',
  'rose',
  'sky',
  'violet',
  'teal',
  'orange',
  'slate',
] as const;
import {
  applyCellRulesToDefs,
  buildRowClassPredicate,
  clearTimedRuleState,
  collectAndPruneExpiredTimedEntries,
  CONDITIONAL_DIFF_CACHE_KEY,
  type DiffCacheByApi,
  extractTriggerColumns,
  getNextTimedExpiry,
  pruneTimedRuleState,
  pruneTimedRuleStateByRuleSet,
  upsertTimedCellActivation,
  upsertTimedRowActivation,
  reinjectAllRules,
} from './transforms';
import { cssEscapeColId } from '../column-customization/transforms';
import {
  ConditionalStylingEditor,
  ConditionalStylingList,
  ConditionalStylingPanel,
} from './ConditionalStylingPanel';

export const CONDITIONAL_STYLING_MODULE_ID = 'conditional-styling';

const CSS_HANDLE_KEY = CONDITIONAL_STYLING_MODULE_ID;
const TRACE_PREFIX = '[conditional-styling:timed]';

export const conditionalStylingModule: Module<ConditionalStylingState> = {
  id: CONDITIONAL_STYLING_MODULE_ID,
  name: 'Style Rules',
  code: '01',
  schemaVersion: 1,
  priority: 20,

  getInitialState: () => ({ ...INITIAL_CONDITIONAL_STYLING, rules: [] }),

  /**
   * Mounts the header-flash DOM watcher. All other side effects (CSS
   * injection) happen inside the transformers and are cleaned up by
   * ResourceScope.dispose when the grid destroys.
   */
  activate(platform: PlatformHandle<ConditionalStylingState>): () => void {
    const disposers: Array<() => void> = [];
    let refreshRaf: number | null = null;
    const diffCacheByApi = platform.resources.cache<object, WeakMap<object, Map<string, { oldValue: unknown; newValue: unknown }>>>(
      CONDITIONAL_DIFF_CACHE_KEY,
    );
    // Coalesced expiry scheduler: ONE timer points at the next-to-expire
    // activation across the whole grid. Each new upsert just rearms this
    // timer if the new expiry is earlier than the currently scheduled fire
    // time. This keeps timer churn O(1) under high tick rates and avoids
    // the GC pressure of one setTimeout per cell activation.
    let expiryTimer: ReturnType<typeof setTimeout> | null = null;
    let expiryTimerFiresAt: number | null = null;
    const previousByRow = new Map<string, Map<string, unknown>>();
    clearTimedRuleState();

    // Per-rule trigger columns: every column its expression depends on.
    // The contract is that the expression is a row-level predicate and
    // `scope.columns` is the paint surface — when ANY trigger column
    // ticks, every cell in `scope.columns` for that row must re-evaluate
    // its `cellClassRules` predicate so the rule's verdict propagates
    // uniformly across the scope. AG-Grid's default behaviour only
    // re-evaluates the cell whose own value changed, which is what
    // produced the "only the first column gets styled" symptom for
    // diff-driven rules like `[price.old] < [price.new]`.
    //
    // Keyed by `rule.id + ':' + rule.expression` so a no-op rule edit
    // (renaming, toggling colour) doesn't churn the parse cache.
    const triggersByRule = new Map<string, ReadonlySet<string>>();
    const triggersCacheKey = (rule: { id: string; expression: string }) =>
      `${rule.id}::${rule.expression}`;
    const rebuildTriggersCache = (rules: readonly ConditionalRule[]): void => {
      const seenKeys = new Set<string>();
      const engine = platform.resources.expression();
      for (const r of rules) {
        const key = triggersCacheKey(r);
        seenKeys.add(key);
        if (triggersByRule.has(key)) continue;
        try {
          const ast = engine.parse(r.expression) as Parameters<typeof extractTriggerColumns>[0];
          triggersByRule.set(key, extractTriggerColumns(ast));
        } catch {
          // Unparseable expression — no triggers known. Predicate will
          // already short-circuit via its own try/catch.
          triggersByRule.set(key, new Set<string>());
        }
      }
      // Evict cache entries for rules that no longer exist OR whose
      // expression changed (the key changes, so the old entry is now
      // unreferenced).
      for (const key of [...triggersByRule.keys()]) {
        if (!seenKeys.has(key)) triggersByRule.delete(key);
      }
    };

    /**
     * Force `cellClassRules` / `rowClassRules` to re-evaluate. NEVER call
     * `redrawRows()` or `refreshHeader()` here — they rebuild DOM and
     * steal focus from active cell editors / floating-filter inputs,
     * which makes the grid feel unusable under live ticks. The headers
     * are painted by the DOM watcher in `evaluate()` directly, so
     * `refreshHeader()` would just trigger one more round of churn for
     * no benefit.
     */
    const refreshGridVisuals = () => {
      const api = platform.api.api;
      if (!api) return;
      try { api.refreshCells({ force: true }); } catch { /* grid mid-teardown */ }
    };

    const scheduleRefresh = () => {
      if (typeof window === 'undefined') {
        refreshGridVisuals();
        return;
      }
      if (refreshRaf != null) window.cancelAnimationFrame(refreshRaf);
      refreshRaf = window.requestAnimationFrame(() => {
        refreshRaf = null;
        refreshGridVisuals();
      });
    };

    // Targeted-refresh batcher. Multiple expiry / activation events
    // within a frame accumulate into the pending set; the rAF flush
    // calls `api.refreshCells({ rowNodes, columns, force: true })`
    // once with the merged surface. Avoids re-painting every visible
    // cell when only a handful of rows / cols actually changed state.
    const pendingTargetedRowIds = new Set<string>();
    const pendingTargetedColIds = new Set<string>();
    let pendingTargetedFullRow = false;
    let targetedRefreshRaf: number | null = null;
    const flushTargetedRefresh = () => {
      targetedRefreshRaf = null;
      const api = platform.api.api;
      if (!api) {
        pendingTargetedRowIds.clear();
        pendingTargetedColIds.clear();
        pendingTargetedFullRow = false;
        return;
      }
      const rowIds = [...pendingTargetedRowIds];
      const colIds = [...pendingTargetedColIds];
      const fullRow = pendingTargetedFullRow;
      pendingTargetedRowIds.clear();
      pendingTargetedColIds.clear();
      pendingTargetedFullRow = false;
      if (rowIds.length === 0 && colIds.length === 0 && !fullRow) return;
      try {
        const rowNodes = rowIds
          .map((id) => api.getRowNode?.(id))
          .filter((n): n is NonNullable<typeof n> => !!n);
        if (rowNodes.length === 0) return;
        const params: Record<string, unknown> = { rowNodes, force: true };
        // When at least one entry was row-scope, refresh ALL columns for
        // those rows — the row's class membership flipped, every cell
        // needs to re-evaluate. Cell-scope-only entries restrict to
        // their explicit column set.
        if (!fullRow && colIds.length > 0) params.columns = colIds;
        api.refreshCells(params as never);
      } catch {
        /* grid mid-teardown */
      }
    };
    const scheduleTargetedRefresh = (
      rowIds: Iterable<string>,
      colIds: Iterable<string>,
      includesRowScope: boolean,
    ) => {
      let added = false;
      for (const id of rowIds) {
        if (!pendingTargetedRowIds.has(id)) {
          pendingTargetedRowIds.add(id);
          added = true;
        }
      }
      for (const id of colIds) {
        if (!pendingTargetedColIds.has(id)) {
          pendingTargetedColIds.add(id);
          added = true;
        }
      }
      if (includesRowScope) {
        pendingTargetedFullRow = true;
        added = true;
      }
      if (!added) return;
      if (typeof window === 'undefined') {
        flushTargetedRefresh();
        return;
      }
      if (targetedRefreshRaf != null) return; // already scheduled
      targetedRefreshRaf = window.requestAnimationFrame(flushTargetedRefresh);
    };
    /**
     * Rearm the single coalesced expiry timer. Called after every batch of
     * activations (and after each expiry fires) so the timer always points
     * at the *current* earliest pending expiry. If nothing is pending the
     * timer is left disarmed.
     */
    const armNextExpiry = () => {
      const nextAt = getNextTimedExpiry();
      if (nextAt == null) {
        if (expiryTimer != null) {
          clearTimeout(expiryTimer);
          expiryTimer = null;
          expiryTimerFiresAt = null;
          traceTimed('armNextExpiry:disarmed');
        }
        return;
      }
      // If the existing timer already fires at-or-before the new earliest,
      // leave it alone — re-arming would just churn the timer pool.
      if (
        expiryTimer != null &&
        expiryTimerFiresAt != null &&
        expiryTimerFiresAt <= nextAt
      ) {
        return;
      }
      if (expiryTimer != null) clearTimeout(expiryTimer);
      const delay = Math.max(0, nextAt - Date.now()) + 8;
      expiryTimerFiresAt = nextAt;
      traceTimed('armNextExpiry', { delay, firesAt: nextAt });
      expiryTimer = setTimeout(() => {
        expiryTimer = null;
        expiryTimerFiresAt = null;
        traceTimed('expiry refresh fired');
        // Collect the exact (rowId, colIds) pairs that just expired,
        // prune them in one pass, then target-refresh just those rows
        // / columns instead of force-refreshing the entire grid.
        const expired = collectAndPruneExpiredTimedEntries();
        const rowIds = new Set<string>();
        const colIds = new Set<string>();
        for (const e of expired.rowScope) rowIds.add(e.rowId);
        for (const e of expired.cellScope) {
          rowIds.add(e.rowId);
          for (const c of e.colIds) colIds.add(c);
        }
        const includesRowScope = expired.rowScope.length > 0;
        // Header flash / indicator badge classes are managed via the
        // DOM watcher inside `evaluate()`; we still need to call it so
        // the header treatments flip with the cells.
        evaluate();
        if (rowIds.size > 0 || includesRowScope) {
          scheduleTargetedRefresh(rowIds, colIds, includesRowScope);
        }
        // Chain to the next pending expiry (if any) so a long ticking
        // window keeps cascading without piling up timers.
        armNextExpiry();
      }, delay);
    };

    const processTimedActivations = () => {
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
      for (const [, triggers] of triggersByRule) {
        for (const t of triggers) knownPaths.add(t);
      }

      const rowDiffCache = diffCacheByApi.get(api as object);
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
          const triggers = triggersByRule.get(triggersCacheKey(rule));
          const hasRelevantChange =
            !triggers || triggers.size === 0 ||
            changedKeys.some((k) => triggers.has(k));
          if (!hasRelevantChange) continue;
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
          for (const colId of rule.scope.columns) {
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
        armNextExpiry();
        scheduleRefresh();
      }
    };

    /**
     * Differential header repaint.
     *
     * Earlier shipped a full wipe + repaint on every call, which under
     * live ticks (cellValueChanged at ~30 events/sec) caused
     * `ds-flash-hdr-*` classes to be removed and re-added every tick,
     * RESTARTING the CSS animation every frame — visible to users as
     * header icons "always flashing". We now diff against the
     * last-painted state and mutate only the delta. When the matching
     * column set doesn't change tick-to-tick (the common case), this
     * function does ZERO DOM mutation.
     */
    const lastFlashColsByRule = new Map<string, Set<string>>();
    const lastIndicatorColsByRule = new Map<string, Set<string>>();
    const evaluate = () => {
      const api = platform.api.api;
      if (!api || typeof document === 'undefined') return;
      const rowDiffCache = diffCacheByApi.get(api as object);
      const state = platform.getState();
      const engine = platform.resources.expression();
      const notFilter = ':not(.ag-floating-filter)';

      const headerFlashRules = state.rules.filter(
        (r) => r.enabled && r.flash?.enabled && r.scope.type === 'cell' &&
          (r.flash.target === 'headers' || r.flash.target === 'cells+headers'),
      );
      const headerIndicatorRules = state.rules.filter((r) => {
        if (!r.enabled || r.scope.type !== 'cell' || !r.indicator?.icon) return false;
        const target = r.indicator.target ?? 'cells+headers';
        return target === 'headers' || target === 'cells+headers';
      });

      const anyRowMatches = (rule: ConditionalRule): boolean => {
        let match = false;
        api.forEachNodeAfterFilter((node) => {
          if (match) return;
          const data = node.data ?? {};
          const columns = buildColumnsContextFromDiffs(
            data,
            rowDiffCache?.get(node as object),
          );
          try {
            if (engine.parseAndEvaluate(rule.expression, { x: null, value: null, data, columns })) {
              match = true;
            }
          } catch { /* swallow per-row */ }
        });
        return match;
      };

      // Compute the *next* per-rule column sets that should be painted.
      const nextFlashColsByRule = new Map<string, Set<string>>();
      const nextIndicatorColsByRule = new Map<string, Set<string>>();
      for (const rule of headerFlashRules) {
        if (rule.scope.type !== 'cell') continue;
        if (anyRowMatches(rule)) nextFlashColsByRule.set(rule.id, new Set(rule.scope.columns));
      }
      for (const rule of headerIndicatorRules) {
        if (rule.scope.type !== 'cell') continue;
        if (anyRowMatches(rule)) nextIndicatorColsByRule.set(rule.id, new Set(rule.scope.columns));
      }

      // Diff helper: for one rule's column set, remove the class from
      // columns that left the set, add it to columns that entered. No-op
      // when the sets are identical.
      const applyDelta = (
        last: Map<string, Set<string>>,
        next: Map<string, Set<string>>,
        classFor: (ruleId: string) => string,
      ) => {
        const allRuleIds = new Set<string>([...last.keys(), ...next.keys()]);
        for (const ruleId of allRuleIds) {
          const lastCols = last.get(ruleId) ?? new Set<string>();
          const nextCols = next.get(ruleId) ?? new Set<string>();
          const cls = classFor(ruleId);
          for (const colId of lastCols) {
            if (nextCols.has(colId)) continue;
            document.querySelectorAll(`.ag-header-cell${notFilter}[col-id="${CSS.escape(colId)}"]`).forEach((el) => {
              el.classList.remove(cls);
            });
          }
          for (const colId of nextCols) {
            if (lastCols.has(colId)) continue;
            document.querySelectorAll(`.ag-header-cell${notFilter}[col-id="${CSS.escape(colId)}"]`).forEach((el) => {
              el.classList.add(cls);
            });
          }
          if (nextCols.size === 0) last.delete(ruleId);
          else last.set(ruleId, nextCols);
        }
      };

      applyDelta(
        lastFlashColsByRule,
        nextFlashColsByRule,
        (ruleId) => `ds-flash-hdr-${cssEscapeColId(ruleId)}`,
      );
      applyDelta(
        lastIndicatorColsByRule,
        nextIndicatorColsByRule,
        (ruleId) => `ds-rule-${cssEscapeColId(ruleId)}`,
      );
    };

    // Fire evaluate on every relevant data-side event — and once immediately
    // so profile loads paint without waiting for a first event.
    disposers.push(platform.api.onReady(() => {
      processTimedActivations();
      evaluate();
      scheduleRefresh();
    }));
    disposers.push(platform.api.on('modelUpdated', () => {
      processTimedActivations();
      evaluate();
    }));
    disposers.push(platform.api.on('filterChanged', evaluate));
    // NOTE: cellValueChanged is handled by the dedicated listener
    // below (which already runs `evaluate()`) — don't double-register
    // and double-evaluate on every tick.
    disposers.push(platform.api.onReady((api) => {
      let rowDiffCache = diffCacheByApi.get(api as object);
      if (!rowDiffCache) {
        rowDiffCache = new WeakMap();
        diffCacheByApi.set(api as object, rowDiffCache);
      }
      const onCellValueChanged = (event: {
        node?: unknown;
        column?: { getColId?: () => string };
        api?: unknown;
        oldValue?: unknown;
        newValue?: unknown;
      }) => {
        const node = event.node;
        const getColId = event.column?.getColId;
        if (!node || typeof node !== 'object' || typeof getColId !== 'function') return;
        const colId = getColId();
        if (!colId) return;
        const now = Date.now();
        traceTimed('cellValueChanged', {
          rowId: resolveRowId(node),
          colId,
          oldValue: event.oldValue,
          newValue: event.newValue,
        });
        let rowDiffs = rowDiffCache!.get(node as object);
        if (!rowDiffs) {
          rowDiffs = new Map();
          rowDiffCache!.set(node as object, rowDiffs);
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
                rowDiffCache!.get(node as object),
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
            upsertTimedRowActivation(
              rowId,
              rule.id,
              now + ttlMs,
            );
            traceTimed('row rule activated', {
              rowId,
              ruleId: rule.id,
              until: now + ttlMs,
            });
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
                rowDiffCache!.get(node as object),
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
            traceTimed('cell rule match result', {
              ruleId: rule.id,
              scopedColId,
              match,
            });
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
            upsertTimedCellActivation(
              rowId,
              rule.id,
              scopedColId,
              now + ttlMs,
            );
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
          armNextExpiry();
          scheduleRefresh();
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
            triggerCacheSize: triggersByRule.size,
          });
        }
        if (rowIdForRefresh) {
          const colsToRefresh = new Set<string>();
          for (const rule of state.rules) {
            if (!rule.enabled) continue;
            if (rule.scope.type !== 'cell') continue;
            const cacheKey = triggersCacheKey(rule);
            const triggers = triggersByRule.get(cacheKey);
            if (crossColTrace) {
              // eslint-disable-next-line no-console
              console.debug('[cs:cross-col] rule check', {
                ruleId: rule.id,
                expression: rule.expression,
                scopeColumns: rule.scope.columns,
                cacheKey,
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
            scheduleTargetedRefresh([rowIdForRefresh], colsToRefresh, false);
          } else if (crossColTrace) {
            // eslint-disable-next-line no-console
            console.debug('[cs:cross-col] no cols to refresh — either no matching rule or only the changed col was scoped');
          }
        }

        evaluate();
      };
      api.addEventListener('cellValueChanged', onCellValueChanged);
      disposers.push(() => {
        api.removeEventListener('cellValueChanged', onCellValueChanged);
      });
    }));
    // Rule-list changes: state subscription. Reconcile the timed-rule
    // state with the new rule set first — without this, a profile
    // switch that drops the previous profile's timed rules leaves
    // stale `rowUntil` / `cellsUntil` entries in the module-scoped map.
    // `getNextTimedExpiry()` keeps returning a non-null timestamp,
    // the coalesced timer fires, re-arms with delay 8ms, and loops
    // forever — visible as repeated `armNextExpiry / expiry refresh
    // fired` traces with the same `firesAt` value.
    disposers.push(platform.subscribe(() => {
      const state = platform.getState();
      const activeTimedRuleIds = new Set<string>();
      for (const r of state.rules) {
        if (r.enabled && normalizeDuration(r.activeDurationMs) != null) {
          activeTimedRuleIds.add(r.id);
        }
      }
      pruneTimedRuleStateByRuleSet(activeTimedRuleIds);
      rebuildTriggersCache(state.rules);
      armNextExpiry();
      evaluate();
      scheduleRefresh();
    }));
    // Seed the triggers cache with whatever rules already exist when
    // we activate — `platform.subscribe` fires on changes only, not on
    // mount, so the initial set would otherwise stay invisible until
    // the user edits a rule.
    rebuildTriggersCache(platform.getState().rules);

    return () => {
      if (refreshRaf != null && typeof window !== 'undefined') {
        window.cancelAnimationFrame(refreshRaf);
      }
      if (targetedRefreshRaf != null && typeof window !== 'undefined') {
        window.cancelAnimationFrame(targetedRefreshRaf);
        targetedRefreshRaf = null;
      }
      pendingTargetedRowIds.clear();
      pendingTargetedColIds.clear();
      pendingTargetedFullRow = false;
      if (expiryTimer != null) {
        clearTimeout(expiryTimer);
        expiryTimer = null;
        expiryTimerFiresAt = null;
      }
      previousByRow.clear();
      clearTimedRuleState();
      for (const d of disposers) { try { d(); } catch { /* swallow */ } }
      if (typeof document !== 'undefined') {
        document.querySelectorAll('.ag-header-cell[class*="ds-flash-hdr-"]').forEach((el) => {
          [...el.classList].forEach((c) => { if (c.startsWith('ds-flash-hdr-')) el.classList.remove(c); });
        });
      }
    };
  },

  transformColumnDefs(defs, state, ctx) {
    const css = ctx.resources.css(CSS_HANDLE_KEY);
    reinjectAllRules(css, state.rules);
    const diffCacheByApi = ctx.resources.cache<object, WeakMap<object, Map<string, { oldValue: unknown; newValue: unknown }>>>(
      CONDITIONAL_DIFF_CACHE_KEY,
    ) as DiffCacheByApi;

    const cellRules = state.rules
      .filter((r) => r.enabled && r.scope.type === 'cell')
      .sort((a, b) => a.priority - b.priority);
    if (cellRules.length === 0) return defs;
    return applyCellRulesToDefs(
      defs,
      cellRules,
      ctx.resources.expression(),
      diffCacheByApi,
      undefined,
    );
  },

  transformGridOptions(opts, state, ctx) {
    const rowRules = state.rules
      .filter((r) => r.enabled && r.scope.type === 'row')
      .sort((a, b) => a.priority - b.priority);
    const engine = ctx.resources.expression();
    const diffCacheByApi = ctx.resources.cache<object, WeakMap<object, Map<string, { oldValue: unknown; newValue: unknown }>>>(
      CONDITIONAL_DIFF_CACHE_KEY,
    ) as DiffCacheByApi;
    // Always emit rowClassRules so the host's setGridOption sync clears
    // stale predicates when a rule's scope flips row→cell.
    const rowClassRules: NonNullable<typeof opts.rowClassRules> = {
      ...((opts.rowClassRules as Record<string, unknown>) ?? {}),
    } as NonNullable<typeof opts.rowClassRules>;
    for (const rule of rowRules) {
      // KEY must match the encoded selector emitted by buildCssText —
      // see cssEscapeColId in column-customization for the rationale.
      (rowClassRules as Record<string, unknown>)[`ds-rule-${cssEscapeColId(rule.id)}`] =
        buildRowClassPredicate(
          engine,
          rule,
          diffCacheByApi,
          undefined,
        );
    }
    return { ...opts, rowClassRules };
  },

  serialize: (state) => state,

  deserialize: (raw) => {
    if (!raw || typeof raw !== 'object') return { rules: [] };
    const d = raw as Partial<ConditionalStylingState>;
    const rules = Array.isArray(d.rules) ? d.rules : [];
    // Defensive normalisation — legacy / malformed payloads get coerced so
    // the runtime never sees a partial structure.
    return {
      rules: rules.map((r) => {
        let next = r;
        if (r.flash) {
          const flashRaw = r.flash as Partial<FlashConfig> & {
            flashDuration?: unknown;
            fadeDuration?: unknown;
          };
          const { enabled, target, mode, color, durationMs } = flashRaw;
          const scope = r.scope?.type ?? 'cell';
          const allowed: Record<string, true> = scope === 'row'
            ? { row: true }
            : { cells: true, headers: true, 'cells+headers': true };
          const normalizedTarget = allowed[target as string] ? target : scope === 'row' ? 'row' : 'cells';
          // Legacy migration: pre-mode payloads carried `flashDuration` +
          // `fadeDuration` (AG-Grid's native two-knob shape, which we never
          // actually applied). Sum them into a single `durationMs` so old
          // profiles keep a roughly-equivalent visible window.
          let migratedDurationMs: number | undefined;
          if (typeof durationMs === 'number' && durationMs > 0) {
            migratedDurationMs = Math.round(durationMs);
          } else {
            const fd = typeof flashRaw.flashDuration === 'number' ? flashRaw.flashDuration : 0;
            const fade = typeof flashRaw.fadeDuration === 'number' ? flashRaw.fadeDuration : 0;
            const sum = fd + fade;
            if (sum > 0) migratedDurationMs = Math.round(sum);
          }
          const normalizedMode: FlashMode = mode === 'pulse' ? 'pulse' : 'oneShot';
          const normalizedColor: FlashColor = FLASH_COLOR_NAMES.includes(color as FlashColor)
            ? (color as FlashColor)
            : 'amber';
          next = {
            ...next,
            flash: {
              enabled: Boolean(enabled),
              target: normalizedTarget as FlashConfig['target'],
              mode: normalizedMode,
              color: normalizedColor,
              ...(typeof migratedDurationMs === 'number' ? { durationMs: migratedDurationMs } : {}),
            },
          };
        }
        if (r.indicator && typeof r.indicator === 'object') {
          const { icon, color, target, position } = r.indicator;
          if (typeof icon === 'string' && icon.length > 0) {
            const normalizedTarget: 'cells' | 'headers' | 'cells+headers' =
              target === 'cells' || target === 'headers' || target === 'cells+headers' ? target : 'cells+headers';
            const normalizedPosition:
              | 'top-left'
              | 'top-right'
              | 'bottom-left'
              | 'bottom-right'
              | 'left-middle'
              | 'right-middle' =
              position === 'top-left' ||
              position === 'top-right' ||
              position === 'bottom-left' ||
              position === 'bottom-right' ||
              position === 'left-middle' ||
              position === 'right-middle'
                ? position
                : 'top-right';
            next = {
              ...next,
              indicator: {
                icon,
                target: normalizedTarget,
                position: normalizedPosition,
                ...(typeof color === 'string' && color.length > 0 ? { color } : {}),
              },
            };
          } else {
            const { indicator: _drop, ...rest } = next;
            void _drop;
            next = rest;
          }
        }
        if (r.valueFormatter && typeof r.valueFormatter === 'object') {
          const v = r.valueFormatter as { kind?: string };
          const ok = v.kind === 'preset' || v.kind === 'excelFormat' || v.kind === 'expression' || v.kind === 'tick';
          if (!ok) {
            const { valueFormatter: _drop, ...rest } = next;
            void _drop;
            next = rest;
          }
        }
        if (typeof r.activeDurationMs === 'number') {
          const normalized = normalizeDuration(r.activeDurationMs);
          if (normalized != null) next = { ...next, activeDurationMs: normalized };
          else {
            const { activeDurationMs: _drop, ...rest } = next;
            void _drop;
            next = rest;
          }
        }
        return next;
      }),
    };
  },

  // v4: native master-detail slots — the settings sheet renders these
  // directly instead of the flat `SettingsPanel` fallback.
  ListPane: ConditionalStylingList,
  EditorPane: ConditionalStylingEditor,
  SettingsPanel: ConditionalStylingPanel,
};

export type {
  ConditionalRule,
  ConditionalStylingState,
  FlashColor,
  FlashConfig,
  FlashMode,
  FlashTarget,
  IndicatorPosition,
  IndicatorTarget,
  RuleIndicator,
  RuleScope,
} from './state';
export { FLASH_PALETTE } from './transforms';
export { INDICATOR_ICONS, findIndicatorIcon } from './indicatorIcons';
export type { IndicatorIconDef } from './indicatorIcons';
export { INITIAL_CONDITIONAL_STYLING } from './state';
export { toStyleEditorValue, fromStyleEditorValue } from './styleBridge';

function buildColumnsContextFromDiffs(
  data: Record<string, unknown>,
  rowDiffs: Map<string, { oldValue: unknown; newValue: unknown }> | undefined,
): Record<string, unknown> {
  const out = Object.create(data) as Record<string, unknown>;
  if (!rowDiffs || rowDiffs.size === 0) return out;
  for (const [colId, diff] of rowDiffs) {
    out[`${colId}.old`] = diff.oldValue;
    out[`${colId}.new`] = diff.newValue;
  }
  return out;
}

function normalizeDuration(value: number | undefined): number | null {
  if (!Number.isFinite(value)) return null;
  const rounded = Math.round(value as number);
  return rounded > 0 ? rounded : null;
}


function resolveRowId(node: unknown): string | null {
  if (!node || typeof node !== 'object') return null;
  const candidate = (node as { id?: unknown }).id;
  return typeof candidate === 'string' && candidate.length > 0
    ? candidate
    : null;
}

/**
 * Trace helper for the timed-rule subsystem.
 *
 * Off by default — `setTimeout` + `cellValueChanged` paths fire dozens
 * to hundreds of trace points per second under live ticks. Opt in
 * explicitly per session by setting
 * `window.__CS_TIMED_TRACE__ = true` in the DevTools console.
 */
function traceTimed(message: string, payload?: unknown): void {
  try {
    const flag = (globalThis as { __CS_TIMED_TRACE__?: boolean }).__CS_TIMED_TRACE__;
    if (flag !== true) return;
    if (payload === undefined) {
      console.log(TRACE_PREFIX, message);
      return;
    }
    console.log(TRACE_PREFIX, message, payload);
  } catch {
    // no-op
  }
}
