# Worker-owned IndexedDB persistence

**Date:** 2026-05-08
**Status:** Plan / executing in same session.
**Predecessor:** widgets-angular adopt adapter — branch `feature/widgets-angular-adopt-adapter`. Stacked.
**Reference design:** [`data-services-redesign.md` §3](./data-services-redesign.md):
> **Persistence**: worker is the single writer to IndexedDB. Windows
> never persist locally — avoids drift.

---

## Problem statement

Step 2 shipped the simpler "fan-out bus" persistence shape: each
window's main thread persists AppData via its own ConfigManager and
posts the row to the SharedWorker for fan-out. The design doc's
explicit shape was different — **worker is the single IndexedDB writer**,
windows never persist locally.

The fan-out bus has worked fine through Steps 3-5 and the Angular
adapter PR. Cross-window AppData convergence works. There's no driver
for the more aggressive shape — but the user explicitly wants the
design doc gap closed, so we're closing it.

## Goal

The SharedWorkerDataServicesHub becomes the sole IndexedDB writer for
AppData rows. Each window's `AppDataMirror` does:
- Sync reads from local in-memory mirror
- Async writes that send a request to the hub and wait for ack
- Snapshot/delta listening as today

The hub does:
- Constructs its own `ConfigManager` (Dexie connection) inside the SharedWorker
- Hydrates in-memory state from IndexedDB on construction
- Persists every `appdata-set` / `appdata-upsert` / `appdata-remove` to IndexedDB before broadcasting
- Continues to fan deltas to all attached listeners

## Architecture

### Before (fan-out bus, what shipped in Step 2)

```
   Window A's mirror                              Window B's mirror
   ──────────────────                             ──────────────────
   set(name, key, val)                            (idle)
        │
        ├─── ConfigManager.save() (Dexie write A)
        │
        └─── post {appdata-set, row} to hub
                                  │
                          ┌───────▼───────┐
                          │ Hub            │
                          │ • in-memory    │ ← race: A's main-thread
                          │   upsert       │   write commits here too
                          │ • broadcast    │
                          └───────┬───────┘
                                  │
                       (delta to all attached)
                                  │
                                  ▼
                          Window B mirror
                          • applies delta
```

Two writes race per mutation — main-thread Dexie + worker in-memory.
Dexie handles concurrent connections (same DB, different connection
contexts), but the design doc explicitly didn't want this race.

### After (worker-owned)

```
   Window A's mirror                              Window B's mirror
   ──────────────────                             ──────────────────
   set(name, key, val)                            (idle)
        │
        └─── post {appdata-set, row} to hub
                                  │
                          ┌───────▼───────┐
                          │ Hub            │
                          │ • Dexie write  │ ← single writer
                          │ • in-memory    │
                          │   upsert       │
                          │ • ack          │
                          │ • broadcast    │
                          └───────┬───────┘
                                  │
                       (delta to all attached)
                                  │
                                  ▼
                          Window B mirror
                          • applies delta
```

One write per mutation. Mirror's local Dexie connection is gone.

### SharedWorker boot

The worker entry script must construct a ConfigManager *inside* the
SharedWorker context. Dexie supports `indexedDB` access from SharedWorker
contexts (same origin database). The boot becomes:

```ts
// dataServices.sharedWorker.ts (consumer app)
import { installSharedWorkerHub } from '@starui/data-services/runtime/sharedWorker';
import { createConfigManager } from '@starui/config-service';

const cm = createConfigManager({});
await cm.init();                           // seed IndexedDB if empty
installSharedWorkerHub({ configManager: cm });
```

`installSharedWorkerHub` becomes async-friendly: it registers the
`connect` listener synchronously after the ConfigManager is ready, so
ports buffer their first messages until the hub is hydrated. Boot
failures (Dexie open errors, etc.) get logged but don't install the
hub — main-thread `services.ready` never resolves and surfaces the
issue.

---

## Surface changes

### `SharedWorkerDataServicesHub` — takes ConfigManager

