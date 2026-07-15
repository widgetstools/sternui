import type { ColumnCustomizationState } from '@starui/grid/customizer';
import type { LabDemoProfileEntry } from '../labProfileKit';
import {
  CALCULATED_TAB_VIRTUAL,
  OVERVIEW_CALC_COLUMNS,
  TRAFFIC_LIGHT_VIRTUAL,
} from '../../seeds';

/** Bump when demo profiles change so first-mount reinstalls. */
export const CALCULATED_GRID_ID = 'lab-calculated-v6';

const ALL = CALCULATED_TAB_VIRTUAL;
const pick = (...ids: string[]) => ALL.filter((c) => ids.includes(c.colId));

const TRAFFIC_LIGHT_CC: ColumnCustomizationState = {
  assignments: {
    trafficlight: {
      colId: 'trafficlight',
      valueFormatterTemplate: {
        kind: 'excelFormat',
        format: '[=1]"🟢";[=2]"🟡";[=3]"🔴"',
      },
      rowGrouping: {
        enableValue: true,
        aggFunc: 'trafficLight',
      },
    },
    assetClass: {
      colId: 'assetClass',
      rowGrouping: {
        enableRowGroup: true,
        rowGroup: true,
        rowGroupIndex: 0,
      },
    },
  },
};

export const CALCULATED_DEMO_PROFILES: LabDemoProfileEntry[] = [
  {
    id: 'calc-00-all-virtual',
    name: '00 · All virtual (11)',
    blurb: 'Full expression set incl. P&L %, CS01 notional, yield spread.',
    seed: { 'calculated-columns': { virtualColumns: ALL } },
  },
  {
    id: 'calc-01-pnl-stack',
    name: '01 · P&L stack',
    blurb: 'P&L Total + % of market value.',
    seed: {
      'calculated-columns': {
        virtualColumns: pick('calc_pnlTotal', 'calc_pnlPctMkt'),
      },
    },
  },
  {
    id: 'calc-02-risk-ratios',
    name: '02 · Risk ratios',
    blurb: 'Carry/Risk, dollar duration, risk bucket, CS01 notional.',
    seed: {
      'calculated-columns': {
        virtualColumns: pick('calc_carryRisk', 'calc_dollarDur', 'calc_riskBucket', 'calc_cs01Notional'),
      },
    },
  },
  {
    id: 'calc-03-spreads',
    name: '03 · Spreads & liquidity',
    blurb: 'B/A bps, spread-to-benchmark, liquidity log, yield spread.',
    seed: {
      'calculated-columns': {
        virtualColumns: pick('calc_bidAskBps', 'calc_spreadToBench', 'calc_liquidityScore', 'calc_yieldSpread'),
      },
    },
  },
  {
    id: 'calc-04-overview-derivatives',
    name: '04 · Overview derivatives',
    blurb: 'The four virtual cols from the kitchen-sink tab.',
    seed: { 'calculated-columns': { virtualColumns: OVERVIEW_CALC_COLUMNS } },
  },
  {
    id: 'calc-05-traffic-light',
    name: '05 · Traffic light (RAG)',
    blurb: 'IFS midPrice → 🟢/🟡/🔴; group by Asset Class with trafficLight agg (SSRM-ready).',
    seed: {
      'calculated-columns': { virtualColumns: [TRAFFIC_LIGHT_VIRTUAL] },
      'column-customization': TRAFFIC_LIGHT_CC,
    },
  },
];

export const CALCULATED_ACTIVE_PROFILE_ID = 'calc-00-all-virtual';
