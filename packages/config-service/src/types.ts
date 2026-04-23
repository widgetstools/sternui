// ─── Config Service Types ────────────────────────────────────────────
//
// These types define the shape of every row stored in the config
// service database (Dexie/IndexedDB). They are also used by the
// REST adapter when syncing with a remote backend.
//
// All timestamps are ISO 8601 strings (e.g. "2026-03-28T12:00:00Z").
// All IDs are plain strings — no auto-increment except PENDING_SYNC.

// ─── APP_CONFIG ──────────────────────────────────────────────────────

/**
 * A single configuration record for a component instance or template.
 *
 * Templates (`isTemplate: true`) are base configs that get cloned when
 * a user opens a new component. Instances (`isTemplate: false`) are
 * user-specific copies with customizations.
 *
 * The `config` field holds the full component configuration as a JSON
 * object. Its shape depends on `componentType` (e.g. BlotterConfig
 * for "GRID", DockEditorConfig for "DOCK").
 */
export interface AppConfigRow {
  /** Primary key — instanceId for instances, templateId for templates. */
  configId: string;

  /** Foreign key → APP_REGISTRY. Identifies which app owns this config. */
  appId: string;

  /** Human-readable label shown in toolbars and menus. */
  displayText: string;

  /** The type of component: "GRID", "CHART", "HEATMAP", "ORDERTICKET", "DOCK", etc. */
  componentType: string;

  /** Sub-category within the component type: "CREDIT", "RATES", "MBS", "CMBS", etc. */
  componentSubType: string;

  /** True = base template config, false = user-specific instance. */
  isTemplate: boolean;

  /** The full component configuration object (shape varies by componentType). */
  config: any;

  /** User ID of the person who created this config. */
  createdBy: string;

  /** User ID of the person who last modified this config. */
  updatedBy: string;

  /** ISO timestamp of when this config was first created. */
  createdAt: string;

  /** ISO timestamp of the last modification. Used for conflict resolution. */
  updatedAt: string;
}

// ─── APP_REGISTRY ────────────────────────────────────────────────────

/**
 * An entry in the application registry. One row per deployed app.
 *
 * The `appId` matches the `platform.uuid` field in the app's
 * manifest.fin.json file.
 */
export interface AppRegistryRow {
  /** Primary key — matches the platform UUID from the manifest. */
  appId: string;

  /** Human-readable name of the application. */
  displayName: string;

  /** URL to the app's OpenFin manifest file. */
  manifestUrl: string;

  /** Whether this app uses the remote config service (REST mode). */
  configServiceEnabled: boolean;

  /** Deployment environment: "dev", "uat", or "prod". */
  environment: string;
}

// ─── USER_PROFILE ────────────────────────────────────────────────────

/**
 * A user profile linking a user to an app and one or more roles.
 *
 * A user can have multiple roles (e.g. "developer" and "viewer"),
 * and each role grants a different set of permissions.
 */
export interface UserProfileRow {
  /** Primary key — unique user identifier. */
  userId: string;

  /** Foreign key → APP_REGISTRY. Which app this profile belongs to. */
  appId: string;

  /** Foreign keys → ROLES. The roles assigned to this user. */
  roleIds: string[];

  /** Human-readable display name for the user. */
  displayName: string;
}

// ─── ROLES ───────────────────────────────────────────────────────────

/**
 * A role definition that references one or more permissions.
 *
 * Roles are the bridge between users and permissions. A user has
 * roles, and each role has permissions. To check if a user can do
 * something, look up their roles, then check each role's permissions.
 */
export interface RoleRow {
  /** Primary key — unique role identifier (e.g. "admin", "developer"). */
  roleId: string;

  /** Human-readable name for display purposes. */
  displayName: string;

  /** Foreign keys → PERMISSIONS. The permissions granted to this role. */
  permissionIds: string[];
}

// ─── PERMISSIONS ─────────────────────────────────────────────────────

/**
 * A single permission definition.
 *
 * Permissions are fine-grained access control entries that describe
 * a specific action. Components check permissions (not roles) to
 * decide what a user can do.
 *
 * Examples: "config:read", "config:write", "config:delete",
 *           "snapshot:read", "snapshot:write", "admin:users"
 */
export interface PermissionRow {
  /** Primary key — unique permission identifier (e.g. "config:read"). */
  permissionId: string;

  /** Human-readable description of what this permission allows. */
  description: string;

  /**
   * Optional category for grouping permissions in a UI.
   * Examples: "config", "snapshot", "admin"
   */
  category: string;
}

// ─── PENDING_SYNC ────────────────────────────────────────────────────

/**
 * A queued write operation that failed to sync to the remote backend.
 *
 * Only used in REST mode. The ConfigManager drains this queue every
 * 10 seconds, retrying failed operations. After too many retries,
 * the row remains for manual investigation.
 */
export interface PendingSyncRow {
  /** Auto-increment primary key (managed by Dexie). */
  id?: number;

  /** The type of operation: "upsert" (create/update) or "delete". */
  operation: "upsert" | "delete";

  /** Which table this operation targets (e.g. "appConfig", "workspaceSnapshot"). */
  tableName: string;

  /** The primary key of the record being synced. */
  recordId: string;

  /** The full record data for upsert operations (undefined for deletes). */
  payload: any;

  /** ISO timestamp of when this sync entry was created. */
  createdAt: string;

  /** Number of times this operation has been retried. */
  retries: number;
}

// ─── ConfigManager options ───────────────────────────────────────────

/**
 * Options for creating a ConfigManager instance.
 */
export interface ConfigManagerOptions {
  /**
   * URL to a JSON file containing seed data for first-run initialization.
   * The file should contain `appRegistry`, `userProfiles`, and `roles` arrays.
   *
   * Example: "http://localhost:5174/seed-config.json"
   *
   * If not provided, the database starts empty.
   */
  seedConfigUrl?: string;

  /**
   * Base URL of the remote config service REST API.
   *
   * When set, write operations go to REST first, then mirror to Dexie.
   * Failed REST writes are queued in PENDING_SYNC for retry.
   *
   * When not set (undefined), all operations use Dexie only — no
   * backend required. This is the default for local development.
   *
   * Example: "https://config-api.example.com/api/v1"
   */
  configServiceRestUrl?: string;
}

// ─── Seed data shape ─────────────────────────────────────────────────

/**
 * The shape of the seed JSON file loaded on first run.
 *
 * Contains the minimum data needed to bootstrap a working app:
 * app registry entry, user profiles, roles, and permissions.
 */
export interface SeedData {
  /** App registry entries to seed. */
  appRegistry: AppRegistryRow[];

  /** User profiles to seed. */
  userProfiles: UserProfileRow[];

  /** Role definitions to seed. */
  roles: RoleRow[];

  /** Permission definitions to seed. */
  permissions: PermissionRow[];
}
