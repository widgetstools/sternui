/**
 * ★ The headline of this demo ★
 *
 * Programmatically constructs the entire visual profile that a trader
 * would otherwise build by clicking through the Cockpit UI:
 *
 *   • Column-customization  — header renames, alignment, locked columns,
 *                             cell colors per side, dimmed read-only cols
 *   • Calculated columns    — virtual "P&L vs Model" appended after Model FV
 *   • Conditional styling   — sell rows tinted red, fat-finger spread cells
 *                             highlighted, ⚠ on bid > ask inversions
 *
 * Every reducer used here is exported from `@starui/core` —
 * the same pure functions that the UI's FormattingToolbar dispatches.
 *
 * Usage (from App.tsx after onReady):
 *   applyAxeProfile(handle.platform);
 *
 * To prove the parity claim: open the Cockpit settings sheet after
 * load — every panel reflects state we set programmatically here, and
 * `profiles.saveActiveProfile()` persists it just like a user-built
 * profile.
 */
import type { GridPlatform } from '@starui/core';
import {
  // Column-customization reducers
  applyAlignmentReducer,
  applyHeaderNameReducer,
  applyEditableReducer,
  applyColorsReducer,
  applyFormatterReducer,
  COLUMN_CUSTOMIZATION_MODULE_ID,
  type ColumnCustomizationState,
  // Calculated columns
  CALCULATED_COLUMNS_MODULE_ID,
  type CalculatedColumnsState,
  type VirtualColumnDef,
  // Conditional styling
  CONDITIONAL_STYLING_MODULE_ID,
  type ConditionalStylingState,
  type ConditionalRule,
} from '@starui/core';

// ─── Column-customization ──────────────────────────────────────────────

/**
 * Layer reducers in order. Each is a pure
 * `(prev: State | undefined) => State` — calling them in sequence
 * reproduces what a user would build clicking through the Cockpit.
 */
function buildColumnCustomization(): ColumnCustomizationState {
  const reducers = [
    // Header renames — make the toolbar line up with the trader's vocabulary.
    applyHeaderNameReducer(['cusip'],  'CUSIP'),
    applyHeaderNameReducer(['issuer'], 'Issuer · Coupon · Maturity'),
    applyHeaderNameReducer(['size'],   'Size (MM)'),
    applyHeaderNameReducer(['spread'], 'Spread (bp)'),
    applyHeaderNameReducer(['model'],  'Model FV'),

    // Right-align every numeric column for tabular reading.
    applyAlignmentReducer(['size', 'bid', 'ask', 'spread', 'yield', 'last', 'model'], 'cell', { horizontal: 'right' }),
    applyAlignmentReducer(['size', 'bid', 'ask', 'spread', 'yield', 'last', 'model'], 'header', { horizontal: 'right' }),

    // Structured formatters via the same Excel-format pipeline the
    // Cockpit uses. SheetJS handles trailing literal text in quotes —
    // `+0.0" bp"` writes a leading sign, 1dp, then ` bp`; `0.000"%"`
    // formats yield as a percent. Numeric value still drives sort/
    // filter and the conditional-styling rules.
    applyFormatterReducer(['spread'], { kind: 'excelFormat', format: '+0.0" bp";-0.0" bp";0.0" bp"' }),
    applyFormatterReducer(['yield'],  { kind: 'excelFormat', format: '0.000"%"' }),
    applyFormatterReducer(['size'],   { kind: 'excelFormat', format: '0"MM"' }),

    // Lock derived/read-only columns explicitly, even though the base
    // ColDef already declares them non-editable. Belt-and-braces:
    // shows up in the column-customization panel as deliberate intent.
    applyEditableReducer(['cusip', 'issuer', 'side', 'yield', 'last', 'model'], false),

    // Side-aware accents — bid green-shifted, ask red-shifted. Standard
    // sell-side blotter convention; reinforces that a bid is what the
    // desk pays and an ask is what the desk receives. The `!important`
    // on the .cell-pending class still wins when the cell is staged,
    // so accents and pending-yellow don't fight.
    applyColorsReducer(['bid'], 'cell', { text: '#86efac' }),  // light green
    applyColorsReducer(['ask'], 'cell', { text: '#fca5a5' }),  // light red

    // Dim the read-only columns vs the editable ones — pulls the eye
    // toward what the trader can actually move.
    applyColorsReducer(['yield', 'last'], 'cell', { text: 'var(--ink-mute)' }),
    applyColorsReducer(['model'],        'cell', { text: 'var(--link)' }),

    // Pin pending-friendly columns left so they stay onscreen during
    // wide horizontal scroll. (CUSIP + Issuer are already pinned via
    // the base ColDef; we don't override here — just demonstrating
    // that an additional pin would chain reducers the same way.)
  ] as const;

  return reducers.reduce<ColumnCustomizationState>(
    (acc, reduce) => reduce(acc),
    { assignments: {} },
  );
}

