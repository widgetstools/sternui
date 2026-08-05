/**
 * The calculated-column evaluator against the CSRM twin, row by row.
 *
 * This is session 4's pass condition, and it is a DIFFERENTIAL rather than a
 * check that the numbers look plausible. The control is not a reimplementation:
 * it is `@starui/engine`'s own `ExpressionEngine`, evaluating the same parsed
 * AST over plain row objects, called exactly the way `buildVirtualColDef`'s
 * `valueGetter` calls it — the code path the client-side row model actually
 * runs. That control has already caught several "Perspective bugs" on this
 * project that turned out to be present identically on CSRM.
 *
 * Everything real about the inputs is imported rather than restated:
 *
 *   - the book is the lab's Stress book (`stressBookChunks`, 20,000 x 121);
 *   - the expressions are the lab's seeded curriculum
 *     (`seeds/calculatedColumns.ts`) — authored strings, parsed with the real
 *     `tokenize` / `parse`, not ASTs hand-built to suit the evaluator.
 *
 *   node node_modules/tsx/dist/cli.mjs \
 *     packages/react-grid/ssrm-engine/scripts/calcTwinProbe.mjs
 *
 * ## Why it injects a bad tick before comparing
 *
 * The generated stress book has no nulls, no NaN and no zeros — every numeric
 * cell is `((r * 7 + n * 13) % 100000) / 100`. A probe run over it as generated
 * would compare 20,000 rows of ordinary arithmetic and could not fail on any of
 * the rules that actually differ between an engine and its twin: null in a
 * comparison, divide by zero, NaN. So a deterministic bad tick is applied
 * first, and the probe REFUSES TO REPORT unless those rows were among the ones
 * compared. A probe that cannot report a failure is not one — three of session
 * 3's findings were caught by that rule and none would have shown on screen.
 */
import { createSsrmEngine } from '../src/index.ts';
import { stressBookChunks, stressBookSchema } from '../../../../apps/demos/perspective-ssrm-lab/src/data/stressBook.ts';
import { CALCULATED_TAB_VIRTUAL, TRAFFIC_LIGHT_VIRTUAL } from '../../../../apps/demos/perspective-ssrm-lab/src/seeds/calculatedColumns.ts';
import { ExpressionEngine } from '../../../shared/engine/src/expression/index.ts';

const ROWS = 20_000;
/** Every 97th row gets a bad cell — deterministic, and spread across blocks. */
const POISON_EVERY = 97;

const schema = stressBookSchema();
const engine = createSsrmEngine({ schema, onCalcWarning: () => {} });
// Chunked, and `applyUpdate` per chunk rather than `applySnapshot`: a snapshot
// means "the book is exactly these rows", so applying it per chunk would leave
// the book holding only the last one.
for (const chunk of stressBookChunks(ROWS)) engine.applyUpdate(chunk);

/**
 * The bad tick: nulls, NaN and exact zeros, in the fields the seeded
 * expressions actually read.
 *
 * `modifiedDuration` and `marketValue` are the two the curriculum guards with
 * `IF(... > 0, ...)`, so zeroing them exercises both sides of that branch;
 * `midPrice` drives the traffic light's `IFS` chain; a NaN price is the value
 * session 3 established the engine keeps rather than folding into null.
 */
const poison = [];
for (let r = 0; r < ROWS; r += POISON_EVERY) {
  const mode = (r / POISON_EVERY) % 4;
  poison.push({
    id: `POS-${r}`,
    ...(mode === 0 ? { modifiedDuration: 0, marketValue: 0 } : {}),
    ...(mode === 1 ? { dailyPnL: null, yieldToMaturity: null, midPrice: null } : {}),
    ...(mode === 2 ? { midPrice: Number.NaN, bidPrice: Number.NaN, avgDailyVolume30d: 0 } : {}),
    ...(mode === 3 ? { benchmarkYield: null, cs01: null, quantityFace: 0 } : {}),
  });
}
engine.applyUpdate(poison);
const poisonedIds = new Set(poison.map((row) => row.id));

const SEEDED = [...CALCULATED_TAB_VIRTUAL, TRAFFIC_LIGHT_VIRTUAL].map((seed) => ({
  colId: seed.colId,
  expression: seed.expression,
  group: 'seeded',
}));

/**
 * Expressions the curriculum does NOT contain, and the measurement that proved
 * they were needed.
 *
 * The first version of this probe ran the seeded curriculum alone, reported
 * 200,000 identical cells, and was then MUTATION-TESTED by putting deliberate
 * bugs into the evaluator. Two survived: making `x / 0` answer `Infinity`
 * instead of `null`, and making NaN falsy. Both are core rules and both were
 * invisible — because no seeded expression observes either.
 *
 *   - every division in the curriculum is by a literal (`/ 100`, `/ 1000000`)
 *     or sits inside an `IF(... > 0, ...)` guard whose result is discarded on
 *     exactly the rows where the divisor is zero;
 *   - every condition in the curriculum is already a comparison, so a NaN
 *     never reaches a truthiness test.
 *
 * So the curriculum agreeing proves the curriculum agrees, and nothing about
 * the rules underneath it. These are authored here to reach them — ordinary
 * expressions a user could type, parsed by the same `tokenize` / `parse`, run
 * against the same twin. They are reported as a separate group so nobody reads
 * them as part of the lab's seeded set.
 */
