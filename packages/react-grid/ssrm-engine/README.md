# `@starui/ssrm-engine`

A columnar row engine written to AG Grid's server-side row model contract.

**Status: the book lives in a SharedWorker, three windows have been measured on
one of it, and it can be driven by a real provider through `host-data`. See
"What is not here" for what remains.**

Run it: build and serve `@starui/perspective-ssrm-lab`, then open the Stress tab
with **`?engine=ssrm`** for the generated book, or **`?engine=ssrm&book=provider`**
for one fed by a provider. `scripts/browserSmokeProbe.mjs`,
`scripts/workerBoundaryProbe.mjs`, `scripts/multiWindowProbe.mjs` and
`scripts/providerBookProbe.mjs` drive it.

The remaining work is split into sessions in
[`docs/SSRM_ENGINE_WORKLOG.md`](../../../docs/SSRM_ENGINE_WORKLOG.md).

| in the browser, 20k x 120 | ssrm-engine | Perspective, same tab |
|---|---|---|
| first row painted | **1,813 ms** | 12,000-15,000 ms |
| SORT, first block | **59 ms** | 400-1,100 ms |
| block read, feed live | **3.1 ms** (AG end to end) | 119-145 ms |
| renderer working set, settled | **390 MB** | 1,286 MB |
| rows after a sort | 20,000 (no collapse) | 20,000 since the grand-total fix |
| pivot, desk x currency | 8 groups, **8 generated columns** | not implemented |
| 3 windows on one book, renderer total | **2.36-2.39x** one window | not measured |
| getting the book, window 2 of 3 | **10-15 ms** (window 1: 318-379 ms) | an 18.4 s snapshot per window |

Every figure in that column is with the book in a SharedWorker, which is the
topology Perspective's column was measured on. Before that move the same
surface read 1,629-2,326 ms to first row and 60-239 ms to the first sorted
block; the boundary did not cost either of them.

The Node figures below are a floor, not a prediction of what a user feels.

---

## Why it exists

Three problems on the Perspective pull path were traced to its engine model
rather than to any bug, and none of them is fixable from the grid side:

| | Perspective, measured end to end in the browser |
|---|---|
| block read, feed paused | 8 ms |
| block read, feed live | **119-145 ms** — `table.update()` blocks reads while it applies |
| first block after a SORT | **400-1,100 ms** — view configs are immutable, so a sort is a fresh View |
| renderer working set, 20k x 120 | **1,286 MB** — the SharedWorker shares the page's renderer process |

This engine keeps the same idea — one store, N query-shaped views — and changes
the three things that caused those numbers:

1. **the index is mutable.** A re-sort permutes an `Int32Array` of row offsets;
   nothing is rebuilt and no data moves;
2. **writes do not block reads.** An upsert writes cells. Nothing is recomputed
   until something asks;
3. **the engine knows which rows changed**, so a live tick can be PUSHED to the
   grid as `applyServerSideTransaction` rather than invalidating blocks and
   making AG re-pull them.

## The book is in a SharedWorker, and what that did and did not buy

The engine was synchronous and in-process, which is the memory shape that
produced "Aw, Snap · Out of Memory" on the Perspective path. Until it moved,
every figure recorded here was against a topology Perspective was never
competing on. It has moved: `src/worker/` is the wire protocol, the host, the
client and the async AG boundary, and the lab's Stress tab runs entirely from it.

```
SharedWorker   serveSsrmEngineWorker({ openBook })   one SsrmEngine per book id
               host.publish(bookId, patch)           a tick, pushed

Window         SsrmEngineClient.open(port, bookId)   the same surface, async
               createAsyncSsrmDatasource(client)     the AG boundary
```

### The boundary is cheap

MEASURED with `scripts/workerBoundaryProbe.mjs`, production build, live feed,
80 rounds each at perturbed offsets:

| | median | p90 | max |
|---|---|---|---|
| port round trip, no engine work (`size`) | **0.00 ms** | 0.10 ms | 0.30 ms |
| block round trip, 100 rows x 121 columns | **2.20 ms** | 2.70 ms | 23.70 ms |
| AG `getRows` end to end, under a real scroll | **3.10 ms** | 3.40 ms | 5.50 ms |

Against 0.6 ms for the same block in Node, in-process. **The session that built
this said it failed above ~10 ms per block; it is 2.2.** The port itself is
free — a call that does no engine work is unmeasurable at this resolution — so
what the 1.6 ms of difference buys is materialising the block and
structured-cloning 12,100 values back. 22 blocks served under the scroll, **0
failed, 0 timed out, 0 late, 0 left pending.**

### The memory it saved is ~20 MB, and that is the honest headline

MEASURED with `perspective-grid/scripts/rendererProcessProbe.mjs`, same book,
same build, only the hosting changed:

| renderer working set, 20k x 120 | in-window book | worker-held book | Perspective |
|---|---|---|---|
| settled, ~40 s after the first row | 411 MB | **390 MB** | **1,286 MB** |
| after 3 minutes of horizontal and vertical scrolling | 570-700 MB | 560-740 MB | — |

**Moving the book did not move the memory, and two measurements say why.**

First, Chrome hosts the SharedWorker **inside a renderer process**. The same
probe run reports `{browser:1, renderer:2, GPU:1, network:1, storage:1}` and no
worker process of any kind — the identical finding recorded for Perspective's
worker, arrived at independently here. The second renderer sits at 31-33 MB
with the book in the window and with it in the worker alike, so it is not
holding one; the book is in the page's own renderer either way.

