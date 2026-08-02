/**
 * Does the SharedWorker die under the 50k x 400 tab?
 *
 * The page surviving proves nothing: the book lives in a SharedWorker, and an
 * uncatchable wasm abort there takes the Table down without the renderer
 * noticing — the grid simply stops. Playwright's page-level CDP session cannot
 * see SharedWorkers, so this attaches a RAW WebSocket to the browser endpoint
 * and watches every worker target: its console, its exceptions, and whether it
 * is destroyed.
 *
 *   node workerCrashProbe.mjs [--minutes 6]
 */
import { chromium } from '@playwright/test';
import WebSocket from 'ws';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const url = opt('url', 'http://localhost:5301');
const variant = opt('variant', 'MarketsGrid · 50k × 400 (modules)');
const minutes = Number(opt('minutes', '6'));
const PORT = 9333;

const stamp = () => new Date().toISOString().slice(11, 23);
const browser = await chromium.launch({
  headless: false,
  args: [`--remote-debugging-port=${PORT}`],
});

// Browser-level CDP over a raw socket: flattened child sessions arrive tagged
// with `sessionId`, which Playwright's own CDP wrapper does not surface.
const version = await fetch(`http://127.0.0.1:${PORT}/json/version`).then((r) => r.json());
const ws = new WebSocket(version.webSocketDebuggerUrl, { perMessageDeflate: false });
await new Promise((resolve) => ws.once('open', resolve));

let nextId = 1;
const pending = new Map();
const send = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });

const workerSessions = new Map(); // sessionId -> url
let workerDied = false;

ws.on('message', (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    return;
  }
  const { method, params, sessionId } = msg;

  if (method === 'Target.attachedToTarget') {
    const info = params.targetInfo;
    const sid = params.sessionId;
    if (info.type === 'shared_worker' || info.type === 'worker' || info.type === 'service_worker') {
      workerSessions.set(sid, info.url);
      console.log(`${stamp()} ATTACHED ${info.type} ${info.url.split('/').pop()}`);
      void send('Runtime.enable', {}, sid).catch(() => {});
      void send('Log.enable', {}, sid).catch(() => {});
    }
    void send('Runtime.runIfWaitingForDebugger', {}, sid).catch(() => {});
    return;
  }

  if (method === 'Target.detachedFromTarget' && workerSessions.has(params.sessionId)) {
    const gone = workerSessions.get(params.sessionId);
    workerSessions.delete(params.sessionId);
    workerDied = true;
    console.log(`${stamp()} !!! WORKER GONE  ${gone}`);
    return;
  }

  if (method === 'Target.targetCrashed') {
    workerDied = true;
    console.log(`${stamp()} !!! TARGET CRASHED ${JSON.stringify(params)}`);
    return;
  }

  const who = workerSessions.get(sessionId);
  if (!who) return;
  const tag = who.split('/').pop();

  if (method === 'Runtime.exceptionThrown') {
    const d = params.exceptionDetails;
    console.log(`${stamp()} !!! WORKER EXCEPTION [${tag}] ${d.exception?.description ?? d.text}`.slice(0, 1200));
    for (const f of d.stackTrace?.callFrames ?? []) {
      console.log(`        at ${f.functionName || '(anon)'} ${f.url.split('/').pop()}:${f.lineNumber}:${f.columnNumber}`);
    }
  }
  if (method === 'Runtime.consoleAPICalled') {
    const text = params.args.map((a) => a.value ?? a.description ?? '').join(' ');
    const keep = ['error', 'warning'].includes(params.type) || text.includes('[probe]');
    if (keep && text.trim()) console.log(`${stamp()} [worker] ${params.type}: ${text.slice(0, 400)}`);
  }
  if (method === 'Log.entryAdded' && params.entry.level === 'error') {
    console.log(`${stamp()} [worker ${tag}] log: ${params.entry.text.slice(0, 400)}`);
  }
});

await send('Target.setDiscoverTargets', { discover: true });
await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });

const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('crash', () => console.log(`${stamp()} !!! PAGE CRASHED`));
page.on('pageerror', (e) => console.log(`${stamp()} [pageerror] ${String(e).slice(0, 300)}`));

