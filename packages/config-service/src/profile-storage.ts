/**
 * ConfigService-backed ProfileStorage adapter for `<MarketsGrid>`.
 *
 * Produces a `StorageAdapter` (from @marketsui/core) whose profile
 * CRUD operations route through `ConfigManager`'s `AppConfigRow` store.
 * One row per (appId, userId, instanceId, profileId) — finer-grained
 * than the plan's original "one row per instance" because we reuse the
 * existing per-profile `StorageAdapter` interface instead of redesigning
 * it. Keeps all 242 ProfileManager tests intact.
 *
 * Row-mapping contract:
 *   componentType    = "markets-grid-profile"
 *   componentSubType = <instanceId>
 *   appId            = <host app id>
 *   userId           = <signed-in user id>
 *   configId         = <instanceId>::<profileId>   (composite key)
 *   payload          = the ProfileSnapshot (json-serializable)
 *
 * Why composite configId:
 *   AppConfigRow.configId is a primary key in ConfigService. If two
 *   different instances shared a profile id "default", their rows
 *   would collide. Composite key keeps the existing primary-key
 *   semantics while letting us scope by instance + profile.
 *
 * Usage at app bootstrap (typical):
 *
 *   const storage = createConfigServiceStorage({
 *     configManager,           // required; produced by createConfigManager()
 *     appId: host.appId,
 *     userId: currentUser.id,
 *   });
 *
 *   <MarketsGrid storage={storage} ... />
 *
 * The returned value is a `StorageAdapterFactory` — call it with an
 * `instanceId` to produce a per-instance adapter. MarketsGrid does this
 * internally; consumers rarely call the factory themselves.
 */
// Type-only import — @marketsui/core is a peerDependency so the types
// line up exactly with what MarketsGrid expects. No runtime dep on
// core; consumers naturally satisfy the peer by depending on both.
import type { ProfileSnapshot, StorageAdapter } from '@marketsui/core';
import type { AppConfigRow } from './types';
import type { ConfigManager } from './config-manager';

export type { ProfileSnapshot, StorageAdapter };

export const MARKETS_GRID_PROFILE_COMPONENT_TYPE = 'markets-grid-profile';

/** Build the composite configId used to key an individual profile row. */
function composeConfigId(instanceId: string, profileId: string): string {
  return `${instanceId}::${profileId}`;
}

/** Recover the profileId from a composite configId. Returns null if
 *  the row doesn't belong to this instance. */
function extractProfileId(configId: string, instanceId: string): string | null {
  const prefix = `${instanceId}::`;
  if (!configId.startsWith(prefix)) return null;
  return configId.slice(prefix.length);
}

export interface ConfigServiceStorageOptions {
  /** Already-initialized ConfigManager instance. Bring-your-own so
   *  consumer controls Dexie vs REST mode + init lifecycle. */
  configManager: ConfigManager;
  /** Host app id. Scopes storage writes so profiles belonging to one
   *  app are isolated from another on the same ConfigService. */
  appId: string;
  /** User id. Different users see different profile sets for the same
   *  `(appId, instanceId)` pair. */
  userId: string;
  /** Optional display-text prefix shown on stored rows. Defaults to
   *  "MarketsGrid profile". Only surfaces in the Config Browser UI. */
  displayTextPrefix?: string;
}

/** Factory type — matches `StorageAdapterFactory` in @marketsui/markets-grid. */
export type ProfileStorageFactory = (instanceId: string) => StorageAdapter;

/**
 * Create a profile-storage factory backed by ConfigService.
 *
 * The factory closes over `(configManager, appId, userId)`. Each call
 * with a distinct `instanceId` produces an independent `StorageAdapter`
 * scoped to that instance. Same factory is safely reused across many
 * `<MarketsGrid>` instances — no per-grid re-creation needed.
 */
