/**
 * Total RENDERER PROCESS memory — the number Chrome actually kills on.
 *
 * `performance.memory` / `JSHeapUsedSize` report the JS heap ONLY. WebAssembly
 * memory, the compositor, and AG's DOM are not in it, and this window runs its
 * own Perspective client. A tab can die of "Out of Memory" with a 500 MB JS
 * heap, which is exactly what the earlier probes kept showing.
 *
 * PIDs come from CDP `SystemInfo.getProcessInfo`; the working set comes from the
 * OS, because CDP does not report per-process memory.
 *
 * Drives the axis that costs most: HORIZONTAL scroll across the whole book, on
 * a large viewport. The Stress tab is a single surface now, so there is no
 * variant to select.
 *
 *   node rendererProcessProbe.mjs [--minutes 6] [--width 2560] [--height 1400]
 */
import { chromium } from '@playwright/test';
import { execSync } from 'node:child_process';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const url = opt('url', 'http://localhost:5301');
const minutes = Number(opt('minutes', '6'));
const width = Number(opt('width', '2560'));
const height = Number(opt('height', '1400'));
const PORT = 9334;

const browser = await chromium.launch({
  headless: false,
  args: [`--remote-debugging-port=${PORT}`, `--window-size=${width},${height}`],
});
const page = await browser.newPage({ viewport: { width, height } });
let crashed = false;
page.on('crash', () => { crashed = true; console.log('!!! RENDERER CRASHED (Aw, Snap)'); });

const browserCdp = await browser.newBrowserCDPSession();
const pageCdp = await page.context().newCDPSession(page);
await pageCdp.send('Performance.enable');

/** Working set per PID, from the OS. Chrome splits across processes. */
function workingSets() {
  const out = {};
  try {
    const csv = execSync('tasklist /FI "IMAGENAME eq chrome.exe" /FO CSV /NH', { encoding: 'utf8' });
    for (const line of csv.split(/\r?\n/)) {
      const m = line.match(/^"[^"]*","(\d+)",".*?",".*?","([\d,. ]+) K"/);
      if (m) out[Number(m[1])] = Math.round(Number(m[2].replace(/[^\d]/g, '')) / 1024);
    }
  } catch { /* tasklist unavailable */ }
  return out;
}

const stamp = () => new Date().toISOString().slice(11, 19);
let phase = 'boot';

const sample = async () => {
  const ws = workingSets();
  let procs = [];
  try {
    const info = await browserCdp.send('SystemInfo.getProcessInfo');
    procs = info.processInfo ?? [];
  } catch { /* not all builds expose it */ }
  const renderers = procs.filter((p) => p.type === 'renderer');
  const rendererMB = renderers.map((p) => ws[p.id]).filter((n) => typeof n === 'number');
  const totalMB = Object.values(ws).reduce((a, b) => a + b, 0);
  const m = await pageCdp.send('Performance.getMetrics').catch(() => null);
  const by = m ? Object.fromEntries(m.metrics.map((x) => [x.name, x.value])) : {};
  console.log(
    `${stamp()} ${phase.padEnd(18)} renderers[${rendererMB.join(', ')}] MB` +
    ` · chrome total ${totalMB} MB · jsHeap ${Math.round((by.JSHeapUsedSize ?? 0) / 1048576)} MB` +
    ` · nodes ${by.Nodes ?? 0}`,
  );
};

const poll = setInterval(() => { void sample(); }, 5000);

try {
  phase = 'load';
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.click('[data-testid="lab-tab-stress"]');
  phase = 'attach';
  await page.waitForSelector('.ag-row', { timeout: 180_000 });
  phase = 'settle';
  await page.waitForTimeout(20_000);

  await page.evaluate(() => {
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
    window.__cp = { api, cols: api?.getColumns?.()?.length ?? 0 };
  });
  console.log('columns:', await page.evaluate(() => window.__cp.cols));

  const box = await (await page.$('.ag-body-viewport, .ag-root-wrapper')).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

  const deadline = Date.now() + minutes * 60_000;
  let round = 0;
  while (Date.now() < deadline && !crashed) {
    round += 1;

    // HORIZONTAL: right across all 400 columns, then back. Every step brings a
    // new column window into the DOM and asks the engine for it.
    phase = `r${round} scroll right`;
    for (let i = 0; i < 60 && !crashed; i++) {
      await page.mouse.wheel(600, 0);
      await page.waitForTimeout(40);
    }
    await page.waitForTimeout(2500);
    await sample();

    phase = `r${round} scroll left`;
    for (let i = 0; i < 60 && !crashed; i++) {
      await page.mouse.wheel(-600, 0);
      await page.waitForTimeout(40);
    }
    await page.waitForTimeout(2500);
    await sample();

    phase = `r${round} scroll down`;
    for (let i = 0; i < 40 && !crashed; i++) {
      await page.mouse.wheel(0, 900);
      await page.waitForTimeout(30);
    }
    await page.waitForTimeout(2500);
    await sample();
  }
} catch (err) {
  console.log('DRIVER ERROR:', String(err).slice(0, 300));
} finally {
  clearInterval(poll);
  console.log(crashed ? 'RESULT: renderer died' : 'RESULT: survived');
  try { await browser.close(); } catch { /* */ }
}
