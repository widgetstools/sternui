# Plan: `<MarketsGrid>` API shape — imperative handle, not HOC

> **Status:** plan · **Supersedes:** the "HOC refactor of `<MarketsGrid>`" item in the consolidation plan's §"What gets UNBLOCKED after consolidation" · **Scope:** how consumers get programmatic access to an instance of `<MarketsGrid>` from both React and Angular.

## Decision

- **Drop the HOC refactor.**
- **Adopt:** `forwardRef`-based imperative handle + `onReady` callback convenience alias, exposing a unified `MarketsGridHandle` that wraps AG-Grid's `GridApi` plus our own platform pieces.
- **Angular mirrors via `@ViewChild`** on the component + an `(ready)` `@Output()` EventEmitter emitting the same handle shape.

## Why not HOC

| Concern | HOC | Ref + callback prop |
|---|---|---|
| Angular parity | No equivalent idiom (DI + `@Output()` is Angular-native) | 1:1 mirror via `@ViewChild` + `@Output()` |
| TypeScript ergonomics | Generics-heavy (`forwardRef<Ref, Omit<P, 'x'> & NewProps>`) | Trivial callback / ref types |
| React DevTools | `withX(withY(MarketsGrid))` wrapper noise | Clean single component node |
| Post-hooks idiom | Community moved off HOCs around 2019 | Canonical React answer |
| Prop collisions | Silent when HOC injects and consumer also passes | Impossible — handle is separate from props |
| Matches AG-Grid's own idiom | No | Yes — extends `onGridReady({ api })` |

## What HOC *would* have bought us (nothing that props can't)

| Use case | HOC-free solution |
|---|---|
| Compose with a data source | `dataBinding={{ providerId, key }}` prop (pending data-plane) |
| Module preset bundles | `modules={[...]}` prop |
| Context-aware wiring | Custom hook the consumer calls, or `OpenFinHostContext` via `@marketsui/react` |

No use case for `<MarketsGrid>` HOC survives scrutiny.

## The handle shape

```typescript
// packages/markets-grid/src/types.ts  (NEW export)

export interface MarketsGridHandle {
  /** AG-Grid's GridApi — column manipulation, filters, sort,
   *  export, row selection, pagination, etc. */
  gridApi: GridApi;

  /** Our module-system handle — module state, transforms,
   *  expression evaluation, column templates. */
  platform: GridPlatform;

  /** Profile convenience — load / save / list / clone / delete
   *  the per-gridId profile state. Shortcut for
   *  `platform.getProfileManager()`. */
  profiles: ProfileManager;
}
```

Why one object and not three separate callbacks: **consumers almost always need more than one** (e.g., "apply saved profile then scroll to a row" needs `profiles` + `gridApi`). Bundling keeps the call site compact.

## React API

Both `ref` and `onReady` are supported — same handle, different access style:

```tsx
// Pattern 1 — ref (preferred for imperative access stored for later)
const gridRef = useRef<MarketsGridHandle>(null);

<MarketsGrid
  ref={gridRef}
  gridId="rates-blotter"
  profileId="default"
  /* …existing props… */
/>

// Anywhere later in component lifecycle:
gridRef.current?.gridApi.exportDataAsCsv();
gridRef.current?.profiles.load('monday-layout');

// Pattern 2 — onReady callback (preferred for fire-and-forget wiring)
<MarketsGrid
  gridId="rates-blotter"
  onReady={(handle) => {
    handle.gridApi.setGridOption('suppressCellFocus', true);
    handle.profiles.load('default');
  }}
/>
```

Both patterns point at the **same** handle instance. Internally `<MarketsGrid>` calls `useImperativeHandle(ref, () => handle)` and also invokes `onReady?.(handle)` once AG-Grid + the GridPlatform are both initialized.

### Timing guarantee

`onReady` / `ref.current` is populated exactly once per gridId, **after**:

1. AG-Grid's `onGridReady` has fired
2. `GridPlatform.mount(gridId, api)` has completed
3. The active profile (if any) has been applied

Consumers never observe a partially-initialized handle.

## Angular API (mirror)