const heap = async () => {
  const out = {};
  for (const [sid, wurl] of workerSessions) {
    try {
      // `performance.memory` does not exist in a worker; `Runtime.getHeapUsage`
      // is per-target and does.
      const r = await send('Runtime.getHeapUsage', {}, sid);
      out[wurl.split('/').pop().slice(0, 24)] = `${Math.round((r.usedSize ?? 0) / 1048576)}/${Math.round((r.totalSize ?? 0) / 1048576)}MB`;
    } catch { /* a dying worker cannot answer */ }
  }
  return out;
};

let phase = 'boot';
const poll = setInterval(async () => {
  const w = await heap();
  console.log(`${stamp()} ${phase.padEnd(16)} workers=${workerSessions.size} ${JSON.stringify(w)}`);
}, 5000);

try {
  phase = 'load';
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  const tab = opt('tab', 'stress');
  await page.click(`[data-testid="lab-tab-${tab}"]`);
  await page.waitForTimeout(3000);
  if (tab === 'stress') {
    await page.click('button[role="combobox"]');
    await page.waitForTimeout(400);
    for (const o of await page.$$('[role="option"]')) {
      if (((await o.textContent()) ?? '').trim() === variant) { await o.click(); break; }
    }
  }
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
    window.__cp = { api };
  });

  const box = await (await page.$('.ag-body-viewport, .ag-root-wrapper')).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

  // "Sometimes during load" is its own mode: reload repeatedly, each time
  // waiting for the book to reach the grid, and watch the worker across it.
  const reloads = Number(opt('reloads', '6'));
  for (let i = 1; i <= reloads && !workerDied; i++) {
    phase = `reload ${i}/${reloads}`;
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.click('[data-testid="lab-tab-stress"]');
    await page.waitForTimeout(2000);
    await page.click('button[role="combobox"]');
    await page.waitForTimeout(400);
    for (const o of await page.$$('[role="option"]')) {
      if (((await o.textContent()) ?? '').trim() === variant) { await o.click(); break; }
    }
    const t0 = Date.now();
    const ok = await page
      .waitForSelector('.ag-row', { timeout: 90_000 })
      .then(() => true)
      .catch(() => false);
    console.log(`${stamp()} reload ${i}: rows ${ok ? `after ${Date.now() - t0} ms` : 'NEVER'}`);
    await page.waitForTimeout(4000);
  }
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
    window.__cp = { api };
  }).catch(() => {});

  const deadline = Date.now() + minutes * 60_000;
  let round = 0;
  while (Date.now() < deadline && !workerDied) {
    round += 1;
    // Sort / filter / group churn is what swaps Views while reads are in
    // flight — the shape the engine's delete race lives in.
    phase = `r${round} sort`;
    await page.evaluate(() => {
      window.__cp.api.applyColumnState({ state: [{ colId: 'marketValue', sort: 'desc' }], defaultState: { sort: null } });
    }).catch(() => {});
    await page.waitForTimeout(2500);

    phase = `r${round} scroll`;
    for (let i = 0; i < 25 && !workerDied; i++) {
      await page.mouse.wheel(0, 900);
      await page.waitForTimeout(25);
    }
    await page.waitForTimeout(2000);

    phase = `r${round} filter`;
    await page.evaluate(() => {
      window.__cp.api.setFilterModel({ assetClass: { filterType: 'set', values: ['CorpIG'] } });
      window.__cp.api.onFilterChanged();
    }).catch(() => {});
    await page.waitForTimeout(2500);

    phase = `r${round} sort2`;
    await page.evaluate(() => {
      window.__cp.api.applyColumnState({ state: [{ colId: 'marketValue', sort: 'asc' }], defaultState: { sort: null } });
    }).catch(() => {});
    await page.waitForTimeout(2500);

    phase = `r${round} group`;
    await page.evaluate(() => window.__cp.api.setRowGroupColumns(['assetClass'])).catch(() => {});
    await page.waitForTimeout(3000);
    phase = `r${round} ungroup`;
    await page.evaluate(() => {
      window.__cp.api.setRowGroupColumns([]);
      window.__cp.api.setFilterModel(null);
      window.__cp.api.onFilterChanged();
    }).catch(() => {});
    await page.waitForTimeout(3000);
  }
} catch (err) {
  console.log('DRIVER ERROR:', String(err).slice(0, 400));
} finally {
  clearInterval(poll);
  console.log(workerDied ? 'RESULT: a worker died' : 'RESULT: workers survived');
  try { ws.close(); } catch { /* */ }
  try { await browser.close(); } catch { /* */ }
}
