# Data Services Hub + IDataProvider — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the data plane so a lazy SharedWorker hub (keyed by `appId` + origin) preloads Config Service catalog, hosts all provider server instances, and exposes a uniform client `IDataProvider` API — replacing per-view config reload and low-level `subscribe(providerId, cfg)` for production grids.

**Architecture:** Three layers — (1) config models in `@starui/types`, (2) `SharedWorkerDataServicesHub` + `ConfigCatalogCache` + existing transports, (3) `DataServicesHubClient` + `ProviderClientAdapter` implementing `IDataProvider`. Entry points: **`PlatformBootstrapConfig`** (OpenFin manifest or web `app-config.json`) → **`ensurePlatformReady()`** → **`ensureDataServicesHub()`**.

**Tech Stack:** TypeScript, SharedWorker, MessagePort RPC, Vitest, `@starui/host-config` ConfigManager, existing STOMP/mock/rest transports.

**Spec:** [`../specs/2026-05-28-data-services-hub-idataprovider-design.md`](../specs/2026-05-28-data-services-hub-idataprovider-design.md)

**Worklog:** [`../worklogs/2026-05-28-data-services-hub-idataprovider.md`](../worklogs/2026-05-28-data-services-hub-idataprovider.md) — session index for incremental implementation on branch `feat/data-services-hub-idataprovider`.

**Estimated effort:** 5–8 focused PRs over 2–3 weeks (major refactor; ship incrementally).

---

## Executive summary

| Phase | Deliverable | Breaking? |
|-------|-------------|-----------|
| 0 | Spec + interfaces (no runtime change) | No |
| **0.5** | **`PlatformBootstrapConfig` + OpenFin manifest + web app-config.json** | No (additive) |
| 1 | Hub config catalog cache + protocol extensions | No (additive) |
| 2 | `ensurePlatformReady` + `ensureDataServicesHub` lazy factory | No (wraps existing bootstrap) |
| 3 | `ProviderClientAdapter` / `IDataProvider` | No (new export) |
| 4 | Hub `refresh` vs `restart` semantics | No |
| 5 | `useDataProvider` hook + slim `MarketsGridContainer` | Internal breaking |
| 6 | Migrate apps + MCP templates + docs | App diffs |
| 7 | Deprecate v2 direct subscribe for saved providers | Soft deprecation |

---

## Current vs target (file-level)

### Packages — create

| Path | Responsibility |
|------|----------------|
| `packages/data/host-data/src/provider/IDataProvider.ts` | Public client contract |
| `packages/data/host-data/src/provider/ProviderCapabilities.ts` | Static/streaming flags |
| `packages/data/host-data/src/provider/ProviderClientAdapter.ts` | `IDataProvider` over MessagePort |
| `packages/data/host-data/src/hub/DataServicesHubClient.ts` | RPC facade (may evolve from `SharedWorkerDataServicesClient`) |
| `packages/data/host-data/src/hub/ensureDataServicesHub.ts` | Lazy per-window singleton |
| `packages/data/host-data/src/bootstrap/PlatformBootstrapConfig.ts` | Unified `appId` / `userId` / config-service shape |
| `packages/data/host-data/src/bootstrap/resolvePlatformBootstrap.ts` | Web: fetch `app-config.json` |
| `packages/data/host-data/src/bootstrap/ensurePlatformReady.ts` | ConfigManager init + hub spawn |
| `packages/openfin/openfin-platform/src/platformBootstrap.ts` | OpenFin: manifest `customSettings` → config |
| `packages/data/host-data/src/bootstrap/PlatformBootstrapConfig.test.ts` | Resolver tests |
| `packages/data/host-data/src/hub/ConfigCatalogCache.ts` | Worker-side catalog (used by hub) |
| `packages/data/host-data/src/provider/ProviderClientAdapter.test.ts` | Adapter unit tests |
| `packages/data/host-data/src/hub/ConfigCatalogCache.test.ts` | Catalog tests |
| `packages/data/host-data-react/src/runtime/useDataProvider.ts` | React hook |
| `packages/data/host-data-react/src/runtime/DataHubProvider.tsx` | Optional context wrapping `ensureDataServicesHub` |

### Packages — modify

