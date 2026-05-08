# Step 5 — `main` transport for one-shot probes

**Date:** 2026-05-08
**Status:** Plan / awaiting approval. No code changes yet.
**Predecessor:** Step 3 (bootstrap + Provider mode) — branch
`feature/data-services-step3`, PR #28. Stacked.
**Reference design:** [`data-services-redesign.md` §2](./data-services-redesign.md)
("Two transports behind the same handle"); §"Open questions / next
steps" item 5.

---

## Problem statement

Step 1 renamed `StompDataProvider` → `StompProbe` to mark the legacy
one-shot snapshot fetcher as a **probe** (distinct from the streaming
runtime that lives in the SharedWorker). Renaming bought us time, but
the class itself is now redundant: the same logic lives as pure
functions in
`packages/shared/services/data-services/src/runtime/providers/transports/`
(`probeStomp`, `probeRest`, `inferFields`), which the React editor
already uses via [`useProviderProbe.ts`](../../packages/react/widgets/widgets-react/src/v2/provider-editor/useProviderProbe.ts).

Today there are two parallel probe surfaces:

| | Legacy class (`probes/StompProbe.ts`) | Shared functions (`runtime/providers/transports/`) |
|---|---|---|
| Implementation | Class with `connectionCount` / `disconnectionCount` instance state, `checkConnection()`, `fetchSnapshot()`, static `inferFields()` | Pure functions: `probeStomp(cfg, opts)`, `probeRest(cfg)`, `inferFields(rows, opts)` |
| Return shape | `{ success, data?, error? }` | `{ ok, rows?, error? }` |
| Field inference output | `Record<string, FieldInfo>` (needs `convertFieldInfoToNode` mapping) | `{ fields: FieldNode[], rowsUsed, rowsFetched }` (already in editor shape) |
| Consumers | Angular only (`field-inference.service.ts`, `stomp-form.component.ts`) | React (`useProviderProbe.ts`) |
| Public surface | `import { StompProbe } from '@starui/data-services'` (root) | `import { probeStomp, probeRest, inferFields } from '@starui/data-services/runtime/sharedWorker'` |

Both implementations end up doing the same thing, but the legacy
class:
- duplicates 360 LOC of STOMP wire handling that already exists in
  the shared transport;
- diverges in connection lifecycle details (the legacy class doesn't
  resolve `[bracket]` tokens; the shared `probeStomp` does);
- pollutes the root barrel of `@starui/data-services` with classes a
  React consumer will never use.

The shared-function path also has a presentation bug: it's exported
under `@starui/data-services/runtime/sharedWorker`, but the functions
do not require a SharedWorker — they call the transport in-process.
The subpath name lies about the constraint.

## Goal

One probe surface across the platform:

```ts
import { probeStomp, probeRest, inferFields } from '@starui/data-services';

const r = await probeStomp(cfg, { maxRows: 100 });
if (!r.ok) throw new Error(r.error);
const { fields } = inferFields(r.rows!, { targetSampleSize: 100 });
```

Same import, same shape, same behaviour from React, Angular, vanilla
TS, or tests. The legacy `StompProbe` class is deleted in the same
PR — per the project's "no versioned code" rule, superseded code goes
away with its replacement.

This is the design doc's `transport: 'main'` mode in everything but
syntax. The doc proposed a `getProvider(id, { transport: 'main' })`
wrapper; the React editor proves direct function imports are simpler
and equally expressive. We adopt the simpler shape.

## Non-goals (deferred)

- **Angular adapter (`provideDataServices()` / `injectDataServices()`)**.
  Step 5 only removes the last legacy probe import path so the
  Angular adapter has nothing to drag along. The adapter itself is
  its own PR, on top of Step 5.
- **Worker-owned IndexedDB persistence.** Same defer as Step 2 / 3.
- **Step 4 (REST helpers).** The v2 REST transport already exists in
  `transports/rest.ts` (`startRest`, `probeRest`); generalizing helper
  patterns for future provider kinds is its own work.
- **Renaming `runtime/sharedWorker` subpath.** The path remains since
  it's where the worker entry + hub live; we just stop routing probe
  imports through it.

---

## Architecture

