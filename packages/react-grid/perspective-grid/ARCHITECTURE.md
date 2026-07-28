# `@starui/perspective-grid` — architecture

Everything here was established by probing `@perspective-dev/client` 4.5.2
directly (`scripts/*.mjs`, `harness/`), not from documentation.

## Why

MarketsGrid on CSRM materializes the whole book in **every** window —
20,000 rows x 52 columns is ~1M cells per blotter, and the hub replays all
20k rows to each new window. That is what makes the 2nd and 3rd blotter
slow to open. Perspective holds the book **once** and serves each window
only the rows it can see.

Measured on 4.5.2 (`viewCostProbe.mjs`), 20k x 52, 500-row ticks:

| live views | ms / update |            | window read | ms |
|---|---|---|---|---|
| 0 | 18.86 |                            | 100 rows @ 0      | 5.65 |
| 1 | 19.20 |                            | 100 rows @ 10,000 | **1.81** |
| 4 | 25.15 |
| 8 | 29.42 |   => base + ~1.32ms/view

Window reads are **flat with scroll depth** — the property CSRM cannot
have. Eight blotters cost ~29ms/tick, inside the existing 200ms throttle.

## Topology

```
STOMP provider ─► Perspective Table ─► View ─► datasource ─► AG Grid
  (host-data, SharedWorker)     │        (perspective-grid, window)
                                └── the seam
```

AG Grid stays the surface: the customizer, cell renderers, conditional
styling and column defs are all built on it. Perspective replaces only the
row-supply engine.

`perspective-grid` must not depend on `host-data`, and `host-data` must not
depend on AG Grid. The Table is the only shared contract, so any provider
gets windowing for free and any consumer (chart, second grid) can open its
own View.

**The Table subsumes the hub row cache.** A new window opens a View instead
of triggering a 20k-row replay, so the late-join cost disappears rather than
being optimized. Push (hub broadcasts rows to N windows) becomes pull (N
views read windows on demand).

## Process split — forced by the runtime

`worker()` throws `customElements is not defined` in a SharedWorker. Read as
"the browser bundle is DOM-coupled" that would rule the worker out entirely —
but the cause is **one unguarded line**. `get_client()` in
`perspective.browser.ts` opens with

```js
const viewer_class = customElements.get("perspective-viewer");
```

a bare identifier that is simply not defined in a WorkerGlobalScope, so the
lookup is a ReferenceError before the `if` is reached. Everything past that
line already falls through to the wasm module `init_client()` stored. Stubbing
`customElements.get` to return `undefined`
(`harness/customElementsShim.mjs`, ~3 lines, a no-op in a window) makes the
whole public API worker-safe, and the host Client can live in the worker after
all. Nothing else is patched.

The topology proven end-to-end in `harness/`:

```
SharedWorker   customElements stub, then @perspective-dev/client/inline
               perspective.worker()          -> the host Client, owns the Table
               client.new_proxy_session(cb)  -> one per attached window
               session.handle_request(frame) <- frames from that window

Window         perspective.worker(port)      -> that window's Client
               client.open_table('blotter')  -> Table -> View
```

`perspective.worker()` in the worker puts the engine in a nested dedicated
worker and returns a Client wired to it; every ProxySession proxies onto that
one Client, so all windows and the feed share one engine and one copy of the
book. The window end is unmodified vendor code: `worker(port)` performs a
`{cmd:'init'}` handshake that must be answered with **exactly one** message
(`_init` resolves on the first message it sees), then raw protocol frames flow
both ways. Frames are `.slice()`d before `postMessage` — they are views over
the wasm `HEAPU8`, which detaches when wasm memory grows.

Control traffic rides a **separate** channel from Perspective frames: the
window keeps the SharedWorker port for control and transfers one end of a fresh
`MessageChannel` for frames. Neither side has to sniff the other's messages,
and a SharedWorker has no visible console, so boot progress is broadcast on the
control port — without it a stall in the worker is an unexplained blank page.

