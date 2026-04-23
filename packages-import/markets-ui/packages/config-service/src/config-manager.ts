// ─── ConfigManager ───────────────────────────────────────────────────
//
// The ConfigManager is the main entry point for the config service.
// It provides CRUD operations for all six database tables and handles
// two modes of operation:
//
//   1. DEV MODE (default) — all reads and writes go to Dexie/IndexedDB.
//      No backend required. Perfect for local development.
//
//   2. REST MODE — when `configServiceRestUrl` is provided, writes go
//      to REST first, then mirror to Dexie. Reads always come from
//      Dexie for speed. Failed REST writes are queued in PENDING_SYNC
//      and retried every 10 seconds.
//
// On first run, if a `seedConfigUrl` is provided and the database is
// empty, the ConfigManager fetches the seed file and populates the
// APP_REGISTRY, USER_PROFILE, and ROLES tables.

import { ConfigDatabase } from './db';
import type {
  AppConfigRow,
  AppRegistryRow,
  ConfigManagerOptions,
  PermissionRow,
  PendingSyncRow,
  RoleRow,
  SeedData,
  UserProfileRow,
} from './types';

// How often to retry failed REST writes.
// 10 seconds is a balance: short enough to recover quickly after a
// network blip, long enough not to flood the server with retries.
const PENDING_SYNC_INTERVAL_MS = 10_000;

// How many times to retry a failed REST write before giving up.
// After MAX_SYNC_RETRIES, the row stays in PENDING_SYNC for manual
// investigation — it is never automatically deleted on failure.
const MAX_SYNC_RETRIES = 10;

// The fixed configId used to store dock button configuration.
// Using a constant avoids typos when reading or writing the record.
const DOCK_CONFIG_ID = "dock-config";

/**
 * Create a new ConfigManager instance.
 *
 * This is the recommended way to create a ConfigManager. Call `init()`
 * after creation to seed the database and start the sync loop.
 *
 * @example
 * ```typescript
 * const configManager = createConfigManager({
 *   seedConfigUrl: "http://localhost:5174/seed-config.json",
 * });
 * await configManager.init();
 *
 * // Use the config manager
 * const config = await configManager.getConfig("my-component-1");
 * ```
 */
export function createConfigManager(options: ConfigManagerOptions = {}): ConfigManager {
  return new ConfigManager(options);
}

/**
 * The ConfigManager provides CRUD operations for all config service
 * database tables. It handles seeding, dual-mode persistence, and
 * sync retry logic.
 *
 * Use `createConfigManager()` to create an instance.
 */
export class ConfigManager {
  private db: ConfigDatabase;
  private seedConfigUrl: string | undefined;
  private restUrl: string | undefined;
  private drainIntervalId: ReturnType<typeof setInterval> | undefined;
  private isInitialized = false;

  constructor(options: ConfigManagerOptions = {}) {
    this.db = new ConfigDatabase();
    this.seedConfigUrl = options.seedConfigUrl;
    this.restUrl = options.configServiceRestUrl;
  }

  // ─── Initialization ──────────────────────────────────────────────

  /**
   * Initialize the config service.
   *
   * On first run (empty database), this loads seed data from the
   * seed config URL. In REST mode, it also starts the background
   * loop that retries failed remote writes.
   *
   * Safe to call multiple times — only runs once.
   */
  async init(): Promise<void> {
    if (this.isInitialized) {
      return;
    }
    this.isInitialized = true;

    // Seed the database if it's empty and a seed URL is provided
    await this.seedIfEmpty();

    // In REST mode, start the background sync drain loop
    if (this.restUrl) {
      this.startSyncDrain();
    }

    console.log(
      `ConfigManager initialized (mode: ${this.restUrl ? "REST" : "local"})`,
    );
  }

  /**
   * Clean up resources. Call this when the application is shutting down.
   * Stops the PENDING_SYNC drain loop and closes the database.
   */
  dispose(): void {
    if (this.drainIntervalId !== undefined) {
      clearInterval(this.drainIntervalId);
      this.drainIntervalId = undefined;
    }
    this.db.close();
  }

