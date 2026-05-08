# Step 2 — AppData → SharedWorker authoritative + main-thread mirror

**Date:** 2026-05-08
**Status:** Plan / awaiting approval. No code changes yet.
**Predecessor:** Step 1 (rename) merged via PR #26.
**Reference design:** [`data-services-redesign.md` §3](./data-services-redesign.md)

---

## Problem statement

Today `AppDataStore` lives per-tab, per-window:

- Each window calls `new AppDataStore(configManager, userId)` inside
  `<DataServicesProvider>` and gets its own snapshot.
- A `set()` in window A writes to `ConfigManager` (Dexie / REST) and
  fires the listener on A only. Window B keeps stale values until it
  reloads.
- `{{positions.asOfDate}}` in any provider's cfg, resolved client-side
  before attach, sees the local snapshot only — so historical-date
  changes in one blotter don't reach a sibling blotter in another
  window.

For multi-window dashboards, "which window wrote last" is invisible;
every cross-window AppData reference is implicitly stale.

## Goal

One in-memory authoritative `AppDataStore` per origin, living in the
existing `SharedWorkerDataServicesHub`. Every window keeps a thin
synchronous-read **mirror** that re-hydrates via broadcasts.

The hooks (`useAppDataStore`, `useAppData(name)`) keep their current
shape — sync `get(name, key)` still returns a value, not a Promise.

## Non-goals (deferred to later steps)

- Worker-owned IndexedDB persistence. Persistence stays main-thread
  in Step 2 — this PR makes the in-memory state cross-window
  consistent without rearchitecting where bytes hit disk. See
  "Persistence — pragmatic choice" below.
- Bootstrap mode (`'eager' | 'lazy'`) — Step 3.
- CRDT semantics. Step 2 is last-writer-wins, same as today.
- Angular adapter. Mirror class is vanilla TS so the Angular adapter
  drops in trivially when Step 2 lands; no Angular work in this PR.

---

## Architecture

```
   Window A                                  Window B
   ┌──────────────────────┐                 ┌──────────────────────┐
   │ useAppData('positions')                 useAppData('positions')│
   │   ▲                  │                 │                  ▲   │
   │   │ sync get/set     │                 │   sync get/set   │   │
   │   ▼                  │                 │                  ▼   │
   │ ┌─────────────────┐  │                 │  ┌─────────────────┐ │
   │ │ AppDataMirror   │  │                 │  │ AppDataMirror   │ │
   │ │  (per-window)   │  │                 │  │  (per-window)   │ │
   │ └────┬──────────▲─┘  │                 │  └─▲──────────┬────┘ │
   └──────┼──────────┼────┘                 └────┼──────────┼──────┘
          │ set req. │ broadcast                 │ broadcast│ set req.
          │          │ (delta)                   │ (delta)  │
          ▼          │                           │          ▼
        ┌────────────┴───────────────────────────┴────────────┐
        │  SharedWorkerDataServicesHub                        │
        │  ────────────────────────────────────────────────   │
        │  AppData store (authoritative in-memory)            │
        │   • Map<name, Map<key, value>>                       │
        │   • per-mutation broadcast to every attached port    │
        │   • request/response: `appdata:set`, `appdata:read`  │
        │   • broadcast event: `appdata:delta`                 │
        └─────────────────────────┬────────────────────────────┘
                                  │ initial hydration only
                                  │ (on first attach per process)
                                  ▼
                     ┌──────────────────────────┐
                     │   AppDataConfigStore      │
                     │   (main-thread today —    │
                     │    unchanged in Step 2)   │
                     └──────────────────────────┘
```

The hub already owns a port-set with per-port subscription tracking;
AppData fan-out reuses that infrastructure.

---

## Surface changes

### New: `AppDataMirror` (vanilla TS, in `runtime/mainThread/`)

