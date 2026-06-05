/**
 * ConfigService-backed storage adapter for `<MarketsGrid>` profiles.
 *
 * One `AppConfigRow` per `(appId, userId, instanceId)` — the row's
 * `payload` is a bundle of every profile for that instance:
 *
 *   {
 *     profiles: ProfileSnapshot[]
 *   }
 *
 * This matches the original storage design in
 * `docs/plans/MARKETS_GRID_API.md` §Storage ("one row per instance
 * carrying the whole profile set"). Each adapter method implements
 * read-modify-write on the bundle under the hood so ProfileManager
 * and its 242-test suite continue to call the standard per-profile
 * `StorageAdapter` API unchanged.
 *
 * Row-mapping contract:
 *   componentType    = "markets-grid-profile-set"
 *   componentSubType = ""
 *   appId            = <host app id>
 *   userId           = <signed-in user id>
 *   configId         = <instanceId>          (primary key scope)
 *   payload          = { profiles: ProfileSnapshot[] }
 *
 * Why bundled, not per-profile:
 *   - Config Browser shows one row per instance instead of N rows — a
 *     much clearer mental model for admins ("this is alice's state for
 *     bond-blotter").
 *   - Single round-trip to hydrate a grid at mount; no client-side
 *     filter across the whole user's config.
 *   - Profile list + switch semantics stay inside the payload shape
 *     we own, rather than leaking into configId naming.
 *
 * Consistency note:
 *   saveProfile does load-modify-write against a single row. Two
 *   tabs mutating the same instance concurrently could race; the
 *   later write wins. Acceptable for the current demo target; a
 *   production REST backend would want optimistic concurrency
 *   (If-Match / version field) to surface conflicts. Not in scope
 *   for v1.
 *
 * Usage at app bootstrap (typical):
 *
 *   const storage = createConfigServiceStorage({
 *     configManager,
 *     appId: host.appId,
 *     userId: currentUser.id,
 *   });
 *   <MarketsGrid storage={storage} ... />
 */

// Type-only import — @starui/engine is a peerDependency so the types
// line up exactly with what MarketsGrid expects. No runtime dep on
// core; consumers naturally satisfy the peer by depending on both.
import type { ProfileSnapshot, StorageAdapter } from '@starui/engine';
import type { ProfileSetConfigAccess } from './profileSetAccess';
import { loadProfileSet, saveProfileSet } from './profileSet';
import type { ProfilesNamespace } from './profilesTypes';
import type { RegisteredComponentIdentity } from './profileSetTypes';

export {
  MARKETS_GRID_PROFILE_SET_COMPONENT_TYPE,
  MARKETS_GRID_PROFILE_COMPONENT_TYPE,
  ProfileSetVersionConflictError,
  type RegisteredComponentIdentity,
} from './profileSetTypes';

export type { ProfileSnapshot, StorageAdapter };

export interface ConfigManagerForProfileStorage extends ProfileSetConfigAccess {
  profiles: Pick<ProfilesNamespace, 'subscribe'>;
}

export interface ConfigServiceStorageOptions {
  /** Already-initialized ConfigManager instance. Bring-your-own so
   *  consumer controls Dexie vs REST mode + init lifecycle. */
  configManager: ConfigManagerForProfileStorage;
  /** Optional app-id fallback — used when MarketsGrid doesn't pass
   *  `appId` at call time. Most apps leave this undefined and pass
   *  `appId` on the `<MarketsGrid>` prop instead (reactive identity). */
  appId?: string;
  /** Optional user-id fallback — same treatment as `appId`. */
  userId?: string;
  /** Optional display-text used on the stored row. Defaults to
   *  "MarketsGrid profiles: <instanceId>". Only surfaces in the
   *  Config Browser UI. */
  displayTextPrefix?: string;
}

/**
 * Identity of the registered component this MarketsGrid instance is
 * persisting state for — propagated onto the saved AppConfigRow so
 * its `componentType` / `componentSubType` / `isTemplate` /
 * `singleton` fields reflect the registered entry, not a hardcoded
 * "markets-grid-profile-set" placeholder.
 *
 * When omitted (e.g. legacy callers or unit tests that don't model a
 * registered component), the row falls back to the legacy
 * `componentType: 'markets-grid-profile-set'`, `componentSubType: ''`,
 * `isTemplate: false` defaults.
 */
export interface ProfileStorageFactoryOpts {
  instanceId: string;
  appId?: string;
  userId?: string;
  /**
   * Identity of the registered component. When provided, the saver
   * writes `componentType`, `componentSubType`, `isTemplate`, and
   * `singleton` from this object onto every persisted row — ENFORCED
   * on every write, so a stale row from before identity-aware saves
   * gets corrected on the next save.
   */
  registeredIdentity?: RegisteredComponentIdentity;
}

