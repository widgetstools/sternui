/**

 * Normalize a seed bundle before first-run `bulkPut`.

 *

 * Config Browser exports sometimes carry stale `appId` / `userId` values

 * (e.g. `TestApp` / `dev1`) that no longer match the deployment's

 * `appRegistry` / `userProfiles` (e.g. `star-demo` / `k151344`). Without

 * this pass, profile-set rows fail scope checks and the grid loads empty

 * even though the data is on disk.

 */



import type { AppConfigRow, SeedData, UserProfileRow } from './types';



const REGISTRY_COMPONENT_TYPE = 'component-registry';

const GLOBAL_REGISTRY_USER_ID = 'system';



/** Resolve the canonical app id from the seed's appRegistry table. */

export function canonicalAppIdFromSeed(seed: SeedData): string | undefined {

  const registry = Array.isArray(seed.appRegistry) ? seed.appRegistry : [];

  for (const entry of registry) {

    const id = entry?.appId;

    if (typeof id === 'string' && id.trim().length > 0) {

      return id.trim();

    }

  }

  return undefined;

}



/**

 * Resolve the canonical signed-in user id from `userProfiles`.

 * Prefers a profile bound to `canonicalAppId` when supplied.

 */

export function canonicalUserIdFromSeed(

  seed: SeedData,

  canonicalAppId?: string,

): string | undefined {

  const profiles = Array.isArray(seed.userProfiles) ? seed.userProfiles : [];

  const forApp = canonicalAppId

    ? profiles.filter((p) => p.appId === canonicalAppId)

    : profiles;

  const pick = forApp[0] ?? profiles[0];

  const id = pick?.userId;

  return typeof id === 'string' && id.trim().length > 0 ? id.trim() : undefined;

}



function rescopeConfigId(

  configId: string,

  canonicalAppId: string,

  targetUserId: string,

): string {

  const parts = configId.split('::');

  if (parts.length !== 3) return configId;

  const [base, appPart, userPart] = parts;

  const newUser = userPart === GLOBAL_REGISTRY_USER_ID

    ? GLOBAL_REGISTRY_USER_ID

    : targetUserId;

  if (appPart === canonicalAppId && userPart === newUser) return configId;

  return `${base}::${canonicalAppId}::${newUser}`;

}



function isGlobalUserRow(row: AppConfigRow): boolean {

  if (row.componentType === REGISTRY_COMPONENT_TYPE) return true;

  return row.userId === GLOBAL_REGISTRY_USER_ID;

}



function resolveTargetUserId(

  row: AppConfigRow,

  canonicalUserId: string | undefined,

): string {

  if (isGlobalUserRow(row)) return GLOBAL_REGISTRY_USER_ID;

  return canonicalUserId ?? row.userId;

}



function normalizeRegistryRow(row: AppConfigRow, canonicalAppId: string): AppConfigRow {

  const payload = row.payload as { entries?: Array<Record<string, unknown>> } | null | undefined;

  const entries = Array.isArray(payload?.entries)

    ? payload.entries.map((entry) => ({

        ...entry,

        appId: canonicalAppId,

      }))

    : payload?.entries;



  return {

    ...row,

    appId: canonicalAppId,

    userId: GLOBAL_REGISTRY_USER_ID,

    configId: `component-registry::${canonicalAppId}::${GLOBAL_REGISTRY_USER_ID}`,

    payload: payload ? { ...payload, ...(entries ? { entries } : {}) } : row.payload,

  };

}



function normalizeAppConfigRow(

  row: AppConfigRow,

  canonicalAppId: string,

  canonicalUserId: string | undefined,

): AppConfigRow {

  if (row.componentType === REGISTRY_COMPONENT_TYPE) {

    return normalizeRegistryRow(row, canonicalAppId);

  }



  // Preserve intentional empty / legacy pre-scoped rows.

  if (row.appId === '') {

    return row;

  }



  const targetUserId = resolveTargetUserId(row, canonicalUserId);

  const appIdChanged = row.appId !== canonicalAppId;

  const userIdChanged = row.userId !== targetUserId;

  if (!appIdChanged && !userIdChanged) {

    return row;

  }



  const restampAudit = !isGlobalUserRow(row) && canonicalUserId;



  const next: AppConfigRow = {

    ...row,

    appId: canonicalAppId,

    userId: targetUserId,

    configId: typeof row.configId === 'string'

      ? rescopeConfigId(row.configId, canonicalAppId, targetUserId)

      : row.configId,

    ...(restampAudit

      ? {

          createdBy: canonicalUserId,

          updatedBy: canonicalUserId,

        }

      : {}),

  };



  if (next.componentType === 'workspace' && next.payload && typeof next.payload === 'object') {

    next.payload = rewalkScopeFields(next.payload, canonicalAppId, canonicalUserId);

  }



  return next;

}



