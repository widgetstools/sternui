/**
 * Proves the drain-before-delete rule survives the exact scenario that
 * crashed the process in `deleteRaceProbe.mjs` against the real 4.5.2 wasm
 * engine (mocks cannot prove this — the failure lives in wasm borrow rules).
 *
 * Mirrors `src/safeView.ts` in plain JS so the probe has no build step.
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

/** Same contract as src/safeView.ts::createSafeView. */
function createSafeView(view) {
  let pending = 0;
  let closing = false;
  let deleted = null;
  let waiters = [];
  const settle = () => {
    if (pending === 0 && waiters.length) {
      const w = waiters;
      waiters = [];
      w.forEach((r) => r());
    }
  };
  return {
    get pending() {
      return pending;
    },
    async read(win) {
      if (closing) return null;
      pending++;
      try {
        return await view.to_columns(win);
      } finally {
        pending--;
        settle();
      }
    },
    close() {
      if (deleted) return deleted;
      closing = true;
      deleted = (async () => {
        if (pending > 0) {
          await new Promise((res) => {
            waiters.push(res);
            settle();
          });
        }
        await view.delete();
      })();
      return deleted;
    },
  };
}

let unhandled = 0;
process.on('unhandledRejection', (e) => {
  unhandled++;
  console.log(`  [unhandledRejection] ${String(e?.message ?? e).slice(0, 80)}`);
});

async function main() {
  const table = await perspective.table(schema(), { index: 'positionId' });
  await table.update(rows(ROWS));
  console.log(`table ready: ${await table.size()} rows\n`);

  console.log('=== A. close() DURING an in-flight read (the case that crashed) ===');
  const safe = createSafeView(await table.view());
  const read = safe.read({ start_row: 0, end_row: 5000 });
  const closed = safe.close(); // fired without awaiting the read
  const cols = await read;
  await closed;
  console.log(`  read resolved: ${Object.keys(cols ?? {}).length} cols`);
  console.log('  close resolved cleanly — no borrow error\n');

  console.log('=== B. rapid view churn (sort/filter swaps) ===');
  for (let i = 0; i < 25; i++) {
    const s = createSafeView(await table.view());
    const r = s.read({ start_row: i * 100, end_row: i * 100 + 100 });
    const c = s.close();
    await r;
    await c;
  }
  console.log('  25 create/read/close cycles: OK\n');

  console.log('=== C. table.update() concurrent with view churn ===');
  for (let i = 0; i < 15; i++) {
    const s = createSafeView(await table.view());
    const both = Promise.all([
      table.update(rows(200)),
      s.read({ start_row: 0, end_row: 200 }),
    ]);
    const c = s.close();
    await both;
    await c;
  }
  console.log('  15 update+read+close cycles: OK\n');

  console.log('=== D. many concurrent reads, closed mid-flight ===');
  const s2 = createSafeView(await table.view());
  const reads = Array.from({ length: 12 }, (_, i) =>
    s2.read({ start_row: i * 500, end_row: i * 500 + 500 }),
  );
  const c2 = s2.close();
  const settled = await Promise.all(reads);
  await c2;
  console.log(`  ${settled.filter(Boolean).length}/12 reads resolved, then deleted once`);
  console.log(`  reads refused after close: ${(await s2.read({ start_row: 0, end_row: 1 })) === null}`);

  await table.delete();
  console.log(`\nunhandled rejections: ${unhandled}`);
  console.log(
    unhandled === 0
      ? 'VERDICT: drain-before-delete fully mitigates the 4.5.2 borrow race.'
      : 'VERDICT: still leaking — mitigation incomplete.',
  );
}

main().catch((e) => {
  console.error('PROBE FAILED:', e?.message ?? e);
  process.exit(1);
});
