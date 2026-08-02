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

## What the window loads — and why it is NOT the shared compiled module

A window on this path never runs the engine. It holds a Client that proxies to
the SharedWorker. Yet every window was importing `@perspective-dev/client/inline`:
one **5,070 kB** JS chunk carrying both wasm binaries as base64, including the
2,406 kB **server** binary it can never execute. MEASURED across three windows,
that chunk is ~900 ms of every window's ~1.1 s open, against 191–315 ms for
everything the row engine does — the largest single cost on the path.

`getCompiledClientWasm()` returns a structured-cloneable `WebAssembly.Module`,
so the obvious fix is to compile once in the worker and `postMessage` it to
windows 2..N. **That does not work, and cannot be made to.** `loadPerspectiveClient`
fetches the wasm instead.

### The probe that settled it

`harness/wasmshare.html` (`npx vite build`/`preview` the harness, then open
`/wasmshare.html`). It asks the getter question and the transfer question
**separately**, because the previous attempt inferred one from the other and got
both wrong. Each strategy ends at the same assertion — read 20,000 rows from the
worker-held Table — and reports the bytes its own Worker fetched.

| question | answer |
|---|---|
| `getCompiledClientWasm()` in a SharedWorker, before a client exists | **THREW in 2.0 ms** — "client wasm has not been compiled yet" |
| ditto, after `perspective.worker()` | **RESOLVED in 0.2 ms**, 103 exports |
| ditto, in a window after its client exists | **RESOLVED in 0.0 ms**, 103 exports |
| `postMessage` the Module out of the SharedWorker | **REFUSED** — no throw at the sender; the window raised `messageerror` |

**It never blocked the worker's event loop.** It is a variable read — it answers
`GLOBAL_CLIENT_MODULE`, which `compilerize()` only sets once the client wasm has
finished compiling, and throws before that. The first attempt called it too
early. A rejection at 2 ms loses no race with a 1.5 s timeout, it *settles
first* — so "the `Promise.race` did not rescue it" was evidence of a fast
rejection, not of a blocked loop. Scope was never the problem either; it works
in both scopes.

**The real blocker is agent clusters, and it is permanent.** A
`WebAssembly.Module` is structured-cloneable but may not be *deserialized* in a
different agent cluster. A dedicated Worker shares its owner's cluster — which is
why the earlier "it survives a round trip through a Worker" result was true and
proved nothing about this. A SharedWorker is its own cluster, so the Module
cannot reach a window from one, by any route. No ordering, scope or plumbing
change affects this.

### What is done instead

Fetching the wasm needs no transfer, so the agent-cluster rule is not in the
picture. MEASURED in the probe, both reading 20,000 rows from the worker-held
Table:

| strategy | perspective bytes | worker time |
|---|---|---|
| `inline` (before) | 4,951.84 kB | 178.2 ms |
| `fetch` (now) | 555.67 kB (509.09 wasm + 46.58 JS) | 36.3 ms |

MEASURED again on the product path (`minimal-perspective-table`, production
build): a blotter window fetches **only** those two chunks and never requests
the 5,070 kB inline one; a second window takes both from the HTTP cache at
0.29 kB over the wire each. Both read 20,000 rows, 0 failed blocks. The inline
build stays in the bundle as a fallback chunk — emitted, not fetched.

One consequence worth knowing: the slim build's `get_server()` **throws** when
nothing was registered, so `loadPerspectiveClient` hands `init_server` an EMPTY
buffer with stage 0 disabled. That is safe only because this window's Client is
a pure proxy — the buffer's sole destination is the `args[0]` of the init
handshake, which the host ignores outright (`perspectiveHost.ts`). A window that
needed its own engine would need the real 2,406 kB binary and would not be on
this path.

Sequencing note that cost the first attempt a full cycle: the SharedWorker asset
is a prebuilt esbuild bundle, so a change to `host-data` source is invisible
until `npm run build --workspace=@starui/host-data` runs. (This change is
window-side only and does not need it.)

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

## The profile the app can actually request — and the one it gets

**Correction, now itself corrected.** Those numbers were measured with STOMP
headers (`live-mode: sparse`, `updates-per-tick: 100`) that the production
provider could not send: `startStomp` published `{ destination, body }` only
and `StompProviderConfig` had no field for request headers, so the sparse
profile was reachable from a probe script and not from an app.

**`StompProviderConfig.requestHeaders` closes that.** Headers go on the trigger
frame verbatim; `sanitizeRequestHeaders` drops the three stompjs owns on a SEND
frame (`destination`, `content-length`, `receipt`), because supplying those is
not a customization but a corruption — `destination` would redirect the frame
and `content-length` would truncate or overrun the body. When no headers are
configured the field is omitted entirely rather than sent as `{}`, so an
existing provider produces a byte-identical frame.

Proving it took two attempts, and the first one is the instructive one. Table
churn under `live-mode: sparse` measured ~186 rows/s — but the CONTROL, the
same build with the header removed, gave ~235 rows/s. **No difference**: the
fixture instance that happened to be running was already sparse-like, so the
metric could not tell treatment from control and the number meant nothing.
`snapshot-rows` settled it instead, because its signal is unmistakable: the
book went from **20,000 rows to 1,000**. `minimal-perspective-table` now ships
the sparse headers.

What an app gets instead is the broker's default legacy sweep. Measured from
`apps/demos/perspective-blotter` against the same server:

| | sparse (probe only) | broker default (what the app gets) |
|---|---|---|
| Frame size | ~100 rows, ~4 of 52 fields | **20,000 rows — the whole book** |
| Frequency | 5.1 / s | 0.3 / s |
| Throughput | 514 rows/s | **6,000 rows/s** |
| Block round trip | **p50 3 ms** | **p50 877 ms**, worst 944 ms |

