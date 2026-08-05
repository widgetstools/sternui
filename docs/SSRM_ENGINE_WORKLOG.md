# `@starui/ssrm-engine` — worklog

Splitting the remaining work into sessions. Each one is self-contained, ends
with something committed and MEASURED, and states what would make it a failure.

Read [`packages/react-grid/ssrm-engine/README.md`](../packages/react-grid/ssrm-engine/README.md)
first — it holds the current numbers and the caveats attached to them.

---

## Where this stands

Built, tested and running in a browser on the lab's Stress tab (`?engine=ssrm`
for a generated book, `?engine=ssrm&book=provider` for one fed by a provider),
with the book in a **SharedWorker** since session 1:

| | ssrm-engine | Perspective, same tab |
|---|---|---|
| first row painted | 1,813 ms | 12,000-15,000 ms |
| SORT, first block | 59 ms | 400-1,100 ms |
| block read, AG end to end, live feed | 3.1 ms | 8 ms paused, 119-145 ms live |
| block read (Node, engine only) | 0.6 ms warm / 4.4 ms cold sort | — |
| renderer working set, settled | 390 MB | 1,286 MB |
| pivot `desk x currency` | 8 groups, 8 generated columns | not implemented |
| rows after a sort | 20,000, no collapse | 20,000 |

The full AG SSRM request is answered: `startRow`/`endRow`, `sortModel`,
`filterModel` (text, number, date, set, blank, compound AND/OR, multi-filter),
`rowGroupCols`, `valueCols`, `groupKeys`, `pivotCols`/`pivotMode`, plus tree
data, quick filter, distinct values, grand total and a changed-key delta — and
since session 5, **calculated columns that behave like real ones**: compiled per
expression to a closure over the columnar store, and sortable, filterable,
groupable, pivotable and aggregatable through one column accessor that cannot
tell them from a stored field. They tick, too. 150 unit tests including two
differential fuzzes — one over the engine's query shapes (calculated cells and
calculated query shapes included), one over the whole push path from a write in
the worker to the rows AG holds.

**What session 1 settled, and what it did not.** The book is out of the window,
the boundary costs 2.2 ms per block against 0.6 ms in-process, and the topology
is now the one Perspective was measured on — so the comparisons above finally
mean what they say. What it did NOT do is move the memory: Chrome hosts the
SharedWorker inside a renderer process (verified, no worker process of any kind
in `SystemInfo.getProcessInfo`), and the engine's columnar book was only ~20 MB
of a 400 MB renderer anyway. The 390 MB against 1,286 MB is a difference of
engine, not of hosting. Details in the README.

---

## Rules carried into every session

These cost real time when ignored, all of them in this repo's history. Rules 13
and 14 are new and both came from session 5 — the first from a check that would
have been green over the bug it was written for, the second from a measurement
that looked like a 6x regression and was the metric.

1. **Measure before theorising, and check the probe can fail.** Three separate
   figures on the Perspective path were withdrawn after a clean re-measurement.
   Each bad probe shared one property: it could not have reported a failure. The
   pause switch reported UI state, not feed state; a cell sampler watched text
   columns a price feed never touches; a benchmark timed a cache hit and called
   it a sort.
2. **`performance.memory` is the JS heap only.** It read 61 MB against a 1.7 GB
   process. Use `perspective-grid/scripts/rendererProcessProbe.mjs`.
3. **Production builds only.** The Vite dev server serves hundreds of modules
   per window; a third window never finishes loading.
4. **The differential fuzz is not optional.** It has already caught a descending
   sort putting nulls first, and the oracle's own tie-break bug. The engine
   evaluated here in July shipped three defects that its hand-written smoke test
   passed cleanly through.
5. **Silent-wrong beats slow, and is worse.** Every defect in that July
   evaluation was in an *optimised* path and none of them was loud.
6. **AG Grid 36 gates its API behind modules.** A partial registration leaves
   methods present and inert — `getDisplayedRowCount()` returning undefined on a
   live grid with 28 rows painted.
7. **Playwright's `browser.newPage()` opens a NEW BrowserContext per page.**
   Separate storage partition, therefore a separate SharedWorker — so a
   multi-window probe written that way measures N independent apps and reports
   it as sharing. Use one `browser.newContext()` and `context.newPage()`. Caught
   in session 2 by a check that refused to report until exactly one
   `shared_worker` was live; the renderer table it would otherwise have produced
   scaled at 2.86x and looked entirely plausible.
