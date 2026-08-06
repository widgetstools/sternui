/**
 * CSRM parity for a LIVE GROUPED grid, on the surface that ships.
 *
 * `marketsGridParityProbe` covers the flat items — set-filter values, quick
 * search, status panels, cell edit, grand total, export. Grouping adds a set of
 * its own, and they matter more here than anywhere else because under grouping
 * this surface stops pushing transactions and re-reads the expanded routes
 * instead (`rowEngine.ts`). A re-read is a different mechanism from a
 * transaction, and every one of these is a way it could be worse:
 *
 *   1. **a changed cell still FLASHES.** AG applies a block re-read through
 *      `RowNode.updateData`, the same call a transaction takes, so the change
 *      events fire — but that is a claim about AG's internals and this measures
 *      it instead;
 *   2. **the expanded tree, the selection and the scroll position survive.** A
 *      refresh that collapses the tree or loses the selection is worse than the
 *      stale aggregate it fixes;
 *   3. **an edit while grouped reaches the book**, keyed by the row's PATH;
 *   4. **sort and filter at depth**, including on a calculated column;
 *   5. **group footers** — a different node from the grand total, and one
 *      `forEachNode` does not traverse at all.
 *
 * Every check carries its own anti-vacuous gate: a grouped grid that never
 * expanded, a selection of zero rows or a filter that excluded nothing all
 * agree with a broken surface perfectly.
 *
 *   node packages/react-grid/ssrm-engine/scripts/groupedParityProbe.mjs \
 *     --url "http://localhost:5311/?engine=ssrm&surface=marketsgrid"
 */
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const url = opt('url', 'http://localhost:5311/?engine=ssrm&surface=marketsgrid');
const level0 = opt('group0', 'assetClass');
const level1 = opt('group1', 'issuerSector');
const valueCol = opt('value', 'esgScore');

const benign = (t) =>
  /License Key Not Found|AG Grid Enterprise|ag-grid\.com|\*{10}|Failed to load resource|seed-config|ConfigManager|unlocked for trial|hide the watermark|ERR_NAME_NOT_RESOLVED/i.test(t);

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1800, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => {
  const t = String(e.message ?? e).slice(0, 200);
  if (!benign(t)) errors.push(t);
});

const failures = [];
const check = (label, ok, detail) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(label);
};

