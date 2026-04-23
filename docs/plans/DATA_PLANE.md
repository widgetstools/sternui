# Plan: `@marketsui/data-plane` — SharedWorker data provider runtime

> **Status:** draft · **Owner:** platform · **Est:** 3 weeks (Phase 1 of the unblocked roadmap) · **Blocked by:** none · **Unblocks:** MarketsGrid HOC refactor, cross-component cache story, AppDataProvider template binding

## 1. Why

Today every widget owns its own data connection. Six blotters on one page = six STOMP sockets, six duplicate fetches, six copies of the same row in memory. Configuration lives in the widget. When a user opens a popout or spawns a second instance, the second one re-fetches everything. There is no primitive for cross-component shared state.

The data-plane package is the fix: **one SharedWorker per origin; one upstream connection per provider; N components multiplex over it**.

Secondary wins it pays for:

- Tabs on the same origin share the cache for free (SharedWorker is cross-tab)
- `AppDataProvider` becomes the backbone for template bindings (`{{app1.token1}}`)
- Cross-app data sharing collapses to "worker talks to OpenFin IAB; components talk to worker"
- Reconnect/backoff lives in one place
- The HOC refactor of `<MarketsGrid>` has somewhere to compose with

## 2. Where it lives

New package:

```
packages/data-plane/
├── package.json                   @marketsui/data-plane
├── src/
│   ├── index.ts                   public API (client SDK only; worker is internal)
│   ├── protocol.ts                wire-protocol types (shared with worker)
│   ├── client/
│   │   ├── DataPlaneClient.ts     wraps MessagePort, reqId bookkeeping, reconnect
│   │   ├── connect.ts             SharedWorker bootstrap, port handshake
│   │   └── fallbacks.ts           degrade to in-page Worker or main-thread for non-SharedWorker envs
│   ├── worker/
│   │   ├── entry.ts               SharedWorker entry point; exported as Vite worker asset
│   │   ├── router.ts              dispatches DataPlaneRequest → provider
│   │   ├── cache.ts               ProviderCache, CacheEntry, LRU + TTL sweep
│   │   ├── dedup.ts               in-flight promise merging
│   │   └── iab-bridge.ts          cross-app router via OpenFin IAB (optional at construction)
│   └── providers/
│       ├── ProviderBase.ts        abstract contract every provider implements
│       ├── AppDataProvider.ts     in-memory k/v, reactive for template bindings
│       ├── StompProvider.ts       moved + rewrapped from widgets-react/provider-editor/stomp
│       ├── WebSocketProvider.ts   moved + rewrapped
│       ├── RestProvider.ts        polling REST
│       └── MockProvider.ts        moved, used by tests + demo
├── test/                          Vitest
│   ├── cache.test.ts              LRU + TTL + dedup coverage
│   ├── protocol.test.ts           round-trip message shapes
│   └── appdata.test.ts            reactivity contract
└── tsconfig.json / vitest.config.ts
```

**Framework-agnostic.** Zero React / Angular imports. The client SDK is DOM-only; framework hooks live in `@marketsui/react` and `@marketsui/angular` and wrap `DataPlaneClient`.

## 3. Dependencies

- `@marketsui/shared-types` — already has `ProviderType`, `WebSocketProviderConfig`, `SocketIOProviderConfig`, `MockProviderConfig`, etc. Extend with `AppDataProviderConfig` and the wire-protocol types.
- No runtime deps beyond the stomp client (move from widgets-react).
- `peerDependencies`: none. It's plain TS + browser APIs.

## 4. Cache model

```typescript
// src/worker/cache.ts

export interface CacheEntry<T = unknown> {
  /** Latest value, `undefined` while fetching for the first time. */
  data: T | undefined;
  /** Epoch ms of the last successful write (0 if never). */
  fetchedAt: number;
  /** null = no expiry; number = ms from fetchedAt. */
  ttlMs: number | null;
  /** De-dupes concurrent misses — see §6. */
  inFlight?: Promise<T>;
  /** Ports currently listening for pushed updates. */
  subscribers: Set<MessagePort>;
  /** Monotonic sequence number for subscriber updates. */
  seq: number;
  /** Last transport error (kept for observability; not treated as data). */
  lastError?: { code: string; message: string; at: number };
}

export interface ProviderCache {
  entries: Map<string, CacheEntry>;
  lru: LRUCursor;
  maxEntries: number;
  defaultTtlMs: number | null;
  config: ProviderConfig;
}

export type CacheState = Map</* providerId */ string, ProviderCache>;
```

