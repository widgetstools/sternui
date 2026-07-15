import { describe, it, expect } from 'vitest';
import { createSsrmRowFlattener, collectSsrmFlattenPaths } from './ssrmRowFlatten';
import type { ColumnDefinition } from '@starui/types';

const col = (field: string): ColumnDefinition => ({ field, headerName: field });

describe('collectSsrmFlattenPaths', () => {
  it('unions column fields with the keyColumn and keeps nested leaf paths', () => {
    expect(
      collectSsrmFlattenPaths([col('risk'), col('risk.dv01')], 'id').sort(),
    ).toEqual(['id', 'risk', 'risk.dv01']);
  });
});

describe('createSsrmRowFlattener', () => {
  it('returns null when there are no paths', () => {
    expect(createSsrmRowFlattener(undefined, undefined)).toBeNull();
    expect(createSsrmRowFlattener([], undefined)).toBeNull();
  });

  it('lifts dotted paths to literal flat keys', () => {
    const flatten = createSsrmRowFlattener(
      [col('cusip'), col('rating.moody'), col('rating.sp')],
      'positionId',
    )!;
    expect(
      flatten({
        positionId: 'p1',
        cusip: '912828',
        rating: { moody: 'Aa', sp: 'AA', junk: true },
        extra: { deep: 1 },
      }),
    ).toEqual({
      positionId: 'p1',
      cusip: '912828',
      'rating.moody': 'Aa',
      'rating.sp': 'AA',
    });
  });

  it('skips object/array leaves', () => {
    const flatten = createSsrmRowFlattener([col('spark'), col('name')], 'id')!;
    expect(flatten({ id: '1', name: 'x', spark: [1, 2, 3] })).toEqual({
      id: '1',
      name: 'x',
    });
  });

  it('honours literal flat key before dot-walk', () => {
    const flatten = createSsrmRowFlattener([col('a.b')], 'id')!;
    expect(flatten({ id: '1', 'a.b': 9, a: { b: 1 } })).toEqual({
      id: '1',
      'a.b': 9,
    });
  });
});
