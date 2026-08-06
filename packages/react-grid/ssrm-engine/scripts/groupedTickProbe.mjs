/**
 * Do aggregates TICK — at the grand total, at a group, and at a subgroup?
 *
 * The question session 8 did not ask. Its sort and block figures were taken
 * UNGROUPED (`sortRecoveryProbe` calls `setRowGroupColumns([])` before it
 * measures), so nothing in that comparison touched the behaviour a blotter is
 * mostly watching: desk-level P&L rolling up while the feed moves underneath.
 *
 * ## What makes this hard to check honestly
 *
 * A grouped grid can look alive for three different reasons, and only one of
 * them is the aggregate ticking:
 *
 *   1. the LEAF rows under an expanded group are updating, and the group row
 *      above them is frozen. Reading the leaves would report success;
 *   2. the grand total is updating and the groups are frozen. Reading the
 *      total would report success;
 *   3. nothing is updating at all, because the feed stopped — in which case
 *      "the aggregate did not change" is true and means nothing.
 *
 * So this samples all four levels at once — grand total, depth-0 group,
 * depth-1 subgroup, leaf — and REFUSES to report unless the leaf moved. If the
 * leaves are frozen the feed is not running and no verdict about the
 * aggregates above them is available.
 *
 *   node packages/react-grid/ssrm-engine/scripts/groupedTickProbe.mjs \
 *     --url "http://localhost:5301/?engine=ssrm&surface=marketsgrid"
 */
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const url = opt('url', 'http://localhost:5301/');
const seconds = Number(opt('seconds', '25'));
/** The column whose aggregate is watched, and the two grouping levels. */
const valueCol = opt('value', 'marketValue');
const level0 = opt('group0', 'assetClass');
const level1 = opt('group1', 'issuerSector');

const benign = (t) =>
  /License Key Not Found|AG Grid Enterprise|ag-grid\.com|\*{10}|Failed to load resource|seed-config|ConfigManager|unlocked for trial|hide the watermark|ERR_NAME_NOT_RESOLVED/i.test(t);

/** The grid api, found by walking the fiber — works on any AG Grid surface. */
const gridApi = () => {
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
  return api;
};

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1800, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => { const t = String(e.message ?? e).slice(0, 200); if (!benign(t)) errors.push(t); });

