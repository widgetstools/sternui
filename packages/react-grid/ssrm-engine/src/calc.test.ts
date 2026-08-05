import { describe, expect, it, vi } from 'vitest';
import { ColumnStore } from './columnStore.js';
import { compileCalcColumns } from './calc.js';
import { createSsrmEngine } from './engine.js';
import type { SsrmCalcColumnDef, SsrmExpressionNode } from './calcAst.js';
import type { SsrmSchema } from './types.js';

/**
 * The reduced cases behind the calculated-column evaluator.
 *
 * The differential fuzz in `engine.fuzz.test.ts` is what actually establishes
 * that the compiler agrees with the grid over inputs nobody chose. These are
 * the cases stated by hand, for two reasons: some of them the fuzz cannot
 * generate (a refusal makes a fuzz comparison vacuous, so the generator avoids
 * them on purpose), and the rest are the rules that are worth being legible
 * without a seed.
 */

const SCHEMA: SsrmSchema = {
  keyField: 'id',
  fields: [
    { field: 'id', type: 'string' },
    { field: 'desk', type: 'string' },
    { field: 'px', type: 'number' },
    { field: 'qty', type: 'number' },
    { field: 'live', type: 'boolean' },
  ],
};

const lit = (value: number | string | boolean | null): SsrmExpressionNode => ({ type: 'literal', value });
const col = (columnId: string): SsrmExpressionNode => ({ type: 'columnRef', columnId });
const bin = (operator: string, left: SsrmExpressionNode, right: SsrmExpressionNode): SsrmExpressionNode => ({
  type: 'binary',
  operator,
  left,
  right,
});
const call = (name: string, ...args: SsrmExpressionNode[]): SsrmExpressionNode => ({ type: 'call', name, args });

/** One row, one expression, one value — the shortest path to a verdict. */
function evaluateOne(ast: SsrmExpressionNode, row: Record<string, unknown>): unknown {
  const store = new ColumnStore(SCHEMA);
  store.upsert([{ id: 'r1', ...row }]);
  const { columns } = compileCalcColumns(store, [{ colId: 'out', ast }], () => {});
  return columns[0].evaluate?.(store.offsetOf('r1')!);
}

describe('calculated columns — null semantics follow the grid, which is JavaScript', () => {
  /**
   * The recorded incident, restated as three assertions.
   *
   * `null > 95` is FALSE in JavaScript and TRUE in Perspective's expression
   * language, and the same authored rule painted different rows on the two
   * surfaces. This engine is JavaScript. The middle case is the one that
   * surprises people and the reason "nulls never match a comparison" is the
   * wrong summary: null coerces to 0, so it is genuinely greater than -1.
   */
  it('null coerces to 0 in a comparison, and is not equal to it', () => {
    expect(evaluateOne(bin('>', col('px'), lit(95)), { px: null })).toBe(false);
    expect(evaluateOne(bin('>', col('px'), lit(-1)), { px: null })).toBe(true);
    expect(evaluateOne(bin('>=', col('px'), lit(0)), { px: null })).toBe(true);
    // `==` is STRICT, so the same null that compares as 0 is not equal to 0.
    expect(evaluateOne(bin('==', col('px'), lit(0)), { px: null })).toBe(false);
    expect(evaluateOne(bin('!=', col('px'), lit(0)), { px: null })).toBe(true);
  });

  it('divides by zero to null and by null to Infinity', () => {
    // Two different answers to what looks like one question, and both are the
    // grid's: `applyBinary` guards a literal zero and `null` is not `=== 0`.
    expect(evaluateOne(bin('/', col('px'), col('qty')), { px: 10, qty: 0 })).toBeNull();
    expect(evaluateOne(bin('/', col('px'), col('qty')), { px: 10, qty: null })).toBe(Infinity);
    expect(evaluateOne(bin('/', col('px'), lit(0)), { px: -10 })).toBeNull();
    expect(evaluateOne(bin('/', col('px'), col('qty')), { px: 0, qty: null })).toBeNaN();
  });

  it('adds a string to a number by concatenating, on either side', () => {
    expect(evaluateOne(bin('+', col('desk'), col('px')), { desk: 'FX', px: 4.5 })).toBe('FX4.5');
    expect(evaluateOne(bin('+', col('px'), col('desk')), { desk: 'FX', px: 4.5 })).toBe('4.5FX');
    expect(evaluateOne(bin('+', col('desk'), col('px')), { desk: 'FX', px: null })).toBe('FXnull');
    expect(evaluateOne(bin('+', col('px'), col('qty')), { px: 1, qty: null })).toBe(1);
  });
});

