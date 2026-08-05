import { describe, expect, it } from 'vitest';
import { createSsrmEngine } from './engine.js';
import type { SsrmCalcColumnDef, SsrmExpressionNode } from './calcAst.js';
import { SSRM_CHILD_COUNT, type SsrmSchema } from './types.js';

/**
 * A calculated column behaves like a real column — the reduced cases.
 *
 * Until session 5 `sortIndex`, `compileFilter` and `aggregateMembers` each
 * opened by skipping a column the store did not have, and a calculated column
 * is not a field. So a sort, a filter or an aggregation on one was a **silent
 * no-op**: no error, no effect, and a grid that looked like it had ignored the
 * click. Everything below is a case that used to pass by doing nothing.
 *
 * The rules are the ones session 3 settled and this session inherits rather
 * than re-derives — a calculated null and a calculated NaN sort LAST IN BOTH
 * DIRECTIONS, `blank` matches the null and not the NaN, and an aggregate skips
 * both rather than counting them as zero. They are asserted here on calculated
 * columns specifically, because "it goes through the same comparator" is a
 * claim about the code and these are a claim about the behaviour.
 */

const SCHEMA: SsrmSchema = {
  keyField: 'id',
  fields: [
    { field: 'id', type: 'string' },
    { field: 'desk', type: 'string' },
    { field: 'px', type: 'number' },
    { field: 'qty', type: 'number' },
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

/**
 * `IF(ISNOTNULL([px]), [px] * 2, null)` — null where `px` is null, NaN where it
 * is NaN, and the doubled price otherwise.
 *
 * **A bare `[px] * 2` would NOT do**, and the first draft of this file used it
 * and asserted the wrong thing. The grid is JavaScript and `null * 2` is `0`,
 * so an arithmetic expression over a missing quote produces a confident zero on
 * both surfaces rather than a blank — the same coercion that makes `null > -1`
 * true. Getting a calculated NULL at all takes an explicit null, which is
 * exactly the shape the lab's curriculum uses
 * (`IF([modifiedDuration] > 0, ..., null)`). NaN survives because
 * `ISNOTNULL(NaN)` is true.
 */
const DOUBLE: SsrmCalcColumnDef = {
  colId: 'calcPx',
  ast: call('IF', call('ISNOTNULL', col('px')), bin('*', col('px'), lit(2)), lit(null)),
};

function engineWith(rows: Record<string, unknown>[], defs: SsrmCalcColumnDef[] = [DOUBLE]) {
  const engine = createSsrmEngine({ schema: SCHEMA, onCalcWarning: () => {} });
  engine.applySnapshot(rows);
  engine.setCalcColumns(defs);
  // A refused column is stamped nowhere and read nowhere, so every assertion
  // below would compare undefined to undefined and pass. Session 4 shipped two
  // checks that could not fail for exactly this reason.
  expect(engine.calcDiagnostics().filter((d) => d.phase === 'compile')).toEqual([]);
  return engine;
}

const ROWS = [
  { id: 'a', desk: 'FX', px: 1, qty: 10 },
  { id: 'b', desk: 'FX', px: Number.NaN, qty: 20 },
  { id: 'c', desk: 'Rates', px: 9, qty: 30 },
  { id: 'd', desk: 'Rates', px: null, qty: 40 },
  { id: 'e', desk: 'FX', px: 5, qty: 50 },
];

describe('a calculated column SORTS', () => {
  /**
   * The rule session 3 settled, restated on a calculated column.
   *
   * A NaN and a null both have no position on the number line, so both sort
   * LAST in both directions. The alternative — multiplying the "absent" verdict
   * by the sort direction — put a NaN price above the best bid on a descending
   * sort and shipped for a release in the branch nobody re-read.
   */
  it('puts a calculated null and a calculated NaN last in BOTH directions', () => {
    const engine = engineWith(ROWS);
    expect(
      engine.getRows({ sortModel: [{ colId: 'calcPx', sort: 'asc' }] }).rowData.map((r) => r.id),
    ).toEqual(['a', 'e', 'c', 'b', 'd']);
    expect(
      engine.getRows({ sortModel: [{ colId: 'calcPx', sort: 'desc' }] }).rowData.map((r) => r.id),
    ).toEqual(['c', 'e', 'a', 'b', 'd']);
  });

  it('actually reorders — the sorted order is not the insertion order', () => {
    // Without this the two assertions above would still pass on an engine that
    // ignored the sort entirely, because `a` happens to be first either way.
    const engine = engineWith(ROWS);
    const unsorted = engine.getRows({}).rowData.map((r) => r.id);
    const sorted = engine.getRows({ sortModel: [{ colId: 'calcPx', sort: 'desc' }] }).rowData.map((r) => r.id);
    expect(sorted).not.toEqual(unsorted);
  });

  it('sorts a calculated STRING column as text', () => {
    const engine = engineWith(ROWS, [
      { colId: 'label', ast: call('CONCAT', lit('x'), col('desk')) },
    ]);
    expect(
      engine.getRows({ sortModel: [{ colId: 'label', sort: 'asc' }] }).rowData.map((r) => r.label),
    ).toEqual(['xFX', 'xFX', 'xFX', 'xRates', 'xRates']);
  });

  /**
   * A calculated column whose expression produces a string on some rows and a
   * number on others has no type at all, and AG Grid's own `_defaultComparator`
   * answers 0 for such a pair — both `>` and `<` are false. Reproduced rather
   * than invented, so the same expression orders identically on the
   * client-side row model.
   */
  it('ties a mixed string/number pair and falls through to the next sort column', () => {
    const engine = engineWith(ROWS, [
      { colId: 'mixed', ast: call('IF', bin('>', col('px'), lit(4)), col('desk'), col('px')) },
    ]);
    const ids = engine
      .getRows({ sortModel: [{ colId: 'mixed', sort: 'asc' }, { colId: 'qty', sort: 'desc' }] })
      .rowData.map((r) => r.id);
    // 'a' is 1 and 'c'/'e' are 'Rates'/'FX'; every cross-type pair ties, so the
    // qty tie-break decides and nothing throws.
    expect(ids).toHaveLength(5);
    // The two absent rows still land last: `b` is NaN and `d` is null.
    expect(ids.slice(-2).sort()).toEqual(['b', 'd']);
  });

  it('sorts by the EXPRESSION when its colId shadows a real field', () => {
    // `stampCalc` shows the expression's value under that name, so ordering by
    // the underlying field would sort the grid by numbers it is not showing.
    const engine = engineWith(ROWS, [{ colId: 'qty', ast: bin('-', lit(0), col('qty')) }]);
    expect(
      engine.getRows({ sortModel: [{ colId: 'qty', sort: 'asc' }] }).rowData.map((r) => r.id),
    ).toEqual(['e', 'd', 'c', 'b', 'a']);
  });
});

describe('a calculated column FILTERS', () => {
  it('matches a number filter on the computed value', () => {
    const engine = engineWith(ROWS);
    const got = engine.getRows({
      filterModel: { calcPx: { filterType: 'number', type: 'greaterThan', filter: 5 } },
    });
    // px * 2 > 5 on px of 9 and 5, not on 1; NaN and null are excluded.
    expect(got.rowData.map((r) => r.id)).toEqual(['c', 'e']);
    expect(got.rowCount).toBe(2);
  });

  /**
   * The rule that is easiest to get wrong and quietest when it is: a NaN is a
   * value, so `blank` must not match it. A bad tick and a missing quote are
   * different facts and a filter that conflates them hides the bad tick.
   */
  it('matches `blank` on a calculated null and NOT on a calculated NaN', () => {
    const engine = engineWith(ROWS);
    expect(
      engine.getRows({ filterModel: { calcPx: { type: 'blank' } } }).rowData.map((r) => r.id),
    ).toEqual(['d']);
    expect(
      engine.getRows({ filterModel: { calcPx: { type: 'notBlank' } } }).rowData.map((r) => r.id),
    ).toEqual(['a', 'b', 'c', 'e']);
  });

  it('matches a text filter and a set filter on a calculated string', () => {
    const engine = engineWith(ROWS, [
      { colId: 'label', ast: call('CONCAT', col('desk'), lit('-x')) },
    ]);
    expect(
      engine.getRows({
        filterModel: { label: { filterType: 'text', type: 'contains', filter: 'rates' } },
      }).rowData.map((r) => r.id),
    ).toEqual(['c', 'd']);
    expect(
      engine.getRows({
        filterModel: { label: { filterType: 'set', values: ['FX-x'] } },
      }).rowData.map((r) => r.id),
    ).toEqual(['a', 'b', 'e']);
  });

  it('answers distinct values for a set filter over a calculated column', () => {
    const engine = engineWith(ROWS, [
      { colId: 'label', ast: call('CONCAT', col('desk'), lit('-x')) },
    ]);
    expect([...(engine.distinctValues('label') ?? [])].sort()).toEqual(['FX-x', 'Rates-x']);
  });

  it('finds a calculated column through the quick filter', () => {
    const engine = createSsrmEngine({
      schema: SCHEMA,
      quickFilterFields: ['desk', 'label'],
      onCalcWarning: () => {},
    });
    engine.applySnapshot(ROWS);
    engine.setCalcColumns([{ colId: 'label', ast: call('CONCAT', lit('ZZ'), col('id')) }]);
    engine.setQuickFilter('zzc');
    expect(engine.getRows({}).rowData.map((r) => r.id)).toEqual(['c']);
  });
});

describe('a calculated column GROUPS and AGGREGATES', () => {
  it('groups by the computed value, with a null bucket', () => {
    const engine = engineWith(ROWS, [
      { colId: 'band', ast: call('IFS', bin('>', col('px'), lit(4)), lit('high'), lit('low')) },
    ]);
    const got = engine.getRows({ rowGroupCols: [{ id: 'band' }], groupKeys: [] });
    expect(got.rowData.map((r) => r.band)).toEqual(['high', 'low']);
    // px 9 and 5 are 'high'; 1, NaN and null are 'low' — `NaN > 4` and
    // `null > 4` are both FALSE, so neither reaches the truthy branch.
    expect(got.rowData.map((r) => r[SSRM_CHILD_COUNT])).toEqual([2, 3]);
  });

  /**
   * A group ROW is ordered by its key, and a calculated key can be a NaN.
   *
   * This case was found by mutation testing, not by review: reverting
   * `sortGroupRows` to the comparator it used to have — nulls last, everything
   * else `(x < y ? -1 : 1) * dir` — passed every other test in this file. A NaN
   * key is neither `===`, nor `<`, nor `>`, so it fell through to `1 * dir` and
   * a DESCENDING group put "no quote" at the top. That is rule 10 exactly: the
   * leaf sort was fixed for this twice and the group path, which shares the
   * reasoning, was never re-read.
   */
  it('orders a NaN group key with the nulls, last in BOTH directions', () => {
    const engine = engineWith(ROWS);
    const keys = (sort: 'asc' | 'desc') =>
      engine
        .getRows({ rowGroupCols: [{ id: 'calcPx' }], groupKeys: [], sortModel: [{ colId: 'calcPx', sort }] })
        .rowData.map((r) => (r.calcPx === null ? 'null' : String(r.calcPx)));

    expect(keys('asc').slice(0, 3)).toEqual(['2', '10', '18']);
    expect(keys('desc').slice(0, 3)).toEqual(['18', '10', '2']);
    // The unorderable pair brings up the rear whichever way the arrow points.
    expect(keys('asc').slice(3).sort()).toEqual(['NaN', 'null']);
    expect(keys('desc').slice(3).sort()).toEqual(['NaN', 'null']);
  });

  it('reads the children of a calculated group', () => {
    const engine = engineWith(ROWS, [
      { colId: 'band', ast: call('IFS', bin('>', col('px'), lit(4)), lit('high'), lit('low')) },
    ]);
    expect(
      engine
        .getRows({ rowGroupCols: [{ id: 'band' }], groupKeys: ['low'] })
        .rowData.map((r) => r.id),
    ).toEqual(['a', 'b', 'd']);
  });

  /**
   * The aggregate rule, unchanged from session 3 and now reachable through an
   * expression: null and NaN are SKIPPED, never counted as zero. A sum that
   * counted an absent quote would under-report and an average would drag its
   * denominator up with it.
   */
  it('skips a calculated null and a calculated NaN rather than counting them as zero', () => {
    const engine = engineWith(ROWS);
    const level = (aggFunc: string) =>
      engine.getRows({
        rowGroupCols: [{ id: 'desk' }],
        groupKeys: [],
        valueCols: [{ id: 'calcPx', aggFunc }],
      }).rowData;

    // FX holds px 1, NaN, 5 -> calcPx 2, NaN, 10. The NaN is skipped, so the
    // sum is 12 and the average is 6 — NOT 4, which is what counting the NaN
    // as a zero in the denominator would give.
    expect(level('sum').find((r) => r.desk === 'FX')!.calcPx).toBe(12);
    expect(level('avg').find((r) => r.desk === 'FX')!.calcPx).toBe(6);
    // Rates holds 9 and null -> 18 and null; the null is skipped too, so the
    // average is 18 rather than 9.
    expect(level('sum').find((r) => r.desk === 'Rates')!.calcPx).toBe(18);
    expect(level('avg').find((r) => r.desk === 'Rates')!.calcPx).toBe(18);
  });

  it('answers null for a group whose calculated values are all absent', () => {
    const engine = engineWith([
      { id: 'x', desk: 'FX', px: null, qty: 1 },
      { id: 'y', desk: 'FX', px: Number.NaN, qty: 2 },
    ]);
    const got = engine.getRows({
      rowGroupCols: [{ id: 'desk' }],
      groupKeys: [],
      valueCols: [{ id: 'calcPx', aggFunc: 'sum' }],
    });
    expect(got.rowData[0].calcPx).toBeNull();
  });

  it('carries a calculated column into the grand total', () => {
    const engine = engineWith(ROWS);
    expect(
      engine.grandTotal({ valueCols: [{ id: 'calcPx', aggFunc: 'sum' }] }).calcPx,
    ).toBe(2 + 18 + 10);
  });

  it('pivots on a calculated column', () => {
    const engine = engineWith(ROWS, [
      { colId: 'band', ast: call('IFS', bin('>', col('px'), lit(4)), lit('high'), lit('low')) },
    ]);
    const got = engine.getRows({
      rowGroupCols: [{ id: 'desk' }],
      groupKeys: [],
      pivotMode: true,
      pivotCols: [{ id: 'band' }],
      valueCols: [{ id: 'qty', aggFunc: 'sum' }],
    });
    expect(got.pivotResultFields).toEqual(['high_qty', 'low_qty']);
    const fx = got.rowData.find((r) => r.desk === 'FX')!;
    // FX: only `e` (px 5) is 'high'; `a` (px 1) and `b` (NaN) are 'low'.
    expect(fx.high_qty).toBe(50);
    expect(fx.low_qty).toBe(10 + 20);
  });
});

describe('a calculated column TICKS', () => {
  /**
   * `host.publish` broadcasts the writer's SPARSE patch verbatim — the cells
   * that moved, not the row — so a column computed from `px` reached the window
   * without its own new value and sat stale until AG re-read the block.
   */
  it('adds the calculated cells a patch made stale, and only those', () => {
    const engine = engineWith(ROWS, [
      DOUBLE,
      { colId: 'calcQty', ast: bin('*', col('qty'), lit(3)) },
    ]);
    engine.applyUpdate([{ id: 'a', px: 7 }]);
    const patch = engine.calcPatch([{ id: 'a', px: 7 }]);
    expect(patch[0].calcPx).toBe(14);
    // `calcQty` does not read `px`, so the frame must not carry it: AG flashes
    // a cell it is told changed, and a quantity total flashing on a price tick
    // is a lie the user can see.
    expect('calcQty' in patch[0]).toBe(false);
  });

  it('does not copy the patch when nothing calculated depends on it', () => {
    const engine = engineWith(ROWS, [{ colId: 'calcQty', ast: bin('*', col('qty'), lit(3)) }]);
    const rows = [{ id: 'a', px: 7 }];
    expect(engine.calcPatch(rows)).toBe(rows);
  });

  it('leaves the caller rows untouched — publish hands them to every port', () => {
    const engine = engineWith(ROWS);
    const rows = [{ id: 'a', px: 7 }];
    engine.applyUpdate(rows);
    engine.calcPatch(rows);
    expect('calcPx' in rows[0]).toBe(false);
  });

  it('skips a row the book no longer holds', () => {
    const engine = engineWith(ROWS);
    expect(engine.calcPatch([{ id: 'gone', px: 7 }])[0]).toEqual({ id: 'gone', px: 7 });
  });
});

describe('the value cache cannot outlive a write', () => {
  /**
   * A calculated value is computed at most once per row per WRITE and answered
   * from a stamped cache afterwards — the measured middle path between
   * recomputing per read and materialising into the store. The stamp is
   * compared on every read, so this is the case that would catch it being
   * bumped in the wrong place.
   */
  it('re-reads a calculated value after the column it depends on ticks', () => {
    const engine = engineWith(ROWS);
    expect(engine.getRows({ startRow: 0, endRow: 1 }).rowData[0].calcPx).toBe(2);
    engine.applyUpdate([{ id: 'a', px: 50 }]);
    expect(engine.getRows({ startRow: 0, endRow: 1 }).rowData[0].calcPx).toBe(100);
  });

  it('re-sorts on the new value after a tick moves a calculated sort key', () => {
    const engine = engineWith(ROWS);
    expect(
      engine.getRows({ sortModel: [{ colId: 'calcPx', sort: 'desc' }] }).rowData[0].id,
    ).toBe('c');
    engine.applyUpdate([{ id: 'a', px: 500 }]);
    expect(
      engine.getRows({ sortModel: [{ colId: 'calcPx', sort: 'desc' }] }).rowData[0].id,
    ).toBe('a');
  });

  it('re-filters on the new value after a tick', () => {
    const engine = engineWith(ROWS);
    const filter = { calcPx: { filterType: 'number', type: 'greaterThan', filter: 100 } };
    expect(engine.getRows({ filterModel: filter }).rowCount).toBe(0);
    engine.applyUpdate([{ id: 'a', px: 500 }]);
    expect(engine.getRows({ filterModel: filter }).rowData.map((r) => r.id)).toEqual(['a']);
  });

  it('re-aggregates after a tick', () => {
    const engine = engineWith(ROWS);
    const request = { valueCols: [{ id: 'calcPx', aggFunc: 'sum' }] };
    expect(engine.grandTotal(request).calcPx).toBe(30);
    engine.applyUpdate([{ id: 'a', px: 11 }]);
    expect(engine.grandTotal(request).calcPx).toBe(50);
  });

  it('re-reads after the EXPRESSION changes, not only after a write', () => {
    const engine = engineWith(ROWS);
    engine.setCalcColumns([{ colId: 'calcPx', ast: bin('*', col('px'), lit(10)) }]);
    expect(engine.getRows({ startRow: 0, endRow: 1 }).rowData[0].calcPx).toBe(10);
  });
});
