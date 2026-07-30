/**
 * Style rules as worker-side boolean expression columns.
 *
 * ARCHITECTURE.md assigns two classes of style rule to the worker: the ones
 * that are filtered or sorted on, and the ones that need cross-row context
 * ("above average"). Neither is built. Before building either, four things
 * have to come from the engine rather than from an assumption:
 *
 *   1. Is a BOOLEAN expression column first-class — filterable on `== true`,
 *      countable, sortable? (`calcColumnProbe` proved it for a float one.)
 *   2. Is there ANY cross-row aggregate inside the expression language —
 *      `avg("price")`, `sum("price")`, a window function, anything? If there
 *      is, "above average" is one expression. If there is not, the scalar has
 *      to be measured by a separate aggregate View and substituted as a
 *      literal, which is a completely different design.
 *   3. What does a rule expression over a STRING column do — is `==` on a
 *      string legal, and does a null row match, throw, or drop out?
 *   4. Does counting "any row in the book matches rule R" actually work as
 *      `num_rows` on a filtered expression column, including when NO row
 *      matches (0, not an error)?
 */
import perspective from '@perspective-dev/client/node';

const ok = (label, extra = '') => console.log(`  OK   ${label}${extra ? ' — ' + extra : ''}`);
const bad = (label, e) => console.log(`  FAIL ${label} — ${String(e?.message ?? e).slice(0, 160)}`);

let table;

async function tryView(label, config, read) {
  let view;
  try {
    view = await table.view(config);
    const out = await read(view);
    ok(label, out);
    return true;
  } catch (e) {
    bad(label, e);
    return false;
  } finally {
    if (view) await view.delete();
  }
}

async function main() {
  table = await perspective.table(
    { id: 'string', desk: 'string', region: 'string', price: 'float', pnl: 'float' },
    { index: 'id' },
  );
  await table.update([
    { id: 'a', desk: 'RATES', region: 'EMEA', price: 110, pnl: 500 },
    { id: 'b', desk: 'RATES', region: 'AMER', price: 100, pnl: -200 },
    { id: 'c', desk: 'CREDIT', region: 'EMEA', price: 90, pnl: 50 },
    { id: 'd', desk: 'CREDIT', region: null, price: null, pnl: 0 },
  ]);
  console.log(`table: ${await table.size()} rows (mean price over the 3 non-null = 100)\n`);

  console.log('=== 1. is a BOOLEAN expression column first-class? ===');
  const RULE = { __rule_x: '"pnl" < 0' };
  await tryView('read it', { expressions: RULE }, async (v) =>
    JSON.stringify((await v.to_columns()).__rule_x));
  await tryView('FILTER == true', { expressions: RULE, filter: [['__rule_x', '==', true]] },
    async (v) => `${await v.num_rows()} rows`);
  await tryView('FILTER == false', { expressions: RULE, filter: [['__rule_x', '==', false]] },
    async (v) => `${await v.num_rows()} rows`);
  await tryView('SORT by it', { expressions: RULE, sort: [['__rule_x', 'desc']] }, async (v) =>
    JSON.stringify((await v.to_columns()).__rule_x));
  await tryView('GROUP by it', { expressions: RULE, group_by: ['__rule_x'] }, async (v) =>
    `${await v.num_rows()} rows`);

  console.log('\n=== 2. does the expression language have ANY cross-row aggregate? ===');
  for (const src of [
    'avg("price")',
    'mean("price")',
    'sum("price")',
    'AVG("price")',
    'stddev("price")',
    'count("price")',
    '"price" > avg("price")',
  ]) {
    await tryView(`expression: ${src}`, { expressions: { probe: src } }, async (v) => {
      const col = (await v.to_columns()).probe;
      return JSON.stringify(col);
    });
  }

  console.log('\n=== 2b. can the scalar be MEASURED separately (the fallback design)? ===');
  await tryView(
    'aggregate view over the whole book',
    { group_by: ['__all__'], expressions: { __all__: "'ALL'" }, aggregates: { price: 'avg' } },
    async (v) => `avg(price) = ${JSON.stringify((await v.to_columns()).price)}`,
  );
  await tryView(
    'substituted back as a literal — "above average"',
    { expressions: { __rule_avg: '"price" > 100' }, filter: [['__rule_avg', '==', true]] },
    async (v) => `${await v.num_rows()} rows above the mean`,
  );

  console.log('\n=== 3. a rule over a STRING column, and what a null row does ===');
  await tryView('string equality', { expressions: { r: '"desk" == \'RATES\'' } }, async (v) =>
    JSON.stringify((await v.to_columns()).r));
  await tryView('string equality with a null row in the column',
    { expressions: { r: '"region" == \'EMEA\'' } }, async (v) =>
    JSON.stringify((await v.to_columns()).r));
  await tryView('arithmetic touching a null row',
    { expressions: { r: '"price" > 95' } }, async (v) =>
    JSON.stringify((await v.to_columns()).r));

  console.log('\n=== 4. "does ANY row in the book match" — including the zero case ===');
  await tryView('a rule nothing matches',
    { expressions: { r: '"pnl" > 999999' }, filter: [['r', '==', true]] },
    async (v) => `${await v.num_rows()} rows`);
  await tryView('a rule combined with the grid\'s own filter',
    { expressions: { r: '"pnl" < 0' }, filter: [['r', '==', true], ['desk', '==', 'RATES']] },
    async (v) => `${await v.num_rows()} rows`);

  console.log('\n=== 5. validate_expressions on a rule that cannot compile ===');
  try {
    const result = await table.validate_expressions({
      good: '"pnl" < 0',
      missingCol: '"nope" < 0',
    });
    ok('validate_expressions', JSON.stringify(result).slice(0, 400));
  } catch (e) {
    bad('validate_expressions', e);
  }

  await table.delete();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
