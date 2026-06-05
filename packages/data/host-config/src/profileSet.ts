/**
 * Internal read-modify-write helpers for the bundled profile-set row.
 *
 * Both `createConfigServiceStorage` (the StorageAdapter factory consumed
 * by `<MarketsGrid>`) and the new `configManager.profiles.*` namespace
 * share these so version-handling and component-type discrimination
 * never drift between the two surfaces.
 */

import type { ProfileSnapshot } from '@starui/engine';

import type { ProfileSetConfigAccess } from './profileSetAccess';
import {
  MARKETS_GRID_PROFILE_SET_COMPONENT_TYPE,
  ProfileSetVersionConflictError,
  type ProfileSetPayload,
  type ProfileSetSaveOptions,
  type ProfileSetScope,
} from './profileSetTypes';
import type { AppConfigRow } from './types';

export type { ProfileSetPayload, ProfileSetScope, ProfileSetSaveOptions };

/**
 * Read the bundled row for `scope`. Returns `null` when no row exists
 * yet (consumer treats null as "first launch, start empty"). Filters
 * defensively: a row that happens to share `configId` but belongs to a
 * different `(appId, userId)` is treated as missing rather than
 * misappropriated.
 */
export async function loadProfileSet(
  configManager: ProfileSetConfigAccess,
  scope: ProfileSetScope,
): Promise<ProfileSetPayload | null> {
  const row = await configManager.getConfig(scope.instanceId);
  if (isProfileSetRow(row, scope.appId, scope.userId)) {
    return normalizePayload(row.payload);
  }
  return null;
}

/**
 * Write the bundle with optimistic-concurrency check.
 */
export async function saveProfileSet(
  configManager: ProfileSetConfigAccess,
  scope: ProfileSetScope,
  set: ProfileSetPayload,
  expectedVersion: number,
  options: ProfileSetSaveOptions = {},
): Promise<void> {
  const { instanceId, appId, userId } = scope;
  const now = new Date().toISOString();
  const existing = await configManager.getConfig(instanceId);
  const actualVersion = isProfileSetRow(existing, appId, userId)
    ? readVersion(existing.payload)
    : 0;

  if (actualVersion !== expectedVersion) {
    throw new ProfileSetVersionConflictError(expectedVersion, actualVersion, instanceId);
  }

  const creationTime = isProfileSetRow(existing, appId, userId)
    ? (existing?.creationTime ?? now)
    : now;

  const identity = options.identity;
  const componentType = identity?.componentType ?? MARKETS_GRID_PROFILE_SET_COMPONENT_TYPE;
  const componentSubType = identity?.componentSubType ?? '';
  const isTemplate = identity?.isTemplate === true;
  const singleton = identity?.singleton === true;
  const displayTextPrefix = options.displayTextPrefix ?? 'MarketsGrid profiles';

  const row: AppConfigRow = {
    configId: instanceId,
    appId,
    userId,
    isPublic: existing?.isPublic ?? true,
    displayText: `${displayTextPrefix}: ${instanceId}`,
    componentType,
    componentSubType,
    isTemplate,
    singleton,
    payload: { ...set, version: expectedVersion + 1 },
    createdBy: existing?.createdBy ?? userId,
    updatedBy: userId,
    creationTime,
    updatedTime: now,
  };
  await configManager.saveConfig(row);
}

export function isProfileSetRow(
  row: AppConfigRow | null | undefined,
  appId: string,
  userId: string,
): row is AppConfigRow {
  if (!row) return false;
  if (row.appId !== appId || row.userId !== userId) return false;
  const payload = row.payload as { profiles?: unknown } | null | undefined;
  return Array.isArray(payload?.profiles)
    || row.componentType === MARKETS_GRID_PROFILE_SET_COMPONENT_TYPE;
}

export function normalizePayload(payload: unknown): ProfileSetPayload {
  const p = payload as
    | { profiles?: unknown; version?: unknown; gridLevelData?: unknown }
    | null
    | undefined;
  const arr = Array.isArray(p?.profiles) ? p.profiles : [];
  const profiles: ProfileSnapshot[] = [];
  for (const raw of arr) {
    const snap = normalizeSnapshot(raw);
    if (snap) profiles.push(snap);
  }
  return { version: readVersion(p), profiles, gridLevelData: p?.gridLevelData };
}

export function readVersion(payload: unknown): number {
  const v = (payload as { version?: unknown } | null | undefined)?.version;
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
}

function normalizeSnapshot(raw: unknown): ProfileSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Partial<ProfileSnapshot> & { gridId?: string };
  if (!p.id || !p.gridId) return null;
  return {
    id: String(p.id),
    gridId: String(p.gridId),
    name: String(p.name ?? ''),
    state: (p.state ?? {}) as ProfileSnapshot['state'],
    createdAt: Number(p.createdAt ?? Date.now()),
    updatedAt: Number(p.updatedAt ?? Date.now()),
  };
}
