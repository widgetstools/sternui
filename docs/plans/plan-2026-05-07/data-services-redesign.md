# Data Services Redesign — Design Discussion

**Date:** 2026-05-07
**Status:** Design / brainstorm. No code changes yet.
**Participants:** Anand, Claude

---

## Context — what exists today

The repo currently ships two parallel stomp-related abstractions, easy to
confuse:

1. **`StompDataProvider` class** —
   `packages/shared/data-plane/src/providers/StompDataProvider.ts`.
   One-shot snapshot fetcher used by **provider-configuration tooling**
   (Angular's `stomp-form.component.ts`, `field-inference.service.ts`)
   for "Test connection" / "Infer fields." Imported only by Angular code.
   Not used by `apps/markets-ui-react-reference` at all.

2. **v2 stomp stream transport** —
   `packages/shared/data-plane/src/v2/providers/transports/stomp.ts`
   (`startStomp`, `probeStomp`).
   The runtime stream provider. Lives inside the SharedWorker Hub.
   This is what `MarketsGrid` actually receives data from.

### Runtime data flow today (React reference app)

```
Window A                                         Window B
┌──────────────┐                                ┌──────────────┐
│ MarketsGrid  │                                │ MarketsGrid  │
│  Container   │                                │  Container   │
│ (DataPlane   │                                │ (DataPlane   │
│  client)     │                                │  client)     │
└──────┬───────┘                                └──────┬───────┘
       │ MessagePort                                   │ MessagePort
       └────────────────────┐         ┌────────────────┘
                            ▼         ▼
                    ┌────────────────────────┐
                    │   SharedWorker Hub     │
                    │  • snapshot cache      │
                    │  • subscriber ref-count│
                    │  • fan-out             │
                    └───────────┬────────────┘
                                │ one provider instance,
                                │ shared across subscribers
                                ▼
                    ┌────────────────────────┐
                    │  startStomp(cfg, emit) │
                    │  @stomp/stompjs Client │
                    └───────────┬────────────┘
                                │ WebSocket
                                ▼
                          STOMP broker
```

Key files:
- `apps/markets-ui-react-reference/src/dataPlaneClient.ts` — constructs
  the SharedWorker + `DataPlane` client (lazy on first import).
- `apps/markets-ui-react-reference/src/dataPlaneWorker.ts` — `installWorker()`.
- `packages/react/widgets-react/src/v2/markets-grid-container/MarketsGridContainer.tsx`
  — `dpClient.subscribe(activeId, activeCfg)` returns the
  `{snapshot, onUpdate, onReset, onStatus, unsubscribe}` handle.

### SharedWorker scoping today

Worker is keyed by `(origin, worker URL, name)`. Today the name is
`mkt-data-plane-v2:${APP_ID}`. Two windows of the same browser/origin
attach to the **same** worker (one process, one cache, one socket) —
which is the whole point of using `SharedWorker`. Two workers only
spawn on different origins, different worker `name`, different
profile/Incognito, or different OpenFin partition.

Construction is module-top-level → runs the first time
`dataPlaneClient.ts` is imported, which today is when the user navigates
to a `BlottersMarketsGrid` or `DataProviders` route (both
`React.lazy()` in `main.tsx`).

---

## Design goals

1. **One transparent client surface for all providers.** Caller passes
   an id and gets back a handle with method/event API. Whether data is
   served from the SharedWorker or computed in-process is hidden.

2. **All provider types cached in the SharedWorker** — REST, AppData,
   Stomp, anything future. Same-origin windows in the same app share
   instances. Reduces network connections, gives a single source of
   truth, simplifies cross-window state propagation.

3. **Naming that self-documents.** Folder, file, and class names should
   tell a developer *where the code runs* and *what role it plays*
   without requiring a tour of the package.

---

## Decisions

### 1. Unified provider handle interface

`MarketsGrid` and any other consumer always sees the same shape:

```ts
interface ProviderHandle<T> {
  snapshot: Promise<T[]>;
  onUpdate(cb: (rows: T[]) => void): () => void;
  onReset(cb: (rows: T[]) => void): () => void;
  onStatus(cb: (status: 'loading' | 'ready' | 'error', err?: string) => void): () => void;
  unsubscribe(): void;
}
```

This is what `dpClient.subscribe(...)` already returns. Generalize, don't
invent a parallel API.

### 2. Two transports behind the same handle

| Transport | When to use | Mechanism |
|---|---|---|
| `worker` (default) | All live streaming, all multi-window state | `startStomp` / `startRest` etc. running in SharedWorker; client proxies via `MessagePort` |
| `main` | Lightweight one-shot ops only — field inference, "Test connection," small historical pulls | Same transport function called in-process; same handle shape; auto-disposes after snapshot complete |

Factory picks one via flag. **`main` mode is deliberately scoped**: no
live phase, no reconnect, single provider per call, auto-disconnect on
snapshot or timeout. Prevents it from drifting into a second runtime.

### 3. AppData store moves into the SharedWorker

Today `useAppDataStore` is per-tab in-memory — `{{positions.asOfDate}}`
references don't propagate across windows. Move authoritative state
into the worker; each window keeps a synchronous read **mirror**
hydrated via subscribe broadcasts.

```
   Window A  ─┐                              ┌─ Window B
              │                              │
   ┌──────────▼───────┐             ┌────────▼──────────┐
   │ AppData mirror   │             │ AppData mirror    │
   │ (sync read/write)│             │ (sync read/write) │
   └──────────┬───────┘             └────────┬──────────┘
              │ set/delete (postMessage)      │
              │  ◄── value-changed events ──┐ │
              ▼                              ▼ ▼
              ┌──────────────────────────────────┐
              │  AppData store in SharedWorker   │  ← authoritative
              │  • last-writer-wins              │
              │  • broadcasts deltas to all      │
              └────────────┬─────────────────────┘
                           │ persistence (optional)
                           ▼
                       IndexedDB
```

Tradeoffs accepted:
- **Initial render**: mirror starts empty; first frame may not see
  AppData values. Bootstrap mode (see §5) controls whether to suspend
  on hydration or render immediately and reconcile.
- **Race on writes**: last-writer-wins is sufficient for `asOfDate`-
  style values. Not designing for CRDT semantics yet.
- **Persistence**: worker is the single writer to IndexedDB. Windows
  never persist locally — avoids drift.

### 4. Public facade, transport hidden from callers

```ts
// What 95% of developers use — looks like a main-thread utility:
const stream  = ds.getProvider(id);              // → ProviderHandle
const appData = ds.getAppData('positions');      // → { get, set, subscribe }
const rest    = ds.getProvider(restId);          // same shape

// Internal — framework maintainers only:
new SharedWorkerDataServicesClient(port);
installSharedWorkerHub();
```

Two design rules so the illusion holds:

- **Sync reads need a mirror.** `appData.get('asOfDate')` must return a
  value, not a Promise. Otherwise `await` leaks back to callers and
  undoes the abstraction.
- **Handles own teardown.** Each handle's `unsubscribe()` / `dispose()`
  decrements the worker-side ref-count. Forget this and the Hub leaks
  subscribers.

The internal port wrapper (`dataPlaneClient` today) becomes an
implementation detail and is **not exported** from the package's public
surface. That way nobody can bypass the mirror and start awaiting raw
worker calls.

### 5. Bootstrap pattern — same mechanism, different first caller

The "dock initializes the worker" idea is correct, but the dock isn't
architecturally special — it's just the topmost long-lived window in
OpenFin. Same role belongs to the app shell in a vanilla web app.

```
              ┌──────────────────────────────────────┐
              │ bootstrapDataServices({              │
              │   appName,                           │
              │   seed,                              │
              │   configService,                     │
              │   mode: 'eager' | 'lazy',            │
              │ })                                   │
              │ • new SharedWorker(name=appName)     │
              │ • hydrate AppData from seed          │
              │ • return DataServicesClient          │
              └────────┬─────────────┬───────────────┘
                       │             │
        OpenFin app    │             │   Web app
   ┌───────────────────▼──┐    ┌─────▼─────────────────┐
   │ Dock view's          │    │ <DataServicesProvider │
   │ useEffect / startup  │    │   appName seed mode>  │
   │ calls bootstrap once │    │ at root of <App>      │
   └──────────────────────┘    └───────────────────────┘
```

Properties to lock in:

- **Idempotent.** Whichever caller fires `bootstrapDataServices()` first
  wins; subsequent calls return the existing client. No "dock first,
  then children" choreography.
- **Hydration mode explicit.**
  - `mode: 'lazy'` (default): render immediately, components see empty
    AppData, reconcile via broadcasts. Matches snapshot+delta flow.
  - `mode: 'eager'`: suspend until AppData seed is hydrated. For dashboards
    keyed off `userId` / `asOfDate` where first paint must have values.
- **Framework-agnostic.** `<DataServicesProvider>` is React sugar over a
  plain `bootstrapDataServices()` function. Angular / vanilla / tests
  call the function directly.

### 6. OpenFin partition caveat

SharedWorkers are scoped to `(origin, partition, name)`. If any window in
the workspace uses a different OpenFin `partition`, it lands in a
separate worker process even with matching name. Platform manifest must
ensure all child windows inherit the platform's default partition.

### 7. Write-responsibility split

- **Dock / app shell**: sole writer of the ConfigService seed (initial
  AppData hydration).
- **Child components**: writers only of their own AppData slices.

Avoids initial-key races (dock seeding `positions.asOfDate` while a
child writes its own value).

### 8. Framework parity — React **and** Angular

The core (`packages/shared/data-services/`) is vanilla TS and
framework-agnostic by construction: SharedWorker hub, providers,
AppData store, mirror, bootstrap function — none of it imports React
or Angular. Each framework gets a **thin adapter package** that wraps
the same core.

```
                ┌───────────────────────────────────┐
                │  @starui/data-services            │  ← framework-agnostic
                │  • bootstrapDataServices()        │     vanilla TS,
                │  • SharedWorkerDataServicesClient │     no UI deps
                │  • getProvider / getAppData       │
                │  • AppDataMirror                  │
                └────────────────┬──────────────────┘
                                 │
                ┌────────────────┴────────────────┐
                │                                 │
   ┌────────────▼──────────────┐    ┌─────────────▼────────────┐
   │ @starui/data-services-     │    │ @starui/data-services-    │
   │   react                    │    │   angular                 │
   │ • <DataServicesProvider>   │    │ • provideDataServices()   │
   │ • useDataServices()        │    │ • DataServicesService     │
   │ • useProvider(id)          │    │ • injectProvider(id)      │
   │ • useAppData(name)         │    │ • injectAppData(name)     │
   └────────────────────────────┘    └───────────────────────────┘
```

Equivalence to lock in (same capability, idiomatic per framework):

| React | Angular | Notes |
|---|---|---|
| `<DataServicesProvider appName seed mode>` | `provideDataServices({ appName, seed, mode })` in `app.config.ts` | Both call `bootstrapDataServices()` once. Idempotent. |
| `useDataServices()` (Context) | `inject(DataServicesService)` (DI) | Same client object, two delivery mechanisms. |
| `useProvider(id)` returns handle + React state | `injectProvider(id)` returns handle + `Observable` / `Signal` | Bridge `onUpdate` callback to RxJS / signals. |
| `useAppData(name)` returns sync `{ get, set }` + re-renders on broadcast | `injectAppData(name)` returns `Signal<Map>` + `set()` | Mirror is shared; reactive primitive differs. |

Angular-specific design points:

- **DI surface is the entrypoint.** `provideDataServices()` registers
  the singleton client in the root injector. Angular's bootstrap
  sequence (root injector creation) is the natural single bootstrap
  site — no "dock first" ambiguity.
- **Reactive bridge.** The mirror's broadcast listener drives both an
  `Observable` (RxJS consumers) and a writable `Signal` (Angular 17+).
  Both back the same mirror state — never duplicate the source of truth.
- **Standalone components only.** New code is standalone-component
  era; no NgModule. Same `provide*` factory works in both.
- **The Angular probe path migrates.** Current
  `packages/angular/angular/` imports `StompDataProvider` directly
  for one-shot field inference. Under the new design that becomes
  `getProvider(id, { transport: 'main' })` — framework-agnostic
  helper, called identically from Angular and React editors.

Package layout follows the existing tri-bucket convention from
`CLAUDE.md`:

```
packages/
  shared/data-services/         ← core (vanilla TS)
  react/data-services-react/    ← React adapter
  angular/data-services-angular/← Angular adapter (NEW)
```

The Angular adapter is genuinely thin — most lines are DI wiring and
RxJS/signal bridges over the core. If the React adapter is doing
significant work the Angular one can't, that's a smell that the
boundary leaked and the work belongs in the core.

---

## Naming convention

Rule: **public names hide transport, internal names expose it.**

### Folder structure (proposed)

```
packages/shared/data-services/src/
  ├─ public/                 ← exported API, transport-hidden names
  │   ├─ getProvider.ts
  │   ├─ getAppData.ts
  │   └─ bootstrap.ts
  ├─ sharedWorker/           ← anything that RUNS in the worker
  │   ├─ SharedWorkerDataServicesHub.ts
  │   ├─ install.ts
  │   └─ providers/...
  ├─ mainThread/             ← anything that RUNS on the main thread
  │   ├─ client.ts
  │   └─ mirrors/appDataMirror.ts
  ├─ runtime/                ← was src/v2 — streaming runtime
  ├─ probes/                 ← was src/providers — one-shot fetchers
  │   ├─ StompProbe.ts          (was StompDataProvider)
  │   └─ RestProbe.ts
  └─ shared/                 ← types/utils both sides import
```

Three rules to enforce:

1. **Filename suffix `.sharedWorker.ts` / `.mainThread.ts`** for any
   file whose code is constrained to one side. Pure utility files
   (no `postMessage`, no `self`/`window`) get no suffix.
2. **Class names include topology** when the class only makes sense in
   one place. `SharedWorkerDataServicesHub`, never bare `Hub`.
   `AppDataMirror` is fine without a suffix because "mirror" implies
   main-thread by definition.
3. **Public helpers stay role-based.** Never `getProviderFromSharedWorker(id)`
   — that leaks the boundary back to callers and undoes the abstraction.

### Renames on the list

| Today | New |
|---|---|
| `packages/shared/data-plane/` | `packages/shared/data-services/` |
| `packages/react/data-plane-react/` | `packages/react/data-services-react/` |
| `@starui/data-plane` (package) | `@starui/data-services` |
| `@starui/data-plane-react` | `@starui/data-services-react` |
| `@starui/data-plane/v2/worker` | `@starui/data-services/runtime/sharedWorker` |
| `Hub` (class) | `SharedWorkerDataServicesHub` |
| `dataPlaneWorker.ts` | `dataServices.sharedWorker.ts` |
| `dataPlaneClient.ts` | `dataServices.mainThread.ts` |
| `installWorker()` | `installSharedWorkerHub()` |
| `DataPlane` (client class) | `SharedWorkerDataServicesClient` |
| `useDataPlane()` hook | `useDataServices()` |
| `<DataPlaneProvider>` | `<DataServicesProvider>` |
| `src/v2/` | `src/runtime/` |
| `src/providers/` (legacy one-shots) | `src/probes/` |
| `StompDataProvider` (class) | `StompProbe` |

### Why drop `v2/`

`src/providers/` (so-called "v1") and `src/v2/` aren't actually
versions — they're different capabilities:

- `src/providers/` = one-shot, main-thread snapshot fetcher (editor
  field inference)
- `src/v2/` = streaming, SharedWorker-backed, ref-counted runtime

Renaming based on **role**, not version number, removes the false
"newer is better" implication. Convention: **no version numbers in
folder names, ever.** Versions live in `package.json` and git tags.

### Why drop `data-plane`

"Data plane" is networking jargon. Discoverability test: a UI developer
trying to figure out where to fetch data should be able to guess the
package name. `data-services` passes; `data-plane` doesn't.

`data-providers` was also considered (more truthful — package centers
on providers). `data-services` chosen because it absorbs future
non-provider scope (AppData, telemetry, persistence) without feeling
narrow.

---

## Open questions / next steps

Not committing to any of this yet — design phase only.

When we do execute, sequence to minimize import churn:

1. **One coordinated rename PR** — folders, package names, class names,
   file suffixes, drop `v2/`. Pure search-and-replace; no logic change.
   Updates `docs/ARCHITECTURE.md` and `docs/IMPLEMENTED_FEATURES.md`.
2. **Move AppData into the worker** — authoritative store + main-thread
   mirror with broadcast subscription. New tests for cross-window
   convergence.
3. **Add `bootstrapDataServices()` entrypoint** + `<DataServicesProvider>`
   wrapper with `mode: 'eager' | 'lazy'`. Migrate the dock/app shell to
   call it. Existing per-tab AppData usage continues to work via the
   mirror.
4. **Generalize to REST / future providers** — verify the v2 transport
   for REST is already shared (it likely is); add helpers for any new
   provider kinds.
5. **`main` transport mode for one-shot probes** — replace the legacy
   `StompDataProvider` import path in the Angular editor with
   `getProvider(id, { transport: 'main' })`.

Each step gated on the previous; no big-bang.
