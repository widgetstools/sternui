/**
 * `not(<boolean>)` is unusable in 4.5.2, and unusable in the worst way.
 *
 * MEASURED in `styleRuleProbe3.mjs`:
 *   not(is_null("price"))                      -> Abort: Type Error
 *   not(is_null("price")) and "price" > 95     -> [f,f,f,f]   NO ERROR
 *
 * The second form is the dangerous one: `and` itself composes correctly
 * (`is_not_null("price") and "price" > 95` gives the right answer), so the
 * `not` silently poisons the whole expression to false instead of failing.
 *
 * `compileStarUiExpressionToPerspective` emits `not(${operand})` for every
 * StarUI `NOT`, so this is a live bug on the calculated-column path too, not
 * just something style rules have to avoid. This probe finds the spelling
 * that actually negates a boolean.
 */
import perspective from '@perspective-dev/client/node';

let table;

async function read(src, note = '') {
  let view;
  try {
    view = await table.view({ expressions: { probe: src } });
    const col = (await view.to_columns()).probe;
    console.log(`  OK   ${src}${note ? `   (${note})` : ''}\n         ${JSON.stringify(col)}`);
  } catch (e) {
    console.log(`  FAIL ${src}\n         ${String(e?.message ?? e).slice(0, 130)}`);
  } finally {
    if (view) await view.delete();
  }
}

async function main() {
  table = await perspective.table(
    { id: 'string', price: 'float', qty: 'float' },
    { index: 'id' },
  );
  await table.update([
    { id: 'a', price: 110, qty: 5 },
    { id: 'b', price: 100, qty: 50 },
    { id: 'c', price: 90, qty: 5 },
    { id: 'd', price: null, qty: 50 },
  ]);
  console.log('price = [110, 100, 90, null]   qty = [5, 50, 5, 50]');
  console.log('target: NOT("qty" > 10)  ==  [true, false, true, false]\n');

  console.log('=== how do you negate a boolean? ===');
  await read('not("qty" > 10)', 'what the compiler emits today');
  await read('!("qty" > 10)');
  await read('("qty" > 10) == false', 'compare against false');
  await read('("qty" > 10) != true');
  await read('if("qty" > 10, false, true)', 'if-swap');

  console.log('\n=== is `not` usable on anything at all? ===');
  await read('not("qty")', 'numeric argument');
  await read('not(1)');
  await read('not(true)');

  console.log('\n=== does the silent poisoning reach `or` and `if` too? ===');
  await read('not("qty" > 10) or "price" > 105', 'expect [t,f,t,t]');
  await read('if(not("qty" > 10), 1, 0)', 'expect [1,0,1,0]');

  console.log('\n=== does validate_expressions CATCH the poisoned form? ===');
  for (const src of [
    'not("qty" > 10)',
    'not("qty" > 10) and "price" > 95',
    'if("qty" > 10, false, true)',
  ]) {
    try {
      const r = await table.validate_expressions({ probe: src });
      console.log(
        `  ${src}\n         schema ${JSON.stringify(r.expression_schema)} errors ${JSON.stringify(r.errors)}`,
      );
    } catch (e) {
      console.log(`  ${src}\n         THREW ${String(e?.message ?? e).slice(0, 110)}`);
    }
  }

  console.log('\n=== nested negation via the if-swap, to be sure it composes ===');
  await read('if("qty" > 10, false, true) and "price" > 95', 'expect [t,f,f,f]');
  await read('if(if("qty" > 10, false, true), 1, 0)');

  await table.delete();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
