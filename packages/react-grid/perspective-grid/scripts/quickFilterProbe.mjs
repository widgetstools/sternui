/**
 * Pins down how to express AG Grid's quick filter in 4.5.2.
 *
 * The problem: AG's quick filter matches a row when ANY column contains the
 * text, and Perspective filter clause lists are CONJUNCTIVE — an OR across
 * columns cannot be written as clauses at all. So it has to become a boolean
 * expression column that the filter then tests.
 *
 * Which means the expression language's string functions have to be pinned
 * down exactly. Guessing them yields either an exception or, far worse, an
 * expression that evaluates to null and silently matches nothing.
 */
import perspective from '@perspective-dev/client/node';

const ok = (label, extra = '') => console.log(`  OK   ${label}${extra ? ' — ' + extra : ''}`);
const bad = (label, e) => console.log(`  FAIL ${label} — ${String(e?.message ?? e).slice(0, 140)}`);

let table;

/** Build a view with `expr` as column `__q__`, count rows where it is true. */
async function tryExpr(label, expr) {
  let view;
  try {
    view = await table.view({
      expressions: { __q__: expr },
      filter: [['__q__', '==', true]],
    });
    const n = await view.num_rows();
    ok(label, `${n} rows match`);
    return n;
  } catch (e) {
    bad(label, e);
    return null;
  } finally {
    if (view) await view.delete();
  }
}

/** Read the computed column back, so a silently-null expression is caught. */
async function sampleExpr(label, expr) {
  let view;
  try {
    view = await table.view({ expressions: { __q__: expr } });
    const cols = await view.to_columns({ start_row: 0, end_row: 4 });
    ok(label, JSON.stringify(cols.__q__));
    return cols.__q__;
  } catch (e) {
    bad(label, e);
    return null;
  } finally {
    if (view) await view.delete();
  }
}

async function main() {
  table = await perspective.table(
    {
      positionId: 'string',
      desk: 'string',
      trader: 'string',
      quantity: 'float',
    },
    { index: 'positionId' },
  );
  await table.update([
    { positionId: 'p0', desk: 'RATES', trader: 'Mike Johnson', quantity: 10 },
    { positionId: 'p1', desk: 'CREDIT', trader: 'Jane Doe', quantity: 20 },
    { positionId: 'p2', desk: 'FX', trader: 'mike smith', quantity: 30 },
    { positionId: 'p3', desk: 'RATES', trader: 'Sarah Williams', quantity: 40 },
  ]);
  console.log(`table: ${await table.size()} rows`);
  console.log(`(expect: 'mike' case-insensitively matches p0 and p2)\n`);

  console.log('=== does a bare `contains` filter clause exist (single column)? ===');
  for (const [label, clause] of [
    ["contains 'RATES' on desk", ['desk', 'contains', 'RATES']],
    ["contains lowercase 'rates'", ['desk', 'contains', 'rates']],
  ]) {
    let view;
    try {
      view = await table.view({ filter: [clause] });
      ok(label, `${await view.num_rows()} rows`);
    } catch (e) {
      bad(label, e);
    } finally {
      if (view) await view.delete();
    }
  }

  console.log('\n=== string functions in the expression language ===');
  await sampleExpr('lower("trader")', 'lower("trader")');
  await sampleExpr('upper("trader")', 'upper("trader")');
  await sampleExpr('index_of', 'index_of(lower("trader"), \'mike\')');
  await sampleExpr('search (regex)', "search(\"trader\", '.*[Mm]ike.*')");
  await sampleExpr('match', "match(\"trader\", 'mike')");
  await sampleExpr('match lower', "match(lower(\"trader\"), 'mike')");
  await sampleExpr('ilike', "ilike(\"trader\", '%mike%')");
  await sampleExpr('like', "like(\"trader\", '%mike%')");

  console.log('\n=== boolean expression column, filtered on == true ===');
  await tryExpr('index_of >= 0', 'index_of(lower("trader"), \'mike\') >= 0');
  await tryExpr('match lower', "match(lower(\"trader\"), 'mike')");
  await tryExpr('ilike', "ilike(\"trader\", '%mike%')");

  console.log('\n=== OR across columns — the actual requirement ===');
  await tryExpr(
    'two columns with ||',
    "match(lower(\"trader\"), 'mike') || match(lower(\"desk\"), 'mike')",
  );
  await tryExpr(
    'three columns, term that only hits desk',
    "match(lower(\"trader\"), 'rates') || match(lower(\"desk\"), 'rates') || match(lower(\"positionId\"), 'rates')",
  );

  console.log('\n=== multi-token AND-of-ORs (AG splits on whitespace) ===');
  await tryExpr(
    "'mike' AND 'rates' — should be p0 only",
    "(match(lower(\"trader\"), 'mike') || match(lower(\"desk\"), 'mike')) && " +
      "(match(lower(\"trader\"), 'rates') || match(lower(\"desk\"), 'rates'))",
  );

  console.log('\n=== a numeric column in the OR (quick filter spans all columns) ===');
  await sampleExpr('string(quantity)', 'string("quantity")');
  await tryExpr('match on a stringified number', "match(string(\"quantity\"), '20')");

  console.log('\n=== hostile input: does a quote or backslash break the expression? ===');
  await tryExpr("term containing a single quote", "match(lower(\"trader\"), 'o''brien')");
  await tryExpr('term containing a regex metachar', "match(lower(\"trader\"), '.*')");

  await table.delete();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
