import { describe, it, expect } from 'vitest';
import { shapeRows } from './shaping.js';

describe('shapeRows', () => {
  it('bakes a calc column as a real field without mutating the input', () => {
    const rows = [
      { id: 1, a: 10, b: 5 },
      { id: 2, a: 3, b: 7 },
    ];
    const out = shapeRows(
      rows,
      { calcColumns: [{ field: 'sum', expression: '[a] + [b]' }] },
      rows,
    ) as Array<Record<string, unknown>>;

    expect(out.map((r) => r.sum)).toEqual([15, 10]);
    // Originals untouched.
    expect(rows[0]).toEqual({ id: 1, a: 10, b: 5 });
  });

  it('returns the block unchanged when there are no calc columns', () => {
    const rows = [{ id: 1 }];
    expect(shapeRows(rows, {}, rows)).toEqual(rows);
  });

  it('falls back to null for an unparseable expression, not a throw', () => {
    const rows = [{ a: 1 }];
    const out = shapeRows(
      rows,
      { calcColumns: [{ field: 'bad', expression: '[a] +' }] },
      rows,
    ) as Array<Record<string, unknown>>;
    expect(out[0].bad).toBeNull();
  });

  it('supports dataset-wide aggregate expressions via allRows', () => {
    const rows = [{ v: 2 }, { v: 8 }];
    const out = shapeRows(
      rows,
      { calcColumns: [{ field: 'pct', expression: '[v] / SUM([v]) * 100' }] },
      rows,
    ) as Array<Record<string, unknown>>;
    expect(out.map((r) => r.pct)).toEqual([20, 80]);
  });
});
