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
}

export interface ConditionalStylingState {
  rules: ConditionalRule[];
}

export const INITIAL_CONDITIONAL_STYLING: ConditionalStylingState = { rules: [] };
