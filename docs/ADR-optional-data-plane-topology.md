# ADR: Optional data-plane topology (lazy named SharedWorkers)

**Date:** 2026-07-18  
**Status:** Proposed  
**Branch:** `docs/optional-data-plane-topology`  
**Supersedes (runtime topology):** monolithic `mkt-data-services:${appId}` hub hosting config catalog + AppData + all streaming providers  
**Related:** [hub-fanout-optimizations.md](./hub-fanout-optimizations.md), [MARKETSGRID_WINDOWS_PERF_ANALYSIS.md](./MARKETSGRID_WINDOWS_PERF_ANALYSIS.md), [CONFIG_SERVICE_BASELINE.md](./CONFIG_SERVICE_BASELINE.md), [guides/platform-bootstrap-config.md](./guides/platform-bootstrap-config.md), [ARCHITECTURE.md](./ARCHITECTURE.md)

---

## Context

Today one SharedWorker per `appId` (`mkt-data-services:${appId}`) hosts:

- Config catalog cache + worker `ConfigManager`
- `WorkerAppDataStore` (session / named KV)
- Every streaming data provider (STOMP / REST / mock) + fan-out

That design optimizes for a single upstream connection and shared cache, but creates three product problems:

1. **Forced orchestration** — hosted demos use `FullGate` → `ensurePlatformReady` so even Config Browser / Data Providers pay for the full data plane before paint.
2. **Bottleneck** — live fan-out and late-join replay share one worker thread; a hot MarketsGrid feed can delay new OpenFin windows and other providers.
3. **Non-optional stack** — consumers who only want MarketsGrid (or only Config + OpenFin) are pushed toward the same hub bootstrap.

Cross-provider needs today are narrow but real:

- Streaming providers resolve `{{name.key}}` against **AppData** at start/restart.
- Providers load **config rows** from the catalog (cfg-free attach).
- Grids / tools read AppData and config on the main thread via mirrors / `ConfigManager`.
- Providers do **not** read each other’s row caches (except mock universe in-process).

### Goals

| Goal | Measure |
|------|---------|
| MarketsGrid usable standalone | No SharedWorker, no Config, no OpenFin required |
| Config + OpenFin without data plane | Tool windows do not spawn provider workers |
| Isolation under load | Hot provider A must not starve Config or provider B |
| No huge app setup | Apps call library APIs; named workers are created on first use |
| Sub-second OpenFin window open | Chrome + interactive shell &lt; 1s; data fill may continue after |
| Preserve single-upstream semantics | One SharedWorker instance per `providerId` per `appId` |

### Non-goals (this ADR)

- Provider→provider row joins as a default platform feature (explicit derived provider later if needed).
- Replacing Dexie/IndexedDB as the config persistence store.
- Changing AG Grid / MarketsGrid rendering contracts.
- Immediate deletion of the current hub (migration is phased).

---

## Decision

Replace the monolith hub with **role-split, lazy, named SharedWorkers** and **optional client entry points**. Nothing spawns a SharedWorker until a capability is actually used. Windows never manage a mesh by hand — the client library resolves well-known names.

### Topology

```text
                    ┌─────────────────────────────┐
                    │  starui-config:{appId}      │  Config SharedWorker
                    │  Dexie authority + catalog  │  (optional, lazy)
                    └──────────────┬──────────────┘
                                   │ get / list / invalidate / subscribe
          ┌────────────────────────┼────────────────────────┐
          │                        │                        │
┌─────────▼──────────┐  ┌──────────▼─────────┐  ┌──────────▼──────────┐
│ starui-appdata:    │  │ starui-provider:   │  │ starui-provider:    │
│ {appId}            │  │ {appId}:{idA}      │  │ {appId}:{idB}       │
│ Named KV / session │  │ upstream+cache+fan │  │ upstream+cache+fan  │
└─────────┬──────────┘  └──────────┬─────────┘  └──────────┬──────────┘
          │                        │                        │
          │   {{name.key}}         │ MessagePorts           │
          └────────────────────────┤ (many subscribers)     │
                                   │                        │
                    ┌──────────────▼────────────────────────▼──┐
                    │  Window clients (grid, tools, editors)   │
                    │  Thin router / createXClient APIs        │
                    └──────────────────────────────────────────┘
```

### Named worker contracts

| Worker | Name | Owns | Created when |
|--------|------|------|----------------|
| Config | `starui-config:{appId}` | IndexedDB/Dexie config authority, catalog cache, invalidate fan-out | First `createConfigClient(appId)` / Config Browser / profile load |
| AppData | `starui-appdata:{appId}` | Named KV bags, snapshot/delta to mirrors, template lookup RPC | First AppData read/write or provider that declares `{{…}}` deps |
| Provider | `starui-provider:{appId}:{providerId}` | One upstream, one row cache, fan-out to all subscribers of that id | First `subscribe(providerId)` / live probe — **not** on route enter |

**Singleton rule:** for a given `(appId, providerId)` there is exactly one provider SharedWorker in the origin. Multiple windows attach; they do not each open a new upstream.

