/**
 * Engine-to-engine control for "applying a filter takes a while".
 *
 * The saved-filter PILLS cannot be used as the shared trigger: the CSRM lab's
 * Stress tab renders none (the seeded-profile defect, issue 1 in
 * docs/perspective-grid-issuetobefixed.md), so a pill click would compare a
 * surface with pills against one without. This drives AG's own
 * `setFilterModel` + `onFilterChanged` instead — identical on both engines —
 * and measures to the same end marker: the last row repaint before the grid
 * goes quiet.
 *
 *   node filterApplyProbe.mjs --url http://localhost:5301
 */
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const url = opt('url', 'http://localhost:5301');
const variant = opt('variant', 'MarketsGrid · 50k × 400 (modules)');
const settle = Number(opt('settle', '20000'));

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.click('[data-testid="lab-tab-stress"]');
await page.waitForTimeout(3000);
await page.click('button[role="combobox"]');
await page.waitForTimeout(400);
for (const o of await page.$$('[role="option"]')) {
  if (((await o.textContent()) ?? '').trim() === variant) { await o.click(); break; }
}
await page.waitForSelector('.ag-row', { timeout: 180_000 });
await page.waitForTimeout(settle);

const groupBy = opt('group', '');   // e.g. "assetClass,issuerSector" or "none"

const setup = await page.evaluate((groupBy) => {
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
  if (!api) return { ok: false };
  const state = { lastPaint: 0, paints: 0, t0: 0 };
  window.__fa = { api, state };
  new MutationObserver((muts) => {
    let added = 0;
    for (const m of muts) for (const n of m.addedNodes) {
      if (n.nodeType === 1 && n.classList?.contains('ag-row')) added += 1;
    }
    if (added > 2) { state.lastPaint = performance.now(); state.paints += 1; }
  }).observe(el, { childList: true, subtree: true });
  // Force the SAME grouping on both engines. The seeded profile applies on one
  // lab and not the other (the seeded-profile defect), so left alone this would
  // compare a grouped grid against a flat one and call the difference "engine".
  if (groupBy) {
    api.setRowGroupColumns(groupBy === 'none' ? [] : groupBy.split(','));
  }
  return {
    ok: true,
    rowModel: api.getGridOption('rowModelType'),
    groupCols: (api.getRowGroupColumns?.() ?? []).map((c) => c.getColId?.() ?? String(c)),
    rows: document.querySelectorAll('.ag-row').length,
  };
}, groupBy);
if (groupBy) await page.waitForTimeout(8000);
console.log('setup:', JSON.stringify(setup));
if (!setup.ok) { await browser.close(); process.exit(1); }

for (const [label, model] of [
  ['apply CorpIG', { assetClass: { filterType: 'set', values: ['CorpIG'] } }],
  ['clear', null],
  ['apply Rates', { assetClass: { filterType: 'set', values: ['Rates'] } }],
]) {
  // What the user is waiting for is the grid showing a DIFFERENT set of rows,
  // and a group tree that collapses to one row adds no DOM at all — so the
  // signal is AG's own displayed-row count plus the top group's label, polled
  // inside the page (identical on both row models).
  const r = await page.evaluate(async (model) => {
    const { api } = window.__fa;
    // The marker must require DATA, not just a store resize. A purge changes
    // `getDisplayedRowCount()` immediately — before a single row has been read —
    // so a count-only marker times the PURGE and reports a filter as "applied"
    // seconds before its rows exist. Reading a value cell as well is what makes
    // this comparable between a client-side and a server-side row model.
    const read = () => {
      const rows = [...document.querySelectorAll('.ag-row')];
      const cells = rows
        .map((r) => ({
          key: r.querySelector('[col-id="ag-Grid-AutoColumn"]')?.textContent?.trim() ?? '',
          val: r.querySelector('[col-id="marketValue"]')?.textContent?.trim() ?? '',
        }))
        .filter((c) => c.key && c.val);
      return `${api.getDisplayedRowCount()}|${cells.length}|${cells.map((c) => `${c.key}=${c.val}`).join(',').slice(0, 60)}`;
    };
    const before = read();
    const t0 = performance.now();
    api.setFilterModel(model);
    api.onFilterChanged();

    let changedAt = null;
    let last = before;
    let lastChangeAt = t0;
    const deadline = t0 + 40_000;
    while (performance.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
      const now = read();
      if (now !== last) {
        last = now;
        lastChangeAt = performance.now();
        if (changedAt === null) changedAt = lastChangeAt;
      }
      // Settled = something changed and nothing has changed for 1.5 s since.
      if (changedAt !== null && performance.now() - lastChangeAt > 1500) break;
    }
    return {
      before,
      after: last,
      first: changedAt === null ? null : Math.round(changedAt - t0),
      settled: changedAt === null ? null : Math.round(lastChangeAt - t0),
    };
  }, model);
  console.log(
    `${label.padEnd(14)} first change ${String(r.first).padStart(6)} ms · settled ${String(r.settled).padStart(6)} ms   ${r.before} -> ${r.after}`,
  );
  await page.waitForTimeout(2500);
}

await browser.close();