```ts
export interface SharedWorkerDataServicesHubOpts {
  /** ConfigManager backing AppData persistence. The hub becomes the
   *  sole IndexedDB writer; main-thread mirrors no longer touch
   *  ConfigManager for AppData. */
  configManager: ConfigManager;

  /** Tick interval for the stats sampler (default 1000ms). */
  statsIntervalMs?: number;
  /** Inject the timer for tests. Default: setInterval. */
  setTimer?: (cb: () => void, ms: number) => unknown;
  /** Inject the timer cancel for tests. Default: clearInterval. */
  clearTimer?: (handle: unknown) => void;
}

export class SharedWorkerDataServicesHub {
  // ...
  /**
   * Hydrate in-memory AppData state from IndexedDB. Caller must
   * await this before invoking handleRequest / handleAppDataRequest.
   */
  async hydrateAppData(): Promise<void>;
}
```

`handleAppDataSet` / `handleAppDataUpsert` / `handleAppDataRemove`
become async — they await the persistence call before broadcasting.

### `installSharedWorkerHub` — takes ConfigManager

```ts
export interface InstallOpts {
  configManager: ConfigManager;
  // existing opts unchanged
}

export async function installSharedWorkerHub(opts: InstallOpts): Promise<InstalledWorker>;
```

Async because it awaits hydration before registering the `connect`
listener. Worker entry scripts gain an `await` — already common pattern.

### `AppDataMirror` — drops ConfigManager / store reference

```ts
// Before
constructor(opts: { subId, configManager, userId, send });

// After
constructor(opts: { subId, userId, send });
```

The mirror no longer owns a `ConfigManager` or `AppDataConfigStore`.
`set()` / `upsertConfig()` / `remove()` all become hub-RPC only —
ack means the hub persisted + applied + broadcasted.

`attach()` no longer reads ConfigManager for seed — the hub already
has its state. The protocol's `seed` field becomes optional + ignored
by the hub (kept for back-compat / future).

### `bootstrapDataServices` — drops mirror's ConfigManager

```ts
// Before
client.attachAppData({ configManager, userId });

// After
client.attachAppData({ userId });
```

`bootstrapDataServices`'s `configManager` param stays — main-thread
consumers (e.g. `DataProviderConfigStore` for the editor) still need
it. It just no longer flows into the mirror.

### Protocol — `appdata-attach` seed becomes optional

```ts
// Before
type AppDataAttachRequest = { kind: 'appdata-attach'; subId: string; seed: readonly AppDataRow[] };

// After
type AppDataAttachRequest = { kind: 'appdata-attach'; subId: string; seed?: readonly AppDataRow[] };
```

The hub ignores `seed` once `appData.isHydrated()` is true (which it
always is post-boot). Field stays optional so older mirrors still
compile.

---

## Files changed

| File | Change |
|---|---|
| `runtime/worker/SharedWorkerDataServicesHub.ts` | Take ConfigManager opt; new `hydrateAppData()`; persist on every set/upsert/remove |
| `runtime/worker/entry.ts` | `installSharedWorkerHub({ configManager })` becomes async |
| `runtime/mirror/AppDataMirror.ts` | Drop ConfigManager + AppDataConfigStore; writes are pure hub-RPC |
| `runtime/protocol.ts` | `seed` field on `appdata-attach` becomes optional |
| `runtime/client/SharedWorkerDataServicesClient.ts` | `attachAppData(opts)` drops `configManager` |
| `runtime/bootstrap/bootstrap.ts` | Don't pass `configManager` to `attachAppData` |
| `runtime/bootstrap/bootstrap.test.ts` | Update tests for the new mirror signature |
| `runtime/worker/SharedWorkerDataServicesHub.test.ts` | Pass ConfigManager stub to every hub constructor |
| `packages/react/.../hooks.test.tsx` | Update test setup |
| `apps/markets-ui-react-reference/src/dataServices.sharedWorker.ts` | Construct ConfigManager + await `installSharedWorkerHub` |

## Files added

None — pure refactor.

## Files deleted

None.

---

## Sequencing — one green commit per concern, smallest blast radius first

