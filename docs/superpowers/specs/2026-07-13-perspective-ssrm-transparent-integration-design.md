# Perspective as Transparent SSRM Cache for MarketsGrid

**Date:** 2026-07-13  
**Status:** Proposed (reference for implementation in StarUI)  
**Related:** [MARKETSGRID_VS_ADAPTABLE_GAP_ANALYSIS.md](../../MARKETSGRID_VS_ADAPTABLE_GAP_ANALYSIS.md) (SSRM gap), [STOMP_DATAPROVIDER_MARKETSGRID_GUIDE.md](../../STOMP_DATAPROVIDER_MARKETSGRID_GUIDE.md), [ARCHITECTURE.md](../../ARCHITECTURE.md)  
**Reference engine:** `/Users/develop/wfh/agssrm/.worktrees/perspective-aggrid-ssrm` (AG Grid Enterprise + FINOS Perspective WASM SSRM prototype from the same design thread)

---

## 1. Purpose

This document captures background, architecture decisions, and an implementation plan to give StarUI **Server-Side Row Model (SSRM)** behaviour **transparently**:

- Users still open `HostedMarketsGrid` / `MarketsGridContainer` and select a STOMP (or other) provider.
- For SSRM-capable providers, **FINOS Perspective** becomes the **single in-browser row cache and query engine**.
- The grid no longer materializes a full CSRM `rowData` copy per blotter.
- Multiple blotters attached to the same `providerId` share **one** Perspective `table`.

It is intentionally written so an agent or engineer can execute from StarUI without needing the original chat session.

---

## 2. Background and context

### 2.1 What StarUI does today

There is **no** class literally named `StompDataProvider`. STOMP is a **transport** under the SharedWorker hub; React code consumes **`IDataProvider`**.

```
STOMP WebSocket
  → SharedWorker hub (keyed row cache + fan-out)
    → ProviderClientAdapter (IDataProvider)
      → useProviderDataWiring
        → onSnapshotData → api.setGridOption('rowData', rows)
        → onTick         → api.applyTransactionAsync({ add, update })
          → MarketsGridSurface (CSRM, rowData prop)
```

Key files:

| Path | Role |
|------|------|
| `packages/data/host-data/src/provider/IDataProvider.ts` | Client contract: snapshot / tick / lifecycle |
| `packages/data/host-data/src/runtime/providers/transports/stomp.ts` | STOMP snapshot + live deltas |
| `packages/react-core/widgets-react/.../useProviderDataWiring.ts` | Provider → AG Grid CSRM |
| `packages/react-core/widgets-react/.../applyProviderToGrid.ts` | Tick → add/update classification |
| `packages/react-grid/grid/src/widget/MarketsGridSurface.tsx` | `AgGridReact` + `rowData` (CSRM only) |
| `packages/react-grid/grid/src/widget/ensureAgGridModules.ts` | `AllEnterpriseModule` (AG Grid **35.1**) |

Documented gap ([gap analysis](../../MARKETSGRID_VS_ADAPTABLE_GAP_ANALYSIS.md)):

> Server-Side Row Model — Client-side row model only; data services do snapshot+tail — **~30%** coverage if SSRM is required.

Settings already expose `ssrmExpandAllAffectsAllRows`, but the grid **never** sets `rowModelType: 'serverSide'`.

### 2.2 What we learned in the agssrm prototype

A dedicated worktree proved Perspective WASM can act as an AG Grid SSRM “server” in a **dedicated browser Worker**:

- STOMP ingest → flatten → `table.update` / `replace`
- AG `getRows` → map filter/sort/group/pivot → Perspective `view` → shaped blocks
- Live ticks → throttled `refreshServerSide` (or leaf `applyServerSideTransaction` when flat)
- Filtered aggregates for `col/agg(col)` formatters stamped as `__ssrm_aggs` / `totals`
- Quick filter, Advanced Filter (with expression OR), export via `queryAll`, etc.

**Important packaging lessons:**

1. Perspective’s browser engine expects a **dedicated `Worker`**, not SharedWorker-native hosting.
2. Nested `perspective.worker()` defaults assume `window`; inside a Vite worker you must pass an explicit nested server worker URL.
3. Running Perspective **inside** StarUI’s SharedWorker hub is fragile (nested Worker limitations). Prefer: hub = transport/fan-out; Perspective = dedicated worker.

### 2.3 Mental model (agreed)

Perspective does **not** sit “next to” the STOMP provider as a second full cache.

> **Perspective `table` replaces the grid’s `rowData` cache** the way hub/`setRowData` does today — but shared and queryable.

