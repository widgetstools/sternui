import type { ProfileSnapshot } from '@starui/engine';

import type { RegisteredComponentIdentity } from './profileSetTypes';

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
  identity?: RegisteredComponentIdentity;
  displayTextPrefix?: string;
}

/**
 * The shape returned from `ConfigManager.profiles`.
 *
 * Mirrors `StorageAdapter` semantically but works in scope terms
 * (`{ instanceId, appId, userId }`) rather than the legacy `gridId`
 * positional argument.
 */
export interface ProfilesNamespace {
  list(scope: ProfilesScope): Promise<readonly ProfileSnapshot[]>;
  save(
    scope: ProfilesScope,
    snapshot: ProfileSnapshot,
    options?: ProfilesSaveOptions,
  ): Promise<void>;
  delete(
    scope: ProfilesScope,
    profileId: string,
    options?: ProfilesSaveOptions,
  ): Promise<void>;
  loadGridLevelData(scope: ProfilesScope): Promise<unknown | null>;
  saveGridLevelData(
    scope: ProfilesScope,
    data: unknown,
    options?: ProfilesSaveOptions,
  ): Promise<void>;
  subscribe(scope: ProfilesScope, fn: () => void): () => void;
}
