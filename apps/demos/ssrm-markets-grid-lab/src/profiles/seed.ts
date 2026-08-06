import type { ConditionalRule } from '@starui/grid/customizer';
import type { LabDemoProfileEntry } from './labProfileKit';
import { LAB_SSRM_CALC_CUSTOMIZATION, LAB_SSRM_VIRTUAL_COLUMNS } from '../data/ssrmCalcColumns';

/**
 * What this lab opens with.
 *
 * ONE profile, deliberately. The bake-off lab carries a catalogue of them
 * because it exists to compare configurations; this app exists to show the
 * product path, and a selector full of variants is the thing that made "which
 * one should I use?" a reasonable question in the first place.
 *
 * Everything below reaches the grid the way a USER's own configuration does —
 * through the customizer modules — rather than through props. That is not
 * decoration: a calculated column seeded here is planned for the `ssrm-engine`
 * backend, its AST crosses the worker port, and the engine evaluates it where
 * the book is, which is what makes it sortable and groupable. A column passed
 * as a prop would be none of those things.
 */

/** Emerald / rose, resolved from design-system tokens at paint time. */
const styleUp = {
  dark: { color: '#7fdf9b', fontWeight: '600' },
  light: { color: '#1f7a34', fontWeight: '600' },
};
const styleDown = {
  dark: { color: '#ee8e8e', fontWeight: '600' },
  light: { color: '#a02a2a', fontWeight: '600' },
};
const styleFlag = {
  dark: { backgroundColor: '#0f2b1c', color: '#7fdf9b' },
  light: { backgroundColor: '#e8f4ec', color: '#1f5d34' },
};

export const SSRM_LAB_CS_RULES: ConditionalRule[] = [
  {
    id: 'esg-tick',
    name: 'ESG tick flash',
    enabled: true,
    priority: 10,
    scope: { type: 'cell', columns: ['esgScore'] },
    // `value` is the CELL's own value, and this spelling is the one that used
    // to be dead: the timed evaluator bound it to null, so every rule written
    // this way was false for every row and never activated. Kept in this form
    // on purpose — it is the regression this lab would show first.
    expression: 'value != null',
    style: { dark: {}, light: {} },
    flash: { enabled: true, target: 'cells', mode: 'oneShot', color: 'sky', durationMs: 600 },
    activeDurationMs: 600,
  },
  {
    id: 'esg-leaders-whole-book',
    name: 'ESG leaders (whole book)',
    enabled: true,
    priority: 40,
    scope: { type: 'cell', columns: ['esgScore'] },
    /**
     * **The whole-book rule, and the reason it is in the DEFAULT profile.**
     *
     * `[esgScore] > 999` matches roughly one row in a thousand, so of the ~100
     * rows a block cache holds, none does. `forEachNodeAfterFilter` — how a
     * client-side grid answers "does any row match?" — visits ZERO nodes under
     * a server row model, so the header indicator here can only light if the
     * worker was asked about the BOOK. It is the one visible thing on this
     * surface that a client-side grid physically cannot do, and it is the first
     * thing to go dark if the seam regresses.
     */
    expression: '[esgScore] > 999',
    style: styleFlag,
    indicator: { icon: 'flame', position: 'top-left', target: 'cells+headers', color: '#7fdf9b' },
  },
  {
    id: 'pnl-up',
    name: 'Gains',
    enabled: true,
    priority: 20,
    scope: { type: 'cell', columns: ['dailyPnL', 'unrealizedPnL'] },
    expression: 'value > 0',
    style: styleUp,
  },
  {
    id: 'pnl-down',
    name: 'Losses',
    enabled: true,
    priority: 20,
    scope: { type: 'cell', columns: ['dailyPnL', 'unrealizedPnL'] },
    expression: 'value < 0',
    style: styleDown,
  },
];

/** The single seeded profile this lab opens with. */
export const SSRM_LAB_PROFILES: LabDemoProfileEntry[] = [
  {
    id: 'ssrm-lab-00-default',
    name: '00 · SSRM MarketsGrid',
    blurb:
      'The worker-held book under the full platform: calculated columns evaluated in the ' +
      'worker, a whole-book style rule, grouping with totals.',
    seed: {
      'calculated-columns': { virtualColumns: LAB_SSRM_VIRTUAL_COLUMNS as never },
      'column-customization': LAB_SSRM_CALC_CUSTOMIZATION as never,
      'conditional-styling': { rules: SSRM_LAB_CS_RULES },
      'general-settings': {
        animateRows: false,
        gridDensity: 'compact',
        rowHeight: 28,
        headerHeight: 28,
        rowGroupPanelShow: 'always',
        // Both totals rows on by default. The grand total is created one way
        // and updated another (`grandTotalData` creates it and does NOT refresh
        // it), and a group footer is a different node again — one that
        // `forEachNode` does not traverse at all. Having both on screen is what
        // makes a regression in either visible without setting anything up.
        grandTotalRow: 'bottom',
        groupTotalRow: 'bottom',
        cellFlashDuration: 700,
        cellFadeDuration: 1400,
      },
    },
  },
];

/** Chrome the grid mount spreads. Kept beside the seed so they cannot drift. */
export const SSRM_LAB_SEED = {
  showProfileSelector: true,
  showSaveButton: true,
  showSettingsButton: true,
  showVisualExcelExport: true,
  sideBar: { toolPanels: ['columns', 'filters'] },
};
