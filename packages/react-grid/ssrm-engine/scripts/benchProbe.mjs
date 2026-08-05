/**
 * What the TypeScript engine costs, against the numbers measured on the
 * Perspective path.
 *
 * Same book shape as the lab's Stress tab — 20,000 rows x 120 columns, 101
 * numeric and 19 dimension strings plus the index — so the figures line up with
 * `perspective-grid/ARCHITECTURE.md` directly.
 *
 * Node, not the browser, so this measures the ENGINE and not the proxy session
 * or AG Grid. That is the honest comparison: the Perspective figures it is put
 * beside were end-to-end through a worker, and this one is not. What it can
 * settle is whether the compute is anywhere near the bottleneck.
 *
 *   node packages/react-grid/ssrm-engine/scripts/benchProbe.mjs
 */
import { createSsrmEngine } from '../src/index.ts';

const ROWS = 20_000;
const NUMERIC = 101;
const DIMENSIONS = ['desk', 'sector', 'currency', 'rating', 'book', 'trader', 'region',
  'strategy', 'country', 'seniority', 'couponType', 'exchange', 'assetClass',
  'subClass', 'liquidity', 'side', 'status', 'portfolio', 'analyst'];

const fields = [{ field: 'id', type: 'string' }];
for (const d of DIMENSIONS) fields.push({ field: d, type: 'string' });
for (let i = 0; i < NUMERIC; i++) fields.push({ field: `n${i}`, type: 'number' });

const VALUES = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel'];
const rows = [];
for (let r = 0; r < ROWS; r++) {
  const row = { id: `POS-${r}` };
  for (let d = 0; d < DIMENSIONS.length; d++) {
    row[DIMENSIONS[d]] = VALUES[(r + d) % VALUES.length];
  }
  for (let i = 0; i < NUMERIC; i++) row[`n${i}`] = (r * 7 + i * 13) % 100000 / 100;
  rows.push(row);
}

const ms = (t) => `${t.toFixed(1)} ms`;

/**
 * Time `fn(i)`, where i VARIES the query.
 *
 * The engine caches a materialised index per query shape, so calling the same
 * request five times measures four cache hits and reports a sort as 0.8 ms. The
 * first version of this probe did exactly that. Every cold case below therefore
 * perturbs its request per iteration, so each run materialises afresh.
 */
function time(label, fn, repeats = 5) {
  fn(-1);
  const took = [];
  for (let i = 0; i < repeats; i++) {
    const start = performance.now();
    fn(i);
    took.push(performance.now() - start);
  }
  took.sort((a, b) => a - b);
  console.log(`  ${label.padEnd(46)} ${ms(took[Math.floor(took.length / 2)])}`);
  return took[Math.floor(took.length / 2)];
}

console.log(`\n=== ${ROWS.toLocaleString()} rows x ${fields.length} columns (${NUMERIC} numeric, ${DIMENSIONS.length} dimension strings) ===\n`);

const engine = createSsrmEngine({ schema: { keyField: 'id', fields } });

const loadStart = performance.now();
engine.applySnapshot(rows);
console.log(`  ${'initial load'.padEnd(46)} ${ms(performance.now() - loadStart)}`);
console.log(`  ${'book'.padEnd(46)} ${engine.size.toLocaleString()} rows`);

// Release the source rows before measuring: they are the JS row objects the
// columnar store exists to replace, and counting them would report the very
// thing this design avoids.
rows.length = 0;
global.gc?.();
await new Promise((r) => setTimeout(r, 50));
global.gc?.();
console.log(
  `  ${'heap held by the store'.padEnd(46)} ${Math.round(process.memoryUsage().heapUsed / 1048576)} MB` +
    (global.gc ? '' : '   (run node --expose-gc for a settled figure)'),
);
console.log('');

console.log('  --- the operations a blotter waits on ---');
// Warm: a scroll inside an index the grid already has. This is the floor.
time('block read from a WARM index', () =>
  engine.getRows({ startRow: 0, endRow: 100 }));
time('block read at row 15,000, warm', () =>
  engine.getRows({ startRow: 15_000, endRow: 15_100 }));

// Cold: everything below materialises a fresh index, which is the operation a
// user actually waits on after touching a header or a filter.
time('SORT + first block (Perspective: 0.4-1.1 s)', (i) =>
  engine.getRows({ sortModel: [{ colId: `n${8 + i}`, sort: 'desc' }], startRow: 0, endRow: 100 }));
time('sort on two columns + first block', (i) =>
  engine.getRows({
    sortModel: [{ colId: 'desk', sort: 'asc' }, { colId: `n${8 + i}`, sort: 'desc' }],
    startRow: 0, endRow: 100,
  }));
time('filter (number) + first block', (i) =>
  engine.getRows({
    filterModel: { n3: { filterType: 'number', type: 'greaterThan', filter: 500 + i } },
    startRow: 0, endRow: 100,
  }));
