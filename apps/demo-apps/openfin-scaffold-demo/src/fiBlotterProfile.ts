/**
 * FI blotter profile seeding + runtime re-apply for openfin-scaffold-blotter.
 *
 * Config import can lose to an empty `__default__` created on first grid visit,
 * or profile state may hydrate before provider column defs exist. This module
 * repairs storage when needed and forces a profile reload after the live grid mounts.
 *
 * Profile restore (`whenBooted` + `reloadActive`) runs in MarketsGridContainer
 * before `onReady` reaches this module — do not duplicate reloads here.
 */
import type { MarketsGridHandle } from '@starui/grid';
import { LOGGED_IN_USER_ID } from '@starui/types';
import {
  buildDefaultProfileSnapshot,
  SCAFFOLD_BLOTTER_GRID_ID,
} from '../config/stompPositionsFiSchema.js';

/** Must match `useHostedIdentity` / starter JSON `appId`. */
const HOST_APP_ID = 'TestApp';

const PROFILE_TRACE_PREFIX = '[profiles:trace]';

/** Local trace helper — avoids Vite optimizeDeps stale export on @starui/engine. */
function traceProfile(phase: string, detail?: Record<string, unknown>): void {
  if (typeof localStorage !== 'undefined') {
    try {
      if (localStorage.getItem('starui.profileTrace') === '0') return;
    } catch {
      /* ignore */
    }
  }
  if (detail && Object.keys(detail).length > 0) {
    console.log(PROFILE_TRACE_PREFIX, phase, detail);
  } else {
    console.log(PROFILE_TRACE_PREFIX, phase);
  }
}

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

const RESERVED_DEFAULT_PROFILE_ID = '__default__';

function waitTwoFrames(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

/**
 * Repair FI Default formatting when the active profile is `__default__`.
 *
 * Called from Blotter `onReady` after MarketsGridContainer has already
 * booted and reloaded the active profile — only seeds storage and reloads
 * when live assignments are still below the FI threshold.
 */
export async function applyFiBlotterOnGridReady(
  handle: MarketsGridHandle,
  configManager: ConfigManagerLike,
): Promise<void> {
  if (!handle.profiles) return;

  const activeId = handle.profiles.getActiveProfileId?.()
    ?? handle.profiles.activeProfileId
    ?? RESERVED_DEFAULT_PROFILE_ID;

  traceProfile('fi-blotter.onGridReady', { activeProfileId: activeId });

  // Container reload already applied user-selected profiles.
  if (activeId !== RESERVED_DEFAULT_PROFILE_ID) return;

  let count = liveAssignmentCount(handle);
  if (count >= MIN_FI_ASSIGNMENTS) {
    traceProfile('fi-blotter.skip', { reason: 'assignments-ok', assignmentCount: count });
    return;
  }

  traceProfile('fi-blotter.default.seed', { assignmentCount: count, pass: 'initial' });
  await ensureFiBlotterProfileRow(configManager);
  await handle.profiles.reloadActiveProfile?.({ traceReason: 'fi-blotter.after-seed' })
    ?? handle.profiles.loadProfile(RESERVED_DEFAULT_PROFILE_ID, { traceReason: 'fi-blotter.after-seed' });

  count = liveAssignmentCount(handle);
  if (count >= MIN_FI_ASSIGNMENTS) {
    traceProfile('fi-blotter.default.done', { assignmentCount: count, pass: 'initial', seeded: true });
    return;
  }

  // Column defs may still be settling — recheck once before a second reload.
  await waitTwoFrames();
  count = liveAssignmentCount(handle);
  if (count >= MIN_FI_ASSIGNMENTS) {
    traceProfile('fi-blotter.default.done', { assignmentCount: count, pass: 'deferred-count', seeded: true });
    return;
  }

  await handle.profiles.reloadActiveProfile?.({ traceReason: 'fi-blotter.deferred-rebind' })
    ?? handle.profiles.loadProfile(RESERVED_DEFAULT_PROFILE_ID, { traceReason: 'fi-blotter.deferred-rebind' });
  traceProfile('fi-blotter.default.done', {
    assignmentCount: liveAssignmentCount(handle),
    pass: 'deferred-rebind',
    seeded: true,
  });
}