Second, and more usefully: **the engine's book was never what filled the
renderer.** 20,000 rows x 121 columns of dictionary-encoded columnar storage is
tens of megabytes, which is exactly the size of the difference above. What
fills a 700 MB renderer here is AG Grid's own block cache — `maxBlocksInCache:
100` at `cacheBlockSize: 100` is up to 1.21M cells held as JS row objects — plus
its DOM. That is in the window whatever holds the book, and it is the first
place to look if this ever needs to be smaller.

So the 390 MB against Perspective's 1,286 MB is a real difference and it is a
difference of ENGINE, not of hosting: a columnar store against a wasm Table and
its heap. Do not read the worker as the reason.

**What the move IS worth** is the thing sessions 2 onward need and a window
cannot have: one book with N windows reading it, a tick applied once instead of
per window, and a page that can be closed and reopened against a book that is
already loaded. The Perspective path's own 18.4 s snapshot is the case in point.
That claim is now measured — see the next section, including the part of it that
did not come out the way the session predicted.

## Three windows, one book — measured, including what it did NOT buy

MEASURED with `scripts/multiWindowProbe.mjs`, production build, 20k x 120,
three windows in ONE browser context, **three runs**:

| | measured |
|---|---|
| `shared_worker` targets running `ssrmBookWorker` | **1** |
| books the worker reports / clients on it | **1 / 3** |
| an INSERT in window 1, seen in windows 2 and 3 | **yes**, and readable there |
| getting the book — window 1 | **318-379 ms** (it builds it) |
| getting the book — windows 2 and 3 | **10-15 ms** |
| time to first row painted — every window | **1,485-1,893 ms**, no material difference |
| renderer working set, 1 window | 287-294 MB |
| renderer working set, 3 windows | 674-695 MB — **2.36-2.39x**, not 3x |
| rows pushed per tick, viewport ON vs OFF | **0.8 vs 200 — 267x** |

**The prediction was one book and three block caches, and that is what the
numbers say.** 2.36-2.39x rather than 3x, with the first window's renderer
sitting ~72-94 MB above the other two at the same instant. That gap is the size
of one copy of the book plus whatever else the window that created the worker
uniquely holds; this probe does not separate those two, so do not quote it as
"the book is 72 MB".

**The session's own failure condition was "a second and third window must open
materially faster", and on the GENERATED book they do not — 1.02x, 0.95x,
0.91x.** That is a real result and it is not a defect. Time to first row is app
bundle, React, AG Grid and column defs, which every window pays whatever holds
the book. The part sharing can touch is getting the book, and there the second
window is **~30x faster** because the first one built it. The engine builds
20,000 x 121 in ~350 ms, so there is only ~350 ms in the whole window open for
sharing to remove. Perspective's equivalent is an 18.4 s snapshot, which is why
the same property is worth so much more there — and on the PROVIDER-fed book,
where window 1 waits for a real snapshot, the effect shows up end to end:
the attach itself going 1,386 ms -> 3 ms. (Session 2 also quoted 2,894 ms to
first row for window 1 against 1,632 ms for window 2. That one is **withdrawn**
— the measurement is bimodal on identical code; see the provider section below.)

**One trap caught by the probe rather than by review.** Playwright's
`browser.newPage()` opens each page in a NEW BrowserContext — a separate storage
partition, and therefore a separate SharedWorker. The first run of this probe
reported **3** shared workers and a renderer total scaling at 2.86x, which is
what three independent books look like. The check that refuses to report until
exactly one `shared_worker` is live is what caught it; without it the memory
table above would have been published as a finding about sharing.

## The book can be driven by a real provider

`applySnapshot` / `applyUpdate` are no longer only reachable from a generator.
`@starui/host-data`'s `createSsrmBookFeed` fills a book by **decorating
`ProviderEmit`** — the same seam `createPerspectiveTableFeed` uses, so no
transport changes and any provider drives it.

**Which worker holds the book, decided and not negotiable.** A fed book lives in
the **data-services worker**, where the provider's rows already are. The
alternative — feed in one SharedWorker, book in another — has no route between
the two that does not pass through a window, so it would be one forwarding copy
of every row PER WINDOW. A GENERATED book has no provider and lives wherever its
generator does, which is why the lab's Stress book stays in the app's own
`ssrmBookWorker`. The engine has no opinion either way: `createSsrmWorkerHost`
serves ports and knows nothing about who mounted it.

The engine is INJECTED into the hub (`loadSsrm`), not imported, for the reason
`loadPerspective` is plus one more: `@starui/host-data` must not depend on a
`react-grid` package. **A worker must never be given both loaders** — it would
tee one provider into two engines and every figure taken on it would be of two
engines recorded as one, which has already happened once here at 1,114 MB
instead of 411 MB.

MEASURED with `scripts/providerBookProbe.mjs`, which refuses to report unless
`dataServicesSsrmWorker` is live, `ssrmBookWorker` is NOT, and rows are still
arriving:

| | measured |
|---|---|
| rows the fed book holds / AG displays | **20,000 / 20,000**, 120 columns |
| rows pushed in 6 s (viewport narrowed) | 56, all applied, 0 dropped |
| two windows / books the worker holds | **2 clients / 1 book** |

**The "time to first row" on this probe is BIMODAL, and the 2,894 ms recorded in
session 2 is one of its two modes.** Eight runs across two builds — five with
session 3's changes, three with them reverted and rebuilt as a control — land at
either ~3.0 s or ~13.6 s with nothing in between, on identical code:

| | samples |
|---|---|
| with session 3's fixes | 13,471 · 13,453 · 13,925 · 3,164 · 3,045 ms |
| the same build with them reverted | 13,718 · 2,972 · 13,637 ms |

So a single run of it says nothing, and the A/B that looked like a 4x regression
was the metric. What is stable across all eight is the number the sharing claim
actually rests on — **attach: 1,408-1,485 ms for window 1 against 2-12 ms for
window 2** — and that is what to quote.

### The emit sequence bites here too

`stomp.ts` emits `{ rows: chunk, replace: offset === 0 }`, so a snapshot is an
empty `replace:true` clear, then a FLAGGED first chunk, then unflagged chunks
that are still snapshot. The three consequences recorded on the Perspective path
apply unchanged, and a **fourth** turned up here: the snapshot-vs-update decision
has to be made SYNCHRONOUSLY in `emit`, not inside the queued work. `emit` is
synchronous and the queue is not, so every chunk of a snapshot was enqueued
before the first one ran, all of them believed they were the first, and the book
ended up holding only the LAST chunk. The unit test for it fails loudly; nothing
on screen would have.

## A tick reaches only the windows that can see it

Each window tells the worker its visible range and the query shape it is pulling
with; the worker answers `engine.visibleKeys` and sends that window only the
dirty rows inside it.

MEASURED with an A/B on ONE window against ONE feed (comparing two different
windows would compare two viewports and two scroll positions as well):

| rows pushed to one window | per tick |
|---|---|
| viewport declared | **0.8** |
| viewport cleared | 200.0 |

**267x fewer rows on the wire, and the read path did not pay for it** — the
block round trip measured 2.10 and 2.30 ms median across two runs of
`workerBoundaryProbe.mjs` after this landed, against 2.20 ms in session 1. That
is not an improvement and is not meant to read as one; it is the same number,
which is the thing being checked. A viewport push that cost the read path would
be a bad trade.

### It has to be narrowed on BOTH sides of the write

The host narrows by the union of what the window could see BEFORE the write and
what it can see after it, and the second half was missing until the delta-path
fuzz found it.

A tick that changes a SORT KEY moves the row across the viewport boundary, so
the visible set after a write is not the set before it — and AG does not
re-order on a transaction, so a row that has just left the range is still the
row the user is looking at, at the position it was already painted. Narrowing by
the post-write set alone dropped exactly that update: on a descending price
sort, a price that falls hard is the tick that goes missing, and the stale value
sits there until the block is re-read. `frame 26 sorted: r291.px is 108.18, book
says 159.15 (in view before the write: true, after: false)`.

It costs no extra compute. The pre-write set is not recomputed — a write clears
the engine's index cache, so it could not be — it is the set the PREVIOUS
publish already computed and kept, and nothing but a write moves a row's
position. `setViewport` seeds it so the first tick after a scroll has one too.

It does put a few more rows on the wire, and the **0.8 rows per tick above was
measured before this landed**. The union can only add rows that were on screen
and left, so the ceiling is one viewport, but that figure has not been taken
again — do not quote it as if it had.

Two more rules the narrowing does not break. A GROUPED request is answered `null` and
the whole patch is sent: under grouping a position in one level's index is not a
displayed row index, so narrowing by it would push updates at the wrong rows —
the same constraint the Perspective tick path is bound by. And **removals are
never narrowed**, because AG's block cache is far larger than a viewport and a
row deleted upstream would otherwise sit off-screen forever and reappear on
scroll. The size mirror is kept live for a narrowed client too: a row inserted
outside every viewport still moves the count, which is exactly the insert a
cross-window sharing check depends on.

## The window applies a tick on a budget

`createSsrmRowPump` sits between the pushed delta and
`applyServerSideTransaction`, and does the two things the July evaluation flagged
and nobody built:

- **conflation keyed by row id** — a MERGE, not a replace, because the patches
  are sparse: a frame naming `bid` and a frame naming `ask` are two cells of one
  row, and taking the later frame whole would discard the earlier cell;
- **a `sliceBudgetMs` time slice** (4 ms) — a burst degrades into latency instead
  of a dropped frame, and the remainder is re-scheduled by the flush itself, so
  a feed that goes quiet does not leave the grid permanently behind.

A removal is sent as ROW DATA, not as a key. AG 36 maps every entry of a
transaction's `remove` through the grid's own `getRowId`
(`transaction.remove.map((data) => idFunc({ data }))`), so a bare key resolved to
`"undefined"`, matched no node, and **removed nothing** — a deleted row left on
screen until its block was re-read, which is the ghost row this path exists to
prevent. The unit test asserting the old spelling passed the whole time.

A patch for a row the grid does not hold is DROPPED and counted, never turned
into a fetch: AG ignores a transaction for a row outside its block cache, and
asking the engine for it would invent a read the user never scrolled to. A
`dropped` that dwarfs `applied` means the worker is pushing rows nobody is
looking at, which is what the viewport above exists to fix.

## The refcount survives a window that is killed

`close` covers unmount and navigation. It does not cover a window that is
crashed, task-managed or unplugged, and **a SharedWorker port has no disconnect
event** — so that window's book stayed attached for as long as the worker lived,
and the worker outlives the page. That is how the lab accumulated several 20-50k
books in one process.

Two levers now: a `pagehide` beacon, and a client heartbeat with a worker-side
`sweep()` that detaches ports which have stopped speaking.

**The stale window is 90 seconds because of timer throttling, not caution.**
Chrome throttles `setInterval` in a hidden tab to roughly once a minute, so a
20-second window would reap a blotter that was merely in a background tab — this
failure inverted, and worse. The cost of the margin is that a hard-killed window
leaks its book for at most `staleMs + sweepMs`, which is bounded where the leak
it replaces was not. The sweep timer runs only while a book is open: a
SharedWorker with a live interval is one that can never be collected.

### Rules this path is built on

- **Every `getRows` settles exactly once**, now for real. Against a synchronous
  engine a leak needed a bug; across a port it needs only a worker that is busy
  or gone, and AG's `outboundRequests` limit is 2. `createAsyncSsrmDatasource`
  latches the block and there are two independent timers — the RPC timeout that
  names the method, and a longer block-level backstop that holds even if the RPC
  layer itself misbehaves. A timeout that FAILS beats one that waits: AG paints
  a failed block and the user can scroll off it, where a pending one takes the
  grid.
- **A refused structured clone is silent at the sender.** It arrives as
  `messageerror` on the receiver and as nothing at all on the side that posted.
  Both ends listen for it; an uncloneable RESULT is answered as an error frame
  rather than dropped, because dropping it costs the caller a full timeout for a
  failure that is already known.
- **A tick broadcasts the sparse patch, not the rows.** Two prices on 200 rows
  is 400 cells; re-reading those rows out of the store would be 24,200, five
  times a second, per window.
- **A SharedWorker outlives its pages.** A book nobody detaches from survives a
  reload and the next load builds a second one beside it — which is how the lab
  once accumulated several 20-50k books in one process. The host retires a book
  with its last client, and the client sends `close` on unmount. There is no
  reliable disconnect event for a SharedWorker port, so a window killed outright
  still leaks its book until the worker is collected.
- **An unhandled rejection in a SharedWorker reaches no console anywhere.** The
  worker keeps running and whatever awaited that promise never settles, which
  from a window is indistinguishable from a hang. Every fault is pushed to the
  attached clients.

## Measured

`node --expose-gc node_modules/tsx/dist/cli.mjs packages/react-grid/ssrm-engine/scripts/benchProbe.mjs`
— 20,000 rows x 121 columns (101 numeric, 19 dimension strings, 1 index),
the same shape as the lab's Stress tab:

| operation | cost |
|---|---|
| block read from a warm index | 0.6 ms |
| block read at row 15,000 | 0.7 ms |
| **sort + first block** | **4.4 ms** (Perspective: 400-1,100 ms) |
| sort on two columns + first block | 15.1 ms |
| filter + first block | 1.5 ms |
| filter + sort + first block | 3.1 ms |
| group by 1 column + 4 aggregations | 6.3 ms |
| group by 2 columns, second level | 2.9 ms |
| quick filter across 19 string columns | 39.4 ms |
| distinct values for a set filter | 0.3 ms |
| apply a 200-row tick | **0.1 ms** |
| tick then re-read the visible block, sorted | 3.8 ms |
| initial load of the book | 205 ms |

**Read the caveats before quoting these.**

- **Node, not the browser.** This measures the ENGINE. The Perspective figures
  beside it are end-to-end through a worker and a proxy session, so they include
  transport this does not. What the comparison settles is whether the compute is
  anywhere near the bottleneck — it is not.
- The first version of this benchmark reported a sort as **0.8 ms**, because the
  engine caches a materialised index per query shape and every repeat after the
  warm-up was a cache hit. Every cold case now perturbs its request per
  iteration. If you add a case, do the same or you will measure the cache.
- The quick filter at 39 ms is the one number that is not cheap: it builds a
  concatenated haystack per row across 19 string columns. Worth a per-column
  dictionary scan if it ever matters — the dictionary already makes that
  possible.

## Correctness

150 tests, of which the important ones are the two **differential fuzzes**:
`engine.fuzz.test.ts` (250 mutation frames plus a churn run, comparing every
query shape against a deliberately stupid brute-force oracle built from plain
objects) and `worker/deltaPath.fuzz.test.ts` (260 frames through the whole push
path — see below).

That harness exists because of a documented failure on this project. A
hand-rolled columnar SSRM engine was evaluated here and had three critical
defects, **all in its optimised paths and none of them loud**: a removal-only
frame that skipped compaction served ghost rows forever; an aggregation fast
path missing its membership guard let a filtered-out row corrupt a group's sum;
an anti-drift recompute that ignored pending work was off by 1.65M by frame 436.
Its own smoke test printed identical ticks with those defects present and fixed.

### What the fuzz has caught, in order

- a **descending sort putting nulls first**, because the direction multiplier
  was being applied to the null verdict. On a price column that puts "no quote"
  above the best bid;
- a **tie-break disagreement** on frame 1, which turned out to be the oracle's
  fault rather than the engine's — the engine ties on original row order, which
  is what AG's client-side model does;
- **the same bug again, in the NaN branch** — found the frame after NaN was
  added to the tick generator. The fix above moved the NULL verdict above the
  direction multiplier and left the NaN verdict inside `compareValues`, where
  `cmp * dir` still inverted it, so a NaN price sorted FIRST on a descending
  sort. NaN is not null (the store keeps it, `blank` does not match it, an
  aggregate skips it) but it has no position on the number line, so it belongs
  with the nulls: last in both directions. A fix that does not generalise is a
  bug that comes back in the branch nobody re-read;
- **removals that removed nothing.** The pump sent a transaction's `remove` as
  bare keys. AG 36 resolves them with
  `transaction.remove.map((data) => idFunc({ data }))` — every entry is ROW
  DATA — so `makeSsrmGetRowId` read `data[keyField]` off a string, produced
  `"undefined"`, matched no node, and left every deleted row on screen until its
  block was re-read. `rowPump.test.ts` asserted `['X', 'Y']` and passed
  throughout: a green unit test pinning a spelling the grid does not have, which
  is a trap the parity worklog records twice;
- **a viewport narrowed on one side of the write.** See below. Both of the last
  two were found by the delta-path fuzz within a minute of it first running, and
  neither would have shown on screen as anything but a stale-looking blotter.

### Calculated columns are inside the same fuzz — and it found nothing

The mutation loop in `engine.fuzz.test.ts` now installs **three freshly
generated expression trees per frame** — 750 shapes over 250 frames, over a book
being mutated underneath them — and compares **every calculated cell of every
returned row** against a tree-walking oracle written from `evalOps.ts`, the
module the grid's own `valueGetter` calls. One run makes **~30,000 cell
comparisons**, and a counter asserts they happened: a run in which every column
was refused would pass everything and check nothing.

**It found no defect in the evaluator, and that is stated rather than left to
imply.** Everything the session cost was spent on the two things below.

The pools are chosen so the named cases are reached rather than hoped for:
`qty` is null ~10% and can be exactly 0, `px` is null ~15% and NaN ~4% of ticks,
a literal `0` divisor is always in the pool, `nope` is a column the book does
not have, and the string columns meet the numeric ones under `+` and `CONCAT`. A
second assertion covers the case a fuzz would otherwise miss entirely: **a row's
calculated value must not change when a filter does**, checked by reading the
same row under the filtered and unfiltered requests — if stamping ever read the
wrong offset, a filtered read is where it would show, because the index is a
different permutation of the same book.

**What the fuzz DID catch was its own first draft.** The generator emitted
`MIN([px], [qty])`, the compiler refused it as cross-row, the column was never
stamped, and every comparison became `undefined` against `undefined` — 30,000
assertions that could not fail. The refusal is right and the generator was
wrong; the reducers are now excluded from generation with a comment saying why,
and refusals are asserted explicitly in `calc.test.ts` instead.

**The fuzz was then MUTATION-TESTED, which is the part that establishes it can
fail.** Eleven deliberate bugs were put into the evaluator one at a time:

| bug | |
|---|---|
| `x / 0` answers `Infinity` | caught |
| NaN made falsy | caught |
| `IF` switched to `isTruthy` | caught |
| `IFS` switched to JavaScript truthiness | caught |
| `==` made loose | caught |
| `+` coerces both sides to `Number` | caught |
| `AND` answers a boolean instead of the operand | caught |
| a missing column reads `undefined` instead of null | caught |
| **an expression producing NaN stamped as null** | caught |
| `-0` collapsed to `0` | caught |
| the `+` string branch DELETED | **survived — and it is not a gap** |

**Session 5 put the calculated columns into the QUERY SHAPES too — and this
time the fuzz found three defects.** The generated expressions are now sorted
by, filtered on, grouped by and aggregated, against an oracle that stamps the
same expressions onto plain rows and then runs the filter, sort and bucket code
it has always run. Two of the three are not specific to calculated columns at
all; they were simply unreachable until an expression could produce the values
that trigger them.

| found | what it was |
|---|---|
| frame 0 | **an aggregate COERCED a non-number instead of skipping it.** AG's own `aggSum`/`aggMin`/`aggMax` require `typeof value === 'number'`, so a boolean, a string or a Date contributes nothing to a total on the client-side row model. This engine read `rawAt`, so a calculated boolean column summed to the count of its TRUE rows — and a stored STRING column summed its dictionary CODES, which was reachable the whole time by dragging a text column into the values panel |
| frame 11 | **Kahan compensation poisoned a whole group once a non-finite value entered it.** `Infinity - 0 - Infinity` is NaN, and every subsequent `value - compensation` inherits it — so one `x / null` anywhere in a group turned the total into NaN and kept it NaN even after the Infinity was cancelled out. Also reachable on a stored column: a feed can send one |
| mutation testing | **group rows still had their own comparator**, with the direction multiplier applied to an unorderable verdict. A NaN group key is neither `===`, nor `<`, nor `>`, so it fell through to `1 * dir` and sorted FIRST on a descending group. This is rule 10 exactly — the leaf sort was fixed for this twice and the group path, which shares the reasoning, was never re-read. It survived every value comparison in the suite and was found only by putting the old comparator back |

**Sixteen deliberate bugs, all caught.** Every path session 5 added was
mutation-tested by a throwaway script that edits the source, runs the suite, and
requires it to go red: the sort skipping a calculated column (the session-4
behaviour), the absent verdict multiplied by the direction, a NaN counting as
blank, a NaN made orderable, an aggregate zeroing a NaN, aggregation dropping a
calculated value column, the filter skipping one, grouping reading the store
instead of the resolver, a tick re-stamping everything, a tick re-stamping
nothing, a write not invalidating the value cache, the decorated sort key built
over the wrong rows, the group comparator reverted, a calculated column losing
to a store field of the same name, the Kahan guard removed, and the aggregate
coercion restored. **16 caught, 0 survived.**

Three counters make the new paths non-vacuous, because a sort that did nothing,
a filter that excluded nothing and a group of one bucket all agree with the
oracle trivially — which is precisely the state the engine was in before this
session. The run asserts each was seen to change the answer on 50+ frames. The
first version failed that assertion at 29 frames for the filter, correctly: the
generated expressions are mostly booleans and strings, so a numeric threshold
kept everything or nothing. A deterministic `[qty] % 3` column was added beside
the generated ones rather than the threshold being lowered.

The session-4 survivor is worth the line. Deleting
`typeof left === 'string' ? \`${left}${right}\`` leaves
`(left as number) + (right as number)`, and a TypeScript cast is erased at
runtime — so `'FX' + 4.5` is still `'FX4.5'`. It is a semantically equivalent
rewrite, not a mutation, which the sharper version (`Number(left) + Number(right)`)
confirms by being caught immediately.

