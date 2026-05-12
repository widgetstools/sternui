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
import type { Module, PlatformHandle } from '@starui/core';
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
  CONDITIONAL_DIFF_CACHE_KEY,
  type DiffCacheByApi,
  getNextTimedExpiry,
  pruneTimedRuleState,
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
        evaluate();
        scheduleRefresh();
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

      const rowDiffCache = diffCacheByApi.get(api as object);
      api.forEachNode((node) => {
        const rowId = resolveRowId(node);
        if (!rowId) return;
        activeRowIds.add(rowId);
        const data = (node as { data?: Record<string, unknown> }).data ?? {};
        const prev = previousByRow.get(rowId) ?? new Map<string, unknown>();
        const changedKeys: string[] = [];
        for (const [k, v] of Object.entries(data)) {
          if (!Object.is(prev.get(k), v)) changedKeys.push(k);
        }
        if (changedKeys.length === 0) return;

        // Keep diff context in sync for expressions that use .old/.new refs.
        if (rowDiffCache && typeof node === 'object' && node) {
          let rowDiffs = rowDiffCache.get(node as object);
          if (!rowDiffs) {
            rowDiffs = new Map();
            rowDiffCache.set(node as object, rowDiffs);
          }
          for (const key of changedKeys) {
            rowDiffs.set(key, { oldValue: prev.get(key), newValue: data[key] });
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

          for (const colId of rule.scope.columns) {
            if (!changedKeys.includes(colId)) continue;
            const value = data[colId];
            let match = false;
            try {
              match = Boolean(
                engine.parseAndEvaluate(rule.expression, {
                  x: value,
                  value,
                  data,
                  columns,
                }),
              );
            } catch {
              match = false;
            }
            if (!match) continue;
            upsertTimedCellActivation(rowId, rule.id, colId, now + ttlMs);
            activatedThisPass = true;
            traceTimed('cell rule activated (model diff)', { rowId, ruleId: rule.id, colId, until: now + ttlMs });
          }
        }

        const nextPrev = new Map<string, unknown>();
        for (const [k, v] of Object.entries(data)) nextPrev.set(k, v);
        previousByRow.set(rowId, nextPrev);
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
            const value = rowData[scopedColId];
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
        evaluate();
      };
      api.addEventListener('cellValueChanged', onCellValueChanged);
      disposers.push(() => {
        api.removeEventListener('cellValueChanged', onCellValueChanged);
      });
    }));
    // Rule-list changes: state subscription.
    disposers.push(platform.subscribe(() => {
      evaluate();
      scheduleRefresh();
    }));

    return () => {
      if (refreshRaf != null && typeof window !== 'undefined') {
        window.cancelAnimationFrame(refreshRaf);
      }
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

function traceTimed(message: string, payload?: unknown): void {
  try {
    const flag = (globalThis as { __CS_TIMED_TRACE__?: boolean }).__CS_TIMED_TRACE__;
    if (flag === false) return;
    if (payload === undefined) {
      console.log(TRACE_PREFIX, message);
      return;
    }
    console.log(TRACE_PREFIX, message, payload);
  } catch {
    // no-op
  }
}
