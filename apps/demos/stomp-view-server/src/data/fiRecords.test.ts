import { describe, expect, it } from 'vitest';
import { buildSnapshot, slimRecord } from './fiRecords.js';
import { touchPosition, touchTrade } from './mutate.js';
import type { PositionRecord, TradeRecord } from './fiRecords.js';

describe('slim row profile', () => {
  it('slimRecord keeps top-level primitives and drops nested objects/arrays', () => {
    const slim = slimRecord({
      id: 'x',
      price: 101.5,
      active: true,
      note: null,
      nested: { a: 1 },
      list: [1, 2],
    });
    expect(slim).toEqual({ id: 'x', price: 101.5, active: true, note: null });
  });

  it('buildSnapshot slim rows keep keys and headline fields, lose nesting', () => {
    const [wide] = buildSnapshot('positions', 1, 7, 'wide') as PositionRecord[];
    const [slim] = buildSnapshot('positions', 1, 7, 'slim') as PositionRecord[];
    expect(slim!.positionId).toBe(wide!.positionId);
    expect(slim!.cusip).toBe(wide!.cusip);
    expect(typeof slim!.currentPrice).toBe('number');
    expect(Object.values(slim!).every((v) => v === null || typeof v !== 'object')).toBe(true);
    expect(JSON.stringify(slim).length).toBeLessThan(JSON.stringify(wide).length / 4);
  });

  it('touch mutations work on slim rows (in place, headline fields tick)', () => {
    const [pos] = buildSnapshot('positions', 1, 7, 'slim') as PositionRecord[];
    const before = pos!.currentPrice;
    expect(touchPosition(pos!)).toBe(pos);
    expect(pos!.currentPrice).not.toBe(before);

    const [trd] = buildSnapshot('trades', 1, 7, 'slim') as TradeRecord[];
    const priceBefore = trd!.price;
    expect(touchTrade(trd!)).toBe(trd);
    expect(trd!.price).not.toBe(priceBefore);
  });
});
