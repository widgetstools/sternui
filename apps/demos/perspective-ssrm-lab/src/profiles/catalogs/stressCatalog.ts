import type { ColumnCustomizationState } from '@starui/grid/customizer';
import type { LabDemoProfileEntry } from '../labProfileKit';
import {
  FORMATTING_ASSIGNMENTS,
  HEAVY_FLASH,
  OVERVIEW_CALC_COLUMNS,
  OVERVIEW_COLUMN_GROUPS,
  OVERVIEW_CS_RULES,
  QUICK_FILTERS_CURRICULUM,
} from '../../seeds';
import { STRESS_COL_COUNT, STRESS_ROW_COUNT } from '../../data/stressColumns';

/**
 * Bump when the stress profile changes so first-mount reinstalls localStorage.
 * v1: 50k × 400 kitchen-sink stress book.
 */
export const STRESS_GRID_ID = 'lab-stress-v1';

const STRESS_GROUPING_CC: ColumnCustomizationState = {
  assignments: {
    ...FORMATTING_ASSIGNMENTS,
    assetClass: {
      colId: 'assetClass',
      rowGrouping: {
        enableRowGroup: true,
        rowGroup: true,
        rowGroupIndex: 0,
      },
    },
    issuerSector: {
      colId: 'issuerSector',
      rowGrouping: {
        enableRowGroup: true,
        rowGroup: true,
        rowGroupIndex: 1,
      },
    },
    marketValue: {
      colId: 'marketValue',
      valueFormatterTemplate: FORMATTING_ASSIGNMENTS.marketValue?.valueFormatterTemplate
        ?? { kind: 'preset', preset: 'number', options: { maximumFractionDigits: 0 } },
      rowGrouping: {
        enableValue: true,
        aggFunc: 'sum',
      },
    },
    dailyPnL: {
      ...FORMATTING_ASSIGNMENTS.dailyPnL,
      colId: 'dailyPnL',
      rowGrouping: {
        enableValue: true,
        aggFunc: 'sum',
      },
    },
    unrealizedPnL: {
      ...FORMATTING_ASSIGNMENTS.unrealizedPnL,
      colId: 'unrealizedPnL',
      rowGrouping: {
        enableValue: true,
        aggFunc: 'sum',
      },
    },
    quantityFace: {
      colId: 'quantityFace',
      rowGrouping: {
        enableValue: true,
        aggFunc: 'sum',
      },
    },
    dv01: {
      colId: 'dv01',
      rowGrouping: {
        enableValue: true,
        aggFunc: 'sum',
      },
    },
    modifiedDuration: {
      ...FORMATTING_ASSIGNMENTS.modifiedDuration,
      colId: 'modifiedDuration',
      rowGrouping: {
        enableValue: true,
        aggFunc: 'avg',
      },
    },
    oas: {
      ...FORMATTING_ASSIGNMENTS.oas,
      colId: 'oas',
      rowGrouping: {
        enableValue: true,
        aggFunc: 'avg',
      },
    },
  },
  globalCellNumberFormatter: {
    kind: 'preset',
    preset: 'number',
    options: { minimumFractionDigits: 2, maximumFractionDigits: 2 },
  },
};

const FULL_STRESS_SEED: LabDemoProfileEntry['seed'] = {
  'conditional-styling': { rules: OVERVIEW_CS_RULES },
  'column-customization': STRESS_GROUPING_CC,
  'column-groups': {
    groups: OVERVIEW_COLUMN_GROUPS,
    openGroupIds: { g_pricing: true, g_pnl: true, g_risk: true },
  },
  'calculated-columns': { virtualColumns: OVERVIEW_CALC_COLUMNS },
  'saved-filters': {
    // Pills present but inactive so the full 50k book is visible on load.
    filters: (
      QUICK_FILTERS_CURRICULUM.filters as Array<{
        id: string;
        label: string;
        active: boolean;
        filterModel: Record<string, unknown>;
      }>
    ).map((f) => ({
      id: f.id,
      label: f.label,
      filterModel: f.filterModel,
      active: false,
    })),
  },
  'general-settings': {
    ...HEAVY_FLASH,
    animateRows: false,
    gridDensity: 'compact',
    rowHeight: 28,
    headerHeight: 28,
    rowGroupPanelShow: 'always',
    pivotPanelShow: 'always',
    groupDefaultExpanded: 0,
    grandTotalRow: 'bottom',
    groupTotalRow: 'bottom',
    rowSelection: 'multiRow',
    checkboxSelection: true,
    cellSelection: true,
  },
};

export const STRESS_DEMO_PROFILES: LabDemoProfileEntry[] = [
  {
    id: 'stress-00-kitchen-sink',
    name: '00 · Full stress',
    blurb: `${STRESS_ROW_COUNT.toLocaleString()} × ${STRESS_COL_COUNT} · grouped · CS · formatters · calcs · pills`,
    seed: FULL_STRESS_SEED,
  },
  {
    id: 'stress-01-flat-wide',
    name: '01 · Flat wide',
    blurb: 'No row groups — stress horizontal scroll + formatters + CS only.',
    seed: {
      'conditional-styling': { rules: OVERVIEW_CS_RULES },
      'column-customization': {
        assignments: FORMATTING_ASSIGNMENTS,
        globalCellNumberFormatter: STRESS_GROUPING_CC.globalCellNumberFormatter,
      },
      'column-groups': {
        groups: OVERVIEW_COLUMN_GROUPS,
        openGroupIds: { g_pricing: true, g_pnl: true },
      },
      'general-settings': {
        ...HEAVY_FLASH,
        animateRows: false,
        gridDensity: 'compact',
        rowHeight: 28,
        headerHeight: 28,
        rowGroupPanelShow: 'always',
        groupDefaultExpanded: 0,
      },
    },
  },
  {
    id: 'stress-02-grouped-agg',
    name: '02 · Grouped + agg',
    blurb: 'Class → Sector groups with sum/avg aggs; minimal chrome.',
    seed: {
      'column-customization': {
        assignments: {
          assetClass: STRESS_GROUPING_CC.assignments!.assetClass!,
          issuerSector: STRESS_GROUPING_CC.assignments!.issuerSector!,
          marketValue: STRESS_GROUPING_CC.assignments!.marketValue!,
          dailyPnL: STRESS_GROUPING_CC.assignments!.dailyPnL!,
          dv01: STRESS_GROUPING_CC.assignments!.dv01!,
        },
      },
      'general-settings': {
        animateRows: false,
        gridDensity: 'compact',
        rowHeight: 28,
        rowGroupPanelShow: 'always',
        groupDefaultExpanded: 0,
        grandTotalRow: 'bottom',
        groupTotalRow: 'bottom',
      },
    },
  },
];

export const STRESS_ACTIVE_PROFILE_ID = 'stress-00-kitchen-sink';
