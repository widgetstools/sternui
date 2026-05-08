# Step 3 — `bootstrapDataServices()` + `<DataServicesProvider mode>` sugar

**Date:** 2026-05-08
**Status:** Plan / awaiting approval. No code changes yet.
**Predecessor:** Step 2 (AppData → SharedWorker mirror) — branch `feature/data-services-step2`, PR #27.
**Reference design:** [`data-services-redesign.md` §5](./data-services-redesign.md)

---

## Problem statement

Today the reference app's "wire up data services" code is spread across
**four** files:

```
apps/markets-ui-react-reference/src/dataServices.sharedWorker.ts   # worker entry (~45 LOC)
apps/markets-ui-react-reference/src/dataServices.mainThread.ts     # SharedWorker + client (~46 LOC)
apps/markets-ui-react-reference/src/views/BlottersMarketsGrid.tsx  # passes client into HostedMarketsGrid
apps/markets-ui-react-reference/src/views/DataProviders.tsx        # awaits ConfigManager, mounts Provider
```

The `dataServices.mainThread.ts` boilerplate (construct SharedWorker,
wrap it with `SharedWorkerDataServicesClient`, export the client) gets
copy-pasted into every consumer app — one of the mostly-mechanical bits
that exists because the `new SharedWorker(new URL(...))` literal must
stay co-located with its target file (Vite worker-plugin static
analysis). The wrapping around it does not need to live there.

Every consumer also rebuilds the same `<DataServicesProvider>` plumbing:
`useEffect` to await ConfigManager, conditionally render the provider,
duplicate `userId` resolution. That's the prep work Step 3 absorbs.

Step 3 also lands the **`mode: 'eager' | 'lazy'`** option from
[design doc §5](./data-services-redesign.md). Today the mirror loads
asynchronously and views render with empty AppData on first paint;
templates like `{{positions.asOfDate}}` resolve to `undefined` and the
provider attaches with a stale cfg. For dashboards keyed off AppData,
`mode: 'eager'` suspends first paint until the mirror's first snapshot
applies.

## Goal

Two new public surfaces, one in core and one in React:

1. **`bootstrapDataServices(opts)`** in `@starui/data-services` — vanilla
   TS factory that wraps a SharedWorker with the
   `SharedWorkerDataServicesClient` + a single shared `AppDataMirror`.
   Idempotent: keyed by `appName`, second call returns the existing
   bootstrap result.

2. **`<DataServicesProvider mode="eager"|"lazy">`** in
   `@starui/data-services-react` — the existing Provider learns a
   `mode` prop. `lazy` (default) keeps current behaviour; `eager`
   suspends until `mirror.ready()` resolves so first paint sees real
   AppData values.

Migration: `apps/markets-ui-react-reference/src/dataServices.mainThread.ts`
collapses to a SharedWorker construction + a `bootstrapDataServices`
call. Consumer wiring drops from ~46 LOC to ≤10 LOC of meaningful code.

## Non-goals (deferred)

- **Angular adapter (`provideDataServices()`).** Plumbing is identical
  but DI sugar is its own work — Step 3 keeps it out so the React
  surface lands cleanly first. The vanilla `bootstrapDataServices()`
  is what Angular will wrap, so Angular is unblocked the moment Step 3
  merges.
- **Worker-owned IndexedDB persistence.** Same call as Step 2: defer
  until the broadcast pattern proves insufficient.
- **`transport: 'main'` for one-shot probes.** Step 5 in the design
  doc; the Angular probe migration rides on it.
- **OpenFin dock startup migration.** The dock is the natural eager-
  mode caller, but the dock's startup sequence isn't in this repo
  (yet). Step 3 ships the API; the dock migrates when the dock lands.

---

## Architecture

