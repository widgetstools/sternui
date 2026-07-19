# ADR: Worker-hosted SSRM engine (Perspective table + views)

**Date:** 2026-07-19
**Status:** Proposed
**Supersedes (blotter data path):** push-based full-dataset delivery to every window
**Related:** [ADR-optional-data-plane-topology.md](./ADR-optional-data-plane-topology.md), [hub-fanout-optimizations.md](./hub-fanout-optimizations.md), [MARKETSGRID_WINDOWS_PERF_ANALYSIS.md](./MARKETSGRID_WINDOWS_PERF_ANALYSIS.md)

---

## Context

Today every blotter receives the **whole dataset**. The provider SharedWorker
holds one cache and fans all rows out to every subscribing window, which
builds its own AG Grid row model over them.

Measured on `star-demo` (2026-07-18/19), 20k-row positions feed:

| Observation | Value |
|---|---|
| Provider SharedWorker heap | **2–3 MB** (healthy, responsive) |
| Worker cache, serialized (projected to 16 cols) | 6.8 MB |
| Per-blotter snapshot fetch | **5.85 s** |
| Feed coverage rate (`min(rowCount, SWEEP_ROWS_PER_SEC)`) | 20,000 rows/s |
| 4 blotters at full rate | wedged — one renderer at **11 GB**, main thread pegged, DevTools unresponsive |
| 14 blotters at 2,000 rows/s | fine — median renderer 65 MB |

Two conclusions from that data:

1. **The data plane is not the bottleneck.** Workers idle at 2–3 MB while
   windows drown. The cost is in the consumer.
2. **Per-window cost scales with dataset size, not tick rate.** Throttling the
   feed made 14 blotters viable, but the 5.85 s attach is a *size* cost that
   throttling cannot touch.

Some deployments carry datasets around **250 MB**. Serialized rows become live
JS objects in AG Grid's row model at roughly 2–4× that. So:

| | Push (today) | Pull (this ADR) |
|---|---|---|
| Worker | 250 MB | 250 MB |
| Per window | 250 MB → 0.5–1 GB live | viewport + cached blocks (~5 MB) |
| 10 windows | **5–10 GB** | **~300 MB** |
| New blotter attach | copy + build full row model | fetch one block |

The existing `@wellsfargo-starui/ssrm-grid` package already contains the client
half: `SsrmEngine` (async-tolerant on every method), a complete
`WorkerInbound`/`WorkerOutbound` RPC protocol, and `applyWorkerDirtyToGrid`
(surgical-transaction vs purge-refresh). What is missing is a worker-hosted
engine and the transport between them.

`createCustomEngine` / `RowMirror` cannot fill that role as written: it holds
**one** materialised view behind a single-slot memo (`view` + `viewKey`), and
its tick optimisation depends on in-place mutation keeping that one view valid.
N blotters with distinct grouping/sort/filter would thrash the memo and force a
full filter+sort rebuild per request.

### Goals

| Goal | Measure |
|------|---------|
| One copy of the dataset per `(appId, providerId)` | Window memory independent of row count |
| New blotter opens without a full-dataset transfer | Attach ≈ one block fetch, not O(dataset) |
| N blotters with distinct group/sort/filter | Cost scales with distinct view signatures, not window count |
| Live ticks update all views | One upstream update propagates to every view |
| Correct aggregates under ticks | Including MIN/MAX, without full rescans |

### Non-goals

- Replacing `MarketsGrid` (client-side row model) for small/static datasets.
- Changing the STOMP/REST provider contract or the config catalog.
- Pivot parity in the first phase (`split_by` deferred).
- Removing the push path — it stays for grid-only and small-dataset consumers.

---

## Decision

Host the SSRM engine **inside the provider SharedWorker**, backed by a
**Perspective `Table` with multiple `View`s**. Windows hold no dataset; they
request row blocks and receive dirty notifications.

### Topology

