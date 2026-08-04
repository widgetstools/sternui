/**
 * What `PerspectiveViewConfig.columns` actually does — measured, not assumed.
 *
 * Column-window fetching rests on seven claims about the engine, and every one
 * of them fails SILENTLY if it is wrong: a filter clause on a column the View
 * does not carry would either throw or quietly select nothing, a `group_by` on
 * an omitted column would lose `__ROW_PATH__`, an aggregate on an omitted
 * column would answer null. None of that is documented for 4.5.2, so this asks
 * the engine directly before any of it is built on.
 *
 * Node, not the browser: the questions are about the engine, and a Node run is
 * seconds instead of minutes. The COST figures here are therefore a lower bound
 * on the browser's — no proxy session, no structured clone — which is fine,
 * because what is being established is the SHAPE of the curve.
 *
 *   node packages/react-grid/perspective-grid/scripts/columnWindowProbe.mjs
 */
import perspective from '@perspective-dev/client/node';

const COLS = 400;
const ROWS = 50_000;
const BLOCK = 100;

const KEY = 'positionId';
const TEXT = 'assetClass';
const CLASSES = ['Rates', 'Credit', 'Equity', 'FX', 'Commodities'];

function schema() {
  const s = { [KEY]: 'string', [TEXT]: 'string' };
  for (let i = 0; i < COLS; i++) s[`c${i}`] = 'float';
  return s;
}

function rows(n) {
  const out = [];
  for (let r = 0; r < n; r++) {
    const row = { [KEY]: `POS-${r}`, [TEXT]: CLASSES[r % CLASSES.length] };
    for (let i = 0; i < COLS; i++) row[`c${i}`] = r + i;
    out.push(row);
  }
  return out;
}

const ms = (t) => `${Math.round(t)} ms`;
const pass = (ok) => (ok ? 'PASS' : '*** FAIL ***');

/** Median of N reads at fixed, spread offsets — the same pattern the browser
 *  probe uses, so the two are comparable in shape. */
async function readCost(view, n = 8) {
  const offsets = [500, 5000, 12_000, 20_000, 30_000, 41_000, 8000, 25_000].slice(0, n);
  const took = [];
  for (const start of offsets) {
    const t = performance.now();
    await view.to_columns({ start_row: start, end_row: start + BLOCK });
    took.push(performance.now() - t);
  }
  took.sort((a, b) => a - b);
  return took[Math.floor(took.length / 2)];
}

async function timedView(table, config) {
  const t = performance.now();
  const view = await table.view(config);
  return { view, buildMs: performance.now() - t };
}

