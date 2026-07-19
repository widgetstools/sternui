/**
 * Header flash + indicator class painter.
 *
 * AG-Grid carries cell-scope rules via `cellClassRules`, but headers have
 * no equivalent (`headerClassRules` doesn't exist). This module bridges
 * the gap: it walks the rule list, evaluates each predicate against the
 * filtered row set, and toggles per-rule CSS classes on
 * `.ag-header-cell[col-id="..."]` directly.
 *
 * Differential repaint: we cache the last-painted column set per rule
 * and mutate ONLY the delta — without this, the header treatment would
 * flicker on every live tick because removing + re-adding the class
 * restarts CSS animations.
 *
 * Public surface: a single `evaluate()` call. Wire it into onReady /
 * modelUpdated / filterChanged listeners in the orchestrator.
 */

import type { PlatformHandle } from '@wellsfargo-starui/engine';
import { cssEscapeColId } from '../../column-customization/transforms';
import { planSsrmCalcColumn } from '../../../../engine/ssrmCalcColumns.js';
import type { ConditionalRule, ConditionalStylingState } from '../state';
import type { DiffCacheByApi } from '../transforms';
import { buildColumnsContextFromDiffs } from './utils';

export interface HeaderPainter {
  /** Paint headers based on the current rule predicates + filtered rows. */
  evaluate: () => void;
}

/** SSRM context slice published by the SSRM grid (see CustomSSRMGrid). */
type SsrmHeaderContext = {
  ssrmConfigured?: boolean;
  ssrmCountMatching?: (
    filterModel: Record<string, unknown>,
    opts?: { rowKeepExpression?: string },
  ) => Promise<number>;
};

/** True when any enabled rule targets header flash or header indicators. */
export function hasHeaderPaintRules(state: ConditionalStylingState): boolean {
  return state.rules.some((r) => {
    if (!r.enabled || r.scope.type !== 'cell') return false;
    if (
      r.flash?.enabled
      && (r.flash.target === 'headers' || r.flash.target === 'cells+headers')
    ) {
      return true;
    }
    if (!r.indicator?.icon) return false;
    const target = r.indicator.target ?? 'cells+headers';
    return target === 'headers' || target === 'cells+headers';
  });
}

export function createHeaderPainter(
  platform: PlatformHandle<ConditionalStylingState>,
  diffCacheByApi: DiffCacheByApi,
): HeaderPainter {
  // Per-rule column sets last painted — used to compute the diff against
  // the next-paint set so we can mutate only the changes. Without this
  // the headers flicker on every live tick.
  const lastFlashColsByRule = new Map<string, Set<string>>();
  const lastIndicatorColsByRule = new Map<string, Set<string>>();
  const notFilter = ':not(.ag-floating-filter)';
  // Rule DSL → Perspective keep-expression, memoised per rule id. `null`
  // means the rule cannot run engine-side (.old/.new diff refs, x/value
  // bindings) and stays on the on-screen scan.
  const keepByRule = new Map<string, { expression: string; keep: string | null }>();
  // Async book-side pass id — stale resolutions must not paint.
  let ssrmPass = 0;

  const keepExpressionFor = (rule: ConditionalRule): string | null => {
    const hit = keepByRule.get(rule.id);
    if (hit && hit.expression === rule.expression) return hit.keep;
    const plan = planSsrmCalcColumn({ colId: rule.id, expression: rule.expression });
    const keep = plan.kind === 'perspective' ? plan.perspectiveExpression : null;
    keepByRule.set(rule.id, { expression: rule.expression, keep });
    return keep;
  };

  const applyHeaderClassDelta = (
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

  const evaluate = (): void => {
    const api = platform.api.api;
    if (!api || typeof document === 'undefined') return;
    const rowDiffCache = diffCacheByApi.get(api as object);
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

    if (headerFlashRules.length === 0 && headerIndicatorRules.length === 0) {
      applyHeaderClassDelta(
        lastFlashColsByRule,
        new Map<string, Set<string>>(),
        (ruleId) => `ds-flash-hdr-${cssEscapeColId(ruleId)}`,
      );
      applyHeaderClassDelta(
        lastIndicatorColsByRule,
        new Map<string, Set<string>>(),
        (ruleId) => `ds-rule-${cssEscapeColId(ruleId)}`,
      );
      return;
    }

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
    const screenVerdicts = new Map<string, boolean>();
    const verdictFor = (rule: ConditionalRule): boolean => {
      let v = screenVerdicts.get(rule.id);
      if (v === undefined) {
        v = anyRowMatches(rule);
        screenVerdicts.set(rule.id, v);
      }
      return v;
    };
    const buildNextMaps = (verdict: (rule: ConditionalRule) => boolean) => {
      const nextFlash = new Map<string, Set<string>>();
      const nextIndicator = new Map<string, Set<string>>();
      for (const rule of headerFlashRules) {
        if (rule.scope.type !== 'cell') continue;
        if (verdict(rule)) nextFlash.set(rule.id, new Set(rule.scope.columns));
      }
      for (const rule of headerIndicatorRules) {
        if (rule.scope.type !== 'cell') continue;
        if (verdict(rule)) nextIndicator.set(rule.id, new Set(rule.scope.columns));
      }
      return { nextFlash, nextIndicator };
    };
    const paint = (maps: ReturnType<typeof buildNextMaps>) => {
      applyHeaderClassDelta(
        lastFlashColsByRule,
        maps.nextFlash,
        (ruleId) => `ds-flash-hdr-${cssEscapeColId(ruleId)}`,
      );
      applyHeaderClassDelta(
        lastIndicatorColsByRule,
        maps.nextIndicator,
        (ruleId) => `ds-rule-${cssEscapeColId(ruleId)}`,
      );
    };

    // Immediate paint from the on-screen scan (loaded rows).
    paint(buildNextMaps(verdictFor));

    // SSRM (worklog T7): the on-screen scan sees only loaded blocks, so an
    // indicator would silently mean "matches on screen" rather than
    // "matches in book". For rules whose DSL compiles to a Perspective
    // keep-expression, recount over the FULL displayed book engine-side and
    // repaint; diff-based rules (.old/.new) stay on-screen — their context
    // is tick-local by construction.
    const ctx = api.getGridOption?.('context') as SsrmHeaderContext | undefined;
    const countMatching = ctx?.ssrmCountMatching;
    if (!countMatching || !ctx?.ssrmConfigured) return;

    const allRules = [...new Map(
      [...headerFlashRules, ...headerIndicatorRules].map((r) => [r.id, r]),
    ).values()];
    const bookRules = allRules.filter((r) => keepExpressionFor(r) != null);
    if (bookRules.length === 0) return;

    const pass = ++ssrmPass;
    const filterModel =
      (api.getFilterModel?.() as Record<string, unknown> | null) ?? {};
    void Promise.all(
      bookRules.map(async (rule) => {
        try {
          const count = await countMatching(filterModel, {
            rowKeepExpression: keepExpressionFor(rule)!,
          });
          return [rule.id, count > 0] as const;
        } catch {
          return [rule.id, verdictFor(rule)] as const;
        }
      }),
    ).then((entries) => {
      if (pass !== ssrmPass) return;
      const bookVerdicts = new Map(entries);
      paint(buildNextMaps((rule) => bookVerdicts.get(rule.id) ?? verdictFor(rule)));
    });
  };

  return { evaluate };
}
