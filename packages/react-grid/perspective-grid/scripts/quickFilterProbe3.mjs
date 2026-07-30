/**
 * Round 3. Established so far:
 *   - `match(lower("col"), 'literal')` is the only usable string search
 *   - `match` will NOT accept a computed haystack: `match(lower(concat(...)))`
 *     fails a parameter type check, so the "concatenate every column and search
 *     once" shortcut is out. It has to be an `or` chain, one match per column.
 *   - `or` / `and` are the boolean operators. `|` parses but is WRONG (it
 *     matched every row).
 *   - the term is a REGEX: a bare `.` is a wildcard, and a lone `(` throws —
 *     even backslash-escaped. So user input must be SANITIZED, not escaped.
 *
 * This round settles null-safety, the or-chain at real column counts, and the
 * cost over a realistic book.
 */
import perspective from '@perspective-dev/client/node';

const ok = (label, extra = '') => console.log(`  OK   ${label}${extra ? ' — ' + extra : ''}`);
const bad = (label, e) => console.log(`  FAIL ${label} — ${String(e?.message ?? e).slice(0, 130)}`);

let table;

async function countExpr(label, expr) {
  let view;
  try {
    view = await table.view({ expressions: { __q__: expr }, filter: [['__q__', '==', true]] });
    const n = await view.num_rows();
    ok(label, `${n} rows`);
    return n;
  } catch (e) {
    bad(label, e);
    return null;
  } finally {
    if (view) await view.delete();
  }
}

/** The sanitizer under test: anything with regex or quoting meaning becomes a
 *  wildcard, which can never throw and never mis-parses. */
const sanitize = (term) => term.toLowerCase().replace(/[^\p{L}\p{N} _-]/gu, '.');

const orChain = (cols, term) =>
  cols.map((c) => `match(lower(string("${c}")), '${sanitize(term)}')`).join(' or ');

async function main() {
  table = await perspective.table(
    { positionId: 'string', desk: 'string', trader: 'string', quantity: 'float' },
    { index: 'positionId' },
  );
  await table.update([
    { positionId: 'p0', desk: 'RATES', trader: 'Mike Johnson', quantity: 10 },
    { positionId: 'p1', desk: 'CREDIT', trader: 'Jane Doe', quantity: 20 },
    { positionId: 'p2', desk: 'FX', trader: "O'Brien", quantity: 30 },
    { positionId: 'p3', desk: 'RATES', trader: 'Sarah (Ann) Williams', quantity: 40 },
    { positionId: 'p4', desk: null, trader: null, quantity: 50 },
  ]);
  console.log(`table: ${await table.size()} rows (p4 has nulls)\n`);

  console.log('=== NULL safety — does a null column poison the expression? ===');
  await countExpr('match on a column with a null row', "match(lower(\"trader\"), 'mike')");
  await countExpr('string() of a null', "match(lower(string(\"desk\")), 'rates')");
  await countExpr(
    'or chain including the null columns',
    orChain(['positionId', 'desk', 'trader', 'quantity'], 'rates'),
  );

  console.log('\n=== string() wrapper on already-string columns (uniform codegen) ===');
  await countExpr('string() on a string column', "match(lower(string(\"desk\")), 'rates')");
  await countExpr('string() on a float column', "match(lower(string(\"quantity\")), '30')");

  console.log('\n=== the sanitizer, against values that contain the metachars ===');
  for (const term of ["(ann)", "o'brien", "(", "\\", "sarah (ann)", "3.5", "mike|jane", "*"]) {
    await countExpr(`term ${JSON.stringify(term)} -> ${JSON.stringify(sanitize(term))}`,
      orChain(['positionId', 'desk', 'trader', 'quantity'], term));
  }

  console.log('\n=== multi-token: every token must match SOME column (AG semantics) ===');
  const tokens = (cols, text) =>
    text
      .split(/\s+/)
      .filter(Boolean)
      .map((t) => `(${orChain(cols, t)})`)
      .join(' and ');
  const COLS = ['positionId', 'desk', 'trader', 'quantity'];
  await countExpr("'sarah rates' — p3 only", tokens(COLS, 'sarah rates'));
  await countExpr("'mike credit' — nothing", tokens(COLS, 'mike credit'));

  await table.delete();

  console.log('\n=== cost over a realistic book: 20,000 rows x 26 columns ===');
  const wide = {};
  for (let c = 0; c < 26; c++) wide[`c${c}`] = c % 3 === 0 ? 'string' : 'float';
  wide.id = 'string';
  const big = await perspective.table(wide, { index: 'id' });
  const rows = [];
  for (let i = 0; i < 20_000; i++) {
    const r = { id: `p${i}` };
    for (let c = 0; c < 26; c++) r[`c${c}`] = c % 3 === 0 ? `val${i % 500}` : i + c;
    rows.push(r);
  }
  await big.update(rows);
  const allCols = Object.keys(wide);
  const expr = allCols
    .map((c) => `match(lower(string("${c}")), 'val42')`)
    .join(' or ');

  for (const label of ['cold', 'warm']) {
    const t0 = performance.now();
    const v = await big.view({ expressions: { __q__: expr }, filter: [['__q__', '==', true]] });
    const n = await v.num_rows();
    const built = performance.now() - t0;
    const t1 = performance.now();
    await v.to_columns({ start_row: 0, end_row: 100 });
    const read = performance.now() - t1;
    await v.delete();
    ok(`${label}: 27-column or-chain`, `build+count ${built.toFixed(0)}ms, 100-row read ${read.toFixed(0)}ms, ${n} rows`);
  }
  await big.delete();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
