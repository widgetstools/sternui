// ─── Dock + Registry persistence (backed by @marketsui/config-service) ───
//
// This file is the single entry point for dock-editor and
// registry-editor persistence. Both save as `AppConfigRow` rows
// through the generic `ConfigManager.saveConfig()` API — mirroring
// MarketsGrid's `createConfigServiceStorage(...)` pattern in
// `packages/config-service/src/profile-storage.ts`.
//
// Shared invariants with MarketsGrid profile rows:
//   • `componentType` is a kebab-case domain discriminator
//     (e.g. `'dock-config'`, `'component-registry'`) matching the
//     canonical constants exported from `@marketsui/shared-types`.
//   • `(appId, userId, configId)` triple uniquely identifies a row
//     from a given owner's point of view. The Config Browser shows
//     dock + registry rows alongside MarketsGrid profile-set rows
//     with no special casing.
//   • `creationTime` is preserved across overwrites; `updatedTime`
//     is refreshed on every save.
//
// Back-compat: earlier versions wrote `componentType: "DOCK"` /
// `"REGISTRY"` via now-removed ConfigManager shim methods. The load
// functions below recognise those historical values and their
// configIds so existing Dexie rows continue to work after upgrade.
// The next save rewrites them in the canonical shape.

import { createConfigManager, type ConfigManager } from "@marketsui/config-service";
import type { AppConfigRow } from "@marketsui/config-service";
import { COMPONENT_TYPES } from "@marketsui/shared-types";
import type { DockEditorConfig } from './dock-config-types';
import type { RegistryEditorConfig } from './registry-config-types';

// ─── Singleton management ────────────────────────────────────────────

/**
 * Module-level ConfigManager singleton.
 *
 * Set by `setConfigManager()` (called from workspace.ts during init).
 * If not set, a fallback instance is created on first use so that
 * the dock-editor window (which runs in a separate process) still
 * has access to the same Dexie database.
 */
let configManagerInstance: ConfigManager | undefined;

/**
 * Holds the in-progress init promise when the fallback ConfigManager
 * is being created. This prevents a race condition where two concurrent
 * callers both try to create separate instances before the first one
 * has finished initialising.
 */
let initPromise: Promise<ConfigManager> | undefined;

/**
 * Set the shared ConfigManager instance.
 *
 * Called once from workspace.ts after creating and initializing
 * the ConfigManager during platform startup. Once set, the
 * getConfigManager() fallback path is never used.
 */
export function setConfigManager(manager: ConfigManager): void {
  configManagerInstance = manager;
}

/**
 * Returns the ConfigManager instance, creating a fallback if needed.
 *
 * Why a fallback? The dock-editor runs in a separate OpenFin child
 * window. That window can't access the provider's in-memory
 * configManagerInstance, so it creates its own — which still connects
 * to the same Dexie database on disk.
 *
 * The promise guard (initPromise) ensures that even if this function
 * is called multiple times before the first init completes, only one
 * ConfigManager is ever created.
 */
export async function getConfigManager(): Promise<ConfigManager> {
  if (configManagerInstance) return configManagerInstance;
  if (!initPromise) {
    initPromise = (async () => {
      const manager = createConfigManager();
      await manager.init();
      configManagerInstance = manager;
      initPromise = undefined;
      return manager;
    })();
  }
  return initPromise;
}

// ─── Scoping options (shared by dock + registry) ─────────────────────

/**
 * Scope under which a dock / registry config is stored.
 *
 * The defaults (`appId: 'system'`, `userId: 'system'`) preserve the
 * pre-refactor global-singleton behaviour — existing call-sites that
 * don't pass scope continue to save to the same rows they did before.
 * Hosting apps that want per-user or per-app separation pass real
 * values.
 */
export interface ConfigScope {
  appId?: string;
  userId?: string;
}

/**
 * Hard-coded fallback scope used before the platform calls
 * `setPlatformDefaultScope()`. Kept distinct from `currentPlatformScope`
 * (mutable) so the legacy back-compat fallback in `loadDockConfig` and
 * `loadRegistryConfig` always knows what the original "system/system"
 * shape was.
 */
const LEGACY_DEFAULT_SCOPE: Required<ConfigScope> = { appId: 'system', userId: 'system' };

