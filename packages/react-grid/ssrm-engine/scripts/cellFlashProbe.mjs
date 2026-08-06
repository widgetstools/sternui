/**
 * Does a changed cell FLASH on this surface — and which of the two mechanisms?
 *
 * There are two, and conflating them is how the first reading of this was
 * overstated:
 *
 *   1. **AG Grid's own `enableCellChangeFlash`**, which paints
 *      `ag-cell-data-changed` when a cell's value moves. The lab turns it OFF
 *      deliberately (see `data/columns.ts`): it double-paints against the
 *      conditional-styling flashes, and a column recomputing faster than the
 *      flash+fade timeout never leaves the flashed state. So "0" for this one is
 *      the option being off and says nothing about the surface;
 *   2. **conditional styling's own flash**, a CSS animation on the rule's class
 *      applied by a TIMED ACTIVATION for `activeDurationMs` after the value
 *      moves. This one is enabled here and produced nothing, which is the open
 *      question.
 *
 * This measures both, on both live paths — the flat one, where the pump writes
 * a transaction, and the GROUPED one, where nothing is pushed and the expanded
 * routes are re-read. AG's own flash is turned on AT RUN TIME rather than
 * seeded, so the demo's deliberate choice is untouched and the control and the
 * treatment are the same build.
 *
 *   node packages/react-grid/ssrm-engine/scripts/cellFlashProbe.mjs \
 *     --url "http://localhost:5311/?engine=ssrm&surface=marketsgrid"
 */
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const url = opt('url', 'http://localhost:5311/?engine=ssrm&surface=marketsgrid');
/** A column the book really moves — rule 1, and the trap this probe was born in. */
const column = opt('value', 'esgScore');
const tab = opt('tab', 'stress');
const level0 = opt('group0', 'assetClass');
const level1 = opt('group1', 'issuerSector');

const benign = (t) =>
  /License Key Not Found|AG Grid Enterprise|ag-grid\.com|\*{10}|Failed to load resource|seed-config|ConfigManager|unlocked for trial|hide the watermark|ERR_NAME_NOT_RESOLVED/i.test(t);

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1800, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => {
  const t = String(e.message ?? e).slice(0, 200);
  if (!benign(t)) errors.push(t);
});