`getCompiledClientWasm()` returns a structured-cloneable `WebAssembly.Module`,
so windows 2..N can be handed the already-compiled module by `postMessage` and
skip both the 5MB transfer and the compile. Not yet used: every window
currently imports the `inline` build, which carries the **server** wasm it never
runs as well as the client wasm it does.

`@perspective-dev/server` hoists to **5.0.0** in this workspace while the client
is pinned at 4.5.2 (the client declares the dep with an empty version range).
The `inline` build embeds its own version-matched server wasm, so going through
it is safe; importing `@perspective-dev/server/dist/wasm/*` directly would pair
a 5.0.0 binary with a 4.5.2 protocol.

## Rules that are not optional

**Never delete a View with a read in flight.** Measured on 4.5.2
(`deleteRaceProbe.mjs`): it throws `attempted to take ownership of Rust value
while it was borrowed` from a wasm-futures microtask. It is **uncatchable** —
neither `try/catch` around the read nor `.catch()` on the delete intercepts
it — and it terminated the Node process. In a SharedWorker that can take down
every blotter. Not fixed since 3.8. All deletion goes through
`createSafeView`, which drains in-flight reads first (`safeViewProbe.mjs`
verifies the mitigation against the real engine).

**Every AG Grid `getRows` must settle exactly once.** `outboundRequests` is
grid-global and only decremented in success/fail, with a default limit of 2 —
two leaked calls wedge the grid permanently and purging does not recover it.
Stale generations and missing views resolve EMPTY, never return early.

**Empty resolutions omit `rowCount`.** Forcing 0 sets `isLastRowKnown` and
caps the store forever ("filter works, sort doesn't"). Shrink via
`success({rowCount})`, never `setRowCount(n, true)`.

**Unmappable filters emit no clause.** Perspective clause lists are
conjunctive, so an OR rendered as AND would silently narrow the book. A
wrong book is worse than an unfiltered one.

**The generation fence must not be bumped by a request-driven View swap.**
`createPerspectiveDatasource` captures the generation at `getRows` entry and
re-checks it after `getView` resolves. If building the View a request asked for
bumps the counter, that request fences ITSELF off and settles empty — the grid
renders blank on first load and after every sort and filter change, while the
log reports the View was rebuilt with the correct row count. So the generation
means "something OTHER than a block request invalidated the View" (schema
change, new calculated columns, a different Table); `createViewManager` exposes
`invalidate()` for that and never bumps on a swap. A block whose View is
replaced mid-flight re-reads from the current View instead: settling short
would cap the store, and AG discards the rows anyway because a sort or filter
change purges the store.

## The real feed, measured

Against the in-repo STOMP view server (`apps/demos/stomp-view-server`,
`ws://localhost:8081`, sparse blotter profile: `rate=7`, `snapshot-rows=20000`,
`live-mode: sparse`, `updates-per-tick: 100`). Probes:
`scripts/stompFeedProbe.mjs` (load shape) and `scripts/stompSchemaProbe.mjs`
(type stability over the whole snapshot).

| | measured |
|---|---|
| Snapshot | 20,000 rows in 400 batches of 50 — **18.4 s**, 23.5 MB, 1,175 B/row |
| Row width | **52 columns** — 21 string, 13 integer, 18 float, no nesting (`slim`) |
| Live frames | 5.13/s, mean gap 194 ms, p95 **521 ms** |
| Live rows | ~100 per frame (65–134), **514 rows/s** |
| Live payload | **4.18 of 52 fields per row** (sparse partial deltas), 46.7 KB/s |
| Churn | 13,037 distinct rows touched in 41 s |

Two things follow. First, the harness mock (500 rows / 200 ms = 2,500 rows/s,
full rows) is **~5x heavier than production** — the Milestone 1 numbers were
conservative, not optimistic. Second, the **18.4 s snapshot is the real prize**:
under CSRM every window pays a full replay of it, while a worker-held Table
pays it once and every later window opens against a Table that is already
loaded.

### Schema: sampling row types is unsafe

