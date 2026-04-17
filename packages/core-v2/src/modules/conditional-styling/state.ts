/**
 * Conditional Styling — a list of expression-driven rules that paint cells
 * (scoped to specific columns) or whole rows. Carried into AG-Grid via
 * `ColDef.cellClassRules` / `GridOptions.rowClassRules`. The actual visual
 * styling is delivered through CSS classes (`gc-rule-<id>`) injected at
 * mount time, NOT inline styles — keeps re-render cheap and lets the dark
 * theme switch via `:root.dark` selectors without recomputing rules.
 *
 * Re-using the v1 type shapes (CellStyleProperties / ThemeAwareStyle / ConditionalRule
 * are re-exported from `@grid-customizer/core` so existing v1 profile snapshots
 * load cleanly into v2 without any migration step.
 */
export type {
  CellStyleProperties,
  ThemeAwareStyle,
} from '@grid-customizer/core';

import type { ThemeAwareStyle } from '@grid-customizer/core';

/** A cell-scoped rule applies to specific column ids. A row-scoped rule
 *  paints the whole row when the expression is truthy. */
export type RuleScope = { type: 'cell'; columns: string[] } | { type: 'row' };

/**
 * Optional "flash on match" config for a rule.
 *
 * When `enabled` is true, the module subscribes to AG-Grid's
 * `cellValueChanged` event. Each time a cell value changes in a row for
 * which the rule now evaluates truthy, we fire a visible flash through
 * AG-Grid's `flashCells()` API (row/cells targets) and/or via a short
 * CSS animation on the header cell (headers target).
 *
 * `target` is constrained by the rule's `scope`:
 *   - `scope.type === 'row'`   → only `'row'` makes sense.
 *   - `scope.type === 'cell'`  → `'cells'`, `'headers'`, or `'cells+headers'`.
 *
 * The runtime validates the combination defensively (defaults to the
 * scope-appropriate choice when a legacy/invalid value is loaded).
 */
export type FlashTarget = 'row' | 'cells' | 'headers' | 'cells+headers';

export interface FlashConfig {
  enabled: boolean;
  target: FlashTarget;
  /** Flash hold duration in ms (pre-fade). Default 500. */
  flashDuration?: number;
  /** Fade-out duration in ms. Default 1000. */
  fadeDuration?: number;
}

/**
 * Which surface(s) the indicator badge paints on when the rule
 * matches. Cells = the matching data cells; headers = the column
 * header(s) owning those cells.
 */
export type IndicatorTarget = 'cells' | 'headers' | 'cells+headers';

/** Corner of the cell / header to anchor the badge at. */
export type IndicatorPosition = 'top-left' | 'top-right';

/**
 * Optional badge drawn on every cell and/or header that currently
 * matches the rule. Rendered via a CSS `::before` pseudo-element so
 * there's no per-cell React work and no conflict with AG-Grid's
 * default cell renderer recycling.
 */
export interface RuleIndicator {
  /** Key from `INDICATOR_ICONS` (see `./indicatorIcons.ts`). When the
   *  key is unknown (legacy data, renamed icon), the runtime silently
   *  renders no badge — it does NOT fall back to a default so the UX
   *  stays predictable. */
  icon: string;
  /** CSS colour string. Defaults to `currentColor` (inherits from the
   *  cell's text colour) when omitted. */
  color?: string;
  /** Where to paint. Default `cells+headers` — matches the zero-config
   *  behaviour that shipped first. */
  target?: IndicatorTarget;
  /** Corner anchor. Default `top-right`. */
  position?: IndicatorPosition;
}

export interface ConditionalRule {
  id: string;
  name: string;
  enabled: boolean;
  /** Lower runs first within the conditional-styling pipeline. */
  priority: number;
  scope: RuleScope;
  /** Free-form expression evaluated against `{ value, x, data, columns }`. */
  expression: string;
  style: ThemeAwareStyle;
  /** Optional visible pulse when a cell-value change causes the rule to
   *  evaluate truthy. Uses AG-Grid's `flashCells()` for row/cell targets
   *  and a CSS keyframes animation for header targets. */
  flash?: FlashConfig;
  /** Optional top-right badge drawn on every matching cell + header. */
  indicator?: RuleIndicator;
}

export interface ConditionalStylingState {
  rules: ConditionalRule[];
}

export const INITIAL_CONDITIONAL_STYLING: ConditionalStylingState = { rules: [] };
