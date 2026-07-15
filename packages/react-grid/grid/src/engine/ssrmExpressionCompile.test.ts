import { describe, expect, it } from 'vitest';
import { compileStarUiExpressionToPerspective } from './ssrmExpressionCompile.js';

describe('ssrmExpressionCompile', () => {
  it('compiles arithmetic column refs', () => {
    const r = compileStarUiExpressionToPerspective('[price] * [quantity] / 1000');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.perspectiveExpression).toBe('"price" * "quantity" / 1000');
  });

  it('compiles traffic-light leaf IFS', () => {
    const r = compileStarUiExpressionToPerspective(
      'IFS([price] >= 105, 1, [price] >= 95, 2, 3)',
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.perspectiveExpression).toContain('?');
      expect(r.perspectiveExpression).toContain('"price"');
    }
  });

  it('rejects .old/.new for Perspective', () => {
    const r = compileStarUiExpressionToPerspective('[price.old] < [price.new]');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/viewport|\.old|\.new/i);
  });

  it('maps AND/OR/NOT and equality', () => {
    const r = compileStarUiExpressionToPerspective(
      'NOT([side] = "BUY" AND [qty] > 0 OR [side] = "SELL")',
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.perspectiveExpression).toContain('not(');
      expect(r.perspectiveExpression).toContain(' and ');
      expect(r.perspectiveExpression).toContain(' or ');
      expect(r.perspectiveExpression).toContain('==');
    }
  });

  it('compiles IF to Perspective ternary', () => {
    const r = compileStarUiExpressionToPerspective('IF([x] > 0, [x], 0)');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.perspectiveExpression).toBe('("x" > 0 ? "x" : 0)');
  });

  it('rejects unknown functions', () => {
    const r = compileStarUiExpressionToPerspective('SUM([price])');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/SUM|unsupported|function/i);
  });
});
