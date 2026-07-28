import { describe, expect, it } from 'vitest';
import {
  observeRows,
  toPerspectiveSchema,
  toPerspectiveSchemaFromFields,
  validateIndexColumn,
  type ColumnObservation,
} from './perspectiveSchema.js';

const derive = (rows: readonly unknown[], options?: Parameters<typeof toPerspectiveSchema>[1]) =>
  toPerspectiveSchema(observeRows(rows), options);

describe('observeRows', () => {
  it('counts kinds per column and folds later batches in', () => {
    const acc = observeRows([{ a: 1, b: 'x' }]);
    observeRows([{ a: 2.5, b: null }], acc);

    expect(acc.get('a')).toMatchObject({ seen: 2, integers: 1, floats: 1 });
    expect(acc.get('b')).toMatchObject({ seen: 2, strings: 1, nulls: 1 });
  });

  it('counts per column, not per row, so sparse deltas do not look like gaps', () => {
    // Live frames carry positionId plus only the fields that moved.
    const acc = observeRows([{ positionId: 'p1', pnl: 10, spread: 3 }]);
    observeRows([{ positionId: 'p2', pnl: 20 }], acc);

    expect(acc.get('positionId')!.seen).toBe(2);
    expect(acc.get('spread')!.seen).toBe(1);
  });

  it('ignores non-object rows rather than throwing', () => {
    expect(observeRows([null, 42, 'x', { a: 1 }]).size).toBe(1);
  });
});

describe('toPerspectiveSchema — numeric types', () => {
  // THE measured rule. Scanning all 20,000 rows of the real feed, `totalValue`
  // was integral in exactly one row and fractional in 19,999. A sampler that
  // saw that row would type it `integer` and truncate the other 19,999 — with
  // no error, in every window, forever.
  it('types a column float even when almost every observed value is integral', () => {
    const rows = [{ totalValue: 4111003 }, ...Array.from({ length: 99 }, () => ({ totalValue: 1.5 }))];
    expect(derive(rows).schema.totalValue).toBe('float');
  });

  it('types a fully integral column float too — float is lossless, integer is not', () => {
    // An IEEE double holds every integer to 2^53 exactly, so `float` costs
    // nothing here; `integer` would truncate the first fraction that arrives.
    const result = derive([{ quantity: 6051 }, { quantity: 900 }]);
    expect(result.schema.quantity).toBe('float');
    expect(result.integral).toContain('quantity');
  });

  it('uses integer only when the caller opts in explicitly', () => {
    const result = derive([{ couponFrequency: 2 }], { integerColumns: ['couponFrequency'] });
    expect(result.schema.couponFrequency).toBe('integer');
  });
});

describe('toPerspectiveSchema — dates', () => {
  it('maps ISO datetimes and ISO dates onto datetime and date', () => {
    const { schema } = derive([
      { asOfDate: '2026-07-28T15:19:04.586Z', maturityDate: '2048-10-28' },
    ]);
    // Typing these `string` would lose server-side date sorting and range
    // filters, which the pull path can no longer do client-side.
    expect(schema.asOfDate).toBe('datetime');
    expect(schema.maturityDate).toBe('date');
  });

  it('widens a column carrying both to datetime, since a datetime holds a date', () => {
    const { schema } = derive([{ d: '2024-01-01' }, { d: '2024-01-02T10:00:00Z' }]);
    expect(schema.d).toBe('datetime');
  });

  it('leaves them as strings when date inference is off', () => {
    const { schema } = derive([{ d: '2024-01-01' }], { inferDates: false });
    expect(schema.d).toBe('string');
  });

  it('does not mistake an ordinary string for a date', () => {
    expect(derive([{ cusip: 'TEPZB487S' }]).schema.cusip).toBe('string');
  });
});