### The CSRM twin, row by row — 520,000 cells

`scripts/calcTwinProbe.mjs` is session 4's pass condition and it is a
differential against the real thing rather than a plausibility check. The
control is `@starui/engine`'s own `ExpressionEngine`, evaluating the same parsed
AST over plain row objects, called exactly the way `buildVirtualColDef`'s
`valueGetter` calls it — including its try/catch, because reproducing that is
the difference between measuring the grid and measuring an idealised version of
it. Everything real is imported: the book is the lab's Stress book (20,000 x
121) and the expressions are the lab's seeded curriculum, authored strings
parsed by the real `tokenize`/`parse`.

```
node node_modules/tsx/dist/cli.mjs \
  packages/react-grid/ssrm-engine/scripts/calcTwinProbe.mjs
```

| | |
|---|---|
| seeded expressions compared | 10 of 11, every row identical |
| adversarial expressions compared | 16, every row identical |
| **calculated cells compared** | **520,000, zero disagreements** |
| `calc_liquidityScore` (`LOG10`) | refused here; **the twin is null on all 20,000 rows too** |

**Session 5 added the other half: does the engine DO with those values what a
grid holding them would do?** Five columns are sorted both ways, filtered at
their own median and grouped, and the control is the twin's value per row.

| | |
|---|---|
| sort, both directions, per column | every row in the twin's order, ties broken on original row order |
| null / NaN rows | 52 per column, **last in both directions** |
| filter at the median | 3,072-9,999 rows, exactly the set the twin's values imply |
| group | 3 and 4 buckets, every child count identical |