/** Factory type — matches `StorageAdapterFactory` in @starui/markets-grid. */
export type ProfileStorageFactory = (opts: ProfileStorageFactoryOpts) => StorageAdapter;

/**
 * Create a profile-storage factory backed by ConfigService.
 *
 * The factory takes `{ instanceId, appId?, userId? }` at call time.
 * MarketsGrid supplies those from its own props.
 *
 * Resolution order for `appId` / `userId`:
 *   1. Call-time opts (from MarketsGrid's appId/userId props)
 *   2. Closure fallback (from `createConfigServiceStorage({ appId, userId })`)
 *   3. Error — thrown on the first CRUD call if neither is available
 *
 * Typical usage:
 *
 *   const storage = createConfigServiceStorage({ configManager });
 *   <MarketsGrid storage={storage} appId="TestApp" userId={userId} />
 *
 * User-switching becomes trivial — change the userId prop; no factory
 * re-creation needed. If you still want app-bootstrap-level scoping,
 * pass `appId`/`userId` to `createConfigServiceStorage({...})` as
 * closure fallbacks; MarketsGrid's props override them.
 */
export function createConfigServiceStorage(
  opts: ConfigServiceStorageOptions,
): ProfileStorageFactory {
  const { configManager } = opts;
  const closureAppId = opts.appId;
  const closureUserId = opts.userId;
  const displayTextPrefix = opts.displayTextPrefix ?? 'MarketsGrid profiles';

  return (factoryOpts: ProfileStorageFactoryOpts): StorageAdapter => {
    const instanceId = factoryOpts.instanceId;
    const appId = factoryOpts.appId ?? closureAppId;
    const userId = factoryOpts.userId ?? closureUserId;
    const identity = factoryOpts.registeredIdentity;

    if (!appId || !userId) {
      throw new Error(
        'createConfigServiceStorage: appId and userId must be supplied ' +
        'either at factory-creation time (createConfigServiceStorage({ appId, userId })) ' +
        'or at call time via MarketsGrid props. ' +
        `Received: appId=${JSON.stringify(appId)}, userId=${JSON.stringify(userId)}.`,
      );
    }

    const scope = { instanceId, appId, userId };
    const saveOptions = { identity, displayTextPrefix };

    const adapter: StorageAdapter = {
      async loadProfile(gridId: string, profileId: string): Promise<ProfileSnapshot | null> {
        void gridId; // gridId maps 1:1 to instanceId at this seam
        const set = await loadProfileSet(configManager, scope);
        if (!set) return null;
        return set.profiles.find((p) => p.id === profileId) ?? null;
      },

      async saveProfile(snapshot: ProfileSnapshot): Promise<void> {
        // Load the existing bundle, then upsert the snapshot and
        // write back. The expected-version from the load is threaded
        // into saveProfileSet so a second writer that landed in
        // between gets caught on the version-compare. `gridLevelData`
        // is preserved verbatim — saving a profile must not clobber it.
        const loaded = await loadProfileSet(configManager, scope);
        const expectedVersion = loaded?.version ?? 0;
        const profiles = loaded?.profiles ?? [];
        const idx = profiles.findIndex((p) => p.id === snapshot.id);
        if (idx >= 0) {
          profiles[idx] = snapshot;
        } else {
          profiles.push(snapshot);
        }
        await saveProfileSet(
          configManager,
          scope,
          { version: expectedVersion, profiles, gridLevelData: loaded?.gridLevelData },
          expectedVersion,
          saveOptions,
        );
      },

      async deleteProfile(gridId: string, profileId: string): Promise<void> {
        void gridId;
        const loaded = await loadProfileSet(configManager, scope);
        if (!loaded) return;
        const filtered = loaded.profiles.filter((p) => p.id !== profileId);
        if (filtered.length === loaded.profiles.length) return; // not found; no-op
        await saveProfileSet(
          configManager,
          scope,
          { version: loaded.version, profiles: filtered, gridLevelData: loaded.gridLevelData },
          loaded.version,
          saveOptions,
        );
      },

      async listProfiles(gridId: string): Promise<ProfileSnapshot[]> {
        void gridId;
        const set = await loadProfileSet(configManager, scope);
        return set?.profiles ?? [];
      },

      async loadGridLevelData(gridId: string): Promise<unknown | null> {
        void gridId;
        const set = await loadProfileSet(configManager, scope);
        return set?.gridLevelData ?? null;
      },

      async saveGridLevelData(gridId: string, data: unknown): Promise<void> {
        void gridId;
        // Read-modify-write the same bundled row. Keep profiles and
        // version intact — only the `gridLevelData` field changes.
        const loaded = await loadProfileSet(configManager, scope);
        const expectedVersion = loaded?.version ?? 0;
        await saveProfileSet(
          configManager,
          scope,
          {
            version: expectedVersion,
            profiles: loaded?.profiles ?? [],
            gridLevelData: data,
          },
          expectedVersion,
          saveOptions,
        );
      },

      // Multi-tab subscribe (Session 3.2 / consolidation). When the
      // ConfigManager publishes a `configChanged` notification for
      // this `instanceId` — including a write that originated in
      // another tab via BroadcastChannel — fire the listener so
      // ProfileManager (or any other consumer) can refresh.
      //
      // Routes through the manager's `profiles.subscribe` namespace
      // so the same hook works for non-StorageAdapter consumers in
      // future refactors.
      subscribeToChanges(gridId: string, fn: () => void): () => void {
        void gridId;
        return configManager.profiles.subscribe(scope, fn);
      },
    };

    // Brand the adapter with its scope so `migrateProfilesToConfigService`
    // and other tooling can recover the `(instanceId, appId, userId)`
    // identity without re-reading the closure. Non-enumerable to keep
    // the runtime shape clean for consumers that introspect via
    // `Object.keys(adapter)`.
    Object.defineProperty(adapter, CONFIG_SERVICE_ADAPTER_BRAND, {
      value: { configManager, scope },
      enumerable: false,
      writable: false,
      configurable: false,
    });

    return adapter;
  };
}