const ADVERSARIAL = [
  // Divide by zero (mode 0 rows) and by null (mode 3), unguarded.
  ['adv_divide', '[dailyPnL] / [modifiedDuration]'],
  ['adv_divideNull', '[cs01] / [benchmarkYield]'],
  // The recorded incident, both directions. `null > 95` is false; `null > -1`
  // is TRUE, which is the half that surprises people.
  ['adv_gt95', '[midPrice] > 95'],
  ['adv_gtMinus1', '[midPrice] > -1'],
  ['adv_eqZero', '[midPrice] == 0'],
  ['adv_between', '[midPrice] >= [bidPrice] AND [dailyPnL] > 0'],
  // IF uses JavaScript truthiness and IFS uses the engine's — so these two
  // MUST disagree on the NaN rows, and the probe asserts that they do.
  ['adv_ifTruthy', 'IF([midPrice], "t", "f")'],
  ['adv_ifsTruthy', 'IFS([midPrice], "t", "f")'],
  // A string and a number in one expression, with null and NaN on the numeric
  // side.
  ['adv_concat', '[desk] + [midPrice]'],
  ['adv_len', 'LEN([book] + [quantityFace])'],
  // A column the book does not have — null on both surfaces, and the engine
  // additionally names it.
  ['adv_missing', '[noSuchColumn] + [dailyPnL]'],
  // NaN propagation, and a NaN produced by the expression itself.
  ['adv_nanTimes', '[midPrice] * 2'],
  ['adv_negate', '-[midPrice]'],
  ['adv_sqrt', 'SQRT([dailyPnL] - 100)'],
  ['adv_mod', '[midPrice] % 3'],
  ['adv_isnull', 'ISNULL([midPrice], -1)'],
].map(([colId, expression]) => ({ colId, expression, group: 'adversarial' }));

const ALL = [...SEEDED, ...ADVERSARIAL];

/** The twin: `@starui/engine`, called the way the grid's valueGetter calls it. */
const twinEngine = new ExpressionEngine();

/**
 * `buildVirtualColDef`'s getter, reduced to what a leaf row does.
 *
 * The try/catch is not defensive dressing — it is the twin's actual behaviour,
 * and reproducing it is the difference between measuring the grid and measuring
 * an idealised version of it. A parse failure there yields a null AST and every
 * row reads null; a runtime failure is swallowed to null per row. Neither says
 * anything on screen, which is how `LOG10` has been rendering blank.
 */
function twinValue(ast, row) {
  if (ast === null) return null;
  try {
    return twinEngine.evaluate(ast, { x: null, value: null, data: row, columns: row });
  } catch {
    return null;
  }
}

/**
 * Non-finite numbers go through `String`, not `JSON.stringify`.
 *
 * `JSON.stringify(Infinity)` and `JSON.stringify(NaN)` both answer the STRING
 * `"null"`, and `JSON.stringify(-0)` answers `"0"` — so the first version of
 * this reporter printed a genuine divide-by-zero disagreement as
 * `engine null vs twin null`, which reads as a bug in the probe. A diagnostic
 * that misdescribes the failure it just caught is worse than none.
 */
function show(value) {
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return 'NaN';
    if (!Number.isFinite(value)) return String(value);
    if (Object.is(value, -0)) return '-0';
    return String(value);
  }
  if (value === undefined) return 'undefined';
  return JSON.stringify(value) ?? String(value);
}

// ── compile both sides ──────────────────────────────────────────────────────
const cases = [];
for (const seed of ALL) {
  let ast = null;
  let parseError = null;
  try {
    ast = twinEngine.parse(seed.expression);
  } catch (error) {
    parseError = error instanceof Error ? error.message : String(error);
  }
  cases.push({ ...seed, ast, parseError });
}

const installable = cases.filter((c) => c.ast !== null);
engine.setCalcColumns(installable.map((c) => ({ colId: c.colId, ast: c.ast })));
const diagnostics = engine.calcDiagnostics();
for (const entry of cases) {
  entry.refusal =
    diagnostics.find((d) => d.colId === entry.colId && d.phase === 'compile')?.message ?? null;
  entry.compared = 0;
  entry.mismatches = 0;
  entry.distinctValues = new Set();
  entry.poisonRowsSeen = 0;
  entry.firstMismatch = null;
  entry.twinNonNull = 0;
}