```text
        STOMP / REST upstream
                 │
                 ▼
 ┌───────────────────────────────────────────────┐
 │  starui-provider:{appId}:{providerId}         │
 │                                               │
 │   Perspective Table  (index = keyColumn)      │  ← ONE copy
 │        │        │        │                    │
 │      View A   View B   View C                 │  ← per (signature + groupKeys)
 │        │        │        │                    │
 │   view.on_update ─► dirty coalescer           │
 └────────┬────────┬────────┬────────────────────┘
          │        │        │   MessagePort (WorkerInbound/Outbound)
      ┌───▼──┐ ┌───▼──┐ ┌───▼──┐
      │Blot 1│ │Blot 2│ │Blot N│   viewport + loaded blocks only
      └──────┘ └──────┘ └──────┘
```

### Engine hosting — separate worker (decided 2026-07-19)

The Perspective server runs in its **own** SharedWorker,
`starui-psp:{appId}:{providerId}`, using Perspective's prebuilt
`perspective-server.worker.js` — public API, verified in Phase 0b.

Rejected alternative: embedding the server inside `starui-provider:*`. That
needs `PerspectiveServer` + `compile_perspective` from
`@finos/perspective/src/ts/wasm/engine.ts` — **internal** modules outside the
package's public exports, coupling us to unversioned paths and requiring `.ts`
from `node_modules` in the worker build. It saves one hop *per update batch*
(not per window, not per dataset). Revisit only if profiling shows the hop
matters.

**Port hand-off.** Chromium does not expose the `SharedWorker` constructor in
worker scopes, so the provider worker cannot connect to the engine worker
itself. A window performs the introduction and then leaves the data path:

```text
  window: new SharedWorker(psp)  → port
  window: provider.postMessage({kind:'psp-attach'}, [port])   ← transferred
  ─────────── main thread now OUT of the data path ───────────
  provider ──── rows ────►  starui-psp:{appId}:{providerId}
  windows  ──── getRows / on_update ────►  (own ports, same worker)
```

`MessagePort` is transferable, so after hand-off rows never touch a main
thread. Each window opens its **own** connection to the same named worker for
reads. Only the first window needs to link; the provider ignores duplicate
attaches, so a racing second window is harmless.

> Verify: the nested-`SharedWorker` restriction is the premise for the
> hand-off. If a future Chromium exposes it in worker scopes, the provider
> could connect directly and the window drops out of setup entirely. The
> hand-off works either way, so this is an optimisation, not a correctness
> risk.

### Table

- One `perspective.Table` per `(appId, providerId)`, created with
  `index: <keyColumn>` so `table.update(rows)` is a **keyed upsert** — the same
  semantics the hub cache has today.
- The provider's existing row cache becomes the loader: snapshot →
  `table.replace()`, live frames → `table.update()`.
- `projectFields` still applies **before** the table: narrower columns mean a
  smaller table and cheaper views.

### Views

Views are keyed and cached, **not** created per window:

```
viewKey = hash(filterModel, sortModel, rowGroupCols, valueCols, groupKeys)
```

- Blotters sharing a configuration share a `View`. Ten blotters typically
  collapse to a handful of signatures.
- **Group expansion is not mirrored into Perspective.** AG Grid SSRM keeps
  expand state per window and requests children by path (`groupKeys:
  ['EMEA','Bonds']`). Each such request is served by a View `filter`ed to that
  path and grouped by the *next* level. Expand state therefore stays entirely
  client-side, where AG Grid already owns it.
- Views are engine resources and are **not** garbage collected: the cache is
  LRU-bounded with explicit `view.delete()` on eviction and on last-subscriber
  detach.

### Request mapping

| `SsrmGetRowsRequest` | Perspective |
|---|---|
| `startRow` / `endRow` | `view.to_columns({ start_row, end_row })` |
| `sortModel` | `sort` |
| `filterModel` | `filter` / `expressions` (see `filters/perspectiveExpr.ts`) |
| `rowGroupCols` | `group_by` |
| `valueCols` | `aggregates` |
| row count for block sizing | `view.num_rows()` |
| `groupKeys` | `filter` on the group path + `group_by` next level |

Aggregation — including MIN/MAX — is maintained incrementally by the engine.
This is the single largest reason to prefer Perspective over extending
`RowMirror`: MIN/MAX are not incrementally reversible, so a hand-rolled engine
needs a per-group multiset or a rescan on every tick that touches an extremum.

### Tick flow

