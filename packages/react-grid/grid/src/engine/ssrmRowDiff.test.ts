import { describe, expect, it, beforeEach } from 'vitest';
import {
  clearSsrmRowDiffs,
  getSsrmRowDiff,
  recordSsrmTickDiffs,
  resolveSsrmTickRowId,
} from './ssrmRowDiff.js';

describe('ssrmRowDiff', () => {
  beforeEach(() => {
    clearSsrmRowDiffs();
  });

  it('resolveSsrmTickRowId prefers id then rowIdField', () => {
    expect(resolveSsrmTickRowId({ id: 'a', sym: 'MSFT' })).toBe('a');
    expect(resolveSsrmTickRowId({ sym: 'MSFT' }, 'sym')).toBe('MSFT');
  });

  it('recordSsrmTickDiffs stashes diffs readable via getSsrmRowDiff', () => {
    recordSsrmTickDiffs([{ id: 'r1', price: 100 }]);
    expect(getSsrmRowDiff('r1')).toBeUndefined();

    recordSsrmTickDiffs([{ id: 'r1', price: 105 }]);
    expect(getSsrmRowDiff('r1')?.get('price')).toEqual({ oldValue: 100, newValue: 105 });
  });
});
