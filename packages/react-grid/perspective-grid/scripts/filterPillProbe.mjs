/**
 * Filter-pill latency probe.
 *
 * Separates the three candidates named in the handoff:
 *   - the store purge + fresh View build (getRows timings)
 *   - the pill count badge (ssrmCountMatching timings)
 *   - toolbar debounce (click -> filterChanged)
 *
 * Usage:  node filterPillProbe.mjs [--url http://localhost:5301] [--nobadge] [--tab filters]
 */
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : dflt;
};
const url = opt('url', 'http://localhost:5301');
const tab = opt('tab', 'filters');
const noBadge = args.includes('--nobadge');

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('console', (m) => {
  if (m.type() === 'error') console.log('[page error]', m.text().slice(0, 200));
});

const variant = opt('variant', '');
const pillWanted = opt('pill', 'qf-corp-ig');

await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.click(`[data-testid="lab-tab-${tab}"]`);
if (variant) {
  await page.click('button[role="combobox"]');
  await page.click(`[role="option"]:has-text("${variant}")`);
  await page.waitForTimeout(3000);
}
await page.waitForSelector('.ag-row', { timeout: 180_000 });
// Let the book settle and any first-render churn finish.
await page.waitForTimeout(Number(opt('settle', '8000')));

const installed = await page.evaluate((noBadge) => {
  const el = document.querySelector('.ag-root-wrapper');
  const k = Object.keys(el).find((x) => x.startsWith('__reactFiber$'));
  let f = el[k];
  let api = null;
  while (f && !api) {
    const pr = f.memoizedProps;
    if (typeof pr?.api?.getColumns === 'function') api = pr.api;
    let h = f.memoizedState;
    while (h && !api) {
      if (typeof h.memoizedState?.getColumns === 'function') api = h.memoizedState;
      h = h.next;
    }
    f = f.return;
  }
  if (!api) return { ok: false, why: 'no api' };

  const log = [];
  const t = () => Math.round(performance.now());
  window.__probe = { log, api, t0: null };

  // The Perspective Table itself, so a View BUILD can be told apart from the
  // read that follows it — `viewManager` reports that split through `onEvent`,
  // which nothing on this surface subscribes to.
  let table = null;
  for (let g = el[k]; g && !table; g = g.return) {
    const cand = g.memoizedProps?.table;
    if (cand && typeof cand.view === 'function') table = cand;
  }
  if (table && !table.__probeWrapped) {
    const view = table.view.bind(table);
    table.view = async (config) => {
      const s = performance.now();
      const shape = `by=[${(config?.group_by || []).join('+')}] f=[${(config?.filter || []).map((c) => `${c[0]}${c[1]}${c[2] ?? ''}`).join('+')}] agg=${Object.keys(config?.aggregates || {}).length} ex=${Object.keys(config?.expressions || {}).join('+')}`;
      const stack = (new Error().stack || '').split(String.fromCharCode(10)).slice(2, 6).map((l) => l.trim().replace(/^at /, '').split(' ')[0]).join('<');
      log.push({ at: t(), ev: 'view:start', shape, stack });
      const v = await view(config);
      const built = Math.round(performance.now() - s);
      log.push({ at: t(), ev: 'view:built', ms: built, shape });
      if (typeof v?.num_rows === 'function') {
        const nr = v.num_rows.bind(v);
        v.num_rows = async () => {
          const s2 = performance.now();
          const n = await nr();
          log.push({ at: t(), ev: 'view:num_rows', ms: Math.round(performance.now() - s2), n });
          return n;
        };
      }
      if (typeof v?.to_columns === 'function') {
        const tc = v.to_columns.bind(v);
        v.to_columns = async (w) => {
          const s2 = performance.now();
          const c = await tc(w);
          log.push({ at: t(), ev: 'view:to_columns', ms: Math.round(performance.now() - s2) });
          return c;
        };
      }
      return v;
    };
    table.__probeWrapped = true;
  }

  for (const ev of ['filterChanged', 'modelUpdated', 'storeRefreshed', 'storeUpdated']) {
    try {
      api.addEventListener(ev, () => log.push({ at: t(), ev }));
    } catch { /* not all events exist */ }
  }

  const ctx = api.getGridOption('context');
  let wrappedCount = false;
  if (ctx && typeof ctx.ssrmCountMatching === 'function') {
    const orig = ctx.ssrmCountMatching.bind(ctx);
    ctx.ssrmCountMatching = (m) => {
      const s = performance.now();
      const id = JSON.stringify(m ?? null).slice(0, 48);
      if (noBadge) {
        log.push({ at: t(), ev: 'count:suppressed', id });
        return Promise.resolve(null);
      }
      log.push({ at: t(), ev: 'count:start', id });
      return Promise.resolve(orig(m)).then((v) => {
        log.push({ at: t(), ev: 'count:end', ms: Math.round(performance.now() - s), id, v });
        return v;
      });
    };
    wrappedCount = true;
  }

  const ds = api.getGridOption('serverSideDatasource');
  let wrappedDs = false;
  if (ds && typeof ds.getRows === 'function' && !ds.__probeWrapped) {
    const g = ds.getRows.bind(ds);
    ds.getRows = (params) => {
      const s = performance.now();
      const r = params.request ?? {};
      const tag = `${r.startRow}-${r.endRow} grp=${(r.rowGroupCols || []).length} keys=${(r.groupKeys || []).length} flt=${Object.keys(r.filterModel || {}).join('|')}`;
      log.push({ at: t(), ev: 'getRows:start', tag });
      const sc = params.success;
      const fc = params.fail;
      params.success = (x) => {
        log.push({
          at: t(), ev: 'getRows:success', ms: Math.round(performance.now() - s), tag,
          rows: x?.rowData?.length, rowCount: x?.rowCount,
        });
        sc(x);
      };
      params.fail = () => {
        log.push({ at: t(), ev: 'getRows:fail', tag });
        fc();
      };
      return g(params);
    };
    ds.__probeWrapped = true;
    wrappedDs = true;
  }

  document.addEventListener(
    'pointerdown',
    (e) => {
      const pill = e.target?.closest?.('[data-testid^="filter-pill-"]');
      if (pill) {
        window.__probe.t0 = t();
        log.push({ at: t(), ev: 'CLICK', tag: pill.getAttribute('data-testid') });
      }
    },
    true,
  );

  // Row paint: only count .ag-row additions, and only report bursts.
  const root = document.querySelector('.ag-root-wrapper');
  new MutationObserver((muts) => {
    let added = 0;
    for (const m of muts) {
      for (const n of m.addedNodes) {
        if (n.nodeType === 1 && n.classList?.contains('ag-row')) added += 1;
      }
    }
    if (added > 0) log.push({ at: t(), ev: 'rows+', n: added });
  }).observe(root, { childList: true, subtree: true });

  // Status-bar text — the engine's own filtered count reaching the DOM.
  const bar = document.querySelector('.ag-status-bar');
  if (bar) {
    let last = bar.textContent;
    new MutationObserver(() => {
      const now = bar.textContent;
      if (now !== last) {
        last = now;
        log.push({ at: t(), ev: 'status', text: (now || '').trim().slice(0, 60) });
      }
    }).observe(bar, { childList: true, subtree: true, characterData: true });
  }

  return {
    ok: true, wrappedCount, wrappedDs, hasBar: !!bar,
    pills: [...document.querySelectorAll('[data-testid^="filter-pill-"]')]
      .map((p) => p.getAttribute('data-testid'))
      .filter((d) => !d.includes('count') && !d.includes('menu') && !d.includes('details')),
  };
}, noBadge);