try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.click(`[data-testid="lab-tab-${tab}"]`);
  await page.waitForSelector('.ag-row', { timeout: 180_000 });
  await page.waitForTimeout(20_000);

  const r = await page.evaluate(
    async ([column, level0, level1]) => {
      const settle = (ms) => new Promise((res) => setTimeout(res, ms));
      const handle = window.__ssrmEngineGrid;
      const api = handle?.api;
      if (!api) return { fatal: 'no grid api' };

      /** Cells wearing each flavour of flash right now. */
      const sample = () => ({
        ag: document.querySelectorAll(
          '.ag-cell-data-changed, .ag-cell-data-changed-animation',
        ).length,
        rule: [...document.querySelectorAll('.ag-cell')].filter((el) =>
          [...el.classList].some((c) => c.startsWith('ds-rule-esg-tick')),
        ).length,
      });
      /** The most either flavour reached over a window, plus how many rows moved. */
      const watch = async (ms) => {
        const most = { ag: 0, rule: 0 };
        const moved = new Set();
        const read = () => {
          const m = new Map();
          for (let i = 0; i < api.getDisplayedRowCount(); i += 1) {
            const n = api.getDisplayedRowAtIndex(i);
            if (!n || n.group || !n.data || n.id === undefined) continue;
            m.set(n.id, n.data[column]);
          }
          return m;
        };
        let prev = read();
        const until = performance.now() + ms;
        while (performance.now() < until) {
          const now = sample();
          most.ag = Math.max(most.ag, now.ag);
          most.rule = Math.max(most.rule, now.rule);
          const rows = read();
          for (const [id, v] of rows) {
            const was = prev.get(id);
            if (was !== undefined && was !== v) moved.add(id);
          }
          prev = rows;
          await settle(120);
        }
        // The anti-vacuous gate: "no cell flashed" is only a finding if a cell
        // CHANGED. On a book that moves 200 of 50,000 rows per tick, a window
        // in which nothing on screen moved proves nothing about flashing.
        return { ...most, moved: moved.size };
      };

      api.applyColumnState({ defaultState: { rowGroup: false } });
      await settle(4000);
      api.ensureColumnVisible(column);
      await settle(2000);

      const platform = (() => {
        const el = document.querySelector('.ag-root-wrapper');
        const k = Object.keys(el).find((x) => x.startsWith('__reactFiber$'));
        let f = el[k];
        while (f) {
          const v = f.memoizedProps?.value;
          if (v && typeof v === 'object' && v.platform && 'engineKind' in v) return v.platform;
          f = f.return;
        }
        return null;
      })();
      if (!platform) return { fatal: 'no platform on the fiber' };

      // ── FLAT, AG's own flash OFF — the lab's shipped configuration ───────
      const flatNative0 = await watch(8000);

      /**
       * ── FLAT, AG's own flash ON ─────────────────────────────────────────
       *
       * Turned on the way the APP turns it on. `enableCellChangeFlash` is a
       * COLUMN option in AG Grid 36 and NOT a grid option at all: an earlier
       * version of this probe called
       * `api.setGridOption('enableCellChangeFlash', true)`, AG ignored the
       * unknown option silently, every colDef still carried `false`, and the
       * result was read as "the flash does not fire". The option is asserted to
       * have LANDED ON THE COLUMN before anything is measured.
       *
       * And the toggle is done FIRST, with a long settle, because flipping it
       * re-runs the module pipeline and rebuilds every column def — the grid
       * churns, and the window straight after it saw **0 rows change**, which
       * is a measurement of the toggle rather than of the flash.
       */
      platform.store.setModuleState('general-settings', (s) => ({
        ...s,
        enableCellChangeFlash: true,
      }));
      await settle(8000);
      // Re-flatten. Flipping a module setting re-runs the pipeline, and the
      // grid-state module re-applies the SAVED column state — which on this lab
      // is grouped, because a previous probe run persisted it. The window right
      // after the toggle therefore had no leaf rows to watch and reported 0 rows
      // changed: a measurement of the toggle, not of the flash.
      api.applyColumnState({ defaultState: { rowGroup: false } });
      await settle(6000);
      api.ensureColumnVisible(column);
      await settle(2000);
      const optionOnColumn =
        api.getColumn(column)?.getColDef()?.enableCellChangeFlash ?? null;
      const flatNative1 = await watch(12_000);

      // ── GROUPED, AG's own flash still ON ────────────────────────────────
      api.applyColumnState({
        state: [
          { colId: level0, rowGroup: true, rowGroupIndex: 0 },
          { colId: level1, rowGroup: true, rowGroupIndex: 1 },
          { colId: column, aggFunc: 'sum' },
        ],
        defaultState: { rowGroup: false },
      });
      await settle(8000);
      const firstGroupAt = (level) => {
        for (let i = 0; i < api.getDisplayedRowCount(); i += 1) {
          const n = api.getDisplayedRowAtIndex(i);
          if (n && n.group && n.level === level) return n;
        }
        return null;
      };
      const g0 = firstGroupAt(0);
      if (g0) api.setRowNodeExpanded(g0, true);
      await settle(6000);
      const g1 = firstGroupAt(1);
      if (g1) api.setRowNodeExpanded(g1, true);
      await settle(6000);
      api.ensureColumnVisible(column);
      await settle(2000);
      const grouped = await watch(12_000);

      platform.store.setModuleState('general-settings', (st) => ({ ...st, enableCellChangeFlash: false }));
      api.applyColumnState({ defaultState: { rowGroup: false } });

      return {
        optionOnColumn,
        flatNative0,
        flatNative1,
        grouped,
        pump: handle.pump?.() ?? null,
        groupRefresh: handle.groupRefresh?.() ?? null,
      };
    },
    [column, level0, level1],
  );

  if (r.fatal) throw new Error(r.fatal);

  const line = (label, s) =>
    console.log(
      `  ${label.padEnd(42)} AG flash ${String(s.ag).padStart(3)} · rule flash ` +
        `${String(s.rule).padStart(3)} · ${String(s.moved).padStart(3)} rows seen to change`,
    );

  console.log(`\n=== does a changed cell flash? · ${url}\n`);
  line('FLAT, AG flash OFF (as the lab ships)', r.flatNative0);
  line('FLAT, AG flash ON', r.flatNative1);
  line('GROUPED, AG flash ON', r.grouped);
  if (r.pump) {
    console.log(
      `\n  pump: received ${r.pump.received}, applied ${r.pump.applied}, dropped ${r.pump.dropped}`,
    );
  }
  if (r.groupRefresh) {
    console.log(
      `  grouped path: ${r.groupRefresh.writes} writes, ${r.groupRefresh.refreshes} refresh passes`,
    );
  }

  const failures = [];
  const check = (label, ok, detail) => {
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
    if (!ok) failures.push(label);
  };
  console.log('');
  check(
    'cells were seen to change in every window',
    r.flatNative0.moved > 0 && r.flatNative1.moved > 0 && r.grouped.moved > 0,
    `${r.flatNative0.moved} / ${r.flatNative1.moved} / ${r.grouped.moved}`,
  );
  check(
    "AG's own flash is OFF in the lab's shipped configuration",
    r.flatNative0.ag === 0,
    'so a 0 there is the option, not the surface',
  );
  check(
    'the flash option actually LANDED on the column',
    r.optionOnColumn === true,
    'otherwise nothing below is a statement about flashing',
  );
  check(
    "AG's own flash FIRES on the flat push path once enabled",
    r.flatNative1.ag > 0,
    `${r.flatNative1.ag} cells`,
  );
  check(
    "AG's own flash FIRES on the grouped route-refresh path",
    r.grouped.ag > 0,
    `${r.grouped.ag} cells`,
  );
  check(
    "conditional styling's own flash fires",
    r.flatNative0.rule > 0 || r.flatNative1.rule > 0 || r.grouped.rule > 0,
    `${r.flatNative0.rule} / ${r.flatNative1.rule} / ${r.grouped.rule}`,
  );
  check('page errors', errors.length === 0, errors.slice(0, 2).join(' | ') || 'none');

  console.log('');
  if (failures.length > 0) {
    console.log(`  ${failures.length} FAILURES:`);
    for (const f of failures) console.log(`    - ${f}`);
    console.log('');
    process.exitCode = 1;
  }
} finally {
  await browser.close();
}
