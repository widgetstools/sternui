# Data Services Hub + IDataProvider — Design Spec

**Date:** 2026-05-28  
**Status:** Finalized (Session 1 — Phase 0 review)  
**Revisions:** 2026-05-28 — Resolved open questions (`stop`/`detach`, `refresh`/`restart`, catalog scope, inline cfg, probeStomp, identity rules).  
**Scope:** `@starui/host-data`, `@starui/host-data-react`, `@starui/widgets-react`, consumer apps, MCP scaffold templates

---

## Problem

Today the data plane splits responsibilities awkwardly:

- **SharedWorker hub** owns runtime (STOMP/mock/rest) and row cache, but not the provider **config catalog**.
- **Main-thread `ConfigManager`** loads provider definitions per view; grids pass full `cfg` on every first attach.
- **Client API** exposes low-level `subscribe(providerId, cfg)` + `replace` semantics; `MarketsGridContainer` reimplements snapshot buffering, refresh races, and grid apply logic.
- **Hub boot** is implicit (whoever imports `dataServices.ts` first); config-only UIs may never share the same entry point as streaming UIs.

OpenFin multi-window apps amplify timing issues: each view is a separate JS realm sharing one named SharedWorker.

---

## Goals

1. **Single lazy entry point:** `ensurePlatformReady(config)` → `ensureDataServicesHub(config)` — created when the first component needs **config or a data provider**. `appId` and `userId` come from a unified **`PlatformBootstrapConfig`** (OpenFin manifest or web `app-config.json`), not hardcoded literals.
2. **Hub-owned config cache:** All data-provider + AppData rows loaded once in the worker; late-connecting views do not re-fetch catalog from Dexie/REST.
3. **Uniform client contract:** `IDataProvider` with `start | stop | refresh | restart`, `getData | getConfig | getColumnDefs`, and events `onRowsReceived | onSnapshotData | onTick | onError | onStatus`.
4. **Three-layer model unchanged at transport level:** config model (`@starui/types`) → hub server (transport + cache) → client adapter (`IDataProvider`).
5. **Backward-compatible migration path:** v2 wire protocol and old hooks remain until Phase 6 completes; then deprecate.

---

## Non-goals (v1 of this refactor)

- Moving **grid profile-set** persistence (`markets-grid-profile-set`) into the worker (stays main-thread `ConfigManager` / `createConfigServiceStorage`).
- Implementing **websocket** / **socketio** transports (types exist; out of scope unless already stubbed).
- Replacing **ConfigManager** or REST sync semantics — hub uses existing `ConfigManager` inside the worker.
- **DedicatedWorker** or **leader-tab** alternatives to SharedWorker.

---

## Architecture

```text
Component (grid, editor, config browser)
  │
  ▼
ensurePlatformReady(PlatformBootstrapConfig)   ← lazy, per-window singleton promise
  │
  ▼
ensureDataServicesHub({ appId, userId, … })      ← SharedWorker attach-or-create
  │
  ▼
DataServicesHubClient                            ← MessagePort RPC
  │
  ▼
SharedWorker: SharedWorkerDataServicesHub
  ├── ConfigCatalogCache                         ← preload + invalidate
  ├── AppData (existing)
  └── Map<providerId, ProviderSlot>              ← startStomp | startMock | startRest
        │
        ▼
ProviderClientAdapter (per providerId)           ← client-facing IDataProvider
```

### Semantics

| Operation | Server behavior | Client behavior |
|-----------|-----------------|-----------------|
| **start()** | If not running: resolve cfg from catalog, `startProvider`. If running: attach subscriber only. | Register handlers; await snapshot ready. |
| **stop()** | **`detach` this subscriber** — stop fan-out to this client only; provider + cache stay running for other views. | Unsubscribe local handlers; release adapter state. |
| **refresh()** | **New:** replay hub row cache to **this** subscriber (`replace: true` deltas), **no** `provider.restart` and no upstream I/O. | Fires `onSnapshotData` with cached rows. |
| **restart(extra?)** | `handle.restart(extra)` — full re-acquire (STOMP reconnect, REST refetch, mock soft restart). | Fires loading → snapshot → ready. Maps to today's toolbar refresh (`__refresh` / `asOfDate` via `attach.extra`). |
| **getData()** | Read `slot.cache` (via RPC or client mirror). | Sync read of last snapshot mirror. |
| **getConfig()** | Read `ConfigCatalogCache`. | No main-thread Dexie round-trip. |

**Global provider teardown** (admin / explicit shutdown): `DataServicesHubBundle.stopProvider(providerId)` → wire `stop` request → `stopProvider()` in hub (transport stop + cache cleared). **Not** invoked by grid unmount or `IDataProvider.stop()`.