time('filter (set) + sort + first block', (i) =>
  engine.getRows({
    filterModel: { desk: { filterType: 'set', values: ['Alpha', 'Bravo'] } },
    sortModel: [{ colId: `n${8 + i}`, sort: 'desc' }],
    startRow: 0, endRow: 100,
  }));
time('GROUP by 1 col + agg over 4 value cols', (i) =>
  engine.getRows({
    rowGroupCols: [{ id: 'desk' }],
    groupKeys: [],
    filterModel: { n3: { filterType: 'number', type: 'greaterThan', filter: i } },
    valueCols: [
      { id: 'n0', aggFunc: 'sum' }, { id: 'n1', aggFunc: 'sum' },
      { id: 'n2', aggFunc: 'avg' }, { id: 'n3', aggFunc: 'max' },
    ],
  }));
time('group by 2 cols, second level', (i) =>
  engine.getRows({
    rowGroupCols: [{ id: 'desk' }, { id: 'sector' }],
    groupKeys: ['Alpha'],
    filterModel: { n3: { filterType: 'number', type: 'greaterThan', filter: i } },
    valueCols: [{ id: 'n0', aggFunc: 'sum' }],
  }));
time('quick filter across 19 string columns', (i) => {
  engine.setQuickFilter(i % 2 === 0 ? 'charlie' : 'delta');
  const r = engine.getRows({ startRow: 0, endRow: 100 });
  engine.setQuickFilter('');
  return r;
});
time('distinct values for a set filter', () => engine.distinctValues('desk'));
time('grand total over the filtered book', (i) =>
  engine.grandTotal({
    filterModel: { n3: { filterType: 'number', type: 'greaterThan', filter: i } },
    valueCols: [{ id: 'n0', aggFunc: 'sum' }],
  }));

console.log('\n  --- calculated columns, on the read path ---');
/**
 * What a calculated column costs a BLOCK READ, which is where it is paid.
 *
 * Session 4 computes calc values per read rather than materialising them into
 * the store — that choice is session 5's and it needs a measurement, which is
 * this one. Each case perturbs its request so the index is re-materialised
 * rather than answered from the cache; the first version of this whole
 * benchmark reported a sort as 0.8 ms for exactly that reason.
 *
 * The baseline immediately below is the SAME cold read with no calculated
 * columns installed, so the two rows subtract.
 */
const CALC_SET = [
  // `n0 + n1 + n2`, a three-column arithmetic chain.
  { colId: 'c_sum', ast: { type: 'binary', operator: '+', left: { type: 'binary', operator: '+', left: { type: 'columnRef', columnId: 'n0' }, right: { type: 'columnRef', columnId: 'n1' } }, right: { type: 'columnRef', columnId: 'n2' } } },
  // `IF(n3 > 0, n4 / n3, null)` — a guarded division, the curriculum's shape.
  { colId: 'c_ratio', ast: { type: 'call', name: 'IF', args: [
    { type: 'binary', operator: '>', left: { type: 'columnRef', columnId: 'n3' }, right: { type: 'literal', value: 0 } },
    { type: 'binary', operator: '/', left: { type: 'columnRef', columnId: 'n4' }, right: { type: 'columnRef', columnId: 'n3' } },
    { type: 'literal', value: null },
  ] } },
  // A nested IFS over one column — the traffic-light shape.
  { colId: 'c_bucket', ast: { type: 'call', name: 'IFS', args: [
    { type: 'binary', operator: '>=', left: { type: 'columnRef', columnId: 'n5' }, right: { type: 'literal', value: 700 } }, { type: 'literal', value: 1 },
    { type: 'binary', operator: '>=', left: { type: 'columnRef', columnId: 'n5' }, right: { type: 'literal', value: 300 } }, { type: 'literal', value: 2 },
    { type: 'literal', value: 3 },
  ] } },
  // A string column meeting a number.
  { colId: 'c_label', ast: { type: 'call', name: 'CONCAT', args: [{ type: 'columnRef', columnId: 'desk' }, { type: 'literal', value: '-' }, { type: 'columnRef', columnId: 'n6' }] } },
];
/**
 * A WARM index on both sides, deliberately, and that is not the cache trap.
 *
 * The trap this probe already carries a warning about is measuring a cached
 * INDEX and calling it a sort. A calculated value is not cached at all — it is
 * recomputed on every read, which is exactly the property being measured — so
 * holding the index warm is what ISOLATES the calc cost instead of burying it
 * under a 5 ms re-materialisation whose run-to-run spread is larger than the
 * thing being measured. The first version of this section subtracted two cold
 * medians and reported 1.4 ms for 400 cells, which is 3.5 us per cell and was
 * noise.
 */