The pull path stays *correct* under the sweep — 0 failed blocks, the Table
holds at 20,000 rows, the grid renders and ticks — but read latency is
dominated by ingesting a full book every ~3 s, because a `table.update()`
blocks reads while it applies. This is the write path starving the read path,
at a scale the sparse profile never showed.

**That follow-up is now done** — see `requestHeaders` above. An app can ask for
partial deltas, so the pull path no longer has to be measured against a feed
shape no deployment would choose.

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

**An attach must resolve the provider row on demand, not from the cache.**
MEASURED on `perspective-ssrm-lab` with a fresh browser profile: the Stress tab
never attached — `no provider config for 'perspective-ssrm-lab:mock-positions-stress-50k40'`
— while switching variants away and back attached instantly. That gap is the
whole diagnosis: the row WAS on disk, and `handlePerspectiveAttach` was reading
the worker catalog cache synchronously. A window's `configStore.save` reaches
that cache only through `wireWorkerCatalogSync`, an async fire-and-forget
invalidate, so any window that seeds its own provider and attaches straight
after loses a race it cannot see — and nothing re-attaches, so the tab stays
dead. The attach now `await`s `ConfigCatalogCache.ensure(providerId)` (cached
row, else a one-row read), which is what the push path's `get-config` already
did. Anything that seeds a provider and opens a blotter in the same breath —
every demo seed, a provider editor's first Save — was exposed to this.

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

## One engine, one queue — block reads come first

Every request from every window crosses ONE ProxySession per Table, and the
engine serializes them. So the question is never "is this View cheap" but "what
is it queued in front of".

MEASURED on the 50k x 400 stress book, one saved-filter pill click, before any
of this was addressed:

| what | cost |
|---|---|
| level View the block needs · build | 745–1,035 ms |
| its `num_rows()` | 438–1,463 ms |
| its `to_columns()` | 320–864 ms |
| set-filter value list, rebuilt on the filter change | 680–1,000 ms |
| grand total for the OUTGOING filter | 1,310–1,986 ms |
| six pill badges, 24 calls in a six-second window | 41.7 s summed |
| **block settled** | **5,031 ms** |

The rows were read at ~3.2 s and AG was not given them until 5.0 s. Note what is
NOT on that list: nothing was slow because of the row model. Every avoidable
millisecond was another question asked of the same engine at the same moment.

Three changes, and the same click re-measured:

- **Background questions yield to blocks.** `countMatching`,
  `countMatchingExpression`, `aggregateScalar` and `distinctValues` wait for no
  block to be in flight, capped at 1.5 s — a live feed re-reads its blocks four
  times a second, so a strict wait would starve every badge on the surface.
- **A superseded block gets no grand total.** The datasource hands
  `getGrandTotal` the very object it handed `getView`, so identity against
  `lastRootRequest` tests staleness exactly.
- **The throttled total push is `liveOnly`.** Keeping an existing total moving is
  worth reading a View the grid already holds and nothing more; a shape with no
  live View is one the grid has moved off, and its next block brings a total.

| | before | after |
|---|---|---|
| block settled after the click | 5,031 ms | **1,044 ms** |
| badge engine work in the window | 41.7 s | **1.8 s** |

**What the gate does NOT cover, measured rather than assumed.** Clicking a pill
re-renders the toolbar and asks for all six badge counts at **6 ms**, while AG
does not issue the block for the new filter until **39 ms** — so the gate is
open when they ask. That gap is closed by the count floor
(`countMinIntervalMs`, raised 1 s -> 5 s) rather than by delaying every
background read, which would only make an idle blotter slower to draw its
badges.

On a 500-row tab the same click is 110 ms end to end, which is why none of this
was visible until the stress tab was measured.

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

## Totals will NOT match the CSRM grid — the fixture guarantees it

Put a Perspective blotter next to a CSRM one on the same broker and their
grand totals differ by ~0.004% (measured: 500,371M vs 500,393M on
`marketValue`). Neither is wrong, and no amount of work on either grid will
close it.

`stomp-view-server` gives **every subscription its own private book**.
`connection.ts` declares `deliveredRecords` per subscription (line ~616) and
fills it with `structuredClone(r)` per row (~651); live ticks then mutate *that
clone* through `touchPosition`, which random-walks `currentPrice` ±3% per tick
(`mutate.ts`). Two subscribers therefore start from the same snapshot and
diverge on independent random walks, forever — there is no shared state to
converge on.

Proved by measurement rather than inference: **two CSRM windows disagree with
each other by 20.0M**, the same magnitude as the CSRM-vs-Perspective gap. It is
subscription vs subscription, not engine vs engine.

The pull path is the *more* consistent of the two, and this is the one place to
see it: every Perspective window reads the ONE worker-held Table, so N blotters
always agree exactly. N CSRM windows hold N private books and never do.
(Verified with a timing-immune probe — insert a synthetic row from window 1 and
window 2's `size()` becomes 20,001. Do NOT try to prove this by mutating a
field and reading it from the other window: the broker's full-book sweep
rewrites every column every few seconds and will clobber the write before a
cross-window read lands. That artifact produced two false "not shared"
readings before the insert test settled it.)

To compare the two engines' aggregation for real, run with live updates off so
both hold identical data. Under the sweep the noise (~6M per few seconds on the
total) is far larger than any plausible aggregation difference.

## One grid per platform, once

The single sharpest bug on the product path, and the one that made the whole
surface look half-finished: **the formatting toolbar, the auto-formatter, the
saved-filter "+" button and profile save/restore were all silently dead**,
while grouping, sorting, the context menu and density all worked perfectly.

