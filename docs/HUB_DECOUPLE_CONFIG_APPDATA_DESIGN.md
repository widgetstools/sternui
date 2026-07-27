# Decoupling the data hub from Config + AppData — design & phased plan

> Goal: make the SharedWorker **data hub** independent of config and
> AppData, so the hot tick/fan-out thread stops competing with
> config/AppData work — and config + AppData can live in their own
> **cold-state worker**. Written 2026-07-27, grounded in a trace of the
> current code on `performance-check` (off `main`).
> Companion context: [`MARKETSGRID_WINDOWS_PERF_ANALYSIS.md`](./MARKETSGRID_WINDOWS_PERF_ANALYSIS.md),
> [`hub-fanout-optimizations.md`](./hub-fanout-optimizations.md).

## Why

The window-open-under-load diagnosis found the single data-services
SharedWorker multiplexes three workloads on one thread with no priority:
the **live tick fan-out** (hot), the **new-window snapshot replay**, and
the **control plane** (config resolution, AppData resync, introspect).
Under a hot feed the tick path starves everything else — which is why
opening windows and tool panels degrades exactly when updates are heavy.

The clean structural fix is **two SharedWorkers**:

- **Data hub** — STOMP + row cache + fan-out. Hot path, sole tenant.
- **Cold-state worker** — Config + AppData. Loaded once, served from
  memory, single IndexedDB writer, warm-anchored by the provider process.

Main thread stays thin. This doc is about the *first, hard* half: making
the hub not need config/AppData at all, so the split is even possible.

### Load once, serve many — and be REST-ready (decided)

This mirrors the legacy app: config + AppData are loaded **once** (in the
OpenFin dock/provider at startup) and windows fetch them centrally (legacy:
via **IAB**; framework: via the cold-state worker's **MessagePort**, the
same-origin equivalent — cheaper than IAB, shared memory, no per-message
bus hop).

Two consequences that are now **requirements, not options**:

1. **Config must be loaded once and served from memory — never fetched
   per window.** The current Dexie/IndexedDB store is a stop-gap; a
   **REST-based config service** is coming. If each window created its own
   `ConfigManager` and fetched config independently, that is **N REST
   round-trips per app launch** — precisely the cost to avoid. So config
   belongs in the **cold-state worker** (single fetch + in-memory cache +
   serve), NOT main-thread per window. *(This settles open question #3.)*
2. **The config store must be source-abstracted.** The cold-state worker
   loads from a swappable source — **Dexie today, REST tomorrow** — behind
   a stable interface. Windows never touch the source; they always read
   through the worker. Swapping Dexie→REST changes ONE thing (the worker's
   loader), not every window. The worker is the single fetcher/cache/fan-out
   — the "dock loader" of the legacy design, moved into a same-origin
   SharedWorker.

## The entanglement today (why it's not a clean lift)

The data hub is **not** hot-path-only. It owns **provider resolution and
config serving**, and that depends on both stores:

1. **Config resolution.** When a window starts/reads a provider, the hub
   resolves `providerId → config` from its own `ConfigCatalogCache`
   (`configCatalog.ensure(req.providerId)`, `hub:477`; also
   `handleGetConfig`, `listProviderConfigs`). The hub is effectively the
   config *server* for windows.
2. **Template resolution.** The hub resolves the `{{name.key}}` templates
   inside that config against its own `WorkerAppDataStore`
   (`startProvider(cfg, emit, { appDataLookup: (n,k) => this.appData.get(n,k) })`,
   `hub:1041-1042`), before the transport dials STOMP.
3. **Boot.** The worker entry itself creates a `ConfigManager` and
   hydrates BOTH catalog and AppData in-worker
   (`defaultEntry.ts:67-86` → `hub.hydrateCatalog()` + `hub.hydrateAppData()`).

There is also **duplication**: the window ALREADY has a main-thread
`ConfigManager` and an `AppDataMirror`, and already resolves config +
templates window-side for its column defs (`useResolvedCfg`). So config
and AppData are resolved in *two* places today — window (for display) and
hub (for the transport).

Because the hub *consumes* config/AppData, you cannot just move the
stores out: the hub would have to call back into the cold worker to
resolve every provider, and worker↔worker calls need a window to bridge
them — adding hops to the path we're trying to lighten.

## The key seam that makes this tractable

`client.subscribe(providerId, cfg)` **already accepts a resolved config**
(`ProviderClientAdapter.ts:112`; used today only for inline drafts), and
`startProvider(cfg, …)` already runs off a passed `cfg`. So the change is
not a new protocol — it's: **have the window ALWAYS resolve the config
(it already can) and pass it, and make the hub use the passed config
instead of re-resolving.** Once nothing in the hub resolves, the stores
have no hub consumer and can leave.

## Target architecture — three planes, one resolver, source-abstracted

Separate by **data velocity**, resolve at the **edge**, abstract the
**source**:

```
┌───────────────────────── Window (edge) ─────────────────────────┐
│  THE ONLY RESOLVER: config + AppData → fully-resolved sub request │
│  thin sync mirrors (AppData for template resolution) + the grid   │
└───────┬───────────────────────────────────────────┬──────────────┘
        │ reads (get/subscribe)                       │ subscribe(resolvedConfig)
        ▼                                             ▼
┌─────────────────────────┐                 ┌─────────────────────────┐
│  Config/AppData plane    │                 │  Market-data plane       │
│  (cold SharedWorker)     │                 │  (hot SharedWorker)      │
│  source-abstracted cache │                 │  PURE transport+cache    │
│  load once · serve all   │                 │  config-FREE · fan-out   │
│  ConfigSource: Dexie│REST │                 │  sole tenant of thread   │
└─────────────────────────┘                 └─────────────────────────┘
```

Three principles do the work:

1. **One resolver, at the edge.** The window is the *only* place that
   combines config + AppData into a resolved subscription. The data plane
   never sees config, AppData, or `{{templates}}` — it receives a
   self-contained resolved request and returns rows. Kills today's
   duplication (window resolves for colDefs, hub resolves for transport)
   and is what lets the data plane be config-free.

2. **Source abstraction — `ConfigSource`.** The cold plane is a cache
   behind an interface, not "the Dexie worker":
   ```ts
   interface ConfigSource {
     load(): Promise<Snapshot>;
     subscribe(onChange): Unsub;   // Dexie change events OR REST push (SSE/ws)
     save(row): Promise<void>;
   }
   ```
   Dexie is one impl; the REST config service is another. Swapping them
   changes **one class**, not every window. The REST impl can also carry
   **server-originated** AppData changes (another user edits a shared
   value) via push → fan out to windows — a property Dexie can't have.
   This is the answer to "REST is coming, per-window fetch is expensive":
   fetch once, cache, subscribe for changes.

3. **Separate by velocity, each sole-tenant.** Hot streaming and cold
   shared state never share a thread, so neither starves the other. The
   cold plane is the framework's **dock**: loads once, serves all
   same-origin windows over MessagePort — the legacy dock+IAB pattern,
   done natively and cheaper than IAB (shared memory, no bus hop).

Plane responsibilities:

- **Market-data plane (hot SharedWorker):** receives resolved configs,
  runs the transport, caches + fans out. No `ConfigCatalogCache`, no
  `WorkerAppDataStore`, no catalog-invalidate. Sole tenant of its thread.
- **Config/AppData plane (cold SharedWorker):** owns config + AppData for
  the windows behind a `ConfigSource`. The existing `AppDataMirror` API
  (`attach/get/set/subscribe`, sync `get`) is transport-agnostic
  (`AppDataMirror.ts` depends only on a `send` callback) — only its port
  changes from the hub to the cold worker.
- **Window (edge):** the single resolver (`providerId → config →
  templates`), holding thin sync mirrors so template resolution stays
  synchronous on the render path (never an async worker hop on render).

### Not fixed by this: the firehose-per-window ceiling

Even perfectly separated, in the **push** model *every* window still
decodes the whole tick stream (`hub-fanout-optimizations.md` §10: "window
count × stream rate must fit total machine capacity"). That is the deepest
multi-blotter *steady-state* limit, it is **orthogonal** to config/AppData,
and the only structural answer is a **viewport/pull data plane** — one
worker-hosted book, each window reading only what it displays (what SSRM
reached for before it tangled with AG's server-side row model). Out of
scope here; recorded as the explicit **future lever** for the firehose
ceiling. Revisit only if steady-state multi-blotter cost remains the pain
after the cold/hot split + the conflation defaults already shipped.

## What moves / stays / dies

| Concern | Today | After |
|---|---|---|
| Provider resolution (`providerId → cfg`) | hub `configCatalog.ensure` | **window** (main-thread ConfigManager) |
| Template resolution (`{{n.k}}`) | hub `appDataLookup` | **window** (AppDataMirror sync `get`) |
| Config serving to tool windows (`listProviderConfigs`, `getProviderConfig`) | hub RPC | **cold-state worker** (or main-thread ConfigManager) |
| AppData store + fan-out | hub `WorkerAppDataStore` | **cold-state worker** |
| catalog-invalidate (`wireWorkerCatalogSync`) | pings hub | pings **cold-state worker** (or unneeded) |
| Row cache + live fan-out | hub | **hub (unchanged)** |
| `AppDataMirror` (window API) | attaches to hub | **attaches to cold worker** — API unchanged |

## Correctness invariants (must hold at every phase)

- **I1 — a provider always dials with a fully-resolved config.** No
  `{{name.key}}` reaches the transport (`assertAppDataResolved` in
  `stomp.ts` stays as the guard).
- **I2 — one resolution source of truth.** After P2, only the window
  resolves; the hub must not silently fall back to a stale catalog.
- **I3 — AppData stays consistent cross-window.** A write in one window
  still fans out to all (the `AppDataMirror` contract), just via the cold
  worker.
- **I4 — restart/asOfDate still re-resolves.** `restart(extra)` must
  re-resolve window-side and pass the new config (today it re-reads via
  `getProviderConfig`, `ProviderClientAdapter.ts:130-153`).
- **I5 — drafts still work.** Inline (uncatalogued) configs already pass
  through the same seam; they must keep working unchanged.

## Phased plan (each phase ships green: `turbo typecheck test`)

- **P0 — this doc.**
- **P1 — Window passes the config; hub prefers it. (REFINED — couples
  with P3's config-read move.)** The seam already exists: `handleAttach`
  does `req.cfg ?? this.configCatalog?.getProviderConfig(id)` (hub:553)
  and `client.subscribe(id, cfg)` forwards `cfg`. BUT the trace shows the
  window currently *reads* config **through the hub**
  (`useDataServices()` → `client.getProviderConfig`, host-data-react:200),
  not from a main-thread ConfigManager — so "pass a config the window
  read locally" requires first **moving config reads to the main-thread
  ConfigManager** (P3's config-serving half). P1 therefore coalesces with
  that: (a) `useDataProviderConfig`/`useDataProvider` read the raw config
  from the main-thread ConfigManager (which already exists as
  `boot.platform.configManager`), (b) pass it as `req.cfg` to `subscribe`,
  (c) the hub uses it for provider start, catalog untouched.
  **asOfDate/templates are NOT touched here** — the hub keeps resolving
  `{{...}}` via `appDataLookup` + `extra.asOfDate` (hub:587-615) until P2,
  so historical mode is unaffected. Pass the **raw** (unresolved) config,
  not the template-resolved `activeCfg`, which also sidesteps the
  AppData-tick identity churn (`useDataProvider` memoizes on `inlineCfg`
  identity). Instrument the hub's catalog path to confirm it goes cold.
- **P2 — Hub stops resolving templates.** Remove `appDataLookup` from
  `startProvider` (the passed cfg is pre-resolved). `assertAppDataResolved`
  now guarantees I1 from the window side. Delete the hub's template path.
- **P3 — Hub stops resolving/serving config.** Route `getProviderConfig`
  / `listProviderConfigs` (tool windows) to the main-thread ConfigManager
  (or the cold worker in P4), not the hub catalog. Drop the hub's
  `configCatalog.ensure` from the start path. `buildIntrospectSnapshot`'s
  provider list re-sourced or slimmed.
- **P4 — Stand up the cold-state worker, behind `ConfigSource`.** New
  SharedWorker hosting Config + AppData as a cache behind the
  **`ConfigSource`** interface (`load` / `subscribe` / `save`) — Dexie
  impl first, so REST is a later one-class swap, not a retrofit. Hydrate
  once, serve from memory, single writer, warm-anchored by the provider
  process, treated as a **subscription client** (load + subscribe-for-
  changes) so REST push works later without re-architecting. Point
  `AppDataMirror`'s `send` at it (API unchanged). Move
  `wireWorkerCatalogSync` to it.
- **P5 — Remove config/AppData from the hub.** Delete
  `ConfigCatalogCache`, `WorkerAppDataStore`, `hydrateCatalog`,
  `hydrateAppData`, the AppData handlers, and the `configManager` arg from
  `defaultEntry`/`installSharedWorkerHub`. Hub is pure transport + cache,
  sole tenant of its thread. `resyncAppDataFromStore`-on-attach is gone
  with it.
- **P6 — Verify + soak.** Multi-window + hot-feed + tool-window-open
  timing before/after; confirm the hub thread no longer does config/
  AppData work; AppData cross-window convergence e2e.

Order rationale: the window becomes the resolver **before** anything is
removed from the hub (P1), so every later deletion is dead-code removal,
not a behaviour change. The cold worker (P4) lands after the hub no longer
resolves, so it only has to serve windows — never the hub.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Window-side resolution misses a case the hub handled (e.g. asOfDate overlay, inline drafts) | P1 keeps the hub fallback + instruments it; only remove once the fallback is provably never hit |
| Two config sources drift (main-thread vs hub catalog) during P1–P3 | catalog-invalidate keeps them aligned until P5 removes the hub copy; single source after |
| AppData `get()` must stay synchronous for template resolution on the render path | `AppDataMirror` already provides sync `get` from a local mirror; the cold worker feeds the mirror, it does not replace the sync read (never an async worker hop on render) |
| Cold worker dies when last window closes → re-hydrate cost | warm-anchor with one long-lived client (provider process), same pattern the data hub uses |
| Provider process realm/origin forks the SharedWorker | documented constraint; same as the data hub today |

## Open questions (settle before P1)

1. **asOfDate / restart overlay — TRACED, needs care in P1.** asOfDate
   flows TWO ways today: (a) as a restart `extra.asOfDate` param
   (`useProviderDataWiring.ts:333`, `MarketsGridContainer.tsx:664` →
   `provider.restart({ asOfDate })`), AND (b) as an **AppData template**
   `{{positions.asOfDate}}` in the config, resolved against AppData
   (`MarketsGridContainer.tsx:100-102`). So a window-resolved config
   already bakes the asOfDate value into the config via the template.
   **Risk:** if the window passes the resolved config AND restart still
   passes `extra.asOfDate`, asOfDate could be applied twice / conflict.
   P1 must trace how the transport consumes `extra.asOfDate` vs the config
   field and reconcile them (likely: keep `extra` as the restart trigger,
   let the baked template be the value — but verify) before making the
   window the sole resolver. Getting this wrong breaks historical loading.

2. **`activeCfg` identity stability.** `useDataProvider` memoizes the
   adapter on `inlineCfg` IDENTITY (`useDataProvider.ts:40`), and
   `useResolvedCfg` returns a NEW object on every AppData version bump.
   Passing `activeCfg` raw would re-create the adapter (re-attach the
   provider) on every AppData tick. P1 must **content-stabilize
   `activeCfg`** before threading it through (the same fix already proven
   on the SSRM path: memoize on the JSON content, not the reference).
2. **`buildIntrospectSnapshot`:** who still needs it after P3, and can its
   provider list come from the main-thread ConfigManager?
3. ~~**Cold worker vs main-thread for config serving.**~~ **DECIDED —
   cold worker.** Config is loaded once and served from memory, never
   fetched per window (legacy dock+IAB pattern; and a per-window REST fetch
   is the expense to avoid). Config store is source-abstracted (Dexie →
   REST) behind the worker. See "Load once, serve many" above.

4. ~~**Same-origin assumption.**~~ **DECIDED — single same-origin app**
   (confirmed 2026-07-27). The cold-state SharedWorker is therefore the
   **sole** distribution path: one worker serves every window via
   MessagePort, the clean same-origin replacement for the legacy dock+IAB.
   No cross-origin / multi-app companion (IAB or per-window REST) is needed.
   If a future multi-app/cross-origin surface appears, revisit — a
   SharedWorker cannot span origins.

## Not in scope

The snapshot-replay-memo rework and the conditional-styling flash are
separate perf items tracked in the perf analysis doc; this migration is
purely the config/AppData decoupling.
