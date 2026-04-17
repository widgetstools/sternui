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
}

export interface ConditionalStylingState {
  rules: ConditionalRule[];
}

export const INITIAL_CONDITIONAL_STYLING: ConditionalStylingState = { rules: [] };
