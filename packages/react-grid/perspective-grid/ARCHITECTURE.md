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

**Sort and filter, server-side, six permutations** (sort, sort+filter, filter
swap, clear): every change rebuilt the right View — `sector == 'Energy'`
3,333 rows, `quantity > 5000` 5,050 rows — every block settled, nothing
wedged. `maxConcurrentDatasourceRequests` was left at its default of 2, so a
single leaked `getRows` would have shown up as a dead grid.

Not measured here: frame timing during a real scroll. `harness/blotter.mjs`
has the scripted scroll test, but it needs a **visible** window —
`requestAnimationFrame` is starved in a hidden tab and AG Grid defers row
rendering to it.

## Status

| step | state |
|---|---|
| Datasource (AG contract-safe) | done, 10 tests |
| Deletion-safe View lifecycle | done, 8 tests + engine probe |
| View-config translation | done, 22 tests |
| SharedWorker hosting | **done — plumbing proven end-to-end** |
| Worker-held Table + per-window View | **done (mock book)** |
| View manager | done in `harness/`, not yet promoted to `src/` |
| Harness blotter, 3 windows | **done — see Milestone 1 above** |
| STOMP feed into the worker-held Table | not started |
| MarketsGridContainer wiring | not started |

Run it: `npx vite build packages/react-grid/perspective-grid/harness` then
serve `dist/` (launch config `psp-harness-preview`, port 5200).
`plumbing.html` is the 5-step proof, `blotter.html` is one blotter,
`index.html` opens three.

Next: promote `harness/viewManager.mjs` into `src/`, then feed the worker-held
Table from STOMP.