console.log('installed:', JSON.stringify(installed, null, 1));
if (!installed.ok) { await browser.close(); process.exit(1); }

const target = installed.pills.find((p) => p.endsWith(pillWanted)) ?? installed.pills[1];
console.log('clicking', target);

await page.evaluate(() => { window.__probe.log.length = 0; });
await page.click(`[data-testid="${target}"]`);
await page.waitForTimeout(6000);

const out = await page.evaluate(() => {
  const { log, t0 } = window.__probe;
  return { t0, log };
});

const t0 = out.t0 ?? out.log[0]?.at ?? 0;
console.log(`\n=== timeline (ms relative to click) · nobadge=${noBadge} · ${url} ===`);
for (const e of out.log) {
  const rel = e.at - t0;
  const extra = Object.entries(e)
    .filter(([k]) => k !== 'at' && k !== 'ev')
    .map(([k, v]) => `${k}=${v}`)
    .join(' ');
  console.log(`${String(rel).padStart(6)}  ${e.ev.padEnd(16)} ${extra}`);
}

// ─── Summary — the numbers the three candidates are told apart by ──────────
const first = (pred) => out.log.find(pred);
const rel = (e) => (e ? e.at - t0 : null);
const filterChanged = first((e) => e.ev === 'filterChanged');
const dsStart = first((e) => e.ev === 'getRows:start');
const dsDone = first((e) => e.ev === 'getRows:success');
// The paint that matters is the burst after the store was refilled, not the
// one-row churn a live tick causes before the filter has even been pushed.
const paint = out.log.find((e) => e.ev === 'rows+' && e.n > 3 && dsDone && e.at >= dsDone.at);
const countsInWindow = out.log.filter(
  (e) => e.ev === 'count:end' && (!paint || e.at <= paint.at),
);
const countMs = countsInWindow.reduce((a, e) => a + (e.ms ?? 0), 0);

console.log('\n=== summary (ms after the click) ===');
console.log(`  toolbar debounce   click -> filterChanged   ${rel(filterChanged)}`);
console.log(`  first block asked  click -> getRows:start   ${rel(dsStart)}`);
console.log(`  View + read        getRows ms               ${dsDone?.ms ?? null} (${dsDone?.rows ?? '?'} rows of ${dsDone?.rowCount ?? '?'})`);
console.log(`  rows on screen     click -> paint burst     ${rel(paint)}`);
console.log(`  badge engine work  sum of countMatching ms  ${countMs} over ${countsInWindow.length} calls`);

await browser.close();