| Path | Change |
|------|--------|
| `packages/data/host-data/src/runtime/protocol.ts` | Add `get-config`, `list-configs`, `catalog-ready`, `refresh-provider`, `config-invalidate` |
| `packages/data/host-data/src/runtime/worker/SharedWorkerDataServicesHub.ts` | Catalog preload, cfg-free attach, refresh RPC, invalidate |
| `packages/data/host-data/src/runtime/worker/defaultEntry.ts` | Await catalog preload after ConfigManager init |
| `packages/data/host-data/src/runtime/client/SharedWorkerDataServicesClient.ts` | Hub-ready, getConfig, refreshProvider; absorb chunk reassembly for clients |
| `packages/data/host-data/src/runtime/bootstrap/bootstrap.ts` | Delegate to `ensureDataServicesHub`; expose `hub` on `DataServices` |
| `packages/data/host-data/src/runtime/bootstrap/bootstrapWithWorkerAsset.ts` | Thin wrapper unchanged signature |
| `packages/data/host-data/src/runtime/config/store.ts` | Worker-side reads via catalog; main-thread store calls hub when available |
| `packages/data/host-data/src/index.ts` | Export `IDataProvider`, `ensureDataServicesHub` |
| `packages/data/host-data-react/src/runtime/index.tsx` | `useDataProvider`; deprecate `useProviderStream` |
| `packages/react-core/widgets-react/src/interfaces.ts` | `IBlotterDataProvider extends IDataProvider` or alias |
| `packages/react-core/widgets-react/src/v2/markets-grid-container/MarketsGridContainer.tsx` | Replace subscribe/snapshotBuf with `useDataProvider` |
| `packages/react-core/widgets-react/src/blotter/hooks/useBlotterDataConnection.ts` | Use `IDataProvider` |
| `docs/current-features.md` | New exports + behavior |
| `docs/STOMP_DATAPROVIDER_MARKETSGRID_GUIDE.md` | New wiring |
| `docs/guides/consumer-app-sharedworker-and-tailwind.md` | `ensurePlatformReady` + manifest/json checklist |
| `docs/guides/platform-bootstrap-config.md` | **New** — OpenFin manifest vs web JSON schema |
| `packages/openfin/openfin-platform/src/manifestConfig.ts` | Extend to full `PlatformBootstrapConfig` |
| `packages/react-core/widgets-react/src/hosted/useHostedIdentity.ts` | Consume bootstrap context, remove hardcoded pins |
| `packages/shared/types/src/index.ts` | Deprecate bare `LOGGED_IN_USER_ID` for new apps |

### Apps — modify (all follow same pattern)

| App | Bootstrap entry | Config source |
|-----|-----------------|---------------|
| `apps/workspace/markets-grid-lab` | `src/platformBootstrap.ts` | `public/app-config.json` |
| `apps/workspace/stomp` | same | `app-config.json` |
| `apps/workspace/mockdata-provider` | same | `app-config.json` |
| `apps/workspace/dataprovider-editor` | same | `app-config.json` |
| `apps/tarball/*` | mirror workspace | |
| OpenFin MCP template | `src/platformBootstrap.ts` | `manifest.fin.json` `customSettings` |
| `tools/mcp-scaffold/templates/fragments/**` | scaffold output | both patterns documented |

### Apps — legacy (lower priority, document only in Phase 6)

| App | Note |
|-----|------|
| `apps/tarball/markets-ui-react-reference` | Migrate when active; or mark deprecated |

---

## Phase 0 — Spec + interfaces (PR 1)

**Goal:** Lock contracts without changing runtime behavior.

### Task 0.1: Finalize spec

**Files:**
- Create: `docs/superpowers/specs/2026-05-28-data-services-hub-idataprovider-design.md` ✅

- [ ] **Step 1:** Review spec with team; confirm `refresh` vs `restart` and global `stop()` semantics. ✅ Session 1 — see spec § Resolved decisions; `stop()` = detach, global = `stopProvider()`.
- [ ] **Step 2:** Commit spec. ✅ Session 1

### Task 0.2: Define `IDataProvider` types

**Files:**
- Create: `packages/data/host-data/src/provider/IDataProvider.ts`
- Create: `packages/data/host-data/src/provider/ProviderCapabilities.ts`
- Modify: `packages/data/host-data/src/index.ts` — export types only

- [ ] **Step 1:** Add interface (lifecycle, sync getters, event registrars, capabilities). ✅ Session 2
- [ ] **Step 2:** Add `IDataProviderFactory` with `getProvider(providerId: string): IDataProvider`. ✅ Session 2
- [ ] **Step 3:** Export from `@starui/host-data`; run `npm run typecheck --workspace=@starui/host-data`. ✅ Session 2

