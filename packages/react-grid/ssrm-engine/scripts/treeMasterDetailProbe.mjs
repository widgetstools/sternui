/**
 * TREE DATA and MASTER/DETAIL on the ssrm MarketsGrid surface, driven live.
 *
 * Both are **new MarketsGrid API rather than restored parity** — the CSRM
 * surface exposes neither on any path, and until this session they existed only
 * on the Perspective surface. They were two of the three entries in the losing
 * engine's column of the session-8 decision, so "it works" here is the claim
 * that closes them, and a claim that closes a decision is worth measuring
 * rather than reasoning about.
 *
 * ## What each check refuses to be satisfied by
 *
 *   - a tree that renders every row at depth 0 is what you get when the
 *     hierarchy never reaches the engine (AG sends no `rowGroupCols` in tree
 *     mode), and it still looks like a working grid. So the parent rows are
 *     counted AND expanded, and the child level is asserted to hold DIFFERENT
 *     rows from the root;
 *   - a detail grid showing the whole book is what an empty match produces, and
 *     it also "works". So the child count is asserted to be smaller than the
 *     book and every child is checked to share the master's desk;
 *   - `forEachDetailGridInfo` is AG's own registry of live detail grids, and it
 *     is used deliberately: walking `__reactFiber$` up from a detail grid
 *     reaches the MASTER grid, which reports the master's row count and looks
 *     exactly like master/detail ignoring its match clause.
 *
 *   node packages/react-grid/ssrm-engine/scripts/treeMasterDetailProbe.mjs \
 *     --url http://localhost:5321/
 */
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const url = opt('url', 'http://localhost:5321/');

const benign = (t) =>
  /License Key Not Found|AG Grid Enterprise|ag-grid\.com|\*{10}|Failed to load resource|seed-config|ConfigManager|unlocked for trial|hide the watermark|ERR_NAME_NOT_RESOLVED/i.test(t);

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext();
const page = await context.newPage();
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

const settleGrid = async () => {
  await page.waitForSelector('.ag-row', { timeout: 180_000 });
  await page.waitForTimeout(15_000);
};