Perspective needs one declared type per column up front and silently COERCES
anything that disagrees — a float arriving in an `integer` column is
truncated, not rejected. Scanning all 20,000 snapshot rows rather than a
sample:

| column | integer rows | float rows |
|---|---|---|
| `totalValue` | **1** | 19,999 |
| `averagePrice` / `currentPrice` | **2** | 19,998 |
| `accruedInterest` | 192 | 19,808 |
| `dv01` / `pv01` / `cs01` | ~200 | ~19,800 |

A sampler that happens to see that one `totalValue` row types the column
`integer` and truncates the other 19,999 values, permanently and silently, in
every window.

**Rule: every numeric column is `float`. `integer` is opt-in only.** Two facts
force it. Sampling cannot distinguish the cases (one row in 20,000 decides it),
and even a complete scan cannot, because the next live delta may carry the
first fraction. What settles it is the asymmetry: an IEEE double represents
every integer up to 2^53 exactly, so typing an integer column `float` loses
nothing at these magnitudes, while typing a float column `integer` loses the
fraction of every row. Float is lossless in both directions; integer is lossy
in one. Thirteen columns here ARE integral across the whole snapshot and its
deltas (`quantity`, `notionalAmount`, the six P&L columns, `couponFrequency`,
the four spread columns) — they are reported as `integral` so a caller can opt
in deliberately, and typed `float` anyway.

Proven end to end against the real feed and the real engine
(`scripts/stompToTableProbe.mjs`): schema derived from the 20,000-row
snapshot alone (17 string, 3 date, 1 datetime, 31 float, **0 integer**; no
nested, mixed or unknown columns), Table built and loaded, then **620,000
numeric values read back and compared to what the feed sent — zero drifted**.
8,463 sparse deltas then upserted without changing the row count, moved only
the fields they carried, and left every other column intact.

Four columns are date-like strings and consistent across all 20,000 rows:
`asOfDate` is an ISO **datetime**, `maturityDate` / `issueDate` /
`nextCouponDate` are ISO **dates**. Typing them `string` loses date sorting and
range filtering server-side. No nulls and no missing columns in this profile;
the `wide` row profile does carry nested payloads, which need a flattening
rule since Perspective is flat.

### Where the Table is fed

`startStomp(cfg, emit)` already emits what a Table needs, so the Table is fed
by **decorating `ProviderEmit`** — no change to the provider, and the sparse
partial rows map straight onto `table.update()`, which upserts by index and
leaves omitted columns alone. `createPerspectiveTableFeed` in
`packages/data/host-data/src/runtime/perspective/` is that decorator.

The exact emit sequence, read off the transport rather than assumed
(`stomp.ts`: `emit({ rows: chunk, replace: offset === 0 })`):

```
{ rows: [],     replace: true }   empty clear — a snapshot is starting
{ rows: chunk0, replace: true }   ONLY the first chunk is flagged
{ rows: chunk1 }  …  { rows: chunkN }   the rest ride as plain deltas
{ status: 'ready' }
{ rows: … }                        live deltas from here
```

Three consequences, each of which was a bug before the real transport was run:

- **The unflagged chunks are still snapshot.** Buffering only the flagged one
  would derive the schema from 1,000 rows instead of 20,000.
- **An empty `replace` is not a no-op.** It is the signal that a fresh book is
  coming, and the ONLY signal when the new book turns out to be empty — treat
  it as one and a stale book stays on screen forever.
- **A `replace` must discard staged rows unconditionally**, not just when a
  Table already exists. A restart landing while an earlier snapshot is still
  buffering leaves no Table to check, and merging the abandoned rows into the
  new book is silent corruption.

Two ordering rules keep it safe in front of the hub: the wrapped emit is called
**synchronously and unmodified first** (the existing push path must not wait on
Perspective or change shape because it is present), and all Table work is
serialized on one promise chain (`update()` is async and `emit` is not, so
without a queue the first live deltas overtake a slow snapshot load and are
overwritten by it).