**Where AG is the authority and where it deliberately is not, stated rather
than blurred.** For two PRESENT values the rule is AG Grid's own
`_defaultComparator`, reproduced from its source — which is also why a MIXED
string/number pair ties here (both `>` and `<` are false) instead of being
forced into an order. For an ABSENT value it is not: AG's comparator answers -1
for a null and the grid then multiplies by the direction, so on the
client-side row model **nulls sort FIRST ascending**. This engine puts null and
NaN last in both directions, which session 3 settled after a NaN price sorted
above the best bid. The probe asserts that divergence rather than hiding it
inside a comparator that quietly agrees with itself.

Four mutations were put in to prove it can go red — the sort skipping a
calculated column, the filter skipping one, the absent verdict multiplied by the
direction, and grouping resolved from the store — and each turns it red at a
named row (`row 0: engine POS-0 (null), twin order says POS-97 (0)`), with the
restored build passing.

Its first draft REFUSED TO REPORT for a reason that was its own fault: it
demanded null or NaN rows of every column under test, and `calc_pnlTotal` has
none, because `[a]+[b]+[c]` over nulls is a NUMBER in JavaScript. That is worth
knowing on its own — **an arithmetic expression over a missing quote produces a
confident zero, not a blank, on both surfaces**. The rule now has to be
exercised somewhere rather than everywhere.