// ─── Calculated columns ────────────────────────────────────────────────

/**
 * One virtual column appended after Model FV — drives the trader's
 * "is the market mispriced relative to our internal model?" view.
 *
 * Note the expression syntax: `[bid] - [model]`. The DSL is
 * documented in docs/FORMATS_AND_EXPRESSIONS.md.
 */
function buildCalculatedColumns(): CalculatedColumnsState {
  const pnlVsModel: VirtualColumnDef = {
    colId: 'pnlVsModel',
    headerName: 'P&L vs Model',
    expression: '[bid] - [model]',
    cellDataType: 'number',
    initialWidth: 110,
    // Excel format string — `+#0.000;-#0.000;0.000` writes a leading
    // sign for positive deltas, a leading minus for negative, and a
    // bare zero. Excel/SheetJS parser handles it CSP-safely.
    valueFormatterTemplate: {
      kind: 'excelFormat',
      format: '+#0.000;-#0.000;0.000',
    },
  };

  return { virtualColumns: [pnlVsModel] };
}

// ─── Conditional styling ───────────────────────────────────────────────

/**
 * Every rule below is the same shape the Cockpit's Conditional Styling
 * panel produces. They're evaluated against `{ value, x, data, columns }`
 * (the row + the named cell) and translated to AG-Grid `cellClassRules`
 * + `rowClassRules` by the conditional-styling module's transform.
 */
// ─── Pending-state rules (architecture §02 + §04) ─────────────────────
//
// The buffer-mirrored shadow fields on each row (`__p_bid`, `__p_ask`,
// `__p_spread`, `__p_size` — see editing.ts:syncBufferToRows) carry the
// per-cell pending tag. We turn each (column, tag) pair into a
// conditional-styling rule so the styling pipeline runs through the
// SAME module the Cockpit's Style Rules panel uses, not through a
// hand-rolled cellClass callback.

const EDITABLE_COLS = ['bid', 'ask', 'spread', 'size'] as const;

type StateBlock = {
  tag: string;
  /** Inline cell style — works alongside class-based decoration. */
  style: ConditionalRule['style'];
  /** Optional indicator (top-right glyph). */
  indicator?: ConditionalRule['indicator'];
  /** Higher priority wins when multiple rules match the same cell. */
  priority: number;
};

// `CellStyleProperties` (packages/core/src/types/common.ts) is a strict
// subset of CSS — only background, color, granular borders, font, padding.
// No box-shadow / animation / gradient. So we express the yellow left
// accent via `borderLeft*` properties; advanced states (committing pulse,
// rejected hatched, conflict ⚠ glyph) stay on CSS classes wired through
// the existing cellClass callback in columns.ts.
const yellowBorder = {
  borderLeftColor: '#facc15',
  borderLeftWidth: '2px',
  borderLeftStyle: 'solid' as const,
};
const yellowBorderDashed = { ...yellowBorder, borderLeftStyle: 'dashed' as const };

const PENDING_BLOCKS: StateBlock[] = [
  {
    tag: 'pending',
    priority: 100,
    style: {
      dark:  { backgroundColor: 'rgba(250, 204, 21, 0.094)', color: '#facc15', ...yellowBorder },
      light: { backgroundColor: 'rgba(250, 204, 21, 0.094)', color: '#a16207', ...yellowBorder },
    },
  },
  {
    tag: 'warn',
    priority: 110,
    style: {
      dark:  { backgroundColor: 'rgba(250, 204, 21, 0.094)', color: '#facc15', ...yellowBorderDashed },
      light: { backgroundColor: 'rgba(250, 204, 21, 0.094)', color: '#a16207', ...yellowBorderDashed },
    },
  },
  {
    tag: 'committed',
    priority: 130,
    style: {
      dark:  { backgroundColor: 'rgba(74, 222, 128, 0.094)', color: '#4ade80' },
      light: { backgroundColor: 'rgba(74, 222, 128, 0.094)', color: '#15803d' },
    },
  },
];