```typescript
// packages/data/host-data/src/provider/IDataProvider.ts (sketch)
export interface IDataProvider<T = unknown> {
  readonly id: string;
  readonly capabilities: ProviderCapabilities;
  start(): Promise<void>;
  /** Detach this client; does not stop the hub provider for other subscribers. */
  stop(): Promise<void>;
  /** Replay hub cache to this subscriber without upstream I/O. */
  refresh(): Promise<void>;
  /** Full re-acquire (STOMP reconnect, historical asOfDate, etc.). */
  restart(extra?: Record<string, unknown>): Promise<void>;
  getData(): readonly T[];
  getConfig(): ProviderConfig;
  getColumnDefs(): readonly ColumnDefinition[];
  onRowsReceived(handler: (count: number) => void): () => void;
  onSnapshotData(handler: (rows: readonly T[]) => void): () => void;
  onTick(handler: (rows: readonly T[]) => void): () => void;
  onError(handler: (error: Error) => void): () => void;
  onStatus(handler: (status: ProviderStatus) => void): () => void;
}
```

- [ ] **Step 4:** Commit: `feat(host-data): add IDataProvider contract types`.

---

## Phase 0.5 — Platform bootstrap identity (PR 1b)

**Goal:** Unified `appId` / `userId` / config-service resolution — OpenFin manifest vs web `app-config.json` — before hub work depends on correct identity.

**Spec reference:** Design spec § Platform bootstrap identity.

### Task 0.5.1: `PlatformBootstrapConfig` type + validation

**Files:**
- Create: `packages/data/host-data/src/bootstrap/PlatformBootstrapConfig.ts`
- Create: `packages/data/host-data/src/bootstrap/PlatformBootstrapConfig.test.ts`
- Modify: `packages/data/host-data/src/index.ts` — export type

- [ ] **Step 1:** Define `PlatformBootstrapConfig` interface (see spec). ✅ Session 3
- [ ] **Step 2:** Add `validatePlatformBootstrapConfig(config)` — require non-empty `appId`, `userId`; warn on missing REST URL when `useRest === true`. ✅ Session 3
- [ ] **Step 3:** Add `DEV_PLATFORM_BOOTSTRAP` fallback for tests (`appId: 'TestApp'`, `userId: 'dev1'`) — replaces scattered literals. ✅ Session 3
- [ ] **Step 4:** Commit: `feat(host-data): add PlatformBootstrapConfig type`.

### Task 0.5.2: Web loader — `app-config.json`

**Files:**
- Create: `packages/data/host-data/src/bootstrap/resolvePlatformBootstrap.ts`
- Create: `packages/data/host-data/src/bootstrap/resolvePlatformBootstrap.test.ts`
- Create: `docs/guides/platform-bootstrap-config.md` — JSON schema + example

- [ ] **Step 1:** Implement `resolvePlatformBootstrapFromJson(url: string): Promise<PlatformBootstrapConfig>`. ✅ Session 4
- [ ] **Step 2:** Implement `resolvePlatformBootstrapFromObject(raw: unknown)` for inline/test use. ✅ Session 4
- [ ] **Step 3:** Document web schema in `docs/guides/platform-bootstrap-config.md`: ✅ Session 4

```json
{
  "appId": "markets-ui-dev",
  "userId": "dev1",
  "useRest": false,
  "configServiceRestUrl": "http://localhost:3001/api/v1",
  "seedConfigUrl": "/seed-config.json"
}
```

- [ ] **Step 4:** Commit.

### Task 0.5.3: OpenFin loader — manifest `customSettings`

**Files:**
- Modify: `packages/openfin/openfin-platform/src/manifestConfig.ts`
- Create: `packages/openfin/openfin-platform/src/platformBootstrap.ts`
- Modify: `tools/mcp-scaffold/templates/static/openfin/public/platform/manifest.fin.json`
- Modify: `packages/openfin/openfin-platform/src/platformBootstrap.test.ts` (create)