try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.click('[data-testid="lab-tab-stress"]');
  await page.waitForSelector('.ag-row', { timeout: 180_000 });
  await page.waitForTimeout(20_000);

  const result = await page.evaluate(
    async ([fnSrc, valueCol, level0, level1, seconds]) => {
      const api = eval(`(${fnSrc})`)();
      const settle = (ms) => new Promise((r) => setTimeout(r, ms));

      /**
       * ── THE UNGROUPED CONTROL, taken FIRST ──
       *
       * Without it the pump counters below cannot be read. Session 8's run
       * reported `received 34,447 · applied 0` over a window whose first 20 s
       * were ungrouped, and "applied 0" was attributed entirely to grouping —
       * which left it ambiguous whether the push path worked at all. This
       * measures the flat grid on its own, so the grouped numbers are read
       * against a control rather than against an assumption.
       */
      // The grid may open ALREADY GROUPED: MarketsGrid persists column state,
      // so a previous run of this very probe is saved in the profile. The first
      // reading taken without this clearing step watched **1** "leaf row" — the
      // grand total — and reported a dead feed for a grid that was working.
      api.applyColumnState({ defaultState: { rowGroup: false } });
      await settle(6000);

      const flatSample = () => {
        const m = new Map();
        for (let i = 0; i < api.getDisplayedRowCount(); i += 1) {
          const n = api.getDisplayedRowAtIndex(i);
          if (!n || n.id === undefined || n.group || !n.data) continue;
          m.set(n.id, n.data[valueCol]);
        }
        return m;
      };
      /**
       * WHICH COLUMNS DOES THIS BOOK ACTUALLY MOVE?
       *
       * Rule 1, made part of the probe rather than left to the reader. The
       * first run of this file aggregated `marketValue` and reported a dead
       * feed; the same trap caught the PERSPECTIVE surface, whose book moves a
       * different set of columns from the ssrm one. A probe that names the
       * movers cannot be pointed at a column nothing touches without saying so.
       */
      const moversOf = async (ms) => {
        const counts = new Map();
        const snap = () => {
          const m = new Map();
          for (let i = 0; i < api.getDisplayedRowCount(); i += 1) {
            const n = api.getDisplayedRowAtIndex(i);
            if (!n || n.group || !n.data || n.id === undefined) continue;
            m.set(n.id, n.data);
          }
          return m;
        };
        let prev = snap();
        const until = performance.now() + ms;
        while (performance.now() < until) {
          await settle(400);
          const now = snap();
          for (const [id, row] of now) {
            const was = prev.get(id);
            if (!was) continue;
            for (const field of Object.keys(row)) {
              if (typeof row[field] !== 'number') continue;
              if (was[field] !== row[field]) counts.set(field, (counts.get(field) ?? 0) + 1);
            }
          }
          prev = now;
        }
        return [...counts].sort((a, b) => b[1] - a[1]).slice(0, 6);
      };
      const movers = await moversOf(8000);

      const pumpBefore = window.__ssrmEngineGrid?.pump?.() ?? null;
      let flatPrev = flatSample();
      const flatMoved = new Set();
      const flatT0 = performance.now();
      while (performance.now() - flatT0 < 8000) {
        await settle(500);
        const now = flatSample();
        for (const [id, v] of now) {
          const was = flatPrev.get(id);
          if (was !== undefined && was !== v) flatMoved.add(id);
        }
        flatPrev = now;
      }
      const control = {
        watched: flatPrev.size,
        moved: flatMoved.size,
        pump: window.__ssrmEngineGrid?.pump?.() ?? null,
        pumpBefore,
        movers,
      };

      // Two grouping levels, and the value column aggregated, set the way the
      // row-group panel sets them.
      api.applyColumnState({
        state: [
          { colId: level0, rowGroup: true, rowGroupIndex: 0 },
          { colId: level1, rowGroup: true, rowGroupIndex: 1 },
          { colId: valueCol, aggFunc: 'sum' },
        ],
        defaultState: { rowGroup: false },
      });
      await settle(8000);

      // Expand the first group, then the first subgroup inside it, so all four
      // levels are on screen at once.
      const firstGroupAt = (level) => {
        for (let i = 0; i < api.getDisplayedRowCount(); i += 1) {
          const n = api.getDisplayedRowAtIndex(i);
          if (n && n.group && n.level === level) return n;
        }
        return null;
      };
      const g0 = firstGroupAt(0);
      if (!g0) return { fatal: 'no depth-0 group row appeared after grouping' };
      api.setRowNodeExpanded(g0, true);
      await settle(6000);
      const g1 = firstGroupAt(1);
      if (g1) api.setRowNodeExpanded(g1, true);
      await settle(6000);

      /** Read one value off a node, preferring the aggregate AG holds. */
      const readAgg = (n) =>
        n?.aggData?.[valueCol] ?? n?.data?.[valueCol] ?? null;

      /**
       * EVERY row on screen, keyed by node id — not one of each.
       *
       * A single leaf is under-powered: this book touches 200 of 50,000 rows
       * per tick, so one row sitting still for 25 s is ordinary chance and
       * would be reported as "the feed is dead". Counting how many DISTINCT
       * rows moved makes the gate mean something.
       */
      const sample = () => {
        const out = { total: null, group0: new Map(), group1: new Map(), leaf: new Map() };
        const totalNode =
          api.getRowNode('rowGroupFooter_ROOT_NODE_ID') ??
          api.getRowNode('ROOT_NODE_ID');
        out.total = readAgg(totalNode);
        for (let i = 0; i < api.getDisplayedRowCount(); i += 1) {
          const n = api.getDisplayedRowAtIndex(i);
          if (!n || n.id === undefined) continue;
          const v = readAgg(n);
          if (v === null || v === undefined) continue;
          if (n.group && n.level === 0) out.group0.set(n.id, v);
          else if (n.group && n.level === 1) out.group1.set(n.id, v);
          else if (!n.group && n.data) out.leaf.set(n.id, v);
        }
        return out;
      };

      const first = sample();
      /** Distinct nodes seen to change at least once. */
      const moved = { group0: new Set(), group1: new Set(), leaf: new Set() };
      let totalChanges = 0;
      let prev = first;
      const t0 = performance.now();
      while (performance.now() - t0 < seconds * 1000) {
        await settle(500);
        const now = sample();
        if (now.total !== null && prev.total !== null && now.total !== prev.total) {
          totalChanges += 1;
        }
        for (const k of ['group0', 'group1', 'leaf']) {
          for (const [id, v] of now[k]) {
            const was = prev[k].get(id);
            if (was !== undefined && was !== v) moved[k].add(id);
          }
        }
        prev = now;
      }

      // The pump's own counters, where the surface publishes them. `dropped`
      // dwarfing `applied` is the sharpest available signal that pushed rows
      // are not finding their nodes.
      const pump = window.__ssrmEngineGrid?.pump?.() ?? null;
      // The GROUPED path's counters — a different mechanism entirely. Under
      // grouping the push path is off (a leaf id is its PATH and a sparse patch
      // cannot carry one) and the expanded routes are re-read instead, so a
      // probe reading only `pump` would report a working grouped grid as dead.
      const groupRefresh = window.__ssrmEngineGrid?.groupRefresh?.() ?? null;
      /**
       * What one route-refresh pass actually COSTS on THIS book — the number
       * the throttle has to be chosen against, and one that has to be measured
       * rather than carried over from 20k.
       *
       * NOT the time to issue it: `refreshServerSide` returns immediately and
       * the blocks are read asynchronously, so an issue timing reads 0.0 ms and
       * means nothing. This waits until the block count stops climbing, which
       * is when the refreshed levels have actually landed.
       */
      const refreshCost = await (async () => {
        const handle = window.__ssrmEngineGrid;
        if (!handle?.blocks || !handle.refresh || !handle.setLive) return null;
        // The feed has to be OFF for this. With it running, every write
        // schedules another route refresh and the block count never goes quiet
        // — the first attempt at this measurement simply ran into its own 5 s
        // cap and reported it as a settle time.
        handle.setLive(false);
        await settle(1500);
        const before = handle.blocks();
        const started = performance.now();
        handle.refresh();
        let served = before.served;
        let quietSince = performance.now();
        while (performance.now() - started < 5000) {
          await settle(50);
          const now = handle.blocks();
          if (now.served !== served) {
            served = now.served;
            quietSince = performance.now();
          } else if (performance.now() - quietSince > 300) break;
        }
        const after = handle.blocks();
        handle.setLive(true);
        return {
          blocks: after.served - before.served,
          failed: after.failed - before.failed,
          settledMs: Math.max(0, quietSince - started),
          cappedOut: performance.now() - started >= 5000,
        };
      })();

      const size = (m) => m.size;
      return {
        control,
        movers: control.movers,
        pump,
        groupRefresh,
        refreshCost,
        counts: {
          total: totalChanges,
          group0: moved.group0.size,
          group1: moved.group1.size,
          leaf: moved.leaf.size,
        },
        watched: {
          total: first.total !== null ? 1 : 0,
          group0: size(first.group0),
          group1: size(first.group1),
          leaf: size(first.leaf),
        },
        firstTotal: first.total,
        lastTotal: prev.total,
      };
    },
    [gridApi.toString(), valueCol, level0, level1, seconds],
  );

  if (result.fatal) throw new Error(result.fatal);

  console.log(`\n=== do aggregates tick? ${url}\n`);
  if (result.movers) {
    console.log(
      `  columns this book MOVES (8 s): ` +
        (result.movers.length === 0
          ? 'NONE — nothing on screen changed, so no verdict about anything is available'
          : result.movers.map(([f, n]) => `${f} x${n}`).join(', ')),
    );
    if (result.movers.length > 0 && !result.movers.some(([f]) => f === valueCol)) {
      console.log(
        `  WARNING: '${valueCol}' is NOT among them. Re-run with --value ${result.movers[0][0]}.`,
      );
    }
    console.log('');
  }
  if (result.control) {
    const c = result.control;
    console.log(
      `  UNGROUPED control, 8 s: ${c.moved} of ${c.watched} leaf rows moved` +
        `${c.pump ? `, pump applied ${c.pump.applied} of ${c.pump.received} received` : ''}` +
        `\n  (the flat push path, measured on its own so the grouped counters below can be read)\n`,
    );
  }
  console.log(`  aggregating ${valueCol}, grouped by ${level0} then ${level1}, over ${seconds}s\n`);
  const row = (label, key) =>
    console.log(
      `  ${label.padEnd(30)} ${String(result.counts[key]).padStart(4)} moved` +
        ` of ${String(result.watched[key]).padStart(3)} watched` +
        `${result.watched[key] === 0 ? '   (never present — nothing to judge)' : ''}`,
    );
  row('grand total (changes, not rows)', 'total');
  row(`group rows (${level0})`, 'group0');
  row(`subgroup rows (${level1})`, 'group1');
  row('leaf rows', 'leaf');
  console.log(`\n  grand total: ${result.firstTotal} -> ${result.lastTotal}`);
  if (result.pump) {
    console.log(
      `  pump: received ${result.pump.received}, applied ${result.pump.applied},` +
        ` DROPPED ${result.pump.dropped}` +
        ` — a dropped that dwarfs applied means pushed rows are not finding their nodes`,
    );
  }
  if (result.groupRefresh) {
    const g = result.groupRefresh;
    console.log(
      `  grouped path: ${g.writes} writes, ${g.refreshes} route-refresh passes,` +
        ` ${g.routes} routes refreshed, ${g.deferred} deferred behind in-flight blocks`,
    );
    if (result.refreshCost) {
      const r = result.refreshCost;
      console.log(
        `  ONE route-refresh pass, feed OFF: ${r.blocks} blocks, settled in` +
          ` ${r.settledMs.toFixed(0)} ms, ${r.failed} failed` +
          `${r.cappedOut ? ' — HIT THE 5 s CAP, so this is not a settle time' : ''}` +
          ` — what the throttle has to be chosen against`,
      );
    }
    // A pump that received nothing while grouping is the DESIGN, not a fault:
    // the surface declares `pushRows: false` and the worker stops cloning
    // patches across the port. Said out loud so a reader does not diagnose it.
    if (result.pump && result.pump.received === 0 && g.writes > 0) {
      console.log(
        `  (the pump received 0 while grouped, and that is the design: the port carried` +
          ` ${g.writes} write signals and no rows)`,
      );
    }
  }

  // The anti-vacuous gate. "The aggregate did not change" is only a finding if
  // something underneath it DID.
  if (result.watched.leaf === 0 || result.counts.leaf === 0) {
    console.log(
      `\n  REFUSING TO REPORT: not one of the ${result.watched.leaf} leaf rows on screen\n` +
        `  moved, so either the feed is not running or the push path is not\n` +
        `  reaching leaves at all — and nothing above them can be judged until\n` +
        `  that is separated. Check the pump line above.\n`,
    );
    process.exitCode = 1;
  } else {
    const frozen = [
      ['grand total', 'total'],
      [`group (${level0})`, 'group0'],
      [`subgroup (${level1})`, 'group1'],
    ].filter(([, k]) => result.watched[k] > 0 && result.counts[k] === 0);
    console.log(
      frozen.length === 0
        ? `\n  every level moved while ${result.counts.leaf} leaf rows moved.\n`
        : `\n  FROZEN while ${result.counts.leaf} leaf rows moved: ${frozen.map(([l]) => l).join(', ')}\n`,
    );
  }
  console.log(`  page errors: ${errors.length === 0 ? 'none' : errors.slice(0, 3).join(' | ')}\n`);
} finally {
  await browser.close();
}
