import { describe, expect, it } from 'vitest';
import { agFilterModelToPerspective } from '../../pull/agFilterToPerspective.js';

describe('agFilterModelToPerspective', () => {
  it('returns no clauses for a null/empty model', () => {
    expect(agFilterModelToPerspective(null)).toEqual({ filters: [], unsupported: [] });
    expect(agFilterModelToPerspective({})).toEqual({ filters: [], unsupported: [] });
  });

  it('maps text operators', () => {
    const { filters, unsupported } = agFilterModelToPerspective({
      a: { filterType: 'text', type: 'equals', filter: 'x' },
      b: { filterType: 'text', type: 'notEqual', filter: 'y' },
      c: { filterType: 'text', type: 'contains', filter: 'z' },
      d: { filterType: 'text', type: 'startsWith', filter: 'p' },
      e: { filterType: 'text', type: 'endsWith', filter: 'q' },
    });
    expect(filters).toEqual([
      ['a', '==', 'x'],
      ['b', '!=', 'y'],
      ['c', 'contains', 'z'],
      ['d', 'begins with', 'p'],
      ['e', 'ends with', 'q'],
    ]);
    expect(unsupported).toEqual([]);
  });

  it('maps number operators including inRange as two clauses', () => {
    const { filters } = agFilterModelToPerspective({
      px: { filterType: 'number', type: 'greaterThan', filter: 5 },
      qty: { filterType: 'number', type: 'lessThanOrEqual', filter: 10 },
      mv: { filterType: 'number', type: 'inRange', filter: 1, filterTo: 9 },
    });
    expect(filters).toEqual([
      ['px', '>', 5],
      ['qty', '<=', 10],
      ['mv', '>=', 1],
      ['mv', '<=', 9],
    ]);
  });

  it('maps blank / notBlank to null checks', () => {
    const { filters } = agFilterModelToPerspective({
      a: { filterType: 'text', type: 'blank' },
      b: { filterType: 'text', type: 'notBlank' },
    });
    expect(filters).toEqual([
      ['a', 'is null', null],
      ['b', 'is not null', null],
    ]);
  });

  it('maps set filters to `in`', () => {
    const { filters } = agFilterModelToPerspective({
      desk: { filterType: 'set', values: ['Rates', 'Credit'] },
    });
    expect(filters).toEqual([['desk', 'in', ['Rates', 'Credit']]]);
  });

  it('flattens AND-combined conditions', () => {
    const { filters, unsupported } = agFilterModelToPerspective({
      px: {
        filterType: 'number',
        operator: 'AND',
        conditions: [
          { filterType: 'number', type: 'greaterThan', filter: 1 },
          { filterType: 'number', type: 'lessThan', filter: 9 },
        ],
      },
    });
    expect(filters).toEqual([
      ['px', '>', 1],
      ['px', '<', 9],
    ]);
    expect(unsupported).toEqual([]);
  });

  it('reports OR-combined conditions as unsupported (P4)', () => {
    const { filters, unsupported } = agFilterModelToPerspective({
      px: {
        filterType: 'number',
        operator: 'OR',
        conditions: [
          { filterType: 'number', type: 'equals', filter: 1 },
          { filterType: 'number', type: 'equals', filter: 2 },
        ],
      },
    });
    expect(filters).toEqual([]);
    expect(unsupported).toEqual(['px: OR-combined conditions']);
  });

  it('reports unknown operators and filter types, never guesses', () => {
    const { filters, unsupported } = agFilterModelToPerspective({
      a: { filterType: 'text', type: 'notContains', filter: 'x' },
      b: { filterType: 'date', type: 'equals', dateFrom: '2026-01-01' },
    });
    expect(filters).toEqual([]);
    expect(unsupported).toEqual(['a: notContains', "b: filterType 'date'"]);
  });
});