```
   ┌───────────────────────────── Consumer app ─────────────────────────────┐
   │                                                                        │
   │  // dataServices.mainThread.ts (≤10 lines of meaningful code)          │
   │  const worker = new SharedWorker(                                       │
   │    new URL('./dataServices.sharedWorker.ts', import.meta.url),         │
   │    { type: 'module', name: 'mkt-data-services:TestApp' },              │
   │  );                                                                     │
   │  export const dataServices = bootstrapDataServices({                    │
   │    appName: 'TestApp',                                                  │
   │    worker,                                                              │
   │    configManager,                                                       │
   │    userId: LOGGED_IN_USER_ID,                                           │
   │  });                                                                    │
   │                                                                        │
   │  // anywhere in the React tree:                                         │
   │  <DataServicesProvider services={dataServices} mode="lazy">             │
   │    <App />                                                              │
   │  </DataServicesProvider>                                                │
   └────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ (single shared client + mirror)
                                    ▼
                ┌───────────────────────────────────┐
                │  bootstrapDataServices() registry │
                │  Map<appName, BootstrapResult>    │  ← idempotent
                │   • client (SharedWorkerData…)    │
                │   • appData (AppDataMirror)       │
                │   • configManager (ref)           │
                │   • userId                        │
                │   • ready: Promise<void>          │
                └───────────────┬───────────────────┘
                                │
                  ┌─────────────┴─────────────┐
                  ▼                           ▼
         ┌─────────────────┐         ┌─────────────────┐
         │ Lazy Provider   │         │ Eager Provider  │
         │ • renders now   │         │ • throws ready  │
         │ • mirror loads  │         │   promise to    │
         │   in background │         │   <Suspense>    │
         │ • useAppData…   │         │ • renders only  │
         │   .loaded flips │         │   once mirror   │
         │   to true later │         │   has snapshot  │
         └─────────────────┘         └─────────────────┘
```

The bootstrap is the single owner of `client` and `appData` for an
appName. The Provider becomes a thin context-pump — it does not
construct anything, just carries the bootstrap result down the tree.

---

## Open questions to resolve before coding

These three shape the surface; flagging them up front so we agree on
the direction.

### Q1 — Who constructs the `SharedWorker`?

Vite's worker plugin requires the literal expression
`new SharedWorker(new URL('./file.ts', import.meta.url), {...})` at
the call site so it can emit a separate worker chunk and rewrite the
URL. If `bootstrapDataServices()` constructed the worker itself with a
hardcoded URL, the static analysis would fail and the worker script
would be served as a plain asset (404 / fail-to-boot). This is
explicitly called out in `dataServices.mainThread.ts:5-15`.

Two viable shapes:

| Shape | Bootstrap signature | Caller boilerplate |
|---|---|---|
| **(A) caller passes the worker** *(recommended)* | `bootstrapDataServices({ appName, worker, configManager, userId })` | 4 lines: construct `worker`, call bootstrap |
| **(B) caller passes a factory** | `bootstrapDataServices({ appName, createWorker, configManager, userId })` where `createWorker: () => SharedWorker` | Same 4 lines, just one extra arrow function |

**Recommendation: (A).** Idempotency happens inside the bootstrap;
since the worker construction side-effect happens once at module top
level anyway, there's no benefit to deferring it. Consumer code stays
linear.

### Q2 — Does bootstrap own the `seed`?