```typescript
// packages/markets-grid-angular/src/markets-grid.component.ts  (NEW — part of ANGULAR_PORT)

@Component({
  selector: 'mkt-markets-grid',
  /* … */
})
export class MarketsGridComponent {
  readonly gridId = input.required<string>();
  readonly profileId = input<string | null>(null);

  @Output() readonly ready = new EventEmitter<MarketsGridHandle>();

  // Public method mirroring React's imperative handle — accessed
  // via `@ViewChild('grid').getHandle()`.
  getHandle(): MarketsGridHandle | null { return this._handle; }

  private _handle: MarketsGridHandle | null = null;
}
```

Consumer:

```typescript
// Template
<mkt-markets-grid #grid gridId="rates-blotter" (ready)="onReady($event)" />

// Class
@ViewChild('grid') grid!: MarketsGridComponent;

onReady(handle: MarketsGridHandle) {
  handle.gridApi.setGridOption('suppressCellFocus', true);
  handle.profiles.load('default');
}

exportCsv() { this.grid.getHandle()?.gridApi.exportDataAsCsv(); }
```

Same handle shape across frameworks → widgets that wrap `<MarketsGrid>` (blotter, chart, heatmap) can share behavior via the handle regardless of host framework.

## Affected files (when executed — NOT NOW)

| File | Change |
|---|---|
| `packages/markets-grid/src/types.ts` | Export `MarketsGridHandle` interface |
| `packages/markets-grid/src/MarketsGrid.tsx` | Add `forwardRef` wrapping; `useImperativeHandle` + `onReady` prop |
| `packages/markets-grid/src/index.ts` | Export `MarketsGridHandle` |
| Consumers that currently reach into AG-Grid via refs | No breaking change — existing props untouched; new prop is additive |
| `packages/markets-grid-angular/*` (NEW) | Ship with the handle pattern from day 1; part of ANGULAR_PORT.md Phase 4 |
| `docs/plans/ANGULAR_PORT.md` | Reference this doc from §MarketsGrid section |

## Non-goals

- **No breaking change to existing props.** Ref + `onReady` are additive. Consumers on today's API keep working unchanged.
- **No HOC.** Not shipped. Not a future option — closed decision.
- **No handle-returned-from-hook pattern** (e.g., `useMarketsGrid(gridId)` returning the handle without rendering a grid). That's a different feature — "I want access to a grid's platform state from a sibling component" — and is solved today by the existing `useGridPlatform(gridId)` hook from `@marketsui/core`. Not in scope here.
- **No imperative "re-initialize grid" method on the handle.** Reset behavior flows through props (`gridId` change) or existing ProfileManager methods. Keeps the handle surface small.

## Open questions

1. **Should `onReady` fire again if the user swaps `profileId`?** Current answer: no — only once per mount. Profile switches are reflected on `handle.profiles` without re-invoking the callback. Revisit if anyone needs a `onProfileChanged` surface.
2. **Is `ProfileManager` on the handle redundant** since `platform.getProfileManager()` already exists? Current answer: keep it — 95% of callers reach for profiles and typing `handle.profiles.load('x')` is cheaper than `handle.platform.getProfileManager().load('x')`. The cost of the extra property is ~zero.
3. **Unmount cleanup.** When the component unmounts, the handle's `gridApi` becomes stale (AG-Grid tears down). Should we null-out the ref proactively? React's `useImperativeHandle` already nulls the ref after unmount. Document this — don't over-engineer.

## Cross-references

- [`ANGULAR_PORT.md`](./ANGULAR_PORT.md) — Angular MarketsGrid port uses this handle shape from day 1
- [`DATA_PLANE.md`](./DATA_PLANE.md) — data-plane binding is a separate prop (`dataBinding`), not something that goes through the handle
- Consolidation plan `scalable-moseying-engelbart.md` — "HOC refactor of `<MarketsGrid>`" is **superseded** by this doc; that bullet in §"What gets UNBLOCKED" should be updated to reference this when we next revise

---

# §Storage — opt-in ConfigService-backed persistence

> **Problem.** Today `<MarketsGrid>` saves profile state via localStorage keyed by `gridId`. Users running inside the MarketsUI OpenFin framework have a more robust ConfigService available, but we don't want to force it — a grid should work standalone on a plain web page with zero config.
>
> **Solution.** Swappable `ProfileStorage` adapter prop. Default = local. Opt in by passing a ConfigService-backed adapter.

