/**
 * Does the renderer's memory scale with COLUMNS, and is it our path or AG's?
 *
 * Three variants of the same tab, renderer working set measured the same way:
 *
 *   MarketsGrid 50k x 40   — pull path, few columns
 *   MarketsGrid 50k x 400  — pull path, many columns   <- the one that dies
 *   Plain AG    50k x 400  — client-side control, many columns
 *
 * If only the middle one is large, it is the pull path's per-block column
 * payload. If both 400-column ones are large, it is AG/DOM and not ours.
 * Each variant is measured in a FRESH browser, or the previous one's retention
 * would be counted against the next.
 */
import { chromium } from '@playwright/test';
import { execSync } from 'node:child_process';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const url = opt('url', 'http://localhost:5301');

function workingSets() {
  const out = {};
  try {
    const csv = execSync('tasklist /FI "IMAGENAME eq chrome.exe" /FO CSV /NH', { encoding: 'utf8' });
    for (const line of csv.split(/\r?\n/)) {
      const m = line.match(/^"[^"]*","(\d+)",".*?",".*?","([\d,. ]+) K"/);
      if (m) out[Number(m[1])] = Math.round(Number(m[2].replace(/[^\d]/g, '')) / 1024);
    }
  } catch { /* */ }
  return out;
}

async function measure(variant, scrollRounds) {
  const browser = await chromium.launch({ headless: false, args: ['--remote-debugging-port=0'] });
  const page = await browser.newPage({ viewport: { width: 2200, height: 1300 } });
  const browserCdp = await browser.newBrowserCDPSession();
  const pageCdp = await page.context().newCDPSession(page);
  await pageCdp.send('Performance.enable');

  const rendererMB = async () => {
    const ws = workingSets();
    let procs = [];
    try { procs = (await browserCdp.send('SystemInfo.getProcessInfo')).processInfo ?? []; } catch { /* */ }
    const vals = procs.filter((p) => p.type === 'renderer').map((p) => ws[p.id]).filter((n) => n);
    return Math.max(0, ...vals);
  };

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.click('[data-testid="lab-tab-stress"]');
    await page.waitForTimeout(3000);
    await page.click('button[role="combobox"]');
    await page.waitForTimeout(400);
    for (const o of await page.$$('[role="option"]')) {
      if (((await o.textContent()) ?? '').trim() === variant) { await o.click(); break; }
    }
    await page.waitForSelector('.ag-row', { timeout: 180_000 });
    await page.waitForTimeout(20_000);

    const cols = await page.evaluate(() => document.querySelectorAll('.ag-header-cell').length);
    const idle = await rendererMB();

    const box = await (await page.$('.ag-body-viewport, .ag-root-wrapper')).boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    for (let r = 0; r < scrollRounds; r++) {
      for (let i = 0; i < 60; i++) { await page.mouse.wheel(700, 0); await page.waitForTimeout(35); }
      for (let i = 0; i < 40; i++) { await page.mouse.wheel(0, 900); await page.waitForTimeout(30); }
    }
    await page.waitForTimeout(4000);
    const after = await rendererMB();
    const m = await pageCdp.send('Performance.getMetrics');
    const by = Object.fromEntries(m.metrics.map((x) => [x.name, x.value]));

    console.log(
      `${variant.padEnd(34)} headerCells=${String(cols).padStart(4)}` +
      ` · renderer idle ${String(idle).padStart(5)} MB -> after scroll ${String(after).padStart(5)} MB` +
      ` · jsHeap ${Math.round((by.JSHeapUsedSize ?? 0) / 1048576)} MB · nodes ${by.Nodes ?? 0}`,
    );
  } catch (err) {
    console.log(`${variant}: DRIVER ERROR ${String(err).slice(0, 160)}`);
  } finally {
    try { await browser.close(); } catch { /* */ }
  }
}

const rounds = Number(opt('rounds', '2'));
await measure('MarketsGrid SSRM · 50k × 40', rounds);
await measure('MarketsGrid · 50k × 400 (modules)', rounds);
await measure('Plain AG Grid · 50k × 400', rounds);
