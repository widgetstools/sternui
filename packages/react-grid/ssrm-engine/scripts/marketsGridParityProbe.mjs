/**
 * The MarketsGrid surface on `@starui/ssrm-engine`, driven in a real browser.
 *
 * Session 6's pass condition. Every line it prints is an item from
 * `docs/PERSPECTIVE_GRID_PARITY_WORKLOG.md`, taken against the running lab
 * rather than reasoned about — and each of the six pieces below was a SEPARATE
 * bug on the Perspective pull path, so "it should work by construction" is not
 * evidence for any of them.
 *
 * Requires the lab built and served:
 *   npm --prefix apps run build -w @starui/perspective-ssrm-lab
 *   cd apps/demos/perspective-ssrm-lab && npx vite preview --port 5301 --strictPort
 *   node packages/react-grid/ssrm-engine/scripts/marketsGridParityProbe.mjs
 *
 * ## It REFUSES to report rather than pass when it could not have failed
 *
 * Three ways this check could agree with a broken surface, all of which have
 * happened on this project:
 *
 *   1. **A query path that does nothing.** A sort that did not sort and a
 *      filter that excluded nothing both match a correct oracle perfectly, and
 *      "did nothing, silently" is the defect the engine's column accessor
 *      exists to remove. Every query below asserts it was seen to CHANGE the
 *      answer.
 *   2. **A refusal making it vacuous.** A calculated column the engine refused
 *      is not installed at all, so every assertion about it compares
 *      `undefined` to `undefined`. `calcDiagnostics()` is read and a compile
 *      refusal is fatal.
 *   3. **Partial AG module registration.** AG Grid 36 gates its API behind
 *      modules and leaves an unregistered method present and INERT —
 *      `getColumns()` returned null on a live grid with 28 rows painted. The
 *      column and row counts are asserted before anything else is believed.
 */
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const url = opt('url', 'http://localhost:5301/');
const tab = opt('tab', 'ssrm-engine-mg');

/** The AG trial watermark and the app's own seed 404 are not failures. */
const benign = (t) =>
  /License Key Not Found|AG Grid Enterprise|ag-grid\.com|\*{10}|Failed to load resource|seed-config|ConfigManager|unlocked for trial|hide the watermark|ERR_NAME_NOT_RESOLVED/i.test(
    t,
  );

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1800, height: 1000 } });
const errors = [];
/** Where the run was when an error landed, so "there was an error" is diagnosable. */
let stage = 'load';
page.on('pageerror', (e) => {
  const t = String(e.message ?? e).slice(0, 200);
  if (benign(t)) return;
  const frame = String(e.stack ?? '').split('\n').slice(1, 3).join(' | ').slice(0, 200);
  errors.push(`[${stage}] ${t}${frame ? `  @ ${frame}` : ''}`);
});
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  const t = m.text().slice(0, 200);
  if (!benign(t)) errors.push(`[${stage}] ${t}`);
});

const failures = [];
const say = (k, v) => console.log(`  ${String(k).padEnd(36)} ${v}`);
const check = (label, ok, detail) => {
  if (!ok) failures.push(`${label}: ${detail}`);
  say(label, `${ok ? 'PASS' : 'FAIL'}  ${detail}`);
};