Attaching to the worker-held Table is async, so `usePerspectiveTable` answers
`null` for the first few hundred milliseconds. `MarketsGridHost` branched on
the Table *object*, so during that window it fell through to the **CSRM
surface**. That throwaway grid fired `onGridReady`, which attached the api to
the `GridPlatform` and activated every module. When the Table landed the branch
flipped, that grid unmounted, and its `onGridPreDestroyed` called
`platform.destroy()` — which sets `destroyed` permanently and nulls the
platform ref. The Perspective grid then mounted and fired its own
`onGridReady` into the destroyed platform, where `GridPlatform.onGridReady`
opens with `if (this.destroyed) return`. A fresh platform was built for the
next render and never saw a grid at all — measured live: `api` null,
`mountedGrid` false, not one module activated.

That is the split that made it so hard to see. Every feature that talks to AG
Grid directly kept working; every feature that goes through the platform was
gone.

The rule is now named and tested (`resolveGridSurface`): while the Table is
attaching the host mounts **nothing**, so exactly one grid ever mounts per
platform. `null` means "asked for, still attaching" and `undefined` means "not
using this seam" — a caller that collapses the two (`?? undefined`) puts the
bug straight back, which is exactly what `MarketsGridContainer` was doing.

Verified after the fix, on the live 20,000-row book: platform attached to the
real grid, and a hidden column plus a `pnl desc` sort survived a full reload
with the top row reading the true maximum — so the restore re-drove the
datasource, not just the column state.

## Writes: edits go to the Table, direct from the window

Under the server row model `cellValueChanged` still fires, but AG's write lands
only on the block-cache row node. The next refresh re-reads that block from the
Table and paints the old value back over it — an edit that appears to take and
reverts a fraction of a second later, with nothing logged. So a committed edit
is routed to `table.update([sparseRow])`, which upserts by index and leaves
every omitted column alone.

The write goes **direct from the window**, not back out through the provider.
There is nowhere else for it to go: `startStomp` publishes only a subscribe
frame and `StompProviderConfig` carries no write channel, so "through the
provider" would mean a new hub RPC whose whole body is the same
`table.update()` one process later. Direct is also what the other two surfaces
do — CSRM writes into the row node it renders from, `CustomSSRMGrid` into its
mirror engine; both put the edit into the store that supplies the grid, and
here that store lives in the worker. The bonus is that peers get it for free:
one Table, so every other blotter's View notifies and re-reads.

**The Table is not a system of record.** A provider snapshot arrives as a
`replace` and discards local edits — the same lifetime a CSRM edit has when the
next full row for that key ticks in.

Three rules the shared book forces, none of which apply to a client-side edit:

- **Coerce against the declared type, and refuse what will not coerce.**
  `table.update()` does not reject a wrong-typed value, it coerces it — the same
  property that makes sampling a column's type unsafe. A cell editor with no
  `valueParser` hands back a string, so `"1250"` would reach a float column and
  be silently converted, in every window. `coerceEditedValue` refuses instead;
  a refused edit reverts visibly on the next refresh, a mangled one does not.
- **Refuse the whole row, not the columns that failed.** Half-applying an edit
  the user made as one action is worse than dropping it.
- **The index column cannot be edited.** An upsert with a changed key inserts a
  second row and leaves the original, while every `getRowId` still points at
  the old one.

Edits are coalesced by row key on a 0 ms timer: smart edit and bulk update
commit cell by cell, and one proxied round trip per cell is hundreds of worker
calls for one user action. `close()` flushes before tearing down, so a Table
swap or an unmount cannot eat the last edit.

### The second write path — and why it was silently dead

`cellValueChanged` is only ONE of the two ways an edit is made. Smart edit,
bulk update and history undo/redo never touch the cell editor: they build a
patch list and hand it to `GridPlatform.applyDataTransaction` as a transaction
of full row objects. The host routes that to `GridApi.applyTransactionAsync`,
which is the client-side row model's write path and is **not** a write path
under `serverSide`.

So every one of those modules was a no-op here — and a convincing one. MEASURED
with the identical flow on both surfaces, same column, same operand: CSRM
4,215,482 → 8,430,964; Perspective 30,053,717 → **30,053,717**. The toolbar
reported the right cell count, enabled its buttons and ran its handler. Nothing
logged. It went unnoticed because nothing had ever driven those toolbars — the
grid's own `editable: false` columns mean a demo does not exercise them by
accident, and synthetic clicks do not drive the pills.

`toPerspectiveEdits` maps the transaction onto `applyEdit`, registered via
`GridPlatform.setEngineDataTransactionApplier`, which **outranks** the host
applier. The precedence is explicit rather than left to effect order, and effect
order says the wrong thing here: the surface is a CHILD of the host, so its
effect runs first and the host's registration would overwrite it.

Two rules the mapping has to get right:

- **Only CHANGED fields may be written.** A transaction row is the whole row,
  rebuilt from the node's current data with the patched fields overwritten.
  Upserting all of it would write this window's copy of every other column back
  into the shared Table — including the ones the feed is sweeping — so a
  one-cell edit would rewind prices for every peer window. The incoming row is
  diffed against the node.
- **`add` and `remove` are ignored.** Membership of the book belongs to the
  provider filling the Table. A delete here would delete it for every blotter
  on the desk, and it would return on the next snapshot anyway.

### An edit outlives the window, but not the provider

MEASURED, and worth knowing before writing a test against it. An edit written to
the Table is visible in a peer window immediately (one Table), and survives a
reload of the window that made it — **as long as some window still holds the
provider**. Reloading as the SOLE window drops the attachment count to zero; the
next attach restarts the provider, which re-snapshots the book and reverts the
edit to the broker's pristine value (987,654 → 7,154 measured on `quantity`).

