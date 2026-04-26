# Plan — DataProvider integration: runtime gaps, redesigned configurator, MarketsGrid wiring, local-data cleanup

A follow-up to [DATA_PLANE.md](./DATA_PLANE.md). The runtime package
(`@marketsui/data-plane`) shipped with the gaps mapped below; this plan
closes those gaps, lifts the stern reference configurator into a
robust, design-system-aligned authoring surface in
`@marketsui/widgets-react`, wires MarketsGrid to consume DataProviders
end-to-end, and removes every local row-generator in the apps so
MarketsGrid is data-plane-only.

## 1. Context

Three audits drive this plan:

1. **Runtime gaps** in `@marketsui/data-plane` against
   `MarketsUI DataProvider Architecture — Requirements`.
2. **Stern reference configurator** patterns + Angular configurator —
   what's good, what's awkward, what to lift forward.
3. **Local data sources** in apps that feed MarketsGrid today and need
   to be removed.

### 1.1 Runtime gaps verified by audit

| Gap | Status | Reference requirement |
|---|---|---|
| `restart()` broadcasts new snapshot to ALL subscribers | Missing | §2 contract; §4.2 |
| `appData.resolve(template)` for `{{providerId.key}}` | Missing | §3.2 |
| Per-key persistence policy (volatile / persisted) on AppData | Missing | §7 follow-up |
| Conflation + throttling in worker fanout | Missing | §7 backpressure |
| `scope: "system" \| "user:<userId>"` on persisted config | Missing | §6 |
| SharedWorker key = `sharedworker_<origin>_<appId>` | Wrong (static `'marketsui-data-plane'`) | §4.1 |
| Reconnect backoff + jitter + per-provider config | Hardcoded 5s, no jitter | §3.1 |
| HistoricalDataProvider subtype | Absent | §3.3 |
| Snapshot-end token detection | Present + correct | §3.1 ✓ |
| Field inference helper | Present (static) | §3.1 ✓ |

### 1.2 Configurator state today

- **Angular configurator** at [packages/angular/src/components/data-provider-editor/](../../packages/angular/src/components/data-provider-editor/) — 3-tab (Connection / Fields / Columns), Reactive Forms + AG-Grid Enterprise, ~650 LOC. Solid bones; UX is functional but not design-system-aligned.
- **React configurator (work-in-progress) at [packages/widgets-react/src/provider-editor/stomp/](../../packages/widgets-react/src/provider-editor/stomp/)** — same 3-tab shape, shadcn/ui-based, ~800 LOC. This is the foundation we'll harden.
- **Common pain points to fix in the redesign**: no field-inference summary card before commit; no per-column overrides surfaced clearly; "Test Connection" gives a toast but no inline status; no template-substitution UI for `{{providerId.key}}`; manual columns ↔ inferred fields integration is murky; no scope picker (system vs user); no provider preview.

### 1.3 Local data to remove

| File | Generator | Where it feeds | LOC | Tests |
|---|---|---|---|---|
| `apps/demo-react/src/data.ts` | `generateOrders` / `generateEquityOrders` / `startLiveTicking` | `App.tsx`, `Dashboard.tsx` | ~225 | Implicit |
| `apps/markets-ui-react-reference/src/views/BlottersMarketsGrid.tsx` lines 60–88 | `generateOrders(500)` | The Blotter route's `<MarketsGrid rowData={…}>` | ~30 | None |
| `apps/demo-react/src/marketDepthData.ts` | Out of scope (Market-depth view, not MarketsGrid) | — | — | — |

`packages/markets-grid` itself is already clean — `MarketsGrid` accepts `rowData: TData[]` as a required prop, no internal generation.

## 2. Architecture decisions (locked from §7 follow-ups)

These decisions came from the user's annotations on the requirements doc and are now load-bearing:

1. **Cache stays warm after last unsubscribe.** Providers retain their snapshot indefinitely; new subscribers always get the cached snapshot immediately. No TTL eviction.
2. **Provider config edits require app restart.** No live re-config; saving a new version takes effect on the next platform boot. Simpler invalidation story; no race conditions.
3. **AppData per-key durability is a per-key flag.** Some keys are volatile (auth tokens, transient selections), some are persisted (user preferences). Stored on the config row, not the wire.
4. **Historical = its own subtype.** Snapshot-only contract; date picker drives a separate fetch. No mode-flag on the StompDataProvider.
5. **Backpressure = worker-level conflate + throttle.** Per-provider config: `conflateByKey` (key column for upsert-style coalescing) + `throttleMs` (max-fanout window). Consumers stay simple.

## 3. Implementation phases

Each phase is independently mergeable and value-shipping. Phase A is the
runtime foundation; B & C build on it; D removes the demos; E is the
gate.

### Phase A — Data-plane runtime gaps

**Goal:** close every runtime gap so the package matches the requirements
doc end-to-end. No UX changes.

**A.1 — `restart()` with broadcast** ([packages/data-plane/src/providers/](../../packages/data-plane/src/providers/))
- Add public `restart(): Promise<void>` to `ProviderBase`. Default impl: `await teardown(); await initialize(); broadcastSnapshot()`.
- `StreamProviderBase.restart()` resets snapshot state, re-runs `start()`, and on snapshot completion fires the new snapshot to **every** active subscriber port (not just newcomers).
- Wire protocol: new opcode `restart` in [protocol.ts](../../packages/data-plane/src/protocol.ts). Worker router routes it to the matching provider instance.
- Client surface: `DataPlaneClient.restart(providerId): Promise<void>`. React hook: `useDataPlaneRestart(providerId)` returning a no-op-safe trigger.
- Tests: a subscriber attached before restart receives the second snapshot; multiple subscribers all receive it; concurrent restart calls coalesce.

**A.2 — `appData.resolve(template)` template substitution** ([packages/data-plane/src/providers/AppDataProvider.ts](../../packages/data-plane/src/providers/AppDataProvider.ts))
- Add `resolve(template: string): string` instance method. Substitutes `{{providerId.key}}` tokens. Cross-provider lookups are out-of-scope for the AppData provider (it only knows its own keys); cross-provider templating belongs higher up the stack — note this in the docstring.
- Add a worker-protocol opcode `resolve` so consumers in other windows can ask the worker to substitute. Returns substituted string.
- React hook: `useDataPlaneResolve()` returning a `resolve(template): Promise<string>`.
- Tests: nested tokens (`{{a}}{{b}}`), missing keys (`{{nope}}` left as-is with a warning), escaped braces (`\{{` literal), recursive guard against `{{a}} → "{{b}}" → ...` infinite loops.

**A.3 — Per-key persistence policy on `AppDataProvider`**
- Extend `AppDataProviderConfig` (`packages/shared-types/src/dataProvider.ts`) with `keys: Record<string, { initial?: unknown; durability: 'volatile' | 'persisted' }>`. Replaces the current `variables` seed; backward-compatible loader treats existing configs as all-volatile.
- On `set(key, value)`: if `durability === 'persisted'`, write through to `@marketsui/config-service` under a dedicated app-data row keyed by `(appId, providerId, key)`. Use a single row per provider (one document, multiple keys) to keep round-trips predictable.
- On worker startup: rehydrate persisted keys from config-service before any subscriber attaches.
- Tests: a persisted key survives worker restart; a volatile key does not; a shape change between deploys doesn't crash on rehydrate.

**A.4 — Conflation + throttling in worker fanout** ([packages/data-plane/src/worker/broadcastManager.ts](../../packages/data-plane/src/worker/broadcastManager.ts))
- Add `conflateByKey?: string` and `throttleMs?: number` to `StompProviderConfig` and `HistoricalProviderConfig`. Documented as "best-effort coalescing"; ordering of the final flush is FIFO but the intermediate updates may drop.
- Worker logic: per-provider buffer `Map<keyValue, latestRow>`. When a delta arrives:
  - If `conflateByKey` set, upsert into the buffer keyed by `row[conflateByKey]`. Otherwise append to a list.
  - If `throttleMs` set, schedule a flush on the trailing edge; pile-up calls reset the timer (debounce) — actually a fixed-window throttle is more predictable for grids; spec'd as window-based, flush every `throttleMs`.
  - On flush: send the consolidated payload to all subscribed ports as a single `delta-batch`.