1. Upstream frame → provider cache → `table.update(rows)` (one call, all views).
2. Perspective recomputes affected views incrementally and fires `on_update`
   per view.
3. A **per-view coalescer** accumulates dirty ranges and flushes on the
   provider's existing `throttleMs` — never per tick.
4. Flush emits `DirtyMessage` to that view's subscribers, carrying the
   transaction when it is a leaf update/add.
5. Client runs `applyWorkerDirtyToGrid` — surgical SSRM transaction where
   possible, purge refresh for structural change. **This code already exists.**

A window is only messaged when the dirty range intersects blocks it has
loaded. With a ~100-row viewport over 20k+ rows, most ticks produce no message
for most windows — the property push-based fan-out can never have.

### Protocol — use Perspective's own client/server transport

**Refined after the Phase 0 spike.** Perspective 3.x already ships a
client/server split with a multiplexing session model, so we do **not** need to
hand-roll RPC over `WorkerInbound` / `WorkerOutbound`:

| Side | API |
|---|---|
| Provider SharedWorker | `init_server(perspective-server.wasm)`; one `Client`; `client.new_proxy_session(onResponse)` per connecting window |
| Window | `init_client(perspective-js.wasm)`; `new Client(sendRequest)`; inbound → `client.handle_response(msg)` |
| Transport | existing MessagePort — window → `session.handle_request(msg)`, worker → `onResponse` → `port.postMessage` |

Each window gets its own `ProxySession`; closing a window closes its session.
`Table` and `View` handles obtained from the window's `Client` are proxies —
method calls round-trip to the worker automatically.

`SsrmEngine` is then implemented **in the window, on top of the Perspective
client** — `getRows` → `view.to_columns({ start_row, end_row })`, and so on. It
stays the seam that lets `CustomSSRMGrid` be engine-agnostic, but it no longer
needs a bespoke wire protocol. `WorkerInbound` / `WorkerOutbound` remain the
contract for the **custom** (non-Perspective) engine in Phase 1.

WASM payloads (measured, 3.8.0): **`perspective-server.wasm` 2.2 MB** (worker
only) and **`perspective-js.wasm` 0.2 MB** (per window) — materially smaller
than the "multi-MB per window" this ADR originally assumed.

---

## Consequences

### Positive

- Window memory becomes independent of dataset size; 250 MB datasets stop
  multiplying by window count.
- New blotters open in one block fetch instead of a full-dataset transfer.
- Sorting, filtering, grouping and aggregation happen once per signature in
  compiled code rather than N times in JS across N main threads.
- Columnar Arrow storage is materially smaller than JS objects for the same
  rows, shrinking the single worker copy too.
- Retires hand-rolled machinery for the SSRM path: `RowMirror`,
  `mirrorGroupAgg`, `patchLoadedGroupAggregates`, `materializeCalcColumns`.

### Negative / costs

- A multi-MB WASM payload per provider SharedWorker (N providers = N copies).
- A second engine to reason about, version, and debug; WASM stack traces are
  poorer than JS.
- Filter/sort/aggregate translation is real work; `perspectiveExpr.ts` is a
  partial head start, not a finished mapping.
- Views must be explicitly disposed — a leaked view is a leaked engine
  allocation, invisible to JS heap tooling.
- Pivot (`split_by`) semantics differ from AG Grid's; deferred.

### Risks

| Risk | Mitigation |
|---|---|
| **Perspective WASM may not initialise inside a SharedWorker** | **Gating spike — see Phase 0b.** Encouraging signal: `worker()`'s signature accepts `SharedWorker` explicitly, and `init_server()` initialises server WASM in the *current* context. Prior art (`PerspectiveStressGrid`) uses `perspective.worker()`, which spawns a *nested* dedicated worker — not the target shape. |
| View cache growth with many expanded groups | LRU bound + explicit `delete()`; dedupe by signature |
| Worker becomes the new bottleneck under many distinct sorts | Cost scales with distinct signatures, not windows; measure with a 250 MB set before committing |
| Divergence between push and pull blotters | `SsrmEngine` is the single contract; both paths feed from the same provider cache |
| Aggregate/format parity with current blotters | Parity checklist against `MarketsGrid` conditional styling, calc columns, traffic-light aggs |

