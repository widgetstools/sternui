import { describe, expect, it } from 'vitest';
import {
  needsWorkerAnswer,
  planPerspectiveStyleRules,
  substituteAggregates,
} from './perspectiveStyleRules.js';
import type { ConditionalRule } from '../customizer/modules/conditional-styling/state.js';

function rule(overrides: Partial<ConditionalRule> = {}): ConditionalRule {
  return {
    id: 'r1',
    name: 'rule',
    enabled: true,
    priority: 0,
    scope: { type: 'cell', columns: ['pnl'] },
    expression: '[pnl] < 0',
    style: {} as ConditionalRule['style'],
    indicator: { icon: 'warning' },
    ...overrides,
  } as ConditionalRule;
}

describe('needsWorkerAnswer', () => {
  it('is true for a header indicator', () => {
    expect(needsWorkerAnswer(rule({ indicator: { icon: 'warning' } }))).toBe(true);
  });

  it('is true for a header flash', () => {
    expect(
      needsWorkerAnswer(
        rule({ indicator: undefined, flash: { enabled: true, target: 'headers' } }),
      ),
    ).toBe(true);
  });

  /**
   * The whole point of only planning header rules: a cell-only rule paints the
   * cells AG Grid is rendering, and those rows are in hand. Planning it would
   * buy a full-book View per paint for an answer nothing reads.
   */
  it('is false for a rule that paints cells only', () => {
    expect(
      needsWorkerAnswer(
        rule({ indicator: { icon: 'warning', target: 'cells' }, flash: undefined }),
      ),
    ).toBe(false);
  });

  it('is false for a row-scope rule and for a disabled one', () => {
    expect(needsWorkerAnswer(rule({ scope: { type: 'row' } }))).toBe(false);
    expect(needsWorkerAnswer(rule({ enabled: false }))).toBe(false);
  });
});

describe('planPerspectiveStyleRules', () => {
  it('compiles a header rule to a boolean Perspective expression', () => {
    const { plans, refusals } = planPerspectiveStyleRules([rule()]);
    expect(refusals).toEqual([]);
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({ ruleId: 'r1', expression: '"pnl" < 0', aggregates: [] });
  });

  it('plans nothing when there are no rules', () => {
    expect(planPerspectiveStyleRules(undefined).plans).toEqual([]);
    expect(planPerspectiveStyleRules([]).plans).toEqual([]);
  });

  /**
   * `.old`/`.new` are viewport-only by definition — the worker holds one value
   * per cell, not a before and an after — so the rule keeps its client scan
   * rather than compiling into something that cannot mean the same thing.
   */
  it('refuses a rule using .old/.new and says why', () => {
    const { plans, refusals } = planPerspectiveStyleRules([
      rule({ expression: '[pnl.new] < [pnl.old]' }),
    ]);
    expect(plans).toEqual([]);
    expect(refusals[0]?.reason).toMatch(/viewport|\.old|\.new/i);
  });

  it('refuses a timed rule — a timed activation is about the viewport', () => {
    const { plans, refusals } = planPerspectiveStyleRules([rule({ activeDurationMs: 3000 })]);
    expect(plans).toEqual([]);
    expect(refusals[0]?.reason).toMatch(/timed/i);
  });

  /**
   * A non-boolean expression would be filtered with `== true` against a float,
   * which Perspective accepts and answers false for — a rule that silently
   * never matches instead of one that visibly could not be moved.
   */
  it('refuses an expression that is not boolean server-side', () => {
    const { plans, refusals } = planPerspectiveStyleRules([rule({ expression: '[pnl] * 2' })]);
    expect(plans).toEqual([]);
    expect(refusals[0]?.reason).toMatch(/boolean/i);
  });

  it('refuses an expression that does not parse', () => {
    const { plans, refusals } = planPerspectiveStyleRules([rule({ expression: '[pnl] <' })]);
    expect(plans).toEqual([]);
    expect(refusals).toHaveLength(1);
  });

  it('skips disabled rules and cell-only rules entirely', () => {
    const { plans, refusals } = planPerspectiveStyleRules([
      rule({ id: 'off', enabled: false }),
      rule({ id: 'cells', indicator: { icon: 'warning', target: 'cells' } }),
    ]);
    expect(plans).toEqual([]);
    expect(refusals).toEqual([]);
  });

  /**
   * MEASURED: `avg("col")` in a Perspective expression is row-wise — it answers
   * the column's own values, so `"col" > avg("col")` is false for every row and
   * never errors. The aggregate has to leave the expression and be measured
   * separately, which is what the placeholder records.
   */
  it('lifts a cross-row aggregate out into a placeholder', () => {
    const { plans } = planPerspectiveStyleRules([
      rule({ expression: '[price] > AVG([price])' }),
    ]);
    expect(plans).toHaveLength(1);
    expect(plans[0]!.expression).not.toContain('avg(');
    expect(plans[0]!.aggregates).toEqual([
      { token: '__agg0__', colId: 'price', aggregate: 'avg' },
    ]);
    expect(plans[0]!.expression).toBe('"price" > "__agg0__"');
  });

  it('maps MAX/MIN onto the View aggregates, not the row-wise functions', () => {
    const { plans } = planPerspectiveStyleRules([
      rule({ expression: '[price] >= MAX([price])' }),
    ]);
    expect(plans[0]!.aggregates[0]).toMatchObject({ colId: 'price', aggregate: 'high' });
  });

  it('lifts more than one aggregate', () => {
    const { plans } = planPerspectiveStyleRules([
      rule({ expression: '[price] > AVG([price]) AND [qty] < AVG([qty])' }),
    ]);
    expect(plans[0]!.aggregates).toHaveLength(2);
    expect(plans[0]!.aggregates.map((a) => a.colId)).toEqual(['price', 'qty']);
  });

  /** `MIN(a, b)` over scalars is an ordinary row-wise function, not a column
   *  aggregate — it must not be lifted, and the compiler then refuses it. */
  it('does not treat a multi-argument MIN as a column aggregate', () => {
    const { plans, refusals } = planPerspectiveStyleRules([
      rule({ expression: 'MIN([a], [b]) > 0' }),
    ]);
    expect(plans).toEqual([]);
    expect(refusals).toHaveLength(1);
  });
});

describe('substituteAggregates', () => {
  const plan = {
    ruleId: 'r1',
    expression: '"price" > "__agg0__"',
    aggregates: [{ token: '__agg0__', colId: 'price', aggregate: 'avg' as const }],
  };

  it('swaps the measured scalar in as a literal', () => {
    expect(substituteAggregates(plan, new Map([['__agg0__', 100]]))).toBe('"price" > 100');
  });

  it('passes an expression with no aggregates straight through', () => {
    expect(
      substituteAggregates({ ruleId: 'r', expression: '"pnl" < 0', aggregates: [] }, new Map()),
    ).toBe('"pnl" < 0');
  });

  /**
   * An "above average" rule with no average is not a rule with a default. Null
   * travels out so the caller drops the badge rather than painting from a
   * number that means something else.
   */
  it('refuses when a scalar could not be measured', () => {
    expect(substituteAggregates(plan, new Map([['__agg0__', null]]))).toBeNull();
    expect(substituteAggregates(plan, new Map())).toBeNull();
    expect(substituteAggregates(plan, new Map([['__agg0__', Number.NaN]]))).toBeNull();
  });

  it('substitutes a negative and a fractional scalar intact', () => {
    expect(substituteAggregates(plan, new Map([['__agg0__', -12.5]]))).toBe('"price" > -12.5');
  });
});
