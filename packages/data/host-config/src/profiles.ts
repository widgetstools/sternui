/**
 * `configManager.profiles.*` — first-class profile namespace on
 * `ConfigManager`.
 */

import type { ProfileSnapshot } from '@starui/engine';

import type { ChangeNotifier } from './changeNotifier';
import type { ProfilesHost } from './profileSetAccess';
import {
  loadProfileSet,
  saveProfileSet,
  type ProfileSetSaveOptions,
} from './profileSet';
import type {
  ProfilesNamespace,
  ProfilesSaveOptions,
  ProfilesScope,
} from './profilesTypes';

export type { ProfilesNamespace, ProfilesScope, ProfilesSaveOptions };

export function createProfilesNamespace(
  manager: ProfilesHost,
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
        { version: loaded.version, profiles: filtered, gridLevelData: loaded?.gridLevelData },
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
      return notifier.subscribe(scope.instanceId, fn);
    },
  };
}