- Subscribers receive the same payload shape as today (a list of rows); no client changes for the common case.
- Tests: 100 fast updates with `throttleMs: 100` → ≤2 flushes; conflation dedupes by key; clearing `conflateByKey`/`throttleMs` reverts to immediate fanout.

**A.5 — `scope` field on persisted DataProvider config** ([packages/data-plane/src/services/dataProviderConfigService.ts](../../packages/data-plane/src/services/dataProviderConfigService.ts) + [packages/shared-types/src/configuration.ts](../../packages/shared-types/src/configuration.ts))
- Add explicit `scope: 'system' | 'user'` on the saved row. The userId column already differentiates per-user rows, but we want the **intent** captured explicitly so the configurator can show a scope picker and the loader can filter.
- `system`-scope rows write under `userId: 'system'` (existing global pattern).
- `user`-scope rows write under the active `userId`.
- Loader: by default, configurator dropdowns show **`system` ∪ `user` for the active user**. Migration: existing rows default to `user` scope when their `userId !== 'system'`, else `system`.
- Tests: round-trip both scopes; the dropdown filter; one user can't see another user's user-scoped configs.

**A.6 — SharedWorker keying = `sharedworker_<origin>_<appId>`** ([packages/data-plane/src/client/connect.ts](../../packages/data-plane/src/client/connect.ts))
- `connectSharedWorker({ appId })` builds the worker name as `sharedworker_${location.origin}_${appId}`. The origin already gates same-origin browser semantics; appId disambiguates multiple apps served from the same origin.
- Existing callers that don't pass `appId` default to a synthesised key from `fin.me.identity.uuid` when running inside OpenFin, falling back to `'default'` otherwise.
- `<DataPlaneProvider>` reads `appId` from props or from the `customData` forwarded to the window (matches the WorkspaceSetup scope-forwarding pattern).
- Tests: two clients with the same `appId` connect to the same worker (verified via shared-state visibility); different `appId` values → distinct workers.

**A.7 — Reconnect policy** ([packages/data-plane/src/providers/StompStreamProvider.ts](../../packages/data-plane/src/providers/StompStreamProvider.ts))
- Add `reconnect?: { initialDelayMs?: number; maxDelayMs?: number; jitter?: 'full' | 'equal' | 'none'; maxAttempts?: number }` to `StompProviderConfig`. Defaults: 1000 / 30000 / equal / Infinity.
- Replace the hardcoded `reconnectDelay: 5000`. Use exponential backoff with chosen jitter strategy. After `maxAttempts`, emit a typed `reconnect-exhausted` event to subscribers and stop.
- Tests: backoff schedule under controlled clock, jitter strategies, exhaustion fires once, manual `restart()` resets the attempt counter.

**A.8 — `RestDataProvider` snapshot-only subtype**
- New subtype `componentSubType: 'rest'`. Config:
  ```ts
  interface RestProviderConfig {
    providerType: 'rest';
    method: 'GET' | 'POST';
    url: string;
    headers?: Record<string, string>;
    body?: unknown;             // for POST; can carry templates {{appdata.token}}
    keyColumn?: string;
    snapshotTimeoutMs?: number;
    inferredFields?: FieldInfo[];
    columnDefinitions?: ColumnDefinition[];
    conflateByKey?: string;     // (no-op for snapshot-only but kept for shape parity)
    throttleMs?: number;        // (same)
  }
  ```
- Implementation: snapshot-only `ProviderBase`. `start()` issues a fetch, populates the snapshot, marks complete. No stream tail. `restart({ asOfDate? })` re-fetches with the date passed through to `body` template substitution.
- Both STOMP and REST providers can be designated as the **historical** slot in MarketsGrid; the grid's date picker drives `restart()` with `asOfDate` regardless of subtype.
- Tests: GET + POST flows, header forwarding, template substitution in body, error path, date round-trip via `restart({ asOfDate })`.

### Phase B — Redesigned configurator in `@marketsui/widgets-react`

**Goal:** ship a robust, intuitive, design-system-compliant authoring
surface for StompDataProvider (and the new HistoricalDataProvider).