```
                    ┌────────────────────────────┐
   Before:          │   @starui/data-services    │
                    │   ──────────────────────   │
                    │  • StompProbe (class) ⚠    │  ← root re-export
                    │  • ProviderBase ⚠          │
                    │  • StreamProviderBase ⚠    │
                    └────────────────────────────┘
                                  +
            ┌─────────────────────────────────────────┐
            │ @starui/data-services/runtime/sharedWorker│  ← misleading path
            │  • probeStomp / probeRest / inferFields │  ← actually main-thread
            └─────────────────────────────────────────┘

                    ┌────────────────────────────┐
   After:           │   @starui/data-services    │
                    │   ──────────────────────   │
                    │  • bootstrapDataServices() │  (Step 3)
                    │  • probeStomp              │  ← one path
                    │  • probeRest               │
                    │  • inferFields             │
                    │  + everything from runtime │
                    └────────────────────────────┘
```

The probe functions stay where they live (`runtime/providers/transports/`) —
they don't move on disk. Only the public re-export changes.

---

## Surface changes

### 1. Migrate Angular off `StompProbe`

**File: `packages/angular/widgets/widgets-angular/src/services/field-inference.service.ts`**

Before:
```ts
import { StompProbe } from '@starui/data-services';
import { convertFieldInfoToNode, ... } from '@starui/shared-types';
...
const provider = new StompProbe({ websocketUrl, ... });
const result = await provider.fetchSnapshot(100);
if (!result.success || !result.data || result.data.length === 0) {
  throw new Error(result.error || 'No data received from STOMP server');
}
const inferredFieldsMap = StompProbe.inferFields(result.data);
const fieldNodes: FieldNode[] = Object.values(inferredFieldsMap)
  .map((f: any) => convertFieldInfoToNode(f));
```

After:
```ts
import { probeStomp, inferFields } from '@starui/data-services';
import { ... } from '@starui/shared-types';  // drop convertFieldInfoToNode
...
const result = await probeStomp(config, { maxRows: 100 });
if (!result.ok || !result.rows || result.rows.length === 0) {
  throw new Error(result.error || 'No data received from STOMP server');
}
const { fields: fieldNodes } = inferFields(result.rows, { targetSampleSize: 100 });
```

Behavioural diff: `probeStomp` resolves `[bracket]` tokens before
connecting (the legacy class did not). This is the desired behaviour
and matches how the React editor probes.

**File: `packages/angular/widgets/widgets-angular/src/components/data-provider-editor/stomp-form.component.ts`**

Before (`testConnection()`):
```ts
import { StompProbe } from '@starui/data-services';
...
const provider = new StompProbe(config);
await provider.fetchSnapshot(1);
this.connectionOk = true;
this.connectionStatus = 'Connection successful';
```

After:
```ts
import { probeStomp } from '@starui/data-services';
...
const result = await probeStomp(config, { maxRows: 1, timeoutMs: 10_000 });
if (result.ok) {
  this.connectionOk = true;
  this.connectionStatus = 'Connection successful';
} else {
  this.connectionOk = false;
  this.connectionStatus = result.error || 'Connection failed';
}
```

The legacy code threw on failure; `probeStomp` returns `{ok: false, error}`.
The component already had `try/catch` setting `connectionOk = false`,
so we keep that for safety but expect the error path to be
`!result.ok` rather than a throw.

### 2. Public surface — root barrel

**File: `packages/shared/services/data-services/src/index.ts`**

Before (Step 4 state):
```ts
// Probes — one-shot snapshot fetchers consumed by editors.
export {
  StompProbe,
  StreamProviderBase,
  ProviderBase,
  type StompConnectionConfig,
  type StompConnectionResult,
  type ProviderEmitter,
  type Unsubscribe as ProviderUnsubscribe,
  type StreamProviderListener,
  type StreamStatistics,
} from './probes/index.js';
```

After:
```ts
// One-shot probe surface — pure main-thread functions for editor
// flows (Test connection, Infer fields). Same vocabulary the streaming
// runtime uses; calling them in-process is the design doc's
// `transport: 'main'` mode.
export {
  probeStomp,
  probeRest,
  inferFields,
  type ProbeResult as StompProbeResult,
  type ProbeOpts as StompProbeOpts,
  type RestProbeResult,
  type InferOptions,
} from './runtime/providers/index.js';
```

