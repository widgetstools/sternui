import { describe, expect, it } from 'vitest';
import type { ColumnDefinition } from '@starui/types';
import {
  inferPerspectiveType,
  projectRowToSchema,
  refineSchemaFromRows,
  schemaFromColumnDefinitions,
} from './tableSchema.js';

const cols = (...defs: Array<Partial<ColumnDefinition> & { field: string }>): ColumnDefinition[] =>
  defs.map((d) => ({ headerName: d.field, ...d }) as ColumnDefinition);

describe('schemaFromColumnDefinitions', () => {
  it('maps cellDataType to perspective types and always includes the key column', () => {
    const schema = schemaFromColumnDefinitions(
      cols(
        { field: 'positionId', cellDataType: 'text' },
        { field: 'marketValue', cellDataType: 'number' },
        { field: 'isActive', cellDataType: 'boolean' },
        { field: 'asOfDate', cellDataType: 'date' },
        { field: 'maturityDate', cellDataType: 'dateString' },
      ),
      'positionId',
    );
    expect(schema).toEqual({
      positionId: 'string',
      marketValue: 'float',
      isActive: 'boolean',
      asOfDate: 'datetime',
      maturityDate: 'string',
    });
  });

  it('leaves untyped and object-typed columns open for row refinement', () => {
    const schema = schemaFromColumnDefinitions(
      cols({ field: 'pnl' }, { field: 'blob', cellDataType: 'object' }),
      'id',
    );
    expect(schema).toEqual({ id: 'string' });
  });

  it('defaults the key column to string when the config omits it', () => {
    expect(schemaFromColumnDefinitions(undefined, 'positionId')).toEqual({
      positionId: 'string',
    });
  });
});

describe('inferPerspectiveType', () => {
  it('types primitives and refuses null/objects/NaN', () => {
    expect(inferPerspectiveType('x')).toBe('string');
    expect(inferPerspectiveType(1)).toBe('float');
    expect(inferPerspectiveType(1.5)).toBe('float');
    expect(inferPerspectiveType(true)).toBe('boolean');
    expect(inferPerspectiveType(null)).toBeUndefined();
    expect(inferPerspectiveType(undefined)).toBeUndefined();
    expect(inferPerspectiveType({ a: 1 })).toBeUndefined();
    expect(inferPerspectiveType(Number.NaN)).toBeUndefined();
  });
});

describe('refineSchemaFromRows', () => {
  it('types declared-but-untyped columns from the first rows', () => {
    const base = schemaFromColumnDefinitions(
      cols({ field: 'positionId', cellDataType: 'text' }, { field: 'pnl' }),
      'positionId',
    );
    const { schema, addedFields } = refineSchemaFromRows(
      base,
      ['positionId', 'pnl'],
      [{ positionId: 'a', pnl: null }, { positionId: 'b', pnl: 12.5 }],
    );
    expect(schema.pnl).toBe('float');
    expect(addedFields).toEqual(['pnl']);
  });

  it('does NOT widen the table beyond declared columns', () => {
    const base = schemaFromColumnDefinitions(cols({ field: 'id', cellDataType: 'text' }), 'id');
    const { schema } = refineSchemaFromRows(base, ['id'], [{ id: 'a', surprise: 1 }]);
    expect(schema).toEqual({ id: 'string' });
  });

  it('with no declared columns, the sample defines the schema', () => {
    const base = schemaFromColumnDefinitions(undefined, 'id');
    const { schema } = refineSchemaFromRows(
      base,
      [],
      [{ id: 'a', px: 101.5, live: true, note: 'x', nested: { drop: 1 } }],
    );
    expect(schema).toEqual({ id: 'string', px: 'float', live: 'boolean', note: 'string' });
  });

  it('declared columns that never sample a typable value fall back to string', () => {
    const base = schemaFromColumnDefinitions(cols({ field: 'id' }, { field: 'ghost' }), 'id');
    const { schema } = refineSchemaFromRows(base, ['id', 'ghost'], [{ id: 'a', ghost: null }]);
    expect(schema.ghost).toBe('string');
  });
});

describe('projectRowToSchema', () => {
  const schema = { id: 'string', px: 'float' } as const;

  it('drops fields the table does not carry', () => {
    expect(projectRowToSchema(schema, { id: 'a', px: 1, junk: 'x' })).toEqual({ id: 'a', px: 1 });
  });

  it('keeps absent fields absent (partial keyed update semantics)', () => {
    expect(projectRowToSchema(schema, { id: 'a' })).toEqual({ id: 'a' });
  });

  it('nulls non-primitive values instead of stringifying', () => {
    expect(projectRowToSchema(schema, { id: 'a', px: { bid: 1 } })).toEqual({ id: 'a', px: null });
  });
});