---

## Migration sequence

| Phase | Work | Exit criteria |
|---|---|---|
| **0a** | ~~Data model: one indexed table, N concurrent views, one update → all views, windowed reads, incremental aggregates~~ | ✅ **Done 2026-07-19** — see "Phase 0a results" below |
| **0b** | ~~Gating spike: `init_server` + WASM inside a real SharedWorker; two windows on one table~~ | ✅ **Done 2026-07-19** — passed; see "Phase 0b results" below |
| **1** | `SsrmEngine` implemented on the Perspective client (`getRows` → `view.to_columns`, filter/sort/group translation); view cache + LRU | One blotter pulls blocks from the worker-hosted table; group/sort/filter/agg parity on a 20k set |
| **3** | Wire the provider cache to `table.update()`; per-view dirty coalescer on `throttleMs` | Live ticks reach N blotters with distinct views; no per-tick messaging |
| **4** | `MarketsGridContainer` opt-in path; profile/customizer parity | A star-demo blotter runs pull-based end to end |
| **5** | Measure with a 250 MB dataset × 10 blotters; decide default | Window memory flat in dataset size |

**Phase 1 was originally a custom-engine transport step** — proving MessagePort
RPC with no new dependency, as a hedge against Phase 0b failing. Phase 0b
passed and Perspective's own client/server transport handles the wiring, so
that step is dropped: there is no bespoke protocol left to prove.

### Phase 0a results (2026-07-19, `@finos/perspective` 3.8.0, Node)

A 2,000-row table indexed on `positionId`, with three concurrent views —
flat+sorted, `group_by: [desk]`, and `filter: desk==EMEA` + `group_by: [sector]`:

| Claim | Result |
|---|---|
| `update()` is a keyed upsert | `table.size()` stayed 2000 (no duplicate row) |
| N concurrent views of different shapes | 2000 / 4 / 3 rows respectively |
| One `update()` propagates to all views | `on_update` fired on **all three** |
| Windowed read = SSRM `getRows` | `to_columns({start_row, end_row})` returns the block |
| Aggregates update incrementally | group `max(px)` 149 → 9999 |
| **MIN/MAX recomputed when the extremum leaves** | 9999 → **149** — correct fallback |

The last row is the decisive one: it is the case that forces a per-group
multiset or a rescan in any hand-rolled engine, and it is handled internally.
This is the primary justification for choosing Perspective over extending
`RowMirror` to multi-view.

Spike script retained at
`<scratchpad>/psp-spike.mjs`; port it into `ssrm-grid` tests when Phase 1 lands.

### Phase 0b results (2026-07-19, Chromium/OpenFin, 20k rows)

`apps/demos/markets-grid-lab/perspective-spike.html` — Perspective's prebuilt
`perspective-server.worker.js` hosted as a **SharedWorker**, two windows
attached.

| | Window 1 | Window 2 |
|---|---|---|
| SharedWorker server boot | 102–124 ms | 102 ms |
| Table | **CREATED** 20k rows, 118 ms | **ATTACHED — no build, no copy** |
| `table.size()` | 20,000 | 20,000 |
| Concurrent views | flat 20k / byDesk 4 / emea 2 | same, independently configured |
| Block read `to_columns({0,100})` | 2.4 ms | 2.9 ms |
| One `update()` → views | 3/3 | 3/3 |
| Keyed upsert holds size | ✅ | ✅ |

**The gate is passed.** Perspective's server WASM initialises and runs inside a
SharedWorker; a second window attaches to the existing table rather than
building its own, and holds its own views over it.

Against the measured push-path baseline this is the whole argument:

| Per-blotter data acquisition | Today (push) | Pull |
|---|---|---|
| 20k rows | **5.85 s** (full snapshot) | **2.4 ms** (100-row block) |

Dataset construction happens **once per provider**, not once per window.

### End-to-end results (2026-07-19, live STOMP feed, 20k rows)

`apps/demos/markets-grid-lab/perspective-spike.html` — the real modules
(`ProviderTableBridge`, `createPerspectiveEngine`, `PerspectiveViewCache`)
against `stomp-view-server`, two windows, one Perspective SharedWorker.