That is provider lifecycle, not the edit path: any Table content goes the same
way, a raw `table.update()` included. It is consistent with "the Table is not a
system of record" above — this just names the second thing that ends a Table's
contents, alongside the sweep.

## Calculated columns resolve in the worker

The `expressions` map was plumbed through `toPerspectiveViewConfig` from the
start and expression columns were verified first-class — but nothing populated
it, so a calculated column was simply absent from this path. The planner already
existed (`planSsrmCalcColumns` compiles a StarUI expression to Perspective
source) and ran only when `useSSRM` was true.

`usePerspectiveCalcColumns` now runs it for this surface, and
`engine.setCalcExpressions` publishes the result. VERIFIED against 4.5.2
(`scripts/calcColumnProbe.mjs`) that an expression column really is first-class:
read, **sort**, **filter**, **group by** and **aggregate** all work on one.

Only `kind: 'perspective'` plans can be served here. A `materialize` plan needs a
client-side pass over whole rows (`.old`/`.new` refs and the like) and this
window holds only the blocks in view, so those keep their client `valueGetter`
rather than being silently dropped.

**One bad expression takes the WHOLE View down, not just its own column.**
Measured: `table.view()` throws `Value Error - Input column "nope" does not
exist`, so a typo in one calculated column would blank the entire grid rather
than hide one column. `table.validate_expressions()` reports per-expression
errors without building a View, so the engine checks first, keeps what compiles,
and reports each drop through `onError`. A validator that itself fails keeps
everything — a broken check must not cost the user every calc column.

The expressions ride in `shapeOf`, so changing a calculated column retires the
Views built without it, and they are carried into the transient Views built by
`countMatching` and `distinctValues` too: a saved filter or a set filter may
well be ON a calculated column, and a View that omits the expressions cannot
resolve the clause at all.

Also settled here: the compiler emits `if(cond, a, b)` and a unit test asserted a
`?:` ternary. Both forms compile in 4.5.2 and both yield the same values, so the
test was pinning one valid spelling rather than the behaviour — it now asserts
the form the compiler actually produces.

### `not()` does not exist, and says so only sometimes

The same test file asserted the compiler emits `not(` for a StarUI `NOT`, and
that assertion was green while being wrong. MEASURED (`scripts/styleRuleProbe3`
and `4`): **`not()` aborts for every argument type in 4.5.2** — boolean,
numeric, literal `true`, all of them give `Type Error - inputs do not resolve to
a valid expression`.

What makes it worse than a broken function is *where* it stays quiet:

| form | `validate_expressions` | result |
|---|---|---|
| `not(q > 10)` | reports the error | View build aborts — loud |
| `not(q > 10) and p > 95` | **clean `boolean`, no error** | false for every row |
| `if(not(q > 10), 1, 0)` | **clean `boolean`, no error** | 1 for every row |

So the pre-flight check that protects every other expression cannot protect
this one. The only defence is never emitting it. `and` and `or` themselves are
fine — that was checked separately, because an all-false answer first looked
like `and` failing to compose two booleans.

`if(x, false, true)` is the negation that works, and it composes when nested.
It needs a genuinely boolean operand: a non-boolean condition is **accepted**
and reads truthy (`if("qty", false, true)` answered false for every row of a
column with no zeroes), so `NOT` over anything not inferred boolean is refused
instead. Refusing costs the caller a server-side column; compiling costs them a
wrong one, which is the trade this path keeps having to make in the same
direction.

### Comparisons against a null are not JavaScript's

MEASURED on a float column holding `[110, 100, 90, null]`:

| expression | null row answers |
|---|---|
| `"price" > 95`, `>= 95` | **true** |
| `"price" < 95`, `<= 95` | false |
| `"price" == 95` | false |
| `"price" != 95` | true |

A null therefore **matches `>`** — under CSRM the same rule evaluates in
JavaScript, where `null > 95` coerces to `0 > 95` and is false. `is_null` /
`is_not_null` both exist and work, so a rule that must not paint missing values
is guarded with `if(is_null("col"), false, …)`.

### `avg()` and `sum()` are row-wise, and look like aggregates

`avg("price")` parses, returns no error, and answers `[110, 100, 90, null]` —
the column's values, not its mean. They are scalar functions over their
*arguments*: `avg("price", 0)` gives `[55, 50, 45, null]`. So
`"price" > avg("price")` is false for every row, silently, and anything that
maps StarUI's `AVG`/`SUM`/`MIN`/`MAX` onto the same-named Perspective functions
produces a rule that never matches and never complains. `mean`, `stddev` and
`count` do not exist at all (they abort, which is the safe failure).

There is **no cross-row aggregate in the expression language**. "Above average"
is therefore two steps, not one: measure the scalar with an aggregate View over
the whole book (`group_by: ['__all__']`, `aggregates: { price: 'avg' }`), then
substitute it into the expression as a literal. Verified end to end — the
measured mean of 100 substituted as `"price" > 100` selected exactly the rows
above it.

Verified live on the 20,000-row book: `grossPnl = "currentPrice" * "quantity"`
computed in the worker and delivered with the block (108.8162 x 7154 =
778,471.09), server-side sort by it monotonic across the top of the book, a
saved-filter count on it returning 869 of 20,000, and a deliberately broken
expression alongside a good one leaving the grid rendering with 0 failed blocks.

## Style rules the worker has to answer

Most conditional styling is presentational and stays client-side: a rule paints
the cells AG Grid is rendering, and those rows are in hand. What does not
survive the move to a pull path is any question about the **book** rather than
the viewport — and the runtime asks exactly one: `headerPainter`'s "does ANY row
match this rule?", which decides whether a column header carries the rule's
flash or its indicator badge.