describe('toPerspectiveSchema — the awkward columns', () => {
  it('drops nested columns, because Perspective is flat', () => {
    // Including one would coerce every row to null rather than error.
    const result = derive([{ id: 'p1', analytics: { dv01: 3 }, tags: ['a'] }]);
    expect(result.nested.sort()).toEqual(['analytics', 'tags']);
    expect(result.schema).not.toHaveProperty('analytics');
    expect(result.schema).not.toHaveProperty('tags');
    expect(result.schema.id).toBe('string');
  });

  it('drops a column that is nested in only ONE row', () => {
    const result = derive([{ a: 1 }, { a: 1 }, { a: { nope: true } }]);
    expect(result.nested).toEqual(['a']);
  });

  it('types disagreeing kinds as string, the only type that keeps every value', () => {
    // A string landing in a float column becomes null.
    const result = derive([{ v: 1 }, { v: 'n/a' }]);
    expect(result.schema.v).toBe('string');
    expect(result.mixed).toEqual([{ column: 'v', kinds: ['number', 'string'] }]);
  });

  it('types an all-null column string and reports it as unknown', () => {
    const result = derive([{ maybe: null }, { maybe: null }]);
    expect(result.schema.maybe).toBe('string');
    expect(result.unknown).toEqual(['maybe']);
  });

  it('does not treat nulls alone as disagreement', () => {
    const result = derive([{ pnl: 1.5 }, { pnl: null }]);
    expect(result.schema.pnl).toBe('float');
    expect(result.mixed).toEqual([]);
  });
});

describe('validateIndexColumn', () => {
  const observations = (rows: readonly unknown[]) => observeRows(rows);

  it('accepts a complete string key', () => {
    const rows = [{ positionId: 'p1' }, { positionId: 'p2' }];
    const { schema } = derive(rows);
    expect(validateIndexColumn(schema, 'positionId', observations(rows), 2)).toBeNull();
  });

  it('rejects a column that is not in the schema', () => {
    const { schema } = derive([{ a: 1 }]);
    expect(validateIndexColumn(schema, 'positionId', observations([{ a: 1 }]))).toMatch(
      /not in the schema/,
    );
  });

  it('rejects a null key — the index is what makes update() an upsert', () => {
    const rows = [{ positionId: 'p1' }, { positionId: null }];
    const { schema } = derive(rows);
    expect(validateIndexColumn(schema, 'positionId', observations(rows))).toMatch(/null in 1/);
  });

  it('rejects a key missing from some rows', () => {
    const rows = [{ positionId: 'p1', v: 1 }, { v: 2 }];
    const { schema } = derive(rows);
    expect(validateIndexColumn(schema, 'positionId', observations(rows), 2)).toMatch(
      /missing from 1/,
    );
  });

  it('rejects a non-scalar key type', () => {
    const rows = [{ when: '2024-01-01' }];
    const { schema } = derive(rows);
    expect(validateIndexColumn(schema, 'when', observations(rows))).toMatch(/must be a scalar/);
  });
});

describe('toPerspectiveSchema — the real feed', () => {
  it('reproduces the measured 52-column shape without a single integer column', () => {
    // A row shaped like the STOMP view server's, including the columns whose
    // integral-looking values triggered this whole rule.
    const row = {
      positionId: 'POS-6a00e700-9b16100',
      cusip: 'TEPZB487S',
      asOfDate: '2026-07-28T15:19:04.586Z',
      maturityDate: '2048-10-28',
      quantity: 6051,
      notionalAmount: 4215482,
      totalValue: 4111003, // integral here, fractional in 19,999 other rows
      currentPrice: 92.8594,
      pnl: -64044,
      couponFrequency: 2,
      dv01: 3757.03,
    };
    const result = derive([row]);

    expect(Object.values(result.schema)).not.toContain('integer');
    expect(result.schema.totalValue).toBe('float');
    expect(result.schema.pnl).toBe('float');
    expect(result.schema.positionId).toBe('string');
    expect(result.schema.asOfDate).toBe('datetime');
    expect(result.schema.maturityDate).toBe('date');
    expect(result.nested).toEqual([]);
    expect(validateIndexColumn(result.schema, 'positionId', observeRows([row]), 1)).toBeNull();
  });

  it('survives a sparse delta folded in after the snapshot', () => {
    const acc = observeRows([{ positionId: 'p1', pnl: -64044, currentPrice: 92.8594 }]);
    // Sparse frames carry positionId plus ~4 of 52 fields.
    observeRows([{ positionId: 'p1', pnl: 12 }], acc);
    const result = toPerspectiveSchema(acc);

    expect(result.schema.pnl).toBe('float');
    expect(result.mixed).toEqual([]);
    expect(result.unknown).toEqual([]);
  });
});