/**
 * Live default scope. Platform shells call `setPlatformDefaultScope()`
 * during `initWorkspace()` so that all save/load calls in this module
 * default to the platform's own `(appId, userId)` — keeping dock,
 * registry, MarketsGrid profiles, and any other per-app config under
 * one scope key. Until the platform sets it, we behave like the legacy
 * `system/system` default for bit-for-bit back-compat with rows
 * written before this refactor.
 */
let currentPlatformScope: Required<ConfigScope> = { ...LEGACY_DEFAULT_SCOPE };

/**
 * Set the default `(appId, userId)` for every save/load call that
 * doesn't pass an explicit scope. Idempotent — safe to call on every
 * platform boot.
 */
export function setPlatformDefaultScope(scope: ConfigScope): void {
  currentPlatformScope = {
    appId: scope.appId ?? currentPlatformScope.appId,
    userId: scope.userId ?? currentPlatformScope.userId,
  };
}

/**
 * Read the currently-active platform default scope. Returns the
 * `LEGACY_DEFAULT_SCOPE` snapshot before `setPlatformDefaultScope` has
 * been called. Useful for callers that need to forward the platform's
 * scope into child windows (e.g. the Config Browser's `appId` chip).
 */
export function getPlatformDefaultScope(): Required<ConfigScope> {
  return { ...currentPlatformScope };
}

function resolveScope(scope: ConfigScope | undefined): Required<ConfigScope> {
  return {
    appId: scope?.appId ?? currentPlatformScope.appId,
    userId: scope?.userId ?? currentPlatformScope.userId,
  };
}

/**
 * The userId stamped on rows that are GLOBAL within an app — shared by
 * every user. The component registry is the canonical example: every
 * user of the app sees the same catalog. Per-user data (dock layout,
 * per-instance configs, saved workspaces) keeps its real userId.
 */
const GLOBAL_USER_ID = 'system';

/**
 * Force the userId portion of the resolved scope to GLOBAL_USER_ID. The
 * appId still derives from the caller or platform default, so different
 * apps get different global registries (matching the locked
 * "componentType+componentSubType unique within an app" rule).
 *
 * Used by the registry CRUD so all calls — regardless of which user is
 * signed in — read and write the same row.
 */
function resolveGlobalScope(scope: ConfigScope | undefined): Required<ConfigScope> {
  return {
    appId: scope?.appId ?? currentPlatformScope.appId,
    userId: GLOBAL_USER_ID,
  };
}

/**
 * Primary-key composition. MarketsGrid uses `configId === instanceId`
 * because it owns a separate row per (appId, userId, instanceId)
 * triple. DockEditor + Registry have a single "logical" config per
 * scope, so we encode the scope into `configId` when it differs from
 * the platform default — this keeps each owner's row distinct under
 * the primary-key-is-configId invariant.
 *
 * When scope matches the live platform default, we keep the bare
 * configIds (`dock-config`, `component-registry`) — same row, just
 * tagged with whichever `(appId, userId)` the platform configured.
 */
function scopedConfigId(base: string, scope: Required<ConfigScope>): string {
  if (scope.appId === currentPlatformScope.appId && scope.userId === currentPlatformScope.userId) {
    return base;
  }
  return `${base}::${scope.appId}::${scope.userId}`;
}

// ─── Dock config ─────────────────────────────────────────────────────

const DOCK_CONFIG_BASE_ID = 'dock-config';
const DOCK_DISPLAY = 'Dock Configuration';
/** Back-compat componentType written by pre-refactor saves. */
const LEGACY_DOCK_COMPONENT_TYPE = 'DOCK';

/** Save the dock button configuration. Overwrites any previous save in the same scope. */
export async function saveDockConfig(
  config: DockEditorConfig,
  scope?: ConfigScope,
): Promise<void> {
  const resolved = resolveScope(scope);
  const configId = scopedConfigId(DOCK_CONFIG_BASE_ID, resolved);
  const manager = await getConfigManager();
  const existing = await manager.getConfig(configId);
  const now = new Date().toISOString();

  const row: AppConfigRow = {
    configId,
    appId: resolved.appId,
    userId: resolved.userId,
    displayText: DOCK_DISPLAY,
    componentType: COMPONENT_TYPES.DOCK_CONFIG,
    componentSubType: '',
    isTemplate: false,
    payload: config,
    createdBy: existing?.createdBy ?? resolved.userId,
    updatedBy: resolved.userId,
    creationTime: existing?.creationTime ?? now,
    updatedTime: now,
  };
  await manager.saveConfig(row);
}

