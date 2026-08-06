/**
 * Where the set-filter ceiling should sit — measured, not inherited.
 *
 * `engine.distinctValues` REFUSES above `maxSetFilterValues` rather than
 * truncating, because a partial checkbox list renders as the whole domain and
 * its Select All silently excludes the rest. The default is 50,000, carried
 * over from the Perspective path's decision. This asks what a user actually
 * waits for at each cardinality, on the book the lab runs, because a set filter
 * opens SYNCHRONOUSLY from the user's point of view: the menu is on screen and
 * empty until the list arrives.
 *
 * Three costs, and they are not the same shape:
 *
 *   1. **a STORED column** answers from the dictionary — a walk of the DOMAIN,
 *      so it barely depends on the book's size;
 *   2. **a CALCULATED column** has no dictionary, so it is a scan of the BOOK,
 *      evaluating the expression per row. That is the cost the ceiling has to
 *      be set against;
 *   3. **the port**, because the list is structured-cloned back to the window.
 *
 *   node node_modules/tsx/dist/cli.mjs \
 *     packages/react-grid/ssrm-engine/scripts/distinctValuesProbe.mjs
 */
import { MessageChannel } from 'node:worker_threads';
import { createSsrmEngine } from '../src/index.ts';
import { createSsrmWorkerHost } from '../src/worker/host.ts';
import { SsrmEngineClient } from '../src/worker/SsrmEngineClient.ts';

const ROWS = 20_000;

/**
 * One book with columns at deliberately spread cardinalities.
 *
 * `dim8` is a dimension a blotter really groups by; `bucket*` climb by three
 * orders of magnitude; `id` is the index column, which is every row distinct
 * and is exactly the case the Perspective decision named (`positionId` really
 * does return 20,000 and works).
 */
const CARDINALITIES = [8, 100, 1_000, 5_000, 20_000];
const fields = [
  { field: 'id', type: 'string' },
  { field: 'px', type: 'number' },
];
for (const n of CARDINALITIES) fields.push({ field: `dim${n}`, type: 'string' });

const rows = [];
for (let r = 0; r < ROWS; r++) {
  const row = { id: `POS-${r}`, px: (r * 7) % 100_000 / 100 };
  for (const n of CARDINALITIES) row[`dim${n}`] = `V-${r % n}`;
  rows.push(row);
}

const engine = createSsrmEngine({
  schema: { keyField: 'id', fields },
  maxSetFilterValues: 1_000_000,
  onCalcWarning: () => {},
});
engine.applySnapshot(rows);

/**
 * Calculated twins of the same cardinalities, so the scan path is measured
 * against the dictionary path over the SAME domains rather than against a
 * different column.
 *
 * `CONCAT` over the dimension keeps the expression cheap; the point is the scan
 * and the Set, not the operator.
 */
const calcDefs = CARDINALITIES.map((n) => ({
  colId: `calc_dim${n}`,
  ast: {
    type: 'call',
    name: 'CONCAT',
    args: [
      { type: 'literal', value: 'c' },
      { type: 'columnRef', columnId: `dim${n}` },
    ],
  },
}));
engine.setCalcColumns(calcDefs);
const refused = engine.calcDiagnostics().filter((d) => d.phase === 'compile');
if (refused.length > 0) {
  throw new Error(`the calculated columns were REFUSED, so nothing below is measured: ${JSON.stringify(refused)}`);
}

const ms = (t) => `${t.toFixed(2)} ms`;

/**
 * Median of N runs, with the value cache DEFEATED between them.
 *
 * A calculated value is cached per write, so repeating the call would measure
 * the cache after the first run — the mistake this package's benchmark file
 * warns about twice. A no-op write bumps the write stamp and invalidates it.
 */
function time(label, fn, { invalidate = false, repeats = 5 } = {}) {
  const took = [];
  let last = null;
  for (let i = 0; i < repeats; i++) {
    if (invalidate) engine.applyUpdate([{ id: `POS-${i}`, px: i }]);
    const start = performance.now();
    last = fn();
    took.push(performance.now() - start);
  }
  took.sort((a, b) => a - b);
  const median = took[Math.floor(took.length / 2)];
  console.log(`  ${label.padEnd(46)} ${ms(median).padStart(9)}   ${Array.isArray(last) ? `${last.length.toLocaleString()} values` : String(last)}`);
  return { median, count: Array.isArray(last) ? last.length : null };
}

console.log(`\n=== distinctValues, ${ROWS.toLocaleString()} rows ===\n`);
console.log('  STORED column — answered from the dictionary\n');
const stored = {};
for (const n of CARDINALITIES) {
  stored[n] = time(`dim${n}`, () => engine.distinctValues(`dim${n}`), { invalidate: true });
}
time('id (the index column, every row distinct)', () => engine.distinctValues('id'), {
  invalidate: true,
});

console.log('\n  CALCULATED column — no dictionary, so a scan of the book\n');
const calc = {};
for (const n of CARDINALITIES) {
  calc[n] = time(`calc_dim${n}`, () => engine.distinctValues(`calc_dim${n}`), {
    invalidate: true,
  });
}

// ── the port ──────────────────────────────────────────────────────────────
const host = createSsrmWorkerHost({ openBook: () => ({ engine }) });
const channel = new MessageChannel();
host.connect(channel.port2);
const client = await SsrmEngineClient.open(channel.port1, 'bench', { heartbeatMs: 0 });

console.log('\n  ACROSS THE PORT — engine plus the structured clone back\n');
const overPort = {};
for (const field of ['dim8', 'dim1000', 'dim20000', 'calc_dim20000']) {
  const took = [];
  let count = 0;
  for (let i = 0; i < 5; i++) {
    await client.applyUpdate([{ id: `POS-${i}`, px: i + 1 }]);
    const start = performance.now();
    const values = await client.distinctValues(field);
    took.push(performance.now() - start);
    count = values?.length ?? 0;
  }
  took.sort((a, b) => a - b);
  overPort[field] = took[2];
  console.log(`  ${field.padEnd(46)} ${ms(took[2]).padStart(9)}   ${count.toLocaleString()} values`);
}

await client.close();
host.dispose();

// ── what the ceiling refuses ──────────────────────────────────────────────
console.log('\n  THE CEILING\n');
const tight = createSsrmEngine({
  schema: { keyField: 'id', fields },
  maxSetFilterValues: 1_000,
  onCalcWarning: () => {},
});
tight.applySnapshot(rows);
tight.setCalcColumns(calcDefs);
console.log(`  stored, 1,000 distinct at a 1,000 ceiling      ${tight.distinctValues('dim1000')?.length ?? 'REFUSED'}`);
console.log(`  stored, 5,000 distinct at a 1,000 ceiling      ${tight.distinctValues('dim5000')?.length ?? 'REFUSED'}`);
// The calculated path bails as soon as it passes the ceiling rather than
// collecting the whole domain and discarding it — worth showing, because it is
// why a refusal is cheap and an answer is not.
const bailStart = performance.now();
const bailed = tight.distinctValues('calc_dim20000');
console.log(
  `  calculated, 20,000 distinct at a 1,000 ceiling ${bailed === null ? 'REFUSED' : bailed.length} in ${ms(performance.now() - bailStart)} (it bails at the ceiling)`,
);

console.log(`\n  Read this against what a user is waiting on:`);
console.log(`    a block read through the port, in a browser   2.1-2.4 ms`);
console.log(`    the AG set filter list is VIRTUALISED, so the`);
console.log(`    row count does not drive its render cost\n`);
