# Angular adapter — `@starui/data-services-angular`

**Date:** 2026-05-08
**Status:** Plan / executing in same session.
**Predecessor:** Step 4 — branch `feature/data-services-step4`, PR #30. Stacked.
**Reference design:** [`data-services-redesign.md` §8](./data-services-redesign.md) (Framework parity — React **and** Angular).

---

## Problem statement

The data-services redesign explicitly commits to React/Angular parity:

> The core (`packages/shared/data-services/`) is vanilla TS and
> framework-agnostic by construction: SharedWorker hub, providers,
> AppData store, mirror, bootstrap function — none of it imports React
> or Angular. Each framework gets a **thin adapter package** that wraps
> the same core.
>                                              — design doc §8

The React adapter ([@starui/data-services-react](../../packages/react/providers/data-services-react/)) shipped in Steps 2 + 3. The Angular adapter is the missing parity piece.

The five-step redesign sequence shipped without it because no consumer needed it on the critical path. Now the rest of the redesign is in place, and Step 5 specifically removed the legacy `StompProbe` / `ProviderBase` / `StreamProviderBase` legacy types so the adapter can land cleanly.

## Goal

A new package, `@starui/data-services-angular`, providing the Angular
twin of every public surface in `@starui/data-services-react`:

| React | Angular | Notes |
|---|---|---|
| `<DataServicesProvider services mode>` | `provideDataServices({ services, mode })` in `app.config.ts` | DI factory; same `services` bundle from `bootstrapDataServices()`. |
| `useDataServices()` (Context) | `inject(DataServicesService)` (DI) | Same client + appData + configStore object, two delivery mechanisms. |
| `useAppDataStore()` → `{ store, version, loaded }` | `injectAppDataStore()` → `{ store, version: Signal<number>, loaded: Signal<boolean> }` | Reactive AppData snapshot. Bridges mirror's `subscribe()` to a Signal. |
| `useAppData(name)` → sync `{ get, set }` + version-driven re-render | `injectAppData(name)` → `{ values: Signal<Record>, loaded: Signal<boolean>, get, set, setMany }` | Per-provider scoped reactive view. |
| `useDataProviderConfig(id)` → `{ cfg, loading, error }` | `injectDataProviderConfig$(id)` → `Observable<{ cfg, loading, error }>` | Single config row; reactive on id change. |
| `useDataProvidersList(opts)` → `{ configs, loading, error, refresh }` | `injectDataProvidersList$(opts)` → `{ configs$: Observable, refresh() }` | List of saved provider configs. |
| `useResolvedCfg(cfg)` → resolved cfg | `injectResolvedCfg(cfg: Signal<ProviderConfig \| null>)` → `Signal<ProviderConfig \| null>` | Template substitution against AppData. |
| `useProviderStream(id, cfg, listener)` → `{ status, error, refresh }` | `injectProviderStream(id, cfg)` → `{ deltas$, status$, error$, refresh() }` | Auto-detach on injector teardown via `DestroyRef`. |
| `useProviderStats(id, listener)` | `injectProviderStats$(id)` → `Observable<ProviderStats>` | Stats subscription. |

## Non-goals

- **Migrating widgets-angular's `DataProviderService` and `FieldInferenceService` to use the new adapter.** Out of scope for this PR — the adapter ships standalone; migration is a follow-up once the surface is settled and we have an actual Angular consumer beyond the dead-code service.
- **Eager mode parity via APP_INITIALIZER.** Angular's `provideAppInitializer()` (Angular 17+) can defer bootstrap until a promise resolves, which is the natural eager analogue to React's `<Suspense>`. v1 of the adapter ships lazy-only; eager added if/when a consumer asks. Keeps the surface focused.
- **Standalone Angular tests.** widgets-angular has no vitest / Karma harness today; build + typecheck is the gate. Standalone unit tests for the adapter would require setting up TestBed, which is outside this PR's scope.

## Architecture

```
                    @starui/data-services           (vanilla TS, Steps 1-5)
                            │
              ┌─────────────┴──────────────┐
              │                            │
   @starui/data-services-react   @starui/data-services-angular   ← NEW
   (already shipping)             ──────────────────────────
                                  • provideDataServices(opts)
                                  • DataServicesService (root)
                                  • injectAppData(name)
                                  • injectAppDataStore()
                                  • injectProviderStream(id, cfg)
                                  • injectProviderStats$(id)
                                  • injectDataProviderConfig$(id)
                                  • injectDataProvidersList$()
                                  • injectResolvedCfg(cfg$)
```

### Reactive bridge strategy

The mirror's broadcast listener drives **both** an Observable (for RxJS
consumers) and a writable Signal (for Angular 17+ template
consumers). Both back the same mirror state — never duplicate the
source of truth.

For per-stream subscriptions, each `injectProviderStream(id, cfg)`
call:
1. Calls `client.subscribe(id, cfg)` — gets a `SubscribeHandle<T>`.
2. Bridges `handle.snapshot` → `BehaviorSubject<readonly T[]>`.
3. Bridges `handle.onUpdate(cb)` → push to that BehaviorSubject.
4. Bridges `handle.onStatus(cb)` → `BehaviorSubject<ProviderStatus>`.
5. Auto-detaches via `inject(DestroyRef).onDestroy(() => handle.unsubscribe())`.

Same pattern as widgets-react's `useProviderStream`, just expressed
in DI + RxJS + Signals instead of hooks.

### DI tokens

```ts
export const DATA_SERVICES = new InjectionToken<DataServices>('@starui/data-services-angular#services');
```

`DataServicesService` injects the token in its constructor. All
`inject*` helpers go through `inject(DataServicesService)` rather
than the token directly so consumers have one DI surface.

