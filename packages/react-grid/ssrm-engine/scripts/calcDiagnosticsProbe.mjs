/**
 * The AUTHORING seam for calculated columns, driven live.
 *
 * The unit tests render the real panel against a fake context. What they cannot
 * reach is the half that only exists in a browser: whether the ssrm surface
 * actually PUTS `ssrmCalcDiagnostics` on the grid context, and whether a real
 * worker-held engine answers it with a real refusal. Those are the two places
 * this could be wired to nothing and still look completely healthy — a blank
 * column is what a refusal produces, and it is also what a seam that answers
 * `[]` produces.
 *
 * ## What each check refuses to be satisfied by
 *
 *   - an EMPTY diagnostics list is what both "the expression was fine" and
 *     "nothing is wired" return. So a column the engine is KNOWN to refuse is
 *     published first, and its refusal is demanded by name;
 *   - a column that fails to PARSE would be refused by the planner in the
 *     window and never reach the engine at all — which would make this probe
 *     pass while testing nothing. `SUM([midPrice])` is used deliberately: it
 *     parses cleanly, so only the engine can object to it;
 *   - a diagnostic for SOME column is not a diagnostic for THIS one, and the
 *     panel filters by colId. Both a refused and a clean column are published,
 *     and the clean one is asserted to have nothing said about it.
 *
 * Every field named below is a REAL field of this book, which is not a detail:
 * the first draft used `price`, which the book does not have, so the column
 * meant to be the clean control drew an "unknown field" diagnostic of its own
 * and failed the probe. The product was right and the fixture was wrong — the
 * same mistake `region` caused in the tree fixture one session earlier.
 *
 *   node packages/react-grid/ssrm-engine/scripts/calcDiagnosticsProbe.mjs \
 *     --url http://localhost:5321/
 */
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const url = opt('url', 'http://localhost:5321/');

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

const failures = [];
const check = (label, ok, detail) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(label);
};

try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ag-row', { timeout: 180_000 });
  await page.waitForTimeout(12_000);

  const out = await page.evaluate(async () => {
    const settle = (ms) => new Promise((r) => setTimeout(r, ms));
    const api = window.__ssrmEngineGrid?.api;
    if (!api) return { fatal: 'no grid api' };
    const client = window.__ssrmEngineGrid.client;

    // Published straight at the engine rather than through the settings sheet:
    // the sheet's job is covered by the panel's own tests, and what is in doubt
    // here is the ENGINE's answer and the CONTEXT's ability to carry it.
    await client.setCalcColumns([
      // Parses; only the engine can object. A cross-row aggregate has no
      // per-row value, and this engine says so by name.
      { colId: 'probeRefused', ast: window.__ssrmEngineGrid.parse('SUM([midPrice])') },
      // Parses AND compiles. Present so "the list is non-empty" cannot pass
      // for "the right thing is in the list".
      { colId: 'probeFine', ast: window.__ssrmEngineGrid.parse('[midPrice] * 2') },
      // Names a field this book does not have — reported, not refused.
      { colId: 'probeTypo', ast: window.__ssrmEngineGrid.parse('[midPrikce] * 2') },
    ]);
    await settle(3_000);

    const context = api.getGridOption('context');
    const viaContext = context?.ssrmCalcDiagnostics
      ? await context.ssrmCalcDiagnostics()
      : null;

    return {
      seamPresent: typeof context?.ssrmCalcDiagnostics === 'function',
      dialect: context?.ssrmExpressionDialect ?? null,
      diagnostics: viaContext,
    };
  });
  if (out.fatal) throw new Error(out.fatal);

  console.log(`\n=== calculated-column authoring feedback · ${url}\n`);
  for (const d of out.diagnostics ?? []) {
    console.log(`  ${d.colId.padEnd(14)} ${d.phase.padEnd(8)} ${d.message}`);
  }
  console.log('');

  const forCol = (id) => (out.diagnostics ?? []).filter((d) => d.colId === id);

  check('the surface puts ssrmCalcDiagnostics on the grid context', out.seamPresent);
  check('the seam answered', Array.isArray(out.diagnostics), `${out.diagnostics?.length ?? 0} entries`);
  check(
    'a cross-row aggregate is REFUSED, and says so',
    forCol('probeRefused').some((d) => d.phase === 'compile'),
    forCol('probeRefused')[0]?.message ?? 'nothing said',
  );
  check(
    'an unknown field is reported as a FIELD problem, not a refusal',
    forCol('probeTypo').some((d) => d.phase === 'column'),
    forCol('probeTypo')[0]?.message ?? 'nothing said',
  );
  check(
    'a column that compiles has NOTHING said about it',
    forCol('probeFine').length === 0,
    'probeFine',
  );

  console.log('');
  if (failures.length > 0) {
    console.log(`  ${failures.length} FAILURES:`);
    for (const f of failures) console.log(`    - ${f}`);
    process.exitCode = 1;
  } else {
    console.log('  an author is told why a calculated column came back blank\n');
  }
} finally {
  await browser.close();
}