**The adversarial group exists because of a measurement, and this is the useful
part.** The first version ran the seeded curriculum alone, reported 200,000
identical cells, and was then mutation-tested — and **two core mutations
survived it**: `x / 0` answering `Infinity`, and NaN made falsy. Neither is
observable through the curriculum. Every division in it is by a literal (`/ 100`,
`/ 1000000`) or sits inside an `IF(... > 0, ...)` guard whose result is
discarded on exactly the rows where the divisor is zero, and every condition in
it is already a comparison, so a NaN never reaches a truthiness test. **The
curriculum agreeing proves the curriculum agrees and nothing about the rules
underneath it.** Sixteen ordinary expressions were added to reach them, and both
mutations are now caught at named rows.

The probe REFUSES TO REPORT rather than pass when it could not have failed: if
fewer than the whole book was read, if any expression compared zero rows, if
none of the injected null/NaN/zero rows were among those compared, if any
column read the same value on every row (a constant column agrees with
anything), or if `IF` and `IFS` agreed everywhere — which would mean no NaN
reached a truthiness test, the exact hole that let the second mutation survive.
The generated stress book has no nulls, no NaN and no zeros, so a deterministic
bad tick is applied to every 97th row first.

One reporting defect was found and fixed on the way: `JSON.stringify(Infinity)`
and `JSON.stringify(NaN)` both answer the STRING `"null"`, so the first
divide-by-zero disagreement it caught printed as `engine null vs twin null`. A
diagnostic that misdescribes the failure it just caught is worse than none.

### The delta path is fuzzed as a path, not as an engine

Sessions 1 and 2 put three lossy stages between a write and the screen — the
port, the viewport narrowing, the pump — and the engine fuzz watches none of
them. `worker/deltaPath.fuzz.test.ts` runs 260 frames through all of it: a real
`MessageChannel` (which is what a SharedWorker port is), the real host, the real
client, the real pump, into a grid model built from **AG 36's own transaction
code** rather than from what the pump happened to emit. One window writes,
another is the grid, and the frames are adversarial on purpose — removal-only
frames, keys re-added from a graveyard, ticks landing on filtered-out rows, NaN,
sort keys changing under an active sort, and bursts of two or three writes
between flushes.

One run: 3,197 patch rows received, 1,130 applied, 1,828 dropped, 101 removed,
892 flushes of which **758 stopped on the slice budget**, and 17,166 row-vs-book
comparisons.

**What it may assert is the interesting part.** The pump DROPS a patch for a row
AG does not hold, deliberately, so the comparison is over the rows the grid
HOLDS and never over the book — getting that wrong makes a correct engine look
broken. The viewport is the second honest loss: a row in AG's block cache but
outside the declared range is not sent, by design, so those are tracked and
excluded — from the ENGINE's own `visibleKeys`, never from what the host chose
to send, or the oracle could not catch the host sending too little. A counter
asserts that 2,000+ comparisons actually happened, because a run in which every
held row was excused would pass everything above and check nothing.

Reverting either fix it found turns it red at a named frame with the row, the
field, both values and whether the row was in view before and after the write:
the removal payload at `frame 7 flat: ghost row r31`, the narrowing at
`frame 26 sorted: r291.px is 108.18, book says 159.15 (in view before the write:
true, after: false)`.

**And it found nothing wrong with the engine's own incremental path.** That was
the expected result — aggregation is a full pass and the index cache is cleared
wholesale, so there is no state to get out of step — but it is worth saying
plainly rather than letting a green run imply more than it proved.

The worker path is tested over a real `MessageChannel`, which is what a
SharedWorker port is — no worker is needed to prove any of it, and needing one
would have left it untested. Every case in `worker/rpc.test.ts` is a way a reply
can go MISSING, because across a port that is the failure that matters: a
handler that throws, one that rejects, one that never answers, a result that
will not clone, params that will not clone, a reply that arrives after its
timeout, and a disposed client. Each asserts the promise settles; what it
settles with is secondary. `asyncDatasource.test.ts` does the same for AG's
callback, including the one that is easy to get backwards — a source that
answers AFTER the block timed out must NOT then be handed to a grid that was
already told it failed.

Aggregation is a **full pass over the level's members**, not incremental. That
is a deliberate trade and the reason the three defects above cannot recur: there
is no state to get out of step. It costs single-digit milliseconds here. If a
book ever makes it matter, the incremental version goes behind that fuzz — and
note `min`/`max` are not reversible, so "just subtract" has no counterpart for
them.

## Calculated columns — the evaluator

An expression is compiled ONCE into a closure `(offset: number) => unknown` over
the columnar store. The tree is walked at compile time; a `[px]` reference
resolves to that column's reader then, so evaluating a cell is a chain of direct
calls over typed arrays with no dispatch on node type and no lookup by field
name. A per-cell tree walk would give back exactly what the columnar store buys.
**MEASURED that it is a compiled closure and not a walk**, by wrapping the AST in
a counting Proxy: 5,000 cells cost **0 reads of the tree** after compilation.

**A row offset, not a row object**, and that is the shape session 5 needs:
sorting, filtering, grouping and aggregating a calculated column all mean
"evaluate it for these offsets", which is this closure called over an index.
Had it taken a row object, feeding `materialise` would have meant building
20,000 row objects to sort one column.

### No second language, and no second parser

`tokenize` and `parse` are `@starui/engine`'s and stay there. The customizer
already emits that AST, `ssrmExpressionCompile.ts` already compiles it to
Perspective's expression language, and this is a THIRD BACKEND for the same
tree.