**B.1 — Shell + scope + naming**

A 4-tab (was 3) frame: **Connection → Fields → Columns → Behaviour**. Top header carries:
- **Provider name** (required, with auto-suggest from `componentType + subtype`)
- **Scope picker**: `system` vs `user` (system requires admin role — checked at save time)
- **Subtype tag** (read-only): `STOMP`, `Historical`, `AppData`
- **Status pill**: Idle / Snapshot ready / Error

Footer carries `Test Connection`, `Infer Fields`, `Cancel`, `Save / Update` actions, all gated by tab and validity. Save dispatches with the current scope.

Layout shell follows the [WorkspaceSetup pattern](../../packages/dock-editor-react/src/WorkspaceSetup.tsx): outer flex with `data-dock-editor` for design-token resolution; fixed header / scrollable body / fixed footer; `.bn-scrollbar` themed scrollbars; full dark/light parity.

All form primitives use shadcn-style inputs from `@marketsui/ui` — no native HTML inputs (CLAUDE.md rule).

**B.2 — Connection tab redesign**

Two columns:
- **Left (60%)**: form fields — name, websocketUrl, listenerTopic, requestMessage, requestBody (textarea, autosized), snapshotEndToken, snapshotTimeoutMs.
- **Right (40%)**: a live "Connection diagnostics" card. Shows: `Connecting…` spinner → `Connected, awaiting snapshot…` → `N rows / M ms` → `Snapshot complete` OR `Error: <reason>`. Card stays mounted during edit so the user can re-test without scrolling.

Below: a "Templates" expander showing how to use `{{appdata-provider.key}}` syntax inside `requestMessage` / `requestBody` / `listenerTopic`, with a live preview of the substituted value and a list of currently-defined AppData providers and keys (read from `loadAllConfigs(componentType: 'data-provider', subtype: 'appdata')`).

**B.3 — Fields tab redesign**

- **Inference summary header**: `123 rows sampled · 45 fields detected` after inference completes. "Re-sample" button to redo with a different sample size (selector: 10 / 100 / 500 / 1000 / all).
- **Field tree**: hierarchical, expandable, multi-select via shadcn `Checkbox`. Type chips next to each leaf (`string`, `number`, `date`, `boolean`, `object`, `array`, `mixed`) styled with semantic tokens.
- **Search + filter chips**: `All / Selected / Unselected / Numeric / Date`.
- **Bulk actions**: `Select all visible`, `Deselect all`, `Select numeric only`, etc.
- **Field detail flyout** (right side): on hover/click, show `5 sample values`, `nullable`, `min/max/length` for numbers/strings.

Implementation reuses the existing field-inference helper `StompDataProvider.inferFields(rows)` (unchanged). The hook `useFieldInference` is rewritten to expose the inference summary + sample-size control; old hook stays untouched until call-sites migrate.

**B.4 — Columns tab redesign**

- **Generated columns** (top section): one row per selected field, with inline editors for: `headerName`, `width`, `sortable`, `filter`, `valueFormatter` (dropdown of preset formatters keyed by inferred type), `cellRenderer` (dropdown of registered renderers).
- **Manual columns** (bottom section): `+ Add manual column` (e.g. for a calculated column or a static label). Same inline-editor row.
- **Row identity** (callout at the top of the tab): explicit picker for `keyColumn` — "Which column uniquely identifies a row?". Explains why this matters (drives `getRowId` for `applyTransaction`); validates that the chosen column is always present and unique in the inferred sample.
- **Preview table** (right side, sticky): renders 10 sample rows via a stripped-down AG-Grid using the current column config. Live-updates as the user edits.

Centralised `valueFormatter` / `cellRenderer` registry: a new module `packages/widgets-react/src/provider-editor/columnRegistry.ts` exporting `{ formatters: Record<string, ValueFormatterFunc>, renderers: Record<string, CellRendererSelectorResult> }`. Both Angular and React forms read from this single source — eliminates the hardcoded maps in the current Columns tab.

**B.5 — Behaviour tab (new)**

