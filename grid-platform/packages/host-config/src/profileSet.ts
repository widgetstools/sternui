/**
 * Internal read-modify-write helpers for the bundled profile-set row.
 *
 * Both `createConfigServiceStorage` (the StorageAdapter factory consumed
 * by `<MarketsGrid>`) and the new `configManager.profiles.*` namespace
 * share these so version-handling and component-type discrimination
 * never drift between the two surfaces.
 *
 * One row per `(appId, userId, instanceId)` keyed by `configId =
 * instanceId`. Payload = `{ version, profiles, gridLevelData? }`.
 * Optimistic concurrency throws `ProfileSetVersionConflictError` on
 * write when the on-disk version has moved past the caller's
 * `expectedVersion`.
 */

import type { ProfileSnapshot } from '@stargrid/engine';

import type { ConfigManager } from './ConfigManager';
import {
  MARKETS_GRID_PROFILE_SET_COMPONENT_TYPE,
  ProfileSetVersionConflictError,
  type RegisteredComponentIdentity,
} from './profileStorage';
import type { AppConfigRow } from './types';

/**
 * Decoded payload of a profile-set row. `version` is opaque-monotonic;
 * `gridLevelData` is opaque to the adapter and survives profile
 * switches. Pre-version rows are normalized to `version: 0` and self-
 * heal on the next save.
 */
export interface ProfileSetPayload {
  version: number;
  profiles: ProfileSnapshot[];
  gridLevelData?: unknown;
}

/** Scope identifying which row to read / write. */
export interface ProfileSetScope {
  instanceId: string;
  appId: string;
  userId: string;
}

/** Optional knobs handed to `saveSet` so the persisted row carries the
 *  correct identity-bound `componentType`/`componentSubType` and the
 *  caller's `displayText` prefix. */
export interface ProfileSetSaveOptions {
  identity?: RegisteredComponentIdentity;
  displayTextPrefix?: string;
}

/**
 * Read the bundled row for `scope`. Returns `null` when no row exists
 * yet (consumer treats null as "first launch, start empty"). Filters
 * defensively: a row that happens to share `configId` but belongs to a
 * different `(appId, userId)` is treated as missing rather than
 * misappropriated.
 */
export async function loadProfileSet(
  configManager: ConfigManager,
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
 *
 * `expectedVersion` is the version the caller observed on its read.
 * `saveProfileSet` re-reads the row right before writing, compares,
 * and throws `ProfileSetVersionConflictError` on mismatch — a cheap
 * way to catch two-tab / two-device races before they silently
 * clobber each other.
 *
 * The read-compare-write isn't atomic at the client (JavaScript isn't
 * transactional across two awaits). For local Dexie the race window is
 * microscopic — JS is single-threaded per tab, and Dexie serializes
 * writes within a tab. For future REST backends, the adapter relies on
 * the manager's `If-Match` plumbing (Session 6) for server-side
 * enforcement.
 */
export async function saveProfileSet(
  configManager: ConfigManager,
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

/**
 * Recognise a profile-set row owned by `(appId, userId)`.
 *
 * Identification is by **payload shape** — specifically, the presence
 * of a `profiles` array on the payload — NOT the row's
 * `componentType`. The latter is now identity-bound: a row written for
 * a registered "blotter / positions" component carries
 * `componentType: 'blotter'`, not the legacy
 * `'markets-grid-profile-set'` placeholder. Legacy rows still have
 * `componentType === 'markets-grid-profile-set'` and a `profiles`
 * payload — both checks pass, so they continue to load. The next
 * save corrects the row to identity-bound form.
 */
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

/** Defensively normalize the persisted payload back into a
 *  ProfileSetPayload. Guards against malformed / legacy shapes. */
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

/** Pull the `version` number out of a payload, tolerating the pre-
 *  version-field shape. Missing / non-numeric values map to 0. */
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
