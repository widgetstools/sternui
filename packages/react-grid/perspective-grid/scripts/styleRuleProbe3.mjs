/**
 * `not(is_null("price")) and "price" > 95` answered FALSE for every row in
 * `styleRuleProbe2.mjs`, where the two operands are [t,t,t,f] and [t,t,f,t]
 * and the answer should be [t,t,f,f]. `if(is_null(...), false, ...)` gave the
 * right answer on the same data.
 *
 * That matters well beyond style rules: `compileStarUiExpressionToPerspective`
 * emits `(left and right)` for every StarUI `AND`, so if `and` does not
 * compose boolean sub-expressions, every multi-clause calculated column on
 * this path is silently false. This isolates which of `and`, `or` and `not`
 * behaves, and on which operand shapes.
 */
import perspective from '@perspective-dev/client/node';

const ok = (label, extra = '') => console.log(`  ${label}\n       => ${extra}`);
const bad = (label, e) => console.log(`  ${label}\n       => FAIL ${String(e?.message ?? e).slice(0, 140)}`);

let table;

async function read(src, note = '') {
  let view;
  try {
    view = await table.view({ expressions: { probe: src } });
    ok(src + (note ? `   (${note})` : ''), JSON.stringify((await view.to_columns()).probe));
  } catch (e) {
    bad(src, e);
  } finally {
    if (view) await view.delete();
  }
}

async function main() {
  table = await perspective.table(
    { id: 'string', price: 'float', qty: 'float', desk: 'string' },
    { index: 'id' },
  );
  await table.update([
    { id: 'a', price: 110, qty: 5, desk: 'RATES' },
    { id: 'b', price: 100, qty: 50, desk: 'RATES' },
    { id: 'c', price: 90, qty: 5, desk: 'CREDIT' },
    { id: 'd', price: null, qty: 50, desk: 'CREDIT' },
  ]);
  console.log('price = [110, 100, 90, null]   qty = [5, 50, 5, 50]   desk = [R, R, C, C]\n');

  console.log('=== operands, for reference ===');
  await read('"price" > 95', 'expect [t,t,f,t] — null matches >');
  await read('"qty" > 10', 'expect [f,t,f,t]');
  await read('is_not_null("price")', 'expect [t,t,t,f]');
  await read('not(is_null("price"))', 'expect [t,t,t,f]');

  console.log('\n=== does `and` compose two comparisons? ===');
  await read('"price" > 95 and "qty" > 10', 'expect [f,t,f,t]');
  await read('("price" > 95) and ("qty" > 10)', 'parenthesised');
  await read('"price" > 95 && "qty" > 10', 'C-style');

  console.log('\n=== does `and` compose a FUNCTION result with a comparison? ===');
  await read('is_not_null("price") and "price" > 95', 'expect [t,t,f,f]');
  await read('not(is_null("price")) and "price" > 95', 'expect [t,t,f,f]');
  await read('(is_not_null("price")) and ("price" > 95)', 'parenthesised');
  await read('is_not_null("price") && "price" > 95', 'C-style');

  console.log('\n=== `or`, same shapes ===');
  await read('"price" > 105 or "qty" > 10', 'expect [t,t,f,t]');
  await read('is_null("price") or "qty" > 10', 'expect [f,t,f,t]');
  await read('"price" > 105 || "qty" > 10', 'C-style');

  console.log('\n=== the working form, for comparison ===');
  await read('if(is_null("price"), false, "price" > 95)', 'expect [t,t,f,f]');
  await read('if("price" > 95, if("qty" > 10, true, false), false)', 'nested if as AND');

  console.log('\n=== what type does a comparison actually produce? ===');
  for (const src of ['"price" > 95', 'is_not_null("price")', '"price" > 95 and "qty" > 10']) {
    try {
      const r = await table.validate_expressions({ probe: src });
      console.log(`  ${src}\n       => schema ${JSON.stringify(r.expression_schema)}`);
    } catch (e) {
      console.log(`  ${src} => FAIL ${e.message}`);
    }
  }

  await table.delete();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
