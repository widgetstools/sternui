/**
 * Does a CROSS-BOOK style rule light a column header on the ssrm surface?
 *
 * `headerPainter` asks "does ANY row match this rule?" and decides a column
 * header's flash or indicator badge on the answer. On a server row model the
 * client-side way of answering it — `api.forEachNodeAfterFilter` — visits
 * **zero** nodes, so until session 9 the painter on this surface was not
 * degraded but DEAD, and silently: a rule that lights no header looks exactly
 * like a rule whose condition is false.
 *
 * ## What makes this honest, and what made an earlier version worthless
 *
 * 1. **The rule is SEEDED, not installed at run time.** Writing one straight
 *    into module state with `store.setModuleState` reaches the store and never
 *    reaches the grid: the column defs carrying the rule are rebuilt by the
 *    React pipeline, which does not re-run for that write. The first version of
 *    this probe did exactly that and measured a header that could not have lit
 *    — on EITHER surface, which is how it was caught.
 * 2. **A rule the loaded blocks could answer proves nothing.**
 *    `esg-leaders-whole-book` is `[esgScore] > 999`, about one row in a
 *    thousand, and this re-checks at run time that NO LOADED ROW reaches it. If
 *    one does, the probe REFUSES to report rather than passing on a rule the
 *    client scan could have answered.
 * 3. **The CELLS are the control.** Both seeded rules target `cells+headers`.
 *    The cross-book rule must paint no cell and still paint its header — the
 *    seam doing the one thing nothing local can — while the impossible rule
 *    paints neither.
 *
 * The whole-book AGGREGATE is checked too, under a filter that genuinely
 * narrows the book, because it is the decision most likely to be re-derived as
 * a bug: an "above average" threshold is a property of the BOOK, so a filter
 * hides rows without moving it.
 *
 *   node packages/react-grid/ssrm-engine/scripts/styleRuleHeaderProbe.mjs \
 *     --url "http://localhost:5311/?engine=ssrm&surface=marketsgrid"
 */
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const url = opt('url', 'http://localhost:5311/?engine=ssrm&surface=marketsgrid');
/** The column the seeded rules read. */
const column = opt('column', 'esgScore');
/** The seeded rules, and the threshold the first one carries. */
const LIT_RULE = 'esg-leaders-whole-book';
const DARK_RULE = 'esg-impossible';
/** The positive control: every row matches it, so the CLIENT scan can answer. */
const ANY_RULE = 'esg-any';
const THRESHOLD = Number(opt('threshold', '999'));

const benign = (t) =>
  /License Key Not Found|AG Grid Enterprise|ag-grid\.com|\*{10}|Failed to load resource|seed-config|ConfigManager|unlocked for trial|hide the watermark|ERR_NAME_NOT_RESOLVED/i.test(t);

/** The `{ platform, engineKind }` context value, off the fiber. */
const gridContext = () => {
  const el = document.querySelector('.ag-root-wrapper');
  const k = Object.keys(el).find((x) => x.startsWith('__reactFiber$'));
  let f = el[k];
  while (f) {
    const value = f.memoizedProps?.value;
    if (value && typeof value === 'object' && value.platform && 'engineKind' in value) return value;
    f = f.return;
  }
  return null;
};

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1800, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => {
  const t = String(e.message ?? e).slice(0, 200);
  if (!benign(t)) errors.push(t);
});

