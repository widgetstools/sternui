/**
 * Follow-up to quickFilterProbe.mjs. Round 1 established:
 *   - `match(lower("col"), 'term')` is the string-search primitive
 *   - `index_of` / `search` / `like` / `ilike` do NOT exist
 *   - `||` is NOT an operator ("Invalid use of reserved symbol '|'")
 *   - `match` treats the term as a REGEX — '.*' matched every row
 *   - `string("numeric")` works, so numeric columns can join the search
 *   - a single quote in the term breaks the expression, and '' does not escape
 *
 * This round settles: how to OR, whether the haystack can be concatenated
 * (which replaces OR entirely), and exactly what must be escaped in user input.
 */
import perspective from '@perspective-dev/client/node';

const ok = (label, extra = '') => console.log(`  OK   ${label}${extra ? ' — ' + extra : ''}`);
const bad = (label, e) => console.log(`  FAIL ${label} — ${String(e?.message ?? e).slice(0, 130)}`);

let table;

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
  ]);
  console.log(`table: ${await table.size()} rows\n`);

  console.log('=== how do you OR? ===');
  await countExpr('or keyword', "match(lower(\"trader\"), 'mike') or match(lower(\"desk\"), 'mike')");
  await countExpr('and keyword', "match(lower(\"desk\"), 'rates') and match(lower(\"trader\"), 'mike')");
  await countExpr('| single pipe', "match(lower(\"trader\"), 'mike') | match(lower(\"desk\"), 'mike')");
  await countExpr('addition as or', "(match(lower(\"trader\"), 'mike') + match(lower(\"desk\"), 'mike')) > 0");

  console.log('\n=== can the haystack be CONCATENATED instead? (replaces OR entirely) ===');
  await sampleExpr('concat two strings', 'concat("trader", \' \', "desk")');
  await sampleExpr('lower(concat(...))', 'lower(concat("trader", \' \', "desk"))');
  await sampleExpr("concat with a stringified number", 'concat("trader", \' \', string("quantity"))');
  await countExpr(
    'match over a concatenated haystack',
    "match(lower(concat(\"trader\", ' ', \"desk\")), 'rates')",
  );
  await countExpr(
    'multi-token AND over one haystack',
    "match(lower(concat(\"trader\", ' ', \"desk\")), 'sarah') and " +
      "match(lower(concat(\"trader\", ' ', \"desk\")), 'rates')",
  );

  console.log('\n=== regex metacharacters in USER INPUT (match is a regex) ===');
  // A trader is literally named "Sarah (Ann) Williams". Searching for "(ann)"
  // must find it, not throw and not match everything.
  await countExpr('unescaped "(ann)"', "match(lower(\"trader\"), '(ann)')");
  await countExpr('escaped "\\(ann\\)"', "match(lower(\"trader\"), '\\(ann\\)')");
  await countExpr('bare dot matches anything', "match(lower(\"trader\"), 'j.hnson')");
  await countExpr('escaped dot is literal', "match(lower(\"trader\"), 'j\\.hnson')");
  await countExpr('lone open paren (invalid regex)', "match(lower(\"trader\"), '(')");
  await countExpr('escaped lone open paren', "match(lower(\"trader\"), '\\(')");

  console.log('\n=== a literal QUOTE in user input ===');
  await countExpr("backslash-escaped quote", "match(lower(\"trader\"), 'o\\'brien')");
  await countExpr('doubled quote', "match(lower(\"trader\"), 'o''brien')");
  await countExpr('quote avoided via a dot wildcard', "match(lower(\"trader\"), 'o.brien')");

  console.log('\n=== null / empty handling ===');
  await table.update([{ positionId: 'p4', desk: null, trader: null, quantity: 50 }]);
  await sampleExpr('concat with a null column', 'concat("trader", \' \', "desk")');
  await countExpr(
    'a null row must not match a term',
    "match(lower(concat(\"trader\", ' ', \"desk\")), 'rates')",
  );

  await table.delete();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