(`runtime/providers/index.js` aggregates re-exports from the transport
modules — added in this PR.)

### 3. React editor import path

**File: `packages/react/widgets/widgets-react/src/v2/provider-editor/useProviderProbe.ts`**

Before:
```ts
import { probeStomp, probeRest, inferFields } from '@starui/data-services/runtime/sharedWorker';
```

After:
```ts
import { probeStomp, probeRest, inferFields } from '@starui/data-services';
```

`runtime/sharedWorker` continues to export the same functions for
back-compat (the worker barrel still pulls them in for its own
`startProvider` consumers); the React editor just stops using the
misleading path.

### 4. Delete the legacy probes/ folder

```
packages/shared/services/data-services/src/probes/
  ├─ StompProbe.ts          DELETE — replaced by probeStomp + inferFields
  ├─ ProviderBase.ts        DELETE — no external extenders
  ├─ StreamProviderBase.ts  DELETE — no external extenders
  ├─ rowCache.ts            DELETE — no external consumers (used only by StreamProviderBase)
  └─ index.ts               DELETE — barrel
```

Verified via `grep -r 'extends ProviderBase\|extends StreamProviderBase'`
across packages and apps: zero hits outside the file definitions.
`StompProbe`, `ProviderEmitter`, `StreamProviderListener`,
`StreamStatistics`: zero hits outside the data-services package itself
after the Angular migration.

### 5. New aggregator: `runtime/providers/index.ts`

The transport modules already live at:
```
runtime/providers/transports/stomp.ts   → probeStomp, startStomp, type ProbeResult, type ProbeOpts
runtime/providers/transports/rest.ts    → probeRest,  startRest,  type ProbeResult (RestProbeResult)
runtime/providers/inferFields.ts        → inferFields, type InferOptions
```

A new `runtime/providers/index.ts` barrel collects the probe surface
in one place so the root re-export stays tidy. (The worker barrel at
`runtime/worker/index.ts` already re-exports these for the SharedWorker
side; the new barrel is its main-thread peer.)

---

## Files changed (4)

| File | Change |
|---|---|
| `packages/angular/widgets/widgets-angular/src/services/field-inference.service.ts` | Migrate `StompProbe` → `probeStomp` + `inferFields` |
| `packages/angular/widgets/widgets-angular/src/components/data-provider-editor/stomp-form.component.ts` | Migrate `testConnection` to `probeStomp` |
| `packages/shared/services/data-services/src/index.ts` | Drop legacy probe re-exports; add `probeStomp` / `probeRest` / `inferFields` |
| `packages/react/widgets/widgets-react/src/v2/provider-editor/useProviderProbe.ts` | Switch import path from `runtime/sharedWorker` → root |

## Files added (1)

| File | Purpose | LOC |
|---|---|---|
| `packages/shared/services/data-services/src/runtime/providers/index.ts` | Probe surface barrel — re-exports `probeStomp`, `probeRest`, `inferFields` and their types | ~25 |

## Files deleted (5)

```
packages/shared/services/data-services/src/probes/StompProbe.ts
packages/shared/services/data-services/src/probes/ProviderBase.ts
packages/shared/services/data-services/src/probes/StreamProviderBase.ts
packages/shared/services/data-services/src/probes/rowCache.ts
packages/shared/services/data-services/src/probes/index.ts
```

The `probes/` folder is removed entirely. (`shared-types`'s
`convertFieldInfoToNode` and `FieldInfo` types stay — they're used by
the legacy v1 widgets-angular path until that migrates separately.
This PR only stops importing them in the migrated Angular files.)

## LOC delta

Net deletion ~400 LOC. Five files removed (~620 LOC), two Angular
files shortened (~30 LOC), one new barrel (~25 LOC), two trivial
import path updates.

---

## Sequencing — one green commit per concern

1. **Add the `runtime/providers/index.ts` barrel** + update root
   `src/index.ts` to re-export from it (alongside the legacy probe
   exports — no removals yet so existing call sites compile).
   - Test: `npx turbo typecheck --filter @starui/data-services`.
   - Commit: `feat(data-services): add probe surface to root barrel`.