describe('ColumnObservation', () => {
  it('is a plain accumulator callers can build themselves', () => {
    const o: ColumnObservation = {
      seen: 3,
      nulls: 0,
      integers: 3,
      floats: 0,
      booleans: 0,
      strings: 0,
      isoDates: 0,
      isoDateTimes: 0,
      nested: 0,
    };
    const { schema, integral } = toPerspectiveSchema(new Map([['n', o]]));
    expect(schema.n).toBe('float');
    expect(integral).toEqual(['n']);
  });
});

describe('toPerspectiveSchemaFromFields', () => {
  // THE reason this exists: deriving a schema from observed rows means the
  // Table cannot exist until the snapshot lands (~18s on the measured feed),
  // and until it exists a window has nothing to open, so the blotter sits
  // blank. A provider row already declares its columns.
  it('builds a schema with no rows at all', () => {
    const { schema } = toPerspectiveSchemaFromFields([
      { path: 'positionId', type: 'string' },
      { path: 'quantity', type: 'number' },
      { path: 'settled', type: 'boolean' },
    ]);
    expect(schema).toEqual({ positionId: 'string', quantity: 'float', settled: 'boolean' });
  });

  it('accepts ColumnDefinition shape as well as FieldInfo', () => {
    const { schema } = toPerspectiveSchemaFromFields([
      { field: 'cusip', cellDataType: 'text' },
      { field: 'pnl', cellDataType: 'number' },
    ]);
    expect(schema).toEqual({ cusip: 'string', pnl: 'float' });
  });

  it('keeps numeric columns float, exactly as the observed path does', () => {
    const { schema } = toPerspectiveSchemaFromFields([{ path: 'totalValue', type: 'number' }]);
    expect(schema.totalValue).toBe('float');
  });

  it('honours an explicit integer opt-in', () => {
    const { schema } = toPerspectiveSchemaFromFields([{ path: 'couponFrequency', type: 'number' }], {
      integerColumns: ['couponFrequency'],
    });
    expect(schema.couponFrequency).toBe('integer');
  });

  it('maps a declared date to datetime, which holds both', () => {
    // The declaration says "date-like" but not which; `date` would truncate a
    // timestamp, `datetime` carries a plain date fine.
    const { schema } = toPerspectiveSchemaFromFields([{ path: 'asOfDate', type: 'date' }]);
    expect(schema.asOfDate).toBe('datetime');
  });

  it('leaves declared dates as text when inference is off', () => {
    const { schema } = toPerspectiveSchemaFromFields([{ path: 'asOfDate', type: 'date' }], {
      inferDates: false,
    });
    expect(schema.asOfDate).toBe('string');
  });

  it('drops nested columns, since Perspective is flat', () => {
    const result = toPerspectiveSchemaFromFields([
      { path: 'id', type: 'string' },
      { path: 'analytics', type: 'object' },
      { path: 'legs', type: 'array' },
      { path: 'nestedByChildren', children: { a: {} } },
    ]);
    expect(result.nested.sort()).toEqual(['analytics', 'legs', 'nestedByChildren']);
    expect(Object.keys(result.schema)).toEqual(['id']);
  });

  it('skips dotted paths — a flattened nested value is not a top-level column', () => {
    const { schema } = toPerspectiveSchemaFromFields([
      { path: 'id', type: 'string' },
      { path: 'analytics.dv01', type: 'number' },
    ]);
    expect(Object.keys(schema)).toEqual(['id']);
  });

  it('types an undeclared column string and reports it, rather than guessing', () => {
    const result = toPerspectiveSchemaFromFields([{ path: 'mystery' }]);
    expect(result.schema.mystery).toBe('string');
    expect(result.unknown).toEqual(['mystery']);
  });

  it('ignores entries with no column name at all', () => {
    expect(Object.keys(toPerspectiveSchemaFromFields([{ type: 'string' }]).schema)).toEqual([]);
  });

  it('produces an index-valid schema for the declared key column', () => {
    const { schema } = toPerspectiveSchemaFromFields([
      { path: 'positionId', type: 'string' },
      { path: 'pnl', type: 'number' },
    ]);
    // No observations exist yet, so the index check is schema-only here.
    expect(validateIndexColumn(schema, 'positionId', observeRows([{ positionId: 'p1' }]), 1)).toBeNull();
  });
});
