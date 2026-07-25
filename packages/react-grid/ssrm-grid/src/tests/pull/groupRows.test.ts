import { describe, expect, it } from 'vitest';
import type { GetRowIdParams } from 'ag-grid-community';
import {
  CHILD_COUNT_FIELD,
  GROUP_ID_FIELD,
  GROUP_KEY_FIELD,
  createSsrmRowIdGetter,
  encodeGroupRowId,
  getSsrmServerSideGroupKey,
  isSsrmServerSideGroup,
  toGroupRowData,
} from '../../pull/groupRows.js';

describe('encodeGroupRowId', () => {
  it('encodes the full group path, order-sensitively', () => {
    expect(encodeGroupRowId(['Rates'])).toBe('ssrm-group:["Rates"]');
    expect(encodeGroupRowId(['Rates', 'T-1'])).toBe('ssrm-group:["Rates","T-1"]');
    expect(encodeGroupRowId(['T-1', 'Rates'])).not.toBe(encodeGroupRowId(['Rates', 'T-1']));
  });

  it('is stable for non-string and null labels', () => {
    expect(encodeGroupRowId([42])).toBe(encodeGroupRowId(['42']));
    expect(encodeGroupRowId([null])).toBe('ssrm-group:[null]');
  });
});

describe('toGroupRowData', () => {
  const group = { field: 'desk', valueFields: ['pnl', 'mv'] };

  it('materializes label, aggregates, child count and path id', () => {
    const rows = toGroupRowData(
      [{ __ROW_PATH__: ['Rates'], pnl: 100, mv: 5.5, desk: 'Rates', positionId: 42 }],
      group,
      [],
      'positionId',
    );
    expect(rows).toEqual([
      {
        desk: 'Rates',
        pnl: 100,
        mv: 5.5,
        [CHILD_COUNT_FIELD]: 42,
        [GROUP_ID_FIELD]: encodeGroupRowId(['Rates']),
        [GROUP_KEY_FIELD]: 'Rates',
      },
    ]);
  });

  it('prefixes the route into the path id (nested levels collide-free)', () => {
    const rows = toGroupRowData(
      [{ __ROW_PATH__: ['T-1'], pnl: 1, mv: 2, positionId: 3 }],
      { field: 'trader', valueFields: ['pnl', 'mv'] },
      ['Rates'],
      'positionId',
    );
    expect(rows[0]![GROUP_ID_FIELD]).toBe(encodeGroupRowId(['Rates', 'T-1']));
  });

  it('omits the child count when the key column doubles as a value column', () => {
    const rows = toGroupRowData([{ __ROW_PATH__: ['Rates'], pnl: 1, mv: 2 }], group, [], null);
    expect(CHILD_COUNT_FIELD in rows[0]!).toBe(false);
  });

  it('keeps a null group label (rows with no value in the group column)', () => {
    const rows = toGroupRowData(
      [{ __ROW_PATH__: [null], pnl: 7, mv: 1, positionId: 2 }],
      group,
      [],
      'positionId',
    );
    expect(rows[0]!.desk).toBeNull();
    expect(rows[0]![GROUP_ID_FIELD]).toBe(encodeGroupRowId([null]));
    expect(rows[0]![GROUP_KEY_FIELD]).toBeNull();
  });

  it('stamps the own group key as a string (numeric labels stringify)', () => {
    const rows = toGroupRowData(
      [{ __ROW_PATH__: [42], pnl: 1, mv: 2, positionId: 3 }],
      group,
      ['Rates'],
      'positionId',
    );
    expect(rows[0]![GROUP_KEY_FIELD]).toBe('42');
  });
});

// ─── AG 36 serverSide tree-data contract (P4b-2) ─────────────────────

describe('isSsrmServerSideGroup / getSsrmServerSideGroupKey', () => {
  const groupRow = toGroupRowData(
    [{ __ROW_PATH__: ['BOOKA'], pnl: 1, bookName: 'BOOKA', positionId: 5 }],
    { field: 'bookName', valueFields: ['pnl'] },
    [],
    'positionId',
  )[0]!;

  it('group rows expand; their key is the stamped label', () => {
    expect(isSsrmServerSideGroup(groupRow)).toBe(true);
    expect(getSsrmServerSideGroupKey(groupRow)).toBe('BOOKA');
  });

  it('leaf rows and malformed data never expand', () => {
    expect(isSsrmServerSideGroup({ positionId: 'POS1', pnl: 3 })).toBe(false);
    expect(isSsrmServerSideGroup(undefined)).toBe(false);
    expect(isSsrmServerSideGroup(null)).toBe(false);
    expect(getSsrmServerSideGroupKey({ positionId: 'POS1' })).toBe('');
  });
});

describe('createSsrmRowIdGetter', () => {
  const getRowId = createSsrmRowIdGetter('positionId');

  it('keys group rows on the stamped path id', () => {
    const id = getRowId({
      data: { desk: 'Rates', [GROUP_ID_FIELD]: encodeGroupRowId(['Rates']) },
    } as unknown as GetRowIdParams);
    expect(id).toBe(encodeGroupRowId(['Rates']));
  });

  it('keys leaf rows on the key column', () => {
    const id = getRowId({ data: { positionId: 'POS7' } } as unknown as GetRowIdParams);
    expect(id).toBe('POS7');
  });
});