## Decisions

| Decision | Value |
|---|---|
| Default persistence | `localStorage`-backed adapter shipped with `@marketsui/core` — behavior unchanged from today |
| Opt-in | Consumer passes a `storage` prop on `<MarketsGrid>` (both frameworks) |
| Scope key | `(appId, userId, instanceId)` — all three required on ConfigService |
| `instanceId` resolution | Priority: explicit `instanceId` prop → fallback to `gridId` |
| `userId` source | Baked into the adapter at construction time (closure over user identity) — MarketsGrid never sees userId directly |
| Storage unit | **One row per instance** containing the entire profile set + active id. No fine-grained per-profile rows in v1. |
| Migration local → ConfigService | Explicit helper `migrateProfilesToConfigService({ gridId, instanceId, userId, target })` — opt-in, one-shot. No auto-migration. |
| Offline | Fail loud at the adapter. Composition helper for cache (separate ticket). |
| Role-gated saves | Out of scope v1. |

## Where the seam cuts

```
<MarketsGrid storage={adapter} />
       │
       ▼
   GridPlatform
       │
       ▼
   ProfileManager  ──uses──▶  ProfileStorage (new interface in @marketsui/core)
                                 │
                                 ├─ createLocalStorage()        (default, ships with core)
                                 └─ createConfigServiceStorage(…) (from @marketsui/config-service)
```

`@marketsui/core` owns the `ProfileStorage` interface + local default. `@marketsui/config-service` ships a factory conforming to that contract. **Core does not import config-service** — no layer violation.

## The interface

```typescript
// @marketsui/core/src/profiles/storage.ts  (NEW)

export interface ProfileSnapshot {
  id: string;                         // profile id (e.g., "default", "monday-layout")
  name: string;                       // human-readable name
  createdAt: string;                  // ISO 8601
  updatedAt: string;                  // ISO 8601
  state: unknown;                     // opaque to the adapter; internal to ProfileManager
}

export interface ProfileSet {
  profiles: ProfileSnapshot[];
  activeProfileId: string | null;
}

export interface ProfileStorage {
  /** Load the full profile set for this instance. Returns null if
   *  nothing has been saved yet. */
  load(): Promise<ProfileSet | null>;

  /** Overwrite the full profile set for this instance. The adapter
   *  is responsible for treating this atomically (reads during a write
   *  should see either the old or the new set, never a partial). */
  save(set: ProfileSet): Promise<void>;

  /** Wipe everything for this instance. */
  clear(): Promise<void>;
}
```

Note the adapter is **per-instance** — the adapter's factory closes over `(appId, userId, instanceId)` so the adapter itself has no key parameters. This keeps the interface minimal and prevents accidental cross-instance writes.

```typescript
// Consumer side:
const storage: ProfileStorage = createConfigServiceStorage({
  baseUrl: hostCtx.configServiceUrl,
  appId:   hostCtx.appId,
  userId:  currentUser.id,
  instanceId: hostCtx.instanceId ?? gridId,  // or let MarketsGrid resolve it
});
```

Actually — `instanceId` is `gridId`-dependent and resolved inside MarketsGrid. So the adapter factory can't be fully closed over the key at app-level bootstrap if the same `storage` prop gets reused across multiple grids. Two options:

### Option 1: Adapter is a factory, not an instance (CHOSEN)

The `storage` prop is actually a **factory function** `(instanceId: string) => ProfileStorage`, and MarketsGrid calls it internally with the resolved instanceId:

```typescript
export type ProfileStorageFactory = (instanceId: string) => ProfileStorage;

// Consumer:
const storage: ProfileStorageFactory = createConfigServiceStorage({
  baseUrl: hostCtx.configServiceUrl,
  appId:   hostCtx.appId,
  userId:  currentUser.id,
});

// Same `storage` reused across many grids:
<MarketsGrid gridId="bond-blotter" storage={storage} />
<MarketsGrid gridId="rate-blotter" storage={storage} instanceId="rate-blotter-42" />
```

