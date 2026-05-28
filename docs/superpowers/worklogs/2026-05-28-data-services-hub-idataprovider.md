# Worklog — Data Services Hub + IDataProvider

**Branch:** `feat/data-services-hub-idataprovider`  
**Plan:** [`../plans/2026-05-28-data-services-hub-idataprovider.md`](../plans/2026-05-28-data-services-hub-idataprovider.md)  
**Spec:** [`../specs/2026-05-28-data-services-hub-idataprovider-design.md`](../specs/2026-05-28-data-services-hub-idataprovider-design.md)

---

## How to use this log

1. **One session = one row** in the session index below (typically one task, sometimes two small tasks).
2. At **session start**: set status to `in_progress`, note the date, read the linked plan task.
3. At **session end**: run verification commands, update status, fill the session log entry, note blockers/handoff.
4. **Do not skip PR order** — see plan § PR sequencing (`PR1b` before hub work, `PR4` before grid refactor).
5. Commit at end of session when a logical unit is green (user-requested commits only).

### Verification commands (run after most sessions)

```bash
# Narrow (preferred during iteration)
npx turbo typecheck test --filter=@starui/host-data
npx turbo typecheck test --filter=@starui/host-data-react

# Before merging a PR phase
npx turbo typecheck build test --filter=@starui/host-data --filter=@starui/host-data-react --filter=@starui/widgets-react
```

### Session handoff template

```markdown
### Session N — YYYY-MM-DD
**Scope:** Task X.Y
**Done:** …
**Verify:** … (paste command output summary)
**Next:** Session N+1 — …
**Blockers:** none | …
```

---

## Session index

| # | PR | Plan task | Scope (1 session) | Status | Date |
|---|-----|-----------|---------------------|--------|------|
| 0 | — | Setup | Branch + worklog (this file) | **done** | 2026-05-28 |
| 1 | PR1 | 0.1 | Finalize spec review / minor spec edits | **done** | 2026-05-28 |
| 2 | PR1 | 0.2 | `IDataProvider` + `ProviderCapabilities` types + exports | **done** | 2026-05-28 |
| 3 | PR1b | 0.5.1 | `PlatformBootstrapConfig` type + validation tests | **done** | 2026-05-28 |
| 4 | PR1b | 0.5.2 | Web `resolvePlatformBootstrapFromJson` + guide draft | **done** | 2026-05-28 |
| 5 | PR1b | 0.5.3 | OpenFin `resolvePlatformBootstrapFromManifest` + template manifest | **done** | 2026-05-28 |
| 6 | PR1b | 0.5.4 | `ensurePlatformReady` orchestrator + tests | **done** | 2026-05-28 |
| 7 | PR1b | 0.5.5 | `markets-grid-lab` pilot + `platform-bootstrap-config.md` | **done** | 2026-05-28 |
| 8 | PR2 | 1.1 | `ConfigCatalogCache` in worker | **done** | 2026-05-28 |
| 9 | PR2 | 1.2 | Protocol extensions (`get-config`, `catalog-ready`, …) | **done** | 2026-05-28 |
| 10 | PR2 | 1.3 | Editor save → hub invalidation | **done** | 2026-05-28 |
| 11 | PR3 | 2.1 | `ensureDataServicesHub` lazy singleton | **done** | 2026-05-28 |
| 12 | PR3 | 2.2 | `PlatformProvider` / `DataHubProvider` (React) | **done** | 2026-05-28 |
| 13 | PR4 | 3.1 | `SnapshotReassembler` + client normalization | **done** | 2026-05-28 |
| 14 | PR4 | 3.2 | `ProviderClientAdapter` + unit tests | **done** | 2026-05-28 |
| 15 | PR4 | 3.3 | `useDataProvider` hook | **done** | 2026-05-28 |
| 16 | PR5 | 4.1 | Hub `refresh-provider` RPC | **done** | 2026-05-28 |
| 17 | PR5 | 4.2 | Transport alignment | **done** | 2026-05-28 |
| 18 | PR6 | 5.1 | Extract grid apply helper from `MarketsGridContainer` | **done** | 2026-05-28 |
| 19 | PR6 | 5.2 | Slim `MarketsGridContainer` → `useDataProvider` | **done** | 2026-05-28 |
| 20 | PR6 | 5.3 | `HostedMarketsGrid` + blotter hook migration | **done** | 2026-05-28 |
| 18 | PR6 | 5.2 | Slim `MarketsGridContainer` → `useDataProvider` | pending | |
| 19 | PR6 | 5.3 | `HostedMarketsGrid` + blotter hook migration | pending | |
| 20 | PR7 | 6.1 | Tutorial apps + MCP OpenFin bootstrap migration | pending | |
| 21 | PR7 | 6.2 | Remove identity pins (`useHostedIdentity`, deprecate literals) | pending | |
| 22 | PR7 | 6.3 | HelpSheets + consumer docs + `current-features.md` | pending | |
| 23 | PR8 | 7.1–7.2 | Test matrix + deprecation notices + final verify | pending | |