**Router rule:** each window uses one client façade (`createPlatformClients` / existing `DataHubProvider` evolution). The façade multiplexes to named workers. Apps must not open N SharedWorkers manually.

### Consumer profiles (locked)

| Profile | Mount | SharedWorkers | Example |
|---------|-------|---------------|---------|
| **P0 — Grid only** | `@wellsfargo-starui/grid` + caller-supplied `rowData` / SSRM API | None | Embed MarketsGrid in a foreign app |
| **P1 — Config + OpenFin** | Config client + OpenFin runtime | Config only | Workspace setup, Config Browser, dock tools |
| **P2 — Hosted blotter** | Grid + Config + AppData + subscribed providers | Config + AppData + **only active** provider ids | `star-demo` MarketsGrid view |
| **P3 — Full lab** | P2 + Data Provider editor / probe | Same as P2; provider SW on probe/start | Data Providers tool |

`@wellsfargo-starui/grid` must not import SharedWorker bootstrap. Hosted wiring lives in `@wellsfargo-starui/widgets-react` / `@wellsfargo-starui/host-data` / app shells.

### Cross-access rules (locked)

| Need | Allowed mechanism | Forbidden |
|------|-------------------|-----------|
| Provider needs config row | Provider SW → Config SW `getProviderConfig` on start/restart | Embedding ConfigManager inside every provider SW as a second Dexie writer on the hot path |
| Provider needs session / `{{name.key}}` | Provider SW → AppData SW (declared dependency keys; local cache + deltas) | Reading another provider’s row cache for templates |
| UI needs AppData | Main-thread mirror attached lazily via `useAppData*` | Requiring AppData SW to open MarketsGrid |
| Provider A rows → Provider B | Out of scope unless a future **derived provider** ADR | Ambient cross-cache reads / silent joins |
| Config Browser edits provider | Write via Config client → invalidate → only that provider SW reloads | Broadcasting full hub restart |

AppData remains a **platform KV service**, not a streaming registry provider. Streaming registry stays `mock` / `stomp` / `rest` (and future types).

### Sub-second OpenFin window open (locked)

**Definition:** from user action to visible, interactive chrome (shell + primary chrome controls) in under **1000 ms** on a warm machine with an already-running platform provider. Live snapshot fill is **not** part of the open SLA.

| Rule | Requirement |
|------|-------------|
| R1 | `createWindow` / `createView` / navigate must not `await` provider SharedWorkers or snapshot replay |
| R2 | Tool routes (Config Browser, Data Providers UI chrome, Workspace Setup) must not use today’s `FullGate` data-plane await; use Config-only (or paint-then-hydrate) |
| R3 | Provider SharedWorkers spawn on **subscribe** or **explicit probe/start**, never merely because a tool route mounted |
| R4 | Prefer attach to an already-running named Config SW (platform provider may warm it once in background) |
| R5 | First paint may show a lightweight loading shell; blocking spinners that wait on hub+catalog+AppData before any chrome are non-compliant |
| R6 | Opening tools from a hot blotter toolbar may still be delayed by the blotter’s main thread; dock/platform actions must not share that event loop |

Target budgets (guidance, not CI gates yet):

| Step | Budget |
|------|--------|
| Attach to warm named SharedWorker | ~50–200 ms |
| Cold Config SW + first local Dexie read | ~200–500 ms |
| Provider connect + snapshot | After open; not on open path |

### Public API intent (library surface)

```ts
// Standalone — zero infra
<MarketsGrid rowData={rows} />

// Lazy config
const config = createConfigClient({ appId });

// Lazy provider (multi-subscriber SharedWorker behind the façade)
const feed = createProviderClient({ appId, providerId });
feed.subscribe({ onSnapshot, onDelta, onStatus });

// Optional AppData
const appData = createAppDataClient({ appId });
```

Hosted apps compose these. `ensurePlatformReady()` either becomes a thin “warm Config + optional AppData” helper for P2 shells or is superseded by explicit `ensureConfigReady` / `ensureProvider(id)` without implying all providers.

### Dual ConfigManager

Today main + worker both open Dexie. Under this ADR:

- **Config SharedWorker** is the preferred authority for catalog reads used by provider workers.
- Main-thread `ConfigManager` remains for UI CRUD in the short term, but writes must invalidate the Config SW (same as today’s `wireWorkerCatalogSync`, retargeted).
- Longer term: UI may speak only to the Config client (single writer in the worker) to remove dual-CM contention — tracked as a follow-up, not a gate for Phase 1.

---

## Consequences

### Positive

- Hot feeds isolate to their own worker thread.
- Config / tool windows stop competing with live fan-out.
- Grid-only and Config-only consumers are first-class.
- Attach to warm named workers keeps multi-window open fast.

### Negative / costs

- More processes and MessagePort hops (Config / AppData RPC instead of in-process `appDataLookup`).
- Provider start must tolerate AppData/Config briefly unavailable (retry/backoff on start only — not per tick).
- Migration must keep the monolith hub working until façades are complete (compatibility shim).
- Mock shared-universe joins across provider ids need an explicit redesign if still required.