`createConfigServiceStorage({ appId, userId })` returns a factory. Each grid supplies its own `instanceId`; the factory closes over `appId + userId` and produces a per-instance adapter.

### Option 2: adapter is an instance, one per grid

Consumer constructs a fresh adapter per grid:

```typescript
<MarketsGrid
  storage={createConfigServiceStorage({ baseUrl, appId, userId, instanceId })}
/>
```

More verbose at the call site; easy to get wrong (re-creating on every render).

**Pick: Option 1 (factory).** Consumer creates once, passes everywhere, zero re-renders.

## ConfigService row shape

One `UnifiedConfig` row per `(appId, userId, instanceId)`:

```jsonc
{
  "componentType":    "markets-grid-profile-set",
  "componentSubType": "",                         // unused for profile sets
  "appId":            "tradingApp1",
  "userId":           "alice",
  "configId":         "bond-blotter-instance-42", // === instanceId
  "data": {
    "profiles": [
      { "id": "default",    "name": "Default",    "createdAt": "…", "updatedAt": "…", "state": {/* module state */} },
      { "id": "monday-v2",  "name": "Monday v2",  "createdAt": "…", "updatedAt": "…", "state": {/* module state */} }
    ],
    "activeProfileId": "monday-v2"
  }
}
```

**Why `componentType: 'markets-grid-profile-set'`:** makes it queryable ("all grid profiles for this user") without a table scan. Distinguishes from other config rows (dock, registry, data-provider configs).

**Why the single blob vs per-profile rows:** matches today's localStorage semantics — one read loads everything the grid needs at mount. Per-profile rows would add round-trips and complicate active-profile switching. If fine-grained CRUD ever matters (audit log of individual profile edits, for example), split later.

## `instanceId` resolution inside `<MarketsGrid>`

```typescript
// Inside MarketsGrid.tsx
const effectiveInstanceId = props.instanceId ?? props.gridId;
const storage = props.storage?.(effectiveInstanceId) ?? createLocalStorage(effectiveInstanceId);
```

Two deployment contexts both work without changes at the grid level:

| Context | `instanceId` prop | Effective key |
|---|---|---|
| Framework-hosted (OpenFin) | Passed down from widget that received it via `customData.instanceId` | `(appId, userId, <framework-assigned instanceId>)` |
| Standalone web page | Omitted | `(appId, userId, gridId)` — acts like today's localStorage key |

Widget code (the layer between MarketsGrid and the app):

```tsx
// @marketsui/widgets-react/src/blotter/BondBlotter.tsx
function BondBlotter() {
  const host = useOpenFinHostOrNull();  // null when standalone
  return (
    <MarketsGrid
      gridId="bond-blotter"
      instanceId={host?.instanceId}     // undefined → falls back to gridId
      storage={host?.profileStorage}    // undefined → falls back to local
    />
  );
}
```

## The factory API

```typescript
// @marketsui/config-service — new export

export interface ConfigServiceStorageOptions {
  baseUrl: string;
  appId: string;
  userId: string;
  /** Optional fetch override for auth headers, retries, etc. */
  fetch?: typeof fetch;
}

export function createConfigServiceStorage(
  opts: ConfigServiceStorageOptions,
): ProfileStorageFactory {
  return (instanceId: string): ProfileStorage => ({
    async load()   { /* GET  /configs?componentType=markets-grid-profile-set&appId=&userId=&configId= */ },
    async save(s)  { /* PUT  /configs  { componentType, appId, userId, configId: instanceId, data: s } */ },
    async clear()  { /* DELETE /configs/... */ },
  });
}
```

Local default:

```typescript
// @marketsui/core — new export

export function createLocalStorage(instanceId: string): ProfileStorage {
  const key = `@marketsui/markets-grid/profiles/${instanceId}`;
  return {
    async load()   { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; },
    async save(s)  { localStorage.setItem(key, JSON.stringify(s)); },
    async clear()  { localStorage.removeItem(key); },
  };
}
```

MarketsGrid constructs this internally when no `storage` prop is passed.

## Migration helper

