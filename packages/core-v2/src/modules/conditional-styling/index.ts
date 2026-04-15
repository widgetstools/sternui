import type {
  ColDef,
  ColGroupDef,
  CellClassParams,
  RowClassParams,
} from 'ag-grid-community';
import { ExpressionEngine } from '@grid-customizer/core';
import type { AnyColDef, Module } from '../../core/types';
import { CssInjector } from './cssInjector';
import { ConditionalStylingPanel } from './ConditionalStylingPanel';
import {
  INITIAL_CONDITIONAL_STYLING,
  type CellStyleProperties,
  type ConditionalRule,
  type ConditionalStylingState,
} from './state';

// ─── Per-grid singletons ────────────────────────────────────────────────────
//
// One ExpressionEngine + one CssInjector per gridId. Held in module-level
// Maps because the v2 transform pipeline gives us a `GridContext` (gridId)
// but no module-instance handle. Cleared in `onGridDestroy`.
//
// NOTE: this is the ONE place where v2 keeps a per-id Map — it's a deliberate
// concession because the styling output (a <style> element + cellClassRules
// references) lives outside the Zustand store. Unlike v1's `_ctxMap`, this
// holds only inert helpers, never module state, so the strict-mode hazard
// that motivated the rewrite doesn't apply here.

interface GridResources {
  engine: ExpressionEngine;
  cssInjector: CssInjector;
}

const _gridResources = new Map<string, GridResources>();

function getOrCreateResources(gridId: string): GridResources {
  let r = _gridResources.get(gridId);
  if (!r) {
    r = { engine: new ExpressionEngine(), cssInjector: new CssInjector(gridId) };
    _gridResources.set(gridId, r);
  }
  return r;
}

// ─── CSS generation ─────────────────────────────────────────────────────────

function styleToCSS(style: CellStyleProperties): string {
  const parts: string[] = [];
  if (style.backgroundColor) parts.push(`background-color: ${style.backgroundColor}`);
  if (style.color) parts.push(`color: ${style.color}`);
  if (style.fontWeight) parts.push(`font-weight: ${style.fontWeight}`);
  if (style.fontStyle) parts.push(`font-style: ${style.fontStyle}`);
  if (style.fontSize) parts.push(`font-size: ${style.fontSize}`);
  if (style.fontFamily) parts.push(`font-family: ${style.fontFamily}`);
  if (style.textAlign) parts.push(`text-align: ${style.textAlign}`);
  if (style.textDecoration) parts.push(`text-decoration: ${style.textDecoration}`);
  if (style.paddingTop) parts.push(`padding-top: ${style.paddingTop}`);
  if (style.paddingRight) parts.push(`padding-right: ${style.paddingRight}`);
  if (style.paddingBottom) parts.push(`padding-bottom: ${style.paddingBottom}`);
  if (style.paddingLeft) parts.push(`padding-left: ${style.paddingLeft}`);
  if (style.borderTopWidth) {
    parts.push(`border-top: ${style.borderTopWidth} ${style.borderTopStyle ?? 'solid'} ${style.borderTopColor ?? 'currentColor'}`);
  }
  if (style.borderRightWidth) {
    parts.push(`border-right: ${style.borderRightWidth} ${style.borderRightStyle ?? 'solid'} ${style.borderRightColor ?? 'currentColor'}`);
  }
  if (style.borderBottomWidth) {
    parts.push(`border-bottom: ${style.borderBottomWidth} ${style.borderBottomStyle ?? 'solid'} ${style.borderBottomColor ?? 'currentColor'}`);
  }
  if (style.borderLeftWidth) {
    parts.push(`border-left: ${style.borderLeftWidth} ${style.borderLeftStyle ?? 'solid'} ${style.borderLeftColor ?? 'currentColor'}`);
  }
  return parts.join('; ');
}

/**
 * Build the CSS text for one rule. Two selectors so the dark-mode swap is a
 * pure CSS event (no JS recompute) — this is why we inject CSS rather than
 * setting inline `cellStyle`.
 *
 * We match both theme-signalling conventions a host app might use:
 *   - `.dark` class on the root element (Tailwind-style)
 *   - `[data-theme="dark"]` attribute on the root (CSS-variables style, what
 *     the demo app happens to use)
 * Hitting only one of these was the v2-RC bug where user-defined rules got
 * their `.gc-rule-<id>` class applied to rows but the matching CSS never
 * took effect because the selector didn't match the demo's theme signal.
 */
function buildCssText(ruleId: string, light: CellStyleProperties, dark: CellStyleProperties): string {
  const lightProps = styleToCSS(light);
  const darkProps = styleToCSS(dark);
  const lines: string[] = [];
  if (lightProps) {
    lines.push(
      `:root:not(.dark):not([data-theme="dark"]) .gc-rule-${ruleId} { ${lightProps} }`,
    );
  }
  if (darkProps) {
    lines.push(
      `.dark .gc-rule-${ruleId}, [data-theme="dark"] .gc-rule-${ruleId} { ${darkProps} }`,
    );
  }
  // Fallback when only light is configured — still shows up outside the
  // theme system (e.g. consumers without a `.dark` class or data-theme attr).
  if (lightProps && !darkProps) lines.push(`.gc-rule-${ruleId} { ${lightProps} }`);
  return lines.join('\n');
}

function reinjectAllRules(injector: CssInjector, rules: ConditionalRule[]): void {
  injector.clear();
  for (const rule of rules) {
    if (!rule.enabled) continue;
    injector.addRule(`conditional-${rule.id}`, buildCssText(rule.id, rule.style.light, rule.style.dark));
  }
}

// ─── Class-rule builders ────────────────────────────────────────────────────

