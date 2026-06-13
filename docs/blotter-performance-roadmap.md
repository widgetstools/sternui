# Blotter performance roadmap (32 GB OpenFin multi-window targets)

Forward-looking optimization backlog for the markets-grid ("blotter")
data pipeline. **Nothing here is implemented yet** — it's the prioritized
plan from a full pipeline audit. For what is *already done*, see
[`hub-fanout-optimizations.md`](./hub-fanout-optimizations.md).

## Context

Pipeline: STOMP/REST provider (SharedWorker) → `SharedWorkerDataServicesHub`
cache + fan-out → per-window `MessagePort` → `SharedWorkerDataServicesClient`
→ `ProviderClientAdapter` / `useDataProvider` → `MarketsGridContainer` →
`applyProviderToGrid` → AG Grid (client-side row model).

The fan-out architecture is already optimized: **one** shared SharedWorker
cache per provider, binary `delta-bin` fan-out (`LIVE_BIN_MIN_ROWS=64`),
conflation/throttle (`bufferedDispatch`), thin deltas (`thinDeltas`),
columnar wire (`wireFormat`), field projection (`projectFields`), and
memoized pre-encoded snapshot replay.

**Remaining bottleneck on 32 GB / OpenFin multi-window is NOT the hub.**
It is **per-window main-thread CPU and per-renderer-process memory**: every
window independently decodes every frame and runs its own AG Grid instance,
so cost scales with `windows × publish rate × row width`. Each OpenFin
window is a separate renderer process with its own V8 heap, so the lever is
reducing per-window baseline + redundant retained copies, not the shared
worker cache.

Do **not** invest in further hub fan-out work — it is ~flat in window count
for large frames and holds a single shared cache.

---

## Tier 1 — config-only, zero code, biggest immediate wins

These per-provider `cfg` / General Settings values currently default to the
worst case for streaming.

1. **Live throttle + conflation by default.** `cfg.throttleMs` unset →
   `bufferedDispatch` passes every frame straight through
   (`packages/data/host-data/src/runtime/providers/transports/stomp.ts:335-352`).
   For a live blotter set `throttleMs: 100` + `conflateByKey: <keyColumn>`:
   collapses repeated ticks on the same row, and the larger batches cross
   `LIVE_BIN_MIN_ROWS` (64) so the worker fan-out flips to binary (flat cost
   across windows) instead of per-listener structured clones. Reference:
   `apps/demos/stomp-marketsgrid-minimal/src/stompProvider.ts` already does
   `throttleMs: 100`, `conflateByKey: 'positionId'`.
2. **`animateRows: false` for tick feeds.** Default `true`
   (`packages/shared/engine/src/customizer/modules/general-settings/state.ts:266`);
   schema hint already says "Disable for high-frequency tick feeds"
   (`gridOptionsSchema.tsx:25`). Row animation re-layouts every transaction.
3. **`projectFields: true`** (default off). Prunes rows to
   `columnDefinitions + keyColumn` at parse time — shrinks hub cache, wire
   bytes, per-window decode, AND the AG Grid row store at once. Best
   cross-cutting memory + CPU lever for wide rows.
4. **`wireFormat: 'columnar'`** for numeric-heavy feeds — numbers travel as
   raw Float64, cutting per-window decode several-fold.

---

## Tier 2 — small code changes, high multi-window value

5. **Visibility-aware throttling for background windows.** *(Likely the
   single largest CPU saving in a many-window layout.)* Today every window
   decodes + `applyTransactionAsync` at full rate even when hidden behind
   other OpenFin windows. Plan: when `document.hidden`, stop applying live
   ticks (the hub cache stays authoritative) and run one `refresh()`
   cache-replay on focus/visibility regain. Wiring point:
   `packages/react-core/widgets-react/src/v2/markets-grid-container/MarketsGridContainer.tsx`
   tick subscription (~762-787). Note `RowChangeBus` uses a 0 ms timer (not
   rAF) precisely because hidden OpenFin views pause rAF — reuse that
   reasoning.
