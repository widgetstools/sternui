# Column-window fetching — design

**Status: BUILT — and the measurements this design rested on were WRONG.**

The feature exists, is opt-in and off by default, is unit-tested and has its own
e2e spec (`npm run e2e:perspective-lab`). What did not survive contact with a
clean measurement is the JUSTIFICATION. This document is kept, with the
corrections inline, because the way the premise failed is the useful part.

| claim below | what a clean measurement says |
|---|---|
| `getRows` 5 ms at 40 columns vs **1,420 ms** at 404 | **9 ms vs 123 ms**, feed verified off on both sides |
| "the cost per column is ~28x higher at 404" | ~1.4x — a 14x median gap for 10.1x the AG columns |
| "~96% of every block read is fetched and discarded" | the block payload is **53 and 56 columns**. 368 of the wide variant's 404 AG columns are client-side value getters that are never fetched at all |
| "AG's only remedy is `refreshServerSide({purge:true})`" | `purge: false` re-requests every loaded block, so a widen fills in place and keeps scroll and expansion |
| "pin every column a sort or filter names" | measured unnecessary — a filter, a sort and a `group_by` all resolve against columns the View does not carry |

The full account, including the two probe defects that produced the 284x, is in
the package
[`ARCHITECTURE.md`](../packages/react-grid/perspective-grid/ARCHITECTURE.md),
"The cost is NOT the columns" and "Column-window fetching — built, opt-in, and
off".

**It has now been proved, and the answer is no.** The Stress tab was rebuilt as
50,000 x 120 REAL columns (a provider declaring 121 fields, no value getters), so
the block payload finally matches the column count. Same book, same feed verified
still, window off against on:

| | OFF | ON |
|---|---|---|
| columns in a returned row | **123** | **80** |
| `getRows` median | 8 ms | 8 ms |
| p90 | 16 ms | **44 ms** |

The window does exactly what it was built to do — 35% less payload — and buys
nothing, because an 8 ms read has nothing to give back. The tail is worse with it
on, since a band leaving its pad re-reads every loaded block. **Leave it off.**

---

## The original design follows, unedited except where marked

The next substantial piece of work on `feat/perspective-grid`. It is the single
lever on both remaining problems — read latency and the renderer's memory — and
it is a genuine feature with its own failure modes, not a config change. Read
this before starting; the measurements it rests on are already taken.

---

## Why

A Perspective View carries **every column it was built with**. AG renders about
**fifteen** of the stress book's 400. So roughly 96% of every block read is
fetched, materialized, shipped across the proxy session and thrown away — on
every block, while the user waits.

MEASURED (`scripts/columnCleanCostProbe.mjs`), same 50,000-row book, same
engine, same browser build, same 100-row blocks, flat and ungrouped, ten fixed
row offsets — only the column count differs:

| `getRows`, end to end | 40 columns | 404 columns | ratio |
|---|---|---|---|
| median | **5 ms** | **1,420 ms** | **284x** |
| min | 3 ms | 876 ms | 292x |
| p90 | 49 ms | 2,447 ms | 50x |

Two conclusions, and the second is the one that sizes this work:

1. **The transport is not the bottleneck.** A round trip at 40 columns is 5 ms —
   same proxy session, same awaits, same everything. Nothing here is fixed by
   making the messaging faster or more parallel.
2. **The cost is super-linear in columns.** 10.1x the columns for 284x the time,
   so the cost PER COLUMN is ~28x higher at 404. Narrowing a View does not save
   proportionally — it should save more than proportionally.

The same payload drives the memory: the renderer idles at **1,748 MB** on the
400-column variant against **1,026 MB** at 40, with Chrome killing a renderer
around 4 GB. See the handoff's memory table.

**Scope check before anyone starts.** At 40 columns reads are already 5 ms, so
no realistic blotter feels this today — it is a stress-shaped problem. What
makes it worth doing anyway is the memory, which IS biting (the tab dies with
"Aw, Snap · Out of Memory").

---

## The constraint that shapes everything

**AG Grid's SSRM has no column window.** The entire request
(`iServerSideDatasource.d.ts`) is:

```
startRow, endRow, rowGroupCols, valueCols, pivotCols, pivotMode,
groupKeys, filterModel, sortModel
```

`rowGroupCols` / `valueCols` / `pivotCols` describe grouping and aggregation,
not what is on screen. There is no "columns currently visible" field and no
event meaning "the user scrolled right, fetch these". AG's column
virtualisation is purely a RENDERING optimisation over row data it already
holds.

The consequence is unavoidable and is the whole difficulty: **rows already in
AG's block cache do not contain the columns you scroll into.** AG has no
mechanism to fill in part of a row it already holds. The only remedy is
`refreshServerSide({ purge: true })` — discard every loaded block and refetch.

So the naive version — "fetch exactly the visible columns" — trades a 1.4 s read
for a **full cache purge on every horizontal scroll**, which is worse than
today. The design below exists to avoid that.

---

## Design

### 1. Where the column set lives

