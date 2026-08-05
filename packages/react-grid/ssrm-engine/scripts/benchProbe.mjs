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