Surfaces the new conflation + throttle + reconnect knobs:
- **Conflate by key** (toggle + dropdown, defaults to the row-identity column).
- **Throttle (ms)** (slider 0–500, with `Off` = 0).
- **Reconnect**: initialDelay / maxDelay / jitter / maxAttempts.

Each control has a one-line "what this does" hint and a "use defaults" reset.

**B.6 — Wire to ConfigService with explicit scope**

- Save flow: posts the redesigned payload through `dataProviderConfigService.create({ scope, …config })`.
- Load flow: when editing, hydrates from `getConfig(configId)`, including `inferredFields`, `columnDefinitions`, `conflateByKey`, `throttleMs`, `reconnect`.

**B.7 — REST configurator**

Same shell, same 4 tabs. Connection tab swaps to REST-specific fields (method, url, headers grid, body textarea with template support). Behaviour tab hides conflate/reconnect knobs (snapshot-only) — keeps `throttleMs` for the optional retry-storm guard but greys out the rest. Field inference and column build flows are identical (REST returns rows; same `inferFields` helper). No separate "Historical" form — historical is just a checkbox in the MarketsGrid customizer that designates one of the configured providers (STOMP or REST) as the date-driven one.

### Phase C — MarketsGrid customizer wiring

**Goal:** make MarketsGrid select and consume DataProviders end-to-end.

**C.1 — DataProvider selector control**

A new shared component `<DataProviderSelector />` in `@marketsui/widgets-react/data-provider-selector`. Props:
- `subtype: 'stomp' | 'historical' | 'appdata'`
- `scopes?: Array<'system' | 'user'>` (default: both)
- `value: string | null` (configId)
- `onChange(configId | null)`
- `mode?: 'dropdown' | 'list'` (default dropdown)

Reads via `dataProviderConfigService.list({ componentSubType, scopes })`. Each item shows: name, scope badge (system / user), last-updated. An "Edit…" affordance opens the Phase B configurator inline (modal or drawer).

**C.2 — MarketsGrid customizer integration**

In the existing settings panel (under [packages/markets-grid/src/SettingsSheet/](../../packages/markets-grid/src/SettingsSheet/)), add a **Data** section with:
- **Primary provider** (required) — `<DataProviderSelector subtype="stomp" />`
- **Historical provider** (optional toggle) — when enabled, surfaces:
  - `<DataProviderSelector subtype="historical" />`
  - The grid's toolbar gains a `<DatePicker />` that drives `restart({ asOfDate })` on the historical provider on change.
- **Row identity (`getRowId`)** — read-only when picked from the configurator's row-identity field; editable as an override here for advanced users.

Persistence: provider selections, the historical toggle, and the row-identity override go into the existing MarketsGrid profile under a new `data` block. Profile schema bumps to v2 with a forward-compatible loader.

**C.3 — MarketsGrid runtime — replace local rowData with data-plane**

Today: `<MarketsGrid rowData={…} />` accepts a static array.

After: a new `<MarketsGridContainer />` host component wraps `MarketsGrid` and:
1. Reads the active provider config from the profile.
2. Uses `useDataPlaneRowStream(configId)` to subscribe.
3. Calls `gridApiRef.current.setRowData(snapshot)` on snapshot.
4. Calls `gridApiRef.current.applyTransactionAsync({ update, add })` on each delta.
5. Configures `getRowId` from the profile's row-identity field.

The bare `<MarketsGrid>` props stay the same (rowData, gridOptions, etc.) for backward compatibility — the container is additive.

Apps adopt the container; existing direct `<MarketsGrid rowData={…} />` use-sites get migrated in Phase D.

### Phase D — Local-data cleanup in apps

**Goal:** remove every local row-generator so MarketsGrid can only be
hydrated through the data plane.

**D.1 — `apps/markets-ui-react-reference/src/views/BlottersMarketsGrid.tsx`**
- Replace the inline `generateOrders(500)` (lines 60–88, 178) with `<MarketsGridContainer providerConfigId={…} />`.
- Surfaces a "No DataProvider configured — open Settings" empty state when the profile has no provider selected.

