# Step 4 — REST + future-provider generalization

**Date:** 2026-05-08
**Status:** Plan / executing in same session.
**Predecessor:** Step 5 — branch `feature/data-services-step5`, PR #29. Stacked.
**Reference design:** [`data-services-redesign.md` §"Open questions / next steps"](./data-services-redesign.md) item 4.

---

## Problem statement

The design doc's Step 4 reads:

> Generalize to REST / future providers — verify the v2 transport for
> REST is already shared (it likely is); add helpers for any new
> provider kinds.

In practice the work is mostly already done:

- **REST is implemented end-to-end.** [`runtime/providers/transports/rest.ts`](../../packages/shared/services/data-services/src/runtime/providers/transports/rest.ts)
  ships `startRest` (registered in `providers/registry.ts`) and
  `probeRest` (now exposed at the package root after Step 5). Has
  9-case unit coverage in `rest.test.ts`. Same protocol shape as
  STOMP from the SharedWorker hub's perspective.
- **Mock + Stomp + Rest + AppData** all flow through the same
  registry → `startProvider(cfg, emit)` dispatch.
- **AppData** is the deliberate exception — it's a kv store consumed
  by other providers via `{{name.key}}` substitution, not a streaming
  provider, so it's routed through the AppDataMirror, not
  `startProvider`.

What's left is small and falls into three buckets:

1. **Test gap.** The SharedWorker hub's integration tests
   ([`SharedWorkerDataServicesHub.test.ts`](../../packages/shared/services/data-services/src/runtime/worker/SharedWorkerDataServicesHub.test.ts))
   use the `mock` factory exclusively. REST works through the same
   plumbing, but no test actually exercises it through the hub. Adding
   one round-trip test locks in the cross-transport invariant.
