/**
 * `configManager.profiles.*` — first-class profile namespace on
 * `ConfigManager`.
 *
 * Wraps the same bundled `(appId, userId, instanceId)` row that
 * `createConfigServiceStorage` produces, so consumers that don't go
 * through `<MarketsGrid storage={...}>` (e.g. admin tools, direct
 * consumers, future stateless React hooks) can read / write the
 * profile-set without instantiating a full StorageAdapter.
 *
 * Adds a `subscribe(scope, fn)` channel backed by `ChangeNotifier` so
 * cross-tab edits become observable to in-process consumers — closing
 * the audit gap noted in `docs/PROFILE-STATE-CONSOLIDATION.md` (Risk
 * #6 in the Risk list, "Two-tab race").
 *
 * Reuses the shared `loadProfileSet` / `saveProfileSet` helpers so
 * version-handling and component-type discrimination match the
 * StorageAdapter exactly.
 */

import type { ProfileSnapshot } from '@starui/core';

import type { ChangeNotifier } from './changeNotifier';
import type { ConfigManager } from './ConfigManager';
import {
  loadProfileSet,
  saveProfileSet,
  type ProfileSetSaveOptions,
} from './profileSet';
import type { RegisteredComponentIdentity } from './profileStorage';

/** Scope identifying which row to read / write. `appId` and `userId`
 *  default to the manager's own identity / appId so the typical caller
 *  passes only `instanceId`. */
export interface ProfilesScope {
  instanceId: string;
  appId?: string;
  userId?: string;
}

/** Optional knobs that flow through `save` to the persisted row. */
export interface ProfilesSaveOptions {
  /** Identity-bound `componentType` / `componentSubType` / etc. — when
   *  supplied, the row carries the registered component's type rather
   *  than the legacy `'markets-grid-profile-set'` discriminator. */
  identity?: RegisteredComponentIdentity;
  /** Override the `displayText` prefix on the row. Defaults to
   *  `"MarketsGrid profiles"`. */
  displayTextPrefix?: string;
}

/**
 * The shape returned from `ConfigManager.profiles`.
 *
 * Mirrors `StorageAdapter` semantically but works in scope terms
 * (`{ instanceId, appId, userId }`) rather than the legacy `gridId`
 * positional argument — the `gridId` argument was always equal to the
 * scope's `instanceId` at this seam, see
 * `docs/PROFILE-STATE-CONSOLIDATION.md` "ProfileSnapshot vs
 * AppConfigRow".
 */
export interface ProfilesNamespace {
  /** List every profile in the bundle for `scope`. Returns `[]` when no
   *  row exists yet. */
  list(scope: ProfilesScope): Promise<readonly ProfileSnapshot[]>;

  /**
   * Save (insert OR update) a single profile in the bundle. Read-
   * modify-write under the hood; throws `ProfileSetVersionConflictError`
   * when another writer beat this one to the row.
   */
  save(
    scope: ProfilesScope,
    snapshot: ProfileSnapshot,
    options?: ProfilesSaveOptions,
  ): Promise<void>;

  /** Remove a profile by id. No-op when the profile isn't in the
   *  bundle. Preserves remaining profiles + `gridLevelData`. */
  delete(
    scope: ProfilesScope,
    profileId: string,
    options?: ProfilesSaveOptions,
  ): Promise<void>;

  /** Read the opaque `gridLevelData` blob persisted alongside the
   *  profiles. Returns `null` when nothing's been saved yet. */
  loadGridLevelData(scope: ProfilesScope): Promise<unknown | null>;

  /** Write `data` into the bundle's `gridLevelData` slot. Preserves
   *  profiles + version. */
  saveGridLevelData(
    scope: ProfilesScope,
    data: unknown,
    options?: ProfilesSaveOptions,
  ): Promise<void>;

  /**
   * Subscribe to changes on the bundled row for `scope`. Fires whenever
   * `saveConfig` or `deleteConfig` writes a row whose `configId`
   * matches `scope.instanceId` — including writes from another tab via
   * `BroadcastChannel`. No-op fallback in environments without
   * BroadcastChannel; same-tab notifications keep working.
   */
  subscribe(scope: ProfilesScope, fn: () => void): () => void;
}

/**
 * Build the `profiles` namespace bound to `manager`. Internal — every
 * caller reads `manager.profiles` instead of constructing this directly.
 *
 * `notifier` is the manager's own `ChangeNotifier` so subscribe routes
 * through the same channel that `saveConfig` / `deleteConfig` post on.
 */
export function createProfilesNamespace(
  manager: ConfigManager,
  notifier: ChangeNotifier,
): ProfilesNamespace {
  function resolveScope(scope: ProfilesScope): { instanceId: string; appId: string; userId: string } {
    const appId = scope.appId ?? manager.getAppId();
    const userId = scope.userId ?? manager.getIdentity().userId;
    return { instanceId: scope.instanceId, appId, userId };
  }

  function toSaveOptions(options: ProfilesSaveOptions | undefined): ProfileSetSaveOptions {
    return {
      identity: options?.identity,
      displayTextPrefix: options?.displayTextPrefix,
    };
  }

  return {
    async list(scope) {
      const resolved = resolveScope(scope);
      const set = await loadProfileSet(manager, resolved);
      return set?.profiles ?? [];
    },

    async save(scope, snapshot, options) {
      const resolved = resolveScope(scope);
      const loaded = await loadProfileSet(manager, resolved);
      const expectedVersion = loaded?.version ?? 0;
      const profiles = loaded?.profiles ?? [];
      const idx = profiles.findIndex((p) => p.id === snapshot.id);
      if (idx >= 0) {
        profiles[idx] = snapshot;
      } else {
        profiles.push(snapshot);
      }
      await saveProfileSet(
        manager,
        resolved,
        { version: expectedVersion, profiles, gridLevelData: loaded?.gridLevelData },
        expectedVersion,
        toSaveOptions(options),
      );
    },

    async delete(scope, profileId, options) {
      const resolved = resolveScope(scope);
      const loaded = await loadProfileSet(manager, resolved);
      if (!loaded) return;
      const filtered = loaded.profiles.filter((p) => p.id !== profileId);
      if (filtered.length === loaded.profiles.length) return;
      await saveProfileSet(
        manager,
        resolved,
        { version: loaded.version, profiles: filtered, gridLevelData: loaded.gridLevelData },
        loaded.version,
        toSaveOptions(options),
      );
    },

    async loadGridLevelData(scope) {
      const resolved = resolveScope(scope);
      const set = await loadProfileSet(manager, resolved);
      return set?.gridLevelData ?? null;
    },

    async saveGridLevelData(scope, data, options) {
      const resolved = resolveScope(scope);
      const loaded = await loadProfileSet(manager, resolved);
      const expectedVersion = loaded?.version ?? 0;
      await saveProfileSet(
        manager,
        resolved,
        {
          version: expectedVersion,
          profiles: loaded?.profiles ?? [],
          gridLevelData: data,
        },
        expectedVersion,
        toSaveOptions(options),
      );
    },

    subscribe(scope, fn) {
      // Subscriptions key on `instanceId` (= `configId`). `appId` /
      // `userId` are filtered at read time by `loadProfileSet`, not at
      // notify time — they affect WHICH row this consumer wants to
      // read, not WHEN to notify.
      return notifier.subscribe(scope.instanceId, fn);
    },
  };
}