**D.2 — `apps/demo-react/src/data.ts`**
- Delete the file (`generateOrders`, `generateEquityOrders`, `startLiveTicking` — ~225 LOC). Remove imports in `App.tsx` and `Dashboard.tsx`.
- Replace with `<MarketsGridContainer providerConfigId={…} />` driven by either (a) a default DataProvider that ships with the demo's `seed-config.json`, or (b) an empty state that prompts the user to define one.
- The "live ticking" demo flavor moves to a small built-in `MockStreamProvider` (already exists in `packages/data-plane`) seeded by the demo's seed config — no app-level row-gen at all.

**D.3 — `apps/demo-react/Dashboard.tsx`**
- Same migration; the second grid (equity) gets its own pre-seeded provider.

**D.4 — `apps/demo-react/src/marketDepthData.ts`** — out of scope (not MarketsGrid).

**D.5 — Cleanup checks**
- Grep for `Array.from({length:` in apps + `Math.random()` in MarketsGrid hydration paths — should return zero hits after this phase.
- Grep for `generateOrders`, `startLiveTicking` — zero hits.

### Phase E — Validation gate

- `npx turbo typecheck test --force` — green; all 487+ tests still pass.
- New unit tests for: restart broadcast, resolve template, per-key durability, conflation, throttle, scope filter, SharedWorker keying.
- New e2e covering the canonical scenario: **two MarketsGrid instances on the same STOMP topic share one socket and one cache** ([apps/markets-ui-react-reference](../../apps/markets-ui-react-reference) + a new playwright spec).
- Manual OpenFin smoke: `npm run dev:openfin:markets-react` → create a STOMP DataProvider via the new configurator → save under `system` scope → open MarketsGrid Blotter → pick the provider → see snapshot → verify deltas applyTransaction-update — without any local row-gen running.
- `docs/IMPLEMENTED_FEATURES.md` updated with §1.S DataProvider integration entry summarising the work and pointing back at this plan.

## 4. Critical files

| Path | Role |
|---|---|
| **Phase A — runtime** | |
| `packages/data-plane/src/protocol.ts` | New `restart` + `resolve` opcodes |
| `packages/data-plane/src/providers/ProviderBase.ts` | `restart()` + broadcast |
| `packages/data-plane/src/providers/StreamProviderBase.ts` | Restart-on-stream semantics |
| `packages/data-plane/src/providers/AppDataProvider.ts` | `resolve()` + per-key durability |
| `packages/data-plane/src/providers/StompStreamProvider.ts` | Configurable reconnect + jitter |
| `packages/data-plane/src/providers/HistoricalProvider.ts` | **NEW** historical subtype |
| `packages/data-plane/src/worker/broadcastManager.ts` | Conflate + throttle |
| `packages/data-plane/src/worker/router.ts` | Route new opcodes; per-app worker keying |
| `packages/data-plane/src/client/connect.ts` | `sharedworker_<origin>_<appId>` keying |
| `packages/data-plane/src/services/dataProviderConfigService.ts` | `scope` field + filtered listing |
| `packages/shared-types/src/dataProvider.ts` | `keys: { durability }`, `conflateByKey`, `throttleMs`, `reconnect`, historical config |
| `packages/shared-types/src/configuration.ts` | `scope: 'system' \| 'user'` on `UnifiedConfig` |
| **Phase B — configurator** | |
| `packages/widgets-react/src/provider-editor/StompConfigurationForm.tsx` | Redesigned shell |
| `packages/widgets-react/src/provider-editor/tabs/ConnectionTab.tsx` | Connection + diagnostics card |
| `packages/widgets-react/src/provider-editor/tabs/FieldsTab.tsx` | Inference summary + tree + flyout |
| `packages/widgets-react/src/provider-editor/tabs/ColumnsTab.tsx` | Generated + manual columns + preview |
| `packages/widgets-react/src/provider-editor/tabs/BehaviourTab.tsx` | **NEW** conflate/throttle/reconnect |
| `packages/widgets-react/src/provider-editor/columnRegistry.ts` | **NEW** centralised formatters/renderers |
| `packages/widgets-react/src/provider-editor/HistoricalConfigurationForm.tsx` | **NEW** historical subtype form |
| **Phase C — MarketsGrid** | |
| `packages/widgets-react/src/data-provider-selector/DataProviderSelector.tsx` | **NEW** picker |
| `packages/markets-grid/src/MarketsGridContainer.tsx` | **NEW** data-plane-aware host |
| `packages/markets-grid/src/SettingsSheet/DataSection.tsx` | **NEW** Data section in customizer |
| **Phase D — apps cleanup** | |
| `apps/markets-ui-react-reference/src/views/BlottersMarketsGrid.tsx` | Remove `generateOrders`, adopt container |
| `apps/demo-react/src/data.ts` | Delete |
| `apps/demo-react/src/App.tsx` | Adopt container |
| `apps/demo-react/src/Dashboard.tsx` | Adopt container |
| `apps/config-service-server/data/seed-config.json` | Seed default DataProviders for demo |

