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
      expect(r.perspectiveExpression).toBe(
        'if("price" >= 105, 1, if("price" >= 95, 2, 3))',
      );
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
      expect(r.perspectiveExpression).toContain(' and ');
      expect(r.perspectiveExpression).toContain(' or ');
      expect(r.perspectiveExpression).toContain('==');
    }
  });

  /**
   * This asserted `not(` until 2026-07-30 and was green the whole time —
   * pinning a spelling the engine does not have. MEASURED against 4.5.2
   * (`perspective-grid/scripts/styleRuleProbe4.mjs`): `not(x)` aborts for
   * every argument type when it is the whole expression, and — the reason
   * this is not merely a broken column — evaluates SILENTLY WRONG when
   * nested, with `validate_expressions` reporting it as a clean `boolean`.
   */
  it('never emits not() — it does not exist in 4.5.2 and fails silently when nested', () => {
    const r = compileStarUiExpressionToPerspective('NOT([qty] > 10)');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.perspectiveExpression).not.toContain('not(');
      expect(r.perspectiveExpression).toBe('if("qty" > 10, false, true)');
      expect(r.perspectiveType).toBe('boolean');
    }
  });

  it('negates a nested NOT the same way', () => {
    const r = compileStarUiExpressionToPerspective('NOT(NOT([qty] > 10))');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.perspectiveExpression).toBe('if(if("qty" > 10, false, true), false, true)');
    }
  });

  /**
   * A non-boolean condition is ACCEPTED by `if()` and reads truthy —
   * `if("qty", false, true)` answered false for every row of a column with no
   * zeroes. So a NOT whose operand is not known to be boolean is refused
   * rather than compiled into something that cannot fail loudly.
   */
  it('refuses NOT over a non-boolean operand rather than compiling it wrong', () => {
    const r = compileStarUiExpressionToPerspective('NOT([qty])');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/boolean/i);
  });

  it('compiles IF to Perspective if()', () => {
    const r = compileStarUiExpressionToPerspective('IF([x] > 0, [x], 0)');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.perspectiveExpression).toBe('if("x" > 0, "x", 0)');
  });

  it('rejects unknown functions', () => {
    const r = compileStarUiExpressionToPerspective('SUM([price])');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/SUM|unsupported|function/i);
  });
});