function buildPendingStateRules(): ConditionalRule[] {
  const rules: ConditionalRule[] = [];
  for (const col of EDITABLE_COLS) {
    for (const block of PENDING_BLOCKS) {
      rules.push({
        id: `pending-${col}-${block.tag}`,
        name: `Pending [${block.tag}] · ${col}`,
        enabled: true,
        priority: block.priority,
        scope: { type: 'cell', columns: [col] },
        // Each rule scopes to one column and matches that column's
        // shadow-field tag exactly. Expression engine resolves the
        // `__p_<col>` reference against `data` per evaluator.ts.
        expression: `[__p_${col}] == "${block.tag}"`,
        style: block.style,
      });
    }
  }
  return rules;
}

function buildConditionalStyling(): ConditionalStylingState {
  const rules: ConditionalRule[] = [
    ...buildPendingStateRules(),
    {
      id: 'rule-sell-row-tint',
      name: 'Sell axes — light red row tint',
      enabled: true,
      priority: 10,
      scope: { type: 'row' },
      // Match by data.side rather than value (row-scope rules don't
      // bind a specific cell).
      expression: '[side] == "S"',
      style: {
        light: { backgroundColor: 'rgba(248, 113, 113, 0.06)' },
        dark:  { backgroundColor: 'rgba(248, 113, 113, 0.06)' },
      },
    },
    {
      id: 'rule-buy-row-tint',
      name: 'Buy axes — light green row tint',
      enabled: true,
      priority: 11,
      scope: { type: 'row' },
      expression: '[side] == "B"',
      style: {
        light: { backgroundColor: 'rgba(74, 222, 128, 0.04)' },
        dark:  { backgroundColor: 'rgba(74, 222, 128, 0.04)' },
      },
    },
    {
      id: 'rule-bid-above-ask',
      name: 'Bid > Ask — pricing inversion warning',
      enabled: true,
      priority: 50,
      scope: { type: 'cell', columns: ['bid', 'ask'] },
      expression: '[bid] > [ask]',
      style: {
        light: { color: '#f87171', fontWeight: 'bold', backgroundColor: 'rgba(248, 113, 113, 0.18)' },
        dark:  { color: '#f87171', fontWeight: 'bold', backgroundColor: 'rgba(248, 113, 113, 0.18)' },
      },
      indicator: {
        icon: 'lucide:alert-triangle',
        color: '#f87171',
        target: 'cells',
      },
    },
    {
      id: 'rule-tight-spread',
      name: 'Tight spread (< 80 bp) — accent',
      enabled: true,
      priority: 20,
      scope: { type: 'cell', columns: ['spread'] },
      expression: 'value < 80',
      style: {
        light: { color: 'var(--commit)', fontWeight: '500' },
        dark:  { color: 'var(--commit)', fontWeight: '500' },
      },
    },
    {
      id: 'rule-wide-spread',
      name: 'Wide spread (> 150 bp) — danger',
      enabled: true,
      priority: 21,
      scope: { type: 'cell', columns: ['spread'] },
      expression: 'value > 150',
      style: {
        light: { color: 'var(--danger)', fontWeight: '500' },
        dark:  { color: 'var(--danger)', fontWeight: '500' },
      },
    },
  ];

  return { rules };
}

// ─── Public entry point ────────────────────────────────────────────────

/**
 * Apply the entire axe-blotter profile to a live `GridPlatform`.
 *
 * Call once after `onReady`. Each `setModuleState` is a single Zustand
 * write; the modules' transform pipelines re-run automatically and
 * AG-Grid reflows.
 *
 * If you want this to be the user's saved default, follow up with
 * `handle.profiles.saveActiveProfile()` — the snapshot persists
 * exactly as if the trader had built it through the UI.
 */
export function applyAxeProfile(platform: GridPlatform): void {
  platform.store.replaceModuleState(COLUMN_CUSTOMIZATION_MODULE_ID, buildColumnCustomization());
  platform.store.replaceModuleState(CALCULATED_COLUMNS_MODULE_ID,   buildCalculatedColumns());
  platform.store.replaceModuleState(CONDITIONAL_STYLING_MODULE_ID,  buildConditionalStyling());
}

/**
 * Reverse — wipe every module slice the axe profile populated. Useful
 * for an "Aliased blotter" toggle that flips between the styled view
 * and the raw column defs.
 */
export function clearAxeProfile(platform: GridPlatform): void {
  platform.store.replaceModuleState(COLUMN_CUSTOMIZATION_MODULE_ID, { assignments: {} });
  platform.store.replaceModuleState(CALCULATED_COLUMNS_MODULE_ID,   { virtualColumns: [] });
  platform.store.replaceModuleState(CONDITIONAL_STYLING_MODULE_ID,  { rules: [] });
}