- [ ] **Step 1:** Add `resolvePlatformBootstrapFromManifest(): Promise<PlatformBootstrapConfig>` — extend existing `getConfigServiceRestUrlFromManifest()` / `resolveRestUrl()` pattern. ✅ Session 5
- [ ] **Step 2:** Read `customSettings.appId` (required in template); default dev fallback only when missing + `fin` undefined. ✅ Session 5
- [ ] **Step 3:** **`userId`:** dev — `customSettings.userId` or fallback `dev1`; document prod path via SSO → `customData` (no manifest hardcode). ✅ Session 5
- [ ] **Step 4:** Add to OpenFin template manifest: ✅ Session 5

```json
"customSettings": {
  "appId": "markets-ui-react-reference",
  "userId": "dev1",
  "useRest": false,
  "configServiceRestUrl": "http://localhost:3001/api/v1",
  "seedConfigUrl": "http://localhost:5174/seed-config.json"
}
```

- [ ] **Step 5:** Export from `@starui/openfin-platform/config` (or `/platformBootstrap`). ✅ Session 5
- [ ] **Step 6:** Commit: `feat(openfin-platform): resolve PlatformBootstrapConfig from manifest`.

### Task 0.5.4: `ensurePlatformReady` orchestrator

**Files:**
- Create: `packages/data/host-data/src/bootstrap/ensurePlatformReady.ts`
- Create: `packages/data/host-data/src/bootstrap/ensurePlatformReady.test.ts`

- [ ] **Step 1:** Implement: ✅ Session 6

```typescript
export async function ensurePlatformReady(
  config: PlatformBootstrapConfig,
  opts?: { workerScriptUrl: string },
): Promise<DataServicesHubBundle> {
  const configManager = createConfigManager({
    appId: config.appId,
    identity: { userId: config.userId, displayName: config.userId },
    configServiceRestUrl: config.useRest ? config.configServiceRestUrl : undefined,
    seedConfigUrl: config.seedConfigUrl,
  });
  await configManager.init();
  return ensureDataServicesHub({
    appId: config.appId,
    userId: config.userId,
    configServiceRestUrl: config.useRest ? config.configServiceRestUrl : undefined,
    workerScriptUrl: opts.workerScriptUrl,
    mainThreadConfigManager: configManager,
  });
}
```

- [ ] **Step 2:** Per-window singleton keyed by `appId` (same pattern as `ensureDataServicesHub`). ✅ Session 6
- [ ] **Step 3:** Tests: double call returns same bundle; ConfigManager receives `appId` + `userId`. ✅ Session 6
- [ ] **Step 4:** Commit: `feat(host-data): ensurePlatformReady orchestrator`.

### Task 0.5.5: App bootstrap module pattern (document + one pilot)

**Files:**
- Create: `docs/guides/platform-bootstrap-config.md` (complete)
- Create: `apps/workspace/markets-grid-lab/public/app-config.json`
- Create: `apps/workspace/markets-grid-lab/src/platformBootstrap.ts`
- Modify: `apps/workspace/markets-grid-lab/src/main.tsx`

- [ ] **Step 1:** Web app pattern: ✅ Session 7
- [ ] **Step 2:** OpenFin pattern: ✅ documented in guide (implementation in OpenFin apps Session 20)
- [ ] **Step 3:** Wire `markets-grid-lab` as pilot; verify SharedWorker name `mkt-data-services:${config.appId}`. ✅ Session 7
- [ ] **Step 4:** Commit: `docs + feat(markets-grid-lab): platform bootstrap pilot`.

---

## Phase 1 — Hub config catalog (PR 2)

**Goal:** Worker preloads provider + AppData config rows; cfg-free attach for known ids.

### Task 1.1: ConfigCatalogCache in worker

**Files:**
- Create: `packages/data/host-data/src/hub/ConfigCatalogCache.ts`
- Create: `packages/data/host-data/src/hub/ConfigCatalogCache.test.ts`
- Modify: `packages/data/host-data/src/runtime/worker/SharedWorkerDataServicesHub.ts`

- [ ] **Step 1:** Write failing test — preload from mock ConfigManager rows → `get(providerId)` returns config. ✅ Session 8
- [ ] **Step 2:** Implement cache: `loadAll()`, `get(id)`, `list({ subtype })`, `invalidate(id?)`, `upsert(row)`. ✅ Session 8
- [ ] **Step 3:** Hub constructor accepts cache; `hydrateCatalog()` called from `defaultEntry` after `configManager.init()`. ✅ Session 8
- [ ] **Step 4:** Run `npm test --workspace=@starui/host-data -- ConfigCatalogCache`. ✅ Session 8
- [ ] **Step 5:** Commit.