It turned out to be worse than the viewport-scoped answer the design predicted.
MEASURED live, same grid, same book, against the CSRM twin:

| | `forEachNodeAfterFilter` | `forEachNode` |
|---|---|---|
| CSRM | 20,000 | 20,000 |
| Perspective | **0** | 100 (the loaded blocks) |

`forEachNodeAfterFilter` visits **nothing at all** under the server row model.
So header flash and header indicators were not degraded on this path, they were
entirely dead — and silently, because a rule that paints no header looks exactly
like a rule whose condition is false.

`engine.countMatchingExpression(source)` answers it from the worker: the rule
compiles to a Perspective boolean expression, and the count is of rows where it
is true.

**The rule columns are transient, never live.** An expression column is
recomputed on every Table update for as long as its View lives — the property
that made a 26-column quick search unusable. A rule column in the viewport's
View would charge that on every tick, permanently, for something only the header
painter reads. Each count builds its own View, reads it once and drops it, and
the answers are cached on the same terms as the saved-filter counts (the painter
re-evaluates on every row signal and every filter change).

The count is scoped to the grid's own filter, because the client-side original
is `forEachNodeAfterFilter` — a header must not light for rows the user has
filtered away. Verified live: 10,000 matches unfiltered, 3,339 under
`region = EMEA` (6,669 rows), back to 10,000 on clear, each exactly matching a
JavaScript count over the same book.

Rules that cannot be moved keep their client scan rather than compiling into
something plausible: `.old` / `.new` refs (viewport-only by definition — the
worker holds one value per cell, not a before and an after), expressions the
compiler cannot express, and **timed rules**, whose activation is about what
changed under the user's eyes and means nothing over a book.

**Cross-row context is two steps, not one.** `avg("col")` is row-wise (see
above), so "above average" measures the scalar with `aggregateScalar` and
substitutes it into the expression as a literal. An aggregate that cannot be
measured drops the rule's answer instead of defaulting it — an "above average"
rule with no average is not a rule with a default.

Verified live on the 20,000-row book: a rule matching **1 row of 20,000**, at a
threshold no loaded block reaches (9,999 against a loaded maximum of 9,998),
lights the header — where a client scan answers "no match" and in fact scans
nothing. A rule nothing matches leaves it unlit. `avg` and `high` over
`quantity` (a column the fixture does not random-walk) returned 5049.4706 and
10,000, both exact against a JavaScript pass over the same rows, and the count
above that mean was 10,000 on both sides. 25 successive counts cost 31 ms
against 169 ms for one uncached, live Views unchanged at 2, 0 failed blocks.

**The aggregate measures the WHOLE book, not the filtered one — DECIDED.**
`aggregateScalar` deliberately drops the request's `filterModel` and the quick
filter. The threshold is a property of the book, so an "above average" rule
paints the same rows whatever the user has filtered to: Excel's
conditional-formatting convention, where a filter hides rows without moving the
threshold, rather than the SQL/BI convention of filtering first (which is what
this did originally).

The cost is stated here so nobody re-derives it as a bug: such a rule **can
disagree with the average in the totals row on the same screen**, because group
totals, the grand total and the status bar all DO follow the filter. If a
filtered aggregate is ever wanted, pass `filterModel` through instead of
dropping it — and restore the filter model to the engine's cache key, which no
longer carries it.

VERIFIED live with a filter active (`region = EMEA`, 6,669 of 20,000): the
engine answered **25,019,360.33445**, which is the whole-book average to every
decimal, against 25,010,520.70 for the EMEA rows alone. The two populations
differ by 8,840, so the reading cannot be mistaken for either one.

**Caveat worth keeping honest:** cross-row context is a new capability here, not
restored parity. The client-side style-rule evaluator never passes `allRows`, so
`AVG([price])` inside a rule resolves to that row's own price on CSRM too, and
`[price] > AVG([price])` is false for every row there. This path answers it
correctly; CSRM does not answer it at all. **DECIDED: that divergence stands and
is intended** — CSRM is not being brought up to it. The consequence to know is
that a profile carrying such a rule is not portable between the two surfaces:
the same saved rule paints on one and silently paints nothing on the other.

## Multi-window timings on the PRODUCT path — measured

Milestone 1 measured the 2nd/3rd-blotter claim in `harness/` (window 3 at
414 ms against 1135 ms cold) against a **mock book already in memory**. The
whole thesis of this migration rests on that number and it had never been taken
through `MarketsGridContainer` against the real feed.
`scripts/multiWindowTimingProbe.mjs` does it: production build, three visible
windows, one fresh browser profile so window 1 gets a genuinely fresh
SharedWorker.

Two consecutive runs, `minimal-perspective-table` on the live STOMP book:

| window | mount (bundle) | attach + first rows | total | full book |
|---|---|---|---|---|
| 1 (cold) | 928 ms | **1,370 ms** | 2,297 ms | 3,136 ms |
| 2 | 864 ms | **191 ms** | 1,056 ms | 1,097 ms |
| 3 | 933 ms | **315 ms** | 1,248 ms | 1,252 ms |

**The headline 1.8x understates it, and the decomposition says why.** Mount —
bundle fetch, parse and React boot — is ~865–976 ms and is paid *identically by
every window*, cold or not. It is not the row engine's cost at all; it is the
5 MB inline build, which is exactly what `getCompiledClientWasm()` would
attack. Strip it and the part this migration actually owns is **191–315 ms for
a later blotter against 1,370 ms cold — 4.3x**. The thesis holds on the product
path; the remaining per-window cost is bundle, not book.