| | Feeder window | Reader window |
|---|---|---|
| Role | elected by Web Lock | attached |
| Worker attach | 94 ms | 152 ms |
| Rows available | 20,000 | 20,000 |
| **25-row block read** | **0.8 ms** | **1.3 ms** |
| Upstream rows consumed | 85,662 | **0** |
| STOMP connections | 1 | **0** |

The reader took **no snapshot, opened no connection, and holds no dataset** —
it reads viewports off the table the feeder built, and computes its own
grouping and aggregates over it. Group sums differ between windows because
each reads the live table at its own instant.

**Read cost tracks write churn** — the one real caveat:

| Write rate into the table | 25-row block read |
|---|---|
| static (no writes) | 0.7 ms |
| ~4k rows/s (`SWEEP_ROWS_PER_SEC=2000`) | **0.8 – 1.3 ms** |
| ~44k rows/s (server default, at its ceiling) | **137 – 174 ms** |

A sorted view is invalidated by every write, so at extreme write rates
Perspective re-sorts on essentially every read. At realistic feed rates this is
a non-issue; at 20× realistic it costs ~150 ms — still ~40× better than the
5.85 s push path, but the effect is real and worth knowing for capacity
planning. Mitigations if a feed genuinely runs that hot: raise the bridge
`flushMs` (fewer, larger writes), sort on fewer columns, or accept a
briefly-stale sort.

**Verified by this run:** table hosting in a SharedWorker; attach-not-copy for
the Nth window; `__ROW_PATH__` → group-row mapping, `childCount`, and the
root-row offset; incremental group aggregates under live updates; and the
bridge's conflate-and-flush behaviour (434 rows per flush from a stream
arriving far faster).

---

## Compliance checklist

- [ ] `@wellsfargo-starui/grid` still has no SharedWorker import
- [ ] Views are disposed on detach and on LRU eviction (no engine leaks)
- [ ] Dirty notifications are coalesced per view, never emitted per tick
- [ ] A window receives messages only for blocks it has loaded
- [ ] Group expand state stays client-side; not mirrored into Perspective
- [ ] `projectFields` applied before the table, not after
- [ ] `docs/current-features.md` updated when each phase lands

---

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| Extend `RowMirror` to multi-view | Requires hand-rolling incremental aggregation including the MIN/MAX rescan problem, plus a per-signature index registry — re-implementing what Perspective already provides |
| Keep push, shrink payload (thin deltas, columnar) | Already done; attack per-*tick* cost. The 5.85 s attach and per-window dataset copy are *size* costs that encoding cannot remove |
| SSRM with a client-side engine per window | Still copies the dataset into every window — the exact cost being eliminated |
| One provider worker per blotter | Multiplies upstream connections and caches; violates the singleton rule in the data-plane ADR |
| Perspective's own datagrid instead of AG Grid | Abandons the customizer, profiles, conditional styling, and the entire MarketsGrid feature surface |

---

## References (code anchors)

- Engine contract: `packages/react-grid/ssrm-grid/src/engine/types.ts` (`SsrmEngine`, `SsrmEngineKind`)
- Current engine: `packages/react-grid/ssrm-grid/src/engine/customEngine.ts`, `ssrm/rowMirror.ts` (single-view: `view` + `viewKey`)
- Worker protocol: `packages/react-grid/ssrm-grid/src/ssrm/types.ts` (`WorkerInbound` / `WorkerOutbound`)
- Client refresh strategy: `packages/react-grid/ssrm-grid/src/ssrm/applyWorkerDirtyToGrid.ts`
- Filter translation head start: `packages/react-grid/ssrm-grid/src/filters/perspectiveExpr.ts`
- Vestigial seam: `custom/columnOverride.ts` (`perspectiveExpression` / `perspectiveType`, currently discarded)
- Provider worker host: `packages/data/host-data/src/runtime/providerWorker/installProviderHub.ts`
- Prior art (nested worker, own datagrid): `apps/demos/markets-grid-lab/src/tabs/altGrids/PerspectiveStressGrid.tsx`
- Feed rate mechanics: `apps/demos/stomp-view-server/src/stomp/liveBatcher.ts` (coverage floor is elapsed-time based; `rate` controls chunking only)
