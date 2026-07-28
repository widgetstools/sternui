/**
 * Perspective 4.5.2 probe.
 *
 * Answers the one question that decides the MarketsGrid topology:
 * how much does each additional live View cost per table.update()?
 *
 * On @finos/perspective 3.8 this measured ~2.4ms + 2.6ms/view on a
 * 202-col x 20k-row table — a hard ceiling that would cap N blotters
 * fed from a single worker-held Table. If 4.5.2 kept that curve, the
 * shared-Table topology trades a per-window cost for a shared-thread one.
 */
import perspective from '@perspective-dev/client/node';

const COLS = 52;      // matches the positions blotter
const ROWS = 20_000;  // matches the live snapshot

function makeSchema() {
  const s = { positionId: 'string' };
  for (let i = 1; i < COLS; i++) s[`c${i}`] = i % 3 === 0 ? 'string' : 'float';
  return s;
}

function makeRows(n, offset = 0) {
  const rows = [];
  for (let r = 0; r < n; r++) {
    const row = { positionId: `p${r + offset}` };
    for (let i = 1; i < COLS; i++) row[`c${i}`] = i % 3 === 0 ? `s${r}` : r + i;
    rows.push(row);
  }
  return rows;
}

const ms = (t) => `${t.toFixed(2)}ms`;

async function main() {
  console.log('=== Perspective probe: API surface ===');
  console.log('default export keys:', Object.keys(perspective).join(', ') || '(none)');

  // In Node the module IS the local client — `table()` is top-level.
  // `worker()` expects a real Worker and is browser-only.
  const client = perspective;

  console.log('\n=== Load: 20k x 52 ===');
  let t = performance.now();
  const table = await client.table(makeSchema(), { index: 'positionId' });
  await table.update(makeRows(ROWS));
  console.log(`initial load: ${ms(performance.now() - t)}  rows=${await table.size()}`);

  // Tick payload representative of a live STOMP batch.
  const tick = makeRows(500);

  console.log('\n=== View cost curve (per table.update of 500 rows) ===');
  const views = [];
  const counts = [0, 1, 2, 4, 8];
  const results = [];

  for (const target of counts) {
    while (views.length < target) {
      views.push(await table.view());
    }
    // warm
    await table.update(tick);
    const N = 10;
    const start = performance.now();
    for (let i = 0; i < N; i++) await table.update(tick);
    const per = (performance.now() - start) / N;
    results.push({ views: target, per });
    console.log(`  ${String(target).padStart(2)} view(s): ${ms(per)} / update`);
  }

  const base = results[0].per;
  const eight = results[results.length - 1].per;
  const slope = (eight - base) / 8;
  console.log(`\n  base ${ms(base)} + ~${ms(slope)} per view`);
  console.log(
    slope < 0.5
      ? '  => VERDICT: cheap. Shared worker-held Table scales to many blotters.'
      : `  => VERDICT: ~${ms(slope)}/view/tick is a shared-thread ceiling; at 8 blotters that is ${ms(eight)} per tick.`,
  );

  console.log('\n=== Virtualized read (what a scrolled window actually fetches) ===');
  const v = views[0];
  t = performance.now();
  const win = await v.to_columns({ start_row: 0, end_row: 100 });
  console.log(`  100-row window: ${ms(performance.now() - t)}  cols=${Object.keys(win).length}`);

  t = performance.now();
  await v.to_columns({ start_row: 10_000, end_row: 10_100 });
  console.log(`  deep window @10k: ${ms(performance.now() - t)}`);

  for (const view of views) await view.delete();
  await table.delete();
  console.log('\nclean teardown OK');
}

main().catch((e) => {
  console.error('PROBE FAILED:', e?.message ?? e);
  process.exit(1);
});
