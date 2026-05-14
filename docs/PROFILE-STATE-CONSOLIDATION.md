# Profile state consolidation — design

> Audit + plan for Refactor 3 of [`docs/WORKLOG-DEFERRED-REFACTORS.md`](./WORKLOG-DEFERRED-REFACTORS.md).
> The next two sessions (3.2 and 3.3) implement what this doc specifies.

---

## TL;DR for the next agent

The worklog framed this refactor as "ProfileManager owns one Dexie DB,
ConfigManager owns another, collapse them into one." The audit found
that the consolidation seam **already exists** and most of the
plumbing is already shipped:

- `ProfileManager` does **not** own storage. It takes a pluggable
  `StorageAdapter` and orchestrates everything else (active-id pointer,
  auto-save, dirty tracking, ordering contracts, clone/rename/import
  semantics, expression-policy gate).
- `@starui/config-service` already exports a
  [`createConfigServiceStorage(configManager)`](../packages/shared/services/config-service/src/profileStorage.ts)
  factory — a `StorageAdapter` implementation that bundles every
  profile for an `(appId, userId, instanceId)` tuple into a **single**
  `AppConfigRow` (componentType `markets-grid-profile-set`, or the
  registered identity's componentType when one is supplied).
- `@starui/config-service` already exports
  [`migrateProfilesToConfigService(...)`](../packages/shared/services/config-service/src/profileStorage.ts) —
  a one-shot helper that copies rows from any `StorageAdapter`
  (e.g. the legacy `DexieAdapter`) into the bundled ConfigService row.
- `<ConfigServiceProvider>` already constructs both the manager AND
  the storage factory and exposes them via context.
- `useHostedIdentity` (used by `<HostedMarketsGrid>`) already wraps
  the factory with the per-component `RegisteredComponentIdentity`.

So **the consolidation work is not "rewrite ProfileManager as a
façade and delete it."** It is:

1. **Make the ConfigService-backed factory the default** for every
   path that constructs a `ProfileManager`. Today
   [`useMarketsGridController`](../packages/react/widgets/markets-grid/src/useMarketsGridController.ts)
   falls back to `new MemoryAdapter()` when the consumer doesn't pass
   storage; the new default should be
   `createConfigServiceStorage(useHost().configManager)` when a host
   is reachable.
2. **Wire a first-boot migration** that reads any rows still sitting
   in the legacy `gc-customizer-v2` Dexie DB (the `DexieAdapter`'s
   database) and copies them into the ConfigService bundled row via
   the existing helper. Idempotent via a `profile-migration-v1` flag.
3. **Migrate the remaining hand-wired `DexieAdapter` consumer**
   (`apps/demo-react`) onto the Provider path.
4. **Add a `subscribe` surface on `ConfigManager.profiles.*`** so
   multi-tab / multi-window invalidation becomes possible (today
   ProfileManager's `subscribe` only fans out within its own
   in-memory listeners; concurrent edits from another tab don't
   notify).
5. **Then** evaluate whether `DexieAdapter` and the standalone
   `MemoryAdapter` fallback can be removed from `@starui/core` (a
   small, mechanical follow-up — Session 3.3).

The worklog's "delete `ProfileManager.ts`" step (Session 3.3) is
**revised out**. ProfileManager stays — it owns ~850 LOC of
ordering-contract code that the audit symptoms (phantom profiles
on delete, save-races, StrictMode double-mount) directly depend on.
What gets deleted is the legacy `DexieAdapter` and the per-app
hand-wiring that keeps it alive.

---

## Current state

### Storage paths

| | ProfileManager via DexieAdapter | ProfileManager via createConfigServiceStorage |
|---|---|---|
| Dexie DB name | `gc-customizer-v2` | `marketsui-config` |
| Table name | `profiles` | `appConfig` |
| Primary key | `pk = "${gridId}::${id}"` | `configId = instanceId` |
| One-row-per | profile | (gridId, instanceId) bundle of all profiles |
| Discriminator | (none — DB is profile-only) | `componentType = "markets-grid-profile-set"` (or registered identity) |
| Visibility filter | (none) | `isVisible(row, { appId, effectiveUserId })` |
| REST sync | no | yes when `configServiceRestUrl` set |
| Pending-write queue | no | yes (`pendingSync` table, 10 s drain, 10-retry cap) |
| Optimistic locking | no | yes (`ProfileSetVersionConflictError` on payload version mismatch; `If-Match` header in REST mode) |
| Active-profile pointer | localStorage `gc-active-profile:${gridId}` | same (pointer is independent of storage) |
| Owner / audit fields | none on row | `userId` (owner) + `createdBy` / `updatedBy` / `creationTime` / `updatedTime` |
| Visible in ConfigBrowser | no (separate DB) | yes (rows show in the popout) |

The Dexie databases are **different**. Migrating from the legacy
DexieAdapter to ConfigService is a one-shot **copy** (rows from one
DB read into the other), not an in-place transform.

`LocalStorageBundleAdapter` is a third path — used by the offline
`apps/markets-ui-react-reference` mode. It stays as-is; it's the
"no IndexedDB, no backend" tier.

### ProfileManager API (the orchestration surface)

[`ProfileManager`](../packages/shared/core/src/profiles/ProfileManager.ts)
is a class. Per-grid singleton enforced by
[`useProfileManager`](../packages/react/widgets/grid-react/src/hooks/useProfileManager.ts)
via a `WeakMap<GridPlatform, ProfileManager>`.

| Method | What it does | Non-obvious detail |
|---|---|---|
| `boot()` | Ensures Default exists; resolves active id from `activeIdSource` → localStorage → Default; hydrates store; wires auto-save or dirty tracker | Idempotent. Re-checks `disposed` after every `await` to avoid leaking subscriptions on the shared store after StrictMode double-mount. |
| `save()` | Flushes pending auto-save then explicitly persists | Clears `isDirty` on success |
| `discard()` | Re-loads active profile from disk, throws away in-memory edits | |
| `load(id, opts?)` | Switches active profile | Ordering contract — flush → flip pointer BEFORE `resetAll`+`deserializeAll` → cancelScheduled. Bug from skipping this: state leaks into the wrong snapshot |
| `create(name, opts?)` | New profile seeded from module defaults | 4-step ordering avoids the "phantom profile on create" bug |
| `clone(sourceId, name, opts?)` | Duplicate; activates clone | Clone-from-active captures live state (incl. pending edits); clone-from-other captures snapshot on disk |
| `remove(id)` | Delete; falls back to Default | 4-step ordering avoids "phantom profile resurrects on delete" |
| `rename(id, name)` | Update `name` field | |
| `export(id?)` | Build `ExportedProfilePayload` | Flushes auto-save first |
| `import(payload, opts?)` | Validate payload, apply `getExpressionPolicy()` gate, additive insert | Strict mode rejects expression-formatter payloads unless `sanitize: true` |
| `subscribe(fn)` | In-process listener on internal state | Returns unsubscribe; used by `useSyncExternalStore` |
| `getState()` | Sync read | `{ activeId, profiles, isLoading, isDirty }` |
| `dispose()` | Tear down auto-save + listeners | |

`ProfileManager` knows about: the active-id pointer (localStorage +
optional `ActiveIdSource`), the `GridPlatform` event bus
(`profile:loaded` / `profile:saved` / `profile:deleted`), the
`autosave` engine, the expression policy. None of those are storage
concerns.

### Storage Adapter contract

[`StorageAdapter`](../packages/shared/core/src/persistence/StorageAdapter.ts)
is the seam. Five methods (last two optional):

```ts
loadProfile(gridId, profileId): Promise<ProfileSnapshot | null>
saveProfile(snapshot): Promise<void>
deleteProfile(gridId, profileId): Promise<void>
listProfiles(gridId): Promise<ProfileSnapshot[]>
loadGridLevelData?(gridId): Promise<unknown | null>     // opaque blob persisted alongside profiles
saveGridLevelData?(gridId, data): Promise<void>
```

Implementations:

| Class | DB | Use today |
|---|---|---|
| `MemoryAdapter` | `Map<string, ProfileSnapshot>` | tests + `useMarketsGridController`'s no-storage fallback |
| `DexieAdapter` | `gc-customizer-v2` table `profiles` | `apps/demo-react/src/App.tsx` (legacy demo) |
| `LocalStorageBundleAdapter` | `localStorage["markets-grid-bundle:${gridId}"]` | `markets-ui-react-reference` offline mode |
| factory from `createConfigServiceStorage(configManager)` | bundled into `AppConfigRow` of `marketsui-config.appConfig`, keyed by `configId = instanceId` | `<HostedMarketsGrid>`, `<ConfigServiceProvider>`, `apps/demo-configservice-react`, Angular tools |

### ProfileSnapshot vs AppConfigRow

`ProfileSnapshot` (defined in
[`StorageAdapter.ts`](../packages/shared/core/src/persistence/StorageAdapter.ts) —
NOT in `profiles/types.ts`, the worklog got that wrong) is the unit
of profile data. The bundled storage groups N snapshots into ONE
`AppConfigRow.payload` shaped as
`{ version: number, profiles: ProfileSnapshot[], gridLevelData?: unknown }`.

| Field | ProfileSnapshot | Carried inside AppConfigRow how |
|---|---|---|
| `id` | string | `payload.profiles[i].id` |
| `gridId` | string | `payload.profiles[i].gridId` (rewritten to `instanceId` at `migrateProfilesToConfigService`) |
| `name` | string | `payload.profiles[i].name` |
| `state` | `Record<string, SerializedState>` | `payload.profiles[i].state` |
| `createdAt` | number ms | `payload.profiles[i].createdAt` |
| `updatedAt` | number ms | `payload.profiles[i].updatedAt` |
| (active-profile pointer) | localStorage, NOT on the snapshot | localStorage, NOT on the row |
| (gridLevelData) | adapter-level via `loadGridLevelData?` | `payload.gridLevelData` |

**No shape divergence.** `ProfileSnapshot` round-trips byte-equivalently
through the bundled adapter. The translation happens entirely inside
`createConfigServiceStorage` — `ProfileManager` never sees an
`AppConfigRow`.

### ProfileManager consumer inventory

Only files that **use** `ProfileManager` at the value level (constructors,
methods, hooks). Re-exports and pure type-only imports are listed
separately so the action set is obvious.

| File | Methods called | Subscription pattern |
|---|---|---|
| [`packages/shared/core/src/profiles/ProfileManager.test.ts`](../packages/shared/core/src/profiles/ProfileManager.test.ts) | all of them | direct `.subscribe()` |
| [`packages/react/widgets/grid-react/src/hooks/useProfileManager.ts`](../packages/react/widgets/grid-react/src/hooks/useProfileManager.ts) | `new ProfileManager(opts)`, `boot, subscribe, getState, load, save, discard, create, clone, remove, rename, export, import, dispose` | `useSyncExternalStore` over `subscribe` |
| [`packages/react/widgets/markets-grid/src/useMarketsGridController.ts`](../packages/react/widgets/markets-grid/src/useMarketsGridController.ts) | `useProfileManager(...)` (the React hook) | indirect via hook |
| [`packages/react/widgets/markets-grid/src/MarketsGridHost.tsx`](../packages/react/widgets/markets-grid/src/MarketsGridHost.tsx) | reads `profiles` field from controller | indirect |
| [`packages/react/widgets/markets-grid/src/PrimaryToolbar.tsx`](../packages/react/widgets/markets-grid/src/PrimaryToolbar.tsx) | reads `profiles` from props | indirect |

**Re-exports** (no migration impact):
[`packages/shared/core/src/index.ts`](../packages/shared/core/src/index.ts),
[`packages/shared/core/src/profiles/index.ts`](../packages/shared/core/src/profiles/index.ts),
[`packages/react/widgets/grid-react/src/hooks/index.ts`](../packages/react/widgets/grid-react/src/hooks/index.ts),
[`packages/react/widgets/grid-react/src/index.ts`](../packages/react/widgets/grid-react/src/index.ts).

**Type-only imports**:
[`profileStorage.ts`](../packages/shared/services/config-service/src/profileStorage.ts) (uses `ProfileSnapshot`/`StorageAdapter` from `@starui/core` as a peer dep),
[`security/expressionPolicy.ts`](../packages/shared/core/src/security/expressionPolicy.ts),
[`MarketsGrid.characterisation.test.tsx`](../packages/react/widgets/markets-grid/src/MarketsGrid.characterisation.test.tsx),
[`marketsGrid.caption.test.tsx`](../packages/react/widgets/markets-grid/src/marketsGrid.caption.test.tsx),
[`MarketsGrid.devwarning.test.tsx`](../packages/react/widgets/markets-grid/src/MarketsGrid.devwarning.test.tsx),
[`EditableCaption.tsx`](../packages/react/widgets/markets-grid/src/EditableCaption.tsx),
[`openfinViewProfile.ts`](../packages/react/widgets/markets-grid/src/openfinViewProfile.ts),
[`markets-grid/src/types.ts`](../packages/react/widgets/markets-grid/src/types.ts),
[`apps/demo-react/src/showcaseProfile.ts`](../apps/demo-react/src/showcaseProfile.ts),
[`apps/demo-configservice-react/src/showcaseProfile.ts`](../apps/demo-configservice-react/src/showcaseProfile.ts).

### Storage-adapter constructors (where physical wiring happens)

This is the small set of files that actually pick a storage backend.
Session 3.2 / 3.3 work concentrates here.

| File | Adapter chosen | Notes |
|---|---|---|
| [`apps/demo-react/src/App.tsx`](../apps/demo-react/src/App.tsx) (line 175) | `new DexieAdapter()` | The lone remaining hand-wired legacy consumer. Migrates in 3.3. |
| [`apps/demo-react/src/Dashboard.tsx`](../apps/demo-react/src/Dashboard.tsx) (line 40) | `new DexieAdapter()` | Same demo; same migration. |
| [`apps/markets-ui-react-reference/src/main.tsx`](../apps/markets-ui-react-reference/src/main.tsx) | `DexieAdapter` (mentioned in copy; verify in 3.3) | Offline reference app — may keep `LocalStorageBundleAdapter` instead of moving to ConfigService. Decide in 3.3. |
| [`apps/demo-configservice-react/src/App.tsx`](../apps/demo-configservice-react/src/App.tsx) (line 326) | `createConfigServiceStorage({ configManager })` | Already on the canonical path. |
| [`packages/react/providers/config-service-react/src/ConfigServiceProvider.tsx`](../packages/react/providers/config-service-react/src/ConfigServiceProvider.tsx) (line 108) | `createConfigServiceStorage({ configManager: manager })` | Bootstrap that hands `storage` through context. |
| [`packages/react/widgets/widgets-react/src/hosted/useHostedIdentity.ts`](../packages/react/widgets/widgets-react/src/hosted/useHostedIdentity.ts) (line 238) | `createConfigServiceStorage({ configManager: resolvedConfigManager })` then wrapped per `RegisteredComponentIdentity` | Per-component identity stamp on every write. |
| [`packages/angular/providers/config-service-angular/src/ConfigServiceClient.ts`](../packages/angular/providers/config-service-angular/src/ConfigServiceClient.ts) (line 55) | `createConfigServiceStorage(...)` | Angular parity. |
| [`packages/react/widgets/markets-grid/src/createMarketsGridLocalStorageStorage.ts`](../packages/react/widgets/markets-grid/src/createMarketsGridLocalStorageStorage.ts) | `new LocalStorageBundleAdapter(gridId)` | Offline factory; stays. |
| [`packages/react/widgets/markets-grid/src/useMarketsGridController.ts`](../packages/react/widgets/markets-grid/src/useMarketsGridController.ts) (line 99) | `new MemoryAdapter()` (fallback when consumer didn't pass storage) | Becomes `createConfigServiceStorage(useHost().configManager)` in 3.2 if a host is reachable, else stays MemoryAdapter for tests. |

### ConfigManager / ConfigClient consumer inventory

Pre-existing consumers, summarized to set the surrounding context for
the new `subscribe` surface added in 3.2. Full list is too long to
table; the categories are:

- **Bootstrap providers**: `<ConfigServiceProvider>` (React),
  `provideConfigService(...)` (Angular). Construct manager + storage
  factory + expose via context.
- **Host context shim**:
  [`HostContext.ts`](../packages/react/hosts/host-wrapper-react/src/HostContext.ts)
  exposes `configManager: ConfigClient` (the new forward-looking
  interface — `ConfigManager` itself is `@deprecated` per Decision 13
  of `config-manager-redesign.md` and is being collapsed behind
  `LocalConfigClient`).
- **Hosted widgets**: `useHostedIdentity` resolves the manager lazily
  and constructs the per-component storage factory.
- **Workspace persistence**: `openfin-platform/workspacePersistence.ts`
  reads/writes workspace snapshots through `ConfigManager.saveSnapshot`
  / `getSnapshot` / `getLatestSnapshot` (uses a different
  `componentType`: `WORKSPACE_SNAPSHOT`).
- **Component-host**: `services/component-host/saveConfig.ts` writes
  arbitrary component config rows.
- **Admin UI**: `<ConfigBrowser>` reads via the manager directly to
  build the admin grid.
- **Apps**: every demo app constructs (or is given) a manager.

**Where the same data is read from both** — there is no row that's
read from both ConfigManager AND ProfileManager today. Profile rows
live in EITHER `gc-customizer-v2` (when `DexieAdapter` is used) OR
`marketsui-config` (when `createConfigServiceStorage` is used) but
never both. The duplication this refactor closes is **between
storage backends**, not between read paths.

The audit's "ProfileManager state invisible to ConfigManager auditing"
symptom is real for the legacy demo (`apps/demo-react`) and gone for
the hosted widgets path. Closing the loop = moving every consumer
onto the ConfigService factory.

### Failure-mode parity

`ProfileManager` is the orchestration layer; the failure-mode
comparison that matters is **the StorageAdapter implementations**.

| Capability | DexieAdapter | createConfigServiceStorage | Notes |
|---|---|---|---|
| save | ✓ | ✓ | bundled adapter is read-modify-write on the row |
| list | ✓ | ✓ | |
| delete | ✓ | ✓ | bundled adapter filters out by id |
| load (single) | ✓ | ✓ | |
| loadGridLevelData | ✗ (not implemented) | ✓ | `DexieAdapter` doesn't store grid-level data — that path silently no-ops today |
| saveGridLevelData | ✗ | ✓ | same |
| Cross-tab notify on save | ✗ | ✗ | **GAP** — neither has this. ProfileManager.subscribe is in-process only |
| Pending-write queue (REST) | n/a (no REST) | ✓ (`pendingSync`) | gained when consumers move to ConfigService |
| Optimistic concurrency | ✗ | ✓ (`ProfileSetVersionConflictError`, `If-Match`) | gained on migration |
| Owner / audit stamping | ✗ | ✓ (`stampWrite`) | gained on migration |
| Visibility filter | ✗ | ✓ (`isVisible(row, ctx)`) | gained on migration |

The `ProfileManager` orchestration surface itself (clone, rename,
export, import, subscribe, getState, dispose) is **storage-agnostic**
and works identically against any adapter. Nothing on the
orchestration side has a parity gap.

The cross-tab notify gap is the one new piece worth adding in 3.2 —
see "New surface on ConfigManager.profiles" below.

---

## Target state

Single source of truth = **the ConfigService row**
(`AppConfigRow` of `marketsui-config.appConfig`, keyed by
`configId = instanceId`, with payload shape
`{ version, profiles, gridLevelData? }`).

Single read/write path = **the existing
`createConfigServiceStorage(configManager)` factory** plugged into
the existing `ProfileManager` class.

`ProfileManager` stays. `useProfileManager` stays. `useHost()` stays.
The diff is in the wiring: the default storage everywhere becomes the
ConfigService factory.

### New surface on ConfigManager (added in Session 3.2)

A small `profiles` namespace that wraps the same reads/writes the
factory does, plus a multi-tab-aware subscription. Same Dexie row
under the hood — no schema change.

```ts
// On ConfigManager (or LocalConfigClient when the migration to
// ConfigClient is further along)
configManager.profiles = {
  list(scope: { instanceId: string; appId?: string; userId?: string })
    : Promise<readonly ProfileSnapshot[]>;
  save(scope, snapshot: ProfileSnapshot): Promise<void>;
  delete(scope, profileId: string): Promise<void>;
  loadGridLevelData(scope): Promise<unknown | null>;
  saveGridLevelData(scope, data: unknown): Promise<void>;

  /** Fires whenever the `marketsui-config.appConfig` row for `scope`
   *  changes — including writes from another tab in the same origin.
   *  Backed by a `BroadcastChannel('marketsui-config-changes')` that
   *  ConfigManager.saveConfig publishes on every successful write.
   *  No-op fallback in environments without BroadcastChannel. */
  subscribe(scope, fn: () => void): () => void;
};
```

Why this surface (rather than just exporting the factory more
prominently): it's the path that `ProfileManager.boot()` will use
internally so concurrent edits from another tab can fan out to every
mounted hook. Today only the in-process `ProfileManager.subscribe`
fires; another tab saving a profile is invisible until the next mount.

The factory `createConfigServiceStorage` stays — it's the
StorageAdapter binding. The new surface is consumed only by the
internal subscription wiring inside `ProfileManager` (or, in
later refactors, by component-side hooks that don't go through
ProfileManager at all).

### Storage decision

**Chosen: ratify the existing decision — bundled
`AppConfigRow` per `(appId, userId, instanceId)` with payload
`{ version, profiles, gridLevelData? }`.**

This is what `createConfigServiceStorage` already does. Why this
beats the worklog's hypothetical "Option A vs B":

- **No new Dexie table.** ConfigManager still owns one table
  (`appConfig`). Profile rows are discriminated by
  `payload.profiles[]` shape (or by the legacy `componentType` value
  when no registered identity is supplied).
- **One read = one row.** Switching profiles, listing, hydrating —
  every operation is a single `getConfig(rowId)`. No client-side
  filtering across the whole user's config.
- **Pre-existing.** It's already shipping in `demo-configservice-react`
  and via `<HostedMarketsGrid>`. Profile-set rows already render in
  `<ConfigBrowser>` exactly as desired (one row per `(appId, userId,
  instanceId)`).
- **Per-instance scoping is already correct.** Two duplicated views of
  the same `componentType` get separate rows because they get separate
  `instanceId`s — survives workspace save/restore round-trips.
- **Identity-bound `componentType`.** When the registered component
  supplies `RegisteredComponentIdentity`, the row carries the
  registered type (e.g. `'blotter'`) instead of the legacy
  `'markets-grid-profile-set'` placeholder — Config Browser entries
  match the Registry Editor entries.
- **Already has optimistic concurrency.** Two-tab race detection via
  `ProfileSetVersionConflictError` + `If-Match` on REST.

The hypothetical alternatives the worklog asked us to choose between
("dedicated profiles table" vs "reuse appConfig with category
discriminator") are both worse than the shipped design — a dedicated
table doubles the schema surface for no read-pattern win, and a
plain-discriminator approach would lose the "one row per instance"
property that makes `<ConfigBrowser>` legible.

### Active-profile pointer — stays in localStorage

The pointer lives in `localStorage["gc-active-profile:${gridId}"]`
plus an optional `ActiveIdSource` injected by the host (OpenFin views
use `customData.activeProfileId`). This is already cross-storage-
agnostic — nothing about consolidation changes here.

Reason: the pointer is a per-window concept (a duplicated view should
be able to show a different profile of the same instance), so it
deliberately sits OUTSIDE the shared row. Moving it into the
ConfigService row would break workspace-save round-trip in OpenFin.

---

## Migration plan

### Trigger

`ConfigServiceProvider.tsx` runs the migration ONCE on first
successful manager init, after `init()` resolves. Idempotent via a
`profile-migration-v1` flag in `localStorage`.

```ts
// Pseudocode, lands in 3.2
async function migrateLegacyProfilesIfNeeded(manager: ConfigManager) {
  if (localStorage.getItem('profile-migration-v1') === 'done') return;
  if (typeof indexedDB === 'undefined') return;
  // Open the legacy DB read-only; bail silently if it doesn't exist.
  const legacy = await openLegacyGcCustomizerV2().catch(() => null);
  if (!legacy) {
    localStorage.setItem('profile-migration-v1', 'done');
    return;
  }
  try {
    const allRows: DbRow[] = await legacy.profiles.toArray();
    if (allRows.length === 0) {
      localStorage.setItem('profile-migration-v1', 'done');
      return;
    }
    // Group by gridId. For each (gridId), call the existing
    // migrateProfilesToConfigService() helper with strategy:
    // 'skip-if-exists' so a user who's already booted on ConfigService
    // and has rows there doesn't lose those.
    const byGridId = groupBy(allRows, r => r.gridId);
    for (const [gridId, rows] of Object.entries(byGridId)) {
      await migrateProfilesToConfigService({
        source: makeSourceFromRows(rows),
        target: createConfigServiceStorage({ configManager: manager }),
        gridId,
        instanceId: gridId,        // legacy paths use gridId === instanceId
        appId: manager.getAppId(),
        userId: manager.getIdentity().userId,
        strategy: 'skip-if-exists',
      });
    }
  } finally {
    localStorage.setItem('profile-migration-v1', 'done');
    legacy.close();
    // Note: we do NOT delete the legacy DB. Two reasons:
    //   1. If the user rolls back to a previous build, their profiles
    //      are still there.
    //   2. A separate cleanup PR (post-3.3) can delete the legacy DB
    //      after a soak period.
  }
}
```

### What gets copied

For each `gridId` found in `gc-customizer-v2.profiles`:

1. Build an in-memory `StorageAdapter` adapter that wraps the
   already-fetched rows (so we don't re-open the legacy DB N times).
2. Call `migrateProfilesToConfigService({ source, target, gridId,
   instanceId: gridId, appId, userId, strategy: 'skip-if-exists' })`.
3. The helper rewrites each snapshot's `gridId` to `instanceId` (in
   the legacy path they're identical, so this is a no-op) and writes
   into the bundled row, preserving any `gridLevelData` that already
   exists in the target.

### Idempotency

- The flag is set in a `finally` block, so a partial / failed
  migration still flips the flag — we do NOT retry forever and lose
  user time on every cold boot. The legacy DB is not deleted, so a
  follow-up PR can re-run the migration with a different flag name
  if a bug shows up.
- `strategy: 'skip-if-exists'` ensures that re-runs with stale source
  rows do not overwrite newer ConfigService data.
- Running on a device with no legacy DB sets the flag immediately and
  exits — first-time users on ConfigService pay no migration cost.

### Why migration runs in `<ConfigServiceProvider>` (not in ProfileManager.boot)

`ProfileManager.boot()` runs per-grid; the migration is per-app. The
bootstrap-once-at-app-startup placement avoids racing N migrations
against each other when N grids mount simultaneously, and it places
the legacy-DB knowledge in the bootstrap layer rather than spreading
it through the orchestration layer.

### Risk: profile loss

The 2-PR merge rule is **less load-bearing than the worklog
suggested** because we are not deleting `ProfileManager` and not
breaking the existing `DexieAdapter` consumer wiring in 3.2 —
migration runs alongside the legacy path during the soak period.

That said, the 2-PR rule still applies for the `DexieAdapter` removal
in 3.3:

- 3.2 ships the migration trigger AND the new `subscribe` surface.
  Every ConfigService-backed app gets the migration on next boot.
  The `DexieAdapter` consumer wiring (`apps/demo-react`) stays
  intact, but the migration runs there too because `apps/demo-react`
  also has a `<ConfigServiceProvider>` (verify in 3.2 — if it does
  NOT, 3.2 must add one).
- 3.3 deletes the `DexieAdapter` import + class and removes the
  `gc-customizer-v2` Dexie schema, after enough soak time that
  every active user has booted at least once on the migration.

If a user device misses the soak window: the legacy DB is still on
disk (we didn't delete it), and we can ship a 3.4 hotfix that
opens it read-only and runs the migration again under a different
flag name. The cost of the 2-PR rule is one extra release boundary
— the cost of skipping it is unrecoverable profile loss for any user
who never booted between 3.2 and 3.3.

---

## Session 3.2 work (preview)

**Branch:** `feat/profile-state-3-2-configservice-default`

1. **Add `configManager.profiles.*`** namespace on
   `ConfigManager` (and matching surface on `LocalConfigClient` /
   `ConfigClient`). Methods:
   - `list(scope)` — read the bundled row's `payload.profiles`.
   - `save(scope, snapshot)` — read-modify-write the bundle; emit on
     the `BroadcastChannel`.
   - `delete(scope, profileId)` — remove from bundle; emit.
   - `loadGridLevelData(scope)` / `saveGridLevelData(scope, data)` —
     mirror the StorageAdapter optional methods.
   - `subscribe(scope, fn)` — wrap a `BroadcastChannel('marketsui-
     config-changes')` listener. No-op when `BroadcastChannel` is
     undefined (Node test envs).
   - These methods reuse the existing `createConfigServiceStorage`
     read/save logic — extract the inner `loadSet` / `saveSet` into a
     shared helper so we don't duplicate version-handling.

2. **Plumb the BroadcastChannel emit on `ConfigManager.saveConfig` /
   `deleteConfig`.** Single line — every successful write posts the
   `configId` so subscribers can refetch.

3. **Wire `ProfileManager` to subscribe** to
   `configManager.profiles.subscribe(scope, …)` when its
   `StorageAdapter` is the ConfigService one. On notify, refresh the
   profile list AND, if the active profile id changed externally,
   reload the snapshot. The detection happens via a brand on the
   adapter (or a runtime `instanceof ConfigServiceStorageAdapter`
   check; design choice for 3.2).

4. **Add the migration trigger** to `<ConfigServiceProvider>`
   (and equivalent in Angular). Implementation as in "Migration
   plan" above. Emits a `console.info` line with the row count on
   success.

5. **Switch `useMarketsGridController`'s storage default** from
   `new MemoryAdapter()` to `createConfigServiceStorage(useHost().
   configManager)` when a host is reachable via `useHost()`. Falls
   back to `MemoryAdapter` if `useHost` throws (e.g. tests, hosted
   shell-less mounts). Verify: `MarketsGrid.characterisation.test.tsx`
   stays green — the test expectations may need a tiny update for the
   default-storage swap, but the **call sequences** to
   `profileManager.*` must not change.

6. **Tests** — new file
   `packages/shared/services/config-service/src/configManager.profiles.test.ts`:
   - `profiles.save` round-trips through `profiles.list`.
   - `profiles.delete` removes the row from the bundle, leaves
     siblings intact.
   - `profiles.subscribe` fires on save in the same tab.
   - `profiles.subscribe` fires on save from a sibling
     `ConfigManager` instance (simulates two-tab via two managers
     sharing the BroadcastChannel).
   - Migration helper inside the Provider — happy path, idempotent
     re-run, missing-legacy-DB no-op.
   - Optimistic concurrency error still propagates to the caller.

7. **No production behaviour change visible to the user.** Existing
   apps continue to work. New consumers gain offline-tolerance,
   audit, visibility, multi-tab sync.

8. **Verify** (per the worklog's required gate):
   - `npm test -w @starui/config-service` — new + existing pass
   - `npm test -w @starui/core` — `ProfileManager.test.ts` unchanged
   - `npm test -w @starui/markets-grid` — characterisation tests pass
   - `npm test -w @starui/grid-react` — pass
   - E2E: `npx playwright test e2e/v2-two-grid-isolation.spec.ts
     e2e/design-system-smoke.spec.ts` — 5/5
   - **Final gate:** `npx turbo typecheck build test` — green across
     every workspace package
   - Dev server smoke for `demo-configservice-react`: boot once,
     migration runs silently (or no-ops if the legacy DB doesn't
     exist on the dev machine); save a profile; reload; profile
     persists; ConfigBrowser popout shows the row.
   - Dev server smoke for `demo-react`: same flow. If the migration
     code path activates (legacy DB present from a previous run),
     the rows appear in the ConfigBrowser AFTER the first boot on
     this PR.

**Out of scope for 3.2:**
- Removing `DexieAdapter` (that's 3.3).
- Removing the hand-wired `apps/demo-react` storage construction
  (that's 3.3 — leaves the path active during the soak window).
- Removing the legacy Dexie DB at runtime (separate post-3.3 PR).
- Changing any public type — `ProfileSnapshot`, `StorageAdapter`,
  `ProfileManager` all keep current shape.
- Changing `LocalStorageBundleAdapter` — separate offline tier, stays.

---

## Session 3.3 work (preview)

**Branch:** `feat/profile-state-3-3-remove-legacy-adapters`

**Prerequisite:** 3.2 merged AND a soak period of at least one full
release boundary so every active user has booted on the migration.

1. **Switch `apps/demo-react/src/App.tsx` and
   `apps/demo-react/src/Dashboard.tsx`** to consume `storage` from
   `useHost()` (after wrapping the demo in `<ConfigServiceProvider>`
   if it isn't already). Delete the local `new DexieAdapter()`
   constructions.

2. **Decide on `apps/markets-ui-react-reference`.** If it currently
   uses `DexieAdapter`, switch to `LocalStorageBundleAdapter` or
   `createConfigServiceStorage` based on whether the reference app
   is meant to demo offline-without-IndexedDB or offline-with-
   ConfigService. Read first; decide in the PR.

3. **Delete `packages/shared/core/src/persistence/DexieAdapter.ts`.**
   Drop the corresponding export from
   `packages/shared/core/src/persistence/index.ts` and
   `packages/shared/core/src/index.ts`. Update any test that
   constructs `DexieAdapter` directly to use `MemoryAdapter` or a
   ConfigService-backed mock.

4. **Optionally drop the `MemoryAdapter` fallback** in
   `useMarketsGridController` if 3.2's `useHost()`-aware default
   makes it dead. Keep it if tests still hit the fallback.

5. **Update docs:** `docs/ARCHITECTURE.md` storage section,
   `docs/IMPLEMENTED_FEATURES.md` profile-state row.

6. **Verify:**
   - Every test suite — green
   - E2E full regression (`npx playwright test`)
   - Dev server smoke on every app (demo-react, demo-configservice-
     react, markets-ui-react-reference): open profile, edit, save,
     switch profile, clone, rename, export, import — every
     interaction identical.
   - **Final gate:** `npx turbo typecheck build test` — green
   - `wc -l` net change: should be **negative** (DexieAdapter is
     ~64 LOC; the `<ConfigServiceProvider>` wrapping in apps adds
     a few lines back).

**Out of scope for 3.3:**
- Deleting `ProfileManager.ts`. **Revised from worklog.** It stays —
  the orchestration code is load-bearing and storage-agnostic.
- Renaming `ProfileSnapshot`, `AppConfigRow`, or any other widely-
  imported type.
- Touching the `LocalStorageBundleAdapter` orchestration tier.
- Deleting the legacy `gc-customizer-v2` Dexie DB at runtime
  (separate post-3.3 hygiene PR after a longer soak).

---

## Risk list

Concrete e2e scenarios that could regress when 3.2 / 3.3 ship:

1. **Profile switch round-trip** — load profile A, edit columns,
   save, switch to profile B, switch back to A. State must restore
   identically. (Hits `load()` + `save()` ordering contracts.)
2. **Hard reload after save** — save profile, reload page, profile
   appears in picker AND its state hydrates correctly. (Hits boot
   + `listProfiles` + `loadProfile`.)
3. **ConfigBrowser visibility** — open the ConfigBrowser popout in
   `demo-react` (after 3.2's migration runs). Profile rows that
   were previously invisible (legacy `gc-customizer-v2`) now show
   under componentType `markets-grid-profile-set` or the registered
   identity's componentType. **NEW behaviour — not a regression
   risk, but the audit symptom this refactor closes.**
4. **Cross-user scoping** — boot as `dev1`, save profiles. Boot as
   `alice`. `alice` sees no profiles owned by `dev1` (visibility
   filter applies via `isVisible(row, ctx)`).
5. **REST mode pending writes** — save a profile, kill the server,
   save another, restart server. Both writes drain via `pendingSync`.
6. **Two-tab race** — open the same instance in two tabs. Save a
   profile in tab A. Tab B's `useProfileManager` hook reflects the
   change without a manual refresh (NEW — relies on 3.2's
   `BroadcastChannel` subscription).
7. **OpenFin workspace save → restore** — open a duplicated view
   pointing at profile B, save the workspace, close it, restore.
   The view hydrates back on profile B (not Default). Hits the
   `ActiveIdSource` path; nothing about consolidation should
   change this, but it's the most fragile cross-window invariant.
8. **First-boot migration on a populated legacy DB** — pre-create
   `gc-customizer-v2` in the test browser with N profile rows,
   then boot `demo-react` on the 3.2 PR. After boot, every profile
   should appear in the bundled ConfigService row AND be readable
   via the picker. Re-run boot — no duplicates.
9. **Strict-mode profile-list regression** — React 19 StrictMode
   double-mount is the bug class that drove the
   `MANAGERS_BY_PLATFORM` WeakMap singleton in
   `useProfileManager`. Verify the per-platform key still survives
   when the storage default flips.
10. **Expression-policy gate on import** — a payload containing a
    `kind: 'expression'` valueFormatter in `'strict'` mode is still
    rejected (or sanitized when `sanitize: true`). The policy is
    enforced in `ProfileManager.import` — should not move during
    consolidation.

---

## Out of scope

- The AppData mirror (separate concern; `ApplicationContext`
  publication is already handled inside `ConfigManager.init()`).
- The dock's theme action (already migrated in the theme reducer
  PR).
- Renaming or restructuring `ProfileSnapshot`, `StorageAdapter`,
  `AppConfigRow`, or `ExportedProfilePayload`.
- The `LocalStorageBundleAdapter` offline tier — distinct from
  the consolidation; stays as the "no-IndexedDB" fallback.
- `ProfileManager.import`'s expression-policy gate — security
  concern, not storage.
- Deleting `ProfileManager.ts` (revised out — see TL;DR).
- `ConfigClient` / `LocalConfigClient` / `RestConfigClient` collapse
  (Decision 13 in `config-manager-redesign.md` is a separate
  multi-session refactor; this work tolerates wherever that lands).
- The legacy `gc-customizer-v2` Dexie DB cleanup (drop the schema
  via `Dexie.delete('gc-customizer-v2')` after 3.3 has soaked).
- Adding owner / audit fields to `ProfileSnapshot` (the rows already
  carry those fields on the surrounding `AppConfigRow` once
  migrated; promoting them onto the snapshot is a follow-up if a
  future feature needs per-snapshot author info).