| | STOMP + CSRM (today) | STOMP + Perspective SSRM (target) |
|--|--|--|
| Shared store | Hub row Map | Perspective `table` keyed by `providerId` |
| Per blotter | Full CSRM `rowData` copy | Only loaded SSRM blocks |
| Live updates | `applyTransactionAsync` into each grid | `table.update` **once** → dirty → refresh/query |
| Filter/sort/group/pivot/agg | In-memory on each grid | Perspective views |

**Rule:** for a given provider session, **never** dual-materialize hub JS row Map **and** Perspective table. Choose one row store.

---

## 3. Goals and non-goals

### Goals

1. **Transparent** — no end-user “enable SSRM” workflow for normal blotters; policy/capability flips the path.
2. **Single cache** — one Perspective table per `providerId`; N blotters share it.
3. **Preserve STOMP + hub** — connection lifecycle, catalog, multi-subscriber attach/detach stay.
4. **Dual-mode** — CSRM remains default for small/mock providers until SSRM path is proven.
5. **Reuse agssrm query stack** — port filters/query engine/aggregates rather than rewrite.

### Non-goals (initial phases)

- Rewriting all MarketsGrid customizer modules on day one.
- Hosting Perspective WASM inside the SharedWorker process.
- Multi-tab single WASM instance across browsers (leader election / remote Perspective server can come later).
- Matching every AdaptableQL aggregate expression on the server.

---

## 4. Target architecture

```
┌─ Window / OpenFin view ──────────────────────────────────────────────┐
│  HostedMarketsGrid A ─┐                                              │
│  HostedMarketsGrid B ─┼─ useProviderDataWiring (SSRM branch)         │
│                       │     rowModelType: serverSide                 │
│                       │     serverSideDatasource ─────────────┐      │
└───────────────────────┴───────────────────────────────────────┼──────┘
                                                                │ RPC
┌─ SharedWorker (hub) ──────────────────────────────────────────┼──────┐
│  STOMP transport  →  (no full row Map for SSRM providers)      │      │
│  fan-out: status / dirty / rowsReceived                        │      │
│  attach(providerId) subscribers                                │      │
└───────────────────────────────┬────────────────────────────────┼──────┘
                                │ Arrow / rows transfer (once)   │
                                ▼                                ▼
                     ┌─ Dedicated Worker: PerspectiveEngine ─────────┐
                     │  tables.set(providerId, Table)                 │
                     │  replace / update from STOMP                   │
                     │  getRows / getFilterValues / getAggregates     │
                     │  queryAll / getSeriesData                       │
                     └────────────────────────────────────────────────┘
```

### 4.1 Capability / config flag

Extend provider config / capabilities (names illustrative):

```ts
// ProviderCapabilities or ProviderConfig
rowStore?: 'memory' | 'perspective';  // default 'memory' = CSRM today
// or
ssrm?: {
  enabled: boolean | 'auto';          // auto → enable when snapshotRows >= threshold
  cacheBlockSize?: number;            // e.g. 100
  thresholdRows?: number;             // e.g. 5000 for 'auto'
};
```

Persistence: ConfigService / provider editor checkbox advanced section (“Query engine: Client | Perspective SSRM | Auto”).

### 4.2 Wiring fork (`useProviderDataWiring`)

| Event | CSRM (`memory`) | SSRM (`perspective`) |
|-------|-----------------|----------------------|
| Snapshot | `setGridOption('rowData', rows)` | `engine.replace(providerId, rows)` + `refreshServerSide({ purge: true })` |
| Tick | `applyTransactionAsync` | `engine.update(providerId, rows)` + dirty → refresh / leaf SSRM tx |
| Mount | `rowData={EMPTY}` | `rowModelType='serverSide'` + shared datasource for `providerId` |
| Unmount | detach subscriber | detach subscriber; **do not** delete table while others attached |

### 4.3 Shared table lifecycle

```ts
refCount[providerId]++
on first attach + start → ensureTable + allow STOMP to feed engine
on last detach → optionally table.delete() / freeze after idle TTL
```

All blotters with the same `providerId` in the same window share one Worker client and one `Table`.

### 4.4 What stays client-side

- `valueFormatter`, `cellClassRules` (consume `__ssrm_aggs` / `context.aggregates`)
- Column layout, theme, profiles, OpenFin/FDC3
- Excel/CSV **file** writing after `queryAll` returns rows

### 4.5 What must run in Perspective

- Filter / Advanced Filter / set-filter distincts  
- Sort (incl. abs-sort convention)  
- Row grouping to leaf, pivot + `pivotResultFields`  
- Aggregations + filtered `sum/avg/min/max/count` for `col/agg(col)`  
- Quick filter (OR contains across text cols)  
- Full-set export / chart series  

---

## 5. Package and file plan

### 5.1 New package (recommended)

`packages/data/perspective-engine` (`@starui/perspective-engine`)

