import { describe, expect, it } from 'vitest';
import { PreviousValuesStore } from './previousValuesStore.js';

describe('PreviousValuesStore', () => {
  it('diffAndUpdate exposes old vs new for changed fields', () => {
    const s = new PreviousValuesStore();
    s.remember('r1', { price: 100 });
    const d = s.diffAndUpdate('r1', { price: 105, qty: 1 });
    expect(d.get('price')).toEqual({ oldValue: 100, newValue: 105 });
    // second call: old is previous new
    const d2 = s.diffAndUpdate('r1', { price: 110 });
    expect(d2.get('price')).toEqual({ oldValue: 105, newValue: 110 });
  });

  it('forget drops row', () => {
    const s = new PreviousValuesStore();
    s.remember('r1', { price: 1 });
    s.forget('r1');
    const d = s.diffAndUpdate('r1', { price: 2 });
    expect(d.get('price')?.oldValue).toBeUndefined();
  });
});
