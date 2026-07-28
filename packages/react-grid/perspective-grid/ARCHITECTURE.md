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

`worker()` throws `customElements is not defined` in a SharedWorker for
**every** endpoint argument: the browser bundle is DOM-coupled. So the
Client cannot live in the worker. Perspective's own split resolves this:

```
SharedWorker   init_server(wasm)                    no DOM required
               new ProxySession(client, onResponse) one per connected port
               session.handle_request(frame)        <- frames from a window

Window         init_client(wasm)
               worker(port) -> Client               customElements exists here
               client.handle_response(frame)        <- frames from the worker
               client.open_table(id) -> Table -> View
```

`ProxySession(client, on_response)` is the worker-side proxy for one window.
`getCompiledClientWasm()` returns a structured-cloneable `WebAssembly.Module`,
so windows 2..N receive the already-compiled module by `postMessage` and skip
both the 5MB transfer and the compile.

The windows already hold a MessagePort to the SharedWorker — that port is the
transport; the hub protocol carries Perspective frames alongside its own.

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

## Status

| step | state |
|---|---|
| Datasource (AG contract-safe) | done, 10 tests |
| Deletion-safe View lifecycle | done, 8 tests + engine probe |
| View-config translation | done, 22 tests |
| SharedWorker hosting | wasm loads; roles fixed; **plumbing unproven** |
| Worker-held Table + STOMP feed | not started |
| View manager | not started |
| MarketsGridContainer wiring | not started |

Next: prove the ProxySession plumbing end-to-end in `harness/`, then build
the harness blotter (mock 20k rows, AG Grid, 3 windows) — the first
runnable test of the claim that windowing fixes multi-blotter.
