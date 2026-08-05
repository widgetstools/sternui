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
data, quick filter, distinct values, grand total and a changed-key delta.
99 unit tests including a differential fuzz.

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

These cost real time when ignored, all of them in this repo's history.

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

**Gates for every session:** `npx turbo typecheck build test --continue` (the
documented baseline is 4 failed test FILES / 0 failed tests in `@starui/grid`
and 2 `providerStaleState` cases in `@starui/widgets-react` — anything else is
usually the turbo ordering race, re-run before believing it), plus the probes
named per session.

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
where window 1 waits for a real snapshot, it does show end to end: **2,894 ms vs
1,632 ms to first row, attach 1,386 ms -> 3 ms.**

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

## Session 3 — the fuzz grows to cover pivot and tree

**Why here:** sessions 1 and 2 add a network boundary and incremental push. Both
are exactly the kind of change that breaks something the current oracle does not
watch, and pivot and tree are currently unit-tested only.

**Build**

- extend the brute-force oracle to pivot and tree levels;
- fuzz the DELTA path: apply a random mutation, push only the delta, and assert
  the grid's row set equals a full re-read. This is the incremental-vs-full
  divergence that produced ghost rows and corrupted sums in July;
- adversarial frames on purpose: removal-only frames, re-adding a removed key,
  ticks landing on filtered-out rows, NaN, and a sort key changing under an
  active sort.

**Done when** 250+ frames pass across every query shape including pivot and
tree, and the delta path agrees with a full re-read every frame.

---

## Session 4 — calculated columns, part 1: the evaluator

**The single largest remaining piece.** Costed at 4-6 person-weeks in the July
evaluation; treat that as the estimate until something contradicts it.

**Build**

- reuse the existing StarUI expression AST rather than inventing a language —
  `compileStarUiExpressionToPerspective` already exists and the customizer emits
  that AST today;
- a JS evaluator over the columnar store, compiled per expression to a closure
  taking a row offset;
- null semantics that match the grid, NOT the previous engine's. Recorded on the
  Perspective path: `null > 95` is false in JavaScript and true in Perspective's
  expression language, and the same rule painted different rows on the two
  surfaces. Follow JavaScript.

**Verify** against the CSRM twin: the same expression over the same book must
paint the same rows. That comparison has already caught several "Perspective
bugs" that were present identically on the client-side model.

---

## Session 5 — calculated columns, part 2: they behave like real columns

**Build**

- a calc column must be sortable, filterable, groupable and aggregatable, which
  means the evaluator feeds `materialise` and not just the row output;
- decide and DOCUMENT whether calc values are materialised into the store
  (memory, staleness on tick) or computed per read (CPU per block). Measure both
  before choosing;
- wire to the customizer's calculated-column module.

**Done when** a seeded calc column from the lab's curriculum sorts, filters and
groups identically to the CSRM twin.

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