try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await settleGrid();

  // ── TREE DATA ────────────────────────────────────────────────────────────
  await page.click('[data-testid="ssrm-lab-mode-tree"]');
  await settleGrid();

  const tree = await page.evaluate(async () => {
    const settle = (ms) => new Promise((r) => setTimeout(r, ms));
    const api = window.__ssrmEngineGrid?.api;
    if (!api) return { fatal: 'no grid api after switching to tree mode' };

    const displayed = () => {
      const out = [];
      for (let i = 0; i < api.getDisplayedRowCount(); i += 1) {
        const n = api.getDisplayedRowAtIndex(i);
        if (n) out.push(n);
      }
      return out;
    };
    const roots = displayed();
    // A tree parent is NOT `node.group` in AG's SSRM tree mode, and MEASURED,
    // it is not `node.expandable` either — both read false on a correct tree
    // root while AG takes its key from `getServerSideGroupKey` and expands it
    // happily. The marker the ENGINE stamps is the only reliable identifier.
    const isParent = (n) =>
      n.group === true || n.expandable === true || n.data?.__ssrmTreeGroup === true;
    const parents = roots.filter(isParent);
    if (parents.length === 0) {
      return {
        fatal:
          'no parent rows at all — a hierarchy that never reached the engine renders every ' +
          'row at depth 0 and still looks like a working grid',
      };
    }
    const rootKeys = parents.map((n) => String(n.key));
    api.setRowNodeExpanded(parents[0], true);
    await settle(6000);
    const afterExpand = displayed();
    const children = afterExpand.filter((n) => n.level === 1);
    const parentFlags = { group: parents[0].group === true, expandable: parents[0].expandable === true };

    return {
      treeData: api.getGridOption('treeData') === true,
      parentFlags,
      rootCount: parents.length,
      rootKeys: rootKeys.slice(0, 6),
      childCount: children.length,
      childKeys: [...new Set(children.map((n) => String(n.key)))].slice(0, 6),
      /**
       * Every child BELONGS to the parent that was expanded.
       *
       * Not "the child keys differ from the root keys": this book draws `desk`
       * and `book` from the same alphabet, so a child named `Bravo` under a
       * root named `Alpha` is ordinary, and a key-overlap check FAILS on a
       * correct tree. What cannot be coincidence is the child rows carrying the
       * expanded parent's own value in the field the level above groups by —
       * that is the ancestor predicate having been applied.
       */
      expandedKey: String(parents[0].key),
      ...(await (async () => {
        /**
         * Down to the LEAVES, because the level-1 rows are themselves parents.
         *
         * A `desk -> book` hierarchy puts book nodes at level 1, and a book node
         * carries `book` and no `desk` at all — so asserting "every child has
         * the parent's desk" against level 1 fails on a perfectly correct tree.
         * Only the leaf rows carry both, and only they can show that the
         * ancestor predicate was applied at BOTH levels.
         */
        const firstChild = children.find(isParent);
        if (!firstChild) return { leafCount: 0, leavesBelongToParent: false };
        api.setRowNodeExpanded(firstChild, true);
        await settle(6000);
        const leaves = displayed().filter((n) => n.level === 2 && n.data && !isParent(n));
        return {
          leafCount: leaves.length,
          childKey: String(firstChild.key),
          leavesBelongToParent:
            leaves.length > 0 &&
            leaves.every(
              (n) =>
                String(n.data.desk ?? '') === String(parents[0].key) &&
                String(n.data.book ?? '') === String(firstChild.key),
            ),
        };
      })()),
      blocks: window.__ssrmEngineGrid.blocks(),
    };
  });
  if (tree.fatal) throw new Error(tree.fatal);

  console.log(`\n=== tree data and master/detail · ${url}\n`);
  console.log(`  tree roots: ${tree.rootKeys.join(', ')}`);
  console.log(`  children of the first: ${tree.childKeys.join(', ')}`);
  console.log(
    `  a tree parent reports group=${tree.parentFlags.group} expandable=${tree.parentFlags.expandable}` +
      ` — a tree parent is neither; the marker the engine stamps is the identifier`,
  );

  check('AG tree mode is on', tree.treeData, 'treeData');
  check('the hierarchy produced PARENT rows', tree.rootCount > 1, `${tree.rootCount} roots`);
  check(
    'expanding one served a CHILD level from the worker',
    tree.childCount > 0,
    `${tree.childCount} children`,
  );
  check(
    'expanding a CHILD served the leaf level',
    tree.leafCount > 0,
    `${tree.leafCount} leaves under ${tree.expandedKey}/${tree.childKey}`,
  );
  check(
    'every leaf belongs to BOTH ancestors — the predicate applied at each level',
    tree.leavesBelongToParent,
    `desk = ${tree.expandedKey}, book = ${tree.childKey}`,
  );
  check('no failed blocks in tree mode', tree.blocks.failed === 0, `${tree.blocks.served} served`);

  // ── MASTER / DETAIL ──────────────────────────────────────────────────────
  await page.click('[data-testid="ssrm-lab-mode-detail"]');
  await settleGrid();

  const detail = await page.evaluate(async () => {
    const settle = (ms) => new Promise((r) => setTimeout(r, ms));
    const api = window.__ssrmEngineGrid?.api;
    if (!api) return { fatal: 'no grid api after switching to master/detail' };

    let master = null;
    for (let i = 0; i < api.getDisplayedRowCount() && !master; i += 1) {
      const n = api.getDisplayedRowAtIndex(i);
      if (n && !n.group && !n.footer && n.data) master = n;
    }
    if (!master) return { fatal: 'no leaf row to expand' };

    const masterDesk = master.data.desk ?? null;
    api.setRowNodeExpanded(master, true);
    await settle(8000);

    // AG's OWN registry of live detail grids. Walking the fiber up from a
    // detail grid reaches the MASTER grid instead, which reports the master's
    // row count and looks exactly like a match clause being ignored.
    const detailGrids = [];
    api.forEachDetailGridInfo((info) => detailGrids.push(info));
    const first = detailGrids[0];
    const rows = [];
    first?.api?.forEachNode?.((n) => {
      if (n.data) rows.push(n.data);
    });

    return {
      masterDetail: api.getGridOption('masterDetail') === true,
      masterDesk,
      detailGrids: detailGrids.length,
      detailRows: rows.length,
      allShareTheDesk: rows.length > 0 && rows.every((r) => r.desk === masterDesk),
      bookRows: await window.__ssrmEngineGrid.client.countFiltered({}),
      blocks: window.__ssrmEngineGrid.blocks(),
    };
  });
  if (detail.fatal) throw new Error(detail.fatal);

  console.log(
    `\n  master desk ${detail.masterDesk}: ${detail.detailRows} detail rows of ${detail.bookRows} in the book`,
  );

  check('AG master/detail is on', detail.masterDetail, 'masterDetail');
  check('expanding a master row created a DETAIL grid', detail.detailGrids > 0, `${detail.detailGrids}`);
  check('the detail grid holds rows', detail.detailRows > 0, `${detail.detailRows}`);
  check(
    'and NOT the whole book — an empty match would give exactly that',
    detail.detailRows < detail.bookRows,
    `${detail.detailRows} of ${detail.bookRows}`,
  );
  check(
    'every detail row shares the master’s desk',
    detail.allShareTheDesk,
    `desk = ${detail.masterDesk}`,
  );
  check('no failed blocks in master/detail', detail.blocks.failed === 0, `${detail.blocks.served} served`);
  check('page errors', errors.length === 0, errors.slice(0, 2).join(' | ') || 'none');

  console.log('');
  if (failures.length > 0) {
    console.log(`  ${failures.length} FAILURES:`);
    for (const f of failures) console.log(`    - ${f}`);
    console.log('');
    process.exitCode = 1;
  } else {
    console.log('  tree data and master/detail both work on this surface\n');
  }
} finally {
  await browser.close();
}