  /**
   * Returns true if the ConfigManager is running in REST mode
   * (remote backend enabled), false for local-only mode.
   */
  isRestMode(): boolean {
    return this.restUrl !== undefined;
  }

  // ─── APP_CONFIG operations ────────────────────────────────────────

  /**
   * Get a single config by its ID.
   * Returns undefined if no config exists with that ID.
   */
  async getConfig(configId: string): Promise<AppConfigRow | undefined> {
    return this.db.appConfig.get(configId);
  }

  /**
   * Save a config (create or update).
   * In REST mode, also sends to the remote backend.
   */
  async saveConfig(config: AppConfigRow): Promise<void> {
    // Update the timestamp
    config.updatedAt = new Date().toISOString();

    // In REST mode, try to sync to the remote backend first
    if (this.restUrl) {
      await this.syncToRest("upsert", "appConfig", config.configId, config);
    }

    // Always write to Dexie (the local read path)
    await this.db.appConfig.put(config);
  }

  /**
   * Delete a config by its ID.
   * In REST mode, also deletes from the remote backend.
   */
  async deleteConfig(configId: string): Promise<void> {
    if (this.restUrl) {
      await this.syncToRest("delete", "appConfig", configId, undefined);
    }
    await this.db.appConfig.delete(configId);
  }

  /**
   * Get all configs belonging to a specific app.
   */
  async getConfigsByApp(appId: string): Promise<AppConfigRow[]> {
    return this.db.appConfig.where("appId").equals(appId).toArray();
  }

  /**
   * Get template configs, optionally filtered by component type and subtype.
   * Templates are base configurations that get cloned for new instances.
   */
  async getTemplates(
    componentType?: string,
    componentSubType?: string,
  ): Promise<AppConfigRow[]> {
    let query = this.db.appConfig.where("isTemplate").equals(1);

    // Dexie stores booleans as 0/1 in indexes
    const results = await query.toArray();

    // Filter in memory for optional type/subtype (simpler than compound queries)
    return results.filter((row) => {
      if (componentType && row.componentType !== componentType) return false;
      if (componentSubType && row.componentSubType !== componentSubType) return false;
      return true;
    });
  }

  /**
   * Check if a config exists with the given ID.
   */
  async configExists(configId: string): Promise<boolean> {
    const count = await this.db.appConfig.where("configId").equals(configId).count();
    return count > 0;
  }

  // ─── APP_REGISTRY operations ──────────────────────────────────────

  /**
   * Get an app registry entry by its ID.
   */
  async getAppRegistry(appId: string): Promise<AppRegistryRow | undefined> {
    return this.db.appRegistry.get(appId);
  }

  /**
   * Get all registered apps.
   */
  async getAllApps(): Promise<AppRegistryRow[]> {
    return this.db.appRegistry.toArray();
  }

  // ─── USER_PROFILE operations ──────────────────────────────────────

  /**
   * Get a user profile by user ID.
   */
  async getUserProfile(userId: string): Promise<UserProfileRow | undefined> {
    return this.db.userProfile.get(userId);
  }

  /**
   * Get all user profiles for a specific app.
   */
  async getUsersByApp(appId: string): Promise<UserProfileRow[]> {
    return this.db.userProfile.where("appId").equals(appId).toArray();
  }

  // ─── ROLES operations ─────────────────────────────────────────────

  /**
   * Get a role definition by its ID.
   */
  async getRole(roleId: string): Promise<RoleRow | undefined> {
    return this.db.roles.get(roleId);
  }

  /**
   * Get all role definitions.
   */
  async getAllRoles(): Promise<RoleRow[]> {
    return this.db.roles.toArray();
  }

  // ─── PERMISSIONS operations ────────────────────────────────────────