// ── read the whole book through getRows and compare every cell ─────────────
const BLOCK = 2_000;
let rowsCompared = 0;
/**
 * Rows where `IF` and `IFS` disagree — which they MUST, on the NaN rows.
 *
 * A count of zero means the NaN never reached a truthiness test, which is
 * exactly the hole that let a "NaN is falsy" mutation survive the first
 * version of this probe. It is a refusal-to-report condition, not a statistic.
 */
let truthinessSplits = 0;
for (let start = 0; start < ROWS; start += BLOCK) {
  const { rowData } = engine.getRows({ startRow: start, endRow: start + BLOCK });
  for (const row of rowData) {
    rowsCompared += 1;
    const poisoned = poisonedIds.has(row.id);
    if (row.adv_ifTruthy !== row.adv_ifsTruthy) truthinessSplits += 1;
    for (const entry of cases) {
      const want = twinValue(entry.ast, row);
      if (want !== null && want !== undefined) entry.twinNonNull += 1;
      if (entry.refusal !== null || entry.parseError !== null) continue;
      const got = row[entry.colId];
      entry.compared += 1;
      if (poisoned) entry.poisonRowsSeen += 1;
      if (entry.distinctValues.size < 8) entry.distinctValues.add(show(got));
      if (!Object.is(got, want) && !(Array.isArray(got) && JSON.stringify(got) === JSON.stringify(want))) {
        entry.mismatches += 1;
        entry.firstMismatch ??= `${row.id}: engine ${show(got)} vs twin ${show(want)}`;
      }
    }
  }
}

// ── the refusals to report ─────────────────────────────────────────────────
const refusalsToReport = [];
if (rowsCompared !== ROWS) {
  refusalsToReport.push(`read ${rowsCompared} rows of ${ROWS} — the comparison is not over the book`);
}
if (truthinessSplits === 0) {
  refusalsToReport.push(
    'IF and IFS agreed on every row — no NaN reached a truthiness test, so the rule that ' +
      'distinguishes them was not exercised',
  );
}
for (const group of ['seeded', 'adversarial']) {
  if (!cases.some((c) => c.group === group && c.compared > 0)) {
    refusalsToReport.push(`the ${group} group compared nothing`);
  }
}
for (const entry of cases) {
  if (entry.refusal !== null || entry.parseError !== null) continue;
  if (entry.compared === 0) refusalsToReport.push(`${entry.colId}: compared 0 rows`);
  if (entry.poisonRowsSeen === 0) {
    refusalsToReport.push(`${entry.colId}: none of the null/NaN/zero rows were compared`);
  }
  if (entry.distinctValues.size <= 1) {
    refusalsToReport.push(
      `${entry.colId}: every row read ${[...entry.distinctValues][0]} — a constant column ` +
        `agrees with anything and proves nothing`,
    );
  }
}

// ── report ─────────────────────────────────────────────────────────────────
const pad = (s, n) => String(s).padEnd(n);
console.log(
  `\n  book ${ROWS} x ${schema.fields.length}, poisoned rows ${poison.length}, ` +
    `IF/IFS truthiness splits ${truthinessSplits}\n`,
);
console.log(`  ${pad('column', 22)}${pad('rows', 8)}${pad('mismatches', 12)}verdict`);

let disagreements = 0;
let capabilityGaps = 0;
let lastGroup = null;
for (const entry of cases) {
  if (entry.group !== lastGroup) {
    lastGroup = entry.group;
    console.log(`  ${'-'.repeat(72)}\n  ${lastGroup}`);
  }
  let verdict;
  if (entry.parseError !== null) {
    verdict = `BOTH FAIL TO PARSE — ${entry.parseError}`;
  } else if (entry.refusal !== null) {
    // A refusal is only a GAP if the twin could produce values. Where the twin
    // is null for every row too, neither surface has this column — the
    // difference is that this engine says why and the twin says nothing.
    if (entry.twinNonNull > 0) {
      capabilityGaps += 1;
      verdict = `GAP — refused here, twin produced ${entry.twinNonNull} values: ${entry.refusal}`;
    } else {
      verdict = `neither — refused here; twin also null on all ${ROWS} rows`;
    }
  } else if (entry.mismatches > 0) {
    disagreements += 1;
    verdict = `DISAGREE — first at ${entry.firstMismatch}`;
  } else {
    verdict = 'identical';
  }
  console.log(`  ${pad(entry.colId, 22)}${pad(entry.compared, 8)}${pad(entry.mismatches, 12)}${verdict}`);
}

console.log('');
if (refusalsToReport.length > 0) {
  console.log('  REFUSING TO REPORT — the comparison could not have failed:');
  for (const reason of refusalsToReport) console.log(`    - ${reason}`);
  process.exitCode = 1;
} else if (disagreements > 0 || capabilityGaps > 0) {
  console.log(`  ${disagreements} disagreement(s), ${capabilityGaps} capability gap(s).`);
  process.exitCode = 1;
} else {
  const total = cases.reduce((sum, c) => sum + c.compared, 0);
  console.log(`  ${total.toLocaleString()} calculated cells, every one identical to the CSRM twin.`);
}
console.log('');
