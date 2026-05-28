# Data Services Hub + IDataProvider — Design Spec

**Date:** 2026-05-28  
**Status:** Approved for implementation planning  
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
ensureDataServicesHub(appId)          ← lazy, per-window singleton promise
  │
  ▼
DataServicesHubClient                   ← MessagePort RPC
  │
  ▼
SharedWorker: SharedWorkerDataServicesHub
  ├── ConfigCatalogCache                ← preload + invalidate
  ├── AppData (existing)
  └── Map<providerId, ProviderSlot>     ← startStomp | startMock | startRest
        │
        ▼
IDataProvider adapter (per providerId)  ← client-facing uniform API
```

### Semantics

| Operation | Server behavior | Client behavior |
|-----------|-----------------|-----------------|
| **start()** | If not running: resolve cfg from catalog, `startProvider`. If running: attach subscriber only. | Register handlers; await snapshot ready. |
| **stop()** | Global: `stopProvider(id)` — tear down transport + clear cache. | Unsubscribe all local handlers. |
| **refresh()** | Replay hub row cache to **this** subscriber (replace deltas), no upstream I/O. | Fires `onSnapshotData` with cached rows. |
| **restart()** | `handle.restart(extra)` — full re-acquire. | Fires loading → snapshot → ready. |
| **getData()** | Read `slot.cache` (via RPC or client mirror). | Sync read of last snapshot mirror. |
| **getConfig()** | Read `ConfigCatalogCache`. | No main-thread Dexie round-trip. |

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

---

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
