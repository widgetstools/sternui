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
  /** The twin's value per row id, for the sort/filter/group parity below. */
  entry.twinByRow = new Map();
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
      entry.twinByRow.set(row.id, want);
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

// ═══ session 5: does a calculated column SORT, FILTER and GROUP like the twin?
//
// The values above are a differential against `@starui/engine`'s own evaluator.
// These are a differential against what a grid holding those values would DO
// with them: the control is the twin's value for each row, and the question is
// whether the engine's ordering, its filtered set and its buckets are the ones
// those values imply.
//
// **Where AG's own comparator is the authority and where it is not**, stated
// rather than blurred. For two PRESENT values the rule is AG Grid's
// `_defaultComparator` (`ag-stack`), reproduced here from its source — greater
// is 1, less is -1, and a pair where neither holds is 0. For an ABSENT value it
// is NOT: AG's comparator answers -1 for a null, and the grid then multiplies
// by the direction, so on the client-side row model **nulls sort FIRST
// ascending and last descending**. This engine puts null and NaN last in BOTH
// directions — session 3 settled that after a NaN price sorted above the best
// bid — so the two genuinely differ on absent rows, deliberately, and the
// present rows are where the differential has force. The divergence is asserted
// below rather than hidden inside a comparator that quietly agrees with itself.
const ORIGINAL_ORDER = new Map();
{
  let n = 0;
  for (let start = 0; start < ROWS; start += BLOCK) {
    for (const row of engine.getRows({ startRow: start, endRow: start + BLOCK }).rowData) {
      ORIGINAL_ORDER.set(row.id, n++);
    }
  }
}

/** AG Grid's `_defaultComparator`, for two values that are both present. */
function agCompare(x, y) {
  if (x > y) return 1;
  if (x < y) return -1;
  return 0;
}

/** Null, undefined and NaN alike: no position on the number line. */
function absent(value) {
  return value === null || value === undefined || (typeof value === 'number' && Number.isNaN(value));
}

const parity = [];
const record = (colId, check, ok, detail) => parity.push({ colId, check, ok, detail });

/** Columns whose ORDER, filtered set and buckets are put to the twin. */
const UNDER_TEST = ['calc_carryRisk', 'calc_pnlTotal', 'adv_nanTimes', 'calc_riskBucket', 'trafficlight'];

/**
 * How many columns actually reached each rule, so the run can refuse when one
 * was never exercised at all.
 *
 * Scoped to the WHOLE run rather than to each column, and the first draft got
 * that wrong: it demanded absent rows of every column under test and then
 * refused to report because `calc_pnlTotal` has none — correctly, since
 * `[a]+[b]+[c]` over nulls is a number in JavaScript, and `calc_riskBucket`'s
 * IF chain always returns a string. A rule has to be exercised somewhere;
 * insisting every column exercise every rule fails on the arithmetic rather
 * than on the engine.
 */
const exercised = { absent: 0, filter: 0, group: 0 };

