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
