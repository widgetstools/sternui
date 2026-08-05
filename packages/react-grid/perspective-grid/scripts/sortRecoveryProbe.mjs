/**
 * What the grid shows between a sort and the rows coming back.
 *
 * Reported from a desk: "when the user sorts it almost becomes empty — 2-4 rows
 * at the top, then it literally paints the screen from top to bottom."
 *
 * A sort PURGES the server-side store, and AG then rebuilds it from
 * `serverSideInitialRowCount` — whose default is **1** — growing it as blocks
 * arrive. So the viewport is not merely waiting for data, it is briefly claiming
 * the book is one row long, and the scrollbar and row count say so too.
 *
 * This records the row count the grid reports every 50 ms across a sort, so the
 * collapse and the recovery are numbers rather than an impression.
 *
 *   node packages/react-grid/perspective-grid/scripts/sortRecoveryProbe.mjs
 */
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const url = opt('url', 'http://localhost:5301');

const gridApi = () => {
  const el = document.querySelector('.ag-root-wrapper');
  const k = Object.keys(el).find((x) => x.startsWith('__reactFiber$'));
  let f = el[k], api = null;
  while (f && !api) {
    const pr = f.memoizedProps;
    if (typeof pr?.api?.getColumns === 'function') api = pr.api;
    let h = f.memoizedState;
    while (h && !api) { if (typeof h.memoizedState?.getColumns === 'function') api = h.memoizedState; h = h.next; }
    f = f.return;
  }
  return api;
};

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.click('[data-testid="lab-tab-stress"]');
await page.waitForSelector('.ag-row', { timeout: 180_000 });
await page.waitForTimeout(15_000);
await page.evaluate(`(${gridApi.toString()})().setRowGroupColumns([])`);
await page.waitForTimeout(10_000);

const { samples: timeline, reqs } = await page.evaluate(`(async () => {
  const api = (${gridApi.toString()})();
  const samples = [];
  const reqs = [];
  const t0 = performance.now();

  // Where does the wait go? A block request that itself takes ~1.4 s means the
  // engine is building the sorted View inside getView; several short ones mean
  // the block is queued behind something else.
  const ds = api.getGridOption('serverSideDatasource');
  if (ds && !ds.__srWrapped) {
    const inner = ds.getRows.bind(ds);
    ds.getRows = (params) => {
      const at = Math.round(performance.now() - t0);
      const rec = { at, ms: null, start: params.request.startRow, sort: (params.request.sortModel || []).length };
      reqs.push(rec);
      const ok = params.success, bad = params.fail;
      params.success = (x) => { rec.ms = Math.round(performance.now() - t0) - at; ok(x); };
      params.fail = () => { rec.ms = -1; bad(); };
      return inner(params);
    };
    ds.__srWrapped = true;
  }
  const tick = () => samples.push({
    t: Math.round(performance.now() - t0),
    rows: api.getDisplayedRowCount?.() ?? -1,
    // Rows actually carrying data, out of those on screen.
    painted: (() => {
      const first = api.getFirstDisplayedRowIndex?.() ?? 0;
      const last = api.getLastDisplayedRowIndex?.() ?? -1;
      let shown = 0, withData = 0;
      for (let i = first; i <= last; i++) {
        const n = api.getDisplayedRowAtIndex(i);
        if (!n) continue;
        shown += 1;
        if (n.data !== undefined && n.data !== null) withData += 1;
      }
      return { shown, withData };
    })(),
  });
  const id = setInterval(tick, 50);
  tick();

  await new Promise((r) => setTimeout(r, 600));
  // A real sort, the way the column header does it.
  api.applyColumnState({
    state: [{ colId: 'marketValue', sort: 'desc' }],
    defaultState: { sort: null },
  });
  await new Promise((r) => setTimeout(r, 20_000));
  clearInterval(id);
  return { samples, reqs };
})()`);

await browser.close();

const before = timeline[0]?.rows ?? 0;
const sortAt = 600;
const after = timeline.filter((s) => s.t >= sortAt);
const min = Math.min(...after.map((s) => s.rows));
const minAt = after.find((s) => s.rows === min)?.t;
const recovered = after.find((s) => s.t > (minAt ?? 0) && s.rows >= before * 0.99);
const fullyPainted = after.find(
  (s) => s.t > sortAt && s.painted.shown > 0 && s.painted.withData === s.painted.shown,
);

console.log(`\nrows before the sort: ${before}`);
console.log(`LOWEST reported row count after it: ${min}  (at +${(minAt ?? 0) - sortAt} ms)`);
console.log(`row count back to full: ${recovered ? `+${recovered.t - sortAt} ms` : 'NOT within 20 s'}`);
console.log(`viewport fully painted:  ${fullyPainted ? `+${fullyPainted.t - sortAt} ms` : 'NOT within 20 s'}`);

console.log('\n=== block requests around the sort ===');
for (const r of reqs.filter((r) => r.at > sortAt - 300).slice(0, 14)) {
  console.log(
    `  issued +${String(r.at - sortAt).padStart(6)} ms · startRow ${String(r.start).padStart(6)}` +
      ` · sortModel ${r.sort} · settled in ${r.ms} ms`,
  );
}

console.log('\n  t(ms)   reported rows   painted/shown');
for (const s of after.filter((_, i) => i % 4 === 0).slice(0, 26)) {
  console.log(
    `  ${String(s.t - sortAt).padStart(6)}   ${String(s.rows).padStart(13)}   ${s.painted.withData}/${s.painted.shown}`,
  );
}
