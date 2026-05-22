/**
 * FI blotter profile seeding + runtime re-apply for openfin-scaffold-blotter.
 *
 * Config import can lose to an empty `__default__` created on first grid visit,
 * or profile state may hydrate before provider column defs exist. This module
 * repairs storage when needed and forces a profile reload after the live grid mounts.
 */
import type { MarketsGridHandle } from '@starui/grid';
import { LOGGED_IN_USER_ID } from '@starui/types';
import {
  buildDefaultProfileSnapshot,
  SCAFFOLD_BLOTTER_GRID_ID,
} from '../config/stompPositionsFiSchema.js';

/** Must match `useHostedIdentity` / starter JSON `appId`. */
const HOST_APP_ID = 'TestApp';

const MIN_FI_ASSIGNMENTS = 12;

type ConfigRow = {
  configId: string;
  appId: string;
  userId: string;
  componentType: string;
  componentSubType: string;
  isTemplate: boolean;
  displayText: string;
  payload: {
    version?: number;
    profiles?: Array<{ id?: string; state?: Record<string, unknown> }>;
    gridLevelData?: { liveProviderId?: string };
  };
  createdBy?: string;
  updatedBy?: string;
  creationTime?: string;
  updatedTime?: string;
  isPublic?: boolean;
};

function countColumnCustomizationAssignments(state: Record<string, unknown> | undefined): number {
  if (!state) return 0;
  const mod = state['column-customization'] as
    | { data?: { assignments?: Record<string, unknown> } }
    | { assignments?: Record<string, unknown> }
    | undefined;
  if (!mod || typeof mod !== 'object') return 0;
  if ('data' in mod && mod.data && typeof mod.data === 'object') {
    return Object.keys(mod.data.assignments ?? {}).length;
  }
  return Object.keys((mod as { assignments?: Record<string, unknown> }).assignments ?? {}).length;
}

function profileNeedsFiSeed(profile: { state?: Record<string, unknown> } | undefined): boolean {
  return countColumnCustomizationAssignments(profile?.state) < MIN_FI_ASSIGNMENTS;
}

export function buildFiProfileImportPayload(gridId: string = SCAFFOLD_BLOTTER_GRID_ID) {
  return {
    schemaVersion: 1 as const,
    kind: 'gc-profile' as const,
    exportedAt: new Date().toISOString(),
    profile: buildDefaultProfileSnapshot(gridId),
  };
}

type ConfigManagerLike = {
  getConfig(configId: string): Promise<ConfigRow | null | undefined>;
  saveConfig(row: ConfigRow): Promise<void>;
};

/**
 * Ensure Dexie holds the FI Default profile before MarketsGrid boots.
 * Safe to call on every Blotter mount — no-op when import already seeded formatting.
 */
export async function ensureFiBlotterProfileRow(configManager: ConfigManagerLike): Promise<void> {
  const instanceId = SCAFFOLD_BLOTTER_GRID_ID;
  const existing = (await configManager.getConfig(instanceId)) as ConfigRow | null | undefined;
  const payload = existing?.payload ?? {};
  const profiles = Array.isArray(payload.profiles) ? [...payload.profiles] : [];
  const defIdx = profiles.findIndex((p) => p?.id === '__default__');
  const def = defIdx >= 0 ? profiles[defIdx] : undefined;

  if (!profileNeedsFiSeed(def)) return;

  const snapshot = buildDefaultProfileSnapshot(instanceId);
  if (defIdx >= 0) profiles[defIdx] = snapshot;
  else profiles.unshift(snapshot);

  const now = new Date().toISOString();
  await configManager.saveConfig({
    configId: instanceId,
    appId: HOST_APP_ID,
    userId: LOGGED_IN_USER_ID,
    componentType: 'markets-grid-profile-set',
    componentSubType: '',
    isTemplate: false,
    isPublic: existing?.isPublic ?? true,
    displayText: existing?.displayText ?? `MarketsGrid · ${instanceId}`,
    payload: {
      version: (payload.version ?? 0) + 1,
      profiles,
      gridLevelData: payload.gridLevelData ?? { liveProviderId: 'positions.dp' },
    },
    createdBy: existing?.createdBy ?? LOGGED_IN_USER_ID,
    updatedBy: LOGGED_IN_USER_ID,
    creationTime: existing?.creationTime ?? now,
    updatedTime: now,
  });
}

function liveAssignmentCount(handle: MarketsGridHandle): number {
  try {
    const cc = handle.platform.store.getModuleState<{ assignments?: Record<string, unknown> }>(
      'column-customization',
    );
    return Object.keys(cc?.assignments ?? {}).length;
  } catch {
    return 0;
  }
}

async function reloadActiveProfile(handle: MarketsGridHandle): Promise<void> {
  const id = handle.profiles?.activeProfileId ?? '__default__';
  await handle.profiles?.loadProfile(id);
}

/**
 * Re-apply FI formatting after provider column defs mount.
 * Import payload when in-memory assignments are still empty.
 */
export async function applyFiBlotterOnGridReady(handle: MarketsGridHandle): Promise<void> {
  if (!handle.profiles) return;

  await reloadActiveProfile(handle);

  if (liveAssignmentCount(handle) >= MIN_FI_ASSIGNMENTS) return;

  const gridId = handle.platform.gridId ?? SCAFFOLD_BLOTTER_GRID_ID;
  await handle.profiles.importProfile(buildFiProfileImportPayload(gridId), {
    activate: true,
    name: 'Default',
  });
  await reloadActiveProfile(handle);
}

/** Defer until AG-Grid + platform pipeline have applied provider column defs. */
export function scheduleFiBlotterOnGridReady(handle: MarketsGridHandle): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      void applyFiBlotterOnGridReady(handle);
    });
  });
}