**The AST is taken structurally rather than imported, and the alternatives lose
for different reasons.** A compiled closure is not merely undesirable, it is
impossible: the value has to be produced where the BOOK is, which is a
SharedWorker, and a function is not structured-cloneable. Importing
`@starui/engine` is legal under `docs/ARCHITECTURE.md` — it sits below the grid
packages — and costs a bundle: it is the grid platform behind one entry, with
`zustand` and `ssf` as dependencies and three `ag-grid-*` peers, dragged into
worker entries that today have **zero runtime dependencies** and into
`host-data`'s data-services worker, which injects the engine precisely so a
worker that never opens a blotter does not carry it. The AST is plain data, so
it clones; `client.setCalcColumns` puts one on a real `MessageChannel` in
`worker/host.test.ts` and asserts the value that comes back, because a refused
structured clone is silent at the sender.

### Nulls: this engine is JavaScript, because the grid is

The values a calc column shows on the client-side row model come from
`@starui/engine`'s `evalOps.ts`. Everything here is written to those rules
operator for operator — which surface holds the book has to be invisible.

**`null > 95` is FALSE in JavaScript and TRUE in Perspective's expression
language, and the same authored rule painted different rows on the two
surfaces.** That is recorded on the parity path and it is why this is stated
rather than assumed. null coerces to 0 in a relational comparison, so:

| | |
|---|---|
| `null > 95` | **false** |
| `null > -1` | **true** — the half that surprises people |
| `null >= 0` | true |
| `null == 0` | **false** — `==` is `===` |

"Nulls never match a comparison" is the wrong summary of the rule.

**Three places the grid is not plain JavaScript, copied anyway:**

1. **`x / 0` is `null`, not `Infinity`** — `applyBinary` guards it. But `x /
   null` is NOT guarded (null is not `=== 0`), so it answers `Infinity`. Divide
   by zero and divide by an absent value differ, and both are fuzzed;
2. **`isTruthy(NaN)` is TRUE.** The falsy set is exactly
   `null | undefined | false | 0 | ''`;
3. **`IF` and `IFS` disagree about NaN.** `IF` is an ordinary function whose
   body is `cond ? t : f`, so it uses JavaScript truthiness and answers the
   false branch; `IFS` calls `isTruthy` and answers the first. Reproduced, not
   tidied — tidying it would make this engine disagree with the surface beside
   it.

### NaN is a value; an expression that produces one keeps it

Session 3 settled what NaN is here and nothing weakens it: the store keeps it,
`blank` does not match it, an aggregate skips it, and it sorts with the nulls
because it has no position on the number line — last in BOTH directions.
**`SQRT(-1)` is stamped as NaN, never folded into null.** A null means "no value
here", so a cell that renders blank because an expression went wrong is
indistinguishable from a genuine absence — the same ambiguity the skeleton
renderer was built for on the other path. A NaN is visibly a NaN, sorts where an
unorderable value belongs, and is skipped by an aggregate: three behaviours a
null would get wrong.

### Errors never reach a block read

Every `getRows` settles exactly once, so a calculated column that throws inside
a block read does not blank a column — it WEDGES THE GRID (`outboundRequests` is
grid-global, limit 2, and purging does not recover it). Two guards, matching the
convention `buildColumnDefs` already set:

- **a compile failure falls back to the FIELD BINDING.** The column is not
  installed, so a returned row keeps whatever the store holds under that name;
- **a runtime failure falls back to the field VALUE**, per cell, caught by ONE
  try/catch at the top of the column rather than per node, and warned once per
  expression rather than once per row.

Two conventions exist in this repo and they differ. `buildColumnDefs` falls back
to the field and warns; `buildVirtualColDef` — the calculated-columns module,
and therefore the CSRM twin this is measured against — returns **null silently**
for both. They coincide for every genuine calc column, because a colId like
`calc_pnlTotal` names no field and the field binding IS null; they differ only
for an expression whose colId OVERRIDES a real column, where this engine shows
the underlying value. The louder one is chosen on purpose.

**`console.warn` in a SharedWorker reaches no console anywhere**, so a
warn-once that only warns is invisible in the topology this engine runs in.
Every diagnostic is also retained: `engine.calcDiagnostics()` /
`client.calcDiagnostics()` answers refusals, runtime failures and columns an
expression named that the book does not have, each with a hit count. That is
what makes "the column compiled" an assertion a probe can fail on.

### What is REFUSED, and why refusing beats answering

A refusal is loud and falls back; a wrong answer is neither.

- **a cross-row reducer over a bare column.** `SUM`, `COUNT`, `AVG`, `MIN`,
  `MAX`, `MEDIAN`, `STDEV`, `VARIANCE` and `DISTINCT_COUNT` are marked
  `aggregateColumnRefs` upstream: given a direct `[col]` argument they expand it
  to EVERY ROW from `ctx.allRows`, which the calculated-columns module supplies
  from `api.forEachNode`. There is no honest per-offset equivalent — "every row"
  against a server row model means the FILTERED BOOK, which depends on the
  request rather than the row. Answering it row-wise is the trap the parity
  worklog already records once: `avg("col")` in Perspective is row-wise, parses,
  never errors, and makes `"col" > avg("col")` false for every row, silently. A
  COMPUTED argument is not refused — `MAX([bid] * 1, [ask] * 1)` is row-wise on
  both surfaces;
- **`NOW` / `TODAY`** — they answer the wall clock, so the same expression over
  the same book differs per read and cannot be compared to the surface beside
  it. Session 5 has to decide whether calc values are materialised; a value that
  goes stale on its own would make that decision meaningless;
- **any other unknown function, by name.** Which turned up a finding: the lab's
  own seeded curriculum authors `LOG10([avgDailyVolume30d])` and **`LOG10` does
  not exist in `@starui/engine`** — so on CSRM `buildVirtualColDef` catches the
  "Unknown function" and returns null for every row, silently. That column has
  been rendering blank. It is refused here with the function named, which is how
  it was noticed;
- **`.old` / `.new` column refs, `data` / `row` / `oldValue` / `newValue`, and
  member access** — the book holds current values only and is flat and columnar;
  there is no row object to hand an expression.

A column the expression names that the book does NOT have is **not** an error:
it reads null, exactly as `resolveColumnRef` does on the grid. It is counted and
named anyway, because a column of nulls produced by a typo looks exactly like a
column of genuine nulls.

### A calculated column behaves like a real one

`sortIndex`, `compileFilter` and `aggregateMembers` each opened with the same
line: skip a column the store does not have. A calculated column is not a field,
so a sort, a filter or an aggregation on one was a **silent no-op** — no error,
no effect, and a grid that looked like it had ignored the click.

**One accessor, not three, and that was the decision rather than the default.**
`columnAccess.ts` resolves a column id to five reads (`isNull`, `numberAt`,
`numberOrNull`, `stringAt`, `valueAt`) plus an `orderKey`, and answers a store
column and a compiled expression identically. Sort, filter, aggregate, group,
pivot, the ancestor predicate and distinct values all go through it and none of
them can tell the two apart. Three parallel "if it is calculated, do this
instead" branches would have been a smaller diff and the wrong shape: the rule
this repo has already paid for is that **a fix has to generalise to every branch
that shares its reasoning**, and the fourth call site then has to remember to
grow a fourth branch. Adding calculated columns to pivot and to set-filter
values afterwards was one line each, which is the property being bought.