describe('calculated columns — NaN stays a value', () => {
  /**
   * Session 3 settled what NaN is in this engine and nothing here weakens it.
   * The store keeps it, `blank` does not match it, an aggregate skips it, and
   * it sorts with the nulls because it has no position on the number line. An
   * expression that produces one is subject to the same contract: a NaN is
   * stamped as a NaN. Turning it into null would make "this went wrong" and
   * "there is no value here" render identically.
   */
  it('stamps a NaN rather than folding it into null', () => {
    expect(evaluateOne(call('SQRT', lit(-1)), {})).toBeNaN();
    expect(evaluateOne(bin('*', col('px'), lit(2)), { px: Number.NaN })).toBeNaN();
    expect(evaluateOne(bin('+', col('px'), lit(1)), { px: Number.NaN })).toBeNaN();
  });

  it('reproduces IF and IFS disagreeing about NaN', () => {
    // Not a defect in this engine and not tidied. `IF` is an ordinary function
    // whose body is `cond ? t : f`, so its condition is JAVASCRIPT truthy and
    // NaN is falsy there; `IFS` calls `isTruthy`, whose falsy set is exactly
    // null/undefined/false/0/'' and does not contain NaN. Tidying it would make
    // this engine disagree with the surface beside it.
    expect(evaluateOne(call('IF', col('px'), lit('yes'), lit('no')), { px: Number.NaN })).toBe('no');
    expect(evaluateOne(call('IFS', col('px'), lit('yes'), lit('no')), { px: Number.NaN })).toBe('yes');
    // And they agree about null, which is why the disagreement is easy to miss.
    expect(evaluateOne(call('IF', col('px'), lit('yes'), lit('no')), { px: null })).toBe('no');
    expect(evaluateOne(call('IFS', col('px'), lit('yes'), lit('no')), { px: null })).toBe('no');
  });

  it('short-circuits AND and OR to the OPERAND, not to a boolean', () => {
    expect(evaluateOne(bin('AND', col('px'), lit(7)), { px: null })).toBeNull();
    expect(evaluateOne(bin('AND', col('px'), lit(7)), { px: 3 })).toBe(7);
    expect(evaluateOne(bin('OR', col('px'), lit('fallback')), { px: 0 })).toBe('fallback');
    expect(evaluateOne(bin('OR', col('px'), lit('fallback')), { px: 3 })).toBe(3);
  });
});