try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.click('[data-testid="lab-tab-stress"]');
  await page.waitForSelector('.ag-row', { timeout: 180_000 });
  await page.waitForTimeout(20_000);

  const result = await page.evaluate(
    async ([fnSrc, column, litRule, darkRule, threshold]) => {
      const settle = (ms) => new Promise((r) => setTimeout(r, ms));
      const ctx = eval(`(${fnSrc})`)();
      if (!ctx) return { fatal: 'no {platform, engineKind} context on the fiber' };
      const handle = window.__ssrmEngineGrid;
      const api = handle?.api;
      if (!api) return { fatal: 'no grid api' };

      const rules = ctx.platform.store.getModuleState('conditional-styling')?.rules ?? [];
      if (!rules.some((r) => r.id === litRule && r.enabled)) {
        return { fatal: `the seeded rule '${litRule}' is not in this profile` };
      }

      // Flat, so the loaded rows are leaves and their maximum means something.
      api.applyColumnState({ defaultState: { rowGroup: false } });
      await settle(4000);
      // AG virtualises COLUMNS: a header cell not scrolled into view is not in
      // the DOM at all, and the class assertion below would read an empty list
      // and call it "unlit".
      api.ensureColumnVisible(column);
      await settle(3000);

      const gridCtx = api.getGridOption('context');

      const litFor = (ruleId, selector) =>
        [...document.querySelectorAll(selector)].filter((el) =>
          [...el.classList].includes(`ds-rule-${ruleId}`),
        ).length;

      /**
       * Sampled over a window rather than once: a header cell re-created by a
       * virtualisation pass loses its class, and one reading cannot tell that
       * from "never painted".
       */
      const watch = async (ms) => {
        const seen = {
          litHeader: 0,
          litCells: 0,
          darkHeader: 0,
          darkCells: 0,
          anyHeader: 0,
          anyCells: 0,
          loadedMax: Number.NEGATIVE_INFINITY,
          loadedRows: 0,
        };
        const until = performance.now() + ms;
        while (performance.now() < until) {
          seen.litHeader = Math.max(seen.litHeader, litFor(litRule, '.ag-header-cell'));
          seen.litCells = Math.max(seen.litCells, litFor(litRule, '.ag-cell'));
          seen.darkHeader = Math.max(seen.darkHeader, litFor(darkRule, '.ag-header-cell'));
          seen.darkCells = Math.max(seen.darkCells, litFor(darkRule, '.ag-cell'));
          seen.anyHeader = Math.max(seen.anyHeader, litFor('esg-any', '.ag-header-cell'));
          seen.anyCells = Math.max(seen.anyCells, litFor('esg-any', '.ag-cell'));
          // The anti-vacuous half, on the SAME schedule: the book ticks this
          // column, so a row that was below the threshold at the start can
          // reach it later and quietly make the rule locally answerable.
          api.forEachNode((node) => {
            const v = node?.data?.[column];
            if (typeof v === 'number' && !Number.isNaN(v)) {
              seen.loadedRows += 1;
              if (v > seen.loadedMax) seen.loadedMax = v;
            }
          });
          await settle(250);
        }
        return seen;
      };

      const seen = await watch(8000);

      // The two counts, ADJACENT. Taken apart they disagree and it is the
      // FIXTURE, not the code: this book random-walks the very column the rule
      // reads, so two readings seconds apart are two different books.
      const [seamCount, independentCount] = await Promise.all([
        gridCtx.ssrmCountMatchingExpression(`[${column}] > ${threshold}`),
        handle.client.countFiltered({
          filterModel: {
            [column]: { filterType: 'number', type: 'greaterThan', filter: threshold },
          },
        }),
      ]);
      const bookRows = await handle.client.countFiltered({});

      /**
       * The WHOLE-BOOK aggregate, under a filter that halves the book.
       *
       * Three readings, because the book moves: the whole-book average before
       * and after, and the one taken under the filter. The claim is that the
       * filtered reading sits with the whole-book pair and NOT with the
       * filtered population's own average — which is measured too, through the
       * grand total, and is a different number by construction.
       */
      const avgBefore = await gridCtx.ssrmAggregateScalar(column, 'avg');
      const filterModel = {
        [column]: { filterType: 'number', type: 'greaterThan', filter: avgBefore },
      };
      api.setFilterModel(filterModel);
      await settle(4000);
      const [avgUnderFilter, filteredPopulationAvg, rowsUnderFilter] = await Promise.all([
        gridCtx.ssrmAggregateScalar(column, 'avg'),
        handle.client
          .grandTotal({ filterModel, valueCols: [{ id: column, aggFunc: 'avg' }] })
          .then((total) => total[column]),
        handle.client.countFiltered({ filterModel }),
      ]);
      api.setFilterModel(null);
      await settle(2000);
      const avgAfter = await gridCtx.ssrmAggregateScalar(column, 'avg');

      return {
        engineKind: ctx.engineKind,
        seen,
        seamCount,
        independentCount,
        bookRows,
        threshold,
        avgBefore,
        avgAfter,
        avgUnderFilter,
        filteredPopulationAvg,
        rowsUnderFilter,
        blocks: handle.blocks?.() ?? null,
      };
    },
    [gridContext.toString(), column, LIT_RULE, DARK_RULE, THRESHOLD],
  );

  if (result.fatal) throw new Error(result.fatal);

  const { seen } = result;
  console.log(`\n=== the whole-book style-rule seam · ${url}\n`);
  console.log(`  engineKind reported by the platform: ${result.engineKind}`);
  console.log(
    `  loaded rows sampled: ${seen.loadedRows}, max ${column} among them ` +
      `${seen.loadedMax.toFixed(4)} — the rule's threshold is ${result.threshold}`,
  );
  console.log(
    `  '${LIT_RULE}' matches ${result.independentCount} of ${result.bookRows} rows;` +
      ` the seam counted ${result.seamCount}`,
  );
  console.log(
    `  control 'esg-any': header ${seen.anyHeader} cells ${seen.anyCells}`,
  );
  console.log(
    `  painted: header ${seen.litHeader} cells ${seen.litCells}` +
      `  ·  '${DARK_RULE}': header ${seen.darkHeader} cells ${seen.darkCells}`,
  );
  console.log(
    `  whole-book AVG ${result.avgBefore} → ${result.avgAfter}; under a filter leaving` +
      ` ${result.rowsUnderFilter} of ${result.bookRows} rows it read ${result.avgUnderFilter},` +
      ` where that population's OWN average is ${result.filteredPopulationAvg}`,
  );
  if (result.blocks) {
    console.log(`  blocks served ${result.blocks.served}, failed ${result.blocks.failed}`);
  }

  // The anti-vacuous gate. A rule the loaded blocks could answer is one the
  // client scan answers, and it would light the header with no seam at all.
  if (!(seen.loadedMax < result.threshold)) {
    console.log(
      `\n  REFUSING TO REPORT: a LOADED row reached ${seen.loadedMax}, at or above the\n` +
        `  rule's threshold of ${result.threshold}. The client scan could answer this rule,\n` +
        `  so a lit header would prove nothing about the whole-book seam.\n`,
    );
    process.exitCode = 1;
  } else {
    const pass = [];
    const fail = [];
    const check = (ok, label) => (ok ? pass : fail).push(label);
    const drift = Math.abs(result.avgAfter - result.avgBefore);
    const filterMove = Math.abs(result.avgUnderFilter - result.avgBefore);
    const populationGap = Math.abs(result.filteredPopulationAvg - result.avgBefore);

    check(result.engineKind === 'ssrm-engine', 'engineKind is ssrm-engine, not csrm');
    check(
      seen.anyCells > 0,
      'THE CONTROL: a rule every loaded row matches paints its cells — so conditional styling is alive on this tab at all',
    );
    check(
      seen.anyHeader > 0,
      'THE CONTROL: and lights its header, which the CLIENT scan alone can do',
    );
    check(seen.litHeader > 0, 'a rule NO LOADED ROW matches LIGHTS its column header');
    check(seen.litCells === 0, 'and paints no CELL, because no loaded row matches it');
    check(seen.darkHeader === 0, 'an impossible rule leaves its header unlit');
    check(seen.darkCells === 0, 'and paints no cell either');
    check(
      result.independentCount > 0,
      `the rule matches rows in the book (${result.independentCount}), so a dark header would be a defect`,
    );
    check(
      Math.abs(result.seamCount - result.independentCount) <= 2,
      `the seam's count (${result.seamCount}) matches an independent pass (${result.independentCount}) — a ticking book moves it by a row or two`,
    );
    check(
      result.rowsUnderFilter > 0 && result.rowsUnderFilter < result.bookRows,
      'the filter genuinely narrowed the book, so the aggregate check is not vacuous',
    );
    check(
      populationGap > drift * 4,
      `the filtered population's own average is far from the whole-book one (${populationGap.toFixed(3)} apart against ${drift.toFixed(3)} of drift), so the two cannot be confused`,
    );
    check(
      filterMove <= drift * 2 + 1e-9,
      `the aggregate did NOT follow the filter (moved ${filterMove.toFixed(3)}, drift alone was ${drift.toFixed(3)})`,
    );
    check((result.blocks?.failed ?? 0) === 0, 'no failed blocks');
    check(errors.length === 0, `no page errors${errors.length ? `: ${errors[0]}` : ''}`);

    console.log('');
    for (const label of pass) console.log(`  PASS  ${label}`);
    for (const label of fail) console.log(`  FAIL  ${label}`);
    console.log(`\n  ${pass.length}/${pass.length + fail.length}\n`);
    if (fail.length > 0) process.exitCode = 1;
  }
} finally {
  await browser.close();
}