`orderKey` is where the null rule lives, once. A cell with no position on the
number line — null, undefined, or NaN — answers `null`, and `compareOrderKeys`
puts a null key LAST IN BOTH DIRECTIONS without ever multiplying it by the sort
direction. There is one comparator in the package.

**A calculated column also TICKS now.** `host.publish` still broadcasts the
writer's sparse patch — the two cells that moved, not the row, because
re-reading 200 rows to broadcast 400 changed cells would be 24,200 values five
times a second per window — but `engine.calcPatch` adds back exactly the
calculated cells whose inputs that frame names. Not all of them: `calc.ts`
records the fields each expression READS, and a cell AG is told changed flashes,
so re-stamping a P&L total on a tick that did not move it is a lie the user can
see. It is stamped once above the per-port loop, since the values are the same
for every window.

### Materialise or compute per read — decided, with both sides measured

Session 4 measured the per-read side and deliberately did not choose. Both sides
are now measured on the same book (`benchProbe.mjs`, 20,000 x 121, four
calculated columns), and **the answer is neither of the two options the question
was posed with.**

The measurement that decided it: a sort evaluates the key **twice per
comparison**, and a sort of 20,000 rows on a key with no ascending runs in it
performs **254,515 comparisons** — half a million evaluations to order 20,000
distinct values.

| | naive per read | + per-generation cache | + decorated sort key |
|---|---|---|---|
| SORT, this book's structured key | 5.8 ms (1.7x) | 4.6 ms | **3.5 ms (1.0x)** |
| SORT, a SCATTERED key | 34.0 ms | 16.0 ms | **11.0 ms** |
| FILTER | 2.9 ms (2.4x) | 1.8 ms | **1.7 ms (1.5x)** |
| GROUP + aggregate | 11.0 ms (4.9x) | 4.9 ms | **4.0 ms (2.5x)** |
| block read, 400 calculated cells | 0.2 ms | 0.1 ms | **0.1 ms** |

against the stored-column baselines of 3.3 ms, 1.2 ms and 1.6 ms, and against
what MATERIALISING would pay instead: **11.3 ms per full snapshot** (4 columns x
20,000), **0.1 ms per 200-row tick** — which doubles a tick, itself 0.1 ms — and
**625 kB** of `Float64Array` for four columns.

**Decided: computed per read, with a per-generation value cache and a decorated
sort key. Not materialised into the store.** The reasoning, in order:

1. **it is close on the read side, and that is said plainly.** 1.0x, 1.5x and
   2.5x, all single-digit milliseconds. Materialising buys at most ~2.4 ms on a
   grouped read of this book. The engine's headline is a 3.1 ms block read
   against Perspective's 119-145 ms, so the compute is not the constraint;
2. **so the tie-break is correctness, and only one option can be wrong.** A
   materialised value has to be re-derived on exactly the writes that touch its
   inputs, and getting that wrong is a silently stale column — the failure mode
   this engine's aggregation is a deliberate full pass to avoid. The cache here
   carries a write stamp that is compared on **every** read, so a write
   invalidates every cached cell by incrementing one number. It cannot go stale;
3. **it costs nothing on a book nobody queries.** A calculated column is
   evaluated only for the offsets something reads, where materialising pays for
   the whole book on every snapshot.

**What would move it:** a sort that a user waits on for more than ~100 ms, which
at this cost curve is a few hundred thousand rows on a scattered calculated key,
or an expression far more expensive than these (a `REGEX_MATCH` chain). At that
point materialise — and it goes behind the same fuzz as session 7's incremental
index, for the same reason.

**Two caveats on the numbers above.** The generated book is a sawtooth, so V8's
TimSort finds long runs and settles a sort in **31,692 comparisons against
254,515** for a scattered key; the ratios are like-for-like but the absolute
sort figures are a floor, which is why the scattered case is measured beside
them. And the decorated key is deliberately NOT built for a stored column — the
key there already is a typed-array index, the cheapest read in the engine — nor
for `lowerBound`, which is one binary search and would be building a
20,000-entry array to serve fifteen comparisons.

### What it cost the read path

MEASURED with `scripts/benchProbe.mjs`, 20,000 x 121, four calculated columns
(a three-column sum, a guarded division, a nested `IFS`, a string `CONCAT`),
two runs agreeing:

| | |
|---|---|
| block read, warm index, no calculated columns | 0.7 ms |
| block read, warm index, 4 calculated columns | 0.9 ms |
| => 400 calculated cells on one block | **~0.2 ms** |
| the closures alone, 80,000 cells | **11.4-11.8 ms** (~145 ns/cell) |

A WARM index on both sides, deliberately, and that is not the cache trap this
file warns about elsewhere: a calculated value is not cached at all — it is
recomputed on every read, which is the property being measured — so holding the
index warm ISOLATES the calc cost instead of burying it under a 5 ms
re-materialisation whose run-to-run spread is larger. The first version of this
measurement subtracted two COLD medians and reported 1.4 ms for 400 cells, which
is 3.5 us per cell and was noise.

**The browser boundary did not move.** `workerBoundaryProbe`, interleaved
baseline and `?engine=ssrm&calc=1` runs against one production build:

| | block round trip, median |
|---|---|
| no calculated columns | **2.40 ms**, 2.40 ms |
| four calculated columns (125 columns per row) | **3.00 ms**, 2.60 ms |

0 failed, 0 timed out, 0 late and 0 pending in all four runs. Today's baseline
reads 2.40 ms where sessions 3 and 4 read 2.10 ms, so the ~0.2-0.6 ms the
calculated columns add is quoted against the baseline taken beside it rather
than against the older figure. It is the right size: ~0.2 ms of evaluation for
400 cells plus four more columns to structured-clone per row.

`browserSmokeProbe` reads **1,887-1,981 ms to first row and a 65-74 ms sort**,
with and without the calculated columns, and 125 columns in a returned row
confirms they were installed rather than quietly refused.

**One withdrawn reading, recorded because it looked like a finding.** The first
calc-enabled runs read **12,620-12,661 ms** to first row against 1,869 ms for
the baseline, twice each — which reads as a 6x regression on the calculated
path. Interleaving the two URLs in one series showed the plain baseline reading
**12,715 ms** and the calculated run **1,925 ms** in the same series: the metric
is bimodal on identical code, the same artifact already documented for
`providerBookProbe`. Two consecutive runs of one configuration is not a control.

## What IS here

- the full `IServerSideGetRowsRequest` contract: `startRow`/`endRow`,
  `sortModel`, `filterModel`, `rowGroupCols`, `valueCols`, `groupKeys`
- filters: text, number, date, set, `blank`/`notBlank`, compound AND/OR
  conditions, and the multi-filter wrapper — with AG's null semantics, where
  **only `blank` matches a null**
- multi-column sort, nulls last in both directions, stable tie-break
- grouping to any depth, null buckets included, with child counts and
  path-based identity (`SSRM_GROUP_PATH` — a leaf key collides across groups and
  AG discards the block, warn 205)
- aggregations: `sum`, `min`, `max`, `avg`, `count`, `first`, `last`, with
  Kahan-compensated summation and nulls skipped rather than counted as zero