Verified against the real transport and the real engine
(`scripts/providerToTableProbe.mjs`): schema derived from all 20,000 rows,
52 columns, 0 integer, Table holding 20,000 rows and **still 20,000 after
137,360 delta rows** — deltas upsert rather than append.

### Hosting the Table

`createPerspectiveHost` (same directory) owns the engine and the Tables and
hands each window a ProxySession — the shape proven in `harness/pspHost.mjs`,
now a module. Its `tableFactoryFor(name)` is shaped to be dropped straight into
the feed's `createTable`, and the name is what a window passes to
`open_table(name)`.

The Perspective module is **injected**, not imported. The inline build carries
its wasm as base64 and host-data's worker asset is a single esbuild bundle that
every app loads, so importing it there statically would add megabytes to
workers that never open a blotter. Injection keeps the cost with the entry that
opts in — and makes the host testable without a wasm engine at all.

**A hosted Table has two plausible owners, and freeing it twice is fatal.** The
feed builds the Table and deletes it on restart; the host serves it by name and
deletes it on shutdown. Both ran on teardown and the second `delete()` threw
`null pointer passed to rust` from a wasm microtask — the uncatchable family
that can take the whole worker down. Deletion is now idempotent and
de-registers from the host's map, so whoever calls first wins.

The whole path, proven in one process against the real feed and the real
engine (`scripts/hostPullPathProbe.mjs`) — STOMP provider → feed → host-owned
Table → ProxySession → a **second Client that never saw a row**:

| | measured |
|---|---|
| Tables the window can see | `['positions']` — it created none of them |
| `open_table` | 7 ms, reporting 20,000 rows |
| Windowed reads | @0 9 ms · @10,000 6 ms · @19,900 5 ms — flat with depth |
| While the feed ticks | book moved under the window; row count stayed 20,000 |

## Row grouping and totals

AG Grid pulls a group tree **one level at a time** — it asks for the children
of a path and never for the whole tree. Perspective's `group_by` does the
opposite: `group_by: ['sector','book']` returns the fully expanded tree with
depth-1 and depth-2 rows interleaved, which is not what any single request
wants. The mapping that fits both, and what `toPerspectiveGroupLevel` builds:

```
AG   rowGroupCols [sector, book], groupKeys ['Energy']
psp  { group_by: ['book'], filter: [ ...user filters, ['sector','==','Energy'] ] }
```

Group by exactly the ONE column at the requested depth; push the ancestor keys
down as filter clauses. At the leaf depth (every group column consumed) the
`group_by` is dropped and the View returns real rows.

**Row 0 of every grouped View is that level's total** (`__ROW_PATH__: []`), at
every depth. So a level's own subtotal is free, and the root level's row 0 is
the grand total of the whole filtered book. Blocks of children are therefore
read at `start_row + 1`, and `__ROW_PATH__` is remapped onto the group column
because AG builds its group row from that field (`toGroupColumns`).

An ungrouped View has no total row at all. One constant expression column
(`{ __all__: "'ALL'" }` grouped by `__all__`) produces exactly one group, whose
row 0 is the total over the whole filtered book — which is how a FLAT blotter
gets a live grand total.

### AG Grid 36 rules this exposed

**`grandTotalData` creates the grand total row but does NOT update it.**
Supplying it on the block response is the documented mechanism and works on
first load and after a purge. Measured: across five `refreshServerSide({purge:
false})` cycles, five distinct fresh totals were supplied and the row kept
showing the first. Keeping it live needs the other documented path —
`applyServerSideTransaction({ update: [total] })` with a `getRowId` that
returns `GRAND_TOTAL_ROW_ID` for that row. Both are needed, for different
moments.

**`refreshServerSide` does not cascade into child stores.** Each expanded group
level is its own store. Refreshing only the root left the six sector rows and
their footer ticking while the six book rows underneath sat frozen at their
opening values — aggregates that look live at the top and are stale one row
down, which is worse than obviously not updating. Every expanded route must be
refreshed by route.

**`setRowCount` is illegal while grouping** — AG error #28 fires whenever a
row-group column exists, and it is SILENT without `ValidationModule`.