| Module | Source to port from agssrm |
|--------|----------------------------|
| `ssrmFilters.ts` | `apps/web/src/workers/ssrmFilters.ts` |
| `ssrmQueryEngine.ts` | `apps/web/src/workers/ssrmQueryEngine.ts` |
| `perspectiveHost.ts` | `apps/web/src/workers/perspectiveHost.ts` |
| `sumTotals` / agg specs | `apps/web/src/workers/sumTotals.ts` |
| `shareOfTotal.ts` | `apps/web/src/ssrm/shareOfTotal.ts` (grid helpers) |
| Worker entry + RPC types | `perspective-ssrm.worker.ts`, `ssrm/types.ts` |
| Datasource factory | `createPerspectiveDatasource.ts` |

Align **AG Grid types** with StarUI **35.1** (or bump StarUI to 36 in the same change-set as importing agssrm 36 code). Prefer matching StarUI first to reduce blast radius.

Dependencies: `@finos/perspective` (pin compatible with agssrm lessons; currently 3.8.x in prototype), `ag-grid-community` peer.

### 5.2 StarUI touch points

| Area | Change |
|------|--------|
| `ProviderCapabilities` / `dataProvider` types | `rowStore` / `ssrm` config |
| Hub transport path | For perspective providers: stream into engine instead of (or instead of keeping) row Map |
| `useProviderDataWiring.ts` | Branch CSRM vs SSRM |
| `MarketsGridSurface.tsx` / `MarketsGridProps` | Optional `rowModelType`, `serverSideDatasource`, omit `rowData` when SSRM |
| `ensureAgGridModules.ts` | Ensure SSRM modules registered (if not already via AllEnterpriseModule) |
| Demo app | `apps/demos/...` flag-driven SSRM STOMP blotter |
| Docs | Link from STOMP guide + gap analysis |

### 5.3 Hub vs engine responsibility split

```
Hub owns:   WebSocket, catalog, attach/detach, status, optionally raw message parse
Engine owns: Table schema, replace/update, getRows mapping, aggregates, filter values
Grid owns:  SSRM UI, formatters, profiles, toolbars
```

Do **not** keep a second full `Record[]` cache in the hub for `rowStore: 'perspective'`.

---

## 6. Phased implementation plan

### Phase 0 — Spike (1–3 days)

**Goal:** Prove shared Perspective table + one MarketsGrid SSRM path behind a flag.

- [ ] Scaffold `@starui/perspective-engine` with host + worker skeleton.
- [ ] Port minimal `getRows` (leaf + simple filter/sort) from agssrm.
- [ ] Demo: attach mock/STOMP → engine.replace → SSRM grid shows blocks.
- [ ] Two grids, same `providerId`, confirm **one** table / one memory footprint (rough heap check).

**Exit:** Demo runs; dual blotters share table; flag off restores CSRM.

### Phase 1 — Dual wiring in product path

**Goal:** `useProviderDataWiring` + surface support both modes without UX change.

- [ ] Add `rowStore` / `ssrm` to provider config types + editor (advanced).
- [ ] CSRM path unchanged (default).
- [ ] SSRM path: no `setRowData`; set datasource; `refreshServerSide` on dirty.
- [ ] Ref-count table lifecycle on attach/detach.
- [ ] `getRowId` / `keyColumn` parity with CSRM (`composeRowId`).

**Exit:** Same `HostedMarketsGrid` API; config flips path.

### Phase 2 — Query parity (core blotter)

**Goal:** Filter / sort / group / pivot / aggs good enough for FI blotters.

- [ ] Port `ssrmFilters` (date, set, multi, advanced, OR expressions).
- [ ] Port group + pivot mapping (`split_by`, child counts, auto-group sort remap).
- [ ] Port `getAggregates` + `__ssrm_aggs` stamping; wire `context.aggregates`.
- [ ] Set filter distincts via `getFilterValues`.
- [ ] Quick filter → worker OR-across-columns (do not use CSRM `quickFilterText` alone).
- [ ] Tick strategy: grouped → refresh routes; flat → optional `applyServerSideTransaction`.

**Exit:** Checklist vs CSRM demo (group by desk/book, filter date/set, pivot currency, live ticks).

### Phase 3 — Transparent policy

**Goal:** Users don’t choose SSRM for large feeds.

- [ ] `ssrm.enabled: 'auto'` when `snapshotRows >= threshold` (configurable).
- [ ] Document behaviour in STOMP guide.
- [ ] Capability advertisement so modules can feature-detect.

**Exit:** Large STOMP providers auto-SSRM; small/mock stay CSRM.

### Phase 4 — Module hardening

**Goal:** Don’t break customizer features silently.