8. **A decision that is queued must be MADE synchronously.** `ProviderEmit` is
   synchronous and a work queue is not, so a flag flipped inside queued work is
   still unflipped for everything enqueued behind it. Session 2's feed decided
   snapshot-vs-update that way and every chunk of a snapshot believed it was the
   first, leaving the book holding only the last one.

9. **A test double that lies about the thing it doubles is its own trap.** The
   pump's grid stub accepted whatever the pump emitted, so a removal payload AG
   could not resolve passed for a release with a green test pinning it. The
   delta fuzz's grid model is written from AG 36's own transaction code
   (`transaction.remove.map((data) => idFunc({ data }))`) and it failed on frame
   7. When a boundary is a contract with somebody else's code, read their code.
10. **A fix has to generalise to every branch that shares its reasoning.** Nulls
   were moved above the sort's direction multiplier and NaN, which the same
   comment says belongs with them, was left below it — so the identical bug
   shipped in the branch nobody re-read. Session 3 found it by adding NaN to the
   fuzz's tick generator, not by reading the code.

11. **A check that passes on the inputs you have proves only that.** Session 4's
   twin probe reported 200,000 identical cells over the lab's seeded curriculum
   and then let TWO core mutations through — `x / 0` answering `Infinity` and
   NaN made falsy — because nothing in the curriculum divides by a variable
   outside a guard, and nothing in it puts a non-boolean in a condition. The way
   to find that out is **mutation testing**: put the bug in deliberately and
   require the check to go red. Session 3 did the same thing by reverting its
   fixes; do it for every new check, not only after a real defect.

12. **A refusal can make a check vacuous.** The same session's fuzz generated a
   call the compiler correctly refuses, so the column was never installed and
   30,000 assertions compared `undefined` to `undefined` and passed. Whenever a
   path can decline to produce a value, assert that it produced one.

13. **A check that agrees with the oracle by DOING NOTHING is the same trap.** A
   sort that did not sort, a filter that excluded nothing and a group of one
   bucket all match a correct oracle perfectly — and "did nothing, silently" is
   precisely the defect session 5 existed to remove, so the check would have
   been green over the bug it was written for. Every new query path now carries
   a counter asserting it was SEEN TO CHANGE THE ANSWER on a substantial number
   of frames. Session 5's first run failed one of those at 29 frames of 250,
   which was the counter working: the fix is a better input, never a lower
   threshold.

14. **Two consecutive runs of one configuration is not a control.** Session 5
   read 12,620 and 12,661 ms to first row with calculated columns against 1,869
   and 1,981 ms without, and that is a clean, reproducible-looking 6x
   regression. Interleaving the two URLs in ONE series put the baseline at
   12,715 ms and the calculated run at 1,925 ms. `browserSmokeProbe` is bimodal
   on identical code, exactly as `providerBookProbe` already was. A/B by
   alternating, never by batching.

**Gates for every session:** `npx turbo typecheck build test --continue`.

**The `@starui/grid` baseline is GONE — it is 101 files / 855 tests / 0 failed.**
It was carried for four sessions as "4 failed test FILES, 0 failed tests", and
the zero was the tell: none of those files ran, so 42 assertions about the
widget were reported as known-good while checking nothing. Three causes, all
fixed: a per-file `ag-grid-enterprise` stub with 2 of the 21 names
`modules.ts` imports (now a shared Proxy stub that cannot drift); the fact that
the stub was never the real graph cut — the THROWN error was, and satisfying the
names let the graph reach a wasm Vite denies (now aliased in
`vitest.config.ts`); and mocks predating the MarketsGrid/MarketsGridHost split,
where the host reads context by relative path and the barrel's passthrough never
established it (now the real provider, real hooks and a real `GridPlatform`).

**The `@starui/widgets-react` baseline is gone too — 48 files / 235 passed / 1
skipped.** The 2 `providerStaleState` cases waited on
`expect(latestProvider.start).toHaveBeenCalled()`, which cannot pass:
`MarketsGridContainer` uses `autoStart: false` and never calls
`provider.start()`. The gate is now `onStatus`, the subscription those tests
actually depend on, and the wiring is mutation-tested 5 ways.