- grand total over the filtered book; leaf count ignoring grouping
- quick filter across configurable columns
- set-filter distinct values, which REFUSE above a ceiling rather than
  truncating
- sparse upsert by key, remove, snapshot-replace, and a delta of changed and
  removed keys for the push path
- `lowerBound` for incremental re-positioning under sort
- `createSsrmDatasource` — the AG boundary, owning the rule the engine cannot:
  **every `getRows` settles exactly once.** `outboundRequests` is grid-global,
  decremented only in success/fail, default limit 2, so a datasource that throws
  without calling back wedges the grid permanently
- `makeSsrmGetRowId` — path-based ids for group rows, leaf keys for the rest
- **pivot mode**: `pivotCols` x `valueCols` per group, with the generated field
  names returned as `pivotResultFields` so AG can build its secondary columns.
  The separator must match the grid's `serverSidePivotResultFieldSeparator` — a
  mismatch does not error, it carves the name in the wrong place
- **tree data**: `treeFields` stands in for `rowGroupCols`, which AG does not
  send in tree mode, and parent rows carry `SSRM_TREE_KEY` / `SSRM_TREE_GROUP`
  because AG reads the hierarchy off the DATA. An explicit `rowGroupCols` wins.
  Both pivot and tree are in the differential fuzz as of session 3: a pivot
  level is checked cell by cell against an independently computed combination
  set, and a tree level against the equivalent GROUP level plus the markers,
  including that a leaf row does not claim to be a parent
- **worker hosting** (`@starui/ssrm-engine/worker`): a `{id, method, params}` /
  `{id, ok, result | error}` wire with one in-flight map per port and a timeout
  that FAILS a call rather than leaving it pending; `serveSsrmEngineWorker`,
  hosting one engine per book id and retiring a book with its last client;
  `SsrmEngineClient`, the same surface asynchronously, with a live mirror of the
  book size and a subscription to pushed writes; and
  `createAsyncSsrmDatasource`, which is where "every `getRows` settles exactly
  once" becomes load-bearing rather than defensive
- **per-subscriber viewport push** — `client.setViewport({request, startRow,
  endRow})`, `engine.visibleKeys`, and a host that narrows each tick to what
  that window can see. Grouped requests fall back to the whole patch, and
  removals are never narrowed
- **`createSsrmRowPump`** — per-frame conflation keyed by row id and a
  `sliceBudgetMs` time slice, with the grid typed structurally so this package
  still holds no AG Grid import
- **a refcount that survives a hard kill** — a `pagehide` beacon plus a client
  heartbeat and a worker-side `sweep()`, because a SharedWorker port has no
  disconnect event
- **`client.introspect()`** — books, clients, viewports and the reaper's count.
  The thing that makes a multi-window sharing claim falsifiable
- **a provider-driven book** — `@starui/host-data`'s `./runtime/ssrm`
  (`createSsrmBookFeed`, `createSsrmHost`) and the hub's `ssrm-attach`, with the
  engine injected so host-data gains no dependency on this package
- **calculated columns, as REAL COLUMNS** — `engine.setCalcColumns(defs)` /
  `client.setCalcColumns(defs)` taking StarUI expression ASTs, compiled once per
  expression to a closure over the columnar store; `engine.calcEvaluator(colId)`
  for the per-offset closure, and `calcDiagnostics()` for refusals, runtime
  failures and named columns the book does not have. **The AST is the only thing
  that crosses the port** — see the section above for what that decides and what
  it does not. A calculated column can be SORTED, FILTERED, GROUPED, PIVOTED and
  AGGREGATED on, answers a set filter's distinct values, is reachable through
  the quick filter, and TICKS: `engine.calcPatch(rows)` adds back the calculated
  cells a sparse patch made stale, and only those
- **one column accessor for the whole engine** (`columnAccess.ts`) —
  `createColumnResolver(store, calc, version)` answers a store field and a
  compiled expression through the same six reads, and every query path consumes
  it. One comparator, one definition of "no position on the number line", one
  place a calculated column has to be taught about

## What is NOT here

Stated plainly so nobody plans around a gap:

- **the provider feed is proven on a MOCK provider.** `createSsrmBookFeed`
  decorates `ProviderEmit` and is transport-agnostic by construction, and the
  measured run above is the lab's `mock-perspective` provider — which follows
  the same emit sequence STOMP does. It has NOT been run against a live broker
- **the reaper has no browser-level test.** The heartbeat, the `pagehide` beacon
  and `sweep()` are covered by unit tests under an injected clock; nothing yet
  kills a real window and watches the book go. `introspect().reaped` is the
  counter that would show it
- **nothing yet fuzzes a CHANGE of query shape mid-flight.** Both fuzzes rotate
  shapes between frames and purge the grid when they do, which is what AG does
  on a sort or filter change. What is not covered is a write landing while a
  block for the OLD shape is still in flight; `asyncDatasource.test.ts` covers
  the settle-once half of that by construction, not the row-correctness half
- **a calculated column is not editable, and a window that writes does not get
  its own calculated cells back.** `host.publish` skips the port that caused a
  write, because that window has already rendered its own edit — but it has not
  rendered the calculated columns that depend on it, so a window-originated
  `applyUpdate` leaves its own derived cells stale until the block is re-read.
  No live surface does this today (the lab's writes come from the provider
  inside the worker, which has no origin port), so it is recorded rather than
  fixed: cell-edit commit is session 6's, and that is where it should land
- **a calculated column cannot be a TREE field or a `groupKeys` ancestor that
  the request did not group by.** Grouping BY one works, and so does reading its
  children; `treeFields` is a construction option naming store fields and has
  not been exercised with an expression
- **calculated columns are wired to the PLANNER, not to a product surface.**
  `planSsrmCalcColumn(col, { backend: 'ssrm-engine' })` produces a plan carrying
  the AST, `ssrmEngineCalcColumnDefs` collects them, and the lab's Stress tab
  installs four of them on `?engine=ssrm&calc=1`. What does NOT exist is the
  MarketsGrid surface that lets a user author one and see it — that is session
  6, along with set-filter values, status-bar panels, quick search and export
- **the planner does not pre-validate against the engine's refusal list**, and
  that is deliberate. It parses; everything that parses is planned; the engine
  refuses BY NAME and retains the reason in `calcDiagnostics()`. A second copy
  of the refusal list in `@starui/grid` would be a second thing to keep in step,
  and `@starui/grid` does not depend on `@starui/ssrm-engine` today. The cost is
  that an author sees "unsupported" only for a PARSE error; anything the engine
  refuses shows up as a blank column plus a diagnostic
- **the value cache is per WRITE, not incremental.** A write invalidates every
  calculated cell in the book by incrementing one number, so the next read
  recomputes the rows it touches. That is the correct trade at this size and it
  is the same trade the index cache makes; a book where it is not is a book that
  needs session 7
- **`NOW` / `TODAY` are refused**, and every function outside the 45 listed in
  `calcOps.ts`. Refusals are by name and readable through `calcDiagnostics()`
- **no cross-row aggregates.** `SUM([px])` reads EVERY row on the grid and
  there is no per-offset equivalent; that call site is refused rather than
  answered row-wise. See below
- **no incremental index maintenance.** Any write clears the query cache and the
  next read re-materialises. At 20k rows that is 1.5-15 ms; it is the first
  thing to change if a book gets large