## 5. Sequencing

| Week | Phase | Deliverables |
|---|---|---|
| **W1** | A.1–A.7 | Restart, resolve, per-key durability, conflate/throttle, scope, SharedWorker keying, reconnect. Runtime tests green. |
| **W2** | A.8 + B.1–B.4 | HistoricalProvider; configurator shell + Connection/Fields/Columns tabs redesigned. |
| **W3** | B.5–B.7 + C.1 | Behaviour tab; ConfigService scope wiring; HistoricalConfigurationForm; DataProviderSelector. |
| **W4** | C.2–C.3 + D.1 | MarketsGrid customizer Data section; MarketsGridContainer; markets-ui-react-reference migrated. |
| **W5** | D.2–D.4 + E | Demo apps cleaned of local rowgen; e2e gate; docs. |

Total: **~5 weeks**. Phases A and B can partially parallelise once A.5 (the schema bump) lands.

## 6. Out of scope for this plan

- Cross-app IAB bridge (`iab-bridge.ts`) — deferred per the original DATA_PLANE.md "full cross-app story to Phase 5".
- Authentication tokens flow (Open Question #4 in DATA_PLANE.md) — touched only by AppDataProvider's `volatile` keys; no new auth machinery here.
- Server-side row models / virtual scrolling — MarketsGrid stays client-side for this work.
- Migration of the OLDER Angular configurator at `packages/angular/src/components/data-provider-editor/`. That can stay; the new React configurator is the recommended path.

## 7. Resolved decisions (apply throughout the plan)

These supersede the equivalent sections above where they differ.

1. **Visibility = `public` / `private` flag, not "system" / "user"**.
   - `public` → row is saved with `userId: 'system'` (visible to everyone of the same `appId`).
   - `private` → row is saved with the active `userId` (e.g. `dev1` during dev).
   - Same persistence shape; the configurator surfaces a single boolean toggle labelled `Public`. The DataProvider list filter is "show public ∪ my private" by default.
   - Keeps the model simple — no separate `scope` enum, just the existing `userId` column with a sentinel value `'system'` for public.
2. **AppData persistence shape: one config-service row per provider**, with all the provider's persisted keys living in that single document. Reduces round-trips and keeps rehydrate atomic.
3. **Historical is a *designation*, not a subtype**. Any DataProvider (STOMP or REST) can be assigned as the historical provider in the MarketsGrid customizer. The role lives at the consumer level: MarketsGrid has two slots — `primary` and `historical` — both accept any provider subtype. When `historical` is filled, the grid toolbar shows a date picker that calls `restart({ asOfDate })` on the historical provider.
   - **Phase A.8 (was: HistoricalProvider as subtype) becomes A.8: minimal `RestDataProvider`** — a snapshot-only provider that POSTs/GETs a REST endpoint. Mirrors the `StompDataProvider` snapshot pattern without the socket lifecycle. ~150 LOC. The same configurator (Phase B) handles both STOMP and REST via subtype-aware sections; no separate "Historical" form.
4. **Inference sample size: ~200 rows, completeness-weighted**. The `inferFields` helper picks 200 random rows biased toward rows with the fewest null/empty fields, so inference covers the real schema even when many rows are sparse. Falls back to random uniform if fewer than 200 "complete-enough" rows exist. Configurable in the configurator (defaults to 200, slider 50–500). No "all rows" option — the upper bound is capped at 500 to keep inference fast on large snapshots.