| Module | Action |
|--------|--------|
| ExpressionEngine calc cols | Compile subset → Perspective `expressions`; else disable/warn |
| Export | Route through `queryAll` (agssrm `exportAllViaAgGrid` pattern) |
| Smart-edit / bulk update | Patch via engine.update + SSRM tx; gate if unsupported |
| Alerts / conditional style | Prefer stamped aggs; avoid full client scans |
| Linking / FDC3 | Document unloaded SSRM leaves |

**Exit:** Capabilities matrix documented; unsupported actions hidden or no-op with toast.

### Phase 5 — Cross-window (optional later)

- Leader tab / OpenFin service owns Perspective worker; SharedWorker proxies RPC  
- **Or** Perspective Node/Python server for true multi-process share  

Out of scope until single-window shared table is solid.

---

## 7. Testing strategy

- **Unit:** port agssrm Vitest suites for filters / query mapping / shareOfTotal.
- **Integration:** hub mock transport → engine → datasource `getRows` shapes.
- **Demo e2e:** Playwright — two blotters, one provider, filter one grid, assert other still shares live ticks without double memory blow-up heuristics.
- **Perf:** snapshot size N (2k / 20k); compare CSRM vs SSRM heap and interaction latency (filter/group).

---

## 8. Risks and decisions

| Risk | Mitigation |
|------|------------|
| Dual cache by accident | Hard invariant: perspective providers skip hub row Map |
| SharedWorker + nested WASM | Dedicated engine worker only |
| AG Grid 35 vs 36 API drift | Match StarUI 35.1 for first port; bump intentionally later |
| Feature assumptions on CSRM | Capability flags; dual-mode |
| Schema / flatten FI fields | Reuse StarUI column defs / field catalog; map types to Perspective schema |
| OpenFin multi-view | Same window share first; cross-window Phase 5 |

### Open decisions (resolve in Phase 0/1)

1. **Idle TTL** before deleting an unused Perspective table after last detach?  
2. **Arrow vs JSON** on the hub → engine boundary (Arrow preferred for large snapshots)?  
3. **Auto threshold** default (e.g. 5_000 rows)?  
4. Upgrade StarUI AG Grid to 36 now vs later?

---

## 9. Port checklist (from agssrm worktree)

Copy/adapt from  
`/Users/develop/wfh/agssrm/.worktrees/perspective-aggrid-ssrm/apps/web/src/`:

```
workers/ssrmFilters.ts
workers/ssrmQueryEngine.ts
workers/perspectiveHost.ts
workers/sumTotals.ts
workers/perspectiveExpr.ts
workers/perspectiveWorkerPolyfill.ts
workers/perspective-ssrm.worker.ts
ssrm/types.ts                    # trim to engine RPC surface
ssrm/createPerspectiveDatasource.ts
ssrm/shareOfTotal.ts
ssrm/exportAllViaAgGrid.ts       # optional Phase 4
ssrm/refreshAllLoadedStores.ts
data/calculatedColumns.ts        # optional; StarUI may use ExpressionEngine instead
```

Do **not** port the agssrm React App, Toolbar, or vendored STOMP server as product code — StarUI already has hub + demos.

---

## 10. Success criteria

1. Two MarketsGrids on the same STOMP `providerId` share one Perspective table (no per-grid full `rowData`).  
2. Filter / sort / row-group / pivot execute in Perspective (SSRM `getRows`).  
3. Live ticks update the shared table once; both grids refresh coherently.  
4. Default small providers still use CSRM unchanged.  
5. No user-facing “switch to SSRM” required when policy is `auto` / provider-flagged.  
6. Docs updated; gap-analysis SSRM line can move from “major gap” toward implemented.

---

## 11. Suggested first PR sequence

1. **`feat(perspective-engine): scaffold package + leaf getRows`**  
2. **`feat(host-data): perspective rowStore feed path (no dual Map)`**  
3. **`feat(widgets-react): SSRM branch in useProviderDataWiring`**  
4. **`feat(grid): MarketsGridSurface serverSide mode`**  
5. **`feat(demos): SSRM STOMP blotter behind flag`**  
6. **`feat(perspective-engine): filters/group/pivot/aggs parity`**  
7. **`feat(providers): auto policy + capabilities`**  

---

## 12. References

- StarUI STOMP + MarketsGrid guide: `docs/STOMP_DATAPROVIDER_MARKETSGRID_GUIDE.md`  
- AdapTable gap (SSRM): `docs/MARKETSGRID_VS_ADAPTABLE_GAP_ANALYSIS.md` §4.11  
- Hub fan-out notes: `docs/hub-fanout-optimizations.md`  
- Canvas summary (Cursor): `starui-ssrm-perspective.canvas.tsx` in agssrm Cursor project canvases  
- Prototype: `agssrm` worktree `feature/perspective-aggrid-ssrm`  

---

*Document produced from the 2026-07-13 agssrm Perspective SSRM + StarUI architecture discussion. Treat as the source of truth for Phase 0–4 implementation in this repo.*