  /**
   * Get a permission definition by its ID.
   */
  async getPermission(permissionId: string): Promise<PermissionRow | undefined> {
    return this.db.permissions.get(permissionId);
  }

  /**
   * Get all permission definitions.
   */
  async getAllPermissions(): Promise<PermissionRow[]> {
    return this.db.permissions.toArray();
  }

  /**
   * Get all permissions in a specific category (e.g. "config", "admin").
   */
  async getPermissionsByCategory(category: string): Promise<PermissionRow[]> {
    return this.db.permissions.where("category").equals(category).toArray();
  }

  /**
   * Get all permissions that a user has across all their roles.
   *
   * Looks up the user's roles, collects all permissionIds from those
   * roles, deduplicates them, and returns the full PermissionRow for each.
   */
  async getUserPermissions(userId: string): Promise<PermissionRow[]> {
    const user = await this.db.userProfile.get(userId);
    if (!user) {
      return [];
    }

    // Collect all permissionIds from all of the user's roles.
    //
    // NOTE — N+1 query pattern: we make one DB call per role, then one
    // per permission. For the typical case (a few roles, ~10 permissions)
    // this is fast enough and much easier to read than a batched query.
    // If performance becomes an issue with many roles, consider fetching
    // all roles in one call using `.where("roleId").anyOf(user.roleIds)`.
    const allPermissionIds = new Set<string>();
    for (const roleId of user.roleIds) {
      const role = await this.db.roles.get(roleId);
      if (role) {
        for (const permId of role.permissionIds) {
          allPermissionIds.add(permId); // Set deduplicates automatically
        }
      }
    }

    // Fetch the full PermissionRow for each unique permissionId
    const permissions: PermissionRow[] = [];
    for (const permId of allPermissionIds) {
      const perm = await this.db.permissions.get(permId);
      if (perm) {
        permissions.push(perm);
      }
    }

    return permissions;
  }

  /**
   * Check if a user has a specific permission.
   * Returns true if any of the user's roles grant the permission.
   */
  async userHasPermission(userId: string, permissionId: string): Promise<boolean> {
    const user = await this.db.userProfile.get(userId);
    if (!user) {
      return false;
    }

    for (const roleId of user.roleIds) {
      const role = await this.db.roles.get(roleId);
      if (role && role.permissionIds.includes(permissionId)) {
        return true;
      }
    }

    return false;
  }

  // ─── Workspace snapshot convenience methods ────────────────────────
  // Snapshots are stored as APP_CONFIG rows with
  // componentType = "WORKSPACE_SNAPSHOT". The config field holds
  // the snapshot payload (e.g. { instanceIds: [...] }).

  /**
   * Save a workspace snapshot as an APP_CONFIG row.
   * In REST mode, also sends to the remote backend.
   *
   * @param snapshotId - Unique ID for this snapshot
   * @param appId - The app this snapshot belongs to
   * @param snapshotData - The snapshot payload (e.g. { instanceIds: [...] })
   */
  async saveSnapshot(snapshotId: string, appId: string, snapshotData: any): Promise<void> {
    const now = new Date().toISOString();
    const row: AppConfigRow = {
      configId: snapshotId,
      appId,
      displayText: `Snapshot ${snapshotId}`,
      componentType: "WORKSPACE_SNAPSHOT",
      componentSubType: "",
      isTemplate: false,
      config: snapshotData,
      createdBy: "system",
      updatedBy: "system",
      createdAt: now,
      updatedAt: now,
    };
    await this.saveConfig(row);
  }

  /**
   * Get a specific workspace snapshot by its ID.
   * Returns the snapshot's config payload, or undefined if not found.
   */
  async getSnapshot(snapshotId: string): Promise<any | undefined> {
    const row = await this.getConfig(snapshotId);
    if (!row || row.componentType !== "WORKSPACE_SNAPSHOT") {
      return undefined;
    }
    return row.config;
  }