engine.setCalcColumns([]);
const warmBlock = time('block read, warm index, NO calculated columns', () =>
  engine.getRows({ startRow: 0, endRow: 100 }), 15);
engine.setCalcColumns(CALC_SET);
const warmBlockCalc = time('block read, warm index, 4 calculated columns', () =>
  engine.getRows({ startRow: 0, endRow: 100 }), 15);
console.log(
  `  ${'=> 400 calculated cells on a block'.padEnd(46)} ${ms(Math.max(0, warmBlockCalc - warmBlock))}`,
);

// The evaluator alone, with no row materialisation around it: the number
// session 5 needs when it decides materialise-vs-compute, because materialising
// pays THIS per write and computing pays it per read.
const evaluators = CALC_SET.map((c) => engine.calcEvaluator(c.colId));
const offsets = engine.store.liveOffsets();
time('the closures alone, 4 x 20,000 = 80,000 cells', () => {
  let sink = 0;
  for (const evaluate of evaluators) {
    for (let i = 0; i < offsets.length; i++) sink += typeof evaluate(offsets[i]) === 'number' ? 1 : 0;
  }
  return sink;
}, 7);

console.log('\n  --- session 5: a calculated column SORTS, FILTERS and GROUPS ---');
/**
 * The same operation over a STORE column and over a CALCULATED one.
 *
 * This is the measurement the materialise-vs-compute decision rests on, and the
 * pairs are deliberately identical in every respect but which column they name:
 * same book, same perturbation, same number of rows through the same code, so
 * the difference between the two rows IS the cost of computing the value rather
 * than reading it.
 *
 * Every case perturbs its request, because the engine caches a materialised
 * index per query shape and the first version of this whole file reported a
 * sort as 0.8 ms for exactly that reason. `c_sum` is the CHEAPEST calculated
 * column in the set — two additions over three columns — so these are a floor;
 * `c_bucket` (a nested IFS) is measured beside it to show the spread.
 */
/**
 * How many comparisons a sort of THIS book actually performs — and it is not
 * the `n log n` the ratios below would otherwise be read against.
 *
 * The generated values are `(r * 7 + i * 13) % 100000 / 100`, a sawtooth, so
 * V8's TimSort finds long ascending runs and settles in ~32,000 comparisons
 * rather than the ~285,000 random data would cost. A calculated sort key is
 * evaluated TWICE PER COMPARISON, so that difference is the difference between
 * ~64,000 and ~570,000 evaluations — and the second is what a real blotter's
 * unsorted book would pay. Both are printed so the ratio below is read with the
 * right ceiling in mind rather than quoted as the worst case.
 */
function countComparisons(key) {
  const scratch = Array.from(engine.store.liveOffsets());
  let comparisons = 0;
  scratch.sort((a, b) => {
    comparisons += 1;
    const x = key(a);
    const y = key(b);
    return x < y ? -1 : x > y ? 1 : 0;
  });
  return comparisons;
}
const structuredKey = engine.calcEvaluator('c_sum');
// A well-mixed key over the same columns: a multiply-and-modulo scatters the
// sawtooth, so TimSort finds no runs and pays the full n log n.
engine.setCalcColumns([...CALC_SET, { colId: 'c_scatter', ast: { type: 'binary', operator: '%', left: { type: 'binary', operator: '*', left: { type: 'columnRef', columnId: 'n0' }, right: { type: 'literal', value: 7919 } }, right: { type: 'literal', value: 997 } } }]);
const scatterKey = engine.calcEvaluator('c_scatter');
console.log(
  `  ${'comparisons — this book vs a scattered key'.padEnd(46)} ` +
    `${countComparisons(structuredKey).toLocaleString()} vs ${countComparisons(scatterKey).toLocaleString()}`,
);
const sortScatter = time('SORT on a calculated column   (c_scatter)', (i) =>
  engine.getRows({
    filterModel: { n3: { filterType: 'number', type: 'greaterThan', filter: i } },
    sortModel: [{ colId: 'c_scatter', sort: 'desc' }], startRow: 0, endRow: 100,
  }));
engine.setCalcColumns(CALC_SET);

const sortStore = time('SORT on a stored column       (n9)', (i) =>
  engine.getRows({
    filterModel: { n3: { filterType: 'number', type: 'greaterThan', filter: i } },
    sortModel: [{ colId: 'n9', sort: 'desc' }], startRow: 0, endRow: 100,
  }));
const sortCalc = time('SORT on a calculated column   (c_sum)', (i) =>
  engine.getRows({
    filterModel: { n3: { filterType: 'number', type: 'greaterThan', filter: i } },
    sortModel: [{ colId: 'c_sum', sort: 'desc' }], startRow: 0, endRow: 100,
  }));
