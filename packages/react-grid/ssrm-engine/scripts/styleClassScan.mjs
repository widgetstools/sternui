/**
 * Which `ds-*` conditional-styling classes reach the DOM, on any lab tab.
 *
 * A discriminator, not a measurement. `styleRuleHeaderProbe` found no header
 * class on the ssrm surface — and no CELL or ROW class either, which is a
 * different fault entirely. This says whether conditional styling paints at all
 * on a given tab, so "the header seam is broken" is not concluded from a grid
 * where nothing paints.
 *
 *   node packages/react-grid/ssrm-engine/scripts/styleClassScan.mjs \
 *     --url "http://localhost:5311/?engine=ssrm&surface=marketsgrid" --tab stress
 */
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const url = opt('url', 'http://localhost:5311/');
const tab = opt('tab', 'stress');

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1800, height: 1000 } });
try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.click(`[data-testid="lab-tab-${tab}"]`);
  await page.waitForSelector('.ag-row', { timeout: 180_000 });
  await page.waitForTimeout(20_000);

  const out = await page.evaluate(() => {
    const classes = (selector) => [
      ...new Set(
        [...document.querySelectorAll(selector)]
          .flatMap((el) => [...el.classList])
          .filter((c) => c.startsWith('ds-')),
      ),
    ];
    const el = document.querySelector('.ag-root-wrapper');
    const k = Object.keys(el).find((x) => x.startsWith('__reactFiber$'));
    let f = el[k];
    let ctx = null;
    while (f && !ctx) {
      const value = f.memoizedProps?.value;
      if (value && typeof value === 'object' && value.platform && 'engineKind' in value) ctx = value;
      f = f.return;
    }
    const rules = ctx?.platform?.store?.getModuleState?.('conditional-styling')?.rules ?? [];
    return {
      engineKind: ctx?.engineKind ?? null,
      rules: rules.map((r) => `${r.id}(${r.scope?.type}${r.indicator?.target ? ` ind:${r.indicator.target}` : ''})`),
      rows: classes('.ag-row'),
      cells: classes('.ag-cell'),
      headers: classes('.ag-header-cell'),
      cellCount: document.querySelectorAll('.ag-cell').length,
    };
  });

  console.log(`\n=== ds-* classes · ${url} · tab ${tab}\n`);
  console.log(`  engineKind : ${out.engineKind}`);
  console.log(`  rules      : ${out.rules.join(', ') || '(none)'}`);
  console.log(`  ${out.cellCount} cells in the DOM`);
  console.log(`  on rows    : ${out.rows.join(', ') || '(none)'}`);
  console.log(`  on cells   : ${out.cells.join(', ') || '(none)'}`);
  console.log(`  on headers : ${out.headers.join(', ') || '(none)'}\n`);
} finally {
  await browser.close();
}
