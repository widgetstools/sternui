import { describe, expect, it } from 'vitest';
import { agFilterModelToPerspective } from '../../pull/agFilterToPerspective.js';
import { filterExprName } from '../../pull/filterExpressions.js';

describe('agFilterModelToPerspective', () => {
  it('returns no clauses for a null/empty model', () => {
    expect(agFilterModelToPerspective(null)).toEqual({
      filters: [],
      expressions: {},
      unsupported: [],
    });
    expect(agFilterModelToPerspective({})).toEqual({
      filters: [],
      expressions: {},
      unsupported: [],
    });
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

  // ─── P4a: OR-combined conditions → per-column boolean expression ──

  it('maps OR-combined number conditions to one boolean expression column', () => {
    const { filters, expressions, unsupported } = agFilterModelToPerspective({
      px: {
        filterType: 'number',
        operator: 'OR',
        conditions: [
          { filterType: 'number', type: 'equals', filter: 1 },
          { filterType: 'number', type: 'greaterThan', filter: 100 },
        ],
      },
    });
    const name = filterExprName('px');
    expect(expressions).toEqual({ [name]: '"px" == 1 or "px" > 100' });
    expect(filters).toEqual([[name, '==', true]]);
    expect(unsupported).toEqual([]);
  });

  it('maps OR-combined text conditions (contains is case-insensitive regex match)', () => {
    const { filters, expressions } = agFilterModelToPerspective({
      trader: {
        filterType: 'text',
        operator: 'OR',
        conditions: [
          { filterType: 'text', type: 'contains', filter: 'Amy' },
          { filterType: 'text', type: 'startsWith', filter: 'B.' },
        ],
      },
    });
    const name = filterExprName('trader');
    expect(expressions).toEqual({
      [name]: `match(lower("trader"), 'amy') or match(lower("trader"), '^b\\\\.')`,
    });
    expect(filters).toEqual([[name, '==', true]]);
  });

  it('keeps cross-column AND semantics alongside a per-column OR', () => {
    const { filters, expressions } = agFilterModelToPerspective({
      px: {
        filterType: 'number',
        operator: 'OR',
        conditions: [
          { filterType: 'number', type: 'lessThan', filter: 0 },
          { filterType: 'number', type: 'greaterThan', filter: 10 },
        ],
      },
      desk: { filterType: 'text', type: 'equals', filter: 'Rates' },
    });
    expect(filters).toEqual([
      [filterExprName('px'), '==', true],
      ['desk', '==', 'Rates'],
    ]);
    expect(Object.keys(expressions)).toEqual([filterExprName('px')]);
  });

  it('rejects the WHOLE OR when any branch is inexpressible (never a partial OR)', () => {
    const { filters, expressions, unsupported } = agFilterModelToPerspective({
      px: {
        filterType: 'number',
        operator: 'OR',
        conditions: [
          { filterType: 'number', type: 'equals', filter: 1 },
          { filterType: 'number', type: 'bogusOp', filter: 2 },
        ],
      },
    });
    expect(filters).toEqual([]);
    expect(expressions).toEqual({});
    expect(unsupported).toEqual(['px: OR-combined number bogusOp']);
  });

  // ─── P4a: notContains ─────────────────────────────────────────────

  it('maps notContains to a null-safe negated match expression', () => {
    const { filters, expressions, unsupported } = agFilterModelToPerspective({
      trader: { filterType: 'text', type: 'notContains', filter: 'aMy' },
    });
    const name = filterExprName('trader');
    expect(expressions).toEqual({
      [name]: `(is_null("trader") or not(match(lower("trader"), 'amy')))`,
    });
    expect(filters).toEqual([[name, '==', true]]);
    expect(unsupported).toEqual([]);
  });

  it('regex-escapes needles in expression matches', () => {
    const { expressions } = agFilterModelToPerspective({
      s: { filterType: 'text', type: 'notContains', filter: 'a.b(c)' },
    });
    expect(expressions[filterExprName('s')]).toBe(
      `(is_null("s") or not(match(lower("s"), 'a\\\\.b\\\\(c\\\\)')))`,
    );
  });

  // ─── P4a: date filters ────────────────────────────────────────────

  it('maps date equals/before/after with date-only normalized terms', () => {
    const { filters, unsupported } = agFilterModelToPerspective({
      a: { filterType: 'date', type: 'equals', dateFrom: '2026-07-02 00:00:00', dateTo: null },
      b: { filterType: 'date', type: 'lessThan', dateFrom: '2026-07-02 00:00:00', dateTo: null },
      c: { filterType: 'date', type: 'greaterThan', dateFrom: '2026-01-15', dateTo: null },
      d: { filterType: 'date', type: 'notEqual', dateFrom: '2026-01-15', dateTo: null },
    });
    expect(filters).toEqual([
      ['a', '==', '2026-07-02'],
      ['b', '<', '2026-07-02'],
      ['c', '>', '2026-01-15'],
      ['d', '!=', '2026-01-15'],
    ]);
    expect(unsupported).toEqual([]);
  });

  it('maps date inRange to an inclusive clause pair', () => {
    const { filters } = agFilterModelToPerspective({
      ts: {
        filterType: 'date',
        type: 'inRange',
        dateFrom: '2026-07-01 00:00:00',
        dateTo: '2026-07-04 00:00:00',
      },
    });
    expect(filters).toEqual([
      ['ts', '>=', '2026-07-01'],
      ['ts', '<=', '2026-07-04'],
    ]);
  });

  it('maps date blank / notBlank', () => {
    const { filters } = agFilterModelToPerspective({
      a: { filterType: 'date', type: 'blank', dateFrom: null, dateTo: null },
      b: { filterType: 'date', type: 'notBlank', dateFrom: null, dateTo: null },
    });
    expect(filters).toEqual([
      ['a', 'is null', null],
      ['b', 'is not null', null],
    ]);
  });

  it('rejects sub-day date terms loudly (date-only supported)', () => {
    const { filters, unsupported } = agFilterModelToPerspective({
      ts: { filterType: 'date', type: 'equals', dateFrom: '2026-07-02 10:30:00', dateTo: null },
    });
    expect(filters).toEqual([]);
    expect(unsupported).toEqual([
      "ts: date equals '2026-07-02 10:30:00' (date-only terms supported)",
    ]);
  });

  it('maps AND-combined date conditions natively', () => {
    const { filters } = agFilterModelToPerspective({
      ts: {
        filterType: 'date',
        operator: 'AND',
        conditions: [
          { filterType: 'date', type: 'greaterThan', dateFrom: '2026-07-01', dateTo: null },
          { filterType: 'date', type: 'lessThan', dateFrom: '2026-07-31', dateTo: null },
        ],
      },
    });
    expect(filters).toEqual([
      ['ts', '>', '2026-07-01'],
      ['ts', '<', '2026-07-31'],
    ]);
  });

  it('maps OR-combined date conditions via date() expression terms', () => {
    const { filters, expressions } = agFilterModelToPerspective({
      ts: {
        filterType: 'date',
        operator: 'OR',
        conditions: [
          { filterType: 'date', type: 'equals', dateFrom: '2026-07-02 00:00:00', dateTo: null },
          { filterType: 'date', type: 'equals', dateFrom: '2026-07-05', dateTo: null },
        ],
      },
    });
    const name = filterExprName('ts');
    expect(expressions).toEqual({
      [name]: '"ts" == date(2026, 7, 2) or "ts" == date(2026, 7, 5)',
    });
    expect(filters).toEqual([[name, '==', true]]);
  });

  // ─── P4a: set-with-null fallback ──────────────────────────────────

  it('maps a set selection including null through a type-safe expression', () => {
    const { filters, expressions } = agFilterModelToPerspective({
      desk: { filterType: 'set', values: ['Rates', null] },
    });
    const name = filterExprName('desk');
    expect(expressions).toEqual({
      [name]: `is_null("desk") or string("desk") == 'Rates'`,
    });
    expect(filters).toEqual([[name, '==', true]]);
  });

  it('reports unknown operators and filter types, never guesses', () => {
    const { filters, unsupported } = agFilterModelToPerspective({
      a: { filterType: 'text', type: 'wildcards', filter: 'x*' },
      b: { filterType: 'multi', filterModels: [] },
    });
    expect(filters).toEqual([]);
    expect(unsupported).toEqual(['a: wildcards', "b: filterType 'multi'"]);
  });
});