1. **Hub takes ConfigManager + hydrate path.** Add the opt; `hydrateAppData()` reads via AppDataConfigStore. Existing handlers stay sync. Tests pass a stub.
   - Commit: `feat(data-services): hub accepts ConfigManager for hydration`.

2. **Hub persists on write.** `handleAppDataSet/Upsert/Remove` become async; await `AppDataConfigStore.save/remove` before applying in-memory + broadcasting.
   - Commit: `feat(data-services): hub persists AppData writes to IndexedDB`.

3. **Mirror drops ConfigManager.** Removes seed read in `attach()`; writes become pure hub-RPC. Mirror's `set`/`upsertConfig`/`remove` no longer touch ConfigManager.
   - Commit: `refactor(data-services): mirror sheds ConfigManager (worker is sole writer)`.

4. **`installSharedWorkerHub({ configManager })`.** Worker entry constructs ConfigManager + awaits init + hydrates hub.
   - Commit: `feat(data-services): installSharedWorkerHub takes ConfigManager`.

5. **Reference app worker entry update.** Construct ConfigManager in the worker entry; await install.
   - Commit: `refactor(reference-app): worker entry constructs its own ConfigManager`.

6. **Test updates.** Hub tests pass stub ConfigManager. Mirror tests drop ConfigManager construction.
   - Bundled into the per-step commits above (each step keeps its tests green).

7. **IMPLEMENTED_FEATURES + verify + push + PR.**

Each step is a working green commit.

---

## Test plan

- All existing AppData tests stay green:
  - `WorkerAppDataStore.test.ts` — in-memory invariants only, no change.
  - `SharedWorkerDataServicesHub.test.ts` — pass ConfigManager stub; the existing AppData round-trip tests now exercise the new persist-then-broadcast path. Add a test asserting the hub writes to ConfigManager (via the stub's `_rows` map).
  - `bootstrap.test.ts` — drop `configManager` from mirror construction; bootstrap signature unchanged.
  - `hooks.test.tsx` — drop `configManager` from setup helper.

- New test: hub persistence proof
  - Stub ConfigManager records `saveConfig` calls; assert that an `appdata-set` causes exactly one `saveConfig` call AND broadcasts to all attached listeners.

- Manual smoke: `npm run dev` → `/dataproviders` → save an AppData row → reload → row persists.
  - This verifies the worker's Dexie write is durable across worker restarts.

## Risks / mitigations

| Risk | Mitigation |
|---|---|
| Dexie / IndexedDB behavior in SharedWorker context. Production-validated less than main-thread Dexie. | Dexie's docs explicitly support Web Workers via the same API. SharedWorkerGlobalScope exposes `indexedDB`. The seed/init flow in ConfigManager doesn't depend on `window`. Smoke test in dev verifies. If issues arise, the rollback is a 5-line change to re-enable mirror-side persistence and revert the hub handlers to sync. |
| Initial hydration latency before first port can attach. | Hub registers `connect` listener AFTER hydrate completes; ports buffer messages until then. Worst case is the first attach takes an extra ~50ms (Dexie open + initial table read). Existing AppData read patterns are similar in scale. |
| Existing IndexedDB rows authored by the main-thread ConfigManager become readable from the worker's connection. | Same Dexie database (same origin, same DB name). Rows are visible across connections. No migration needed. |
| Mirror's `attach()` no longer sends seed → if a hub somehow restarts mid-session without rehydrating, it'll have an empty store. | The hub hydrates at boot; once installed it never resets. SharedWorker restarts (after all clients disconnect for >5s, browser-implementation-defined) trigger a fresh boot which re-hydrates. There's no path where the hub forgets state without re-running `hydrateAppData()`. |
| Tests that construct `new SharedWorkerDataServicesHub()` without args will break. | Compile error catches every site; pass `stubConfigManager()`. |

## Done when

- One green commit per sequencing step.
- `npx turbo typecheck build test` green.
- IMPLEMENTED_FEATURES.md records the migration.
- PR opened with base `feature/widgets-angular-adopt-adapter`, stacked.
- Manual smoke confirms AppData rows persist across worker restarts.