/**
 * Compile to an AG-Grid string expression when possible (zero per-cell JS
 * cost), otherwise fall back to a function that re-evaluates the AST each
 * cell render. Errors during evaluation are swallowed — a broken rule must
 * not crash the grid.
 */
function buildCellClassPredicate(
  engine: ExpressionEngine,
  rule: ConditionalRule,
): ((params: CellClassParams) => boolean) | string {
  try {
    const ast = engine.parse(rule.expression);
    const agString = engine.tryCompileToAgString(ast);
    if (agString) return agString;
  } catch {
    // Parse error → fall through to function form, which will also fail but
    // does so per-cell silently rather than at transform time.
  }
  return (params: CellClassParams) => {
    try {
      return Boolean(
        engine.parseAndEvaluate(rule.expression, {
          x: params.value,
          value: params.value,
          data: params.data ?? {},
          columns: params.data ?? {},
        }),
      );
    } catch {
      return false;
    }
  };
}

function buildRowClassPredicate(engine: ExpressionEngine, rule: ConditionalRule): (params: RowClassParams) => boolean {
  return (params: RowClassParams) => {
    try {
      return Boolean(
        engine.parseAndEvaluate(rule.expression, {
          x: null,
          value: null,
          data: params.data ?? {},
          columns: params.data ?? {},
        }),
      );
    } catch {
      return false;
    }
  };
}

// ─── Column-def transform ───────────────────────────────────────────────────

function applyCellRulesToDefs(
  defs: AnyColDef[],
  cellRules: ConditionalRule[],
  engine: ExpressionEngine,
): AnyColDef[] {
  return defs.map((def) => {
    if ('children' in def && Array.isArray(def.children)) {
      const next = applyCellRulesToDefs(def.children, cellRules, engine);
      // Only rebuild the group when at least one child reference changed.
      const childrenUnchanged =
        next.length === def.children.length && next.every((c, i) => c === def.children[i]);
      return childrenUnchanged ? def : ({ ...def, children: next } as ColGroupDef);
    }

    const colDef = def as ColDef;
    const colId = colDef.colId ?? colDef.field;
    if (!colId) return def;

    const applicable = cellRules.filter(
      (r) => r.scope.type === 'cell' && (r.scope as { type: 'cell'; columns: string[] }).columns.includes(colId),
    );
    if (applicable.length === 0) return def;

    const cellClassRules: NonNullable<ColDef['cellClassRules']> = {
      ...((colDef.cellClassRules as Record<string, unknown>) ?? {}),
    } as NonNullable<ColDef['cellClassRules']>;

    for (const rule of applicable) {
      (cellClassRules as Record<string, unknown>)[`gc-rule-${rule.id}`] = buildCellClassPredicate(engine, rule);
    }

    return { ...colDef, cellClassRules };
  });
}

// ─── Module ─────────────────────────────────────────────────────────────────

export const conditionalStylingModule: Module<ConditionalStylingState> = {
  id: 'conditional-styling',
  name: 'Conditional Styling',
  schemaVersion: 1,
  // Runs after column-customization (priority 10) so per-rule classes layer
  // on top of any structural changes. Stays in front of any host-specific
  // toolbars (1000+) so the toolbar can read finalized class rules.
  priority: 20,

  getInitialState: () => ({ ...INITIAL_CONDITIONAL_STYLING, rules: [] }),

  onRegister(ctx) {
    // Allocate the per-grid resources up front + inject CSS for any rules
    // that came in from a profile load. transformColumnDefs may run before
    // this on first mount (depends on host), so this `getOrCreateResources`
    // is intentionally idempotent.
    const { cssInjector } = getOrCreateResources(ctx.gridId);
    const state = ctx.getModuleState<ConditionalStylingState>('conditional-styling');
    reinjectAllRules(cssInjector, state.rules);
  },

  onGridDestroy(ctx) {
    const r = _gridResources.get(ctx.gridId);
    if (!r) return;
    r.cssInjector.destroy();
    _gridResources.delete(ctx.gridId);
  },

  transformColumnDefs(defs, state, gridCtx) {
    const { engine, cssInjector } = getOrCreateResources(gridCtx.gridId);
    // Keep the <style> tag in lockstep with the rule list. Cheap: we only
    // diff via Map size + iteration in `flush`, and the transform pipeline
    // re-runs on state changes anyway.
    reinjectAllRules(cssInjector, state.rules);

    const cellRules = state.rules
      .filter((r) => r.enabled && r.scope.type === 'cell')
      .sort((a, b) => a.priority - b.priority);
    if (cellRules.length === 0) return defs;
    return applyCellRulesToDefs(defs, cellRules, engine);
  },

  transformGridOptions(opts, state, gridCtx) {
    const rowRules = state.rules
      .filter((r) => r.enabled && r.scope.type === 'row')
      .sort((a, b) => a.priority - b.priority);
    if (rowRules.length === 0) return opts;

    const { engine } = getOrCreateResources(gridCtx.gridId);
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
    return { rules: Array.isArray(d.rules) ? d.rules : [] };
  },

  SettingsPanel: ConditionalStylingPanel,
};

// ─── Test-only escape hatch ────────────────────────────────────────────────
// Lets unit tests reset the per-grid singleton map between cases without
// having to spin up a full GridCore. Not part of the public API.
/** @internal */
export function _resetConditionalStylingResourcesForTests(): void {
  for (const r of _gridResources.values()) r.cssInjector.destroy();
  _gridResources.clear();
}

export type {
  CellStyleProperties,
  ConditionalRule,
  ConditionalStylingState,
  RuleScope,
  ThemeAwareStyle,
} from './state';
export { INITIAL_CONDITIONAL_STYLING } from './state';