**`getRowId` must be path-based.** Group rows have no `positionId`; an id
derived from it collides across every group at a level, and duplicate ids turn
a successful block into a failed one (warn 205). The id is the parent keys plus
the row's own key.

**`forEachNode` does not traverse total rows.** Group footers and the grand
total are only reachable through the displayed-row API or
`api.getRowNode(GRAND_TOTAL_ROW_ID)` — a fact that made working footers look
missing.

### Consistency across levels

Levels are read independently, so under a live feed a child level can be read a
tick later than its parent and the two need not add up at that instant.
Verified: against a static book all three levels reconcile EXACTLY (traders sum
to their book footer, books to their sector footer, sectors to the grand
total); with the feed running they drift by roughly one tick's worth. Every
number is individually correct — none is a partial sum of the rows a window
happens to hold — but a cross-level total taken mid-feed is a montage of
instants, not a snapshot.

## Where expressions resolve

| kind | resolves | why |
|---|---|---|
| Calculated columns | **worker** (`expressions` map) | values feed sort/filter/group/agg |
| Style rules (appearance only) | **client**, visible rows | presentational; ~100 rows not 20,000 |
| Style rules filtered/sorted on | **worker** -> boolean expression column | filtering is server-side |
| Style rules with cross-row context | **worker** | a window no longer holds the whole book |

Expression columns are themselves sortable, filterable and groupable
(verified), which keeps calculated columns first-class.

`weighted mean` is **not** a valid 4.5.2 aggregate — the string appears
nowhere in the package and passing it bare aborts the wasm engine. Express it
as `sum(w*x)/sum(w)` over expression columns.

## Milestone 1 — measured

Production build (`vite build` + `vite preview`), Chromium, 20,000 x 52.
Never measure this on the Vite dev server: it serves each window hundreds of
separate modules and the 3rd window starves behind the connection cap.

**Opening the 2nd and 3rd blotter — the whole point of the exercise:**

| window | to first rows | host boot included |
|---|---|---|
| 1 (cold) | 1135 ms | yes — 649 ms of it |
| 2 | **440 ms** | no |
| 3 | **414 ms** | no |

The 3rd blotter is the fastest, not the slowest. Host boot is paid once:
engine 73 ms, table 27 ms, generate 57 ms, load 492 ms.

**Reads are flat with scroll depth** (100-row windows): @0 3.8 ms,
@10,000 3.4 ms, @19,900 3.9 ms.

**Three windows under a live feed** — 12 purge-refreshes each, concurrent,
while the host wrote 500 rows every 200 ms: block round trips (AG asks ->
rows delivered) averaged 3.7 / 4.3 / 5.2 ms, worst 12.1 ms, **0 failed
blocks**. The host absorbed 226 ticks at a mean of 2.54 ms with 3 live views.

**Live ticks reach the grid by pull, not push.** The feed writes to the Table
in the worker; Perspective notifies each window's View through
`view.on_update` (default mode — notification only, no row payload); the window
re-reads the blocks it already holds via
`refreshServerSide({purge:false})`, throttled to 250 ms. Verified: over 6 s of
feed, 50 of the 100 loaded rows changed value in the grid's row model, 11
refreshes, 0 failed blocks. `purge:false` keeps scroll position and row nodes,
so AG updates rows in place by id and `enableCellChangeFlash` marks them.
The subscription belongs to the View and must be re-made on every swap.

**Aggregation ticks at every level.** Grouped `sector > book > trader` with
two levels expanded, under the 500-row/200 ms feed: all 22 displayed rows moved
— 6 sector groups, 6 book groups, 8 trader groups, both group total footers and
the grand total — with 0 failed blocks and 3 live Views. Aggregates are exact:
against a static book the traders sum to their book footer, the books to their
sector footer and the sectors to the grand total, to the unit.