**Keyspace invariants:**

- Worker's internal key = `providerId::key` always. Two providers cannot collide.
- `providerId` is assigned at `configure` time by the client, stable for the lifetime of the worker.
- `key` shape is provider-specific (STOMP: topic; REST: URL path; AppData: user-chosen string).

**TTL + eviction:**

- Default `ttlMs = null` (no expiry). Push-driven providers (STOMP, WebSocket) set `null` and rely on subscription updates.
- Polling providers (REST) set `ttlMs: 30_000` or similar at configure time.
- `maxEntries` default 1000 per provider. Idle sweep every 30s evicts expired + LRU-trims.
- **No global cap.** Each provider is sovereign. A misbehaving provider cannot evict another's data.

## 5. Wire protocol

```typescript
// src/protocol.ts

export type DataPlaneRequest =
  | { op: 'configure';   reqId: string; providerId: string; config: ProviderConfig }
  | { op: 'get';         reqId: string; providerId: string; key: string }
  | { op: 'put';         reqId: string; providerId: string; key: string; value: unknown }
  | { op: 'subscribe';   reqId: string; providerId: string; key: string }
  | { op: 'unsubscribe'; subId: string }
  | { op: 'invalidate';  reqId: string; providerId: string; key?: string /* omit = whole provider */ }
  | { op: 'teardown';    reqId: string; providerId: string }
  | { op: 'ping';        reqId: string };

export type DataPlaneResponse =
  | { op: 'ok';     reqId: string; value?: unknown; cached: boolean; fetchedAt: number }
  | { op: 'update'; subId: string; providerId: string; key: string; value: unknown; seq: number }
  | { op: 'sub-established'; reqId: string; subId: string }
  | { op: 'err';    reqId: string; error: { code: ErrorCode; message: string; retryable: boolean } }
  | { op: 'pong';   reqId: string };

export type ErrorCode =
  | 'PROVIDER_UNKNOWN'
  | 'PROVIDER_NOT_CONFIGURED'
  | 'FETCH_FAILED'
  | 'TRANSPORT_CLOSED'
  | 'VALIDATION_FAILED'
  | 'RATE_LIMITED'
  | 'INTERNAL';
```

**Invariants:**

- Every response keyed by `reqId` or `subId`. No correlation via topic naming.
- `update` carries monotonic `seq` per `(providerId, key)`. Clients compare against their last-seen `seq` — if they see a gap, they know the worker restarted and should `subscribe` again.
- Binary payloads are cloned structurally (structured clone); OpenFin BAB caveat — if the widget runs in a process boundary, structured clone is bypassed and messages go through JSON. Providers MUST assume JSON-safe shapes.

## 6. Thundering herd

Single in-flight promise per `(providerId, key)`. Tested contract:

```typescript
// src/worker/router.ts (core logic)

async function handleGet(req: Extract<DataPlaneRequest, { op: 'get' }>, port: MessagePort) {
  const pc = cache.get(req.providerId);
  if (!pc) return err(port, req.reqId, 'PROVIDER_NOT_CONFIGURED', false);

  const entry = pc.entries.get(req.key);

  if (entry?.data !== undefined && !expired(entry)) {
    return ok(port, req.reqId, entry.data, true, entry.fetchedAt);
  }

  // In-flight merge — every concurrent caller gets the same promise.
  if (entry?.inFlight) {
    const value = await entry.inFlight;
    return ok(port, req.reqId, value, false, entry.fetchedAt);
  }

  const provider = providers.get(req.providerId)!;
  const fetchPromise = provider.fetch(req.key);

  const newEntry: CacheEntry = entry ?? {
    data: undefined, fetchedAt: 0, ttlMs: pc.defaultTtlMs,
    inFlight: fetchPromise, subscribers: new Set(), seq: 0,
  };
  newEntry.inFlight = fetchPromise;
  pc.entries.set(req.key, newEntry);
  pc.lru.touch(req.key);

  try {
    const value = await fetchPromise;
    newEntry.data = value;
    newEntry.fetchedAt = Date.now();
    newEntry.inFlight = undefined;
    broadcast(newEntry, value);
    return ok(port, req.reqId, value, false, newEntry.fetchedAt);
  } catch (e) {
    newEntry.inFlight = undefined;
    newEntry.lastError = { code: 'FETCH_FAILED', message: String(e), at: Date.now() };
    return err(port, req.reqId, 'FETCH_FAILED', /* retryable */ true);
  }
}
```