The design doc lists `seed` as a bootstrap parameter ("hydrate AppData
from seed"). Step 2's mirror already seeds the worker on first attach
via `AppDataConfigStore.list(userId)`. The two paths overlap: a
bootstrap-time `seed` would be a *synchronous shortcut* for callers
who already have the rows (e.g., the OpenFin dock pulled them on
startup), letting them skip the ConfigManager round-trip.

Three options:

- **(A) Drop `seed` from Step 3.** Mirror's existing
  ConfigManager-backed seed is sufficient for the React reference app.
  Add `seed` later when the OpenFin dock needs it.
- **(B) Add `seed?: AppDataConfig[]`.** Threaded through to
  `mirror.attach({ seed })` so the mirror posts those rows instead of
  reading from ConfigManager.
- **(C) Add `seed?: () => Promise<AppDataConfig[]>`.** Async factory;
  same effect, just lazy.

**Recommendation: (A).** Per the project's "simple, nimble designs"
preference — drop until a real consumer needs it. The seed plumbing
is small (one optional param threaded through `attach()`) and adding
it later is a trivial PR.

### Q3 — How does `mode: 'eager'` suspend?

`lazy` (default) is what we have today: the Provider renders
immediately, child components see `useAppDataStore().loaded === false`
on first paint, and hooks like `useResolvedCfg` already cope (return
cfg as-is until `loaded`).

`eager` needs to block first paint of the Provider's children until
`mirror.ready()` resolves. Two implementations:

| Implementation | Pros | Cons |
|---|---|---|
| **(A) `<Suspense>` inside Provider** *(recommended)* — Provider's children only render once mirror.ready() resolves; relies on React 19's `use(promise)` (we're already on React 19 per `docs/DEPS_STANDARD.md`) | Idiomatic React. Consumer wraps `<DataServicesProvider mode="eager">` in their own `<Suspense fallback>` boundary if they want a custom loading UI; otherwise the inner Provider renders nothing until ready. | Requires React 19 `use()` (already present). |
| **(B) Conditional render** — Provider tracks `loaded` state; renders `null` (or a `fallback` prop) while pending, children once ready | No Suspense dependency. | Two render paths inside Provider. Doesn't compose with parent `<Suspense>` boundaries. |

**Recommendation: (A).** Cleaner integration with the rest of React,
no new internal state machine inside Provider. The `eager` mode in
practice just calls `use(services.ready)` at the top of the Provider
body — the function returns once the mirror has its first snapshot.

---

## Surface changes

### New: `bootstrapDataServices()` in `@starui/data-services`

```ts
// packages/shared/services/data-services/src/runtime/bootstrap/bootstrap.ts

import type { ConfigManager } from '@starui/config-service';
import {
  SharedWorkerDataServicesClient,
} from '../client/SharedWorkerDataServicesClient.js';
import type { AppDataMirror } from '../mirror/AppDataMirror.js';

export interface BootstrapDataServicesOpts {
  /**
   * Identifier for this app's data-services scope. Used as the
   * idempotency key — calls with the same `appName` return the
   * existing bootstrap result.
   *
   * NOT the SharedWorker name (caller picks that when constructing
   * the worker). This is bootstrap-side bookkeeping only.
   */
  appName: string;

  /**
   * Pre-constructed SharedWorker. Caller must construct via
   *   `new SharedWorker(new URL('./file.sharedWorker.ts', import.meta.url),
   *                     { type: 'module', name: '...' })`
   * (Vite worker plugin requires the literal at the call site.)
   *
   * On a second call with the same appName, this argument is ignored
   * and the existing client is returned.
   */
  worker: SharedWorker;

  /**
   * ConfigManager backing AppData persistence. AppData rows persist
   * via this; the worker is the in-memory authoritative store.
   */
  configManager: ConfigManager;

  /**
   * Logged-in user id. Owns AppData rows created by this client.
   * (Same `LOGGED_IN_USER_ID` constant used by the rest of the app.)
   */
  userId: string;
}

export interface DataServices {
  /** SharedWorker MessagePort wrapper for live data. */
  client: SharedWorkerDataServicesClient;
  /** Per-app shared AppDataMirror. Sync reads, async writes. */
  appData: AppDataMirror;
  /** Resolves once `appData.ready()` resolves. Stable identity. */
  ready: Promise<void>;
  /**
   * Tear down. Detaches the mirror and closes the client port.
   * Idempotent — calling twice is a no-op. Removes the appName
   * entry so a subsequent `bootstrapDataServices` re-bootstraps.
   */
  dispose(): void;
}

export function bootstrapDataServices(opts: BootstrapDataServicesOpts): DataServices;
```

Internals:

- Module-scope `Map<string, DataServices>` keyed by `appName`. Second
  call with same appName returns the same `DataServices` object.
  (Different `worker` argument? Ignored — we trust the caller, since
  the failure mode is "they passed the wrong worker for this app,"
  which is a programmer bug we can't recover from anyway.)
- On first call:
  1. Construct `SharedWorkerDataServicesClient(worker.port)`.
  2. Construct `AppDataMirror` via `client.attachAppData({configManager, userId})`.
  3. Kick off `mirror.attach()` (returns Promise; bootstrap doesn't await).
  4. Compose `ready = mirror.ready()`.
  5. Stash `{client, appData, ready, dispose}` in the registry.
- `dispose()` calls `client.detachAppData(appData)` then `client.close()`,
  then deletes from registry.

### Modified: `<DataServicesProvider>` in `@starui/data-services-react`

Two prop shapes — old (back-compat) and new (post-Step-3 idiomatic):

```tsx
// New (post-Step-3): pass the bootstrap result + optional mode
<DataServicesProvider services={dataServices} mode="lazy" />
<DataServicesProvider services={dataServices} mode="eager" />

// Old (Step 2): construct client + appData inside the Provider
<DataServicesProvider client={client} configManager={cm} userId={u} />
```

The Provider distinguishes via discriminated prop union:

```ts
type DataServicesProviderProps =
  | {
      services: DataServices;
      mode?: 'eager' | 'lazy';
      children: ReactNode;
    }
  | {
      // Legacy shape — kept so existing call sites (DataProviders.tsx,
      // HostedMarketsGrid) compile until they migrate. All three legacy
      // props become a single bootstrap-equivalent on the inside.
      client: SharedWorkerDataServicesClient;
      configManager: ConfigManager;
      userId: string;
      mode?: 'eager' | 'lazy';
      children: ReactNode;
    };
```

**Decision under "no versioned code" rule**: we will *not* keep both
shapes in Step 3. The legacy shape is touched in this same PR — the
two existing call sites (`DataProviders.tsx`, `HostedMarketsGrid.tsx`)
both move to `services={...}` in the same commit that adds the new
prop. Consumers outside this repo aren't a concern (this is the only
repo). The Provider's signature ends up clean:

```ts
export interface DataServicesProviderProps {
  services: DataServices;
  /** Default 'lazy'. 'eager' suspends children until mirror.ready(). */
  mode?: 'eager' | 'lazy';
  children: ReactNode;
}
```

### Modified: `apps/markets-ui-react-reference/src/dataServices.mainThread.ts`

Before (current, ~46 LOC including the boilerplate comment block):

```ts
import { SharedWorkerDataServicesClient } from '@starui/data-services/runtime/client';
const APP_ID = 'TestApp';
const sharedWorkerName = `mkt-data-services:${APP_ID}`;
const worker = new SharedWorker(
  new URL('./dataServices.sharedWorker.ts', import.meta.url),
  { type: 'module', name: sharedWorkerName },
);
worker.addEventListener('error', /* ... */);
export const dataServicesClient = new SharedWorkerDataServicesClient(worker.port);
```

After (target ≤10 LOC of meaningful code):

```ts
import { bootstrapDataServices } from '@starui/data-services';
import { createConfigClient } from '@starui/config-service';
import { LOGGED_IN_USER_ID } from '@starui/runtime-port';

const APP_ID = 'TestApp';
const worker = new SharedWorker(
  new URL('./dataServices.sharedWorker.ts', import.meta.url),
  { type: 'module', name: `mkt-data-services:${APP_ID}` },
);
worker.addEventListener('error', (ev) => console.error('[data-services SW]', ev));
export const dataServices = bootstrapDataServices({
  appName: APP_ID,
  worker,
  configManager: createConfigClient({}),
  userId: LOGGED_IN_USER_ID,
});
```

The configManager construction moves out of `main.tsx` (lines 89:
`const configManager = createConfigClient({});`) into here so the
bootstrap is self-contained. `main.tsx` reads `dataServices` and
hands it to the relevant `<HostWrapper>` / Provider.

### Modified call sites (downstream of `dataServices.mainThread.ts`)

| File | Today | After Step 3 |
|---|---|---|
| `apps/.../views/BlottersMarketsGrid.tsx` | `dataServicesClient={dataServicesClient}` on `<HostedMarketsGrid>` | `dataServices={dataServices}` (prop renamed for clarity, see below) |
| `apps/.../views/DataProviders.tsx` | `<DataServicesProvider client={dataServicesClient} configManager={cm} userId={userId}>` | `<DataServicesProvider services={dataServices}>` (drops the local `getConfigManager()` await — bootstrap already has the configManager) |
| `apps/.../main.tsx` | local `configManager` constant | drops; `<HostWrapper>` reads it from `dataServices.configManager` (exposed via the bootstrap result) |
| `packages/.../widgets-react/src/hosted/HostedMarketsGrid.tsx` | `dataServicesClient` prop, mounts `<DataServicesProvider client=…>` | `dataServices` prop, mounts `<DataServicesProvider services=…>` |

The `HostedMarketsGrid` prop rename is the one user-facing breaking
change. Acceptable per "no versioned code" — change happens in the
same PR as the only call site that uses it.

### `DataServices.configManager` accessor

Adding `configManager: ConfigManager` to the `DataServices` shape lets
the app drop its own `createConfigClient({})` call in `main.tsx`. The
bootstrap holds the reference; consumers reach it through the
returned object. This makes the bootstrap a single source of truth
for "everything data-services needs."

```ts
export interface DataServices {
  client: SharedWorkerDataServicesClient;
  appData: AppDataMirror;
  configManager: ConfigManager;     // ← new accessor
  ready: Promise<void>;
  dispose(): void;
}
```

---

## Files added (3)

| File | Purpose | LOC budget |
|---|---|---|
| `packages/shared/services/data-services/src/runtime/bootstrap/bootstrap.ts` | `bootstrapDataServices()` factory + `DataServices` type + module-scope registry | ~80 |
| `packages/shared/services/data-services/src/runtime/bootstrap/bootstrap.test.ts` | Idempotency, dispose, registry isolation | ~120 |
| `packages/shared/services/data-services/src/runtime/bootstrap/index.ts` | Barrel — `export * from './bootstrap.js'` | ~5 |

The `bootstrap/` folder is a new sub-bucket under `runtime/`. It sits
next to `client/`, `worker/`, `mirror/`, `config/`, `template/`,
`providers/`, and `probes/` — all peers, kept isolated.

## Files changed (5)

| File | Change | LOC delta |
|---|---|---|
| `packages/shared/services/data-services/src/runtime/index.ts` | Re-export `bootstrapDataServices`, `DataServices` from `bootstrap/index.js` | +2 |
| `packages/shared/services/data-services/src/index.ts` | Re-export bootstrap surface from root entry (so `import { bootstrapDataServices } from '@starui/data-services'` works without subpath) | +1 |
| `packages/react/providers/data-services-react/src/runtime/index.tsx` | New props (`services`, `mode`); drop `client` / `configManager` / `userId` props; eager mode uses `use(services.ready)` | -10/+15 |
| `packages/react/providers/data-services-react/src/runtime/hooks.test.tsx` | Update test setup to construct via `bootstrapDataServices` (since the Provider no longer accepts the legacy props) | ~+20 |
| `packages/react/widgets/widgets-react/src/hosted/HostedMarketsGrid.tsx` | Rename `dataServicesClient` prop → `dataServices`, pass through to Provider | -2/+2 |

## Files changed in the reference app (3)

| File | Change |
|---|---|
| `apps/markets-ui-react-reference/src/dataServices.mainThread.ts` | Replace `new SharedWorkerDataServicesClient(...)` with `bootstrapDataServices(...)`; export `dataServices` instead of `dataServicesClient` |
| `apps/markets-ui-react-reference/src/main.tsx` | Drop the local `configManager` constant; `<HostWrapper>` receives `dataServices.configManager` |
| `apps/markets-ui-react-reference/src/views/BlottersMarketsGrid.tsx` | Pass `dataServices={dataServices}` (was `dataServicesClient={dataServicesClient}`) |
| `apps/markets-ui-react-reference/src/views/DataProviders.tsx` | Drop local `getConfigManager()` await + `cm` state; mount `<DataServicesProvider services={dataServices}>` directly |

(Total file count: 8 changed/added.)

---

## Sequencing — TDD-aligned, one green commit per concern

1. **`bootstrap.ts` + tests (vanilla TS, no consumers yet).**
   - Step 1.1: Write `bootstrap.test.ts` covering: first call returns
     fresh `DataServices`; second call same appName returns the same
     object reference; calling with a different appName returns a
     different object; `dispose()` removes from registry so a third
     call re-bootstraps; `dispose()` is idempotent.
   - Step 1.2: Implement `bootstrap.ts` minimally — enough to pass.
   - Step 1.3: Add eager-mode regression: `services.ready` resolves
     after a hub `appdata-snapshot` event lands.
   - Tests use `MessageChannel` (real, not stubbed) + an in-process
     `SharedWorkerDataServicesHub` + `createInPageWiring`-style
     plumbing. The "worker" arg is a thin shim that exposes a
     `port: MessagePort` — the tests don't construct a real
     SharedWorker, they pass a stub `{ port: messageChannel.port1 }`.
     This is fine because `SharedWorkerDataServicesClient` only
     reads `worker.port`.
   - Commit: `feat(data-services): bootstrapDataServices() factory + tests`

2. **Re-export from runtime barrel + root barrel.**
   - Step 2.1: Add `bootstrap/index.ts`; update `runtime/index.ts`
     and `src/index.ts`.
   - Step 2.2: Verify root barrel exports parse: `npx turbo
     typecheck --filter @starui/data-services`.
   - Commit: `feat(data-services): expose bootstrap from public surface`

3. **React adapter: new prop shape + `mode`.**
   - Step 3.1: Update `index.tsx` Provider to accept `services` +
     `mode`; remove the legacy 3-prop signature in same change. Eager
     mode body: `if (mode === 'eager') use(services.ready);`.
   - Step 3.2: Migrate `hooks.test.tsx` to wrap children in
     `<DataServicesProvider services={env.services}>` where
     `env.services` is the bootstrap result. Tests for `mode='eager'`:
     mount under `<Suspense fallback={...}>`, assert children don't
     render until snapshot lands; mount under `mode='lazy'`, assert
     children render immediately and `useAppDataStore().loaded` flips
     after snapshot.
   - Step 3.3: Run tests: `npx turbo test --filter
     @starui/data-services-react`.
   - Commit: `feat(data-services-react): <DataServicesProvider services mode>`

4. **Migrate `HostedMarketsGrid` to the new prop.**
   - Step 4.1: Rename prop `dataServicesClient` → `dataServices` in
     `HostedMarketsGrid.tsx`. Internal Provider mount becomes
     `<DataServicesProvider services={dataServices}>`.
   - Step 4.2: Update `dataServicesMount.test.tsx` to pass a
     bootstrap-shaped stub instead of a client stub.
   - Step 4.3: Test: `npx turbo test --filter @starui/widgets-react`.
   - Commit: `refactor(widgets-react): HostedMarketsGrid takes DataServices`

5. **Migrate the reference app.**
   - Step 5.1: Rewrite `dataServices.mainThread.ts` per the "After"
     snippet above. Export `dataServices`, drop `dataServicesClient`.
   - Step 5.2: Drop the local `configManager` from `main.tsx`; thread
     `dataServices.configManager` into `<HostWrapper>`.
   - Step 5.3: Update `BlottersMarketsGrid.tsx` and `DataProviders.tsx`.
   - Step 5.4: `npm run dev` smoke check — open `/blotters/marketsgrid`
     and `/dataproviders`, confirm grid loads + AppData edits propagate.
   - Commit: `refactor(reference-app): adopt bootstrapDataServices`

6. **Verify + push.**
   - Step 6.1: `npx turbo typecheck build test`. Expect green —
     same baseline (653 vitest passing) plus ~6 new bootstrap tests
     and ~2 new Provider eager-mode tests, so target ~661 passing.
   - Step 6.2: Push branch + open stacked PR with base
     `feature/data-services-step2`.

Each step a separate green commit. No squashing — the stack is
reviewable concern-by-concern.

---

## Test plan

### Unit (`bootstrap.test.ts`)

1. **Idempotency by appName.** `bootstrapDataServices({appName: 'A', ...})`
   twice returns the same object reference. Different `appName` returns
   distinct objects.
2. **`dispose()` removes registry entry.** After dispose, a fresh
   bootstrap with the same appName produces a NEW object (not the
   disposed one).
3. **`dispose()` is idempotent.** Calling twice does not throw.
4. **`ready` resolves after first appdata-snapshot.** Wire up an
   in-process hub that sends `appdata-snapshot` on attach (which is
   what the real hub does); confirm `services.ready` resolves.
5. **`client` and `appData` are stable across calls.** Identity check.

### Unit (`hooks.test.tsx` — Provider eager/lazy)

6. **`mode='lazy'` (default) renders children immediately.** Mount
   without `<Suspense>`; assert child rendered. `useAppDataStore().loaded`
   transitions from `false` to `true` after snapshot.
7. **`mode='eager'` suspends until ready.** Mount inside
   `<Suspense fallback={<span data-testid="loading"/>}>`; assert
   `loading` rendered first; after the in-process hub broadcasts
   the AppData snapshot, child renders. (Uses `createInPageWiring`
   to control snapshot timing.)

### Integration (existing tests stay green)

8. The existing `useProviderStream` / `useAppDataStore` /
   `useDataProviderConfig` tests still pass under the new Provider
   shape — `setup()` helper updated to call `bootstrapDataServices`.

### Manual smoke (verifies the reference-app refactor)

9. `npm run dev` → open `/blotters/marketsgrid` → grid loads with
   live STOMP / mock data (no regressions from Step 2).
10. Open `/dataproviders` in a popout window → editor saves an
    AppData row → `/blotters/marketsgrid`'s `{{positions.asOfDate}}`
    template re-resolves and the grid restarts (cross-window
    convergence works under the new bootstrap).

E2E specs that exercise these flows are pre-existing and untouched
by Step 3; they should stay green.

---

## Risks / mitigations

| Risk | Mitigation |
|---|---|
| Module-scope registry persists across HMR / vitest re-imports → leaks. | Tests call `dispose()` in `afterEach`. The registry's `dispose()` removes the appName key, so HMR reload triggers a fresh bootstrap. (Vitest worker isolation already prevents cross-test contamination.) |
| `use(services.ready)` requires React 19 — older consumers break. | We're on React 19 per `docs/DEPS_STANDARD.md`. CI typecheck catches drift if a downstream consumer pins React 18. |
| Two `<DataServicesProvider services={dataServicesA}>` and `<DataServicesProvider services={dataServicesB}>` mounted in the same tree — context collision. | Same pattern as today (one Provider per tree). The bootstrap-by-appName key prevents accidental double-bootstrap in module scope. |
| Reference-app refactor breaks `getConfigManager()` callers (the popout's `cm` await). | `dataServices.configManager` exposes the same instance; the popout reads `services.configManager` instead of awaiting `getConfigManager()`. Verified via the manual smoke check + `useDataProviderConfig` round-trip test. |
| `worker.addEventListener('error', ...)` was on the consumer side — does it still work? | Yes. The bootstrap doesn't take ownership of the SharedWorker object itself, only its port. Consumer-side error handling stays at the consumer's discretion. |

---

## Out-of-scope cleanup that *would* tempt scope creep

- Adding `<DataServicesProvider mode="eager" fallback={...}>` to skip
  the wrap-in-Suspense step. Cosmetic; consumers can wrap themselves.
- Auditing `getConfigManager()` callers app-wide to migrate them onto
  `dataServices.configManager`. The popout flow is the only one
  Step 3 touches; the rest stays put.
- Angular adapter (`provideDataServices()`). One day's work; its own
  PR; doesn't share files with Step 3 except the shared core entry.
- Migrating the OpenFin dock to call `bootstrapDataServices()` at
  startup. The dock isn't in this repo yet; the API is ready when
  it lands.

## Done when

- Three new files merged, five touched in the platform packages,
  three touched in the reference app.
- `npx turbo typecheck build test` green. Vitest counts ~661
  passing (653 baseline + ~8 new).
- `dataServices.mainThread.ts` ≤10 lines of meaningful code (modulo
  the file header comment, which can stay if it pulls its weight).
- Manual smoke on `/blotters/marketsgrid` and `/dataproviders` works
  end-to-end including the AppData edit → cross-window convergence
  flow from Step 2.
- PR opened with base `feature/data-services-step2`, stacked. No
  rebase from `main` until Step 2's PR (#27) merges.