### Task 1.2: Protocol extensions

**Files:**
- Modify: `packages/data/host-data/src/runtime/protocol.ts`
- Modify: `packages/data/host-data/src/runtime/worker/SharedWorkerDataServicesHub.ts`
- Modify: `packages/data/host-data/src/runtime/client/SharedWorkerDataServicesClient.ts`
- Modify: `packages/data/host-data/src/runtime/worker/SharedWorkerDataServicesHub.test.ts`

- [ ] **Step 1:** Add request/response types: `get-config`, `list-configs`, `config-invalidate`, `catalog-ready`. ✅ Session 9
- [ ] **Step 2:** Hub handlers — respond from `ConfigCatalogCache`. ✅ Session 9
- [ ] **Step 3:** Client methods: `waitForCatalogReady()`, `getProviderConfig(id)`, `listProviderConfigs(opts)`, `invalidateConfig(id?)`. ✅ Session 9
- [ ] **Step 4:** Extend `handleAttach`: if `!req.cfg`, resolve from catalog; error if missing. ✅ Session 9
- [ ] **Step 5:** Tests for cfg-free attach + catalog miss error. ✅ Session 9
- [ ] **Step 6:** Commit: `feat(host-data): hub config catalog cache and cfg-free attach`.

### Task 1.3: Editor save → hub invalidation

**Files:**
- Modify: `packages/data/host-data/src/runtime/config/store.ts`
- Modify: `packages/data/host-data-react/src/runtime/index.tsx`

- [ ] **Step 1:** After `DataProviderConfigStore.save/remove`, call `client.invalidateConfig(providerId)` if hub connected. ✅ Session 10
- [ ] **Step 2:** Hub reloads single row or full catalog on invalidate. ✅ Session 9
- [ ] **Step 3:** Test round-trip in hub test with mock port. ✅ Session 10
- [ ] **Step 4:** Commit.

---

## Phase 2 — Lazy `ensureDataServicesHub` (PR 3)

**Goal:** Single hub entry point; **`ensurePlatformReady`** is the app-facing API; hub created on first config or provider need.

**Depends on:** Phase 0.5 (`PlatformBootstrapConfig` + loaders).

### Task 2.1: ensureDataServicesHub module

**Files:**
- Create: `packages/data/host-data/src/hub/ensureDataServicesHub.ts`
- Create: `packages/data/host-data/src/hub/ensureDataServicesHub.test.ts`
- Modify: `packages/data/host-data/src/runtime/bootstrap/bootstrapWithWorkerAsset.ts`
- Modify: `packages/data/host-data/src/runtime/bootstrap/bootstrap.ts`

- [ ] **Step 1:** `EnsureHubOpts` extends/bootstrap from `PlatformBootstrapConfig`: ✅ Session 11
- [ ] **Step 2:** Implement per-window singleton keyed by `appId`: ✅ Session 11
- [ ] **Step 3:** `bootstrapHubOnce` → `createDataServicesWorker` + `bootstrapDataServices` + `await client.waitForCatalogReady()`. ✅ Session 11
- [ ] **Step 4:** `bootstrapDataServicesWithWorkerAsset` → deprecated wrapper calling `ensurePlatformReady` or compatible opts. ✅ Session 11
- [ ] **Step 5:** Tests: double call returns same bundle; worker name uses `opts.appId`. ✅ Session 11
- [ ] **Step 6:** Commit: `feat(host-data): ensureDataServicesHub lazy entry point`.

### Task 2.2: DataHubProvider (React)

**Files:**
- Create: `packages/data/host-data-react/src/runtime/DataHubProvider.tsx`
- Modify: `packages/data/host-data-react/src/runtime/index.tsx`

- [ ] **Step 1:** `PlatformProvider` accepts `platform: DataServicesHubBundle` from `ensurePlatformReady()` OR `bootstrapConfig + workerScriptUrl` (calls ensurePlatformReady internally). ✅ Session 12
- [ ] **Step 2:** Pass resolved `userId` into context (replaces bare `LOGGED_IN_USER_ID` prop where possible). ✅ Session 12
- [ ] **Step 3:** Export alongside legacy `DataServicesProvider` (alias initially). ✅ Session 12
- [ ] **Step 4:** Commit.

---

## Phase 3 — ProviderClientAdapter (PR 4)

**Goal:** `IDataProvider` implementation; client-side snapshot/tick reassembly.