**Broadcast contract:** when `fetchPromise` resolves, EVERY subscriber of `(providerId, key)` receives an `update` message, not just the caller that triggered the fetch. This is what makes the "N components multiplex over one socket" property actually hold.

## 7. Provider base class

```typescript
// src/providers/ProviderBase.ts

export abstract class ProviderBase<TConfig = unknown, TValue = unknown> {
  abstract readonly type: ProviderType;
  abstract readonly id: string;
  abstract configure(config: TConfig): Promise<void>;
  abstract fetch(key: string): Promise<TValue>;
  /** Optional: providers that push (STOMP, WS) override and emit via `emit`. */
  subscribe?(key: string, emit: (value: TValue) => void): Unsubscribe;
  abstract teardown(): Promise<void>;
}

export type Unsubscribe = () => void;
```

Providers that push (STOMP, WebSocket, SocketIO) override `subscribe` — the worker's router wires the `emit` callback into `broadcast(entry, value)` so every subscriber port gets the update.

Providers that only pull (REST polling, Mock) omit `subscribe` — the router falls back to TTL-driven re-fetch.

## 8. AppDataProvider — reactive k/v

The backbone for template bindings. Components `put` key/value pairs; other components `subscribe` and re-render.

```typescript
// src/providers/AppDataProvider.ts

export class AppDataProvider extends ProviderBase<AppDataProviderConfig, unknown> {
  readonly type = 'appdata' as const;
  readonly id: string;
  private state = new Map<string, unknown>();
  private subs = new Map<string, Set<(v: unknown) => void>>();

  constructor(id: string) { super(); this.id = id; }

  async configure(_: AppDataProviderConfig) { /* no-op */ }

  async fetch(key: string) { return this.state.get(key); }

  async put(key: string, value: unknown) {
    this.state.set(key, value);
    this.subs.get(key)?.forEach(cb => cb(value));
  }

  subscribe(key: string, emit: (v: unknown) => void): Unsubscribe {
    if (!this.subs.has(key)) this.subs.set(key, new Set());
    this.subs.get(key)!.add(emit);
    return () => this.subs.get(key)!.delete(emit);
  }

  async teardown() { this.state.clear(); this.subs.clear(); }
}
```

Template binding compilation (done in the React/Angular adapters, not here): `{{app1.token1}}` compiles to `useDataPlaneValue('app1', 'token1')` / `signal()` bound to `dataPlane.subscribe('app1', 'token1', …)`.

## 9. Client SDK

Framework-agnostic. Lives in the same package.

```typescript
// src/client/DataPlaneClient.ts

export class DataPlaneClient {
  private port: MessagePort;
  private pending = new Map<string, { resolve: (r: unknown) => void; reject: (e: Error) => void }>();
  private subs   = new Map<string, (value: unknown) => void>();

  constructor(port: MessagePort) {
    this.port = port;
    this.port.onmessage = (ev) => this.route(ev.data as DataPlaneResponse);
    this.port.start();
  }

  async configure(providerId: string, config: ProviderConfig): Promise<void> { ... }
  async get<T>(providerId: string, key: string): Promise<T> { ... }
  async put(providerId: string, key: string, value: unknown): Promise<void> { ... }

  subscribe<T>(providerId: string, key: string, cb: (v: T) => void): Unsubscribe {
    const reqId = uid(); const subId = uid();
    this.subs.set(subId, cb as (v: unknown) => void);
    this.port.postMessage({ op: 'subscribe', reqId, providerId, key } satisfies DataPlaneRequest);
    return () => { this.port.postMessage({ op: 'unsubscribe', subId }); this.subs.delete(subId); };
  }

  invalidate(providerId: string, key?: string): Promise<void> { ... }
  teardown(providerId: string): Promise<void> { ... }
}

export function connect(workerURL: string | URL): DataPlaneClient {
  const worker = new SharedWorker(workerURL, { type: 'module', name: 'marketsui-data-plane' });
  return new DataPlaneClient(worker.port);
}
```

