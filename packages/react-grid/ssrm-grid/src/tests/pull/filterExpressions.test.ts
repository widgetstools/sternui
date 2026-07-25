import { describe, expect, it } from 'vitest';
import {
  columnRef,
  conditionExpr,
  filterExprName,
  quickFilterExpr,
  regexNeedle,
  setWithNullExpr,
  stringLiteral,
} from '../../pull/filterExpressions.js';

describe('regexNeedle', () => {
  it('lowercases and escapes every regex metacharacter for the expression text', () => {
    // one escape level for the regex engine (`\.`), doubled for the
    // ExprTK string literal (`\\.`) — verified against the 3.8 engine
    expect(regexNeedle('A.b')).toBe('a\\\\.b');
    expect(regexNeedle('x(y)[z]{1}*+?|^$')).toBe(
      'x\\\\(y\\\\)\\\\[z\\\\]\\\\{1\\\\}\\\\*\\\\+\\\\?\\\\|\\\\^\\\\$',
    );
  });

  it("escapes single quotes ExprTK-style (it's → it\\'s)", () => {
    expect(regexNeedle("it's")).toBe("it\\'s");
  });
});

describe('stringLiteral / columnRef', () => {
  it('quotes strings and column references safely', () => {
    expect(stringLiteral("O'Neil")).toBe("'O\\'Neil'");
    expect(columnRef('pnl')).toBe('"pnl"');
  });
});

describe('conditionExpr', () => {
  it('renders comparison operators with typed terms', () => {
    expect(conditionExpr('px', 'equals', 5, null, 'number')).toBe('"px" == 5');
    expect(conditionExpr('px', 'greaterThan', 5, null, 'number')).toBe('"px" > 5');
    expect(conditionExpr('s', 'equals', 'x', null, 'text')).toBe(`"s" == 'x'`);
    expect(conditionExpr('px', 'inRange', 1, 9, 'number')).toBe('("px" >= 1 and "px" <= 9)');
  });

  it('renders null-safe text matches', () => {
    expect(conditionExpr('s', 'contains', 'A', null, 'text')).toBe(`match(lower("s"), 'a')`);
    expect(conditionExpr('s', 'notContains', 'A', null, 'text')).toBe(
      `(is_null("s") or not(match(lower("s"), 'a')))`,
    );
    expect(conditionExpr('s', 'startsWith', 'a', null, 'text')).toBe(`match(lower("s"), '^a')`);
    expect(conditionExpr('s', 'endsWith', 'a', null, 'text')).toBe(`match(lower("s"), 'a$')`);
    expect(conditionExpr('s', 'blank', null, null, 'text')).toBe('is_null("s")');
    expect(conditionExpr('s', 'notBlank', null, null, 'text')).toBe('not(is_null("s"))');
  });

  it('renders date terms through the date() constructor', () => {
    expect(conditionExpr('ts', 'equals', '2026-07-02 00:00:00', null, 'date')).toBe(
      '"ts" == date(2026, 7, 2)',
    );
    expect(conditionExpr('ts', 'inRange', '2026-07-01', '2026-07-04', 'date')).toBe(
      '("ts" >= date(2026, 7, 1) and "ts" <= date(2026, 7, 4))',
    );
  });

  it('returns null for inexpressible inputs (sub-day dates, unknown ops)', () => {
    expect(conditionExpr('ts', 'equals', '2026-07-02 10:30:00', null, 'date')).toBeNull();
    expect(conditionExpr('s', 'wildcards', 'x*', null, 'text')).toBeNull();
    expect(conditionExpr('s', 'contains', 42, null, 'text')).toBeNull();
  });
});

describe('setWithNullExpr', () => {
  it('ORs is_null with string()-cast equality per value', () => {
    expect(setWithNullExpr('desk', ['Rates', null, 'Credit'])).toBe(
      `is_null("desk") or string("desk") == 'Rates' or string("desk") == 'Credit'`,
    );
  });
});

describe('quickFilterExpr', () => {
  it('every token must match at least one configured column', () => {
    expect(quickFilterExpr('gov bond', ['a', 'b'])).toBe(
      `(match(lower("a"), 'gov') or match(lower("b"), 'gov')) and ` +
        `(match(lower("a"), 'bond') or match(lower("b"), 'bond'))`,
    );
  });

  it('single column needs no parens; empty inputs return null', () => {
    expect(quickFilterExpr('x', ['a'])).toBe(`match(lower("a"), 'x')`);
    expect(quickFilterExpr('   ', ['a'])).toBeNull();
    expect(quickFilterExpr('x', [])).toBeNull();
  });
});

describe('filterExprName', () => {
  it('is deterministic and reserved-prefixed', () => {
    expect(filterExprName('px')).toBe('__ssrm_f_px');
  });
});