All three windows reported **20,000 rows and 0 failed blocks**, agreeing
exactly — the property N CSRM windows can never have, since each holds its own
independently random-walked copy.

One caveat kept honest: the cold window reached a full book in ~3.1 s here,
against the 18.4 s snapshot recorded under "The real feed, measured". The
broker is erratic (18 s–2 min, and it sometimes wedges), so the cold figure
tracks the broker's mood rather than anything in this code. The windows 2 and 3
figures do not depend on it — that is the point of them.

## Tree data and master/detail

Both are AG features that read something the client is assumed to hold, so both
needed a worker-side source. Neither existed on MarketsGrid at all before this —
they were `CustomSSRMGrid` props — so this is new public API
(`perspectiveTreeFields`, `masterDetail`), not restored parity.

**Tree mode is the same pull shape as grouping.** AG asks for the children of a
path either way, and `toPerspectiveGroupLevel` already maps that onto
`group_by: [the one column at this depth]` plus ancestor keys as filter clauses.
So tree mode reuses it exactly, by standing the configured fields in for the
`rowGroupCols` AG does **not** send in tree mode. A request that carries real
group columns wins instead — the user dragged a column into the group panel, and
that intent should not silently merge with a configured hierarchy.

What actually differs is the output. AG reads a tree hierarchy off the **data**
(`isServerSideGroup(data)`, `getServerSideGroupKey(data)`) because there are no
group columns to read it from, and Perspective has nothing to say about either.
So parent rows are stamped with `__treeKey` and `__treeGroup`. Every row of a
grouped View is a parent by construction — the leaf level is served by an
UNgrouped View and never passes through the stamp — so the marker is
unconditional rather than derived.

Two consequences worth naming:

- **`getRowId` cannot use the group-column test in tree mode.** There are no row
  group columns, so `level < groupCols.length` is false at every depth and every
  parent would be keyed off the leaf column it does not have — duplicate ids,
  which AG turns into failed blocks (warn 205). Tree rows are recognised by the
  marker instead.
- **Tree mode counts as grouped from the first block.** `setRowCount` raises AG
  error #28 whenever a row-group column exists and the error is SILENT without
  `ValidationModule`; a tree level is a group level by another name, so `grouped`
  starts true rather than being discovered from the first request.

**Master/detail reads the detail rows from the same Table.** `CustomSSRMGrid`
answers this from its client-side mirror engine, which holds every row; here
`readMatchingRows(match, limit)` builds a transient filtered View. Deliberately
**not** scoped to the grid's sort or filter: a master row must expand onto the
same children whatever else is on screen. A null match value becomes `is null`,
because `== null` matches nothing in Perspective and a master keyed on a missing
value would otherwise open onto an empty detail grid. An empty match answers
empty rather than selecting the whole book as one row's children. It truncates
at the limit rather than refusing — unlike an export, a detail panel is a
bounded surface the user is looking at.

Verified live on the 20,000-row book (`?tree=region,desk` and `?detail=1` on the
demo): three region parents at the root, eight desks under EMEA with path ids
(`EMEA/EM Debt`), leaf positions at depth 2 with `isServerSideGroup` false and
full-path ids, 840 displayed rows, 0 failed blocks. Master/detail: one detail
grid holding 200 rows (the configured limit), every one of them the master's own
book, exactly the five configured detail columns, agreeing precisely with
`readMatchingRows` called directly.

One measurement trap this produced: walking `__reactFiber$` up from a detail
grid's `.ag-root-wrapper` reaches the **master** grid's api, so the detail grid
reads as 20,001 rows spanning every book. Use `api.forEachDetailGridInfo()`,
which is AG's own registry of live detail grids.

## Exporting the whole book

`api.exportDataAsExcel()` can only see the rows in the block cache. MEASURED on
the live demo: the grid held **100** rows of a 20,000-row book, so the export
wrote 100 — a short file with nothing to say it was short, which once open in
Excel is indistinguishable from a complete one. That is the worst shape a bug
can take on this path.

`readAllRows()` is the one operation that legitimately materializes the book. It
builds a transient View from the current ROOT request — so the file carries the
sort, the column filters and the quick search the user is looking at — reads it
in 10,000-row chunks (a single `to_columns` over 20,000 x 26 would cross the
proxy as one message) and drops the View. Grouping is deliberately flattened: an
export wants leaf rows, not an interleaved group tree.

Past `maxExportRows` (200,000) it answers **null** rather than truncating, and
the caller reports instead of writing a file.

The file itself is still written by AG's own Excel writer, through a **detached
grid** that never enters the document: same column defs, same column state, but
client-side and holding every row. That is what keeps the "visual" part —
formatters, style-rule colours, column order — identical to the screen instead
of hand-rolling a spreadsheet. It is destroyed in a `finally`, because leaking
it leaks the book with it. An only-selected export keeps the original path:
selection lives on the row nodes this grid holds, so it is already complete.

Measured after the fix: 20,000 rows x 26 columns read in **547 ms**; with
`region = EMEA` and `pnl desc` applied, 6,669 rows, all EMEA, correctly ordered
— matching the engine's own filtered count.

## Quick search compiles to an expression column

`QuickSearch` pushes text with `setGridOption('quickFilterText')`, which AG
implements for the **client-side row model only** — under `serverSide` it is
stored and otherwise ignored, so the search box did nothing at all. Everything
below is measured (`scripts/quickFilterProbe1-4.mjs`), and most of it is a
finding rather than a design choice.

**It cannot be filter clauses.** AG's quick filter matches a row when every
whitespace token is found in *some* column. Clause lists are conjunctive, so the
per-token OR across columns is inexpressible. It has to be a boolean expression
column plus one clause selecting on it.