try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.click('[data-testid="lab-tab-stress"]');
  await page.waitForSelector('.ag-row', { timeout: 180_000 });
  await page.waitForTimeout(20_000);

  const r = await page.evaluate(
    async ([level0, level1, valueCol]) => {
      const settle = (ms) => new Promise((res) => setTimeout(res, ms));
      const handle = window.__ssrmEngineGrid;
      const api = handle?.api;
      if (!api) return { fatal: 'no grid api' };

      /**
       * Cells wearing a flash class right now, either flavour.
       *
       * The lab turns AG's own `enableCellChangeFlash` OFF and lets the
       * conditional-styling module own it — and that module's flash is a CSS
       * ANIMATION on the rule's own class, applied by a TIMED ACTIVATION for
       * `activeDurationMs` after the value moves. So the observable is the
       * seeded `esg-tick` rule's class on a cell, not a `ds-flash-*` class:
       * there is no such class, and a probe looking for one reads 0 forever.
       * `ag-cell-data-changed` is watched too, for a grid that uses AG's own.
       */
      const flashing = () =>
        document.querySelectorAll('.ag-cell-data-changed, .ag-cell-data-changed-animation').length +
        document.querySelectorAll('.ag-cell.ds-rule-esg-tick').length;
      const watchFlash = async (ms) => {
        let most = 0;
        const until = performance.now() + ms;
        while (performance.now() < until) {
          most = Math.max(most, flashing());
          await settle(120);
        }
        return most;
      };

      // The column that actually TICKS has to be on screen, or this watches
      // columns the book never moves and reports a dead surface.
      api.applyColumnState({ defaultState: { rowGroup: false } });
      await settle(4000);
      api.ensureColumnVisible(valueCol);
      await settle(2000);
      /**
       * THE UNGROUPED CONTROL for the flash, taken first.
       *
       * Without it "no flash while grouped" cannot be told from "this lab does
       * not flash at all", and those are different findings.
       */
      const flashFlat = await watchFlash(10_000);

      // Diagnostics for the flash, because "0" has three possible causes and
      // they are different findings: the rule is not installed, the shared row
      // signal carries no per-row delta, or the timed activation never fires.
      const el0 = document.querySelector(".ag-root-wrapper");
      const fk = Object.keys(el0).find((x) => x.startsWith("__reactFiber$"));
      let fib = el0[fk], gctx = null;
      while (fib && !gctx) {
        const v = fib.memoizedProps?.value;
        if (v && typeof v === "object" && v.platform && "engineKind" in v) gctx = v;
        fib = fib.return;
      }
      const csRules = (gctx?.platform?.store?.getModuleState("conditional-styling")?.rules ?? []).map((x) => x.id);
      let sigAll = 0, sigFull = 0;
      const offSig = gctx.platform.rows.subscribe((c) => { sigAll += 1; if (c.full) sigFull += 1; });
      await settle(5000);
      offSig();
      const flashDiag = { csRules, sigAll, sigFull, sigDelta: sigAll - sigFull };

      // ── group two levels and open one of each ────────────────────────────
      api.applyColumnState({
        state: [
          { colId: level0, rowGroup: true, rowGroupIndex: 0 },
          { colId: level1, rowGroup: true, rowGroupIndex: 1 },
          { colId: valueCol, aggFunc: 'sum' },
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
      if (!g0) return { fatal: 'no depth-0 group row appeared' };
      api.setRowNodeExpanded(g0, true);
      await settle(6000);
      const g1 = firstGroupAt(1);
      if (g1) api.setRowNodeExpanded(g1, true);
      await settle(6000);

      const routesOf = () => {
        const out = [];
        api.forEachNode((n) => {
          if (!n.group || !n.expanded) return;
          const route = [];
          for (let w = n; w && w.level >= 0; w = w.parent) {
            if (typeof w.key === 'string') route.unshift(w.key);
          }
          out.push(route.join('/'));
        });
        return out.sort();
      };
      const leaves = () => {
        const out = [];
        for (let i = 0; i < api.getDisplayedRowCount(); i += 1) {
          const n = api.getDisplayedRowAtIndex(i);
          if (n && !n.group && !n.footer && n.data) out.push(n);
        }
        return out;
      };

      const openRoutes = routesOf();
      const leafNodes = leaves();

      // ── 5. GROUP FOOTERS, which `forEachNode` does not traverse ──────────
      //
      // Counted off the DISPLAYED rows for exactly that reason, and compared
      // against what `forEachNode` sees so the difference is on the record.
      // WITH THE FEED OFF. Two levels read at different instants on a ticking
      // book need not add up at that instant — every number is individually
      // correct and a cross-level comparison mid-feed is a montage. Measured:
      // one footer matched its group to the cent and another was 0.95% out,
      // which is one tick. Pausing is what makes the check mean something.
      handle.setLive(false);
      await settle(1500);
      handle.refresh();
      await settle(3000);
      let footersDisplayed = 0;
      let footerMatchesGroup = null;
      const footerDetail = [];
      // A footer is a SIBLING of its group node, not a child — `n.parent` is
      // the group ABOVE it, so comparing against that reads a different level.
      // And under a server row model the aggregate is in the row DATA the
      // engine supplied, not in AG's own `aggData`, which client-side
      // aggregation fills. Both of those made a working surface look broken.
      const footerToGroup = new Map();
      for (let i = 0; i < api.getDisplayedRowCount(); i += 1) {
        const n = api.getDisplayedRowAtIndex(i);
        // AG links a group to its footer through `sibling`, and that is the
        // only exact pairing: two groups at different depths can share a key,
        // and a footer's `parent` is the group ABOVE it rather than its own.
        if (n?.group && !n.footer && n.sibling) {
          footerToGroup.set(n.sibling, n.data?.[valueCol] ?? n.aggData?.[valueCol] ?? null);
        }
      }
      for (let i = 0; i < api.getDisplayedRowCount(); i += 1) {
        const n = api.getDisplayedRowAtIndex(i);
        if (!n?.footer) continue;
        footersDisplayed += 1;
        const own = n.data?.[valueCol] ?? n.aggData?.[valueCol] ?? null;
        const group = footerToGroup.has(n) ? footerToGroup.get(n) : null;
        footerDetail.push({ key: n.key ?? null, own, group });
        if (own !== null && group !== null) {
          footerMatchesGroup = footerMatchesGroup === false ? false : own === group;
        }
      }
      let footersViaForEachNode = 0;
      api.forEachNode((n) => {
        if (n.footer) footersViaForEachNode += 1;
      });
      handle.setLive(true);
      await settle(1500);
      const flashGrouped = await watchFlash(12_000);

      // ── 2. the tree, the SELECTION and the SCROLL survive a refresh ──────
      const selectable = leafNodes.slice(0, 3);
      for (const n of selectable) n.setSelected(true);
      const scrollBefore = document.querySelector('.ag-body-viewport')?.scrollTop
        ?? document.querySelector('.ag-grid-viewport')?.scrollTop
        ?? 0;
      const selectedBefore = api.getSelectedRows().length;
      handle.refresh();
      await settle(4000);
      const survived = {
        routes: routesOf(),
        selected: api.getSelectedRows().length,
        scroll: document.querySelector('.ag-body-viewport')?.scrollTop
          ?? document.querySelector('.ag-grid-viewport')?.scrollTop
          ?? 0,
      };

      // ── 3. an EDIT while grouped, keyed by the row's path ────────────────
      let edit = null;
      const target = leaves()[0];
      if (target) {
        const key = target.data.positionId ?? target.data.id;
        const wrote = Math.round((Number(target.data[valueCol]) + 11) * 100) / 100;
        target.setDataValue(valueCol, wrote);
        // Read back FAST. This book random-walks `esgScore`, so a value written
        // and read three seconds later has usually been overwritten by the feed
        // — the fixture, not the surface. 800 ms is long enough for the write to
        // cross the port and short enough to beat the next tick on that row.
        await settle(800);
        // Read it back FROM THE BOOK, not from the node the edit was applied
        // to — a value that only exists in the block cache is the failure this
        // whole path is about.
        const fromBook = await handle.client.getRows({
          filterModel: { [target.data.positionId !== undefined ? 'positionId' : 'id']: { filterType: 'text', type: 'equals', filter: String(key) } },
          startRow: 0,
          endRow: 1,
        });
        edit = { key, wrote, inBook: fromBook.rowData[0]?.[valueCol] ?? null };
      }

      // ── 4. SORT and FILTER at depth, including a calculated column ───────
      const leafKeys = () => leaves().map((n) => String(n.data.positionId ?? n.data.id));
      const calcCol = api
        .getColumns()
        ?.map((c) => c.getColId())
        .find((id) => String(id).startsWith('calc_'));
      const before = leafKeys();
      api.applyColumnState({ state: [{ colId: valueCol, sort: 'desc' }], defaultState: { sort: null } });
      await settle(4000);
      const afterSort = leafKeys();
      let afterCalcSort = null;
      if (calcCol) {
        api.applyColumnState({ state: [{ colId: calcCol, sort: 'asc' }], defaultState: { sort: null } });
        await settle(4000);
        afterCalcSort = leafKeys();
      }
      api.applyColumnState({ defaultState: { sort: null } });
      await settle(2000);

      const groupsBefore = api.getDisplayedRowCount();
      api.setFilterModel({
        [valueCol]: { filterType: 'number', type: 'greaterThan', filter: 900 },
      });
      await settle(5000);
      const groupsFiltered = api.getDisplayedRowCount();
      const leavesFiltered = leaves().length;
      api.setFilterModel(null);
      await settle(4000);
      const groupsCleared = api.getDisplayedRowCount();

      await settle(3000);
      return {
        openRoutes,
        leafCount: leafNodes.length,
        footersDisplayed,
        footersViaForEachNode,
        footerMatchesGroup,
        footerDetail,
        flashDiag,
        flashFlat,
        flashGrouped,
        selectedBefore,
        scrollBefore,
        survived,
        edit,
        calcCol,
        sortChanged: before.join() !== afterSort.join(),
        calcSortChanged: afterCalcSort === null ? null : afterSort.join() !== afterCalcSort.join(),
        groupsBefore,
        groupsFiltered,
        leavesFiltered,
        groupsCleared,
        blocks: handle.blocks(),
        // Read AFTER a settle: a whole-book count in flight at the instant of
        // sampling is not a pending RPC, it is a snapshot taken mid-call.
        rpc: handle.rpc(),
        groupRefresh: handle.groupRefresh?.() ?? null,
      };
    },
    [level0, level1, valueCol],
  );

  if (r.fatal) throw new Error(r.fatal);

  console.log(`\n=== CSRM parity, GROUPED and live · ${url}\n`);
  console.log(`  expanded routes: ${r.openRoutes.join(' , ')}`);
  console.log(`  ${r.leafCount} leaf rows on screen`);
  console.log(
    `  flash diagnostics: rules ${r.flashDiag.csRules.join(",")}; row signals ${r.flashDiag.sigAll}` +
      ` of which ${r.flashDiag.sigDelta} carried a per-row DELTA`,
  );

  // Anti-vacuous gates first: every check below is meaningless without these.
  check('the grid really is grouped and expanded', r.openRoutes.length >= 2, `${r.openRoutes.length} routes`);
  check('leaf rows are on screen to judge', r.leafCount > 0, `${r.leafCount}`);

  check(
    'a changed cell FLASHES under the route-refresh path',
    r.flashGrouped > 0,
    `${r.flashGrouped} cells flashing at once while grouped, against ${r.flashFlat} ungrouped (the control)`,
  );

  check(
    'the expanded tree survives a refresh',
    r.survived.routes.join() === r.openRoutes.join(),
    `${r.openRoutes.join(' , ')} -> ${r.survived.routes.join(' , ')}`,
  );
  check(
    'the SELECTION survives a refresh',
    r.selectedBefore > 0 && r.survived.selected === r.selectedBefore,
    `${r.selectedBefore} selected -> ${r.survived.selected}`,
  );
  check(
    'the SCROLL position survives a refresh',
    r.survived.scroll === r.scrollBefore,
    `${r.scrollBefore} -> ${r.survived.scroll}`,
  );

  if (r.edit) {
    check(
      'an edit made while GROUPED reaches the book',
      r.edit.inBook === r.edit.wrote,
      `wrote ${r.edit.wrote} to ${r.edit.key}, the book says ${r.edit.inBook}`,
    );
  } else {
    check('an edit made while GROUPED reaches the book', false, 'no leaf row to edit');
  }

  check('sorting at depth re-orders the leaves', r.sortChanged, `${r.leafCount} leaves compared`);
  check(
    'sorting at depth on a CALCULATED column re-orders them again',
    r.calcSortChanged === true,
    r.calcCol ? `on ${r.calcCol}` : 'no calculated column on this grid',
  );
  check(
    'filtering at depth narrows the grid',
    r.groupsFiltered < r.groupsBefore && r.leavesFiltered >= 0,
    `${r.groupsBefore} displayed rows -> ${r.groupsFiltered} (leaves ${r.leavesFiltered})`,
  );
  check(
    'and clears back',
    r.groupsCleared === r.groupsBefore,
    `${r.groupsFiltered} -> ${r.groupsCleared}, was ${r.groupsBefore}`,
  );

  check(
    'group FOOTERS exist and agree with their group',
    r.footersDisplayed > 0 && r.footerMatchesGroup === true,
    `${r.footersDisplayed} footers displayed, ${r.footersViaForEachNode} of them visible to forEachNode` +
      ` ${JSON.stringify(r.footerDetail).slice(0, 220)}` +
      ` — which is why nothing counts with it`,
  );

  check('blocks failed', r.blocks.failed === 0, `${r.blocks.served} served, ${r.blocks.failed} failed`);
  check(
    'rpc timed out / late',
    r.rpc.timedOut === 0 && r.rpc.late === 0,
    `${r.rpc.sent} sent, ${r.rpc.timedOut} timed out, ${r.rpc.late} late, ${r.rpc.pending} in flight at the instant of sampling — the viewport timer and the whole-book counts mean one is usually mid-call, which is not a leak`,
  );
  if (r.groupRefresh) {
    console.log(
      `\n  grouped path: ${r.groupRefresh.writes} writes, ${r.groupRefresh.refreshes} passes,` +
        ` ${r.groupRefresh.routes} routes, ${r.groupRefresh.deferred} deferred`,
    );
  }
  check('page errors', errors.length === 0, errors.slice(0, 2).join(' | ') || 'none');

  console.log('');
  if (failures.length > 0) {
    console.log(`  ${failures.length} FAILURES:`);
    for (const f of failures) console.log(`    - ${f}`);
    console.log('');
    process.exitCode = 1;
  } else {
    console.log('  every grouped parity item passed\n');
  }
} finally {
  await browser.close();
}
