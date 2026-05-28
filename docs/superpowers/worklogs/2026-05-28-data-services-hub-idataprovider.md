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
| 3 | PR1b | 0.5.1 | `PlatformBootstrapConfig` type + validation tests | pending | |
| 4 | PR1b | 0.5.2 | Web `resolvePlatformBootstrapFromJson` + guide draft | pending | |
| 5 | PR1b | 0.5.3 | OpenFin `resolvePlatformBootstrapFromManifest` + template manifest | pending | |
| 6 | PR1b | 0.5.4 | `ensurePlatformReady` orchestrator + tests | pending | |
| 7 | PR1b | 0.5.5 | `markets-grid-lab` pilot + `platform-bootstrap-config.md` | pending | |
| 8 | PR2 | 1.1 | `ConfigCatalogCache` in worker | pending | |
| 9 | PR2 | 1.2 | Protocol extensions (`get-config`, `catalog-ready`, …) | pending | |
| 10 | PR2 | 1.3 | Editor save → hub invalidation | pending | |
| 11 | PR3 | 2.1 | `ensureDataServicesHub` lazy singleton | pending | |
| 12 | PR3 | 2.2 | `PlatformProvider` / `DataHubProvider` (React) | pending | |
| 13 | PR4 | 3.1 | `SnapshotReassembler` + client normalization | pending | |
| 14 | PR4 | 3.2 | `ProviderClientAdapter` + unit tests | pending | |
| 15 | PR4 | 3.3 | `useDataProvider` hook | pending | |
| 16 | PR5 | 4.1–4.2 | Hub `refresh-provider` RPC + transport alignment | pending | |
| 17 | PR6 | 5.1 | Extract grid apply helper from `MarketsGridContainer` | pending | |
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

### Session 3 — (pending)

---

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
