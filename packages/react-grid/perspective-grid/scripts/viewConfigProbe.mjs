/**
 * Pins down the exact 4.5.2 View-config surface we must translate AG Grid
 * state into: sort, filter, group_by + aggregates, and expressions.
 * Guessing these shapes is how you get silently-wrong blotter numbers.
 */
import perspective from '@perspective-dev/client/node';

const ok = (label, extra = '') => console.log(`  OK   ${label}${extra ? ' — ' + extra : ''}`);
const bad = (label, e) => console.log(`  FAIL ${label} — ${String(e?.message ?? e).slice(0, 110)}`);

async function try_(label, fn) {
  try {
    const r = await fn();
    ok(label, r);
    return true;
  } catch (e) {
    bad(label, e);
    return false;
  }
}

async function main() {
  const table = await perspective.table(
    {
      positionId: 'string',
      desk: 'string',
      currency: 'string',
      quantity: 'float',
      price: 'float',
      pnl: 'float',
    },
    { index: 'positionId' },
  );
  await table.update(
    Array.from({ length: 500 }, (_, i) => ({
      positionId: `p${i}`,
      desk: ['RATES', 'CREDIT', 'FX'][i % 3],
      currency: ['USD', 'EUR'][i % 2],
      quantity: i,
      price: 100 + (i % 17),
      pnl: (i % 23) - 11,
    })),
  );
  console.log(`table: ${await table.size()} rows\n`);

  console.log('=== validate_expressions / expression syntax ===');
  await try_('expressions as object map', async () => {
    const v = await table.view({
      expressions: { notional: '"quantity" * "price"' },
      columns: ['positionId', 'notional'],
    });
    const c = await v.to_columns({ start_row: 0, end_row: 2 });
    const out = `notional[0]=${c.notional?.[0]}`;
    await v.delete();
    return out;
  });
  await try_('expressions as string array (3.x style)', async () => {
    const v = await table.view({ expressions: ['// notional\n"quantity" * "price"'] });
    await v.delete();
    return 'accepted';
  });

  console.log('\n=== sort ===');
  for (const [label, sort] of [
    ['[[col, "desc"]]', [['quantity', 'desc']]],
    ['[[col, "asc"]] multi', [['desk', 'asc'], ['quantity', 'desc']]],
  ]) {
    await try_(label, async () => {
      const v = await table.view({ sort });
      const c = await v.to_columns({ start_row: 0, end_row: 3 });
      const out = `first quantity=${c.quantity?.[0]}`;
      await v.delete();
      return out;
    });
  }

  console.log('\n=== filter ===');
  for (const [label, filter] of [
    ['numeric >', [['quantity', '>', 400]]],
    ['string ==', [['desk', '==', 'RATES']]],
    ['in', [['desk', 'in', ['RATES', 'FX']]]],
    ['between-ish (two clauses)', [['quantity', '>', 100], ['quantity', '<', 200]]],
    ['is not null', [['desk', 'is not null']]],
  ]) {
    await try_(label, async () => {
      const v = await table.view({ filter });
      const n = await v.num_rows();
      await v.delete();
      return `${n} rows`;
    });
  }

  console.log('\n=== group_by + aggregates ===');
  await try_('group_by single', async () => {
    const v = await table.view({ group_by: ['desk'] });
    const n = await v.num_rows();
    const c = await v.to_columns({ start_row: 0, end_row: 5 });
    await v.delete();
    return `${n} rows (incl. grand total), keys=${Object.keys(c).slice(0, 3).join(',')}`;
  });
  await try_('aggregates map', async () => {
    const v = await table.view({
      group_by: ['desk'],
      aggregates: { pnl: 'sum', price: 'avg', quantity: 'high' },
    });
    const c = await v.to_columns({ start_row: 0, end_row: 4 });
    await v.delete();
    return `pnl[0]=${c.pnl?.[0]}`;
  });
  await try_('weighted mean', async () => {
    const v = await table.view({
      group_by: ['desk'],
      aggregates: { price: ['weighted mean', 'quantity'] },
    });
    const c = await v.to_columns({ start_row: 0, end_row: 3 });
    await v.delete();
    return `price[0]=${c.price?.[0]}`;
  });
  await try_('__ROW_PATH__ present on grouped view', async () => {
    const v = await table.view({ group_by: ['desk'] });
    const c = await v.to_columns({ start_row: 0, end_row: 4 });
    const rp = c.__ROW_PATH__;
    await v.delete();
    return rp ? `yes, e.g. ${JSON.stringify(rp[1])}` : 'ABSENT';
  });

  console.log('\n=== expression used in sort / filter / group_by ===');
  await try_('sort by expression column', async () => {
    const v = await table.view({
      expressions: { notional: '"quantity" * "price"' },
      sort: [['notional', 'desc']],
    });
    const c = await v.to_columns({ start_row: 0, end_row: 2 });
    await v.delete();
    return `top notional=${c.notional?.[0]}`;
  });
  await try_('filter on expression column', async () => {
    const v = await table.view({
      expressions: { notional: '"quantity" * "price"' },
      filter: [['notional', '>', 10000]],
    });
    const n = await v.num_rows();
    await v.delete();
    return `${n} rows`;
  });
  await try_('group_by expression column', async () => {
    const v = await table.view({
      expressions: { bucket: `bucket("quantity", 100)` },
      group_by: ['bucket'],
    });
    const n = await v.num_rows();
    await v.delete();
    return `${n} rows`;
  });

  await table.delete();
  console.log('\ndone');
}

main().catch((e) => {
  console.error('PROBE FAILED:', e?.message ?? e);
  process.exit(1);
});
