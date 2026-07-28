/**
 * Does `view.delete()` racing an in-flight read still corrupt the client?
 *
 * On @finos/perspective 3.8 this was a hard failure: the JS handle was
 * destroyed SYNCHRONOUSLY (`__wbg_ptr = 0`) before `view_delete` was known
 * to have succeeded, while async `&self` methods held an RcRef borrow for
 * the whole future. Result: "attempted to take ownership of Rust value
 * while it was borrowed", the delete promise NEVER settled, and the
 * server-side view leaked permanently. Worse, it surfaced inside a
 * wasm-futures microtask, so `try { await ... } catch {}` did NOT catch it.
 *
 * A sort/filter change swaps Views while blocks are in flight, so if this
 * is still broken the View lifecycle needs read-draining before delete.
 * If it is fixed, delete can be immediate and the code stays simple.
 */
import perspective from '@perspective-dev/client/node';

const COLS = 52;
const ROWS = 20_000;

function schema() {
  const s = { positionId: 'string' };
  for (let i = 1; i < COLS; i++) s[`c${i}`] = i % 3 === 0 ? 'string' : 'float';
  return s;
}
function rows(n) {
  const out = [];
  for (let r = 0; r < n; r++) {
    const row = { positionId: `p${r}` };
    for (let i = 1; i < COLS; i++) row[`c${i}`] = i % 3 === 0 ? `s${r}` : r + i;
    out.push(row);
  }
  return out;
}

const withTimeout = (p, ms, label) =>
  Promise.race([
    p.then((v) => ({ ok: true, v })).catch((e) => ({ ok: false, e })),
    new Promise((res) => setTimeout(() => res({ hung: true, label }), ms)),
  ]);

let unhandled = 0;
process.on('unhandledRejection', (e) => {
  unhandled++;
  console.log(`  [unhandledRejection] ${String(e?.message ?? e).slice(0, 90)}`);
});

async function main() {
  const table = await perspective.table(schema(), { index: 'positionId' });
  await table.update(rows(ROWS));
  console.log(`table ready: ${await table.size()} rows\n`);

  console.log('=== A. delete() DURING an in-flight to_columns ===');
  const v1 = await table.view();
  const read = v1.to_columns({ start_row: 0, end_row: 5000 });
  const del = v1.delete(); // fire without awaiting the read

  const readRes = await withTimeout(read, 5000, 'read');
  const delRes = await withTimeout(del, 5000, 'delete');
  console.log(
    `  read:   ${readRes.hung ? 'HUNG (never settled)' : readRes.ok ? 'resolved' : `rejected: ${String(readRes.e?.message).slice(0, 60)}`}`,
  );
  console.log(
    `  delete: ${delRes.hung ? 'HUNG (never settled)' : delRes.ok ? 'resolved' : `rejected: ${String(delRes.e?.message).slice(0, 60)}`}`,
  );

  console.log('\n=== B. is the CLIENT still usable afterwards? ===');
  const v2 = await table.view();
  const after = await withTimeout(v2.to_columns({ start_row: 0, end_row: 100 }), 5000, 'after');
  console.log(
    `  new view read: ${after.hung ? 'HUNG — client corrupted' : after.ok ? `OK (${Object.keys(after.v).length} cols)` : `rejected: ${String(after.e?.message).slice(0, 60)}`}`,
  );

  console.log('\n=== C. rapid view churn (sort/filter swap simulation) ===');
  let churnErrors = 0;
  for (let i = 0; i < 25; i++) {
    const v = await table.view();
    const r = v.to_columns({ start_row: i * 100, end_row: i * 100 + 100 });
    v.delete().catch(() => churnErrors++);
    const res = await withTimeout(r, 3000, `churn${i}`);
    if (res.hung || !res.ok) churnErrors++;
  }
  console.log(`  25 create/read/delete cycles — failures: ${churnErrors}`);

  console.log('\n=== D. update() concurrent with view churn ===');
  let concurrentErrors = 0;
  for (let i = 0; i < 15; i++) {
    const v = await table.view();
    const both = Promise.all([
      table.update(rows(200)),
      v.to_columns({ start_row: 0, end_row: 200 }),
    ]);
    v.delete().catch(() => concurrentErrors++);
    const res = await withTimeout(both, 3000, `conc${i}`);
    if (res.hung || !res.ok) concurrentErrors++;
  }
  console.log(`  15 update+read+delete cycles — failures: ${concurrentErrors}`);

  await v2.delete();
  await table.delete();

  const clean =
    !readRes.hung && !delRes.hung && !after.hung && churnErrors === 0 && concurrentErrors === 0;
  console.log(`\nunhandled rejections: ${unhandled}`);
  console.log(
    clean && unhandled === 0
      ? 'VERDICT: 4.5.2 handles delete-during-read safely — immediate delete is fine.'
      : 'VERDICT: races still bite — View lifecycle must drain in-flight reads before delete.',
  );
}

main().catch((e) => {
  console.error('PROBE FAILED:', e?.message ?? e);
  process.exit(1);
});
