# MarketsGrid v2 — deprecation list (initial inventory)

Living inventory for [Phase 0 / Phase 5](./MARKETSGRID_V2_STRATEGY.md) of the
strangler rewrite. **Do not delete** until gate conditions in the strategy doc
are met.

_Last scanned: 2026-06-17._

---

## Canonical production spine (do not deprecate)

| Symbol | Package | Role |
|--------|---------|------|
| `HostedMarketsGrid` | `@starui/widgets-react/hosted` | Production entry |
| `MarketsGridContainer` | `@starui/widgets-react` | Provider + profile shell |
| `useDataProvider` | `@starui/host-data-react` | Hub-backed `IDataProvider` |
| `useProviderDataWiring` | `@starui/widgets-react` | Tick → grid hot path |
| `applyProviderToGrid` | `@starui/widgets-react` | Add/update classifier |
| `ProviderClientAdapter` | `@starui/host-data` | Client adapter |
| `SnapshotReassembler` | `@starui/host-data` | Chunk / refresh / reconnect |
| `SharedWorkerDataServicesHub` | `@starui/host-data` | Worker hub |
| `FanOutWorkerPool` | `@starui/host-data` | Parallel fan-out |
| `MarketsGrid` / `useGridHost` | `@starui/grid` | AG Grid product |
| `GridPlatform` / `RowChangeBus` | `@starui/engine` | Module runtime |

### Apps on canonical spine (`HostedMarketsGrid`)

- `apps/demos/star-demo`
- `apps/demos/markets-ui-react-reference`
- `apps/demos/e2e-openfin-workspace`
- `apps/demos/e2e-browser-blotter`
- `apps/demos/stomp`
- `apps/demos/demo-stomp-markets-grid`
- `apps/demos/stomp-marketsgrid-minimal`
- `apps/demos/dataprovider-editor` (embedded panel)
- `apps/demos/marketsgrid-container-e2e` (test host)

---

## Deprecation candidates

### Parallel data APIs

| Symbol | Location | App imports | Package refs | Disposition | Target phase |
|--------|----------|-------------|--------------|-------------|--------------|
| `useBlotterDataConnection` | `widgets-react/blotter/hooks` | **0** (exported via `index.ts`) | tests + self | **Deprecate** → remove export | Phase 5 |
| `useProviderStream` | `host-data-react` | 0 in apps | `DataHubProvider`, `index`, `useDataProvider` comment | **Deprecate** if superseded by `useDataProvider` | Phase 5 |
| `SharedWorkerDataServicesClient.subscribe` with inline `cfg` | `host-data` | demos use catalog path | `@deprecated` in JSDoc | Keep until grep clean; prefer cfg-free attach | Phase 5 |
| `BlotterProvider` (type) | `widgets-react/interfaces` | unknown | `@deprecated` alias | Remove with blotter hook | Phase 5 |

### Non-production grid entry (keep isolated)

| Symbol | Location | Used by | Disposition |
|--------|----------|---------|-------------|
| `MarketsGrid` direct + `rowData` | `@starui/grid` | `markets-grid-lab`, tests | **Keep for lab** — document as non-production |
| `useMockStream` | `markets-grid-lab` | Lab only | Keep |
| `platform-hooks-demo` → `MarketsGridContainer` | `apps/demos/platform-hooks-demo` | Hooks demo only | Keep; add README warning |

### Build-excluded / archive candidates

| Path | Status | Disposition |
|------|--------|-------------|
| `packages/angular-*` buckets | Excluded from consumer pipeline | **Separate decision** — archive or re-enable |
| `apps/demos/demo-angular` | Excluded | Archive candidate |

### Deprecated aliases (low risk, doc-only until removal)

| Symbol | Location | Notes |
|--------|----------|-------|
| `validateStompWireReady` predecessor | `stomp.ts` | `@deprecated` — grep consumers before delete |
| `activeAppIdFromSeed` predecessors | `host-config` | Use `activeAppIdFromSeed` |
| `deriveSingletonConfigId` | `openfin-platform` | Use `deriveTemplateConfigId` |
| `generateTemplateConfigId` | `openfin-platform` | Alias |

---

## v2 extractions (not deprecated — refactored)

| Current | v2 target | Phase |
|---------|-----------|-------|
| `useProviderDataWiring` + snapshot logic in container | `GridDataController` | Phase 2 |
| Implicit hub/client protocol | `MARKETSGRID_DATA_PROTOCOL.md` + conformance | Phase 1 |
| `conditional-styling` full scan | Delta path via `RowChangeBus` | Phase 3 |
| Flat profile blobs | `GridProfileV2` + migrations | Phase 6 |

---

## Scan commands (re-run before Phase 5)

```bash
rg "useBlotterDataConnection|useProviderStream" apps packages --glob "*.{ts,tsx}"

rg "HostedMarketsGrid|MarketsGridContainer" apps/demos --glob "*.{ts,tsx}" -l

rg "@deprecated" packages/react-core packages/data packages/react-grid packages/openfin --glob "*.{ts,tsx}"
```

---

## Sign-off before deletion

- [ ] Zero imports in `apps/demos/star-demo` and `markets-ui-react-reference`
- [ ] Zero imports in `packages/` except tests
- [ ] CHANGELOG + `current-features.md` updated
- [ ] Gate B passed ([strategy doc](./MARKETSGRID_V2_STRATEGY.md#gate-b--start-phase-5-deletions))