/** Load the saved dock button configuration. Returns null if none. */
export async function loadDockConfig(
  scope?: ConfigScope,
): Promise<DockEditorConfig | null> {
  const resolved = resolveScope(scope);
  const manager = await getConfigManager();
  const scoped = await manager.getConfig(scopedConfigId(DOCK_CONFIG_BASE_ID, resolved));
  if (scoped) return scoped.payload as DockEditorConfig;
  // Back-compat fallback: the bare legacy row (configId='dock-config',
  // componentType='DOCK', appId='', userId='system') still loads even
  // after we've re-scoped new saves.
  if (resolved.appId === LEGACY_DEFAULT_SCOPE.appId && resolved.userId === LEGACY_DEFAULT_SCOPE.userId) {
    const legacy = await manager.getConfig(DOCK_CONFIG_BASE_ID);
    if (legacy && (legacy.componentType === LEGACY_DOCK_COMPONENT_TYPE ||
                   legacy.componentType === COMPONENT_TYPES.DOCK_CONFIG)) {
      return legacy.payload as DockEditorConfig;
    }
  }
  return null;
}

/** Clear the saved dock configuration. */
export async function clearDockConfig(scope?: ConfigScope): Promise<void> {
  const resolved = resolveScope(scope);
  const manager = await getConfigManager();
  await manager.deleteConfig(scopedConfigId(DOCK_CONFIG_BASE_ID, resolved));
}

// ─── Registry config ─────────────────────────────────────────────────

const REGISTRY_CONFIG_BASE_ID = 'component-registry';
const REGISTRY_DISPLAY = 'Component Registry';
/** Back-compat componentType written by pre-refactor saves. */
const LEGACY_REGISTRY_COMPONENT_TYPE = 'REGISTRY';

/**
 * Save the component registry configuration.
 *
 * The registry is GLOBAL within an app (see `resolveGlobalScope`). The
 * `userId` portion of the passed scope is intentionally ignored — every
 * user of the app reads and writes the same row. This matches the
 * locked design: catalogue is shared, per-user data is per-user.
 */
export async function saveRegistryConfig(
  config: RegistryEditorConfig,
  scope?: ConfigScope,
): Promise<void> {
  const resolved = resolveGlobalScope(scope);
  const configId = scopedConfigId(REGISTRY_CONFIG_BASE_ID, resolved);
  const manager = await getConfigManager();
  const existing = await manager.getConfig(configId);
  const now = new Date().toISOString();

  const row: AppConfigRow = {
    configId,
    appId: resolved.appId,
    userId: resolved.userId,
    displayText: REGISTRY_DISPLAY,
    componentType: COMPONENT_TYPES.COMPONENT_REGISTRY,
    componentSubType: '',
    isTemplate: false,
    payload: config,
    createdBy: existing?.createdBy ?? resolved.userId,
    updatedBy: resolved.userId,
    creationTime: existing?.creationTime ?? now,
    updatedTime: now,
  };
  await manager.saveConfig(row);
}

/**
 * Load the saved component registry configuration. Returns null if none.
 *
 * Read order (first hit wins):
 *   1. The new GLOBAL location ((appId, 'system')) — Phase 4 onward
 *   2. The pre-Phase-4 platform-default-scoped row — for unmigrated
 *      installs. Removed once Phase 5's migration has run on all clients.
 *   3. The very-legacy bare-`component-registry` row — for v1 installs.
 */
export async function loadRegistryConfig(
  scope?: ConfigScope,
): Promise<RegistryEditorConfig | null> {
  const manager = await getConfigManager();

  // (1) New global location
  const global = resolveGlobalScope(scope);
  const globalRow = await manager.getConfig(scopedConfigId(REGISTRY_CONFIG_BASE_ID, global));
  if (globalRow) return globalRow.payload as RegistryEditorConfig;

  // (2) Pre-Phase-4 location: stored under the calling user's scope
  const perUser = resolveScope(scope);
  const perUserRow = await manager.getConfig(scopedConfigId(REGISTRY_CONFIG_BASE_ID, perUser));
  if (perUserRow) return perUserRow.payload as RegistryEditorConfig;

  // (3) v1 legacy bare-id row at the legacy 'system'/'system' default
  if (perUser.appId === LEGACY_DEFAULT_SCOPE.appId && perUser.userId === LEGACY_DEFAULT_SCOPE.userId) {
    const legacy = await manager.getConfig(REGISTRY_CONFIG_BASE_ID);
    if (legacy && (legacy.componentType === LEGACY_REGISTRY_COMPONENT_TYPE ||
                   legacy.componentType === COMPONENT_TYPES.COMPONENT_REGISTRY)) {
      return legacy.payload as RegistryEditorConfig;
    }
  }
  return null;
}