**Today vs target (refresh naming):** The MarketsGrid toolbar "Refresh" button currently triggers `attach` with `extra: { __refresh }` or `{ asOfDate }`, which the hub maps to **`provider.restart`**. After migration, that UX continues to call **`restart()`**, not `refresh()`. `refresh()` is a new, lighter operation for cache replay only (e.g. grid resync after layout restore without reconnecting STOMP).

### Static vs streaming

| Type | realtime | start() | onTick |
|------|----------|---------|--------|
| stomp, mock | yes | connect + snapshot + live | yes |
| rest | no | fetch once | no |
| appdata | no* | hydrate values snapshot | optional value deltas |

\*AppData continues using existing AppData mirror channel; may wrap as `IDataProvider` with `streaming: false`.

---

## Wire protocol (v2.1 additive)

Extend `packages/data/host-data/src/runtime/protocol.ts` **additively** (no breaking rename in Phase 1–4):

**Client → worker**

| Kind | Purpose |
|------|---------|
| `hub-ready` | Query: is catalog loaded? |
| `get-config` | `{ providerId }` → config row |
| `list-configs` | `{ subtype? }` → catalog slice |
| `config-invalidate` | `{ providerId? }` after editor save |
| `attach` (extended) | `cfg` optional when `providerId` in catalog |
| `refresh-provider` | Replay cache to `subId` without restart |

**Worker → client**

| Kind | Purpose |
|------|---------|
| `catalog-ready` | Catalog preload complete |
| `config-snapshot` | Response to list/get |
| `rows-received` | Progressive count during snapshot (optional aggregate) |

Existing `delta`, `status`, `stats`, AppData events unchanged.

---

## IDataProvider (public)

Location: `packages/data/host-data/src/provider/IDataProvider.ts` (exported from `@starui/host-data` and re-exported types from `@starui/types` if needed).

See implementation plan for full TypeScript surface. `IBlotterDataProvider` in `@starui/widgets-react` becomes a deprecated thin wrapper.

**Factory surface (hub bundle):**

```typescript
interface DataServicesHubBundle {
  getProvider(providerId: string): IDataProvider;
  /** Global teardown — maps to wire `stop`. Use sparingly (admin/shutdown). */
  stopProvider(providerId: string): Promise<void>;
  ready: Promise<void>;
}
```

---

## Resolved decisions (Phase 0 review)

| Question | Decision |
|----------|----------|
| **`IDataProvider.stop()` vs global stop** | `stop()` = **detach** this client (wire `detach`). Global teardown = `DataServicesHubBundle.stopProvider(id)` (wire `stop`). Matches hub test: providers stay running after last subscriber detaches until explicit `stop`. |
| **Inline cfg for editor drafts** | **Yes, indefinitely.** `attach({ cfg: draft })` when row not in catalog or unsaved draft — catalog attach is cfg-optional only for persisted `providerId`. |
| **Catalog scope** | Preload **all** `data-provider` rows — same as `DataProviderConfigStore.list()` today (platform-global, unfiltered by view). |
| **probeStomp / probeRest** | Stay **main-thread** for editor "Test Connection" in v1; hub RPC probe is a follow-up. |
| **`userId` in OpenFin prod** | Manifest pin for **dev/demo** only; production uses SSO session → platform provider forwards `userId` via `customData` on child window spawn. |
| **`appId` in view customData** | **Ignored** for hub/worker naming. Only `PlatformBootstrapConfig.appId` from manifest/json drives `mkt-data-services:${appId}`. Per-view `instanceId` stays in `customData`. |

## Platform bootstrap identity (`appId`, `userId`, config service)

Deployment identity is **not** hardcoded in app code. Both OpenFin and browser apps resolve the same internal shape before any hub or ConfigManager work runs.

### Unified config shape

```typescript
/** Resolved once at app bootstrap — before ensureDataServicesHub. */
export interface PlatformBootstrapConfig {
  /** Drives SharedWorker name `mkt-data-services:${appId}` — fixed per deployment. */
  appId: string;
  /** Session user — AppData ownership, profile scope, private provider rows. */
  userId: string;
  /** REST mode gate + URL (optional — local Dexie when omitted). */
  useRest?: boolean;
  configServiceRestUrl?: string;
  /** Optional seed for empty Dexie (dev/demo). */
  seedConfigUrl?: string;
}
```

### OpenFin — platform manifest

**Platform `manifest.fin.json` → `customSettings`** (deployment-wide, same for all views):

| Field | Location | Notes |
|-------|----------|-------|
| `appId` | `customSettings.appId` | **Must be stable** across every view in the platform |
| `useRest` | `customSettings.useRest` | Already used today |
| `configServiceRestUrl` | `customSettings.configServiceRestUrl` | Already read via `getConfigServiceRestUrlFromManifest()` |
| `seedConfigUrl` | `customSettings.seedConfigUrl` | Already used in OpenFin template |

**View `customData`** (per-window — **not** hub identity):

