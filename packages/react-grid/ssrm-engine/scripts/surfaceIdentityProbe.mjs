/**
 * WHICH surface is actually under test on this URL?
 *
 * A probe that cannot tell the surfaces apart can report the control's numbers
 * as the treatment's, and this lab has three of them on one tab family: the
 * Perspective MarketsGrid (the default), the ssrm-engine MarketsGrid
 * (`?engine=ssrm&surface=marketsgrid`) and the plain `AgGridReact` ssrm control
 * (`?engine=ssrm`).
 *
 * It also re-checks the trap session 1 found and fixed: `StressTestTab` once
 * called `useLabPerspectiveRows` unconditionally, so `?engine=ssrm` built the
 * whole Perspective Table in the SharedWorker **as well as** the engine's own
 * book — and the first renderer figure taken that session was two engines
 * recorded against one.
 *
 *   node packages/react-grid/ssrm-engine/scripts/surfaceIdentityProbe.mjs \
 *     --url "http://localhost:5311/?engine=ssrm&surface=marketsgrid"
 */
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const url = opt('url', 'http://localhost:5311/?engine=ssrm&surface=marketsgrid');
const tab = opt('tab', 'stress');

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1800, height: 1000 } });
try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.click(`[data-testid="lab-tab-${tab}"]`);
  await page.waitForSelector('.ag-row', { timeout: 180_000 });
  await page.waitForTimeout(20_000);

  const out = await page.evaluate(async () => {
    const el = document.querySelector('.ag-root-wrapper');
    const k = Object.keys(el).find((x) => x.startsWith('__reactFiber$'));
    let f = el[k];
    let ctx = null;
    while (f && !ctx) {
      const v = f.memoizedProps?.value;
      if (v && typeof v === 'object' && v.platform && 'engineKind' in v) ctx = v;
      f = f.return;
    }
    const handle = window.__ssrmEngineGrid ?? null;
    const api = handle?.api ?? ctx?.platform?.api?.api ?? null;

    let introspect = null;
    try {
      introspect = await handle?.introspect?.();
    } catch {
      /* not on this surface */
    }

    return {
      // What the ssrm handle says it is. Absent entirely on the Perspective
      // branch, which publishes no such global.
      ssrmHandle: handle ? (handle.surface ?? 'unknown') : null,
      // What the PLATFORM says, which is the authority every customizer module
      // reads and cannot be faked by a probe picking the wrong global.
      engineKind: ctx?.engineKind ?? null,
      rowModelType: (() => {
        try {
          return api?.getGridOption?.('rowModelType') ?? null;
        } catch {
          return null;
        }
      })(),
      // Is a Perspective Table alive in this window too? The session-1 trap.
      perspectiveGlobals: Object.keys(globalThis).filter((x) => /perspective/i.test(x)),
      hasPerspectiveHandle: Boolean(globalThis.__perspectiveGrid ?? globalThis.__pspGrid),
      // The worker-held books this window can see.
      books: introspect?.books ?? null,
      rows: (() => {
        try {
          return api?.getDisplayedRowCount?.() ?? null;
        } catch {
          return null;
        }
      })(),
      testIds: [...document.querySelectorAll('[data-testid]')]
        .map((n) => n.getAttribute('data-testid'))
        .filter((t) => /ssrm|perspective|marketsgrid/i.test(t))
        .slice(0, 8),
    };
  });

  console.log(`\n=== which surface is this? · ${url}\n`);
  console.log(`  __ssrmEngineGrid.surface   ${out.ssrmHandle ?? '(no ssrm handle — Perspective branch)'}`);
  console.log(`  platform engineKind        ${out.engineKind}`);
  console.log(`  AG rowModelType            ${out.rowModelType}`);
  console.log(`  displayed rows             ${out.rows}`);
  console.log(`  mount test-ids             ${out.testIds.join(', ') || '(none)'}`);
  console.log(`  perspective globals        ${out.perspectiveGlobals.join(', ') || '(none)'}`);
  console.log(`  a Perspective handle too?  ${out.hasPerspectiveHandle}`);
  if (out.books) {
    console.log(`  worker books               ${JSON.stringify(out.books)}`);
  }
  console.log('');
} finally {
  await browser.close();
}