**Fallback:** `fallbacks.ts` detects environments without SharedWorker (old Safari, some OpenFin view contexts depending on version) and falls back to a dedicated `Worker` per tab. The API surface is identical; the caller never knows.

## 10. React + Angular bindings (in their respective packages, not here)

Reference implementation:

```typescript
// @marketsui/react  — uses useSyncExternalStore
export function useDataPlaneValue<T>(providerId: string, key: string): T | undefined {
  const client = useContext(DataPlaneContext);
  return useSyncExternalStore(
    (cb) => client.subscribe<T>(providerId, key, cb),
    () => client.getCached<T>(providerId, key),   // synchronous read of last-known value
  );
}

export function useDataPlaneQuery<T>(providerId: string, key: string) {
  /* async get + state machine (idle / loading / ready / error) */
}
```

```typescript
// @marketsui/angular — uses signals + effect
@Injectable({ providedIn: 'root' })
export class DataPlaneService {
  private cache = new Map<string, WritableSignal<unknown>>();

  value<T>(providerId: string, key: string): Signal<T | undefined> {
    const id = `${providerId}::${key}`;
    if (!this.cache.has(id)) {
      const s = signal<unknown>(undefined);
      this.client.subscribe(providerId, key, (v) => s.set(v));
      this.cache.set(id, s);
    }
    return this.cache.get(id)! as Signal<T | undefined>;
  }
}
```

Both wrap the same `DataPlaneClient`. The difference is purely idiomatic — hooks vs services — and the cache/worker/protocol below is identical.

## 11. Cross-app (IAB bridge)

Same-origin only for SharedWorker. Cross-app data sharing routes through OpenFin IAB, published **by the worker** (never by component code).

```typescript
// src/worker/iab-bridge.ts

export function installIabBridge(router: Router, iab: IabAdapter) {
  // Incoming: components request a key from provider "app2::positions" (foreign app).
  router.on('get', async (req) => {
    if (!isForeignApp(req.providerId)) return; // handled locally
    const resp = await iab.request(req.providerId, req.key);
    router.emit(resp); // routes back through normal broadcast path
  });

  // Outgoing: our local providers publish to IAB for foreign consumers.
  router.onLocalUpdate((providerId, key, value) => {
    if (!isPublishedProvider(providerId)) return;
    iab.publish(`${providerId}.${key}`, value);
  });
}
```

The worker is the **only** IAB participant in the stack. Components always talk to the worker. This keeps the "N components subscribe to one upstream" invariant true regardless of where the data physically lives.

## 12. Reconnection + backpressure

- Worker restart: ports signal disconnect; client re-opens with a new handshake. Subscriptions are not auto-restored — client replays `subscribe` calls from its local bookkeeping. Monotonic `seq` going back to 0 is the signal.
- STOMP disconnect: provider's own exponential backoff (1s → 2s → 4s → 8s → max 30s). Worker emits `err` with `retryable: true` to subscribers; they can show "reconnecting…" UI.
- Backpressure: no buffering in the worker. If a subscriber's `postMessage` fails (port closed), the worker removes the port and moves on. Slow consumers do not block fast ones.

## 13. Migration from `widgets-react/provider-editor/stomp`

Current state: `packages/widgets-react/src/provider-editor/stomp/StompDatasourceProvider.ts` is the concrete STOMP impl; `dataProviderConfigService.ts` has the config persistence. Both are used by `BlotterProvider.tsx`.

Migration steps:

