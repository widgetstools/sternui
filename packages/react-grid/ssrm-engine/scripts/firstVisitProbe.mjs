/**
 * Does a lab's seeded profile APPLY on a genuine first visit?
 *
 * `useLabDemoProfiles` writes the demo bundle through `handle.setConfig`, which
 * applies the serialized config and then loads the active profile. If that
 * lands, a first-time visitor sees the configured grid. If it only lands on the
 * SECOND load, every new reader gets the bare grid — which for a lab whose whole
 * purpose is "open it and you are on the product path" is the failure the lab
 * was built to remove.
 *
 * Runs with a FRESH browser profile per pass (Playwright's default context is
 * already clean) and asserts on the calculated columns, because those only
 * exist if the seeded module state reached the pipeline.
 *
 *   node packages/react-grid/ssrm-engine/scripts/firstVisitProbe.mjs \
 *     --url http://localhost:5321/ --expect-calc 6
 */
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const url = opt('url', 'http://localhost:5321/');
const tab = opt('tab', '');
const expectCalc = Number(opt('expect-calc', '6'));

const read = async (page) =>
  page.evaluate(() => {
    const h = window.__ssrmEngineGrid;
    const api = h?.api;
    const cols = api?.getColumns?.() ?? [];
    return {
      cols: cols.length,
      calc: cols.map((c) => c.getColId()).filter((i) => i.startsWith('calc_')).length,
      rows: api?.getDisplayedRowCount?.() ?? null,
      seeded: Object.keys(localStorage).some((k) => k.startsWith('lab-demo-profiles')),
    };
  });

const browser = await chromium.launch({ headless: false });
try {
  // FIRST VISIT — a clean context, which is what a new reader has.
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  if (tab) await page.click(`[data-testid="lab-tab-${tab}"]`);
  await page.waitForSelector('.ag-row', { timeout: 180_000 });
  await page.waitForTimeout(25_000);
  const first = await read(page);

  // SECOND LOAD — same context, so storage carries over.
  await page.reload({ waitUntil: 'domcontentloaded' });
  if (tab) await page.click(`[data-testid="lab-tab-${tab}"]`);
  await page.waitForSelector('.ag-row', { timeout: 180_000 });
  await page.waitForTimeout(25_000);
  const second = await read(page);

  console.log(`\n=== does the seeded profile apply on the FIRST visit? · ${url}\n`);
  console.log(`  first visit   ${first.cols} columns, ${first.calc} calculated, ${first.rows} rows, bundle written: ${first.seeded}`);
  console.log(`  second load   ${second.cols} columns, ${second.calc} calculated, ${second.rows} rows`);

  const ok = first.calc >= expectCalc;
  console.log(
    `\n  ${ok ? 'PASS' : 'FAIL'}  the seeded profile is live on the first visit` +
      `${ok ? '' : ` — ${first.calc} of ${expectCalc} calculated columns, and ${second.calc} after a reload`}\n`,
  );
  if (!ok) process.exitCode = 1;
  await context.close();
} finally {
  await browser.close();
}