/**
 * Symbol brand placed on the StorageAdapter returned from
 * `createConfigServiceStorage`. Lets internal code (e.g. the migration
 * trigger) recover the manager + scope without re-deriving them. Use
 * `getConfigServiceAdapterBrand(adapter)` to read.
 */
export const CONFIG_SERVICE_ADAPTER_BRAND = Symbol.for(
  '@starui/host-config/profile-storage-adapter',
);

/** Recover the `{ configManager, scope }` brand from a StorageAdapter
 *  returned by `createConfigServiceStorage`. Returns `undefined` for
 *  any other adapter implementation. */
export function getConfigServiceAdapterBrand(
  adapter: StorageAdapter,
): { configManager: ConfigManagerForProfileStorage; scope: { instanceId: string; appId: string; userId: string } } | undefined {
  const branded = adapter as unknown as Record<symbol, unknown>;
  const brand = branded[CONFIG_SERVICE_ADAPTER_BRAND];
  if (
    brand
    && typeof brand === 'object'
    && 'configManager' in brand
    && 'scope' in brand
  ) {
    return brand as { configManager: ConfigManagerForProfileStorage; scope: { instanceId: string; appId: string; userId: string } };
  }
  return undefined;
}

/**
 * One-shot migration helper: copy profiles from local Dexie/Memory
 * storage into ConfigService bundled storage for a given `(gridId,
 * instanceId, userId)` tuple.
 *
 * Consumer-triggered — NOT called automatically. Trading apps that
 * want to migrate users write a small admin action that invokes this
 * once per known instance.
 *
 * Strategy:
 *   "skip-if-exists" (default) — no-op when target already has any
 *   profiles in the bundle (cross-device safety: user may have newer
 *   data on another device already synced).
 *
 *   "overwrite" — unconditionally rewrites the target bundle with
 *   the source profile list.
 *
 * Returns `{ migrated: boolean, count?: number, reason?: string }`.
 */
export async function migrateProfilesToConfigService(params: {
  source: StorageAdapter;
  target: ProfileStorageFactory;
  gridId: string;
  instanceId?: string;
  /** App + user identity passed into the factory at call time. If the
   *  factory was built with closure-level fallbacks these may be
   *  omitted — otherwise they're required, same rule as MarketsGrid. */
  appId?: string;
  userId?: string;
  strategy?: 'skip-if-exists' | 'overwrite';
}): Promise<{ migrated: boolean; count?: number; reason?: string }> {
  const effectiveInstanceId = params.instanceId ?? params.gridId;
  const targetAdapter = params.target({
    instanceId: effectiveInstanceId,
    appId: params.appId,
    userId: params.userId,
  });
  const strategy = params.strategy ?? 'skip-if-exists';

  const existing = await targetAdapter.listProfiles(effectiveInstanceId);
  if (existing.length > 0 && strategy === 'skip-if-exists') {
    return { migrated: false, reason: 'target-has-profiles' };
  }

  const sourceProfiles = await params.source.listProfiles(params.gridId);
  if (sourceProfiles.length === 0) {
    return { migrated: false, reason: 'no-source-profiles' };
  }

  // Rewrite gridId to the target's instanceId so snapshots round-trip
  // cleanly through the bundled adapter. saveProfile is sequential
  // but load-modify-writes the same bundle each time — acceptable for
  // a one-shot migration at small sizes.
  for (const profile of sourceProfiles) {
    await targetAdapter.saveProfile({ ...profile, gridId: effectiveInstanceId });
  }

  return { migrated: true, count: sourceProfiles.length };
}