**Sort and filter, server-side, six permutations** (sort, sort+filter, filter
swap, clear): every change rebuilt the right View — `sector == 'Energy'`
3,333 rows, `quantity > 5000` 5,050 rows — every block settled, nothing
wedged. `maxConcurrentDatasourceRequests` was left at its default of 2, so a
single leaked `getRows` would have shown up as a dead grid.

Take these in a **visible** window. A background tab starves
`requestAnimationFrame` — which AG Grid defers row rendering to — and clamps
`setTimeout` to ≥1 s, so the scripted scroll test cannot run at all and the
live-refresh throttle drops from 4 Hz to 1 Hz. Frame timing during a real
scroll is the one figure above still unmeasured for that reason.

## The real feed in a browser

`apps/demos/perspective-blotter` is the pull path on the live STOMP book: the
SharedWorker holds the connection, the feed and the engine; each window holds a
Client. It is an **app**, not another harness page, because
`perspective-grid/harness` may not import `host-data` — the boundary runs one
way, and the mock harness only got away with it by having no provider.

Measured on the production build against the running broker:

| | measured |
|---|---|
| Table built from the broker | 20,000 rows, **52 columns**, 0 integer, nothing nested or mixed |
| Window attach | 1.1 s / 2.6 s for windows 2 and 3, cold bundle |
| Windowed reads under the live feed | **p50 3 ms, p90 4 ms** |
| Read at depth | 2.7 ms @0 · 4.0 ms @10,000 — still flat |
| Failed blocks | 0 |

Two caveats worth keeping honest. A 1.4 s "steady state" reading was a
**measurement artifact of my own making** — ten `purge:true` refreshes fired
350 ms apart while the 250 ms live refresh also ran, so blocks queued behind
each other and behind table updates. Sustained reads are 3–5 ms. And reads do
stall a few hundred milliseconds while the engine applies a delta batch; that
is the write path blocking the read path, not the read path being slow.

The Perspective module is loaded by dynamic `import()`, so the worker chunk is
**24 kB** with the 5 MB engine as a separate chunk fetched on demand. The
window bundle still carries the whole inline build, including the server wasm
it never runs — `getCompiledClientWasm()` is the fix, still outstanding.

## Status

| step | state |
|---|---|
| Datasource (AG contract-safe) | done, 10 tests |
| Deletion-safe View lifecycle | done, 8 tests + engine probe |
| View-config translation | done, 22 tests |
| SharedWorker hosting | **done — plumbing proven end-to-end** |
| Worker-held Table + per-window View | **done (mock book)** |
| View manager | done in `harness/` (multi-View, group-aware), not yet promoted to `src/` |
| Harness blotter, 3 windows | **done — see Milestone 1 above** |
| Live ticks (pull, via `on_update`) | **done** |
| Row grouping + per-level and grand totals | **done — see "Row grouping and totals"** |
| Schema derivation from provider rows | **done** (`host-data`, 23 tests) |
| Feed: provider emit -> Table | **done** (`host-data`, 22 tests) |
| Worker-side engine + Table hosting | **done** (`host-data`, 19 tests) |
| Real STOMP feed in a browser | **done** — `apps/demos/perspective-blotter` |
| Row engine (datasource + refresh + totals) | **done**, 11 tests |
| MarketsGridContainer wiring | not started — see below |

`MarketsGrid` currently has two surfaces: CSRM, and an SSRM one that always
mounts the hand-rolled `CustomSSRMGrid`. Its `ssrmEngine?: 'custom' |
'perspective' | 'auto'` prop is **documented as deprecated and ignored** — a
vestige, not a seam. Wiring the container therefore needs a real third surface
mounting AG Grid on `createPerspectiveRowEngine`, plus a flag on the container
to choose it with CSRM left intact for side-by-side comparison.

Run it: `npx vite build packages/react-grid/perspective-grid/harness` then
serve `dist/` (launch config `psp-harness-preview`, port 5200).
`plumbing.html` is the 5-step proof, `blotter.html` is one blotter,
`index.html` opens three.

Next: promote `harness/viewManager.mjs` into `src/`, then feed the worker-held
Table from STOMP.