  /**
   * Get the most recently saved snapshot for a given app.
   * Returns the snapshot's config payload, or undefined if none exist.
   */
  async getLatestSnapshot(appId: string): Promise<any | undefined> {
    const allForApp = await this.getConfigsByApp(appId);

    // Filter to only snapshots, then sort by updatedAt descending
    const snapshots = allForApp
      .filter((row) => row.componentType === "WORKSPACE_SNAPSHOT")
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    if (snapshots.length === 0) {
      return undefined;
    }
    return snapshots[0].config;
  }

  // ─── Dock config convenience methods ──────────────────────────────
  // These methods provide a simple API for dock configuration that
  // is compatible with the existing saveDockConfig/loadDockConfig
  // functions in @markets/openfin-workspace.

  /**
   * Save the dock editor configuration.
   * Stores it as an APP_CONFIG row with configId "dock-config".
   */
  async saveDockConfig(dockConfig: any): Promise<void> {
    const now = new Date().toISOString();

    const row: AppConfigRow = {
      configId: DOCK_CONFIG_ID,
      appId: "",
      displayText: "Dock Configuration",
      componentType: "DOCK",
      componentSubType: "",
      isTemplate: false,
      config: dockConfig,
      createdBy: "system",
      updatedBy: "system",
      createdAt: now,
      updatedAt: now,
    };

    // Check if a dock config already exists to preserve createdAt
    const existing = await this.db.appConfig.get(DOCK_CONFIG_ID);
    if (existing) {
      row.createdAt = existing.createdAt;
    }

    await this.saveConfig(row);
  }

  /**
   * Load the dock editor configuration.
   * Returns null if no dock config has been saved yet.
   */
  async loadDockConfig(): Promise<any | null> {
    const row = await this.db.appConfig.get(DOCK_CONFIG_ID);
    if (!row) {
      return null;
    }
    return row.config;
  }

  /**
   * Delete the dock editor configuration.
   */
  async clearDockConfig(): Promise<void> {
    await this.db.appConfig.delete(DOCK_CONFIG_ID);
  }

  // ─── Seeding ──────────────────────────────────────────────────────

  /**
   * Load seed data from the seed config URL if the database is empty.
   *
   * Only runs on first launch — if APP_REGISTRY already has entries,
   * seeding is skipped. This prevents overwriting user changes on
   * subsequent app starts.
   */
  private async seedIfEmpty(): Promise<void> {
    if (!this.seedConfigUrl) {
      return;
    }

    // Check if the database already has data
    const appCount = await this.db.appRegistry.count();
    if (appCount > 0) {
      console.log("ConfigManager: Database already seeded, skipping.");
      return;
    }

    console.log(`ConfigManager: Seeding database from ${this.seedConfigUrl}`);

    try {
      const response = await fetch(this.seedConfigUrl);
      if (!response.ok) {
        // Log prominently — a developer starting the app for the first time
        // needs to know that seeding failed (database will be empty).
        console.error(
          `ConfigManager: ⚠️ Failed to fetch seed data from ${this.seedConfigUrl} (HTTP ${response.status}). ` +
          "The database will start empty. Check that the dev server is running and the seedConfigUrl is correct.",
        );
        return;
      }

      const seedData: SeedData = await response.json();

      // Insert seed data into each table using a transaction
      // so that either all tables are seeded or none are.
      await this.db.transaction(
        "rw",
        [this.db.appRegistry, this.db.userProfile, this.db.roles, this.db.permissions],
        async () => {
          if (seedData.permissions && seedData.permissions.length > 0) {
            await this.db.permissions.bulkPut(seedData.permissions);
            console.log(`ConfigManager: Seeded ${seedData.permissions.length} permissions.`);
          }

          if (seedData.roles && seedData.roles.length > 0) {
            await this.db.roles.bulkPut(seedData.roles);
            console.log(`ConfigManager: Seeded ${seedData.roles.length} roles.`);
          }

          if (seedData.appRegistry && seedData.appRegistry.length > 0) {
            await this.db.appRegistry.bulkPut(seedData.appRegistry);
            console.log(`ConfigManager: Seeded ${seedData.appRegistry.length} app registry entries.`);
          }

          if (seedData.userProfiles && seedData.userProfiles.length > 0) {
            await this.db.userProfile.bulkPut(seedData.userProfiles);
            console.log(`ConfigManager: Seeded ${seedData.userProfiles.length} user profiles.`);
          }
        },
      );

      console.log("ConfigManager: Database seeding complete.");
    } catch (error) {
      console.error("ConfigManager: Error seeding database.", error);
    }
  }