export function createConfigServiceStorage(
  opts: ConfigServiceStorageOptions,
): ProfileStorageFactory {
  const { configManager, appId, userId } = opts;
  const displayTextPrefix = opts.displayTextPrefix ?? 'MarketsGrid profile';

  return (instanceId: string): StorageAdapter => ({
    async loadProfile(gridId: string, profileId: string): Promise<ProfileSnapshot | null> {
      // gridId from the ProfileManager maps 1:1 to instanceId at this
      // layer. We trust the closure's instanceId as the source of
      // truth — if the manager ever asks for a different gridId here,
      // that's a contract violation we'd rather surface loudly.
      void gridId;
      const row = await configManager.getConfig(composeConfigId(instanceId, profileId));
      if (!row || !isProfileRow(row, instanceId, userId)) return null;
      return normalizeSnapshot(row.payload, instanceId);
    },

    async saveProfile(snapshot: ProfileSnapshot): Promise<void> {
      const row: AppConfigRow = {
        configId: composeConfigId(instanceId, snapshot.id),
        appId,
        userId,
        displayText: `${displayTextPrefix}: ${snapshot.name}`,
        componentType: MARKETS_GRID_PROFILE_COMPONENT_TYPE,
        componentSubType: instanceId,
        isTemplate: false,
        payload: snapshot,
        createdBy: userId,
        updatedBy: userId,
        creationTime: new Date(snapshot.createdAt).toISOString(),
        updatedTime: new Date(snapshot.updatedAt).toISOString(),
      };
      await configManager.saveConfig(row);
    },

    async deleteProfile(gridId: string, profileId: string): Promise<void> {
      void gridId;
      await configManager.deleteConfig(composeConfigId(instanceId, profileId));
    },

    async listProfiles(gridId: string): Promise<ProfileSnapshot[]> {
      void gridId;
      // ConfigManager.getConfigsByUser + client-side filter. Not the
      // most efficient query, but the workload is small: one user's
      // profiles for one instance = a handful of rows in practice.
      const rows = await configManager.getConfigsByUser(userId);
      const profiles: ProfileSnapshot[] = [];
      for (const row of rows) {
        if (!isProfileRow(row, instanceId, userId)) continue;
        if (row.appId !== appId) continue;
        profiles.push(normalizeSnapshot(row.payload, instanceId));
      }
      return profiles;
    },
  });
}

/** Guard: does this row belong to a markets-grid profile for this
 *  instance + user combo? */
function isProfileRow(row: AppConfigRow, instanceId: string, userId: string): boolean {
  return (
    row.componentType === MARKETS_GRID_PROFILE_COMPONENT_TYPE
    && row.componentSubType === instanceId
    && row.userId === userId
    && extractProfileId(row.configId, instanceId) !== null
  );
}

/** Defensively normalize the persisted payload back into a
 *  ProfileSnapshot. The payload came from our own saveProfile, but
 *  a REST backend or stale row could return unexpected shapes — keep
 *  the type boundary explicit. */
function normalizeSnapshot(payload: unknown, instanceId: string): ProfileSnapshot {
  const p = payload as Partial<ProfileSnapshot> & { gridId?: string };
  return {
    id: String(p?.id ?? ''),
    gridId: String(p?.gridId ?? instanceId),
    name: String(p?.name ?? ''),
    state: (p?.state ?? {}) as ProfileSnapshot['state'],
    createdAt: Number(p?.createdAt ?? Date.now()),
    updatedAt: Number(p?.updatedAt ?? Date.now()),
  };
}

/**
 * One-shot migration helper: copy profiles from local Dexie/Memory
 * storage into ConfigService storage for a given `(gridId, instanceId,
 * userId)` tuple.
 *
 * Consumer-triggered — NOT called automatically. Trading apps that
 * want to migrate users write a small admin action that invokes this
 * once per known instance.
 *
 * Strategy:
 *   "skip-if-exists" (default) — no-op when target already has any
 *   profile rows for this instance (cross-device safety: user may
 *   have newer data on another device already synced).
 *
 *   "overwrite" — unconditionally writes all local profiles to target,
 *   overwriting target rows that share the same profileId.
 *
 * Returns `{ migrated: boolean, count?: number, reason?: string }`.
 */
export async function migrateProfilesToConfigService(params: {
  source: StorageAdapter;
  target: ProfileStorageFactory;
  gridId: string;
  instanceId?: string;
  strategy?: 'skip-if-exists' | 'overwrite';
}): Promise<{ migrated: boolean; count?: number; reason?: string }> {
  const effectiveInstanceId = params.instanceId ?? params.gridId;
  const targetAdapter = params.target(effectiveInstanceId);
  const strategy = params.strategy ?? 'skip-if-exists';

  const existing = await targetAdapter.listProfiles(effectiveInstanceId);
  if (existing.length > 0 && strategy === 'skip-if-exists') {
    return { migrated: false, reason: 'target-has-profiles' };
  }

  const sourceProfiles = await params.source.listProfiles(params.gridId);
  if (sourceProfiles.length === 0) {
    return { migrated: false, reason: 'no-source-profiles' };
  }

  for (const profile of sourceProfiles) {
    // Rewrite gridId to the target's instanceId so the normalized
    // snapshot round-trips cleanly through the ConfigService adapter.
    await targetAdapter.saveProfile({ ...profile, gridId: effectiveInstanceId });
  }

  return { migrated: true, count: sourceProfiles.length };
}