### Task 3.1: Client-side event normalization

**Files:**
- Modify: `packages/data/host-data/src/runtime/client/SharedWorkerDataServicesClient.ts`
- Create: `packages/data/host-data/src/hub/SnapshotReassembler.ts`

- [x] **Step 1:** Move chunk reassembly logic from `MarketsGridContainer` into `SnapshotReassembler` (loading chunks → single snapshot; expose `onRowsReceived` count).
- [x] **Step 2:** Unit tests for 500-row chunks, empty snapshot, restart mid-flight.
- [ ] **Step 3:** Commit.

### Task 3.2: ProviderClientAdapter

**Files:**
- Create: `packages/data/host-data/src/provider/ProviderClientAdapter.ts`
- Create: `packages/data/host-data/src/provider/ProviderClientAdapter.test.ts`

- [x] **Step 1:** Write failing tests mapping hub events → `onSnapshotData`, `onTick`, `onRowsReceived`, `getData()`.
- [x] **Step 2:** Implement adapter:
  - `start()` → attach/subscribe cfg-free + status handling
  - `stop()` → detach local sub; optional global stop flag (default: detach only; document global stop on factory)
  - `getConfig()` → hub `getProviderConfig`
  - `getColumnDefs()` → from config
  - `getData()` → local mirror updated on snapshot
- [x] **Step 3:** Wire `getProvider(id)` on `DataServicesHubBundle`.
- [ ] **Step 4:** Commit: `feat(host-data): ProviderClientAdapter implements IDataProvider`.

### Task 3.3: useDataProvider hook

**Files:**
- Create: `packages/data/host-data-react/src/runtime/useDataProvider.ts`
- Create: `packages/data/host-data-react/src/runtime/useDataProvider.test.tsx`

- [x] **Step 1:** Hook returns `{ provider, status, error, start, refresh, restart }` with auto-cleanup on unmount.
- [x] **Step 2:** Mark `useProviderStream` `@deprecated` pointing to `useDataProvider`.
- [ ] **Step 3:** Commit.

---

## Phase 4 — Refresh vs restart (PR 5)

**Goal:** Spec-accurate `refresh()` without upstream I/O.

### Task 4.1: Hub refresh-provider RPC

**Files:**
- Modify: `packages/data/host-data/src/runtime/protocol.ts`
- Modify: `packages/data/host-data/src/runtime/worker/SharedWorkerDataServicesHub.ts`
- Modify: `packages/data/host-data/src/runtime/worker/SharedWorkerDataServicesHub.test.ts`

- [x] **Step 1:** Test — running provider with cache; `refresh-provider` sends replace replay to one subId; transport `restart` not called.
- [x] **Step 2:** Implement `handleRefreshProvider(subId, providerId)`.
- [x] **Step 3:** Adapter `refresh()` calls RPC + fires `onSnapshotData`.
- [x] **Step 4:** Rename grid toolbar action: "Refresh view" → `refresh()`, "Reload from source" → `restart()`. ✅
- [ ] **Step 5:** Commit.

### Task 4.2: Transport alignment

**Files:**
- Modify: `packages/data/host-data/src/runtime/providers/transports/stomp.ts` (comments only unless emit hook needed)
- Modify: `packages/data/host-data/src/runtime/providers/transports/rest.ts`

- [x] **Step 1:** Document static providers: `start()` = fetch; no `onTick` after ready.
- [x] **Step 2:** Optional: emit progressive `rowsReceived` during STOMP snapshot buffer (hub aggregates to `rows-received` events).
- [ ] **Step 3:** Commit.

---

## Phase 5 — MarketsGridContainer refactor (PR 6)

**Goal:** Grid uses `IDataProvider` only; delete duplicated snapshot machinery.

### Task 5.1: Extract grid apply helper

**Files:**
- Create: `packages/react-core/widgets-react/src/v2/markets-grid-container/applyProviderToGrid.ts`
- Create: `packages/react-core/widgets-react/src/v2/markets-grid-container/applyProviderToGrid.test.ts`

- [x] **Step 1:** Move add/update split (`pendingAddIds`, `getRowNode`) from `MarketsGridContainer` into testable helper.
- [x] **Step 2:** Tests with mock GridApi.
- [ ] **Step 3:** Commit.

### Task 5.2: Slim MarketsGridContainer