---

## Files added (10)

### Package scaffolding

```
packages/angular/providers/data-services-angular/
  ├─ package.json
  ├─ ng-package.json
  ├─ tsconfig.json
  └─ src/
      ├─ index.ts                              ← public barrel
      ├─ tokens.ts                             ← InjectionToken<DataServices>
      ├─ provider.ts                           ← provideDataServices()
      ├─ DataServicesService.ts                ← root @Injectable
      ├─ inject-app-data.ts                    ← injectAppData + injectAppDataStore
      ├─ inject-provider-stream.ts             ← injectProviderStream + injectProviderStats$
      ├─ inject-data-provider-config.ts        ← injectDataProviderConfig$ + injectDataProvidersList$
      └─ inject-resolved-cfg.ts                ← injectResolvedCfg
```

LOC budget per file:

| File | LOC |
|---|---|
| `package.json` / `ng-package.json` / `tsconfig.json` | ~30 each, ~100 total |
| `src/index.ts` | ~20 |
| `src/tokens.ts` | ~15 |
| `src/provider.ts` | ~30 |
| `src/DataServicesService.ts` | ~80 |
| `src/inject-app-data.ts` | ~140 |
| `src/inject-provider-stream.ts` | ~120 |
| `src/inject-data-provider-config.ts` | ~140 |
| `src/inject-resolved-cfg.ts` | ~50 |
| **Total** | **~700 LOC** |

## Files changed (3)

| File | Change |
|---|---|
| `package.json` (root) | Add `packages/angular/providers/*` to workspaces glob |
| `docs/IMPLEMENTED_FEATURES.md` | Add adapter entry |
| `docs/ARCHITECTURE.md` | Note the new adapter in the layer map |

---

## Sequencing — TDD-aligned where possible, one green commit per concern

(No vitest harness in widgets-angular — build + typecheck are the
automated gate. Manual verification: import the new package in
demo-angular's app.config.ts as a smoke check.)

1. **Workspaces glob + package scaffolding.**
   - `package.json`, `ng-package.json`, `tsconfig.json`, empty
     `src/index.ts`. Build succeeds with empty barrel.
   - Commit: `feat(data-services-angular): package scaffolding`.

2. **DI tokens + `provideDataServices()`.**
   - Token, factory, exports.
   - Commit: `feat(data-services-angular): provideDataServices() factory`.

3. **`DataServicesService` root injectable.**
   - Wraps `services.client`, `services.appData`, builds the
     `DataProviderConfigStore` once.
   - Commit: `feat(data-services-angular): DataServicesService root injectable`.

4. **`injectAppData(name)` + `injectAppDataStore()`.**
   - Mirror's `subscribe()` → Signal driving a re-evaluating
     computed. Auto-cleanup via `DestroyRef`.
   - Commit: `feat(data-services-angular): injectAppData + injectAppDataStore`.

5. **`injectProviderStream(id, cfg)` + `injectProviderStats$(id)`.**
   - Each subscription tracks a single `SubscribeHandle`. Bridges
     to BehaviorSubjects. `DestroyRef.onDestroy(() => unsubscribe())`.
   - Commit: `feat(data-services-angular): injectProviderStream + stats`.

6. **`injectDataProviderConfig$(id)` + `injectDataProvidersList$()`.**
   - One-shot fetches; observables emit once and complete (or
     refresh on demand for the list version).
   - Commit: `feat(data-services-angular): injectDataProviderConfig + injectDataProvidersList`.

7. **`injectResolvedCfg(cfg$)`.**
   - Computed signal that re-runs `resolveCfg()` whenever cfg or
     mirror snapshot version changes.
   - Commit: `feat(data-services-angular): injectResolvedCfg`.

8. **Docs.**
   - IMPLEMENTED_FEATURES + ARCHITECTURE.
   - Commit: `docs: data-services-angular adapter`.

9. **Verify + push + PR.**

---

## Test plan

- `npx turbo typecheck build` — gates the entire surface; `tsc -p`
  catches type drift, `ng-packagr` catches Angular-specific build
  errors.
- The package imports `@starui/data-services` from the same `dist`
  the React adapter consumes — type-level parity is automatic.
- No vitest suite (matches the widgets-angular precedent). Running
  the package in demo-angular's `app.config.ts` smoke-validates the
  DI wiring works at runtime.

## Risks / mitigations

| Risk | Mitigation |
|---|---|
| ng-packagr config drift — Angular 21's compiler may not accept structures `host-wrapper-angular` uses. | Mirror `host-wrapper-angular`'s package.json / ng-package.json / tsconfig.json line-for-line. Same Angular major; same compiler. |
| Signal-based reactive bridge subscribes to mirror but never unsubscribes → memory leak across component teardown. | Every `inject*` helper takes `inject(DestroyRef)` and registers an `onDestroy` cleanup. Mirror's `subscribe()` returns an unsubscribe; we hold + dispose it. |
| `DataServicesService` is `providedIn: 'root'` so mounting two `provideDataServices(...)` blocks results in conflict. | Document: one `provideDataServices()` per Angular app. Same constraint as `<DataServicesProvider>` (one per React tree). |
| Eager mode unsupported — consumers expecting it will be surprised. | Plan doc + IMPLEMENTED_FEATURES note: lazy-only in v1; eager via `provideAppInitializer()` is a follow-up. |

## Done when

- New package `@starui/data-services-angular` builds via `ng-packagr`.
- `npx turbo typecheck build test` green across all 66 packages
  (66 = current 65 + the new one).
- IMPLEMENTED_FEATURES.md + ARCHITECTURE.md updated.
- PR opened with base `feature/data-services-step4`, stacked.
