# Nested-field bugs — worklog

Per-session debugging worklog for three correctness/presentation bugs surfaced
by the v2-nested-* e2e suite (added in commit `e02107d`). Plus a stub for a
follow-up deep-dive into the formatting engine, expression engine, and
expression-editor responsiveness.

**How to use this worklog.** Each session opens this file, picks the first
section whose **Status** is `pending`, root-causes, fixes, runs the test
gauntlet, then updates the section to `fixed → <commit>` (or `wontfix →
explanation`) and commits the worklog along with the fix. One bug per
session — keeps the context window tight and lets each fix land as an
atomic commit.

**Branch:** `main-updatepackages`. **Latest baseline commit:** `e02107d`.

**Reproduction prerequisites (every session):**
1. `npm ci --legacy-peer-deps` (the flag is permanent — see `CLAUDE.md`).
2. `npm run dev -w @marketsui/demo-react` → http://localhost:5190/.
3. Each fixture lives at `?view=fixture&f=<name>` where `<name>` is one of
   `formatter`, `cond-cell`, `cond-row`, `calc`, `groups`, `kitchen-sink`.
4. Test gauntlet: `npx turbo typecheck build test` then
   `npx playwright test e2e/v2-nested-*.spec.ts --reporter=line`.

**Files added by `e02107d` (the test fixtures themselves):**
- [`apps/demo-react/src/nestedData.ts`](../apps/demo-react/src/nestedData.ts) — `NestedOrder` type, deterministic generator, six edge-case rows (`EDGE-NULL-PRICING`, `EDGE-MISS-PRICING`, `EDGE-PARTIAL`, `EDGE-INVERTED`, `EDGE-ZERO-ASK`, `EDGE-NULL-RATINGS`).
- [`apps/demo-react/src/nestedFixtures.ts`](../apps/demo-react/src/nestedFixtures.ts) — pre-built profile per fixture.
- [`apps/demo-react/src/Fixture.tsx`](../apps/demo-react/src/Fixture.tsx) — fixture mount component (seeds under `__default__` to dodge the active-pointer race with MarketsGrid's auto-default-seed).
- [`e2e/helpers/nestedFixtures.ts`](../e2e/helpers/nestedFixtures.ts) — multi-container DOM probes + `readAllColumnIds` (fiber walk → GridApi to bypass column virtualisation).
- `e2e/v2-nested-*.spec.ts` (5 specs).

---

## Bug 3 — SUM aggregate over nested fields returns per-row value (do this first)

**Status:** fixed → commit `4055ff1` (parser dotted-columnRef lookahead). All 24/24 nested-fields Playwright tests green, including the restored strict `0 < pct < 100` assertion.

### Root cause

The expression parser's `[IDENTIFIER]`-as-columnRef disambiguation was
hardcoded to a 3-token lookahead (LBRACKET + IDENTIFIER + RBRACKET).
For `[risk.dv01]` the token stream is LBRACKET, IDENTIFIER(`risk`),
DOT, IDENTIFIER(`dv01`), RBRACKET — five tokens — so the lookahead
missed and the input fell through to the **array-literal** branch,
parsing `[risk.dv01]` as `array([member(risk, dv01)])` instead of
`columnRef('risk.dv01')`.

Downstream consequences in
`[risk.dv01] / SUM([risk.dv01]) * 100`:

- The **numerator** `[risk.dv01]` evaluated to a 1-element array
  containing the per-row dv01 scalar. JS coerced the array to its
  numeric value during `/`, so `(arr) / number` worked accidentally.
- The **SUM** argument was an `array` AST node, not a `columnRef`,
  so the aggregate branch in `evaluateCall`
  ([evaluator.ts:165](../packages/core/src/expression/evaluator.ts#L165))
  never triggered (the branch only inspects `columnRef` children).
  SUM received `args = [[currentRowDv01]]`, sum = currentRowDv01.
- Result: scalar / scalar × 100 = exactly 100.00% on every row.

This same parse defect explains Bug 2 (`[ratings.sp] == 'AAA'`):
strict equality compares an array `[scalar]` against the string
`'AAA'`, never true.

### Fix

[`packages/core/src/expression/parser.ts`](../packages/core/src/expression/parser.ts)
— extended the columnRef lookahead to scan
`IDENTIFIER (DOT IDENTIFIER)* RBRACKET`, joining the identifiers with
`.` to form the columnId. Anything else (`[1, 2]`, `[x > 0]`,
`IN [...]` RHS) still falls through to array-literal parsing. The
`getValueByPath` resolver in the evaluator already handles both
literal-flat-key (`row['risk.dv01']`) and dot-walk (`row.risk.dv01`)
access shapes, so no evaluator change was needed.

### Verification

Strict assertion restored in
[`e2e/v2-nested-calculated-columns.spec.ts:44`](../e2e/v2-nested-calculated-columns.spec.ts#L44)
— `pct > 0 && pct < 100`. Existing flat showcase calc cols
(`[notional] / SUM([notional])`) keep their 3-token fast path
unchanged.

---

### Original analysis (preserved for context)


**Severity:** high — silent correctness bug. Calculated columns using SUM/AVG/MIN/MAX/etc. over a nested field produce **wrong** values without any visible error. Anyone using nested-field aggregates in production today is getting bad numbers.

### Symptom

Calculated column with expression `[risk.dv01] / SUM([risk.dv01]) * 100` and Excel format `0.00"%"` renders **exactly `100.00%` on every row**. The same expression shape over a flat field (e.g. `[notional] / SUM([notional]) * 100` in the showcase profile) works correctly.

That output means `SUM([risk.dv01])` is returning the per-row scalar (the same value as `[risk.dv01]`), not the column-wide sum. Per-row dv01 ÷ per-row dv01 × 100 = 100.

### Reproduction

1. Boot dev server.
2. Visit `http://localhost:5190/?view=fixture&f=calc`.
3. Scroll the grid horizontally to the right (the calc cols sit past the viewport edge).
4. Observe `DV01 % of Book` column — every cell reads `100.00%`.
5. Compare against the showcase grid (`http://localhost:5190/`) where `% of Book` (calc col `[notional] / SUM([notional]) * 100`) renders correct fractional percentages.

The relaxed assertion lives in [`e2e/v2-nested-calculated-columns.spec.ts:44`](../e2e/v2-nested-calculated-columns.spec.ts#L44) (the `cross-row aggregate (SUM) over nested DV01 renders a percentage cell` test) — currently asserts only "renders a percentage", not the strict "totals to ~100".

### Where to look

- [`packages/core/src/expression/evaluator.ts:151-175`](../packages/core/src/expression/evaluator.ts#L151) — `evaluateCall`. The aggregate branch is:
  ```ts
  fn.aggregateColumnRefs && ctx.allRows
    ? argNodes.map((arg) => {
        if (arg.type === 'columnRef') {
          return ctx.allRows!.map((row) => getValueByPath(row, arg.columnId) ?? null);
        }
        return this.evaluate(arg, ctx);
      })
    : argNodes.map((arg) => this.evaluate(arg, ctx));
  ```
- [`packages/core/src/expression/functions.ts:91`](../packages/core/src/expression/functions.ts#L91) — SUM evaluate is `args.flat().map(toNum).reduce((a, b) => a + b, 0)`. Should be a no-op assumption: if `args = [arrayOfDv01s]`, `args.flat()` is the array, sum is correct. So if SUM is wrong, the args array is wrong.
- [`packages/core/src/modules/calculated-columns/virtualColumn.ts:35-56`](../packages/core/src/modules/calculated-columns/virtualColumn.ts#L35) — `getAllRowsSnapshot`. Cache (WeakMap keyed by GridApi). On first call (or when `entry.rows.length === 0`) it calls `api.forEachNode(node => rows.push(node.data))`. Caches the array.
- [`packages/core/src/modules/calculated-columns/virtualColumn.ts:113-127`](../packages/core/src/modules/calculated-columns/virtualColumn.ts#L113) — `valueGetter` passes `allRows` as a getter:
  ```ts
  get allRows() { return getAllRowsSnapshot(params.api as GridApi, cache); }
  ```
- [`packages/shared-types/src/dataProvider.ts:529-542`](../packages/shared-types/src/dataProvider.ts#L529) — `getValueByPath`. Literal flat key first, then dot-walk.

### Hypotheses (in order of likelihood)

1. **`ctx.allRows` is empty/undefined when the aggregate path is checked.** The `&&` short-circuits when allRows is falsy. But `[]` is truthy in JS, so empty array still enters the aggregate branch — and `[].map(...)` is `[]`, `[].flat()` is `[]`, SUM of `[]` is `0`. That would give `dv01 / 0 → null → empty cell`, not `100%`. So it's NOT this.
2. **The aggregate branch is NOT taken** (so the FALSE branch runs). FALSE branch evaluates each arg per the per-row evaluator, which for `[risk.dv01]` returns the per-row scalar. SUM([single scalar]) flattens to [scalar], sums to scalar. Numerator = scalar, denominator = scalar, ratio = 1, ×100 = 100%. ← **This matches the observed output exactly.**
3. **For `ctx.allRows` to be falsy, `fn.aggregateColumnRefs && ctx.allRows` must short-circuit on the second term.** The getter call returns `[]` (empty array → truthy). UNLESS the getter is throwing OR returning `undefined` somehow. Check: does `api.forEachNode` throw on the fixture's grid state? Or does `node.data` lack the row? Or is `params.api` undefined inside the calc valueGetter?
4. **There may be ONE working flat case where this branch IS taken** (showcase calc cols work), so compare what's different. The showcase is on gridId `demo-blotter-v2`; the fixture is `fixture-calc`. Do they go through different `params.api` paths? Different cache entries?

### Recommended diagnostic steps

1. Add `console.log` inside the aggregate branch and inside `getAllRowsSnapshot` showing: rows.length, first row keys, whether the api is non-null, the timing of first call.
2. Visit `?view=fixture&f=calc` in a browser, open devtools, observe the logs.
3. Compare against the showcase grid loading.
4. Hypothesis to confirm: is `ctx.allRows` actually undefined (not `[]`)? If so, why — getter throws? `params.api` undefined when valueGetter is invoked very early?
5. Once root cause is known: fix, then tighten the relaxed test in `e2e/v2-nested-calculated-columns.spec.ts:44` to assert `pct < 100` and the cross-row total ≤ 100 + ε.

### Definition of done

- Root cause documented in this section.
- Fix landed on `main-updatepackages`.
- Strict assertion restored in the spec file (replace the relaxed test).
- `npx playwright test e2e/v2-nested-calculated-columns.spec.ts` green with strict assertions.
- Existing showcase calc cols still work.

---

## Bug 1 — Excel format arrow glyph not rendering on nested-field cells

**Status:** fixed → SSF format-string sanitizer in `excelFormatter`. All 51/51 nested-fields Playwright tests green, including the strict `^[▲▼—]\s\d` arrow assertion on the happy path and `^▲\s99\.50$` on the partial-pricing edge row.

### Root cause

Not a nested-field issue at all — the worklog premise was wrong. The SSF
(SheetJS format) library used by `excelFormatter` rejects any character
outside its hard-coded allow-list with `unrecognized character X in
<fmt>`. The format string `[Green]▲ #,##0.00;[Red]▼ #,##0.00;[Blue]— 0.00`
contains three rejected glyphs (`▲`, `▼`, `—`), so SSF threw on every
section. The per-cell render path's `try { SSF.format(...) } catch {
return String(value); }` swallowed the error and rendered the raw
number. This affected BOTH the showcase grid and the nested-field
fixtures — flat-cell rendering was just as broken; nobody had asserted
on the arrow glyph there either, so the regression went unnoticed.

Excel's spec requires literal characters to be quoted (`"▲ "#,##0.00`),
but format strings authored by hand or pasted from Excel UI commonly
omit the quotes — Excel's own renderer is forgiving where SSF isn't.

### Fix

[`packages/core/src/colDef/adapters/excelFormatter.ts`](../packages/core/src/colDef/adapters/excelFormatter.ts)
— added `sanitizeFormatForSSF`: a try-and-quote loop that probes the
format with positive / negative / zero / text values (so each section
gets walked) and, when SSF reports `unrecognized character X`, wraps
every top-level (outside `"..."` and `[...]`) occurrence of `X` in
quotes, then retries. Bracket / quoted-string content is left alone, so
`[Green]` color tags and `"existing literals"` survive intact. The
sanitized format is used for both the validation probe and per-cell
`SSF.format` calls; date-code detection runs against the sanitized
string too.

`buildColorResolver` operates on the sanitized format — bracket
extraction is unaffected by the inserted quotes (they only appear
between brackets in pathological inputs the sanitizer doesn't touch),
so the color tags still resolve.

### Verification

Strict assertions restored in
[`e2e/v2-nested-formatter.spec.ts`](../e2e/v2-nested-formatter.spec.ts)
— happy path now requires `^[▲▼—]\s\d`, partial-pricing edge row now
requires `^▲\s99\.50$`. Full nested-fields gauntlet (51 tests) green.
`npx turbo typecheck build test` green (71/71 tasks).

---

### Original analysis (preserved for context)

**Severity:** medium — presentation bug. Format applies cleanly on flat cells; just the leading literal text (the `▲ ` glyph + space) doesn't render on nested-field cells.

### Symptom

Excel format `[Green]▲ #,##0.00;[Red]▼ #,##0.00;[Blue]— 0.00` applied to `pricing.bid` via column-customization renders just `103.84` — the `▲ ` (or `▼ ` / `— `) prefix is missing. The same format on flat cells in the showcase profile renders the arrow correctly.

The encoded class `gc-col-c-pricing_2ebid` lands on the cell (column-customization identified the column), and the `cellStyleOverrides` (bold, alignment) DO apply. So the colDef is being merged. It's specifically the `valueFormatter` that's not running, or running but stripping the literal prefix.

### Reproduction

1. Visit `http://localhost:5190/?view=fixture&f=formatter`.
2. Observe the `Bid` / `Ask` / `Mid` columns — values like `103.84`, no arrow.
3. Compare against `http://localhost:5190/` (showcase) — `Price` column shows `▲ 100.50` (or `▼ ...` for negative).

The relaxed assertion lives in [`e2e/v2-nested-formatter.spec.ts`](../e2e/v2-nested-formatter.spec.ts) — the "happy-path nested numeric cell renders a non-empty value" test only asserts `\d/`, not the arrow.

### Where to look

- [`packages/core/src/modules/column-customization/transforms.ts:373-407`](../packages/core/src/modules/column-customization/transforms.ts#L373) — `valueFormatter` is set unconditionally when `valueFormatterTemplate !== undefined`. Lookup is by `colId ?? field` ([line 339](../packages/core/src/modules/column-customization/transforms.ts#L339)).
- [`packages/widgets-react/src/v2/markets-grid-container/MarketsGridContainer.tsx:262-284`](../packages/widgets-react/src/v2/markets-grid-container/MarketsGridContainer.tsx#L262) — injects a `valueGetter` for any column whose `field` contains a dot. **Important:** this only fires for columns coming from `activeCfg.columnDefinitions` (the data-plane path). The fixture passes columnDefs DIRECTLY via the `columnDefs` prop, so it does NOT go through this injection. AG-Grid handles the dot-walk itself for `field: 'pricing.bid'`.
- AG-Grid v35.1 — when `field: 'a.b'` and a `valueFormatter` is set, does AG-Grid call the formatter? Or does dot-walk-on-field bypass valueFormatter? Worth verifying directly: instrument the formatter with a `console.log`, see if it's called per cell for nested vs flat.

### Hypotheses

1. **AG-Grid v35.1 doesn't call `valueFormatter` for dot-walked field accesses.** Test by instrumenting the formatter or by switching the fixture column to `valueGetter` instead of `field`.
2. **The formatter IS called but the value passes through unchanged.** The `params.value` arriving in the formatter might be the wrong type (e.g. `undefined` if dot-walk failed, then SSF returns empty for the negative section).
3. **The leading literal `▲ ` survives in the output but gets stripped by some downstream cell renderer.** Unlikely — but check whether AG-Grid uses a `cellRenderer` that re-formats the value.

### Recommended diagnostic steps

1. Wrap the formatter in `valueFormatterFromTemplate` with a `console.log({colId, value, formatted})` and observe in browser devtools.
2. If the formatter IS called and produces `▲ 103.84`, the issue is downstream rendering.
3. If the formatter is NOT called, switch the fixture column from `field: 'pricing.bid'` to `valueGetter: (p) => getValueByPath(p.data, 'pricing.bid')` and see if the formatter then runs. That tells us whether AG-Grid's dot-walk path bypasses formatters.
4. If yes (it does bypass): either always inject a `valueGetter` for nested fields in `MarketsGrid` (mirroring the data-plane container path) OR drop `field` and rely on `valueGetter` everywhere in our wrappers.

### Definition of done

- Root cause documented.
- Fix landed (likely a `valueGetter` injection in MarketsGrid for nested fields, or pipeline-level normalisation).
- Strict assertion restored in `e2e/v2-nested-formatter.spec.ts` — the arrow glyph regex `^[▲▼—]\s\d+(\.\d{2})?$` should pass.

---

## Bug 2 — String-equality cellClassRule doesn't fire on nested-field cells

**Status:** fixed → commit `4055ff1` (parser fix, same as Bug 3) + commit `03390f5` (strict e2e assertion). All 24/24 nested-fields Playwright tests green, including the restored `cellHasClassMatching('EDGE-NULL-PRICING', 'ratings.sp', /^gc-rule-rule-rating-aaa$/)` assertion.

### Root cause

Same parser defect described under Bug 3. `[ratings.sp]` parsed as an
array literal `array([member(ratings, sp)])` instead of
`columnRef('ratings.sp')`. The evaluator's `==` operator uses strict
equality (`left === right`), and an array `[scalar]` is never strictly
equal to a string `'AAA'` — so the predicate returned `false` for
every cell, every render, and the class never landed.

Numeric rules like `[pricing.bid] > 100` and `[pricing.bid] >
[pricing.ask]` worked accidentally because JS coerces a 1-element
array to a number for relational operators (`[100.5] > 100` →
`"100.5" > 100` → `100.5 > 100` → `true`). Strict equality has no such
coercion, which is why string-equality rules failed and relational
rules silently kept passing.

### Fix

The parser fix landed for Bug 3 (extending the columnRef lookahead to
accept dotted paths) resolves this case as well. With `[ratings.sp]`
parsed as `columnRef('ratings.sp')`, the evaluator's columnRef branch
returns the per-row scalar via `getValueByPath`, and `scalar === 'AAA'`
matches correctly.

### Verification

Strict assertion restored in
[`e2e/v2-nested-conditional-styling.spec.ts`](../e2e/v2-nested-conditional-styling.spec.ts)
— `cellHasClassMatching('EDGE-NULL-PRICING', 'ratings.sp',
/^gc-rule-rule-rating-aaa$/)` returns `true`.

---

### Original analysis (preserved for context)


**Severity:** medium — cell rules with `==` comparisons don't apply for nested fields. Cell rules with `>`, `<`, etc. on nested fields work.

### Symptom

Rule `expression: "[ratings.sp] == 'AAA'"` with `scope: { type: 'cell', columns: ['ratings.sp'] }` does **not** add the `gc-rule-rule-rating-aaa` class to any cell, even though `EDGE-NULL-PRICING.ratings.sp === 'AAA'` (verified via DOM dump in commit `e02107d`'s diagnostic — see also fixture data in `apps/demo-react/src/nestedData.ts`).

The numeric rule `[pricing.bid] > 100` and the cross-reference rule `[pricing.bid] > [pricing.ask]` DO fire correctly on the same row. So nested-field rules generally work; specifically the string-equality variant doesn't.

### Reproduction

1. Visit `http://localhost:5190/?view=fixture&f=cond-cell`.
2. Inspect the `S&P` column for row `EDGE-NULL-PRICING` (top of grid). Value is `AAA`.
3. Cell does NOT carry the `gc-rule-rule-rating-aaa` class. The other rules' classes (`gc-rule-rule-bid-high`, `gc-rule-rule-bid-inverted`) appear elsewhere correctly.

The relaxed assertion is in [`e2e/v2-nested-conditional-styling.spec.ts`](../e2e/v2-nested-conditional-styling.spec.ts) (`string-equality rule on nested ratings.sp registers cellClassRules entry`). Currently asserts only that the rule's CSS landed in a `<style>` tag.

### Where to look

- [`packages/core/src/modules/conditional-styling/transforms.ts:171-202`](../packages/core/src/modules/conditional-styling/transforms.ts#L171) — `buildCellClassPredicate`. Tries `tryCompileToAgString(ast)` first; falls back to function form on UnsupportedError.
- [`packages/core/src/expression/compiler.ts:33-35`](../packages/core/src/expression/compiler.ts#L33) — `columnRef` always throws `UnsupportedError`. So for any expression with `[col]`, `tryCompileToAgString` returns `null` and the function form is used.
- [`packages/core/src/expression/evaluator.ts:19-29`](../packages/core/src/expression/evaluator.ts#L19) — `columnRef` case uses `getValueByPath(ctx.columns, ...)` then `getValueByPath(ctx.data, ...)`.
- [`packages/core/src/expression/evaluator.ts:135-141`](../packages/core/src/expression/evaluator.ts#L135) — `==` evaluates to `left === right` (strict equality).

### Hypotheses

1. **`tryCompileToAgString` succeeds for the AAA expression somehow** (returning a string AG-Grid then evaluates with literal-key access on `data['ratings.sp']`, which is undefined). Check by stepping through the compile path manually; the columnRef should throw, but maybe the `==` operator's compile path catches the error and emits a partially-compiled string? Worth checking [`packages/core/src/expression/compiler.ts`](../packages/core/src/expression/compiler.ts) holistically.
2. **AG-Grid caches the cellClassRules predicate result on first render.** If the first render happened before the profile state was applied, the predicate returned false (no rule active), and AG-Grid never re-ran it. But `bootFixture` calls `forceGridRedraw` which should re-evaluate. Unless AG-Grid's `redrawRows` doesn't re-run cellClassRules.
3. **Strict equality `===` against a string with a hidden whitespace difference.** Unlikely given the data is generator-emitted, but easy to verify by logging both sides of the comparison.
4. **The `valueGetter`-vs-`field` interaction interferes with cellClassRules** (similar to Bug 1). Maybe AG-Grid passes a different `params.value` to the predicate when value is dot-walked.

### Recommended diagnostic steps

1. Add a `console.log({colId, raw: getValueByPath(params.data, 'ratings.sp'), expected: 'AAA', match: <result>})` inside the function-mode predicate.
2. Visit `?view=fixture&f=cond-cell` and observe whether the predicate is even invoked for the ratings.sp cells.
3. If the predicate IS invoked but returns false: log both sides of the equality.
4. If the predicate is NOT invoked: the AG-Grid string-mode compile is succeeding incorrectly; investigate `tryCompileToAgString` for ColumnRef edge cases.

### Definition of done

- Root cause documented.
- Fix landed (likely either a compile-path correction OR a cellClassRules invalidation pattern).
- Strict assertion restored in `e2e/v2-nested-conditional-styling.spec.ts` — `cellHasClassMatching(page, 'EDGE-NULL-PRICING', 'ratings.sp', /^gc-rule-rule-rating-aaa$/)` should return `true`.

---

## Follow-up — formatting engine + expression engine + editor deep dive

**Status:** scoped (work begins after the three bugs above are fixed)

The user has reported additional issues that point to systemic problems in the editor/engine layer:

- **Expression editor in the calculated-columns panel is non-responsive** — clicks/typing don't reliably register or feel laggy.
- **Conditional-formatting editor** has the same non-responsiveness.
- **Suggestion box (autocomplete)** isn't appearing when expected (function names, column refs).

These are likely entangled with the bugs above — the engine that drives the editor's parser/suggestor is the same engine that drives runtime evaluation. Fixing Bugs 1-3 first gives us a known-good baseline before we touch the editor surface.

### Areas to audit (no fixes yet — just an audit pass)

1. **Expression editor mount lifecycle.**
   - [`packages/core/src/expression/`](../packages/core/src/expression/) — `index.ts` exposes `ExpressionEditorInner` chunked dynamically (~41kB cjs); Monaco initialisation may be racing with the mount.
   - The hosting panels: [`packages/core/src/modules/calculated-columns/CalculatedColumnsPanel.tsx`](../packages/core/src/modules/calculated-columns/CalculatedColumnsPanel.tsx) and [`packages/core/src/modules/conditional-styling/ConditionalStylingPanel.tsx`](../packages/core/src/modules/conditional-styling/ConditionalStylingPanel.tsx).
   - Check `useEffect` dependency arrays for stale closures driving the editor.
2. **LSP / suggestor wiring.**
   - The `lspLanguageFeatures-...cjs` chunk (~29 kB) implements completions. Verify it's actually being attached to the Monaco instance and not silently failing.
   - Ensure column-ref completions reflect the current grid's columns, not a stale snapshot.
3. **Engine performance.**
   - For large rule sets / many calc cols, is the engine recompiling the AST per render? Check whether `engine.parse` is memoised.
   - The aggregate snapshot cache (`getAllRowsSnapshot` keyed by GridApi) — does cache invalidation fire on data changes? If we're rebuilding the snapshot every cell render the cost compounds.
4. **Format engine (SSF).**
   - We rely on SheetJS `ssf` for excel formats. Is the same SSF instance shared across all cells? Are there bundle-size / perf concerns?
   - Check whether `excelFormatColorResolver` is being re-created per cell (it's constructed inside the transform but assigned to `cellStyle: (params) => ...`).
5. **Editor responsiveness specifically.**
   - Repro the user's report: open the cond-styling panel, add a rule, type in the expression editor. Note any input lag, dropped keystrokes, missing suggestion box.
   - Capture a Performance trace if the lag is reproducible — the worst case is usually a mass re-render triggered by an upstream state-mutation cascade.

### Deliverable for the deep-dive session

Not a set of fixes, but a triage doc: one short paragraph per finding with severity and suggested follow-up. Decide which findings become their own bug entries in this worklog.

---

## Session log

Append a one-liner each session so we can see at a glance what was done and when.

- **2026-05-02 (this session):** worklog created; three bugs scoped with reproduction steps, file pointers, and hypotheses; deep-dive section stubbed. Scheduled remote agent (`trig_01BCBti7Gy7vDtxuV3EpWJwo`) was disabled — we'll do this work ourselves session-by-session.
- **2026-05-02 (Bug 3 session):** Bug 3 fixed in the expression parser — extended the `[IDENTIFIER]` columnRef lookahead to accept dotted paths (`[risk.dv01]`). Committed as `4055ff1`. Strict assertion restored in `e2e/v2-nested-calculated-columns.spec.ts`.
- **2026-05-02 (Bug 2 session):** Bug 2 confirmed as a downstream of the same parser fix — `[ratings.sp]` now parses as columnRef so `scalar === 'AAA'` matches correctly. Strict assertion restored in `e2e/v2-nested-conditional-styling.spec.ts`. Committed as `03390f5`. Both fixes verified by full nested-fields Playwright run: 24/24 green.
- **2026-05-02 (Bug 1 session):** Bug 1 root-caused as an SSF format-string issue, not a nested-field issue. SSF rejects unquoted unicode literals like `▲ ▼ —`; both showcase and fixture grids were silently falling back to `String(value)`. Added `sanitizeFormatForSSF` in `excelFormatter.ts` — try-and-quote loop that probes positive/negative/zero/text values to surface every section's tokens, then wraps unrecognized top-level chars in quotes. Strict arrow-glyph assertions restored in `e2e/v2-nested-formatter.spec.ts`. Full nested-fields gauntlet 51/51 green; `npx turbo typecheck build test` green (71/71).