  // ─── REST sync ────────────────────────────────────────────────────

  /**
   * Attempt to sync a write operation to the remote REST backend.
   *
   * If the REST call fails, the operation is queued in PENDING_SYNC
   * for automatic retry later.
   */
  private async syncToRest(
    operation: "upsert" | "delete",
    tableName: string,
    recordId: string,
    payload: any,
  ): Promise<void> {
    if (!this.restUrl) {
      return;
    }

    try {
      const url = `${this.restUrl}/${tableName}/${recordId}`;
      const method = operation === "delete" ? "DELETE" : "PUT";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: operation === "delete" ? undefined : JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`REST sync failed with HTTP ${response.status}`);
      }
    } catch (error) {
      console.warn(
        `ConfigManager: REST sync failed for ${operation} ${tableName}/${recordId}. Queuing for retry.`,
        error,
      );

      // Queue the failed operation for retry
      const pendingEntry: PendingSyncRow = {
        operation,
        tableName,
        recordId,
        payload,
        createdAt: new Date().toISOString(),
        retries: 0,
      };
      await this.db.pendingSync.add(pendingEntry);
    }
  }

  /**
   * Start the background loop that retries failed REST writes.
   * Runs every 10 seconds. Only active in REST mode.
   */
  private startSyncDrain(): void {
    this.drainIntervalId = setInterval(async () => {
      await this.drainPendingSync();
    }, PENDING_SYNC_INTERVAL_MS);
  }

  /**
   * Process all entries in the PENDING_SYNC table.
   *
   * For each entry:
   *   - Retry the REST call
   *   - On success: delete the entry from PENDING_SYNC
   *   - On failure: increment the retry counter
   *   - After MAX_SYNC_RETRIES: log an error and stop retrying
   */
  private async drainPendingSync(): Promise<void> {
    if (!this.restUrl) {
      return;
    }

    const pendingEntries = await this.db.pendingSync.toArray();
    if (pendingEntries.length === 0) {
      return;
    }

    console.log(`ConfigManager: Draining ${pendingEntries.length} pending sync entries.`);

    for (const entry of pendingEntries) {
      // `id` is auto-assigned by Dexie on insert (++id primary key).
      // It should always be present on rows read from the database,
      // but we guard here so a corrupt row doesn't crash the drain loop.
      if (entry.id === undefined) {
        console.warn("ConfigManager: Skipping pending sync entry with no id.", entry);
        continue;
      }

      // Skip entries that have exceeded the retry limit
      if (entry.retries >= MAX_SYNC_RETRIES) {
        console.error(
          `ConfigManager: Giving up on sync for ${entry.tableName}/${entry.recordId} after ${entry.retries} retries.`,
        );
        continue;
      }

      try {
        const url = `${this.restUrl}/${entry.tableName}/${entry.recordId}`;
        const method = entry.operation === "delete" ? "DELETE" : "PUT";

        const response = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: entry.operation === "delete" ? undefined : JSON.stringify(entry.payload),
        });

        if (response.ok) {
          // Success — remove from the queue
          await this.db.pendingSync.delete(entry.id);
        } else {
          throw new Error(`HTTP ${response.status}`);
        }
      } catch (err) {
        // Failed again — increment the retry counter
        console.warn("Pending sync retry failed for entry", entry.id, err);
        await this.db.pendingSync.update(entry.id, {
          retries: entry.retries + 1,
        });
      }
    }
  }
}