2. **Provider-type surface inconsistency.** `shared-types` declares
   `WebSocketProviderConfig` and `SocketIOProviderConfig`, but no
   transport implements them. Angular's editor exposes them as
   selectable options ([`data-provider-editor.component.ts:149-150`](../../packages/angular/widgets/widgets-angular/src/components/data-provider-editor/data-provider-editor.component.ts#L149-L150));
   React's editor [explicitly excludes them via `SUPPORTED_TYPES`](../../packages/react/widgets/widgets-react/src/v2/provider-editor/DataProviderEditor.tsx#L36).
   A user picking `websocket` in Angular saves a config that fails at
   first attach with `No provider factory registered for type 'websocket'`.
   Lock Angular down to match React.
3. **No "add a new transport" recipe.** A future maintainer who wants
   to add (e.g.) a Kafka transport has to reverse-engineer the
   pattern from `mock.ts` / `stomp.ts` / `rest.ts`. Worth a paragraph
   in the providers barrel.

## Goal

Three small, surgical changes:

1. Add a REST round-trip test to the SharedWorker hub test suite,
   exercising attach → snapshot → ready → detach via `startRest`.
2. Drop `websocket` + `socketio` from Angular's selectable
   `providerTypes` array and remove the dead `<section *ngIf>`
   branches in `provider-form.component.ts`. The type declarations
   stay in `shared-types` (they're accurate descriptions of what
   *would* exist if implemented; deleting them is a separate
   decision).
3. Add a short "Adding a new transport" recipe to
   [`runtime/providers/index.ts`](../../packages/shared/services/data-services/src/runtime/providers/index.ts)
   so the registry pattern is documented at the discovery point.

## Non-goals

- **Implementing WebSocket / Socket.IO transports.** No consumer
  requesting them; no business value to justify the dependency
  weight (especially Socket.IO).
- **Removing the `WebSocket` / `SocketIO` config types from
  `shared-types`.** They're declarative; nothing in the runtime uses
  them, and they don't hurt anyone sitting there. Removing them is
  a tiny but invasive change for no payoff.
- **Angular adapter.** Separate, larger work.

---

## Surface changes

### 1. Hub round-trip test for REST

**File:** `packages/shared/services/data-services/src/runtime/worker/SharedWorkerDataServicesHub.test.ts`

Add a single test case that:
- Registers a stub `RestFetchFn` returning a JSON body with rows.
- Builds a `RestProviderConfig` and attaches via the hub.
- Asserts the listener receives `{ rows, replace: true }` then `status: 'ready'`.
- Detaches; asserts no further events.

This mirrors the existing mock-provider tests but uses the real
`startRest` factory through the registry — proving the registry is
generic across transports. ~40 LOC.

### 2. Lock Angular's providerTypes to implemented set

**File:** `packages/angular/widgets/widgets-angular/src/components/data-provider-editor/data-provider-editor.component.ts`

```ts
// Before
providerTypes = [
  { id: 'stomp', ... },
  { id: 'rest', ... },
  { id: 'websocket', ... },   // ← drop
  { id: 'socketio', ... },    // ← drop
  { id: 'mock', ... },
];

// After
providerTypes = [
  { id: 'stomp', ... },
  { id: 'rest', ... },
  { id: 'mock', ... },
];
```

**File:** `packages/angular/widgets/widgets-angular/src/components/data-provider-editor/provider-form.component.ts`

Drop the two `<section *ngIf="formData.providerType === 'websocket'">` and
`<section *ngIf="formData.providerType === 'socketio'">` template blocks
([lines 118-160](../../packages/angular/widgets/widgets-angular/src/components/data-provider-editor/provider-form.component.ts#L118)).

The shared-types declarations stay — Angular just stops offering them
in the picker. If someone manually crafts a config with
`providerType: 'websocket'` and tries to attach, they'll get the
existing `startProvider` registry error, which is the right failure mode.

### 3. Document the "add a new transport" recipe

**File:** `packages/shared/services/data-services/src/runtime/providers/index.ts`

Extend the existing barrel comment with a short recipe section:

```
 *
 * ── Adding a new transport ─────────────────────────────────────
 *
 * 1. Add the config interface to `@starui/shared-types/dataProvider.ts`
 *    with `providerType: '<your-id>'` and the union member.
 * 2. Implement the factory in
 *    `runtime/providers/transports/<your-id>.ts` exporting
 *    `start<YourId>(cfg, emit) → ProviderHandle`. Optionally export
 *    `probe<YourId>(cfg, opts) → ProbeResult` for editor flows.
 * 3. Register the factory in `runtime/providers/registry.ts`'s
 *    `factories` map.
 * 4. (Optional) Re-export the probe function from this barrel and
 *    add it to the package root in `src/index.ts`.
 * 5. Update each editor's selectable type list (React's
 *    `SUPPORTED_TYPES` array; Angular's `providerTypes` array).
 *
 * Three transports already follow this pattern: mock, stomp, rest.
 * The `mock` factory is the simplest reference (~50 LOC).
```

## Files changed (3)

| File | Change | LOC delta |
|---|---|---|
| `packages/shared/services/data-services/src/runtime/worker/SharedWorkerDataServicesHub.test.ts` | Add REST round-trip test | +40 |
| `packages/shared/services/data-services/src/runtime/providers/index.ts` | Add "Adding a new transport" recipe to the barrel comment | +20 |
| `packages/angular/widgets/widgets-angular/src/components/data-provider-editor/data-provider-editor.component.ts` | Drop websocket + socketio entries from `providerTypes` | -2 |
| `packages/angular/widgets/widgets-angular/src/components/data-provider-editor/provider-form.component.ts` | Drop websocket + socketio template sections | ~-45 |

## Files added / deleted

None.

## Sequencing

1. **Add the REST hub round-trip test.** Verify it passes.
   - Commit: `test(data-services): hub round-trip test for REST`.
2. **Lock Angular's selectable provider types.** Drop UI.
   - Commit: `refactor(widgets-angular): drop unsupported websocket/socketio from picker`.
3. **Document the new-transport recipe.**
   - Commit: `docs(data-services): recipe for adding a new transport`.
4. **Update IMPLEMENTED_FEATURES.md** with Step 4 entry.
   - Commit: `docs: record Step 4 (REST generalization) in IMPLEMENTED_FEATURES`.
5. Verify (`npx turbo typecheck build test`) green; push; open stacked PR.

## Test plan

- The new REST hub test is itself the verification.
- `npx turbo typecheck build test` green across all 65 tasks.
- Angular package builds via `ng-packagr` after the picker trim.

## Risks / mitigations

| Risk | Mitigation |
|---|---|
| Angular consumer has saved configs with `providerType: 'websocket'`. After this PR they no longer round-trip through the editor cleanly. | Verified zero saved configs with these types in the reference app's seed. The runtime already failed for these types (`startProvider` throws); this PR just stops *new* configs being created with them. |
| The recipe doc rots as the registry pattern evolves. | Keep it short — five steps, no code. Future changes should prefer updating the existing transports (the canonical reference) over the doc. |

## Done when

- One test added (~40 LOC), one barrel comment extended, two Angular files trimmed.
- `npx turbo typecheck build test` green.
- `IMPLEMENTED_FEATURES.md` records Step 4.
- PR opened with base `feature/data-services-step5`, stacked.
- The original 5-step redesign sequence is complete.
