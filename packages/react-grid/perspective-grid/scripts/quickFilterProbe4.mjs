/**
 * Round 4 — the or-chain does not scale.
 *
 * Rounds 1-3 settled the semantics: `match(lower(string("col")), 'term')`,
 * OR-ed across columns with `or`, AND-ed across tokens. Measured in Node at
 * 27 columns x 1 token that was ~650ms. But in the browser, against the live
 * book, 26 columns x 2 tokens (52 match calls) did not finish in 36 SECONDS.
 *
 * So this round finds the cost curve, and tests the escape route: if the regex
 * engine supports lookahead, all tokens can go into ONE match per column and
 * the cost stops depending on how many words the user typed.
 */
import perspective from '@perspective-dev/client/node';

const ok = (label, extra = '') => console.log(`  OK   ${label}${extra ? ' — ' + extra : ''}`);
const bad = (label, e) => console.log(`  FAIL ${label} — ${String(e?.message ?? e).slice(0, 120)}`);

async function timed(table, label, expr) {
  const t0 = performance.now();
  let view;
  try {
    view = await table.view({ expressions: { __q__: expr }, filter: [['__q__', '==', true]] });
    const n = await view.num_rows();
    ok(label, `${(performance.now() - t0).toFixed(0)}ms, ${n} rows, ${(expr.match(/match\(/g) || []).length} match calls`);
    return n;
  } catch (e) {
    bad(label, e);
    return null;
  } finally {
    if (view) await view.delete();
  }
}

async function main() {
  // Same shape as the demo book: 26 columns, 11 string / 15 numeric, 20k rows.
  const schema = { id: 'string' };
  const strCols = [];
  const numCols = [];
  for (let i = 0; i < 11; i++) { schema[`s${i}`] = 'string'; strCols.push(`s${i}`); }
  for (let i = 0; i < 14; i++) { schema[`n${i}`] = 'float'; numCols.push(`n${i}`); }
  const table = await perspective.table(schema, { index: 'id' });
  const rows = [];
  for (let i = 0; i < 20_000; i++) {
    const r = { id: `p${i}` };
    for (const c of strCols) r[c] = i % 7 === 0 ? 'Inflation EMEA' : `other${i % 300}`;
    for (const c of numCols) r[c] = i;
    rows.push(r);
  }
  await table.update(rows);
  const allCols = Object.keys(schema);
  console.log(`table: ${await table.size()} rows, ${allCols.length} columns\n`);

  const grp = (cols, term) =>
    '(' + cols.map((c) => `match(lower(string("${c}")), '${term}')`).join(' or ') + ')';

  console.log('=== cost curve: columns x tokens (or-chain) ===');
  await timed(table, '5 cols, 1 token', grp(allCols.slice(0, 5), 'inflation'));
  await timed(table, '11 cols, 1 token', grp(strCols, 'inflation'));
  await timed(table, '26 cols, 1 token', grp(allCols, 'inflation'));
  await timed(table, '11 cols, 2 tokens', `${grp(strCols, 'inflation')} and ${grp(strCols, 'emea')}`);
  await timed(table, '26 cols, 2 tokens', `${grp(allCols, 'inflation')} and ${grp(allCols, 'emea')}`);

  console.log('\n=== does the regex engine support LOOKAHEAD? ===');
  console.log('(if yes: all tokens ride in ONE match per column, cost stops scaling with tokens)');
  const look = (cols, tokens) => {
    const re = tokens.map((t) => `(?=.*${t})`).join('');
    return '(' + cols.map((c) => `match(lower(string("${c}")), '${re}')`).join(' or ') + ')';
  };
  await timed(table, 'lookahead, 1 token, 26 cols', look(allCols, ['inflation']));
  await timed(table, 'lookahead, 2 tokens, 26 cols', look(allCols, ['inflation', 'emea']));
  await timed(table, 'lookahead, 2 tokens, no match', look(allCols, ['inflation', 'zzz']));

  console.log('\n=== correctness check of the lookahead form ===');
  // 'inflation' + 'emea' must match the same rows the or-chain did; adding a
  // token that appears nowhere must match none.
  await timed(table, 'lookahead both tokens present', look(strCols, ['inflation', 'emea']));
  await timed(table, 'lookahead one token absent', look(strCols, ['inflation', 'nope']));

  await table.delete();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
