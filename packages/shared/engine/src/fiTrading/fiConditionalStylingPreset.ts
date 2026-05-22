/**
 * Default conditional-styling rules bundled with FI auto-format.
 */
import type { ConditionalRule } from '../customizer/modules/conditional-styling/state.js';
import { buildFiPriceTickRules, FI_DEFAULT_PRICE_COLUMN_IDS } from './fiPriceTickRules.js';

/** Static FI highlight rules (P&amp;L, yield, spread, notional). */
export const FI_STATIC_CONDITIONAL_RULES: ConditionalRule[] = [
  {
    id: 'fi-pnl-positive-daily',
    name: 'P&L (D) positive',
    enabled: true,
    priority: 20,
    scope: { type: 'cell', columns: ['dailyPnl', 'unrealizedPnl', 'mtdPnl', 'ytdPnl', 'pnl'] },
    expression: '[dailyPnl] > 0',
    style: {
      light: { color: '#047857', fontWeight: '600' },
      dark: { color: '#34d399', fontWeight: '600' },
    },
  },
  {
    id: 'fi-pnl-negative-daily',
    name: 'P&L (D) negative',
    enabled: true,
    priority: 21,
    scope: { type: 'cell', columns: ['dailyPnl', 'unrealizedPnl', 'mtdPnl', 'ytdPnl', 'pnl'] },
    expression: '[dailyPnl] < 0',
    style: {
      light: { color: '#b91c1c', fontWeight: '600' },
      dark: { color: '#f87171', fontWeight: '600' },
    },
  },
  {
    id: 'fi-yield-hy',
    name: 'High yield (>5%)',
    enabled: true,
    priority: 30,
    scope: { type: 'cell', columns: ['yield', 'yieldToMaturity'] },
    expression: '[yield] > 5',
    style: {
      light: { backgroundColor: '#fef9c3' },
      dark: { backgroundColor: 'rgba(250, 204, 21, 0.18)' },
    },
  },
  {
    id: 'fi-spread-wide',
    name: 'Wide OAS (>200)',
    enabled: true,
    priority: 40,
    scope: { type: 'cell', columns: ['oas', 'spread', 'zSpread'] },
    expression: '[oas] > 200',
    style: {
      light: { backgroundColor: '#fecaca', color: '#991b1b' },
      dark: { backgroundColor: 'rgba(220, 38, 38, 0.22)', color: '#fca5a5' },
    },
  },
  {
    id: 'fi-whale-notional',
    name: 'Large notional (>10M)',
    enabled: true,
    priority: 50,
    scope: { type: 'cell', columns: ['notionalAmount', 'marketValue'] },
    expression: '[notionalAmount] > 10000000',
    style: {
      light: { backgroundColor: '#fef3c7', fontWeight: '700' },
      dark: { backgroundColor: 'rgba(245, 158, 11, 0.2)', color: '#fcd34d', fontWeight: '700' },
    },
  },
];

/** Price tick arrows + static highlights. Pass column ids to include every price field on the grid. */
export function buildFiConditionalStylingRules(
  priceColumnIds: readonly string[] = FI_DEFAULT_PRICE_COLUMN_IDS,
): ConditionalRule[] {
  return [...buildFiPriceTickRules(priceColumnIds), ...FI_STATIC_CONDITIONAL_RULES];
}

/** Default export for profile import / Auto FI (STOMP blotter price paths). */
export const FI_CONDITIONAL_STYLING_RULES: ConditionalRule[] = buildFiConditionalStylingRules();
