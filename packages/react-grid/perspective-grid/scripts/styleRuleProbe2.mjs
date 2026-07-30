/**
 * Follow-up to `styleRuleProbe.mjs`, which turned up two things that decide
 * the design and neither of which is documented:
 *
 *   - `avg("price")` / `sum("price")` PARSE and are silently ROW-WISE. They
 *     are the scalar avg/sum of their arguments, so `avg("price")` is just
 *     `"price"` and `"price" > avg("price")` is `false` for every row, with
 *     no error anywhere. Anything that maps StarUI's AVG/SUM onto them
 *     produces a rule that never matches and never complains.
 *   - `"price" > 95` answered TRUE for the row whose price is NULL.
 *
 * This pins down exactly how null behaves per operator, and whether there is
 * a guard (`is_null`) to write into the compiled source.
 */
import perspective from '@perspective-dev/client/node';

const ok = (label, extra = '') => console.log(`  OK   ${label}${extra ? ' — ' + extra : ''}`);
const bad = (label, e) => console.log(`  FAIL ${label} — ${String(e?.message ?? e).slice(0, 160)}`);

let table;

async function read(label, src) {
  let view;
  try {
    view = await table.view({ expressions: { probe: src } });
    ok(label, JSON.stringify((await view.to_columns()).probe));
  } catch (e) {
    bad(label, e);
  } finally {
    if (view) await view.delete();
  }
}

async function main() {
  table = await perspective.table(
    { id: 'string', price: 'float', name: 'string' },
    { index: 'id' },
  );
  // Rows in order: 110, 100, 90, null
  await table.update([
    { id: 'a', price: 110, name: 'alpha' },
    { id: 'b', price: 100, name: 'beta' },
    { id: 'c', price: 90, name: null },
    { id: 'd', price: null, name: null },
  ]);
  console.log('rows: price = [110, 100, 90, null], name = [alpha, beta, null, null]\n');

  console.log('=== how does a NULL row answer each comparison? ===');
  for (const op of ['>', '>=', '<', '<=', '==', '!=']) {
    await read(`"price" ${op} 95`, `"price" ${op} 95`);
  }

  console.log('\n=== is there a null guard to compile in front of it? ===');
  for (const src of [
    'is_null("price")',
    'is_not_null("price")',
    'is_null("name")',
    'if(is_null("price"), false, "price" > 95)',
    'not(is_null("price")) and "price" > 95',
  ]) {
    await read(src, src);
  }

  console.log('\n=== confirm the row-wise trap, spelled out ===');
  await read('avg("price") — should be the column mean 100 if aggregate', 'avg("price")');
  await read('avg("price", 0) — two args, proves it is scalar-over-args', 'avg("price", 0)');
  await read('sum("price", 1)', 'sum("price", 1)');
  await read('min("price", 95)', 'min("price", 95)');

  console.log('\n=== and that the substituted-literal form is correct ===');
  await read('"price" > 100 (the measured mean, substituted)', '"price" > 100');
  await read(
    'guarded: not(is_null("price")) and "price" > 100',
    'not(is_null("price")) and "price" > 100',
  );

  await table.delete();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