time('SORT on a calculated column   (c_bucket, IFS)', (i) =>
  engine.getRows({
    filterModel: { n3: { filterType: 'number', type: 'greaterThan', filter: i } },
    sortModel: [{ colId: 'c_bucket', sort: 'desc' }], startRow: 0, endRow: 100,
  }));
console.log(`  ${'=> a sort costs'.padEnd(46)} ${(sortCalc / sortStore).toFixed(1)}x a stored sort`);
console.log(
  `  ${'=> the same sort on a SCATTERED key'.padEnd(46)} ${ms(sortScatter)} — the honest ceiling`,
);

const filterStore = time('FILTER on a stored column     (n9 > x)', (i) =>
  engine.getRows({
    filterModel: { n9: { filterType: 'number', type: 'greaterThan', filter: 400 + i } },
    startRow: 0, endRow: 100,
  }));
const filterCalc = time('FILTER on a calculated column (c_sum > x)', (i) =>
  engine.getRows({
    filterModel: { c_sum: { filterType: 'number', type: 'greaterThan', filter: 400 + i } },
    startRow: 0, endRow: 100,
  }));
console.log(`  ${'=> a filter costs'.padEnd(46)} ${(filterCalc / filterStore).toFixed(1)}x a stored filter`);

const groupStore = time('GROUP by stored + sum stored', (i) =>
  engine.getRows({
    rowGroupCols: [{ id: 'desk' }], groupKeys: [],
    filterModel: { n3: { filterType: 'number', type: 'greaterThan', filter: i } },
    valueCols: [{ id: 'n0', aggFunc: 'sum' }],
  }));
const groupCalc = time('GROUP by calculated + sum calculated', (i) =>
  engine.getRows({
    rowGroupCols: [{ id: 'c_bucket' }], groupKeys: [],
    filterModel: { n3: { filterType: 'number', type: 'greaterThan', filter: i } },
    valueCols: [{ id: 'c_sum', aggFunc: 'sum' }],
  }));
console.log(`  ${'=> a group + agg costs'.padEnd(46)} ${(groupCalc / groupStore).toFixed(1)}x`);

console.log('\n  --- session 5: MATERIALISE, the other side of the trade ---');
/**
 * What materialising would pay INSTEAD, on the same book.
 *
 * Materialising means evaluating every calculated column for every affected row
 * at WRITE time and keeping the result in the store, so a read is an ordinary
 * typed-array index. The cost is therefore: evaluate + store, per row touched
 * by a write, plus the memory to hold it.
 *
 * Measured as the work itself rather than as a feature nobody has built —
 * `evaluate(offset)` then a `Float64Array` write is exactly what a materialised
 * column's writer would do, and adding an unused code path to the engine to
 * time it would be measuring the timing harness.
 */
const materialised = CALC_SET.map(() => new Float64Array(engine.store.extent));
time('MATERIALISE the whole book, 4 x 20,000 cells', () => {
  for (let c = 0; c < evaluators.length; c++) {
    const evaluate = evaluators[c];
    const into = materialised[c];
    for (let i = 0; i < offsets.length; i++) {
      const value = evaluate(offsets[i]);
      into[offsets[i]] = typeof value === 'number' ? value : Number.NaN;
    }
  }
}, 7);
const tickOffsets = [];
for (let i = 0; i < 200; i++) tickOffsets.push(engine.store.offsetOf(`POS-${(i * 37) % ROWS}`));
time('MATERIALISE a 200-row tick, 4 x 200 cells', () => {
  for (let c = 0; c < evaluators.length; c++) {
    const evaluate = evaluators[c];
    const into = materialised[c];
    for (const offset of tickOffsets) {
      const value = evaluate(offset);
      into[offset] = typeof value === 'number' ? value : Number.NaN;
    }
  }
}, 15);
console.log(
  `  ${'memory, 4 materialised columns'.padEnd(46)} ` +
    `${Math.round((materialised.length * engine.store.extent * 8) / 1024)} kB of Float64Array`,
);
engine.setCalcColumns([]);

console.log('\n  --- the live path ---');
const tick = [];
for (let i = 0; i < 200; i++) tick.push({ id: `POS-${i * 37 % ROWS}`, n0: Math.random() * 1000 });
time('apply a 200-row tick', () => engine.applyUpdate(tick));
// A tick clears the index cache, so this is a COLD re-materialisation under
// sort — the true cost of one live frame on a sorted, scrolled blotter.
time('tick THEN re-read the visible block, sorted', () => {
  engine.applyUpdate(tick);
  return engine.getRows({ sortModel: [{ colId: 'n7', sort: 'desc' }], startRow: 0, endRow: 40 });
});

console.log('\n  Perspective, same book, measured end-to-end in the browser:');
console.log('    block read (feed paused)                     8 ms');
console.log('    block read (feed live)                     119-145 ms');
console.log('    first block after a SORT                   400-1,100 ms');
console.log('    renderer working set                       1,286 MB\n');