async function main() {
  const client = perspective;
  console.log(`=== building ${ROWS} x ${COLS + 2} ===`);
  let t = performance.now();
  const table = await client.table(schema(), { index: KEY });
  await table.update(rows(ROWS));
  console.log(`  loaded in ${ms(performance.now() - t)} · ${await table.size()} rows\n`);

  const window15 = [KEY, TEXT, ...Array.from({ length: 15 }, (_, i) => `c${i}`)];
  const window65 = [KEY, TEXT, ...Array.from({ length: 65 }, (_, i) => `c${i}`)];

  // ── 1. Does `columns` change what a read costs, and what a build costs? ────
  console.log('=== 1. read + build cost against the column count ===');
  const cases = [
    ['every column (today)', undefined],
    ['65 columns (visible ± pad)', window65],
    ['15 columns (visible only)', window15],
  ];
  const costs = [];
  for (const [label, columns] of cases) {
    const { view, buildMs } = await timedView(table, columns ? { columns } : {});
    const read = await readCost(view);
    const got = Object.keys(await view.to_columns({ start_row: 0, end_row: 1 })).length;
    costs.push({ label, read, buildMs, got });
    console.log(
      `  ${label.padEnd(28)} build ${ms(buildMs).padStart(7)} · block read median ${ms(read).padStart(7)} · columns out ${got}`,
    );
    await view.delete();
  }
  const full = costs[0];
  for (const c of costs.slice(1)) {
    console.log(
      `    -> ${c.label}: read ${(full.read / c.read).toFixed(1)}x cheaper, build ${(full.buildMs / c.buildMs).toFixed(1)}x cheaper`,
    );
  }

  // ── 2. A filter clause on a column NOT in `columns` ───────────────────────
  //
  // The sharpest question of the lot. Every one of the grid's filters, and the
  // ancestor clauses a group level is built from, name columns that may be far
  // outside the window.
  console.log('\n=== 2. filter on a column outside the window ===');
  {
    const view = await table.view({ columns: window15, filter: [[TEXT, '==', 'Rates']] });
    const n = await view.num_rows();
    const expected = Math.ceil(ROWS / CLASSES.length);
    console.log(`  filter on ${TEXT} (in window):    ${n} rows  ${pass(n === expected)}`);
    await view.delete();
  }
  {
    // c399 is not in the window at all.
    const view = await table.view({ columns: window15, filter: [['c399', '>', 25_000]] });
    const n = await view.num_rows();
    // c399 = r + 399, so > 25000 means r > 24601 -> ROWS - 24602 rows.
    const expected = ROWS - 24_602;
    console.log(
      `  filter on c399 (outside):        ${n} rows  ${pass(n === expected)}  (expected ${expected})`,
    );
    const cols = await view.to_columns({ start_row: 0, end_row: 1 });
    console.log(`    output still ${Object.keys(cols).length} columns, c399 present: ${'c399' in cols}`);
    await view.delete();
  }

  // ── 3. Sorting by a column outside the window ─────────────────────────────
  console.log('\n=== 3. sort on a column outside the window ===');
  {
    const view = await table.view({ columns: window15, sort: [['c399', 'desc']] });
    const cols = await view.to_columns({ start_row: 0, end_row: 1 });
    // Descending c399 = descending r, so row 0 is the LAST row of the book.
    const first = cols[KEY]?.[0];
    console.log(`  first row under sort c399 desc:  ${first}  ${pass(first === `POS-${ROWS - 1}`)}`);
    await view.delete();
  }

  // ── 4. Grouping with a narrowed column set ────────────────────────────────
  console.log('\n=== 4. group_by + aggregates with a narrowed column set ===');
  {
    // The group column is a real column here and deliberately NOT listed in
    // `columns`, because that is exactly what a window centred elsewhere does.
    const narrow = [KEY, 'c0', 'c1'];
    const view = await table.view({
      columns: narrow,
      group_by: [TEXT],
      aggregates: { c0: 'sum' },
    });
    const n = await view.num_rows();
    const cols = await view.to_columns({ start_row: 0, end_row: n });
    const hasPath = Array.isArray(cols.__ROW_PATH__);
    console.log(`  rows (1 total + ${CLASSES.length} groups): ${n}  ${pass(n === CLASSES.length + 1)}`);
    console.log(`  __ROW_PATH__ present:            ${hasPath}  ${pass(hasPath)}`);
    if (hasPath) console.log(`    paths: ${JSON.stringify(cols.__ROW_PATH__)}`);
    console.log(`  columns out:                     ${Object.keys(cols).join(', ')}`);
    const c0Total = cols.c0?.[0];
    console.log(`  c0 grand total present:          ${c0Total}  ${pass(typeof c0Total === 'number')}`);
    await view.delete();
  }
  {
    // And with the group column IN the window, which is what the
    // implementation will actually do — the check is that it does not change.
    const view = await table.view({
      columns: [KEY, TEXT, 'c0'],
      group_by: [TEXT],
      aggregates: { c0: 'sum' },
    });
    const cols = await view.to_columns({ start_row: 0, end_row: 6 });
    console.log(
      `  group column IN window: __ROW_PATH__ ${Array.isArray(cols.__ROW_PATH__)} · keys ${Object.keys(cols).join(', ')}`,
    );
    await view.delete();
  }

  // ── 5. An expression column declared but not output ───────────────────────
  //
  // The quick search compiles to one boolean expression column plus a clause on
  // it. If declaring an expression forces it into the output, every windowed
  // read carries it; if filtering on an unlisted expression fails, the quick
  // search breaks the moment a window is applied.
  console.log('\n=== 5. expression declared, filtered on, NOT in columns ===');
  {
    const view = await table.view({
      columns: window15,
      expressions: { __quick__: `"c0" > 100` },
      filter: [['__quick__', '==', true]],
    });
    const n = await view.num_rows();
    console.log(`  rows: ${n}  ${pass(n === ROWS - 101)}  (expected ${ROWS - 101})`);
    const cols = await view.to_columns({ start_row: 0, end_row: 1 });
    console.log(
      `  __quick__ in output: ${'__quick__' in cols} (want false) · columns out ${Object.keys(cols).length}`,
    );
    await view.delete();
  }

  // ── 6. A calculated column IS requestable through `columns` ───────────────
  console.log('\n=== 6. expression column listed in columns ===');
  {
    const view = await table.view({
      columns: [KEY, '__calc__'],
      expressions: { __calc__: `"c0" * 2` },
    });
    const cols = await view.to_columns({ start_row: 0, end_row: 3 });
    console.log(
      `  columns out: ${Object.keys(cols).join(', ')} · __calc__[0]=${cols.__calc__?.[0]}  ${pass(cols.__calc__?.[0] === 0)}`,
    );
    await view.delete();
  }

  // ── 7. An unknown column id in `columns` ──────────────────────────────────
  //
  // A window is computed from AG column ids, and AG has columns the Table does
  // not (the auto-group column, a client-side-only calc column). If that
  // throws, the window has to be intersected with the schema before use.
  console.log('\n=== 7. an id the Table does not have ===');
  try {
    const view = await table.view({ columns: [KEY, 'ag-Grid-AutoColumn'] });
    const cols = await view.to_columns({ start_row: 0, end_row: 1 });
    console.log(`  accepted · columns out: ${Object.keys(cols).join(', ')}`);
    await view.delete();
  } catch (error) {
    console.log(`  THREW: ${String(error?.message ?? error).slice(0, 160)}`);
    console.log('  -> the window MUST be intersected with table.schema() before use');
  }

  // ── 8. An empty `columns` array ───────────────────────────────────────────
  console.log('\n=== 8. columns: [] ===');
  try {
    const view = await table.view({ columns: [] });
    const cols = await view.to_columns({ start_row: 0, end_row: 1 });
    console.log(`  accepted · columns out: ${Object.keys(cols).length} (0 means it must never be emitted)`);
    await view.delete();
  } catch (error) {
    console.log(`  THREW: ${String(error?.message ?? error).slice(0, 160)}`);
  }

  await table.delete();
  console.log('\nclean teardown OK');
}

main().catch((e) => {
  console.error('PROBE FAILED:', e?.stack ?? e?.message ?? e);
  process.exit(1);
});