```ts
// packages/shared/services/data-services/src/runtime/mainThread/AppDataMirror.ts
export class AppDataMirror {
  // Wired up by SharedWorkerDataServicesClient.attachAppData()
  constructor(client: SharedWorkerDataServicesClient);

  /** Sync — returns undefined if no row or no key. */
  get(name: string, key: string): unknown;

  /** Sync read of all rows. */
  list(): readonly AppDataConfig[];

  /** Async — round-trips through worker, returns when delta applied locally. */
  set(name: string, key: string, value: unknown): Promise<void>;

  /** Replace one whole row. */
  upsert(config: AppDataConfig): Promise<AppDataConfig>;

  /** Subscribe to ANY change. Listener fires after the local mirror is updated. */
  subscribe(listener: () => void): () => void;

  /** Whether the initial snapshot from the worker has arrived. */
  ready(): Promise<void>;
}
```

The mirror is the only main-thread object a hook touches. It owns no
ConfigManager — all reads/writes flow through the worker.

### Renamed: `AppDataStore` → moves into the worker, lightly trimmed

The current `AppDataStore` class collapses into two pieces:

- **Worker-side:** `WorkerAppDataStore` in
  `runtime/sharedWorker/AppDataStore.ts` — the same logic but the
  *only* instance. Owns the `Map<name, Map<key, value>>`, broadcasts
  deltas, and lazy-hydrates from `AppDataConfigStore` on first request.
- **Main-thread mirror:** `AppDataMirror` (above) — sync reads, write
  proxy, broadcast subscriber.

The current public class name `AppDataStore` is repurposed: it's an
**alias for `AppDataMirror`** in the public API, since downstream code
already imports it as `AppDataStore`. Internal worker file is
`WorkerAppDataStore` so the search-and-replace stays disciplined.

### Hub additions: `runtime/sharedWorker/SharedWorkerDataServicesHub.ts`

Three new request kinds + one event kind in the protocol:

```ts
// runtime/protocol.ts
type AppDataAttachRequest = { kind: 'appdata-attach'; subId: string };
type AppDataDetachRequest = { kind: 'appdata-detach'; subId: string };
type AppDataSetRequest    = { kind: 'appdata-set'; reqId: string;
                              name: string; key: string; value: unknown };
type AppDataUpsertRequest = { kind: 'appdata-upsert'; reqId: string;
                              config: AppDataConfig };

type AppDataSnapshotEvent = { kind: 'appdata-snapshot'; subId: string;
                              rows: readonly AppDataConfig[] };
type AppDataDeltaEvent    = { kind: 'appdata-delta'; subId: string;
                              row: AppDataConfig };
type AppDataAckEvent      = { kind: 'appdata-ack'; reqId: string;
                              ok: true } | { kind: 'appdata-ack'; reqId: string;
                              ok: false; error: string };
```

The hub maintains one `WorkerAppDataStore` keyed by *origin*, not by
provider id (AppData isn't subscriber-scoped — it's app-wide).
Listeners are tracked per-port like the existing data subscription
fan-out.

### Persistence — pragmatic choice

The design doc calls for "worker is the single writer to IndexedDB"
to avoid drift. The minimal-viable path that ships Step 2 without
opening the IndexedDB-from-SharedWorker can of worms:

- **First-attaching window's main thread hydrates the worker.** When
  the first window calls `attachAppData()`, it ALSO attaches a
  `ConfigManager` reference to the hub via a side-channel (or via a
  one-shot `appdata-hydrate` request that posts the rows it already
  fetched). The hub stashes `rows` as the initial snapshot.
- **Worker is the single in-memory writer.** Every `set()` from any
  window goes through the hub; the hub mutates state and broadcasts.
- **Persistence stays on main thread, gated by the hub.** When the
  hub mutates a row, it picks one attached port (the originating
  port for that mutation) and asks it to persist via the existing
  `AppDataConfigStore`. The persist call rides the same request/ack
  flow as `set()` so the writer doesn't return until the row is
  durable. Drift is avoided because only one logical write happens
  per mutation.

