/**
 * Calculated Columns module state — v2.
 *
 * Scope: virtual derived columns — whole new columns appended to the grid,
 * with values computed from the row's base columns via our CSP-safe
 * `ExpressionEngine`. Syntax: `[price] * [quantity]`. Read-only.
 *
 * Out of scope (considered and dropped): AG-Grid's native `allowFormula`
 * opt-in and custom `formulaFuncs` — AG-Grid's `FormulaModule` doesn't
 * expose a reliable post-init path to update its function registry (the
 * `formulaFuncs` grid option is `@initial`), so custom functions don't
 * propagate without a full grid remount. Revisit when either (a) AG-Grid
 * exposes `IFormulaService.refreshFormulas` publicly, or (b) we adopt a
 * grid-remount-on-state-change policy.
 */

export interface VirtualColumnDef {
  /** Unique column id. Must not collide with an existing data field. */
  colId: string;
  /** Header label. */
  headerName: string;
  /** Expression in our DSL — e.g. `[price] * [quantity] / 1000`. Parsed at
   *  transform time, not per-cell; errors fall back to `null`. */
  expression: string;
  /** Optional formatter expression — receives the computed value as `x` /
   *  `value` and should return a string. E.g. `CONCAT('$', ROUND(x, 2))`. */
  valueFormatterTemplate?: string;
  /** Insertion hint — virtual columns are appended in declaration order.
   *  Actual column positioning across the grid stays driven by AG-Grid's
   *  column-state APIs; `position` is persisted for UI sorting. */
  position?: number;
  initialWidth?: number;
  initialHide?: boolean;
  initialPinned?: 'left' | 'right';
}

export interface CalculatedColumnsState {
  virtualColumns: VirtualColumnDef[];
}

export const INITIAL_CALCULATED_COLUMNS: CalculatedColumnsState = {
  virtualColumns: [],
};
