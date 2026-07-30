/**
 * Calculated columns as Perspective expression columns.
 *
 * Two questions this settles against the real 4.5.2 engine:
 *   1. Does the compiler's `if(cond, a, b)` output actually evaluate? A unit
 *      test in `ssrmCalcColumns.test.ts` asserts the compiler emits a `?`
 *      ternary and has been failing — so one of the two forms is wrong, and
 *      only the engine can say which.
 *   2. Is an expression column a first-class column — sortable, filterable,
 *      groupable, aggregatable? That is the whole premise of resolving
 *      calculated columns server-side.
 */
import perspective from '@perspective-dev/client/node';

const ok = (label, extra = '') => console.log(`  OK   ${label}${extra ? ' — ' + extra : ''}`);
const bad = (label, e) => console.log(`  FAIL ${label} — ${String(e?.message ?? e).slice(0, 140)}`);

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
    { id: 'string', desk: 'string', price: 'float', quantity: 'float' },
    { index: 'id' },
  );
  await table.update([
    { id: 'a', desk: 'RATES', price: 110, quantity: 10 },
    { id: 'b', desk: 'RATES', price: 100, quantity: 20 },
    { id: 'c', desk: 'CREDIT', price: 90, quantity: 30 },
  ]);
  console.log(`table: ${await table.size()} rows\n`);

  console.log('=== which conditional form does 4.5.2 accept? ===');
  const IFS_IF = 'if("price" >= 105, 1, if("price" >= 95, 2, 3))';
  const IFS_TERNARY = '"price" >= 105 ? 1 : ("price" >= 95 ? 2 : 3)';
  await tryView('if(cond, a, b) — what the compiler emits', { expressions: { rag: IFS_IF } },
    async (v) => JSON.stringify((await v.to_columns()).rag));
  await tryView('cond ? a : b — what the test asserts', { expressions: { rag: IFS_TERNARY } },
    async (v) => JSON.stringify((await v.to_columns()).rag));

  console.log('\n=== is an expression column first-class? ===');
  const CALC = { grossPnl: '"price" * "quantity"' };
  await tryView('read', { expressions: CALC }, async (v) =>
    JSON.stringify((await v.to_columns()).grossPnl));
  await tryView('SORT by it', { expressions: CALC, sort: [['grossPnl', 'desc']] }, async (v) =>
    JSON.stringify((await v.to_columns()).grossPnl));
  await tryView('FILTER on it', { expressions: CALC, filter: [['grossPnl', '>', 1500]] }, async (v) =>
    `${await v.num_rows()} rows`);
  await tryView('GROUP by it', { expressions: CALC, group_by: ['grossPnl'] }, async (v) =>
    `${await v.num_rows()} rows`);
  await tryView('AGGREGATE it', { expressions: CALC, group_by: ['desk'], aggregates: { grossPnl: 'sum' } },
    async (v) => JSON.stringify((await v.to_columns()).grossPnl));

  console.log('\n=== a calc column alongside the quick-filter expression column ===');
  await tryView(
    'both expression columns in one view',
    {
      expressions: { ...CALC, __quick__: "match(lower(string(\"desk\")), 'rates')" },
      filter: [['__quick__', '==', true]],
      sort: [['grossPnl', 'desc']],
    },
    async (v) => `${await v.num_rows()} rows`,
  );

  console.log('\n=== a BROKEN expression must not take the whole view down silently ===');
  await tryView('references a column that does not exist', { expressions: { x: '"nope" * 2' } },
    async (v) => `${await v.num_rows()} rows`);
  await tryView('syntactically invalid', { expressions: { x: '"price" *' } },
    async (v) => `${await v.num_rows()} rows`);

  console.log('\n=== validate_expressions: can bad ones be found BEFORE they blank the grid? ===');
  try {
    const result = await table.validate_expressions({
      good: '"price" * "quantity"',
      missingCol: '"nope" * 2',
      syntax: '"price" *',
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