6. **`thinDeltas: true` guidance for wide, sparse-update blotters.** Hub
   ships only changed top-level fields (`delta-patch`), cutting wire +
   decode. Costs the worker a `diffTopLevel` per row per frame — a win when
   rows are wide and per-tick touches are sparse (risk/PnL blotters), a loss
   on narrow rows or full-row churn. Document the trade-off; consider
   auto-recommending in the editor when row width > N columns.

---

## Tier 3 — memory cleanups (scale with window count)

7. **Drop the stale per-subscription row copy.** `ProviderClientAdapter`
   keeps `this.data = [...rows]` on every snapshot
   (`packages/data/host-data/src/provider/ProviderClientAdapter.ts:127,225`)
   but **never updates it on live ticks** (`onUpdate` at line 216 doesn't
   touch it). So `getData()` (line 158) returns a stale full duplicate of
   the snapshot (e.g. 20k wide rows) retained per window for little benefit.
   Make it lazy (rebuild from grid on demand) or remove it — verify
   `getData()` callers first.
8. **AG Grid streaming defaults.** `debounceVerticalScrollbar: true`; keep
   `enableCellChangeFlash: false` (already default,
   `general-settings/state.ts:347`); review `cellFlashDuration` (500) /
   `cellFadeDuration` (1000) — only relevant if flashing is enabled, but
   confirm they're not paid for when off.

---

## Tier 4 — structural / larger / profile-first

9. **Feature-module full-grid passes on structural events.** Alerts /
   conditional styling recompute on `setRowData`; at high snapshot-restart
   frequency that is O(rows) per restart per window. Profile before
   investing — only matters for heavy alert/styling users.
10. **Reconnect backoff is a documented TODO** — only
    `reconnect.initialDelayMs` is honored;
    `maxDelayMs`/`jitter`/`maxAttempts` are reserved/ignored
    (`packages/shared/types/src/dataProvider.ts:199-213`). Resilience, not
    steady-state perf.

---

## Reference anchors

| Concern | Location |
|---------|----------|
| `asyncTransactionWaitMillis={0}` | `packages/react-grid/grid/src/widget/MarketsGridSurface.tsx:138` |
| `getRowId` | `packages/shared/engine/src/platform/GridPlatform.ts:74-76` |
| Snapshot → `setGridOption('rowData')` | `packages/react-core/widgets-react/src/v2/markets-grid-container/MarketsGridContainer.tsx:751` |
| Live → `applyTransactionAsync` | `packages/react-core/widgets-react/src/v2/markets-grid-container/applyProviderToGrid.ts:179` |
| `LIVE_BIN_MIN_ROWS = 64` | `packages/data/host-data/src/runtime/worker/SharedWorkerDataServicesHub.ts:112` |
| `LATE_JOIN_CHUNK_SIZE = 500` | `packages/data/host-data/src/runtime/worker/SharedWorkerDataServicesHub.ts:97` |
| `bufferedDispatch` defaults | `packages/data/host-data/src/runtime/providers/transports/bufferedDispatch.ts:81-84` |
| STOMP conflate/throttle wiring | `packages/data/host-data/src/runtime/providers/transports/stomp.ts:335-352` |
| Perf cfg knobs (types) | `packages/shared/types/src/dataProvider.ts:127-214` |
| General Settings perf defaults | `packages/shared/engine/src/customizer/modules/general-settings/state.ts:266-383` |

## Provider config performance knobs (current defaults)

| Field | Default | Effect |
|-------|---------|--------|
| `keyColumn` | unset | Cache key + `getRowId`; required for thin deltas |
| `throttleMs` | unset → 0 (immediate) | Trailing-edge batch window |
| `throttleEnabled` | ON | `false` forces `throttleMs: 0`, preserves value |
| `conflateByKey` | falls back to `keyColumn` | Upsert key in throttle window |
| `conflateEnabled` | ON | `false` disables conflation entirely |
| `snapshotChunkSize` | 500 | Rows per worker→client snapshot message |
| `projectFields` | OFF | Prune to columns + keyColumn at parse |
| `thinDeltas` | OFF | Hub `delta-patch`; client mirror + merge |
| `wireFormat` | `'json'` | `'columnar'` → Float64 codec on binary frames |
| `heartbeat.incoming/outgoing` | 4000 ms | stompjs heartbeat |
| `reconnect.initialDelayMs` | 5000 ms | stompjs `reconnectDelay` (only field honored) |
