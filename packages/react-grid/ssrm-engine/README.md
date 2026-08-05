# `@starui/ssrm-engine`

A columnar row engine written to AG Grid's server-side row model contract.

**Status: the engine drives a real AG Grid in a browser and is measured there.
It has no worker hosting and no provider wiring — see "What is not here".**

Run it: build and serve `@starui/perspective-ssrm-lab`, then open the Stress tab
with **`?engine=ssrm`**. `scripts/browserSmokeProbe.mjs` drives it.

| in the browser, 20k x 120 | ssrm-engine | Perspective, same tab |
|---|---|---|
| first row painted | **2,326 ms** | 12,000-15,000 ms |
| SORT, first block | **239 ms** | 400-1,100 ms |
| rows after a sort | 20,000 (no collapse) | 20,000 since the grand-total fix |
| pivot, desk x currency | 8 groups, **8 generated columns** | not implemented |

The sort is 239 ms in the browser against 4.4 ms for the same operation in Node.
That gap is not the engine — it is AG purging the store, re-requesting and
re-rendering 120 columns. The Node figures below are a floor, not a prediction
of what a user feels.

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

57 tests, of which the important ones are the **differential fuzz** in
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

## What is NOT here

Stated plainly so nobody plans around a gap:

- **no worker hosting.** The engine is synchronous and in-process. Putting it
  behind a `SharedWorker` + `MessagePort` is the next piece, and is what makes
  the book shared across windows — until then this holds the book in the window,
  which is the memory shape the Perspective path exists to avoid
- **the pivot/tree fuzz gap.** The differential fuzz covers flat, sort, filter,
  grouping and aggregation. Pivot and tree are covered by unit tests only, and
  the oracle should grow to cover them
- **no calculated columns.** The expression engine is the single largest missing
  piece and was costed at 4-6 person-weeks in the earlier evaluation
- **no incremental index maintenance.** Any write clears the query cache and the
  next read re-materialises. At 20k rows that is 1.5-15 ms; it is the first
  thing to change if a book gets large
