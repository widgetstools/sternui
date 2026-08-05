# `@starui/ssrm-engine`

A columnar row engine written to AG Grid's server-side row model contract.

**Status: the book lives in a SharedWorker, the engine drives a real AG Grid
from there, and both are measured in a browser. No provider wiring yet — see
"What is not here".**

Run it: build and serve `@starui/perspective-ssrm-lab`, then open the Stress tab
with **`?engine=ssrm`**. `scripts/browserSmokeProbe.mjs` and
`scripts/workerBoundaryProbe.mjs` drive it.

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

80 tests, of which the important ones are the **differential fuzz** in
`engine.fuzz.test.ts`: 250 mutation frames and a churn run, comparing every
query shape against a deliberately stupid brute-force oracle built from plain
objects.

That harness exists because of a documented failure on this project. A
hand-rolled columnar SSRM engine was evaluated here and had three critical
defects, **all in its optimised paths and none of them loud**: a removal-only
frame that skipped compaction served ghost rows forever; an aggregation fast
path missing its membership guard let a filtered-out row corrupt a group's sum;
an anti-drift recompute that ignored pending work was off by 1.65M by frame 436.
Its own smoke test printed identical ticks with those defects present and fixed.

The fuzz has already earned its place twice in this engine:

- it caught a **descending sort putting nulls first**, because the direction
  multiplier was being applied to the null verdict. On a price column that puts
  "no quote" above the best bid;
- it caught a **tie-break disagreement** on frame 1, which turned out to be the
  oracle's fault rather than the engine's — the engine ties on original row
  order, which is what AG's client-side model does.

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
  because AG reads the hierarchy off the DATA. An explicit `rowGroupCols` wins
- **worker hosting** (`@starui/ssrm-engine/worker`): a `{id, method, params}` /
  `{id, ok, result | error}` wire with one in-flight map per port and a timeout
  that FAILS a call rather than leaving it pending; `serveSsrmEngineWorker`,
  hosting one engine per book id and retiring a book with its last client;
  `SsrmEngineClient`, the same surface asynchronously, with a live mirror of the
  book size and a subscription to pushed writes; and
  `createAsyncSsrmDatasource`, which is where "every `getRows` settles exactly
  once" becomes load-bearing rather than defensive

## What is NOT here

Stated plainly so nobody plans around a gap:

- **no provider wiring.** The worker's `openBook` builds the lab's generated
  book; nothing yet feeds it from `host-data`, so `applySnapshot`/`applyUpdate`
  are not driven by a real feed
- **one client, in practice.** The host serves N ports on one engine and the
  tests cover two, but nothing has yet run three windows on one book, and the
  per-subscriber viewport push (each window telling the worker its visible range)
  is not built
- **the pivot/tree fuzz gap.** The differential fuzz covers flat, sort, filter,
  grouping and aggregation. Pivot and tree are covered by unit tests only, and
  the oracle should grow to cover them
- **no calculated columns.** The expression engine is the single largest missing
  piece and was costed at 4-6 person-weeks in the earlier evaluation
- **no incremental index maintenance.** Any write clears the query cache and the
  next read re-materialises. At 20k rows that is 1.5-15 ms; it is the first
  thing to change if a book gets large