`viewManager` already holds two pieces of state that are NOT in the AG request
and that change what a View contains: the quick filter (`setQuickFilter`) and
the calculated columns (`setExpressions`). Both participate in `shapeOf()`, so a
change retires stale Views on the next block rather than deleting Views with
reads in flight.

A column window is the same kind of state and takes the same seam:

```ts
/** Columns the View must carry. Empty means every column, as today. */
setColumnWindow(colIds: readonly string[]): boolean;   // true when it changed
```

- add it to `shapeOf()` alongside `quick` and `exprs`
- `toPerspectiveGroupLevel` sets `config.columns` from it

**`PerspectiveViewConfig.columns?: string[]` already exists** and is already
carried through `viewConfigKey` (`viewConfig.ts:38`, `:514`). Nothing sets it
today. The engine half of this is one field.

### 2. What must be in the window, beyond the visible columns

Getting this list wrong does not fail loudly — it renders blanks or silently
wrong values. Enumerate it explicitly:

- **The key column.** `getRowId` reads `row[keyColumn]`; without it every row id
  collapses and AG discards the block (warn 205).
- **Group columns and every ancestor in `groupKeys`.** Group rows carry
  `__ROW_PATH__` and the level's own column.
- **Value columns with an `aggFunc`**, or the totals row empties.
- **Every column any active sort or filter clause names** — the View cannot
  resolve a clause on a column it does not carry.
- **Every column a calculated-column expression references.** Expressions are
  resolved by the engine against the View's columns.
- **The quick-search columns** while a search is active.
- **`__treeKey` / `__treeGroup`** in tree mode.
- **Every column a `valueGetter` reads.** This is the sharpest hazard: the lab's
  KRD sparkline computes from five fields that are NOT columns of their own
  (`VALUE_GETTER_INPUTS` in `perspectiveProvider.ts` exists for exactly this).
  A value getter reading an unfetched field gets `undefined` and draws a flat
  line — no error anywhere.
- **Every column a conditional-style rule or formatter reads.**

Practical approach: compute the union of "visible ± pad" with a **pinned set**
derived from the above, and treat the pinned set as never-evictable.

### 3. Hysteresis, so a scroll is not a purge

- Fetch **visible ± pad**, where pad is about one viewport's worth of columns
  (start at 25 each side and measure).
- Refetch **only when the visible set leaves the loaded band**, not when it
  changes. Small nudges then cost nothing.
- Debounce the band recalculation the way `blockLoadDebounceMillis` now
  debounces row loads — a fast horizontal fling should produce ONE widen, not
  twenty.
- Source: `api.getAllDisplayedVirtualColumns()`, on `displayedColumnsChanged`
  (`virtualColumnsChanged` is deprecated since v32.2).

### 4. What the user sees during a widen

Blank cells, then values. The machinery landed already: stubs are blank via
`suppressServerSideFullWidthLoadingRow` + the blank `loadingCellRenderer`, so a
widening fetch shows empty cells rather than "Loading...".

### 5. What must NOT be narrowed

- **`readAllRows`** — an export wants every column, always.
- **`countMatching`, `distinctValues`, `countMatchingExpression`,
  `aggregateScalar`** — these already build their own transient Views with
  minimal shapes; leave them alone.
- **`readGrandTotal`** — needs the value columns, which are pinned anyway.

### 6. Rollout

Opt-in, defaulted OFF:

```ts
columnWindow?: { enabled?: boolean; pad?: number };
```

Ship it off, prove it on the stress tab, and only then consider defaulting it on
above some column count (say > 100). A silent wrong value in a blotter is far
worse than a slow one, and every failure mode in §2 is silent.

---

## How to know it worked

The probes exist. Run them before and after:

| what | probe | today |
|---|---|---|
| read cost | `scripts/columnCleanCostProbe.mjs` | 400-col median **1,420 ms**, 40-col **5 ms** |
| renderer memory | `scripts/columnCostProbe.mjs` | 400-col idle **1,748 MB**, 40-col **1,026 MB** |
| whole-process memory under scroll | `scripts/rendererProcessProbe.mjs` | 2.0-2.9 GB |

Success = the 400-column read median moves toward the 40-column band and idle
memory drops materially, **with no blank or stale cells** after horizontal
scrolling, grouping, sorting, filtering, or an export.

**Correctness first, and it needs an e2e spec of its own**: scroll right past the
band, assert real values (not blanks); group and check the totals row; export and
assert every column is present.

---

## One measurement to redo first

The clean read comparison could not certify that live ticks were off: the pause
switch (`data-testid="lab-stream-pause"`) reported `aria-checked` `false ->
false` on BOTH variants, when the 400-column one was expected to start ticking.
Either it was already paused or the attribute does not mean what was assumed.

The conclusion does not rest on it — three runs with differing tick state gave
400-column medians of 1,151 / 1,420 / 3,160 ms against 4-5 ms at 40 columns —
but if this work is going to be justified by a specific multiplier, verify the
feed state properly first (pause via `restartLabProvider(client, providerId,
{ enableUpdates: false })` rather than through the UI switch).
