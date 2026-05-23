/**
 * FI blotter profile seeding for openfin-scaffold-blotter.
 *
 * Two surfaces:
 *
 *  - `ensureFiBlotterProfileRow` — seeds Dexie's bundled profile-set row
 *    with the FI Default profile before MarketsGrid boots. Fires from
 *    `BlotterView`'s mount effect.
 *
 *  - `applyFiBlotterOnGridReady` — Blotter-side onReady hook. Only fixes
 *    the *Default* profile when its live assignments are missing (e.g.
 *    user is on Default and the seed lost the race with column-defs
 *    mounting). It MUST NOT touch any other profile — the
 *    MarketsGridContainer onReady already reloads whichever profile the
 *    user last selected, so any reload here would either duplicate that
 *    work or override the user's choice.
 *
 *  The earlier `importProfile` fallback was removed: import is additive
 *  by design and was producing duplicate "Default (imported N)" rows on
 *  every remount (StrictMode + OpenFin reconnects + provider switches).
 */
import type { MarketsGridHandle } from '@starui/grid';
import { LOGGED_IN_USER_ID } from '@starui/types';
import {
  buildDefaultProfileSnapshot,
  SCAFFOLD_BLOTTER_GRID_ID,
} from '../config/stompPositionsFiSchema.js';

const RESERVED_DEFAULT_PROFILE_ID = '__default__';

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

function waitTwoFrames(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

/**
 * Blotter onReady hook — only repairs the Default profile when its FI
 * assignments are missing. Other active profiles (user-created or
 * imported workspace profiles) are left untouched: MarketsGridContainer
 * has already reloaded them, and overriding here would discard the
 * user's selection.
 */
export async function applyFiBlotterOnGridReady(
  handle: MarketsGridHandle,
  configManager: ConfigManagerLike,
): Promise<void> {
  if (!handle.profiles) return;

  const activeId = handle.profiles.activeProfileId ?? RESERVED_DEFAULT_PROFILE_ID;
  if (activeId !== RESERVED_DEFAULT_PROFILE_ID) return;

  if (liveAssignmentCount(handle) >= MIN_FI_ASSIGNMENTS) return;

  // Default is active and missing FI formatting — seed and reload.
  // `silent: true` so this internal re-bind doesn't overwrite the
  // OpenFin workspace's `activeProfileId` customData. Without it, a user
  // who had a non-Default profile selected but couldn't load it (race
  // during workspace restore) would have their pointer overwritten by
  // Default here, permanently destroying their workspace's last
  // selection.
  await ensureFiBlotterProfileRow(configManager);
  await handle.profiles.loadProfile(RESERVED_DEFAULT_PROFILE_ID, { silent: true });
  if (liveAssignmentCount(handle) >= MIN_FI_ASSIGNMENTS) return;

  // Column defs may still be settling — wait one tick and try once more.
  await waitTwoFrames();
  if (liveAssignmentCount(handle) >= MIN_FI_ASSIGNMENTS) return;
  await handle.profiles.loadProfile(RESERVED_DEFAULT_PROFILE_ID, { silent: true });
}