function normalizeUserProfileRow(

  row: UserProfileRow,

  canonicalAppId: string,

): UserProfileRow {

  if (row.appId === canonicalAppId) return row;

  return { ...row, appId: canonicalAppId };

}



function rewalkScopeFields(

  value: unknown,

  canonicalAppId: string,

  canonicalUserId: string | undefined,

): unknown {

  if (!value || typeof value !== 'object') return value;

  if (Array.isArray(value)) {

    return value.map((item) => rewalkScopeFields(item, canonicalAppId, canonicalUserId));

  }

  const obj = value as Record<string, unknown>;

  const out: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(obj)) {

    if (key === 'appId' && typeof val === 'string' && val.length > 0 && val !== canonicalAppId) {

      out[key] = canonicalAppId;

    } else if (

      key === 'userId'

      && typeof val === 'string'

      && val.length > 0

      && val !== GLOBAL_REGISTRY_USER_ID

      && canonicalUserId

      && val !== canonicalUserId

    ) {

      out[key] = canonicalUserId;

    } else {

      out[key] = rewalkScopeFields(val, canonicalAppId, canonicalUserId);

    }

  }

  return out;

}



/**

 * Return a copy of `seed` whose auth + config rows are stamped with the

 * canonical `appId` / `userId` from `appRegistry` / `userProfiles`.

 * No-op when the registry carries no app id or every row already matches.

 */

export function normalizeSeedData(seed: SeedData): SeedData {

  const canonicalAppId = canonicalAppIdFromSeed(seed);

  if (!canonicalAppId) return seed;



  const canonicalUserId = canonicalUserIdFromSeed(seed, canonicalAppId);

  let next: SeedData = seed;

  let changed = false;



  if (Array.isArray(seed.userProfiles) && seed.userProfiles.length > 0) {

    const userProfiles = seed.userProfiles.map((row) =>

      normalizeUserProfileRow(row, canonicalAppId),

    );

    if (userProfiles.some((row, i) => row !== seed.userProfiles![i])) {

      next = { ...next, userProfiles };

      changed = true;

    }

  }



  if (Array.isArray(seed.appConfig) && seed.appConfig.length > 0) {

    const appConfig = seed.appConfig.map((row) =>

      normalizeAppConfigRow(row, canonicalAppId, canonicalUserId),

    );

    if (appConfig.some((row, i) => row !== seed.appConfig![i])) {

      next = { ...next, appConfig };

      changed = true;

    }

  }



  return changed ? next : seed;

}

const DATA_PROVIDER_EXPORT_KIND = 'starui.dataProvider';

/**
 * Reject JSON that is not a deploy/seed bundle (e.g. a single data-provider
 * export saved as `seed.json`). Returns `null` and logs a clear error.
 */
export function parseSeedJson(raw: unknown): SeedData | null {
  if (!raw || typeof raw !== 'object') {
    console.error('ConfigManager: seed.json is not a JSON object — seeding skipped.');
    return null;
  }
  const obj = raw as Record<string, unknown>;
  if (obj.kind === DATA_PROVIDER_EXPORT_KIND) {
    console.error(
      'ConfigManager: seed.json is a data-provider export (kind=starui.dataProvider), not a deploy bundle. ' +
      'Use Config Browser rocket export or copy seed1.json shape (appRegistry, userProfiles, appConfig, …).',
    );
    return null;
  }
  if (!Array.isArray(obj.appRegistry)) {
    console.error(
      'ConfigManager: seed.json is missing appRegistry[] — seeding skipped. ' +
      'Expected the same shape as Config Browser deploy export.',
    );
    return null;
  }
  return raw as SeedData;
}