try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.click(`[data-testid="lab-tab-${tab}"]`);
  await page.waitForSelector('.ag-row', { timeout: 120_000 });
  await page.waitForTimeout(6000);

  console.log(`\n=== MarketsGrid on @starui/ssrm-engine — parity run ===\n`);

  stage = 'first load';
  // ── 0. The handle, and the module trap ───────────────────────────────────
  const base = await page.evaluate(async () => {
    const h = window.__ssrmEngineGrid;
    if (!h) return { fatal: 'no measurement handle on the page' };
    const api = h.api;
    if (!api) return { fatal: 'the handle carries no grid api' };
    let sample = null;
    api.forEachNode((n) => { if (!sample && n.data) sample = n.data; });
    const cols = api.getColumns() ?? [];
    return {
      surface: h.surface ?? 'plain AgGridReact',
      columns: cols.length,
      calcColumns: cols.map((c) => c.getColId()).filter((id) => id.startsWith('calc_')),
      rows: api.getDisplayedRowCount?.() ?? null,
      book: h.engine.size,
      diagnostics: await h.calcDiagnostics(),
      calcOnRow: sample
        ? Object.fromEntries(Object.entries(sample).filter(([k]) => k.startsWith('calc_')))
        : null,
    };
  });
  if (base.fatal) throw new Error(base.fatal);
  if (!base.columns || !base.rows) {
    throw new Error(
      `api reported columns=${base.columns} rows=${base.rows} on a live grid — partial module registration, see the note at the top`,
    );
  }
  say('surface under test', base.surface);
  say('columns / rows / book', `${base.columns} / ${base.rows.toLocaleString()} / ${base.book.toLocaleString()}`);

  const compileRefusals = base.diagnostics.filter((d) => d.phase === 'compile');
  check(
    'calculated columns installed',
    base.calcColumns.length >= 6 && compileRefusals.length === 0,
    `${base.calcColumns.length} columns, ${base.diagnostics.length} diagnostics` +
      (compileRefusals.length ? ` — REFUSED: ${JSON.stringify(compileRefusals)}` : ''),
  );
  // A refused column stamps nothing, so every assertion below would compare
  // undefined to undefined and pass.
  const stamped = Object.entries(base.calcOnRow ?? {}).filter(([, v]) => v !== undefined);
  check(
    'calculated cells on a returned row',
    stamped.length >= 5,
    JSON.stringify(base.calcOnRow),
  );

  stage = 'status bar';
  // ── 1. Status-bar counts, which AG's own panels cannot produce here ──────
  const status = await page.evaluate(() => {
    const bar = document.querySelector('.ag-status-bar');
    return bar ? bar.textContent.replace(/\s+/g, ' ').trim() : null;
  });
  check(
    'status bar answers at all',
    typeof status === 'string' && /\d/.test(status),
    status === null ? 'no .ag-status-bar in the DOM' : `"${status}"`,
  );
  check(
    'status count is the BOOK, not the block',
    typeof status === 'string' && status.includes(base.book.toLocaleString()),
    `expected ${base.book.toLocaleString()} somewhere in the bar`,
  );

  stage = 'set filters';
  // ── 2. Set-filter values, from the engine ────────────────────────────────
  const setFilter = await page.evaluate(async () => {
    const api = window.__ssrmEngineGrid.api;
    const out = {};
    for (const colId of ['assetClass', 'calc_band']) {
      try {
        const inst = await api.getColumnFilterInstance(colId);
        if (!inst) {
          out[colId] = 'no filter instance';
          continue;
        }
        // The values callback is ASYNC — it goes to the worker. Reading the
        // keys straight after `getColumnFilterInstance` reports an empty list
        // for a filter that is about to be populated, which is the probe
        // agreeing with a bug it does not have.
        await new Promise((r) => setTimeout(r, 2000));
        out[colId] = inst.getFilterKeys ? inst.getFilterKeys() : 'no getFilterKeys';
      } catch (err) {
        out[colId] = `threw: ${String(err).slice(0, 120)}`;
      }
    }
    return out;
  });
  check(
    'set-filter values, STORED column',
    Array.isArray(setFilter.assetClass) && setFilter.assetClass.length > 1,
    JSON.stringify(setFilter.assetClass)?.slice(0, 140),
  );
  check(
    'set-filter values, CALCULATED column',
    Array.isArray(setFilter.calc_band) && setFilter.calc_band.length > 1,
    JSON.stringify(setFilter.calc_band),
  );

  stage = 'sort/filter/group';
  // ── 3. Sort / filter / group a calculated column, and see it CHANGE ──────
  const query = await page.evaluate(async () => {
    const api = window.__ssrmEngineGrid.api;
    const settle = (ms) => new Promise((r) => setTimeout(r, ms));
    const firstRow = () => { let r = null; api.forEachNode((n) => { if (!r && n.data) r = n.data; }); return r; };

    const before = firstRow();
    api.applyColumnState({ state: [{ colId: 'calc_richCarry', sort: 'desc' }], defaultState: { sort: null } });
    await settle(3000);
    const descTop = firstRow();
    api.applyColumnState({ state: [{ colId: 'calc_richCarry', sort: 'asc' }], defaultState: { sort: null } });
    await settle(3000);
    const ascTop = firstRow();
    api.applyColumnState({ defaultState: { sort: null } });
    await settle(2000);

    const unfiltered = api.getDisplayedRowCount();
    api.setFilterModel({ calc_pnlPct: { filterType: 'number', type: 'greaterThan', filter: 500 } });
    await settle(3000);
    const filtered = api.getDisplayedRowCount();
    api.setFilterModel(null);
    await settle(2500);
    const cleared = api.getDisplayedRowCount();

    api.applyColumnState({ state: [{ colId: 'calc_band', rowGroup: true, rowGroupIndex: 0 }] });
    await settle(3500);
    const groups = [];
    api.forEachNode((n) => { if (n.group) groups.push({ key: n.key, count: n.allChildrenCount }); });
    api.applyColumnState({ state: [{ colId: 'calc_band', rowGroup: false }] });
    await settle(2500);

    return {
      beforeKey: before?.[Object.keys(before)[0]],
      descTop: descTop?.calc_richCarry ?? null,
      ascTop: ascTop?.calc_richCarry ?? null,
      unfiltered,
      filtered,
      cleared,
      groups,
    };
  });
  check(
    'sort DESC on a calculated column',
    typeof query.descTop === 'number',
    `top row calc_richCarry = ${query.descTop}`,
  );
  check(
    'sort ASC gives a DIFFERENT top row',
    query.ascTop !== query.descTop,
    `asc ${query.ascTop} vs desc ${query.descTop}`,
  );
  check(
    'filter on a calculated column EXCLUDES rows',
    query.filtered > 0 && query.filtered < query.unfiltered,
    `${query.filtered?.toLocaleString()} of ${query.unfiltered?.toLocaleString()}, cleared -> ${query.cleared?.toLocaleString()}`,
  );
  check(
    'group by a calculated column gives >1 bucket',
    query.groups.length > 1,
    JSON.stringify(query.groups),
  );

  stage = 'quick search';
  // ── 4. Quick search, which AG cannot apply on this row model ─────────────
  const quick = await page.evaluate(async () => {
    const api = window.__ssrmEngineGrid.api;
    const settle = (ms) => new Promise((r) => setTimeout(r, ms));
    const before = api.getDisplayedRowCount();
    // `POS-1234` is the key column's own prefix and matches exactly the eleven
    // ids that start with it. A dimension word would not do: every row of this
    // generated book carries most of them in SOME string column, so the search
    // would match everything and agree with a bridge that did nothing.
    api.setGridOption('quickFilterText', 'POS-1234');
    await settle(3500);
    const narrowed = api.getDisplayedRowCount();
    api.setGridOption('quickFilterText', '');
    await settle(3500);
    const cleared = api.getDisplayedRowCount();
    // The case that is NOT symmetric, and the one that was broken: with a term
    // matching nothing, AG has no rows and no store, so clearing the box fires
    // no event at all. The box has to be clearable from an EMPTY grid.
    api.setGridOption('quickFilterText', 'ZZZZ-NO-SUCH-VALUE');
    await settle(3500);
    const empty = api.getDisplayedRowCount();
    api.setGridOption('quickFilterText', '');
    await settle(3500);
    return { before, narrowed, cleared, empty, recovered: api.getDisplayedRowCount() };
  });
  check(
    'quick search narrows the BOOK',
    quick.narrowed > 0 && quick.narrowed < quick.before,
    `${quick.before?.toLocaleString()} -> ${quick.narrowed?.toLocaleString()} -> ${quick.cleared?.toLocaleString()}`,
  );
  check(
    'quick search is CLEARABLE from an empty grid',
    quick.empty === 0 && quick.recovered === quick.before,
    `no-match -> ${quick.empty}, cleared -> ${quick.recovered?.toLocaleString()}`,
  );

  stage = 'export';
  // ── 5. Export reads the whole book ───────────────────────────────────────
  const exported = await page.evaluate(async () => {
    const holder = window.__ssrmEngineGrid.api.getGridOption('context')?.serverEngineHolder;
    const engine = holder?.get?.();
    if (!engine) return { fatal: 'no server engine on the grid context' };
    const rows = await engine.readAllRows();
    return { rows: rows ? rows.length : null, calc: rows?.[0]?.calc_notional ?? null };
  });
  check(
    'export reads the whole book',
    exported.rows === base.book,
    `${exported.rows?.toLocaleString?.() ?? exported.rows} rows (book ${base.book.toLocaleString()})`,
  );
  check(
    'exported rows carry the calculated cells',
    typeof exported.calc === 'number',
    `calc_notional on row 0 = ${exported.calc}`,
  );

  stage = 'cell edit';
  // ── 6. A cell edit reaches the book AND brings its calculated cells back ─
  const edit = await page.evaluate(async () => {
    const api = window.__ssrmEngineGrid.api;
    const settle = (ms) => new Promise((r) => setTimeout(r, ms));
    let picked = null;
    api.forEachNode((n) => {
      if (!picked && n.data && typeof n.data.esgScore === 'number') picked = n;
    });
    if (!picked) return { fatal: 'no leaf row with esgScore in the block cache' };
    const key = picked.id;

    /**
     * Up to three attempts, and the retry is the honest part.
     *
     * This book TICKS `esgScore`, so a tick landing on the row between the
     * write and the read-back replaces the value — and the check deliberately
     * requires `esgScore` to still be exactly what was written, because
     * without that a tick would move `calc_liveSum` on its own and the whole
     * assertion would pass without the echo existing. Interference is
     * therefore a RETRY, not a pass and not a failure.
     *
     * The value is also re-read from the node immediately before writing. The
     * first version captured it from the `forEachNode` walk, and at 50,000 rows
     * that read was stale by the time the write went out — reported as
     * `esgScore 0 -> 974.82 (wrote 11)`, which looks like a broken edit path
     * and was a broken measurement.
     */
    let last = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const fresh = api.getRowNode(key)?.data;
      if (!fresh || typeof fresh.esgScore !== 'number') continue;
      const before = { esg: fresh.esgScore, live: fresh.calc_liveSum };
      const wrote = Math.round((before.esg + 11) * 100) / 100;
      // Straight through the surface's own committed-edit listener — the same
      // event a cell editor raises.
      api.getRowNode(key).setDataValue('esgScore', wrote);
      await settle(2500);
      const after = api.getRowNode(key)?.data ?? {};
      last = {
        attempt,
        before,
        wrote,
        afterEsg: after.esgScore ?? null,
        afterMaturity: after.originalMaturity ?? null,
        afterLive: after.calc_liveSum ?? null,
      };
      if (last.afterEsg === wrote) return last;
    }
    return { ...(last ?? {}), interfered: true };
  });
  if (edit.fatal) {
    check('cell edit reaches the book', false, edit.fatal);
  } else {
    check(
      'cell edit reaches the book',
      edit.afterEsg === edit.wrote,
      `esgScore ${edit.before?.esg} -> ${edit.afterEsg} (wrote ${edit.wrote})` +
        `${edit.attempt > 1 ? `, attempt ${edit.attempt}` : ''}` +
        `${edit.interfered ? ' — a tick landed on the row three times running' : ''}`,
    );
    /**
     * The gap session 5 recorded: the worker skips the port that caused a
     * write, so a window that edits does not get its own calculated cells back.
     * It now gets a calc-only echo.
     *
     * Asserted as an IDENTITY over the row's own post-edit values, not as "the
     * number moved". This book ticks `esgScore` and `originalMaturity`, so a
     * tick landing on this row would move `calc_liveSum` on its own and a
     * "did it change" check would pass without the echo existing. Pairing the
     * identity with "esgScore is still exactly what we wrote" excludes that: a
     * tick would have replaced it.
     */
    const expected =
      typeof edit.afterEsg === 'number' && typeof edit.afterMaturity === 'number'
        ? Math.round((edit.afterEsg + edit.afterMaturity) * 100) / 100
        : null;
    check(
      "the author's own calculated cell follows the edit",
      expected !== null && edit.afterLive === expected && edit.afterEsg === edit.wrote,
      `calc_liveSum ${edit.before.live} -> ${edit.afterLive}, expected ${expected}`,
    );
  }

  stage = 'wrap up';
  // ── 7. Nothing broke on the way ──────────────────────────────────────────
  const blocks = await page.evaluate(() => window.__ssrmEngineGrid.blocks());
  check('blocks failed', blocks.failed === 0, `${blocks.served} served, ${blocks.failed} failed`);
  const rpc = await page.evaluate(() => window.__ssrmEngineGrid.rpc());
  check(
    'rpc timed out / late / pending',
    rpc.timedOut === 0 && rpc.pending === 0,
    `${rpc.sent} sent, ${rpc.timedOut} timed out, ${rpc.late} late, ${rpc.pending} pending`,
  );
  check('page errors', errors.length === 0, errors.slice(0, 3).join(' | ') || 'none');

  console.log('');
  if (failures.length > 0) {
    console.log(`  ${failures.length} FAILURES:`);
    for (const f of failures) console.log(`    - ${f}`);
    console.log('');
    process.exitCode = 1;
  } else {
    console.log('  every parity item passed\n');
  }
} finally {
  await browser.close();
}
