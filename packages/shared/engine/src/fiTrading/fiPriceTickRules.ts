/**
 * Transient up/down indicators for FI price columns on live ticks.
 *
 * Uses conditional-styling `activeDurationMs` + corner badge icons (not
 * permanent Excel format arrows). Expressions compare `[col.new]` vs
 * `[col.old]` maintained by the conditional-styling runtime on each
 * `cellValueChanged` / model update.
 */
import type { ConditionalRule } from '../customizer/modules/conditional-styling/state.js';
import { classifyFiFieldFromPath } from './fiAutoFormat.js';

/** How long the tick arrow + tint stay visible after a price change (ms). */
export const FI_PRICE_TICK_ACTIVE_MS = 1_200;

const TICK_UP_STYLE = {
  light: { color: '#047857', fontWeight: '600' as const },
  dark: { color: '#34d399', fontWeight: '600' as const },
};

const TICK_DOWN_STYLE = {
  light: { color: '#b91c1c', fontWeight: '600' as const },
  dark: { color: '#f87171', fontWeight: '600' as const },
};

function ruleIdFor(colId: string, direction: 'up' | 'down'): string {
  return `fi-px-tick-${direction}-${colId.replace(/\./g, '-')}`;
}

/**
 * Build paired up/down timed rules for every price-classified column id.
 * Skips columns that are not classified as `price` (yields/spreads use
 * different semantics).
 */
export function buildFiPriceTickRules(columnIds: readonly string[]): ConditionalRule[] {
  const priceCols = [...new Set(columnIds.filter((id) => classifyFiFieldFromPath(id) === 'price'))];
  const rules: ConditionalRule[] = [];

  for (const colId of priceCols) {
    const upExpr = `[${colId}.new] > [${colId}.old]`;
    const downExpr = `[${colId}.new] < [${colId}.old]`;

    rules.push({
      id: ruleIdFor(colId, 'up'),
      name: `Px tick up · ${colId}`,
      enabled: true,
      priority: 8,
      scope: { type: 'cell', columns: [colId] },
      expression: upExpr,
      style: TICK_UP_STYLE,
      activeDurationMs: FI_PRICE_TICK_ACTIVE_MS,
      indicator: {
        icon: 'triangle-up-solid',
        color: '#047857',
        target: 'cells',
        position: 'left-middle',
      },
      flash: {
        enabled: true,
        target: 'cells',
        mode: 'oneShot',
        color: 'emerald',
        durationMs: 600,
      },
    });

    rules.push({
      id: ruleIdFor(colId, 'down'),
      name: `Px tick down · ${colId}`,
      enabled: true,
      priority: 9,
      scope: { type: 'cell', columns: [colId] },
      expression: downExpr,
      style: TICK_DOWN_STYLE,
      activeDurationMs: FI_PRICE_TICK_ACTIVE_MS,
      indicator: {
        icon: 'triangle-down-solid',
        color: '#b91c1c',
        target: 'cells',
        position: 'left-middle',
      },
      flash: {
        enabled: true,
        target: 'cells',
        mode: 'oneShot',
        color: 'rose',
        durationMs: 600,
      },
    });
  }

  return rules;
}

/** Default STOMP / positions blotter price paths (used when no column list is supplied). */
export const FI_DEFAULT_PRICE_COLUMN_IDS: readonly string[] = [
  'averagePrice',
  'currentPrice',
  'marketData.bidPrice',
  'marketData.midPrice',
  'marketData.askPrice',
  'marketData.lastTradePrice',
];
