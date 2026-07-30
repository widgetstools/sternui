/**
 * The 2nd/3rd-blotter claim, measured on the PRODUCT path.
 *
 * Milestone 1 measured it in `harness/` — window 3 reached first rows in 414 ms
 * against 1135 ms for the cold first window — against a MOCK book that was
 * already in memory. The whole thesis of this migration rests on that number,
 * and it had never been taken through `MarketsGridContainer` against the real
 * STOMP feed, which differs in the one way that matters: window 1 has to wait
 * for the broker's ~18 s snapshot before there is a book at all.
 *
 * So there are two different questions, and only the second is the thesis:
 *
 *   1. Cold window — how long until the first window has rows? Dominated by
 *      the broker, not by us.
 *   2. Windows 2 and 3, opened once the book EXISTS — this is the claim. Under
 *      CSRM each would pay a full 20,000-row replay from the hub; here they
 *      open a View onto a Table that is already loaded.
 *
 * Run against the production preview (never the dev server — it serves hundreds
 * of modules per window and a 3rd window can starve behind the connection cap):
 *
 *   npm run dev:stomp
 *   npm --prefix apps run build -w @starui/minimal-perspective-table
 *   cd apps/demos/minimal-perspective-table && npx vite preview --port 5273 --strictPort
 *   node packages/react-grid/perspective-grid/scripts/multiWindowTimingProbe.mjs
 *
 * A fresh browser launch is a fresh profile and therefore a fresh SharedWorker,
 * which is what makes window 1 genuinely cold — the Perspective SharedWorker
 * survives page reloads, so reloading a tab does NOT reset it.
 */
import { chromium } from '@playwright/test';

const URL = process.env.PSP_URL ?? 'http://localhost:5273/';
const BOOK = /20,000 rows/;

const ms = (t) => `${Math.round(t)} ms`;

/**
 * Open a window and time two distinct milestones.
 *
 * `firstRows` is what the user perceives as "the blotter opened". `fullBook` is
 * when the status bar — which reads the worker-held Table, not the loaded
 * blocks — reports the whole book.
 */
async function openWindow(context, label) {
  const page = await context.newPage();
  // Every window must be VISIBLE: a background tab starves requestAnimationFrame,
  // which AG Grid defers row rendering to, so a hidden window measures the
  // throttle rather than the engine.
  await page.bringToFront();

  const started = performance.now();
  await page.goto(URL);
  await page.waitForSelector('[data-grid-id="perspective-blotter"]', { timeout: 120_000 });
  const mounted = performance.now() - started;

  await page.waitForSelector('.ag-row', { timeout: 180_000 });
  const firstRows = performance.now() - started;

  await page
    .locator('.ag-status-bar')
    .filter({ hasText: BOOK })
    .first()
    .waitFor({ timeout: 180_000 });
  const fullBook = performance.now() - started;

  const status = await page.evaluate(
    () => document.querySelector('.ag-status-bar')?.textContent?.replace(/\s+/g, ' ').trim(),
  );

  // The decomposition that matters. `mount` is bundle fetch + parse + React
  // boot, paid identically by every window and nothing to do with the row
  // engine; `attach` is what this migration actually controls — opening a View
  // onto the worker-held Table and reading the first block.
  const attach = firstRows - mounted;

  console.log(
    `  ${label.padEnd(22)} mount ${ms(mounted).padStart(8)} · attach+first rows ${ms(attach).padStart(8)} · total ${ms(firstRows).padStart(8)} · full book ${ms(fullBook).padStart(8)}   [${status}]`,
  );
  return { label, mounted, attach, firstRows, fullBook, page };
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });

  console.log(`\nProduct path, ${URL}\n`);
  console.log('=== window 1 — cold: fresh SharedWorker, engine boot, and the broker snapshot ===');
  const w1 = await openWindow(context, 'window 1 (cold)');

  console.log('\n=== windows 2 and 3 — the claim: the book already exists ===');
  const w2 = await openWindow(context, 'window 2');
  const w3 = await openWindow(context, 'window 3');

  // Every window reads the ONE worker-held Table, so all three must agree
  // exactly — the property N CSRM windows can never have, since each holds its
  // own independently random-walked copy.
  const sizes = [];
  for (const w of [w1, w2, w3]) {
    sizes.push(
      await w.page.evaluate(() => {
        const el = document.querySelector('.ag-root-wrapper');
        const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
        let f = el[key];
        let api = null;
        let hops = 0;
        while (f && hops < 400) {
          if (f.stateNode?.api?.getGridOption && !api) api = f.stateNode.api;
          f = f.return;
          hops += 1;
        }
        const engine = api?.getGridOption('context')?.perspectiveEngineHolder?.get();
        return engine ? { book: engine.status.bookRows, failed: engine.status.failedBlocks } : null;
      }),
    );
  }

  console.log('\n=== all three windows read ONE Table ===');
  sizes.forEach((s, i) => console.log(`  window ${i + 1}: ${JSON.stringify(s)}`));
  const agree = sizes.every((s) => s && s.book === sizes[0].book);
  console.log(`  agree exactly: ${agree}`);

  const speedup = w1.firstRows / Math.max(w2.firstRows, w3.firstRows);
  const attachSpeedup = w1.attach / Math.max(w2.attach, w3.attach);
  console.log('\n=== verdict ===');
  console.log(`  cold window to first rows : ${ms(w1.firstRows)}`);
  console.log(`  window 2 to first rows    : ${ms(w2.firstRows)}`);
  console.log(`  window 3 to first rows    : ${ms(w3.firstRows)}`);
  console.log(`  later-blotter speedup     : ${speedup.toFixed(1)}x`);
  console.log(
    `  ... of which BUNDLE boot  : ${ms(w2.mounted)} / ${ms(w3.mounted)} — paid per window, identical to the cold one`,
  );
  console.log(
    `  ... and ATTACH + rows     : ${ms(w2.attach)} / ${ms(w3.attach)} against ${ms(w1.attach)} cold — ${attachSpeedup.toFixed(1)}x, and this is the part the row engine owns`,
  );

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