**Status values:** `pending` | `in_progress` | `done` | `blocked` | `skipped`

---

## PR merge checklist

Merge each PR to `feat/data-services-hub-idataprovider` (or stack against `main` when ready). Final merge to `main` after PR8.

| PR | Sessions | Merge when |
|----|----------|------------|
| PR1 | 1–2 | Types compile; spec aligned |
| PR1b | 3–7 | `markets-grid-lab` boots with `app-config.json`; tests green |
| PR2 | 8–10 | Catalog RPC works in hub tests |
| PR3 | 11–12 | Double `ensurePlatformReady` → same worker name |
| PR4 | 13–15 | Adapter tests + hook smoke in lab app |
| PR5 | 16 | `refresh()` ≠ `restart()` proven in tests |
| PR6 | 17–19 | Grid lab e2e / manual STOMP blotter OK |
| PR7 | 20–22 | All tutorials + MCP template updated |
| PR8 | 23 | Full turbo verify; deprecation docs |

---

## Session log

### Session 0 — 2026-05-28

**Scope:** Branch + worklog setup  
**Done:**

- Created branch `feat/data-services-hub-idataprovider` from `main`
- Created this worklog with 23 implementation sessions mapped to plan tasks
- Planning docs present (uncommitted on branch): spec, implementation plan

**Verify:** `git branch --show-current` → `feat/data-services-hub-idataprovider`

**Next:** Session 1 — spec review (Task 0.1), then Session 2 — `IDataProvider` types (Task 0.2)

**Blockers:** none

**Notes:** Working tree may include unrelated WIP (MCP scaffold). Keep data-hub commits scoped to plan files + host-data packages when implementing.

---

### Session 1 — 2026-05-28

**Scope:** Task 0.1 — Finalize spec  
**Done:**