This keeps the existing `ConfigManager` plumbing intact and avoids
reopening Dexie / wiring REST inside a SharedWorker. Worker-owned
persistence becomes a 30-line follow-up if and when Dexie's
SharedWorker behaviour proves stable enough — not Step 2's problem.

If this seems too clever: an alternative even simpler shape is "main
thread persists, worker is just a fan-out bus." Detailed in §
"Alternative" below.

### React adapter: `data-services-react/runtime/index.tsx`

Hook signatures stay identical. Internal change:

```ts
// before
const value = useMemo(() => ({
  client,
  appData: new AppDataStore(configManager, userId),    // direct main-thread store
  configStore: new DataProviderConfigStore(configManager),
}), [client, configManager, userId]);

// after
const value = useMemo(() => ({
  client,
  appData: client.attachAppData({ configManager, userId }),  // returns mirror
  configStore: new DataProviderConfigStore(configManager),
}), [client, configManager, userId]);
```

`useAppDataStore()` still returns `{ store, version, loaded }` — `store`
is now `AppDataMirror`, but the surface (`get`, `subscribe`, `list`,
`set`, `upsertConfig`) matches the old `AppDataStore` exactly.
`useAppData(name)` is a thin wrapper over `store.get / store.set` —
unchanged.

`captionPersistence.test.tsx` already mocks `useAppDataStore` —
keeps working.

### Angular adapter

Out of scope for Step 2 (parity is already on the post-merge backlog
for Step 3). The vanilla `AppDataMirror` is framework-agnostic so
when the Angular adapter lands it just wraps it in DI/Signal sugar.

---

## Implementation plan

### Files added (4)

| File | Purpose | LOC budget |
|---|---|---|
| `runtime/sharedWorker/AppDataStore.ts` | Authoritative in-memory store + broadcast logic | ~120 |
| `runtime/sharedWorker/AppDataStore.test.ts` | Unit tests (in-memory only, no port plumbing) | ~150 |
| `runtime/mainThread/AppDataMirror.ts` | Mirror with sync read + async write proxy | ~140 |
| `runtime/mainThread/AppDataMirror.test.ts` | Unit + cross-mirror convergence (two mirrors / one hub) | ~180 |

### Files changed (5)

| File | Change |
|---|---|
| `runtime/protocol.ts` | Add `appdata-attach/detach/set/upsert` requests + `appdata-snapshot/delta/ack` events; type guards |
| `runtime/sharedWorker/SharedWorkerDataServicesHub.ts` | Wire AppData request handlers + per-port broadcast |
| `runtime/sharedWorker/SharedWorkerDataServicesHub.test.ts` | Add AppData round-trip tests |
| `runtime/client/SharedWorkerDataServicesClient.ts` | Add `attachAppData(opts)` returning `AppDataMirror`, route AppData events to mirror |
| `runtime/providers/appdata/AppDataStore.ts` | DELETE — replaced by worker-side store + mirror |

### Files deleted (1)

`runtime/providers/appdata/AppDataStore.ts` (the current main-thread
class; its functionality moves into the worker store + mirror).
`AppDataConfigStore` in the same folder stays — still used as the
persistence helper.

### Sequencing

1. **Protocol additions** + type guards (zero runtime impact, just
   wires the types).
2. **Worker-side `AppDataStore`** + tests (no port plumbing yet —
   pure in-memory state).
3. **Hub wiring** + tests — adds the request handlers + broadcast.
4. **Main-thread `AppDataMirror`** + tests — uses
   `createInPageWiring` with an in-process hub for the convergence
   test.
5. **Client `attachAppData()`** + remove the old `AppDataStore`.
6. **React adapter switch** — one `useMemo` body change.
7. **Update `apps/markets-ui-react-reference`** if needed (likely a
   no-op — `<DataServicesProvider>` already takes the same props).