**Files:**
- Modify: `packages/react-core/widgets-react/src/v2/markets-grid-container/MarketsGridContainer.tsx`

- [x] **Step 1:** Replace `dpClient.subscribe` block (~200 LOC) with `useDataProvider(activeId)`.
- [x] **Step 2:** Wire `onSnapshotData` → `setGridOption('rowData')`, `onTick` → `applyProviderToGrid`, `onRowsReceived` → overlay count.
- [x] **Step 3:** Historical mode → `provider.restart({ asOfDate })`.
- [x] **Step 4:** Remove `useDataProviderConfig` cfg pass-through to hub (keep for column defs / picker until catalog hook exists).
- [x] **Step 5:** Run widget-react tests + markets-grid-lab manually.
- [ ] **Step 6:** Commit: `refactor(widgets-react): MarketsGridContainer uses IDataProvider`.

### Task 5.3: HostedMarketsGrid + Blotter

**Files:**
- Modify: `packages/react-core/widgets-react/src/hosted/HostedMarketsGrid.tsx`
- Modify: `packages/react-core/widgets-react/src/blotter/hooks/useBlotterDataConnection.ts`

- [x] **Step 1:** Accept `IDataProvider` or use context factory.
- [x] **Step 2:** Update hosted tests mocks.
- [ ] **Step 3:** Commit.

---

## Phase 6 — App + template migration (PR 7)

**Goal:** All active example apps use `ensureDataServicesHub`.

### Task 6.1: Shared app bootstrap module pattern

**Template** — every app gets `src/platformBootstrap.ts` (see Phase 0.5.5).

- [x] **Step 1:** Migrate all tutorial apps + `markets-grid-lab` — each adds `public/app-config.json` + `platformBootstrap.ts`. ✅ Session 21
- [x] **Step 2:** OpenFin MCP template — manifest `customSettings.appId` + shared `platformBootstrap.ts` imported by **all** routes (Provider, blotter, editor, config browser). ✅ Session 21
- [x] **Step 3:** Optional: side-effect import in `Provider.tsx` for eager hub (document as optional, not required). ✅ Session 21
- [x] **Step 4:** Update MCP `workflow.ts` validation — require `app-config.json` or manifest `customSettings.appId`. ✅ Session 21
- [ ] **Step 5:** Commit: `chore(apps): migrate to ensurePlatformReady`.

### Task 6.2: Remove identity pins (incremental)

**Files:**
- Modify: `packages/react-core/widgets-react/src/hosted/useHostedIdentity.ts`
- Modify: `packages/openfin/openfin-platform/src/registryHostEnv.ts`
- Modify: `packages/openfin/host-openfin/src/identity.ts`

- [x] **Step 1:** `useHostedIdentity` reads `appId` / `userId` from `PlatformProvider` context (bootstrap), not `DEFAULT_APP_ID` / `LOGGED_IN_USER_ID` literals. ✅ Session 22
- [x] **Step 2:** Keep `instanceId` resolution from OpenFin `customData` / URL unchanged. ✅ Session 22
- [x] **Step 3:** Mark `LOGGED_IN_USER_ID` `@deprecated` in `@starui/types` with pointer to bootstrap. ✅ Session 22
- [ ] **Step 4:** Commit: `refactor: consume PlatformBootstrapConfig in hosted identity`.

### Task 6.3: Tutorial HelpSheets + docs

**Files:**
- Modify: `apps/tutorials-*/**/HelpSheet.tsx`
- Modify: `docs/STOMP_DATAPROVIDER_MARKETSGRID_GUIDE.md`
- Modify: `docs/guides/consumer-app-sharedworker-and-tailwind.md`
- Modify: `docs/guides/platform-bootstrap-config.md`
- Modify: `docs/current-features.md`
- Modify: `README.md` (short pointer)

- [x] **Step 1:** Document manifest vs `app-config.json` in all consumer guides. ✅ Session 22
- [x] **Step 2:** Replace `useProviderStream` examples with `useDataProvider`. ✅ Session 22
- [x] **Step 3:** Update architecture diagrams (hub owns catalog; bootstrap owns identity). ✅ Session 22
- [ ] **Step 4:** Commit: `docs: platform bootstrap + data services hub`.

---

## Phase 7 — Verification + deprecation (PR 8)

### Task 7.1: Test matrix