**`match(lower(string("col")), 'term')` is the only usable primitive.**
`index_of`, `search`, `like` and `ilike` do not exist in 4.5.2. `string()` wraps
every column so the same codegen serves text and numeric alike, and a null row
neither matches nor poisons the expression.

**`or` and `and` are the operators — `|` is a trap.** `|` parses happily and
then matched *every* row in the probe: a silently-wrong filter, which is worse
than no filter.

**`match` takes a REGEX, and the term cannot be escaped.** A bare `.` is already
a wildcard. A lone `(` aborts the whole View build — and `\(` fails identically,
so there is no escaping strategy available. A literal quote breaks the
single-quoted literal too, and `''` is a parse error. So user input is
**sanitized, not escaped**: every character with regex or quoting meaning becomes
`.`, which matches itself and anything else. That over-matches slightly (`3.5`
also finds `3x5`), which is the right trade for a quick search — it can never
throw and never mis-parse. Verified live: typing `(` filters to the whole book
instead of blanking the grid.

**Lookahead is not supported, and fails SILENTLY.** `(?=.*a)(?=.*b)` would have
put all tokens in one `match` per column and made cost independent of token
count. It parses and returns **zero rows** — no error. Do not reach for it.

**Cost is linear in columns × tokens, and recharged on every tick.** Measured on
20,000 rows: 5 columns 188 ms, 11 columns 307 ms, 26 columns 993 ms, 26 columns
× 2 tokens 2,408 ms. An expression column is recomputed on every Table update
for as long as the View lives, so on a ticking book that charge repeats — and in
the browser, over the proxied session and against the live sweep, 26 columns ×
2 tokens was effectively unusable. Hence **text columns only by default**
(`quickFilterAllColumns` opts back in): 11 of 26 on the demo book, and a typed
search is nearly always aiming at text anyway.

**The bridge hooks `modelUpdated`, not `filterChanged`.** Measured: changing
`quickFilterText` under `serverSide` fires `modelUpdated` only. Since that also
fires on every block load and live refresh, the handler compares against the
last value it acted on — load-bearing, because the engine answers by purging,
which fires `modelUpdated` again.

**A quick-filter change always purges.** AG does not know this filter exists, so
nothing invalidates its store; it would keep serving pre-search blocks and the
old row count.

Verified live on the 20,000-row book: `Inflation` → 3,369 rows; `Inflation EMEA`
→ 1,136, with every loaded row matching both tokens; `(` → 20,000; cleared →
20,000. Zero failed blocks throughout. One caveat worth knowing when testing: a
saturated engine takes a long time to drain, and the Perspective SharedWorker
**survives page reloads** — an expensive View built by mistake keeps starving
every later page until every port to that origin is closed.

## Set filters get their values from the Table

A set filter's checkbox list is the values it found in the row data. Under CSRM
that is the whole book. Here the client holds only the loaded blocks, so
`getFilterKeys()` returned `[]` on every column: the column filter menus were
empty and unusable, and because a saved-filter pill is captured from a live
column filter, the count badges above were unreachable too.

`distinctValues(colId)` answers it from a `group_by: [colId]` View — one row per
distinct value, computed in the worker over the whole book. Row 0 is the level
total (empty `__ROW_PATH__`), so the distinct count is `num_rows - 1`. Like
`countMatching` it builds its View outside the keyed map: a value list is not
the grid's current intent and must not retire the Views the viewport reads from.

**All-or-nothing, ceiling 50,000.** Above the ceiling it answers null and the
filter is left empty with one warning. A set filter has no "there are more"
affordance, so a truncated list renders as the whole domain and its Select All
silently excludes everything omitted — the same confidently-wrong failure this
path keeps producing. The ceiling is deliberately generous because CSRM shows
every distinct value and AG virtualises the list; measured on the live book,
`positionId` returns all 20,000 and the filter works.

Cached with a 30 s floor rather than the counts' 1 s: a column's set of distinct
values only moves when a row appears, disappears or changes category, none of
which the price-tick sweep does.

`withPerspectiveSetFilterValues` attaches the provider to **every** leaf column,
not only those declaring `filter: 'agSetColumnFilter'` — which is what
`CustomSSRMGrid`'s equivalent checks, and it misses the common case, since a
plain `filter: true` on `defaultColDef` also resolves to a set filter under AG
Grid Enterprise. A filter type with no use for `filterParams.values` ignores it.
An explicitly supplied `values` is never overwritten.

## Counting a saved filter

The saved-filter pills carry a "matches N rows" badge, which `useFilterModel`
fills from `ssrmCountMatching` on the grid `context` — a contract only
`CustomSSRMGrid` provided, so on this path the badges were simply absent. The
engine answers it now, with two constraints that shaped the implementation:

**It must not go through `getView`.** That path reads every call as the grid's
current intent and retires every live View whose shape differs. A count's shape
(a bare filter, no sort, no grouping) differs from essentially every real
request, so counting a pill would tear down the Views the grid is scrolling and
rebuild them on the next block — a badge costing a full viewport re-read. The
count builds its own View outside the keyed map, reads it once and drops it.

**A count that cannot be exact reports nothing.** `toPerspectiveFilterClauses`
drops what it cannot express, which is right for a View and wrong here: a
dropped clause inflates the number silently, and a badge reading "matches
20,000 rows" is exactly the confidently-wrong answer this path keeps producing.
`isFilterModelMappable` gates it, and `null` travels all the way out to a pill
with no badge.

Counts are cached until the Table moves, and then no sooner than
`countMinIntervalMs` (default 1 s). The recount is driven by AG's
`modelUpdated`, which fires on every block load and every live refresh; at that
rate it would put one full-book View build per pill per tick into the engine
the read path already queues behind.