**And the turbo ordering race is fixed**, which was two bugs in one costume:
`typecheck`/`test` depended only on `^build` (dependencies' builds, never the
package's OWN — and `@starui/design-system`'s test reads its own
`dist/css/theme.css`), and `@starui/grid` imported `@starui/host-data/runtime`
without declaring it, so turbo could not see the edge at all.

**So the gate is 73/73 with nothing excused.** If something fails, it is real —
there is no longer a documented list of failures to wave it past. Plus the
probes named per session.

---

## Session 1 — the book moves into a SharedWorker · **DONE**

Built: `src/worker/protocol.ts` (the `{id, method, params}` /
`{id, ok, result | error}` wire), `src/worker/rpc.ts` (one in-flight map per
port, both halves, and a timeout that FAILS a call), `src/worker/host.ts`
(`serveSsrmEngineWorker`, one engine per book id, retire on last detach),
`src/worker/SsrmEngineClient.ts` (the same surface, async) and
`src/asyncDatasource.ts` (the AG boundary). The lab's worker entry is
`apps/demos/perspective-ssrm-lab/src/workers/ssrmBookWorker.ts`; the book
generator moved out of the React component into `src/data/stressBook.ts`, which
may not import React, AG Grid or anything that touches the DOM.

**Verified.** `browserSmokeProbe.mjs` passes unchanged against the worker-hosted
surface. `scripts/workerBoundaryProbe.mjs` is new and refuses to report a number
until the browser's own target list contains a live `shared_worker` running
`ssrmBookWorker` — an in-window fallback would produce beautiful sub-millisecond
figures that mean the opposite of what they appear to.

| | measured |
|---|---|
| port round trip, no engine work | 0.00 ms median, 0.10 ms p90 |
| block round trip, 100 rows x 121 columns | **2.20 ms** median (fails above ~10) |
| AG `getRows` end to end, live feed, real scroll | 3.10 ms median, 5.50 ms max |
| blocks failed / rpc timeouts / late / pending | **0 / 0 / 0 / 0** |
| renderer, settled — in-window vs worker-held | 411 MB vs **390 MB** |
| renderer, after 3 min of scrolling | 570-700 MB vs 560-740 MB |
| Perspective, same book, settled | 1,286 MB |

**The boundary passed and the memory claim did not.** 2.2 ms is nowhere near the
10 ms line, so the premise holds. But moving the book saved ~20 MB, because
Chrome hosts the SharedWorker **inside a renderer process** — `getProcessInfo`
reports `{browser:1, renderer:2, GPU:1, network:1, storage:1}` and no worker
process, the same finding recorded for Perspective's worker and reached
independently here — and because the columnar book was only ever ~20 MB of that
renderer. What fills it is AG's own block cache (`maxBlocksInCache: 100` x
`cacheBlockSize: 100` = up to 1.21M cells as JS row objects) plus its DOM, and
that is in the window whichever engine supplies the rows.

So the 390 MB against Perspective's 1,286 MB is real and it is a difference of
ENGINE, not of hosting. **Anything that plans around "the worker holds the book,
so the window is small" is planning around something this measured false.** What
the move is actually worth is what sessions 2 onward need: one book, N windows,
a tick applied once, and a page that reopens against a book already loaded.

**One measurement trap found and fixed on the way.** `StressTestTab` called
`useLabPerspectiveRows` unconditionally — a hook cannot be conditional — so
`?engine=ssrm` was building the whole 20,000 x 120 Perspective Table in the
SharedWorker *as well as* the engine's own book. The first renderer figure taken
this session was 1,114 MB settled and ~1,700 MB under scroll: two engines,
recorded against one. The Perspective surface is now its own component so its
hook does not run on the ssrm branch. Any future comparison on this tab has to
keep that separation.

---

## Session 2 — many windows, one book, and a real feed · **DONE**

Built: the stale-port reaper (`pagehide` beacon + client heartbeat +
`host.sweep()`), per-subscriber viewport push (`engine.visibleKeys`,
`client.setViewport`, narrowing in `host.publish`), `createSsrmRowPump`
(conflation keyed by row id + a `sliceBudgetMs` slice), `client.introspect()`,
and the provider feed: `@starui/host-data/runtime/ssrm` (`createSsrmBookFeed`,
`createSsrmHost`), the hub's `loadSsrm` + `ssrm-attach`, and
`client.attachSsrm`. The lab's grid surface split into `SsrmEngineGrid` (shared)
with `SsrmEngineStressGrid` (generated book) and `SsrmProviderGrid` (fed book,
`?engine=ssrm&book=provider`) as wrappers. 99 engine tests, 537 in host-data.