Each step is a working green commit.

---

## Open question — "Alternative" simpler shape

The §Persistence approach is "worker holds in-memory state, main
thread does the actual ConfigManager write under the worker's
direction." That's correct but has one subtle wrinkle: the chosen-
writer port might disconnect mid-write. Recovery is doable (retry on
another port; hub buffers the request) but adds code.

A genuinely simpler shape:

> **Worker is a fan-out bus only.** Each window's main thread keeps
> its own `AppDataStore` (current behaviour) AND posts every
> mutation to the hub. The hub broadcasts to all *other* ports, which
> apply the delta to their own stores. Persistence happens on the
> originating window's main thread, exactly as today. No "elected
> writer" gymnastics.

Trade-off: every window does its own ConfigManager read on bootstrap
(N reads on cold start instead of 1). Acceptable for a workspace of
1–10 windows.

Recommendation: **start with the simpler "fan-out bus" shape.** It
ships Step 2 (cross-window convergence) with the smallest surface
change and the lowest blast radius. Migrate to "worker holds
authoritative in-memory state" in Step 2.5 if the broadcast pattern
proves insufficient (e.g. when AppData rows grow past a few hundred
keys and the per-port reads matter).

---

## Test plan

- **Unit (worker-side store):** in-memory mutations, listener fan-out,
  hydrate-from-snapshot, last-writer-wins on the same key.
- **Unit (mirror):** sync `get` after `subscribe` fires, `set` round-
  trip resolves only after the local delta applies, `subscribe`
  returns an unsubscribe.
- **Integration (two mirrors, one in-process hub):** set on mirror A
  → mirror B sees the value within one microtask, after subscribe
  fires once.
- **Existing `AppDataStore.test.ts`:** ports to mirror tests (same
  scenarios — set, list, upsert, remove, lazy load).
- **E2E (deferred):** cross-window AppData convergence test
  (`hosted-markets-grid` + DataProviders popout). Tracked separately;
  current e2e suite has known dropdown rot blocking new specs.

## Risks / mitigations

| Risk | Mitigation |
|---|---|
| Mirror's first frame has empty AppData → `{{name.key}}` resolves to undefined → cfg attaches with stale template | Same as today (lazy hydration). Step 3's `mode: 'eager'` solves this when the consumer wants suspend-until-ready behaviour. |
| Two windows write the same key in the same tick | Last-writer-wins by hub arrival order. Deterministic at the hub even if main threads race. |
| Worker restart loses in-memory state | Hub re-hydrates from the next-attaching window's `AppDataConfigStore.list()` snapshot (same path as cold start). |
| `AppDataConfigStore` is currently consumed by editor save paths directly (not via the hook) | Out of scope — those callers keep their direct ConfigManager access for now. The mirror picks up changes when they next refresh / on the next attach. (Step 4 addresses unifying writes.) |

## Out-of-scope cleanup that *would* tempt scope creep

- Auditing the editor's direct `AppDataConfigStore` writes to route
  through the mirror — that's a Step 4 concern when we generalize
  REST + AppData persistence.
- Rewriting the e2e suite to add cross-window AppData specs — needs
  the dropdown root cause from `docs/E2E_STATUS.md` resolved first.
- Angular adapter — no consumer needs it today; Step 3 is the
  natural moment.

## Done when

- All four new files merged, two files deleted, five files updated.
- `npx turbo typecheck build test` green (data-services unit count
  rises from 78 to ~95 with the new tests; data-services-react stays
  at 3).
- React adapter signature unchanged — `useAppDataStore` /
  `useAppData(name)` consumers in `widgets-react` and the reference
  app touch zero lines.
- Two-window manual smoke: open `/blotters/marketsgrid` and
  `/dataproviders` in the same browser; edit `positions.asOfDate` in
  the second; observe the first re-attach within ~1 frame without a
  reload.
