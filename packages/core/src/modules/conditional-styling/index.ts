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
import type { Module, PlatformHandle } from '../../platform/types';
import {
  INITIAL_CONDITIONAL_STYLING,
  type ConditionalRule,
  type ConditionalStylingState,
} from './state';
import {
  applyCellRulesToDefs,
  buildRowClassPredicate,
  reinjectAllRules,
} from './transforms';
import { ConditionalStylingPanel } from './ConditionalStylingPanel';

export const CONDITIONAL_STYLING_MODULE_ID = 'conditional-styling';

const CSS_HANDLE_KEY = CONDITIONAL_STYLING_MODULE_ID;

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

    /**
     * Re-evaluate which columns should currently paint the header-flash
     * pulse (and header indicator badge). Runs on every modelUpdated /
     * filterChanged / cellValueChanged, AND whenever the rule list itself
     * changes (a toggle that doesn't produce a data event still needs to
     * clear stale `.gc-flash-hdr-pulse` classes).
     */
    const evaluate = () => {
      const api = platform.api.api;
      if (!api || typeof document === 'undefined') return;
      const state = platform.getState();
      const engine = platform.resources.expression();

      const headerFlashRules = state.rules.filter(
        (r) => r.enabled && r.flash?.enabled && r.scope.type === 'cell' &&
          (r.flash.target === 'headers' || r.flash.target === 'cells+headers'),
      );
      const headerIndicatorRules = state.rules.filter((r) => {
        if (!r.enabled || r.scope.type !== 'cell' || !r.indicator?.icon) return false;
        const target = r.indicator.target ?? 'cells+headers';
        return target === 'headers' || target === 'cells+headers';
      });

      // Wipe previously-painted header state (both pulse + rule classes) —
      // this is how "disable a rule" + "change target" cleans up classes
      // that data events alone wouldn't touch.
      document.querySelectorAll('.ag-header-cell.gc-flash-hdr-pulse').forEach((el) => {
        el.classList.remove('gc-flash-hdr-pulse');
      });
      document.querySelectorAll('.ag-header-cell[class*=" gc-rule-"], .ag-header-cell[class^="gc-rule-"]').forEach((el) => {
        [...el.classList].forEach((c) => { if (c.startsWith('gc-rule-')) el.classList.remove(c); });
      });

      if (headerFlashRules.length === 0 && headerIndicatorRules.length === 0) return;

      // Match any row against a rule?
      const anyRowMatches = (rule: ConditionalRule): boolean => {
        let match = false;
        api.forEachNodeAfterFilter((node) => {
          if (match) return;
          const data = node.data ?? {};
          try {
            if (engine.parseAndEvaluate(rule.expression, { x: null, value: null, data, columns: data })) {
              match = true;
            }
          } catch { /* swallow per-row */ }
        });
        return match;
      };

      const pulseCols = new Set<string>();
      const indicatorCols = new Map<string, Set<string>>(); // ruleId → Set<colId>

      for (const rule of headerFlashRules) {
        if (rule.scope.type !== 'cell') continue;
        if (anyRowMatches(rule)) for (const colId of rule.scope.columns) pulseCols.add(colId);
      }
      for (const rule of headerIndicatorRules) {
        if (rule.scope.type !== 'cell') continue;
        if (anyRowMatches(rule)) indicatorCols.set(rule.id, new Set(rule.scope.columns));
      }

      // Paint. `:not(.ag-floating-filter)` keeps badges + pulse off the
      // floating-filter row (which shares `.ag-header-cell` + `col-id`
      // with the real header).
      const notFilter = ':not(.ag-floating-filter)';
      for (const colId of pulseCols) {
        document.querySelectorAll(`.ag-header-cell${notFilter}[col-id="${CSS.escape(colId)}"]`).forEach((el) => {
          el.classList.add('gc-flash-hdr-pulse');
        });
      }
      for (const [ruleId, cols] of indicatorCols) {
        for (const colId of cols) {
          document.querySelectorAll(`.ag-header-cell${notFilter}[col-id="${CSS.escape(colId)}"]`).forEach((el) => {
            el.classList.add(`gc-rule-${ruleId}`);
          });
        }
      }
    };

    // Fire evaluate on every relevant data-side event — and once immediately
    // so profile loads paint without waiting for a first event.
    disposers.push(platform.api.onReady(() => evaluate()));
    disposers.push(platform.api.on('modelUpdated', evaluate));
    disposers.push(platform.api.on('filterChanged', evaluate));
    disposers.push(platform.api.on('cellValueChanged', evaluate));
    // Rule-list changes: state subscription.
    disposers.push(platform.subscribe(() => evaluate()));

    return () => {
      for (const d of disposers) { try { d(); } catch { /* swallow */ } }
      if (typeof document !== 'undefined') {
        document.querySelectorAll('.ag-header-cell.gc-flash-hdr-pulse').forEach((el) => {
          el.classList.remove('gc-flash-hdr-pulse');
        });
      }
    };
  },

  transformColumnDefs(defs, state, ctx) {
    const css = ctx.resources.css(CSS_HANDLE_KEY);
    reinjectAllRules(css, state.rules);

    const cellRules = state.rules
      .filter((r) => r.enabled && r.scope.type === 'cell')
      .sort((a, b) => a.priority - b.priority);
    if (cellRules.length === 0) return defs;
    return applyCellRulesToDefs(defs, cellRules, ctx.resources.expression());
  },

  transformGridOptions(opts, state, ctx) {
    const rowRules = state.rules
      .filter((r) => r.enabled && r.scope.type === 'row')
      .sort((a, b) => a.priority - b.priority);
    const engine = ctx.resources.expression();
    // Always emit rowClassRules so the host's setGridOption sync clears
    // stale predicates when a rule's scope flips row→cell.
    const rowClassRules: NonNullable<typeof opts.rowClassRules> = {
      ...((opts.rowClassRules as Record<string, unknown>) ?? {}),
    } as NonNullable<typeof opts.rowClassRules>;
    for (const rule of rowRules) {
      (rowClassRules as Record<string, unknown>)[`gc-rule-${rule.id}`] = buildRowClassPredicate(engine, rule);
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
          const { enabled, target, flashDuration, fadeDuration } = r.flash;
          const scope = r.scope?.type ?? 'cell';
          const allowed: Record<string, true> = scope === 'row'
            ? { row: true }
            : { cells: true, headers: true, 'cells+headers': true };
          const normalizedTarget = allowed[target as string] ? target : scope === 'row' ? 'row' : 'cells';
          next = {
            ...next,
            flash: {
              enabled: Boolean(enabled),
              target: normalizedTarget,
              ...(typeof flashDuration === 'number' ? { flashDuration } : {}),
              ...(typeof fadeDuration === 'number' ? { fadeDuration } : {}),
            },
          };
        }
        if (r.indicator && typeof r.indicator === 'object') {
          const { icon, color, target, position } = r.indicator;
          if (typeof icon === 'string' && icon.length > 0) {
            const normalizedTarget: 'cells' | 'headers' | 'cells+headers' =
              target === 'cells' || target === 'headers' || target === 'cells+headers' ? target : 'cells+headers';
            const normalizedPosition: 'top-left' | 'top-right' =
              position === 'top-left' ? 'top-left' : 'top-right';
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
        return next;
      }),
    };
  },

  SettingsPanel: ConditionalStylingPanel,
};

export type {
  ConditionalRule,
  ConditionalStylingState,
  FlashConfig,
  FlashTarget,
  IndicatorPosition,
  IndicatorTarget,
  RuleIndicator,
  RuleScope,
} from './state';
export { INDICATOR_ICONS, findIndicatorIcon } from './indicatorIcons';
export type { IndicatorIconDef } from './indicatorIcons';
export { INITIAL_CONDITIONAL_STYLING } from './state';
export { toStyleEditorValue, fromStyleEditorValue } from './styleBridge';