## Where expressions resolve

| kind | resolves | why |
|---|---|---|
| Calculated columns | **worker** (`expressions` map) | values feed sort/filter/group/agg |
| Style rules (appearance only) | **client**, visible rows | presentational; ~100 rows not 20,000 |
| Style rules asked about the whole book | **worker** -> transient boolean expression column | `forEachNodeAfterFilter` visits nothing here |
| Style rules with cross-row context | **worker**, aggregate measured then substituted | there is no cross-row aggregate in the expression language |

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
| View manager promoted to `src/` | **done**, 21 tests |
| MarketsGridContainer wiring | **done — Milestone 2, see below** |
| Saved-filter count badges | **done**, 18 tests |
| Cell edits reaching the Table | **done**, 18 tests |
| Toolbars/profiles reaching the platform | **done**, 6 tests — see "One grid per platform" |
| Set-filter values (column filter menus) | **done**, 25 tests |
| Quick search (`quickFilterText`) | **done**, 22 tests + 4 engine probes |
| Excel export of the full book | **done**, 17 tests |
| Calculated columns as expression columns | **done**, 17 tests + engine probe |
| Alerts full-book rescan source | **done**, 8 tests |
| Style rules that must materialize worker-side | **done**, 28 tests + 4 engine probes |
| Tree data + master/detail | **done**, 24 tests; new API, not parity |
| Multi-window timings through the product path | **measured** — 4.3x on attach, see above |
| e2e spec for the Perspective surface | **done**, 7 tests (`npm run e2e:perspective`) |

`MarketsGrid` now has three surfaces: CSRM, the hand-rolled `CustomSSRMGrid`,
and `PerspectiveMarketsGridSurface`. `rowModel: 'client' | 'server' |
'perspective'` picks between them (`resolveUseSsrm` / `resolvePerspective`);
the older `useSSRM` boolean still wins where set but cannot express
`perspective`. The `ssrmEngine?: 'custom' | 'perspective' | 'auto'` prop stays
**deprecated and ignored** — it was never a seam.

## Milestone 2 — the product path

`stomp-perspective` provider → worker-held Table →
`client.attachPerspective(providerId)` → `usePerspectiveTable` →
`MarketsGridContainer` with `rowModel="perspective"` →
`PerspectiveMarketsGridSurface`. Verified live on the STOMP fixture from a
cold worker with no manual intervention: 20,000-row book, rows rendering,
34 columns, toolbar and sidebar intact, status bar reading `20,000 rows ·
live`. Demo: `apps/demos/minimal-perspective-table`.

Getting there cost five separate bugs that ALL presented identically — a grid
empty over a full Table, with nothing in any console:

1. `perspectiveHost` dropped `clear()` from its owned Table wrapper. The feed
   tests for it to decide whether a declared-schema Table survives a
   `replace`, so every snapshot deleted and rebuilt the Table and orphaned
   every attached window.
2. `viewManager` captured `entry.rows` once at View build. A blotter opens
   long before the book arrives, so its first View reported 0 forever — and AG
   sizes its store from that number.
3. AG never re-asks a store it believes is empty: with no blocks to
   invalidate, `refreshServerSide({purge:false})` reloads nothing. Needs
   `purge: true` in exactly that case, and only that case.
4. AG requests its FIRST block before `onGridReady`, so a heal scheduled while
   `api` was still null was dropped with nothing to re-arm it.
5. `open_table(name)` **resolves** for a name the engine does not hold yet
   rather than throwing. The hub attach now waits on `feed.whenReady()`.

Two more of the same family, cosmetic rather than fatal: React StrictMode's
double-invoked mount effect closed the frame port under the Table handle
(attaches are now shared and ref-counted with a linger), and AG reads the
`context` grid option once at grid creation while the engine is rebuilt
whenever the Table changes (hence `PerspectiveEngineHolder`).

Run it: `npx vite build packages/react-grid/perspective-grid/harness` then
serve `dist/` (launch config `psp-harness-preview`, port 5200).
`plumbing.html` is the 5-step proof, `blotter.html` is one blotter,
`index.html` opens three.

## What is left

**The live task list is
[`docs/PERSPECTIVE_GRID_PARITY_WORKLOG.md`](../../../docs/PERSPECTIVE_GRID_PARITY_WORKLOG.md)** —
prioritised, with effort, the open decisions, the verification recipe (always
run the CSRM twin as a control) and the traps that have already produced false
findings. Keep it there rather than here, so there is one list instead of two
that drift.

No numbered milestone remains — the path is wired end to end. What the design
names and nothing has built:

- ~~The multi-window claim is unmeasured on the product path.~~ **MEASURED** —
  see "Multi-window timings on the PRODUCT path" above. A later blotter attaches
  and paints in 191–315 ms against 1,370 ms cold (4.3x); the ~900 ms that
  remains per window is bundle boot, not the row engine.
- **`getCompiledClientWasm()`** — the window bundle still carries the whole
  inline build (5,070 kB in the demo), including the server wasm it never
  runs.
- **`StompProviderConfig` cannot send request headers**, so an app only ever
  gets the broker's default 20,000-row sweep, never the sparse profile the
  probes used.
- **The e2e spec is done** — `e2e/perspective-surface.spec.ts`, 7 tests on a
  production build against the live STOMP book. It closed the whole "unverified"
  list: formatting-toolbar actions apply AND persist across a reload, Auto
  Format re-applies the catalog, and the alerts full-book rescan reaches its
  handler. Still uncovered there: the editing toolbar, smart edit and bulk
  update end to end.