- [ ] **Step 1:** `npx turbo typecheck build test` — full monorepo green.
- [x] **Step 2:** Add integration test: two hub clients, same providerId, second cfg-free attach receives snapshot. ✅ Session 23
- [x] **Step 3:** Add adapter test: `refresh()` does not call transport restart (mock handle). ✅ pre-existing (`ProviderClientAdapter.test.ts`)
- [ ] **Step 4:** Smoke `apps/workspace/markets-grid-lab` + stomp tutorial against `stomp-view-server`.
- [ ] **Step 5:** Run targeted e2e if grid attach paths changed (`e2e/` grep `MarketsGrid`).

### Task 7.2: Deprecation notices

**Files:**
- Modify: `packages/data/host-data/src/runtime/client/SharedWorkerDataServicesClient.ts`
- Modify: `packages/data/host-data-react/src/runtime/index.tsx`

- [x] **Step 1:** JSDoc `@deprecated` on `subscribe(providerId, cfg)` when cfg exists in catalog (lint optional). ✅ Session 23
- [x] **Step 2:** CHANGELOG / migration section in spec doc. ✅ Session 23
- [ ] **Step 3:** Commit: `chore(host-data): deprecate cfg-required attach for catalogued providers`.

---

## PR sequencing (recommended)

```text
PR1   Phase 0 — types + spec
PR1b  Phase 0.5 — PlatformBootstrapConfig + manifest + app-config.json + ensurePlatformReady pilot
PR2   Phase 1 — catalog cache + protocol (behind hub.ready, old apps unaffected)
PR3   Phase 2 — ensureDataServicesHub (called from ensurePlatformReady)
PR4   Phase 3 — ProviderClientAdapter + useDataProvider
PR5   Phase 4 — refresh RPC
PR6   Phase 5 — MarketsGridContainer refactor  ← highest regression risk
PR7   Phase 6 — all apps + MCP + identity pin removal + docs
PR8   Phase 7 — deprecation + final verification
```

Do **not** merge PR6 before PR4 is stable — grid refactor depends on adapter.  
Do **not** merge PR3 before PR1b — hub must receive correct `appId` from bootstrap.

---

## Rollback plan

Each PR is independently revertable until PR6:

- PR1–PR3: additive only; rollback = remove unused code paths.
- PR6 (grid): if production issue, revert MarketsGridContainer only; keep hub catalog (PR2) — grids can temporarily restore `subscribe(cfg)` block from git history.

Feature flag optional: `STARUI_USE_IDATAPROVIDER=1` in `MarketsGridContainer` for one release (default off → on). Only add if PR6 staging shows regressions.

---

## Open questions (resolved in Phase 0 — Session 1)

- [x] **Global vs local stop:** `IDataProvider.stop()` = **detach**; `DataServicesHubBundle.stopProvider(id)` = global teardown (wire `stop`). Spec § Resolved decisions.
- [x] **Inline cfg for editor drafts:** Keep `attach({ cfg: draft })` when not in catalog — **yes, indefinitely**.
- [x] **Catalog scope:** Match `DataProviderConfigStore.list()` — **platform-global unfiltered**.
- [x] **probeStomp/probeRest:** **Main-thread** in v1; hub RPC follow-up.
- [x] **`userId` in OpenFin prod:** Manifest for dev; **SSO → customData** in prod.
- [x] **`appId` in view customData:** **Ignore** — manifest/json only for SharedWorker name.

---

## Agent execution notes

- Read [`docs/ARCHITECTURE.md`](../../ARCHITECTURE.md) import boundaries before adding exports.
- Update [`docs/current-features.md`](../../current-features.md) in every PR that ships user-visible capability.
- Run `npm run propagate -- data` after `@starui/host-data` build changes affecting tarball consumers.
- Commit trailer per `CLAUDE.md`: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.

---

## Definition of done

The refactor is complete when:

1. A developer can wire a new app with **`platformBootstrap.ts` + `ensurePlatformReady` + `useDataProvider(id)`** without reading SharedWorker protocol docs.
2. **`appId` and `userId`** come from OpenFin manifest `customSettings` or web `app-config.json` — not hardcoded literals in app code.
3. Second OpenFin view opens a blotter with **providerId only** (no cfg fetch on main thread after hub ready).
4. **`refresh()`** and **`restart()`** behave differently per spec (tests prove it).
5. All tutorial apps and MCP OpenFin template compile and run with shared bootstrap module.
6. Old APIs deprecated with migration path documented.
