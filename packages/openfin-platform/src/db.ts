// ─── Dock config persistence (backed by @marketsui/config-service) ───
//
// This file provides the same public API as the original db.ts, but
// delegates all persistence to the shared ConfigManager from
// @marketsui/config-service.
//
// The dock-editor package imports these functions — by keeping the
// same export signatures, no changes are needed in dock-editor.
//
// The ConfigManager singleton is initialized in workspace.ts during
// platform startup. Until then, these functions create a temporary
// local ConfigManager as a fallback (this handles the dock-editor
// window, which runs in a separate process and may not have access
// to the provider's ConfigManager instance).

import { createConfigManager, type ConfigManager } from "@marketsui/config-service";
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
 *
 * How it works:
 *   - First caller: creates the promise and awaits it.
 *   - Concurrent callers: receive the same promise and await the same result.
 *   - Once resolved, configManagerInstance is set and the promise is cleared.
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
  // Fast path: instance already exists
  if (configManagerInstance) {
    return configManagerInstance;
  }

  // If init is already in progress, wait for that same promise
  // rather than starting a second one.
  if (!initPromise) {
    initPromise = (async () => {
      const manager = createConfigManager();
      await manager.init();
      configManagerInstance = manager;
      initPromise = undefined; // clear so it can be GC'd
      return manager;
    })();
  }

  return initPromise;
}

// ─── Public API (same signatures as before) ──────────────────────────

/**
 * Save the dock button configuration.
 * Overwrites any previously saved config.
 */
export async function saveDockConfig(config: DockEditorConfig): Promise<void> {
  const manager = await getConfigManager();
  await manager.saveDockConfig(config);
}

/**
 * Load the saved dock button configuration.
 * Returns null if no config has been saved yet.
 */
export async function loadDockConfig(): Promise<DockEditorConfig | null> {
  const manager = await getConfigManager();
  return manager.loadDockConfig();
}

/**
 * Clear the saved dock configuration.
 * Next startup will fall back to manifest defaults.
 */
export async function clearDockConfig(): Promise<void> {
  const manager = await getConfigManager();
  await manager.clearDockConfig();
}

// ─── Registry config persistence ────────────────────────────────────

/**
 * Save the component registry configuration.
 * Overwrites any previously saved registry config.
 */
export async function saveRegistryConfig(config: RegistryEditorConfig): Promise<void> {
  const manager = await getConfigManager();
  await manager.saveConfig({
    configId: "component-registry",
    appId: "system",
    displayText: "Component Registry",
    componentType: "REGISTRY",
    componentSubType: "EDITOR",
    isTemplate: false,
    config,
    createdBy: "registry-editor",
    updatedBy: "registry-editor",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Load the saved component registry configuration.
 * Returns null if no registry has been saved yet.
 */
export async function loadRegistryConfig(): Promise<RegistryEditorConfig | null> {
  const manager = await getConfigManager();
  const row = await manager.getConfig("component-registry");
  return row ? (row.config as RegistryEditorConfig) : null;
}

/**
 * Clear the saved component registry configuration.
 */
export async function clearRegistryConfig(): Promise<void> {
  const manager = await getConfigManager();
  await manager.deleteConfig("component-registry");
}