```typescript
// @marketsui/config-service

export async function migrateProfilesToConfigService(params: {
  gridId: string;
  instanceId?: string;        // defaults to gridId
  userId: string;
  target: ReturnType<typeof createConfigServiceStorage>;
  strategy?: 'skip-if-exists' | 'overwrite';  // default 'skip-if-exists'
}): Promise<{ migrated: boolean; reason?: string }> {
  const effectiveInstanceId = params.instanceId ?? params.gridId;
  const localKey = `@marketsui/markets-grid/profiles/${effectiveInstanceId}`;
  const localRaw = localStorage.getItem(localKey);
  if (!localRaw) return { migrated: false, reason: 'no-local-data' };

  const targetAdapter = params.target(effectiveInstanceId);
  const existing = await targetAdapter.load();
  if (existing && params.strategy !== 'overwrite') {
    return { migrated: false, reason: 'target-has-data' };
  }

  await targetAdapter.save(JSON.parse(localRaw));
  return { migrated: true };
}
```

**Consumer-triggered.** No auto-migration on app boot. A trading app that wants to migrate its users writes a small admin UI or one-time script that calls this.

## Offline behavior

- ConfigService unreachable → adapter throws from `load()` / `save()`
- ProfileManager surfaces the error to the MarketsGrid UI (error boundary in ProfileSelector)
- Caller can compose resilience:

```typescript
// Not shipped in v1, but easy to add as a helper later:
function createCachedStorage(
  primary: ProfileStorageFactory,
  fallback: ProfileStorageFactory,
): ProfileStorageFactory { /* tries primary, falls back on error */ }
```

Not in scope for v1 — document the error behavior, let apps compose.

## Non-goals

- **No auto-migration on boot.** Consumer must opt into migration explicitly.
- **No per-profile ConfigService rows.** Whole set is one blob (matches today's local-storage shape).
- **No role-gated saves in v1.** If a read-only user tries to save, the adapter's `save()` will get a 403 and throw. UI handling is a future concern.
- **No offline write queue** inside adapters. Resilience is compositional.
- **No cross-device profile sync coordination.** ConfigService provides it structurally (same user, same appId, same instanceId → same row); MarketsGrid doesn't add anything on top.

## Affected files (when executed — not now)

| File | Change |
|---|---|
| `packages/core/src/profiles/storage.ts` | NEW — `ProfileStorage` interface, `ProfileSet`, `ProfileSnapshot`, `createLocalStorage` factory |
| `packages/core/src/profiles/ProfileManager.ts` | Accept a `ProfileStorage` instance (or factory); use it instead of direct localStorage calls |
| `packages/core/src/index.ts` | Export the new types + `createLocalStorage` |
| `packages/markets-grid/src/MarketsGrid.tsx` | New optional props: `instanceId`, `storage` (ProfileStorageFactory); resolve effectiveInstanceId; wire to ProfileManager |
| `packages/markets-grid/src/types.ts` | Export prop types including `ProfileStorageFactory` |
| `packages/config-service/src/index.ts` | Export `createConfigServiceStorage`, `migrateProfilesToConfigService` |
| `packages/config-service/src/profile-storage.ts` | NEW — factory implementation against `UnifiedConfig` REST API |
| `packages/markets-grid-angular/*` | Mirror when the Angular port lands (per ANGULAR_PORT) |
| `e2e/v2-profile-storage.spec.ts` | NEW — two scenarios: local default, ConfigService opt-in (against a mocked server) |
| `docs/IMPLEMENTED_FEATURES.md` | Add a note for "Profile storage: swappable adapter (local default, ConfigService opt-in)" |

## Consumer guide (summary for docs)

Three scenarios a team might be in:

1. **Standalone web page, no ConfigService.** Do nothing. Grid works as today. Profiles stored in localStorage keyed by gridId.
2. **Framework-hosted, want robust storage.** At app bootstrap after auth:
   ```ts
   const storage = createConfigServiceStorage({ baseUrl, appId, userId: user.id });
   ```
   Pass `storage` into every `<MarketsGrid>` (or have your widget wrapper do it). Grid now persists to ConfigService scoped by `(appId, userId, instanceId)`.
3. **Migrating an existing localStorage deployment to ConfigService.** Build a one-time admin action that calls `migrateProfilesToConfigService(...)` for each known (gridId, user) pair. Ship it once, remove it after the migration window closes.

