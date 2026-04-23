// ─── Config Service Database (Dexie / IndexedDB) ────────────────────
//
// This file defines the Dexie database schema for the config service.
// All six tables are defined here with their indexes.
//
// Dexie is a thin wrapper around IndexedDB. It provides:
//   - Typed tables with .get(), .put(), .delete(), .where() methods
//   - Schema versioning for migrations
//   - Compound indexes for multi-field queries
//
// The database name "marketsui-config" is shared across all windows
// in the same OpenFin application. Dexie handles concurrent access
// automatically via IndexedDB's built-in locking.

import Dexie, { type Table } from "dexie";
import type {
  AppConfigRow,
  AppRegistryRow,
  PermissionRow,
  PendingSyncRow,
  RoleRow,
  UserProfileRow,
} from './types';

/**
 * The Dexie database for the config service.
 *
 * Contains six tables that store all application configuration,
 * user data, and sync state. See the types file for the shape
 * of each row.
 *
 * ## Index syntax (Dexie shorthand)
 *
 * - `"configId"`         → primary key on `configId`
 * - `"++id"`             → auto-incrementing primary key
 * - `"appId"`            → secondary index for querying by app
 * - `"[componentType+componentSubType]"` → compound index for
 *   querying configs by type and subtype together
 */
export class ConfigDatabase extends Dexie {
  /** Component and template configurations. */
  appConfig!: Table<AppConfigRow>;

  /** Registered applications (one row per deployed app). */
  appRegistry!: Table<AppRegistryRow>;

  /** User profiles with app and role associations. */
  userProfile!: Table<UserProfileRow>;

  /** Role definitions with permission references. */
  roles!: Table<RoleRow>;

  /** Permission definitions (fine-grained access control). */
  permissions!: Table<PermissionRow>;

  /** Queue of failed REST writes waiting to be retried. */
  pendingSync!: Table<PendingSyncRow>;

  constructor() {
    super("marketsui-config");

    // Define the schema for version 1 of the database.
    // Only indexed fields are listed here — Dexie stores all
    // properties of each object, but only indexed fields can
    // be used in .where() queries.
    this.version(1).stores({
      appConfig: "configId, appId, [componentType+componentSubType], isTemplate",
      appRegistry: "appId",
      userProfile: "userId, appId",
      roles: "roleId",
      permissions: "permissionId, category",
      pendingSync: "++id, tableName, recordId",
    });
  }
}