**Which worker holds the book — decided.** A FED book lives in the
**data-services worker**, where the provider's rows already are. There is no
route between two SharedWorkers that does not pass through a window, so hosting
it in the app's book worker would mean forwarding every row per window: a second
copy of the feed. A GENERATED book has no provider and stays in the app's own
`ssrmBookWorker`. A worker must never be given both `loadSsrm` and
`loadPerspective`.

**Measured**, `multiWindowProbe.mjs`, three runs, production build:

| | measured |
|---|---|
| shared workers / books / clients | **1 / 1 / 3** |
| an INSERT in window 1, seen and readable in window 3 | yes |
| getting the book — w1 vs w2/w3 | **318-379 ms** vs **10-15 ms** |
| time to first row — every window | 1,485-1,893 ms, **no material difference** |
| renderer total, 1 window -> 3 windows | 287-294 MB -> 674-695 MB = **2.36-2.39x** |
| rows pushed per tick, viewport ON vs OFF | **0.8 vs 200 — 267x** |
| block round trip, after all of it | **2.10 / 2.30 ms** across two runs (session 1: 2.20) |

**The prediction held and the session's own pass condition did not.** One book,
three block caches: 2.36-2.39x rather than 3x, with window 1's renderer ~72-94 MB
above the others at the same instant. But "windows 2 and 3 must open materially
faster" is FALSE on the generated book — 1.02x, 0.95x, 0.91x — because time to
first row is app bundle, React and AG Grid, which every window pays whatever
holds the book. The part sharing can touch is getting the book, and there it is
~30x. The engine builds 20,000 x 121 in ~350 ms, so there was only ~350 ms in the
whole open for sharing to remove; Perspective's equivalent is 18.4 s, which is
why the same property is worth so much more there. On the PROVIDER-fed book,
where window 1 waits for a real snapshot, the attach shows it plainly:
**1,386 ms -> 3 ms.** (This entry also quoted 2,894 ms vs 1,632 ms to first row.
Session 3 withdrew that: the measurement is bimodal on identical code — see
session 3's own entry.)

**Two traps caught by probes rather than review.** Playwright's
`browser.newPage()` opens each page in a NEW BrowserContext — a separate storage
partition and therefore a separate SharedWorker; the first run reported 3 shared
workers and a total scaling at 2.86x, which is what three independent books look
like. And the feed decided snapshot-vs-update inside its queued work, so every
chunk of a snapshot was enqueued before the first ran, all believed they were the
first, and the book held only the LAST chunk. Both were found because the check
could fail; neither would have shown on screen.

**Not done, and stated in the README:** the feed has only been run against the
lab's mock provider (same emit sequence as STOMP, not the same broker), and the
reaper has no browser-level test — nothing yet kills a real window and watches
the book go.

---

## Session 3 — the fuzz grows to cover pivot, tree and the push path · **DONE**

Built: pivot and tree levels in `engine.fuzz.test.ts` (a pivot level checked
cell by cell against an independently computed combination set, a tree level
against the equivalent GROUP level plus the markers, and group-row ORDER as well
as count); `worker/deltaPath.fuzz.test.ts`, 260 frames through the whole push
path — a real `MessageChannel`, the host's narrowing, the pump's conflation and
slice, into a grid model built from **AG 36's own transaction code**; and an
emit-SEQUENCE fuzz for the feed in `host-data` (260 random interleavings against
one independent rule: a `replace` clears the book and every batch after it
upserts). 102 engine tests, 539 in host-data.

**Three defects, all silent, none of them in the engine's incremental path.**

| found | what it was |
|---|---|
| `engine.fuzz`, frame 6 | a **NaN price sorted FIRST** on a descending sort. The null fix moved the null verdict above the direction multiplier and left the NaN verdict inside `compareValues`, where `cmp * dir` inverted it. A fix that does not generalise is a bug waiting in the branch nobody re-read |
| `deltaPath.fuzz`, frame 7 | **removals removed nothing.** The pump sent bare keys; AG 36 maps a transaction's `remove` through `getRowId`, so each one resolved to `"undefined"` and matched no node. Every deleted row stayed on screen until its block was re-read. `rowPump.test.ts` asserted the old spelling and passed throughout |
| `deltaPath.fuzz`, frame 26 | **the viewport was narrowed on one side of the write.** A tick that changes a sort key moves the row out of the range, and AG does not re-order on a transaction — so the row is still on screen and its update was dropped. On a descending price sort that is a price that falls hard. Fixed by narrowing on the union of before and after, which costs nothing: the pre-write set is the one the previous publish already computed |

**And it found nothing wrong with the engine's own incremental path**, which is
the expected result and is stated rather than left to imply — aggregation is a
full pass and the index cache is cleared wholesale, so there is no state to get
out of step. Everything this session caught was in what sessions 1 and 2 put
between the engine and the grid.

**Every fix was checked by putting the bug back.** Reverting the narrowing turns
the fuzz red at `frame 26 sorted: r291.px is 108.18, book says 159.15 (in view
before the write: true, after: false)`; reverting the removal payload at
`frame 7 flat: ghost row r31`; reintroducing rule 8's queued decision fails the
feed fuzz at a named seed with the event script printed. One run of the delta
fuzz: 3,197 patch rows received, 1,130 applied, 1,828 dropped, 101 removed, 892
flushes of which **758 stopped on the slice budget**, 17,166 row-vs-book
comparisons.

**The probes still pass and the boundary did not move**: `browserSmokeProbe`
1,761 ms to first row and a 63 ms sort (session 2: 1,813 / 59);
`workerBoundaryProbe` **2.10 ms** median per block, 0 failed, 0 timed out, 0
late, 0 pending; `providerBookProbe` 20,000 rows through the data-services
worker with `ssrmBookWorker` confirmed absent.

**One session-2 figure withdrawn as a single-run number.** The provider probe's
"time to first row" looked like a 4x regression, so it was A/B'd against a
rebuild with this session's changes reverted — and it is **bimodal on identical
code**: ~3.0 s or ~13.6 s with nothing between, in both configurations (five
samples with the fixes, three without). Session 2's 2,894 ms is the fast mode
reported from one run. The stable number on that probe is the ATTACH — 1,408 to
1,485 ms for window 1 against 2-12 ms for window 2 — and that is the one the
sharing claim rests on anyway.

**Not done, and stated in the README:** nothing yet fuzzes a write landing while
a block for the PREVIOUS query shape is still in flight. The 0.8-rows-per-tick
figure for viewport narrowing was measured before the union fix and has not been
re-taken.

---

## Session 4 — calculated columns, part 1: the evaluator · **DONE**

Built: `src/calcAst.ts` (the StarUI expression AST restated structurally),
`src/calcOps.ts` (the operator and function semantics, mirroring
`@starui/engine`'s `evalOps.ts` and `functions.ts`), `src/calc.ts`
(`compileCalcColumns` — one closure per expression, taking a row OFFSET),
`ColumnStore.reader(field)`, `engine.setCalcColumns` / `calcEvaluator` /
`calcDiagnostics`, the `setCalcColumns` / `calcDiagnostics` RPC pair, calculated
columns inside `engine.fuzz.test.ts`, `src/calc.test.ts`, and
`scripts/calcTwinProbe.mjs`. **124 engine tests** (was 102).

**No new language and no second parser.** `tokenize` and `parse` stay in
`@starui/engine`; the customizer already emits that AST and
`ssrmExpressionCompile.ts` already compiles it to Perspective. This is a THIRD
BACKEND for the same tree.

**The import decision, made rather than defaulted.** The AST is taken
STRUCTURALLY. A compiled closure is not merely undesirable but impossible — the
value must be produced where the book is, which is a SharedWorker, and a
function is not structured-cloneable. Importing `@starui/engine` is legal under
`docs/ARCHITECTURE.md` and costs a bundle: it is the grid platform behind one
entry, with `zustand`, `ssf` and three `ag-grid-*` peers, dragged into worker
entries that today have zero runtime dependencies. `setCalcColumns` puts an AST
on a real `MessageChannel` in `worker/host.test.ts`, so the cloneability the
decision rests on is asserted rather than assumed.

**Null semantics follow the GRID, which is JavaScript.** `null > 95` is false,
`null > -1` is **true**, `null == 0` is false. Three places the grid is not
plain JavaScript are copied anyway: `x / 0` is null while `x / null` is
Infinity; `isTruthy(NaN)` is TRUE; and `IF` (JavaScript truthy) disagrees with
`IFS` (`isTruthy`) about NaN. **An expression producing NaN is stamped as NaN**,
never folded into null — the store keeps it, `blank` does not match it, an
aggregate skips it, and it sorts with the nulls, all of which a null would get
wrong.

**Errors never reach a block read.** A compile failure falls back to the field
binding; a runtime failure falls back to the field value, caught by one
try/catch at the top of the column, warned once per expression. Diagnostics are
RETAINED as well as warned, because `console.warn` in a SharedWorker reaches no
console anywhere.

**Measured.**

| | |
|---|---|
| CSRM twin, `calcTwinProbe.mjs` | **520,000 calculated cells, zero disagreements** |
| fuzz cell comparisons per run | ~30,000 over 750 generated expression shapes |
| block read, warm index, 0 -> 4 calc columns | 0.7 -> 0.9 ms (**~0.2 ms per 400 cells**) |
| the closures alone, 80,000 cells | 11.4-11.8 ms (~145 ns/cell) |
| AST reads during 5,000 evaluations | **0** — compiled, not walked (counting Proxy) |
| `workerBoundaryProbe` block round trip | **2.10 ms** — identical to session 3 |
| `browserSmokeProbe` first row / sort | 1,475-1,556 ms / 60-62 ms |
| `providerBookProbe` attach, w1 vs w2 | 1,086 ms vs 1 ms |

**The fuzz found no defect in the evaluator, and that is the honest headline.**
Everything this session cost was spent on two checks that could not have failed.

1. **The fuzz's own first draft was vacuous.** The generator emitted
   `MIN([px], [qty])`, the compiler refused it as a cross-row aggregate, the
   column was never stamped, and 30,000 comparisons became `undefined` against
   `undefined`. The refusal was right and the generator was wrong.
2. **The twin probe's first version proved less than it looked.** Run over the
   lab's seeded curriculum alone it reported 200,000 identical cells — then
   MUTATION TESTING put eleven deliberate bugs in the evaluator and **two
   survived**: `x / 0` answering `Infinity`, and NaN made falsy. Neither is
   observable through the curriculum, because every division in it is by a
   literal or inside a guard discarded on exactly the zero rows, and every
   condition in it is already a comparison so a NaN never reaches a truthiness
   test. Sixteen adversarial expressions were added; both are now caught at
   named rows. Nine of the other mutations were caught first time; the one
   remaining "survivor" is a semantically equivalent rewrite (a TypeScript cast
   is erased at runtime) rather than a gap.

**One finding, in the lab rather than the engine.** The seeded curriculum
authors `LOG10([avgDailyVolume30d])` and **`LOG10` does not exist in
`@starui/engine`**. On CSRM `buildVirtualColDef` catches the "Unknown function"
and returns null for every row, silently — that column has been rendering blank.
This backend refuses it with the function named, which is how it was noticed.

**Not done, and stated in the README:** a calc column produces VALUES only —
it cannot be sorted, filtered, grouped or aggregated on, which is session 5, and
`calcEvaluator(colId)` is the seam it needs. A calc column also **does not
tick**: `host.publish` broadcasts the writer's sparse patch verbatim, so a tick
that moves `dailyPnL` reaches the window without the `calc_pnlTotal` that
depends on it, and the cell stays stale until AG re-reads that block. Fixing it
changes `publish` and belongs behind the delta-path fuzz, so it goes with
session 5. Nothing wires calc columns to a surface yet.

**Two documented figures re-measured, both worth noting.** `browserSmokeProbe`'s
first run after starting a fresh preview read **12,496 ms** to first row against
a 1,475-1,556 ms steady state across the next three — a cold bundle fetch, not a
regression, and the same first-run artifact that makes `providerBookProbe`
bimodal. And the `@starui/grid` gate baseline came back as **4 failed test FILES
/ 0 failed tests / 807 passing**, i.e. the worklog's OLDER figure, not session
3's "6 files / 765 passing". Both numbers have now been seen; the failure is a
collection error in an `ag-grid-enterprise` mock missing
`ServerSideRowModelModule`.

---

## Session 5 — calculated columns, part 2: they behave like real columns · **DONE**

Built: `src/columnAccess.ts` (`SsrmColumnAccess`, `createColumnResolver`,
`orderKeyOfValue`, `numericOrderKey`), `sort.ts` rewritten around
`compareOrderKeys` and a decorated key, `filter.ts` and `aggregate.ts` moved off
the store onto the accessor, `engine.calcPatch` plus the `writeVersion` stamp,
`host.publish` stamping the patch, `ColumnStore.resolveColumn`, the
`ssrm-engine` plan kind in `grid/src/engine/ssrmCalcColumns.ts` with
`ssrmEngineCalcColumnDefs`, `src/calcQuery.test.ts` (26 cases), calculated
columns inside both fuzzes, and sort/filter/group parity in `calcTwinProbe.mjs`.
The lab installs four of them on `?engine=ssrm&calc=1`. **150 engine tests**
(was 124).

**One accessor, not three, and rule 10 is why.** `sortIndex`, `compileFilter`
and `aggregateMembers` each opened by skipping a column the store does not have,
so a sort, filter or aggregation on a calculated column was a SILENT NO-OP. The
fix could have been three branches; it is one interface that answers a store
column and a compiled expression identically, consumed by sort, filter,
aggregate, group, pivot, the ancestor predicate and distinct values. Adding
pivot and set-filter values afterwards was one line each. There is now one
comparator in the package and one definition of "no position on the number
line".

**Three defects, and two of them were never about calculated columns.**

| found | what it was |
|---|---|
| `engine.fuzz`, frame 0 | an aggregate **COERCED a non-number instead of skipping it**. AG's own `aggSum`/`aggMin`/`aggMax` require `typeof value === 'number'`. A calculated boolean column summed to the count of its TRUE rows — and a stored STRING column summed its DICTIONARY CODES, reachable the whole time by dragging a text column into the values panel |
| `engine.fuzz`, frame 11 | **Kahan compensation poisoned a group once a non-finite value entered it.** `Infinity - 0 - Infinity` is NaN and every later `value - compensation` inherits it, so one `x / null` turned a total into NaN and kept it NaN after the Infinity cancelled out. Reachable on a stored column too: a feed can send one |
| mutation testing | **group rows still had their own comparator**, with the direction multiplier applied to an unorderable verdict — a NaN group key sorted FIRST on a descending group. Rule 10 exactly: the leaf sort was fixed for this twice and the branch that shares its reasoning was never re-read. It survived every value comparison in the suite |

**Sixteen deliberate bugs, 16 caught, 0 survived.** Every new path was
mutation-tested by a throwaway script that edits the source and requires the
suite to go red. Three anti-vacuous counters were added because a sort that did
nothing, a filter that excluded nothing and a group of one bucket all agree with
the oracle trivially — which is the state the engine was in before this session.
The first run failed one of them at 29 frames of 250; a deterministic `[qty] % 3`
column was added rather than the threshold lowered.

**The materialise decision — made, and it is neither option.** Both sides
measured on the same book. A sort evaluates its key TWICE PER COMPARISON and a
scattered key costs **254,515 comparisons**, so naive per-read was **34.0 ms
against 3.3 ms** stored. A per-generation value cache took it to 16.0 ms, at
which point the cost was the cache LOOKUP; hoisting the key into a decorated
array took it to **11.0 ms**, with this book's structured key at 3.5 ms —
**1.0x a stored sort**. Filter 1.5x, group+aggregate 2.5x, 0.1 ms per 400-cell
block. Materialising would pay **11.3 ms per snapshot, 0.1 ms per 200-row tick**
(doubling it) and **625 kB** for four columns.

**Decided: computed per read, cached per write, sort key decorated.** It is
close on read cost and that is said plainly — so the tie-break is correctness: a
materialised value must be re-derived on exactly the writes touching its inputs
and is silently stale when that is wrong, where a write stamp compared on every
read cannot be. Revisit if a sort ever exceeds ~100 ms.

**Probes.** `calcTwinProbe` 520,000 cells identical plus sort/filter/group
parity across five columns (52 null/NaN rows last in both directions; four
mutations turn it red at named rows). `workerBoundaryProbe` **2.40 ms baseline
vs 2.60-3.00 ms with four calculated columns**, 0 failed / 0 timed out / 0 late
/ 0 pending. `browserSmokeProbe` 1,887-1,981 ms and a 65-74 ms sort either way,
125 columns confirming installation. `providerBookProbe` attach 1,391 ms vs 2 ms.

**One reading withdrawn.** The first calc-enabled smoke runs read 12,620-12,661
ms to first row against 1,869 ms baseline, twice each — a clean 6x regression.
Interleaving the two URLs in one series put the BASELINE at 12,715 ms and the
calculated run at 1,925 ms: bimodal on identical code, the artifact already
documented for `providerBookProbe`. Two consecutive runs of one configuration is
not a control.

**Two decisions inherited from session 4 rather than revisited.** Cross-row
reducers stay REFUSED — "every row" against a server row model means the
filtered book and depends on the request rather than the row. `NOW`/`TODAY`
stay refused, and the materialise decision above does not change that: the
value cache is invalidated by writes, and a value that changes on its own has no
write to hang off.

**Not done, and stated in the README:** a window that writes through its own
client does not get its own calculated cells back (the host does not echo to the
author; cell-edit commit is session 6). The planner does not pre-validate
against the engine's refusal list — deliberately, to avoid a second copy — so an
author sees "unsupported" only for a parse error. A calculated column has not
been exercised as a `treeFields` hierarchy. And nothing lets a user AUTHOR one
on a product surface: that is session 6.

---

## Session 6 — a MarketsGrid surface

Until now the engine has run under a plain `AgGridReact`. This is the session
that makes it a product surface.

**Build**

- `SsrmEngineMarketsGridSurface`, peer to `PerspectiveMarketsGridSurface`;
- the pieces that surface needed and are easy to forget, each of which was a
  separate bug on the Perspective path: set-filter values from the engine (AG's
  own list is empty under a server row model), quick search bridged through
  `modelUpdated` (AG's `quickFilterText` is client-side only), status-bar panels
  that can answer at all (AG's stock row-count panels render NOTHING here),
  cell-edit commit, the grand-total row transaction, and export via a whole-book
  read;
- `getRowId` for group rows by PATH (warn 205 discards the block otherwise).

**Verify** the parity checklist in
[`PERSPECTIVE_GRID_PARITY_WORKLOG.md`](./PERSPECTIVE_GRID_PARITY_WORKLOG.md),
and read its "Traps that produced false findings" section first — several
"broken" findings there were the test technique, not the feature.

---

## Session 7 — incremental index maintenance, only if measured

**Do not start this without a measurement demanding it.** Any write currently
clears the query cache and the next read re-materialises: 1.5-15 ms at 20k rows.
It is the first thing to change if a book gets large, and the last thing to
change otherwise — this is where engines go silently wrong.

**Build**, behind the fuzz from session 3:

- `lowerBound` splice on a sort-key change (the primitive already exists);
- incremental group membership;
- incremental aggregation LAST, and note `min`/`max` are not reversible —
  removing the current max needs the runner-up, so a multiset per group per
  column or a dirty-and-recompute. `sum` is reversible with Kahan compensation
  plus a periodic recompute; the July engine's anti-drift pass ignored pending
  work and was off by 1.65M by frame 436.

---

## Session 8 — the decision

**Build nothing.** Run both engines on the SAME topology and write up which
survives:

- `browserSmokeProbe.mjs`, `stubVisibilityProbe.mjs`, `sortRecoveryProbe.mjs`
  and `rendererProcessProbe.mjs` against each;
- a cold profile per run, several runs each — run-to-run variance on an
  IDENTICAL build has already been as large as the difference between two
  configurations (17% of samples against 34%). Two runs is not a baseline;
- the honest cost column too: what is still missing, what the licence position
  is, and who maintains it.

Then decide, and record the decision with its numbers. If Perspective wins on
something, say so.

---

## Open questions that change the plan

- **How large is the real book?** Everything above is sized for 20k x 120. At
  millions of rows session 7 becomes mandatory and a Rust/WASM port is worth
  re-opening. At this size neither is.
- **How many concurrent blotters?** The question the July evaluation said to
  answer before re-deciding. Three now run on one book and cost 2.36-2.39x a
  single window's renderer, so the marginal blotter is roughly a block cache and
  its DOM — but the deployment's actual number is still not known, and it is what
  decides whether that marginal cost matters.
- **Does anything need pivot on a book the window cannot hold?** Pivot combos
  are currently taken per level; a whole-book pivot domain would need a
  different pass.