| Field | Purpose |
|-------|---------|
| `instanceId` | Per blotter / grid instance (profiles, grid-level data) |
| `componentType`, … | Registered component metadata |

**`userId` in production:** prefer **SSO / platform auth at session start**, then forward via `customData` when spawning child windows (pattern already in `openChildToolWindow`). Dev/demo may pin `userId` in manifest until SSO lands.

Extend `@starui/openfin-platform/config` with `resolvePlatformBootstrapFromManifest()` returning full `PlatformBootstrapConfig` (not REST URL alone).

### Web browser — config JSON at load time

Apps fetch **`/app-config.json`** (or env-specific path) at bootstrap:

```json
{
  "appId": "markets-ui-dev",
  "userId": "dev1",
  "useRest": false,
  "configServiceRestUrl": "http://localhost:3001/api/v1",
  "seedConfigUrl": "/seed-config.json"
}
```

Loader: `resolvePlatformBootstrapFromJson(url)` in `@starui/host-data` (or `@starui/host-browser`).

### Single resolver entry (both runtimes)

```typescript
// packages/data/host-data/src/bootstrap/ensurePlatformReady.ts

export async function ensurePlatformReady(
  config: PlatformBootstrapConfig,
): Promise<DataServicesHubBundle> {
  // 1. createConfigManager({ appId, identity: { userId }, configServiceRestUrl, seedConfigUrl })
  // 2. await configManager.init()
  // 3. return ensureDataServicesHub({ ...config, configManager })
}
```

Apps call **one function**; OpenFin and web differ only in **how they build `PlatformBootstrapConfig`**.

### Rules

| Field | Scope | Must match across views? |
|-------|--------|---------------------------|
| `appId` | Platform deployment | **Yes** — one SharedWorker per `(origin, appId)` |
| `userId` | Signed-in session | **Yes** — same session across views |
| `instanceId` | Grid/blotter | **No** — per component |
| REST URL | Environment | **Yes** — first hub spawner fixes worker query param |

### Migration from today’s pins

Replace hardcoded `LOGGED_IN_USER_ID` / `DEFAULT_APP_ID` in `useHostedIdentity`, `registryHostEnv`, and `@starui/types` with resolved `PlatformBootstrapConfig`, keeping **dev fallbacks** when manifest/json omits fields.

---

## OpenFin / multi-window

- Worker name: `mkt-data-services:${appId}` — `appId` from manifest `customSettings`, not per-view literals.
- Every view imports shared `src/platformBootstrap.ts` → `ensurePlatformReady()` — browser attach-or-create.
- Config-only routes (editor, Config Browser) use the **same** bootstrap so they create/connect to the hub on first need.
- `configServiceRestUrl` stamped on worker URL from resolved bootstrap **before** first `new SharedWorker`.

---

## Migration strategy

1. **Parallel APIs** — old `bootstrapDataServicesWithWorkerAsset` wraps `ensureDataServicesHub` internally.
2. **MarketsGridContainer** switches to `useDataProvider` in dedicated PR after adapter is tested.
3. **Apps** — mechanical migration checklist (one PR batch for tutorials + lab + OpenFin template).
4. **Docs / MCP scaffold** — updated in same release train as library exports.
5. **Deprecation** — `@deprecated` on `useProviderStream`, direct `subscribe(providerId, cfg)` for saved providers; remove in follow-up major.

---

## Success criteria

- [ ] Config browser / editor list providers without main-thread `DataProviderConfigStore.list` Dexie read after hub ready.
- [ ] Second OpenFin view attaches with `providerId` only; receives cache replay + live ticks.
- [ ] `refresh()` replays cache without STOMP reconnect; `restart()` reconnects (verified in stomp.test + hub.test).
- [ ] `MarketsGridContainer` LOC for subscribe/snapshot buffering reduced; uses `IDataProvider` only.
- [ ] All existing host-data unit tests green; new adapter + catalog tests added.
- [ ] Tutorial apps + markets-grid-lab + OpenFin MCP template migrated.
- [ ] OpenFin apps read `appId` / config service from manifest `customSettings`; web apps from `app-config.json`.
- [ ] No production path relies on hardcoded `LOGGED_IN_USER_ID` without bootstrap fallback.
- [ ] `docs/current-features.md` updated.

---

## Risks

| Risk | Mitigation |
|------|------------|
| Stale hub config after editor save | `config-invalidate` + optional auto-restart policy |
| First spawner REST URL wrong | Shared `platformBootstrap.ts`; manifest `customSettings` required fields documented |
| Mismatched `appId` across views | Lint/review: one `appId` per deployment; validate in MCP scaffold |
| `userId` drift between views | Platform provider forwards session userId via `customData` on spawn |
| Large catalog preload blocks worker boot | Async preload; `catalog-ready` event; views await `hub.ready()` |
| Breaking external tarball consumers | Deprecation period; re-export old API as wrappers |