2. **Migrate React `useProviderProbe.ts`** import path.
   - Test: `npx turbo test --filter @starui/widgets-react`.
   - Commit: `refactor(widgets-react): probe imports from data-services root`.

3. **Migrate Angular `field-inference.service.ts`** to `probeStomp` +
   `inferFields`.
   - Test: `npx turbo build --filter @starui/widgets-angular`. (Angular
     package has no vitest suite; build + typecheck is the gate.)
   - Commit: `refactor(widgets-angular): field inference uses probeStomp + inferFields`.

4. **Migrate Angular `stomp-form.component.ts`** `testConnection()`.
   - Test: same — build + typecheck.
   - Commit: `refactor(widgets-angular): testConnection uses probeStomp`.

5. **Delete the `probes/` folder** + drop legacy re-exports from root
   `src/index.ts`.
   - Test: `npx turbo typecheck build test`.
   - Commit: `refactor(data-services): drop legacy StompProbe class + probes folder`.

6. **Verify + push** + open PR stacked on `feature/data-services-step3`.

---

## Test plan

No new unit tests — the migration replaces a legacy implementation
with one that's already well-tested via:

- `probeStomp` is exercised by widgets-react's `useProviderProbe`
  (already shipping; manually validated in DataProviders editor).
- `inferFields` is exercised by the same path + has its own existing
  unit tests in `runtime/providers/inferFields.test.ts`.

Verification gate:
1. `npx turbo typecheck build test` green across all 43 packages.
2. Manual smoke: `npm run dev` → `/dataproviders` popout → STOMP form
   → "Test connection" → success path; "Infer fields" → field tree
   populates.
3. Angular smoke (deferred): the widgets-angular package builds via
   `ng-packagr`. No vitest suite. CI build + typecheck is the
   automated gate.

## Risks / mitigations

| Risk | Mitigation |
|---|---|
| `probeStomp` resolves `[bracket]` tokens; legacy `StompProbe` doesn't. Angular consumers may have URL strings with literal `[brackets]` they don't want resolved. | Verified by grep: Angular call sites build cfg from form fields with no `[bracket]` syntax. The new behaviour aligns Angular with React (which already resolves brackets). |
| `inferFields` returns a different shape (`FieldNode[]` vs `Record<string, FieldInfo>`). The Angular code's `Object.values(inferredFieldsMap).map(convertFieldInfoToNode)` step is now unnecessary. | The new return is exactly what Angular wants — that's why `convertFieldInfoToNode` even exists (it bridges the legacy shape to the editor's). Removing the bridge is a simplification. |
| Some downstream consumer outside this repo imports `StompProbe`. | This is the only repo using these packages. Verified via `grep` across `packages/`, `apps/`, and the IMPLEMENTED_FEATURES doc. |
| `ProviderBase` / `StreamProviderBase` are abstract bases with no extenders, but their type aliases (`ProviderEmitter`, `Unsubscribe`, `StreamProviderListener`, `StreamStatistics`) might be used. | Verified: zero external imports of these types. They're internal vocabulary the legacy class used. |

## Out-of-scope cleanup that *would* tempt scope creep

- **Renaming `runtime/sharedWorker` to drop the misleading scope.**
  The path correctly identifies the worker entry + hub; only the
  probe re-exports were misplaced. Step 5 fixes the placement; the
  path stays.
- **Dropping `convertFieldInfoToNode` / `FieldInfo` from `shared-types`.**
  Only the migrated Angular files stop using these; legacy v1
  widgets-angular code may still import them. Audit + delete is its
  own PR.
- **Adding a `probe-rest.test.ts` to mirror the Stomp coverage.** The
  REST transport already has tests for `startRest`; `probeRest` is a
  thin wrapper. Worth doing eventually, but separate from this
  migration.

## Done when

- One barrel added, four files changed, five files deleted.
- `npx turbo typecheck build test` green.
- `import { StompProbe } from '@starui/data-services'` no longer compiles.
- `import { probeStomp, probeRest, inferFields } from '@starui/data-services'` works from React, Angular, vanilla TS, and tests.
- Manual smoke on `/dataproviders` Test connection + Infer fields passes.
- PR opened with base `feature/data-services-step3`, stacked. No
  rebase from `main` until Steps 2 + 3 merge.
