import { describe, expect, it } from 'vitest';
import {
  buildFiPriceTickRules,
  FI_DEFAULT_PRICE_COLUMN_IDS,
  FI_PRICE_TICK_ACTIVE_MS,
} from './fiPriceTickRules.js';

describe('buildFiPriceTickRules', () => {
  it('creates up/down timed rules with diff expressions for price columns only', () => {
    const rules = buildFiPriceTickRules([
      'currentPrice',
      'cusip',
      'marketData.bidPrice',
    ]);
    expect(rules).toHaveLength(4);
    const up = rules.find((r) => r.id === 'fi-px-tick-up-currentPrice');
    const down = rules.find((r) => r.id === 'fi-px-tick-down-marketData-bidPrice');
    expect(up?.expression).toBe('[currentPrice.new] > [currentPrice.old]');
    expect(down?.expression).toBe('[marketData.bidPrice.new] < [marketData.bidPrice.old]');
    expect(up?.activeDurationMs).toBe(FI_PRICE_TICK_ACTIVE_MS);
    expect(up?.indicator?.icon).toBe('triangle-up-solid');
    expect(up?.indicator?.position).toBe('left-middle');
    expect(down?.indicator?.icon).toBe('triangle-down-solid');
    expect(down?.indicator?.position).toBe('left-middle');
    expect(rules.some((r) => r.id.includes('cusip'))).toBe(false);
  });

  it('default price column ids are classified as price', () => {
    const rules = buildFiPriceTickRules(FI_DEFAULT_PRICE_COLUMN_IDS);
    expect(rules.length).toBe(FI_DEFAULT_PRICE_COLUMN_IDS.length * 2);
  });
});