for (const colId of UNDER_TEST) {
  const entry = cases.find((c) => c.colId === colId);
  if (entry === undefined || entry.refusal !== null || entry.parseError !== null) {
    record(colId, 'sort/filter/group', false, 'not installed — nothing was compared');
    continue;
  }
  const twin = entry.twinByRow;
  const ids = [...twin.keys()];
  const present = ids.filter((id) => !absent(twin.get(id)));
  const missing = ids.filter((id) => absent(twin.get(id)));

  // ── SORT ────────────────────────────────────────────────────────────────
  for (const dir of ['asc', 'desc']) {
    const sign = dir === 'desc' ? -1 : 1;
    const expected = [
      ...present.slice().sort((a, b) => {
        const cmp = agCompare(twin.get(a), twin.get(b)) * sign;
        return cmp !== 0 ? cmp : ORIGINAL_ORDER.get(a) - ORIGINAL_ORDER.get(b);
      }),
      // Absent rows all tie on the sort column, so the engine's offset
      // tie-break leaves them in the book's own order.
      ...missing.slice().sort((a, b) => ORIGINAL_ORDER.get(a) - ORIGINAL_ORDER.get(b)),
    ];
    const got = engine
      .getRows({ sortModel: [{ colId, sort: dir }], startRow: 0, endRow: ROWS })
      .rowData.map((r) => r.id);
    let firstDiff = -1;
    for (let i = 0; i < expected.length; i++) {
      if (got[i] !== expected[i]) {
        firstDiff = i;
        break;
      }
    }
    record(
      colId,
      `sort ${dir}`,
      firstDiff === -1,
      firstDiff === -1
        ? `${present.length.toLocaleString()} ordered, ${missing.length} absent last`
        : `row ${firstDiff}: engine ${got[firstDiff]} (${show(twin.get(got[firstDiff]))}), ` +
          `twin order says ${expected[firstDiff]} (${show(twin.get(expected[firstDiff]))})`,
    );
    // The absent rows must be at the END whichever way the arrow points, and
    // this is the half where the engine and AG deliberately differ.
    if (missing.length > 0) {
      exercised.absent += 1;
      const tail = new Set(got.slice(ROWS - missing.length));
      record(
        colId,
        `absent last, ${dir}`,
        missing.every((id) => tail.has(id)),
        `${missing.length} null/NaN rows, all last (AG's own comparator would put them FIRST on asc)`,
      );
    }
  }

  // ── FILTER ──────────────────────────────────────────────────────────────
  const numeric = present.filter((id) => typeof twin.get(id) === 'number');
  if (numeric.length > 0) {
    const sorted = numeric.map((id) => twin.get(id)).sort((a, b) => a - b);
    const threshold = sorted[Math.floor(sorted.length / 2)];
    const expected = new Set(numeric.filter((id) => twin.get(id) > threshold));
    const got = new Set(
      engine
        .getRows({
          filterModel: { [colId]: { filterType: 'number', type: 'greaterThan', filter: threshold } },
          startRow: 0,
          endRow: ROWS,
        })
        .rowData.map((r) => r.id),
    );
    const only = [...got].filter((id) => !expected.has(id));
    const missed = [...expected].filter((id) => !got.has(id));
    if (expected.size > 0 && expected.size < ROWS) exercised.filter += 1;
    record(
      colId,
      `filter > ${threshold}`,
      only.length === 0 && missed.length === 0 && expected.size > 0 && expected.size < ROWS,
      expected.size === 0 || expected.size === ROWS
        ? `the threshold kept ${expected.size} of ${ROWS} — not a strict subset, so it proves nothing`
        : `${expected.size.toLocaleString()} rows${only.length + missed.length === 0 ? '' : `, ${only.length} extra / ${missed.length} missing (e.g. ${only[0] ?? missed[0]})`}`,
    );
  }

  // ── GROUP ───────────────────────────────────────────────────────────────
  const buckets = new Map();
  for (const id of ids) {
    const value = twin.get(id);
    const key = value === null || value === undefined ? ' null' : String(value);
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  if (buckets.size > 1 && buckets.size <= 64) {
    const level = engine.getRows({ rowGroupCols: [{ id: colId }], groupKeys: [] });
    const got = new Map(
      level.rowData.map((r) => [
        r[colId] === null || r[colId] === undefined ? ' null' : String(r[colId]),
        r.__ssrmChildCount,
      ]),
    );
    const wrong = [...buckets.entries()].filter(([key, count]) => got.get(key) !== count);
    exercised.group += 1;
    record(
      colId,
      'group',
      wrong.length === 0 && got.size === buckets.size,
      wrong.length === 0 && got.size === buckets.size
        ? `${buckets.size} buckets, every child count identical`
        : `${wrong.length} bucket(s) differ, e.g. ${wrong[0]?.[0]} wants ${wrong[0]?.[1]} and got ${got.get(wrong[0]?.[0])}`,
    );
  }
}

// ── the refusals to report ─────────────────────────────────────────────────
const refusalsToReport = [];
for (const entry of parity) {
  if (!entry.ok) refusalsToReport.push(`${entry.colId} ${entry.check}: ${entry.detail}`);
}
if (parity.length === 0) refusalsToReport.push('no sort/filter/group parity was checked at all');
// Each of the three rules has to have been reached by SOMETHING, or its green
// line above is a rule nobody ran.
if (exercised.absent === 0) {
  refusalsToReport.push('no column under test had a null or NaN — the absent-last rule was never exercised');
}
if (exercised.filter === 0) {
  refusalsToReport.push('no filter cut the book to a strict subset — the filter path proved nothing');
}
if (exercised.group === 0) {
  refusalsToReport.push('no column under test grouped into buckets — the group path proved nothing');
}
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

console.log(`\n  ${'-'.repeat(72)}\n  sort / filter / group, against the same twin values`);
for (const entry of parity) {
  console.log(`  ${pad(entry.colId, 22)}${pad(entry.check, 20)}${entry.ok ? 'ok' : 'FAILED'} — ${entry.detail}`);
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