1. Create `packages/data-plane/` with skeleton (protocol, cache, client).
2. Move `StompDatasourceProvider.ts` → `packages/data-plane/src/providers/StompProvider.ts`; wrap it in `ProviderBase` shape.
3. `dataProviderConfigService` moves to `packages/component-host/` (it's really app-level config, not provider-level).
4. `BlotterProvider.tsx` refactors to consume `useDataPlaneValue(providerId, blotterKey)` from `@marketsui/react` instead of owning its own STOMP instance.
5. Remove the commented-out circular-dep import in `openfin-platform-stern/src/bootstrap.ts` — it'll resolve once `dataProviderConfigService` lives in the right package.

Each step is its own PR. Step 5 closes the circular-dep TODO carried over from Day 5 of consolidation.

## 14. Testing

- **Cache unit tests** (`test/cache.test.ts`): TTL expiry, LRU eviction, in-flight de-dup (two concurrent `get` calls fire one `fetch`), subscriber broadcast.
- **Protocol round-trip** (`test/protocol.test.ts`): every `DataPlaneRequest` shape serializes + deserializes without drift; reqId correlation; subId survival across unsubscribe.
- **AppData reactivity** (`test/appdata.test.ts`): put → subscribe → receive; unsubscribe → put → no receive.
- **E2E** (under `e2e/`): one demo-react page with 4 widgets subscribing to the same STOMP topic; assert 1 outbound WebSocket connection in DevTools; assert all 4 widgets render the same value.

Target coverage: 90%+ on `cache.ts`, `router.ts`, `dedup.ts`. The public client SDK needs fewer tests since it's a thin port wrapper; integration tests in consumer packages cover it.

## 15. Sequencing (3-week plan)

**Week 1 — skeleton + cache**
- Package scaffold + tsconfig + Vitest wiring
- `protocol.ts` types complete + round-trip tests
- `cache.ts` with TTL + LRU + dedup + 100% test coverage
- `ProviderBase` + `MockProvider` (passes cache tests)

**Week 2 — worker + client**
- `worker/entry.ts` + `worker/router.ts` — SharedWorker boots, handles `configure` / `get` / `subscribe` / `unsubscribe`
- `client/DataPlaneClient.ts` + `connect.ts` — wraps port, reqId bookkeeping
- `AppDataProvider` — reactive k/v with tests
- `apps/demo-react` integration: one widget reads+writes from AppData, confirms cross-tab sync

**Week 3 — STOMP migration + cross-app**
- Move `StompDatasourceProvider` → `StompProvider` inside new package
- `BlotterProvider.tsx` refactored to use `useDataPlaneValue`
- Close openfin-platform-stern ↔ widgets-react circular dep (Day 5 TODO)
- `iab-bridge.ts` — cross-app routing skeleton (full cross-app story deferred to Phase 5)
- E2E: 4 widgets on one STOMP topic = 1 socket

## 16. Open questions

1. **OpenFin view boundaries + SharedWorker:** Do OpenFin views in separate processes actually see the same SharedWorker? Worth a smoke test on day 1 of Week 1. If NO, the fallback `fallbacks.ts` becomes the main path, and we use IAB for cross-view sharing even same-app.
2. **Structured clone vs JSON for payloads:** Enforce JSON-only for safety? Or rely on SharedWorker's native structured-clone and document the pitfalls?
3. **Schema versioning for provider configs:** `ProviderConfig` shapes will evolve. Add `schemaVersion` field now, write a migrator in `ProviderBase.configure`? Or defer until v2?
4. **Authentication:** STOMP connections need JWTs. Where do tokens live — `customData`, ConfigService, or a dedicated auth service? Cross-cuts with `SHELL_AND_REGISTRY.md` §external-components.

## 17. Non-goals

- **Not a general-purpose state manager.** No Redux-style actions, no time-travel debug. It's a cache + pub/sub over a worker.
- **Not a storage layer.** AppData is volatile; persistence goes through `@marketsui/config-service`.
- **Not cross-origin.** Same-origin is an invariant. Cross-app uses IAB through the worker.
- **No query language / filtering in the worker.** The worker ships values unmodified. Widgets do their own derivation.