/** Clear the saved component registry configuration (the GLOBAL one). */
export async function clearRegistryConfig(scope?: ConfigScope): Promise<void> {
  const resolved = resolveGlobalScope(scope);
  const manager = await getConfigManager();
  await manager.deleteConfig(scopedConfigId(REGISTRY_CONFIG_BASE_ID, resolved));
}

// ─── One-shot legacy-scope migration ─────────────────────────────────

/**
 * Re-tag pre-platform `appId='system' / userId='system'` dock + registry
 * rows so they carry the live `currentPlatformScope` instead. Idempotent,
 * cheap to call on every platform boot.
 *
 * Why this matters: the Config Browser filters App Config rows by the
 * runtime `appId` (typically `fin.me.identity.uuid`). Rows still carrying
 * the legacy `'system'` appId are invisible to the browser even though
 * they live in the same Dexie database. After this runs once, the dock
 * and registry rows show up in the browser alongside everything else
 * the platform writes under its own scope.
 *
 * Only operates on rows whose `configId` is the bare `dock-config` /
 * `component-registry` (i.e. originally written under the legacy default
 * scope). Suffixed configIds (`dock-config::someApp::someUser`) are left
 * untouched — they were already explicitly scoped.
 */
export async function migrateLegacyPlatformScope(): Promise<{ migrated: number }> {
  const manager = await getConfigManager();
  let migrated = 0;
  for (const baseId of [DOCK_CONFIG_BASE_ID, REGISTRY_CONFIG_BASE_ID] as const) {
    const row = await manager.getConfig(baseId);
    if (!row) continue;
    const onLegacyScope =
      row.appId === LEGACY_DEFAULT_SCOPE.appId &&
      row.userId === LEGACY_DEFAULT_SCOPE.userId;
    const onPlatformScope =
      row.appId === currentPlatformScope.appId &&
      row.userId === currentPlatformScope.userId;
    if (!onLegacyScope || onPlatformScope) continue;
    const now = new Date().toISOString();
    await manager.saveConfig({
      ...row,
      appId: currentPlatformScope.appId,
      userId: currentPlatformScope.userId,
      updatedBy: currentPlatformScope.userId,
      updatedTime: now,
    });
    migrated += 1;
  }
  return { migrated };
}

/**
 * Broad sweep: re-stamp EVERY row in the `appConfig` table so its
 * `appId` and `userId` columns match the current platform default scope.
 *
 * Stronger than `migrateLegacyPlatformScope()` — that only touches the
 * legacy `'system'/'system'` dock + registry rows. This walks every row
 * regardless of original scope. Rows whose scope columns already match
 * the platform default are skipped (idempotent).
 *
 * `configId` (the primary key) is preserved — the row keeps its identity
 * and payload; only the scope columns + `updatedBy`/`updatedTime` change.
 *
 * Use this when you want the entire local Dexie store to collapse onto
 * a single canonical `(appId, userId)` — e.g. after seeding TestApp /
 * dev1 and you want every pre-existing row visible under that chip.
 */
export async function realignAllConfigsToPlatformScope(): Promise<{ realigned: number; total: number }> {
  const manager = await getConfigManager();
  const rows = await manager.getAllConfigs();
  const now = new Date().toISOString();
  let realigned = 0;
  for (const row of rows) {
    if (
      row.appId === currentPlatformScope.appId &&
      row.userId === currentPlatformScope.userId
    ) continue;
    await manager.saveConfig({
      ...row,
      appId: currentPlatformScope.appId,
      userId: currentPlatformScope.userId,
      updatedBy: currentPlatformScope.userId,
      updatedTime: now,
    });
    realigned += 1;
  }
  return { realigned, total: rows.length };
}
