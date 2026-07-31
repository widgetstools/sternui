import { describe, expect, it } from 'vitest';
import {
  buildStressColumnDefs,
  STRESS_COL_COUNT,
  STRESS_ROW_COUNT,
} from './stressColumns';

describe('buildStressColumnDefs', () => {
  it(`returns exactly ${STRESS_COL_COUNT} columns`, () => {
    const cols = buildStressColumnDefs();
    expect(cols).toHaveLength(STRESS_COL_COUNT);
  });

  it('leads with real FI fields then synthetic sNNN series', () => {
    const cols = buildStressColumnDefs();
    expect(cols[0]?.field ?? cols[0]?.colId).toBe('cusip');
    expect(cols.some((c) => c.field === 'assetClass')).toBe(true);
    const synth = cols.filter((c) => String(c.colId ?? '').startsWith('s'));
    expect(synth.length).toBeGreaterThan(300);
    expect(synth[0]?.valueGetter).toBeTypeOf('function');
  });

  it('exposes the documented stress book size', () => {
    expect(STRESS_ROW_COUNT).toBe(50_000);
  });
});