describe('calculated columns — a column the expression names does not exist', () => {
  it('reads null and says so, rather than reading null quietly', () => {
    const store = new ColumnStore(SCHEMA);
    store.upsert([{ id: 'r1', px: 10 }]);
    const warn = vi.fn();
    const { columns, diagnostics } = compileCalcColumns(
      store,
      [{ colId: 'out', ast: bin('+', col('px'), col('nope')) }],
      warn,
    );
    // The VALUE is what the grid produces — `resolveColumnRef` answers null for
    // a field the row does not carry, so `10 + null` is 10.
    expect(columns[0].evaluate?.(store.offsetOf('r1')!)).toBe(10);
    // But a whole column of nulls from a typo is the quietest way a calculated
    // column goes wrong, so it is counted and named.
    expect(diagnostics).toEqual([
      { colId: 'out', phase: 'column', message: "expression names 'nope', which the book does not have", count: 1 },
    ]);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('calculated columns — what is refused, and what a refusal costs', () => {
  const refusals: [string, SsrmExpressionNode, string][] = [
    // The trap the parity worklog records once already: a cross-row question
    // answered row-wise is silently false for every row. `SUM([px])` reads
    // EVERY row on the grid (the module supplies `allRows` from
    // `api.forEachNode`), and there is no per-offset equivalent.
    ['a cross-row reducer over a bare column', call('SUM', col('px')), 'CROSS-ROW'],
    ['MIN over a bare column', call('MIN', col('px'), col('qty')), 'CROSS-ROW'],
    // Named, because the lab's own seeded curriculum authors it and it does not
    // exist upstream either — where it renders as a silent column of nulls.
    ['a function that does not exist', call('LOG10', col('px')), "unknown function 'LOG10'"],
    ['the wrong number of arguments', call('IF', col('px')), 'IF takes 3-3 arguments'],
    ['a viewport-only column', col('px.old'), 'viewport-only'],
    ['the row object', { type: 'variable', name: 'data' }, 'evaluates against the columnar book'],
    ['member access', { type: 'member', object: { type: 'variable', name: 'data' }, property: 'px' }, 'member access'],
    ['an operator that does not exist', bin('<=>', col('px'), lit(1)), "unsupported binary operator '<=>'"],
  ];

  for (const [name, ast, fragment] of refusals) {
    it(`refuses ${name}`, () => {
      const store = new ColumnStore(SCHEMA);
      store.upsert([{ id: 'r1', px: 10, qty: 2 }]);
      const { columns, diagnostics } = compileCalcColumns(store, [{ colId: 'out', ast }], () => {});
      expect(columns[0].evaluate, name).toBeUndefined();
      expect(columns[0].error, name).toContain(fragment);
      expect(diagnostics[0].phase).toBe('compile');
    });
  }

  it('allows a reducer whose arguments are computed rather than bare columns', () => {
    // Only a DIRECT `columnRef` argument is expanded to the whole column
    // upstream, so this one is row-wise on both surfaces and is not refused.
    // EVERY argument has to be computed, not just one: `MIN([px] * 1, [qty])`
    // is still cross-row in its second position, and the first draft of this
    // test asserted exactly that and failed — which is the rule working.
    expect(
      evaluateOne(call('MIN', bin('*', col('px'), lit(1)), bin('*', col('qty'), lit(1))), {
        px: 10,
        qty: 3,
      }),
    ).toBe(3);
    expect(evaluateOne(call('MIN', lit(4), lit(9)), {})).toBe(4);
  });

  it('falls a refused column back to its FIELD BINDING, not to null', () => {
    // The convention `buildColumnDefs` set. A refused column is not stamped at
    // all, so whatever the store holds under that name survives — which for a
    // real calculated column (`calc_x`) is nothing, and for an expression
    // OVERRIDING a real column is that column's own value. The
    // calculated-columns module on CSRM blanks both; showing the underlying
    // value is the louder of the two, and a confidently blank cell is
    // indistinguishable from a genuine null.
    const engine = createSsrmEngine({ schema: SCHEMA, onCalcWarning: () => {} });
    engine.applySnapshot([{ id: 'r1', desk: 'FX', px: 10, qty: 2 }]);
    engine.setCalcColumns([
      { colId: 'px', ast: call('LOG10', col('px')) },
      { colId: 'calc_x', ast: call('LOG10', col('px')) },
    ]);
    const [row] = engine.getRows({ startRow: 0, endRow: 1 }).rowData;
    expect(row.px, 'an expression over an existing column falls back to that column').toBe(10);
    expect(row.calc_x, 'an expression over no column has nothing to fall back to').toBeUndefined();
  });
});

describe('calculated columns — a runtime failure never reaches the block read', () => {
  /**
   * `getRows` must settle exactly once. AG's `outboundRequests` is grid-global
   * with a default limit of 2, so a calculated column that throws inside a
   * block read does not blank a column — it wedges the grid, permanently, and
   * purging does not recover it.
   */
  it('catches per cell, falls back to the field value, and warns ONCE', () => {
    const engine = createSsrmEngine({ schema: SCHEMA });
    const warn = vi.fn();
    engine.applySnapshot([
      { id: 'r1', desk: 'not a date', px: 1 },
      { id: 'r2', desk: 'not a date', px: 2 },
      { id: 'r3', desk: 'not a date', px: 3 },
    ]);
    // `DATE_ADD` over a string that is not a date builds an Invalid Date, and
    // `toISOString()` on one THROWS a RangeError — a genuine per-cell throw
    // that survives every compile-time check.
    engine.setCalcColumns([{ colId: 'px', ast: call('DATE_ADD', col('desk'), lit(1), lit('days')) }]);
    const engineWithSink = createSsrmEngine({ schema: SCHEMA, onCalcWarning: warn });
    engineWithSink.applySnapshot([
      { id: 'r1', desk: 'not a date', px: 1 },
      { id: 'r2', desk: 'not a date', px: 2 },
      { id: 'r3', desk: 'not a date', px: 3 },
    ]);
    engineWithSink.setCalcColumns([
      { colId: 'px', ast: call('DATE_ADD', col('desk'), lit(1), lit('days')) },
    ]);

    const result = engineWithSink.getRows({ startRow: 0, endRow: 3 });
    // It did not throw, and every row carries its field value.
    expect(result.rowData.map((r) => r.px)).toEqual([1, 2, 3]);
    // Warned once for three failed cells; counted three times. On this engine
    // that distinction is the whole point — `console.warn` in a SharedWorker
    // reaches no console anywhere, so the COUNT is the observable one.
    expect(warn).toHaveBeenCalledTimes(1);
    const runtime = engineWithSink.calcDiagnostics().filter((d) => d.phase === 'runtime');
    expect(runtime).toHaveLength(1);
    expect(runtime[0].count).toBe(3);
  });
});

describe('calculated columns — compiled per expression, not walked per cell', () => {
  /**
   * The session's own failure condition, asserted structurally rather than
   * timed.
   *
   * A benchmark could not settle this honestly: the engine caches a
   * materialised index per query shape, and a benchmark that repeats one
   * request measures the cache — which once reported a sort as 0.8 ms. So the
   * AST is wrapped in a counting Proxy instead, and the question becomes
   * arithmetic: how many times is the TREE read after compilation? For a
   * compiled closure the answer is zero, at any number of rows. For a tree walk
   * it grows with them.
   */
  it('reads the AST zero times after compiling, over 5,000 cells', () => {
    let reads = 0;
    const watch = <T extends object>(node: T): T =>
      new Proxy(node, {
        get(target, key, receiver) {
          reads += 1;
          const value = Reflect.get(target, key, receiver);
          if (typeof value === 'object' && value !== null) return watch(value);
          return value;
        },
      });

    const store = new ColumnStore(SCHEMA);
    const rows = [];
    for (let i = 0; i < 5_000; i++) rows.push({ id: `r${i}`, px: i, qty: i % 7, desk: 'FX' });
    store.upsert(rows);

    const ast = watch(
      call(
        'IF',
        bin('>', col('px'), lit(100)),
        bin('/', bin('*', col('px'), col('qty')), lit(2)),
        bin('+', col('desk'), col('px')),
      ),
    );
    const { columns } = compileCalcColumns(store, [{ colId: 'out', ast }], () => {});
    expect(reads, 'compiling walks the tree').toBeGreaterThan(0);

    const afterCompile = reads;
    const evaluate = columns[0].evaluate!;
    let sink: unknown;
    for (let i = 0; i < 5_000; i++) sink = evaluate(i);
    expect(sink, 'the loop actually evaluated something').toBeDefined();
    expect(reads - afterCompile, 'AST reads during 5,000 evaluations').toBe(0);
  });

  it('hands back the same closure until the definitions change', () => {
    const engine = createSsrmEngine({ schema: SCHEMA });
    const defs: SsrmCalcColumnDef[] = [{ colId: 'out', ast: bin('*', col('px'), lit(2)) }];
    expect(engine.setCalcColumns(defs), 'first install changes something').toBe(true);
    const first = engine.calcEvaluator('out');
    // Re-installing an equal definition must not recompile: a caller that only
    // purges the grid when something changed would otherwise purge on every
    // render.
    expect(engine.setCalcColumns([{ colId: 'out', ast: bin('*', col('px'), lit(2)) }])).toBe(false);
    expect(engine.calcEvaluator('out')).toBe(first);
    expect(engine.setCalcColumns([{ colId: 'out', ast: bin('*', col('px'), lit(3)) }])).toBe(true);
    expect(engine.calcEvaluator('out')).not.toBe(first);
  });

  it('keeps reading the right cells after the store has GROWN', () => {
    // A compiled column reader captures the column, never `column.data` — the
    // typed array is REPLACED when the book passes its capacity. A closure
    // holding the buffer would keep reading the old, short copy: silently, and
    // only on books large enough to have grown.
    const engine = createSsrmEngine({ schema: SCHEMA });
    engine.applyUpdate([{ id: 'r0', px: 1, qty: 1 }]);
    engine.setCalcColumns([{ colId: 'out', ast: bin('*', col('px'), lit(10)) }]);
    const grown = [];
    for (let i = 1; i < 4_000; i++) grown.push({ id: `r${i}`, px: i, qty: 1 });
    engine.applyUpdate(grown);
    const rows = engine.getRows({ startRow: 3_990, endRow: 3_995 }).rowData;
    expect(rows.map((r) => r.out)).toEqual(rows.map((r) => (r.px as number) * 10));
    expect(rows[0].out).toBe(39_900);
  });
});