### Risks

| Risk | Mitigation |
|------|------------|
| Connection storm (N providers × M windows) | Lazy spawn; façade demux; do not pre-create all provider SWs |
| Template resolution latency on restart | Cache declared `{{…}}` keys in provider SW; AppData pushes deltas |
| Accidental FullGate regression | Lint/review rule + demo route audit; ADR R2 |
| Name collisions across apps | `appId` always in the SharedWorker `name` |

---

## Migration sequence

| Phase | Work | Exit criteria |
|-------|------|----------------|
| **0** | Keep monolith; QoS (provider `throttleMs` defaults, prioritize attach/replay over live, Config Browser off FullGate) | **Done on this branch:** star-demo ConfigGate / DeferredDataGate + hash-aware warm; STOMP default `throttleMs` 50ms; hub defers post-ready live fan-out during late-join/refresh replay and (in production) schedules live fan-out on a macrotask so attach can interleave. |
| **1** | Formalize AppData + Config as service boundaries inside the hub (RPC-shaped APIs, no behavior change) | **Done on this branch:** `AppDataService` + `ConfigCatalogService` façades; hub/providers use `appData.lookup` / catalog service only; wire protocol unchanged. |
| **2** | Extract **Config** SharedWorker + `createConfigClient`; retarget invalidate | **Done on this branch:** `starui-config:{appId}` worker + `createConfigClient` / `wireConfigWorkerCatalogSync`; `ensureConfigReady({ configWorkerScriptUrl })`; star-demo ConfigGate warms Config SW. Data hub still keeps a local catalog cache (invalidate dual-path); full single-writer cutover is a follow-up. |
| **3** | Extract **AppData** SharedWorker + mirror attach | **Done on this branch:** `starui-appdata:{appId}` worker + `createAppDataClient` / `AppDataMirror` attach + `appdata-lookup` RPC; `ensureConfigReady({ appDataWorkerScriptUrl })`; star-demo warms AppData SW. Data hub still keeps in-process AppData for streaming providers (dual until Phase 4). |
| **4** | Extract **per-provider** SharedWorkers + façade; shrink/remove monolith hub | **Done (4a–4d cutover path):** provider SW + AppData bridge on attach; `ensurePlatformReady({ providerWorkerScriptUrl })` → `getProvider` / `useDataProvider` demux; star-demo pilots provider workers for blotter subscribe. Monolith hub retained for catalog + AppData mirror + inspector (full delete is a later cleanup). |
| **5** | (Optional) derived-provider ADR if product needs row-level cross-provider access | Explicit API; not ambient |

Phase 0 may ship on `main` independently; Phases 2–4 are the topology change this ADR accepts.

---

## Compliance checklist (for future PRs)

- [ ] `@wellsfargo-starui/grid` has no SharedWorker / `ensurePlatformReady` import
- [ ] New tool routes do not await provider workers before first paint
- [ ] New streaming providers register as named `starui-provider:{appId}:{id}` singletons
- [ ] `{{…}}` resolution goes through AppData client/service, not ad-hoc globals
- [ ] Docs: `platform-bootstrap-config.md` and `current-features.md` updated when phases land
- [ ] Demo profiles documented: grid-only, config+openfin, hosted blotter

---

## Alternatives considered

| Alternative | Why rejected |
|-------------|--------------|
| Keep one hub; only add QoS | Necessary short-term (Phase 0) but does not give optional profiles or isolate Config from hot feeds |
| One SharedWorker per window | Loses single-upstream + shared cache; multiplies broker load |
| Spawn a new worker per config read | Slower than a long-lived named Config SW; defeats sub-second attach |
| Put AppData inside Config SW only | Attractive for fewer processes; rejected as the *only* option — AppData churn must not block catalog UI; prefer separate AppData SW (may co-locate later if profiling allows) |
| Central orchestrator process that boots all workers | Reintroduces forced setup; violates P0/P1 |

---

## References (current code anchors)

- Hub: `packages/data/host-data/src/runtime/worker/SharedWorkerDataServicesHub.ts`
- Phase 1 services: `AppDataService.ts`, `ConfigCatalogService.ts` (same folder)
- Worker name: `packages/data/host-data/src/runtime/bootstrap/createDataServicesWorker.ts` (`mkt-data-services:${appName}`); provider SW: `providerSharedWorkerName` → `starui-provider:{appId}:{providerId}`
- Bootstrap gates: `apps/demos/star-demo/src/main.tsx` (`ConfigGate` / `FullGate` / `DeferredDataGate`)
- AppData: `WorkerAppDataStore` (via `AppDataService`), dedicated SW `starui-appdata:{appId}` (`AppDataHub` / `createAppDataClient`), `AppDataMirror`, `{{…}}` via `runtime/template/resolver.ts` (+ `appdata-lookup` RPC for cross-process)
- Provider SW (Phase 4a): `runtime/providerWorker/` — `ProviderHub` wraps monolith slot logic for one id; `createProviderClient`
- Catalog sync: `packages/data/host-data/src/hub/wireWorkerCatalogSync.ts`