- Cross-checked spec against `SharedWorkerDataServicesHub` (detach vs stop, restart via attach.extra)
- Resolved all Phase 0 open questions in spec § **Resolved decisions**
- Corrected semantics table: `stop()` = detach; global teardown = `DataServicesHubBundle.stopProvider()`
- Documented toolbar Refresh → `restart()` migration (today's `__refresh` path), `refresh()` = new cache replay
- Updated architecture diagram to show `ensurePlatformReady` → `ensureDataServicesHub`
- Marked spec status **Finalized**; plan Task 0.1 complete

**Verify:** Spec/plan consistency review (no runtime code in this session)

**Next:** Session 2 — `IDataProvider` + `ProviderCapabilities` types (Task 0.2)

**Blockers:** none

---

### Session 2 — 2026-05-28

**Scope:** Task 0.2 — `IDataProvider` types  
**Done:**

- Added `packages/data/host-data/src/provider/ProviderCapabilities.ts`
- Added `packages/data/host-data/src/provider/IDataProvider.ts` (`IDataProvider`, `IDataProviderFactory`, `DataServicesHubBundle`, `Unsubscribe`)
- Added `packages/data/host-data/src/provider/index.ts` barrel
- Exported types from `@starui/host-data` root entry
- Updated `docs/current-features.md` provider primitives section

**Verify:** `npm run typecheck --workspace=@starui/host-data` — exit 0

**Next:** Session 3 — `PlatformBootstrapConfig` type + validation (Task 0.5.1) — starts PR1b

**Blockers:** none

---

### Session 3 — 2026-05-28

**Scope:** Task 0.5.1 — `PlatformBootstrapConfig` type + validation  
**Done:**

- Added `PlatformBootstrapConfig`, `PlatformBootstrapValidationResult`
- Added `validatePlatformBootstrapConfig()` — errors on empty `appId`/`userId`; warns when `useRest` without REST URL
- Added `DEV_PLATFORM_BOOTSTRAP` (`TestApp` / `dev1`)
- Exported from `@starui/host-data`; 7 unit tests

**Verify:** `npm run typecheck --workspace=@starui/host-data`; bootstrap tests pass

**Next:** Session 4 — `resolvePlatformBootstrapFromJson` + guide draft (Task 0.5.2)

**Blockers:** none

---

### Session 4 — 2026-05-28

**Scope:** Task 0.5.2 — Web bootstrap loader + guide  
**Done:**

- Added `resolvePlatformBootstrapFromObject()` and `resolvePlatformBootstrapFromJson()`
- Added `PlatformBootstrapConfigError` for parse/validation/fetch failures
- Added `docs/guides/platform-bootstrap-config.md` (web schema + loader example)
- Exported from `@starui/host-data`; 9 new unit tests (16 bootstrap tests total)

**Verify:** `npm run typecheck --workspace=@starui/host-data`; `vitest run src/bootstrap/` — 16 passed

**Next:** Session 5 — OpenFin `resolvePlatformBootstrapFromManifest` + template manifest (Task 0.5.3)

**Blockers:** none

---

### Session 5 — 2026-05-28

**Scope:** Task 0.5.3 — OpenFin manifest bootstrap loader  
**Done:**

- Extended `CustomSettings` with `appId` / `userId`
- Added `platformBootstrap.ts`: `resolvePlatformBootstrapFromManifest`, `resolvePlatformBootstrapFromCustomSettings`
- Exported from `@starui/openfin-platform/config`; added `@starui/host-data` dependency
- Updated MCP OpenFin template manifests (`manifest.fin.json`, `manifest.e2e.fin.json`)
- Expanded `docs/guides/platform-bootstrap-config.md` OpenFin section; 5 unit tests

**Verify:** build `@starui/host-data`; typecheck + `platformBootstrap.test.ts` — 5 passed

**Next:** Session 6 — `ensurePlatformReady` orchestrator (Task 0.5.4)

**Blockers:** none

---

### Session 6 — 2026-05-28

**Scope:** Task 0.5.4 — `ensurePlatformReady` orchestrator  
**Done:**

- Added `ensurePlatformReady()` — validate config → `createConfigManager` + `init()` → `ensureDataServicesHub()`
- Added minimal `ensureDataServicesHub()` wrapping `bootstrapDataServicesWithWorkerAsset` (Phase 2 stub until catalog preload)
- Per-`appId` singletons for platform + hub; `getProvider()` throws until Phase 3 adapter
- 4 unit tests for ConfigManager args, idempotency, REST URL, validation

**Verify:** typecheck + 162 host-data tests pass

**Next:** Session 7 — `markets-grid-lab` pilot + `platformBootstrap.ts` (Task 0.5.5)

**Blockers:** none

---

### Session 7 — 2026-05-28

**Scope:** Task 0.5.5 — `markets-grid-lab` platform bootstrap pilot  
**Done:**

- Added `public/app-config.json` (`appId: markets-grid-lab`, `userId: dev1`)
- Added `src/platformBootstrap.ts` + `asLegacyDataServices` helper
- Migrated `main.tsx` to async `initPlatformBootstrap()`; removed sync `dataServices.ts`
- Switched lab deps to workspace `"*"` (from tarballs) for hub bootstrap APIs
- Added `ResolvedDataServicesHubBundle` type on hub bundle; guide pilot section

**Verify:** `npm run build --workspace=@starui/host-data`; `npm run typecheck --workspace=@starui/markets-grid-lab` — pass

**Next:** Session 8 — `ConfigCatalogCache` in worker (Task 1.1) — starts PR2

**Blockers:** none

**PR1b complete** — platform bootstrap identity landed end-to-end for web pilot.

---

### Session 8 — 2026-05-28
**Scope:** Task 1.1 — `ConfigCatalogCache` in worker

**Done:**
- Added `packages/data/host-data/src/hub/ConfigCatalogCache.ts` — `loadAll`, `get`, `getProviderConfig`, `list`, `invalidate`, `upsert`
- Added `ConfigCatalogCache.test.ts` (5 tests)
- Hub accepts optional `configCatalog`; auto-constructs from `configManager`
- Added `hydrateCatalog()` + `getConfigCatalog()` on `SharedWorkerDataServicesHub`
- `installSharedWorkerHub` awaits catalog hydrate before AppData hydrate
- Fixed `defaultEntry.ts` — `configManager.init()` before hub install (catalog needs Dexie/REST ready)

**Verify:** `npm run build --workspace=@starui/host-data`; `npm test --workspace=@starui/host-data` — 167 passed (5 new)

**Next:** Session 9 — protocol extensions (Task 1.2)

**Blockers:** none

---

### Session 9 — 2026-05-28
**Scope:** Task 1.2 — protocol extensions + cfg-free attach

**Done:**
- Extended `protocol.ts` — `hub-ready`, `get-config`, `list-configs`, `config-invalidate`, `catalog-ready`, `config-snapshot`
- Hub handlers read/write `ConfigCatalogCache`; `handleAttach` resolves cfg from catalog when omitted
- Client RPC — `waitForCatalogReady()`, `getProviderConfig()`, `listProviderConfigs()`, `invalidateConfig()`
- Hub broadcasts `catalog-ready` after preload/invalidate; tracks connected ports
- Tests — cfg-free attach, catalog miss error, RPC round-trip (hub + client)

**Verify:** `npm run build --workspace=@starui/host-data`; `npm test --workspace=@starui/host-data` — 173 passed (6 new)

**Next:** Session 10 — editor save → hub invalidation (Task 1.3)

**Blockers:** none

---

### Session 10 — 2026-05-28
**Scope:** Task 1.3 — editor save → hub invalidation

**Done:**
- `DataProviderConfigStore` accepts optional `CatalogInvalidateFn`; `save()`/`remove()` notify after ConfigManager persistence
- `DataServicesProvider` wires `services.client.invalidateConfig` into the store (editor flows via `useDataServices().configStore`)
- Fixed `ConfigCatalogCache.invalidate(id)` unit test to exercise real reload path
- Tests — store invalidation callback, hub invalidate RPC + get-config round-trip, client save → invalidate → `getProviderConfig`

**Verify:** `npm run build --workspace=@starui/host-data`; `npm test --workspace=@starui/host-data` — 179 passed; `npm run typecheck --workspace=@starui/host-data-react` — pass

**Next:** Session 11 — `ensureDataServicesHub` lazy singleton (Task 2.1) — starts PR3

**Blockers:** none

---

### Session 11 — 2026-05-28
**Scope:** Task 2.1 — `ensureDataServicesHub` lazy entry point

**Done:**
- `EnsureHubOpts extends PlatformBootstrapConfig` + shared `resolveConfigServiceRestUrl()`
- `bootstrapHubOnce` — `createDataServicesWorker` + `bootstrapDataServices` + shared `ready` (AppData + `waitForCatalogReady`)
- Per-`appId` singleton; `ResolvedDataServicesHubBundle` retains legacy `client` / `appData` / `configManager`
- `@deprecated` on `bootstrapDataServicesWithWorkerAsset`; `bootstrapDataServices` docs point to hub entry
- Tests — `ensureDataServicesHub.test.ts` (4); updated `ensurePlatformReady.test.ts`

**Verify:** `npm run build --workspace=@starui/host-data`; `npm test --workspace=@starui/host-data` — 183 passed

**Next:** Session 12 — `DataHubProvider` (React) (Task 2.2)

**Blockers:** none

---

### Session 12 — 2026-05-28
**Scope:** Task 2.2 — `DataHubProvider` (React)

**Done:**
- Added `DataHubProvider.tsx` — accepts `platform` or `bootstrapConfig` + `workerScriptUrl`; `PlatformProvider` alias
- Extracted `DataServicesProvider.tsx` (shared context + catalog invalidation wiring)
- `useAppData` / list hooks use session `userId` from context instead of bare `LOGGED_IN_USER_ID`
- `markets-grid-lab` pilot migrated to `<DataHubProvider platform={platform} userId={config.userId}>`

**Verify:** `npm run typecheck --workspace=@starui/host-data-react`; `npm run typecheck --workspace=@starui/markets-grid-lab` — pass

**Next:** Session 13 — `SnapshotReassembler` + client normalization (Task 3.1) — starts PR4

**Blockers:** none

---

### Session 13 — 2026-05-28
**Scope:** Task 3.1 — `SnapshotReassembler` + client normalization

**Done:**
- Added `SnapshotReassembler` — head/tail chunk assembly, `onRowsReceived`, post-settle `onReset` / live `onTick`
- Wired into `SharedWorkerDataServicesClient.subscribe` — `snapshot` resolves full assembled rows; new `onRowsReceived` on `SubscribeHandle`
- Unit tests: 500-row chunks, empty snapshot, restart mid-flight; client late-join 1200-row integration test

**Verify:** `npm test --workspace=@starui/host-data` — 189 passed

**Next:** Session 14 — `ProviderClientAdapter` (Task 3.2)

**Blockers:** none

---

### Session 14 — 2026-05-28
**Scope:** Task 3.2 — `ProviderClientAdapter`

**Done:**
- Added `ProviderClientAdapter` implementing `IDataProvider` (start/stop/refresh/restart, getters, event registrars)
- Wired `ensureDataServicesHub().getProvider(id)` to return adapter instances
- Exported `ProviderClientAdapter`, `resolveProviderCapabilities` from `@starui/host-data`
- 8 unit tests covering snapshot, ticks, rows-received, stop/restart/refresh, errors, inline cfg

**Verify:** `npm test --workspace=@starui/host-data` — 197 passed; typecheck green

**Next:** Session 15 — `useDataProvider` hook (Task 3.3)

**Blockers:** none

---

### Session 15 — 2026-05-28
**Scope:** Task 3.3 — `useDataProvider` hook

**Done:**
- Added `useDataProvider` — auto-start/stop, status/error from adapter events, `refresh`/`restart` passthrough
- Marked `useProviderStream` `@deprecated` in favor of `useDataProvider`
- Vitest + `@testing-library/react` setup for `@starui/host-data-react` (5 hook tests)

**Verify:** `npm test --workspace=@starui/host-data-react` — 5 passed; typecheck green (after `@starui/host-data` build)

**Next:** Session 16 — hub `refresh-provider` RPC (Phase 4 / Task 4.1)

**Blockers:** none

---

### Session 16 — 2026-05-28
**Scope:** Task 4.1 — hub `refresh-provider` RPC

**Done:**
- Added `refresh-provider` wire request; hub `handleRefreshProvider` replays chunked cache to one `subId` (no `provider.restart`)
- Extracted `replayCacheToPort` from late-join attach path
- `SnapshotReassembler.beginCacheRefresh()` + `onCacheRefresh` for settled subscriptions
- `SubscribeHandle.refresh()` + `ProviderClientAdapter.refresh()` via hub RPC
- Tests: hub, client, reassembler, adapter (200 total in `@starui/host-data`)

**Verify:** `npm test --workspace=@starui/host-data` — 200 passed

**Next:** Session 17 — Task 4.2 transport alignment comments OR Task 5.1 grid helper (plan step 4.1 toolbar rename deferred)

**Blockers:** none

---

### Session 17 — 2026-05-28
**Scope:** Task 4.2 — transport alignment

**Done:**
- IDataProvider-aligned docs on REST (static: no live tail after `ready`) and STOMP (streaming: `rowsReceived` + live deltas)
- `ProviderEmitEvent.rowsReceived` → hub `rows-received` wire event (pre-cache snapshot progress only)
- STOMP snapshot buffer emits cumulative `{ rowsReceived }`; client merges with `SnapshotReassembler` counts
- Tests: stomp, hub, client

**Verify:** `npm test --workspace=@starui/host-data`

**Next:** Session 18 — Task 5.1 grid apply helper (`applyProviderToGrid`)

**Blockers:** none

---

### Session 18 — 2026-05-28
**Scope:** Task 5.1 — `applyProviderToGrid` helper

**Done:**
- Extracted live-tick add/update split (`pendingAddIds`, `getRowNode` ordering) into `applyProviderToGrid.ts`
- Wired `MarketsGridContainer` through `createApplyProviderToGridState()`
- 7 unit tests with mock `GridApi`

**Verify:** `npm test --workspace=@starui/widgets-react -- applyProviderToGrid.test.ts`; typecheck green

**Next:** Session 19 — Task 5.2 slim `MarketsGridContainer` → `useDataProvider`

**Blockers:** none

---



---

### Session 19 — 2026-05-28
**Scope:** Task 5.2 — slim `MarketsGridContainer` to `IDataProvider`

**Done:**
- Replaced ~280 LOC `dpClient.subscribe` block with `useDataProvider` + provider event wiring
- `onSnapshotData` → `setGridOption('rowData')`; `onTick` → `applyProviderToGrid`; `onRowsReceived` → overlay count
- Toolbar refresh → `provider.restart({ asOfDate })` / `{ __refresh }` (no cfg pass-through to hub)
- Updated container tests for `useDataProvider` mock

**Verify:** `npm test --workspace=@starui/widgets-react` — 113 passed; typecheck green

**Next:** Session 20 — Task 5.3 HostedMarketsGrid + blotter hook migration

**Blockers:** none



---

### Session 20 — 2026-05-28
**Scope:** Task 5.3 — HostedMarketsGrid + blotter hook

**Done:**
- `HostedMarketsGrid` accepts `platform` hub bundle (`DataHubProvider`) alongside legacy `dataServices`
- `useBlotterDataConnection` migrated to `IDataProvider` (`start`/`stop`, `onSnapshotData`/`onTick`, `applyProviderToGrid`)
- `IBlotterDataProvider` deprecated as alias of `IDataProvider`
- Tests: blotter hook + hosted platform mount

**Verify:** `npm test --workspace=@starui/widgets-react` — 116 passed; typecheck green

**Next:** Session 22 — Task 6.2 identity pins + Task 6.3 docs

**Blockers:** none

---

## Session 21 — Phase 6 Task 6.1 app bootstrap migration

**Done:**
- Tutorial apps (workspace + tarball): `public/app-config.json`, `src/platformBootstrap.ts`, `DataHubProvider` in `main.tsx`; removed legacy `dataServices.ts`
- STOMP: `ensureStompProvider(configStore, userId)` via React context; `PositionsBlotter` uses `getPlatform().configManager`
- MCP templates: `platformBootstrap.ts.hbs`, `app-config.json.hbs`, `main-with-hub-provider.tsx.hbs`; manifest fragments updated
- OpenFin static template: `platformBootstrap.ts`, root `DataHubProvider`, eager hub warmup in `Provider.tsx`
- `workflow.ts`: validates `platformBootstrap.ts` + `app-config.json` or manifest `customSettings.appId`

**Verify:** `npm test --workspace=@starui/mcp-scaffold`; tutorial app typechecks

**Next:** Session 22 — Task 6.2 remove identity pins

**Blockers:** none

## Decisions log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-05-28 | Implement in monorepo on feature branch, not new repo | Workspace linking, cross-package refactor, MCP templates |
| 2026-05-28 | ~23 small sessions ≈ 1 task each | Fits focused agent/human sessions without context loss |
| 2026-05-28 | PR1b (bootstrap) before PR3 (hub factory) | SharedWorker name and ConfigManager need correct `appId` |
| 2026-05-28 | `IDataProvider.stop()` = detach; global = `stopProvider()` | Matches hub behavior (no auto-teardown on last detach) |
| 2026-05-28 | Toolbar Refresh → `restart()`, not `refresh()` | Preserves today's `__refresh` / `asOfDate` semantics; `refresh()` is new cache-replay only |

---

## Open items (carry forward)

- [ ] Confirm whether PRs merge to feature branch first or directly to `main` as stacked PRs
- [ ] Optional: git worktree for parallel `main` dev while hub branch is active
- [ ] Feature flag `STARUI_USE_IDATAPROVIDER` — only if PR6 staging shows regressions (see plan rollback)
