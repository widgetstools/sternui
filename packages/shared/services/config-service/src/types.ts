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
 *
 * ## Owner vs audit field roles (Decision 7 in the redesign)
 *
 * The row carries two distinct identity slots that future sessions
 * separate cleanly:
 *
 *   - `userId` — the **owner** of the row. Drives visibility (see
 *     `isPublic` below): a private row owned by alice is not visible
 *     to bob. The owner is whoever the row was authored *as* — under
 *     impersonation (Session 8) this is the impersonated user, not
 *     the real signed-in user.
 *   - `createdBy` / `updatedBy` — **audit** fields. Always reflect the
 *     real logged-in user (`AppIdentity.userId`), never the
 *     impersonated user. These never change ownership semantics.
 *
 * Until Session 3 lands the centralized stamping helper, owner and
 * audit are populated by ad-hoc code paths and may both be the
 * signed-in user; see Session 3 of
 * `docs/plans/plan-2026-05-07/config-manager-redesign-sessions.md`.
 */
export interface AppConfigRow {
  /** Primary key — instanceId for instances, templateId for templates. */
  configId: string;

  /** Foreign key → APP_REGISTRY. Identifies which app owns this config. */
  appId: string;

  /**
   * Owner of this config row (drives visibility — see `isPublic`).
   * Templates typically use a system/shared user id; instance configs
   * use the signed-in user id. Under impersonation (Session 8) this
   * is the impersonated user, not the real logged-in user.
   *
   * See the type's class-level JSDoc for the owner-vs-audit split.
   */
  userId: string;

  /**
   * Visibility flag (Decision 6 in the redesign).
   *
   *   - `true` (default) — **public**: visible to every user of this
   *     app. Templates and shared configs are public.
   *   - `false` — **private**: visible only to the row's `userId`
   *     (owner) within the row's `appId`.
   *
   * Optional for back-compat — rows written before this field existed
   * are normalized to `true` by a Dexie schema upgrade so existing
   * data keeps reading. New writes always populate the field
   * explicitly. See Session 1 of
   * `docs/plans/plan-2026-05-07/config-manager-redesign-sessions.md`.
   */
  isPublic?: boolean;

  /** Human-readable label shown in toolbars and menus. */
  displayText: string;

  /** The type of component: "GRID", "CHART", "HEATMAP", "ORDERTICKET", "DOCK", etc. */
  componentType: string;

  /** Sub-category within the component type: "CREDIT", "RATES", "MBS", "CMBS", etc. */
  componentSubType: string;

  /**
   * True for the **template** config saved during a component's test
   * launch (the initial-settings row that the registry entry points
   * at). Per-instance clones spawned later from the dock menu set
   * this to `false`.
   *
   * Naming-convention invariant: when `isTemplate === true` the
   * `configId` MUST equal `deriveTemplateConfigId(componentType,
   * componentSubType)` (i.e. `${componentType}-${componentSubType}`
   * lowercase). There is at most ONE template per
   * (componentType, componentSubType) pair. Per-instance rows carry
   * an arbitrary UUID as `configId` but inherit the same
   * `componentType` + `componentSubType` from the template they
   * cloned.
   */
  isTemplate: boolean;

  /**
   * True when the registered component is a **singleton** — i.e. only
   * one config row ever exists for it, and every launch resolves to
   * the template row (no per-instance clones). For non-singletons,
   * the dock spawns a fresh instance on every click and clones the
   * template into a new UUID-keyed row.
   *
   * Mirrors `RegistryEntry.singleton` for the matching registry row;
   * stored on the AppConfigRow so component-host can decide the
   * clone-vs-reuse behaviour without round-tripping the registry.
   *
   * Optional for back-compat — rows written before this field
   * existed default to `undefined` and are treated as non-singleton.
   */
  singleton?: boolean;

  /**
   * Back-compat flag: true when this row IS the registered-component
   * config (the template). Workspace GC must never delete these rows.
   *
   * Superseded by `isTemplate` (same semantics now that the
   * configId-naming convention is unified). Kept on the type so older
   * rows still load cleanly; new writes set both `isTemplate` and
   * `isRegisteredComponent` to the same value.
   *
   * @deprecated Use `isTemplate` instead. Will be removed in a
   * future schema version.
   */
  isRegisteredComponent?: boolean;

  /** The full component configuration object (shape varies by componentType). */
  payload: any;

  /** User ID of the person who created this config. */
  createdBy: string;

  /** User ID of the person who last modified this config. */
  updatedBy: string;

  /** ISO timestamp of when this config was first created. */
  creationTime: string;

  /** ISO timestamp of the last modification. Used for conflict resolution. */
  updatedTime: string;
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

  /**
   * Audit fields (Decision 7). Stamped automatically by
   * `ConfigManager.saveAppRegistry` from the current identity. Optional
   * for back-compat — rows written before audit stamping landed read
   * back with these fields undefined.
   */
  createdBy?: string;
  updatedBy?: string;
  creationTime?: string;
  updatedTime?: string;
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

  /**
   * Audit fields (Decision 7). Stamped automatically by
   * `ConfigManager.saveUserProfile` from the current identity. Optional
   * for back-compat — rows written before audit stamping landed read
   * back with these fields undefined.
   */
  createdBy?: string;
  updatedBy?: string;
  creationTime?: string;
  updatedTime?: string;
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

  /**
   * Audit fields (Decision 7). Stamped automatically by
   * `ConfigManager.saveRole` from the current identity. Optional for
   * back-compat — rows written before audit stamping landed read back
   * with these fields undefined.
   */
  createdBy?: string;
  updatedBy?: string;
  creationTime?: string;
  updatedTime?: string;
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

  /**
   * Audit fields (Decision 7). Stamped automatically by
   * `ConfigManager.savePermission` from the current identity. Optional
   * for back-compat — rows written before audit stamping landed read
   * back with these fields undefined.
   */
  createdBy?: string;
  updatedBy?: string;
  creationTime?: string;
  updatedTime?: string;
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

// ─── AppIdentity ─────────────────────────────────────────────────────

/**
 * The authenticated identity supplied by the host app after sign-in.
 *
 * The framework stores this once at construction (via
 * `ConfigManagerOptions.identity`) and uses it for two things:
 *
 *   1. **Owner / audit stamping.** `userId` becomes the row's owner
 *      slot (`AppConfigRow.userId`) and the audit slot
 *      (`createdBy` / `updatedBy`). Until impersonation lands
 *      (Session 8) these are the same value; afterwards `createdBy` /
 *      `updatedBy` always reflect the real signed-in user from this
 *      identity, never the impersonated user.
 *   2. **Outbound auth headers** (REST mode only). Before each request
 *      the framework calls `getAccessToken()` if present and attaches
 *      `Authorization: Bearer <token>`. The host owns refresh — the
 *      framework never caches the token.
 *
 * Defaults to a dev placeholder (`{ userId: "dev-user", displayName:
 * "Dev User" }`) when the host doesn't supply one, so first-run
 * developer setup keeps working with zero wiring.
 */
export interface AppIdentity {
  /** Stable user id used for createdBy/updatedBy and visibility filters. */
  userId: string;
  /** Optional display name for audit / UI labels. */
  displayName?: string;
  /**
   * Returns a fresh access token on demand. Only consulted in REST mode.
   * The app owns refresh; the framework just calls this before each
   * outbound HTTP request and attaches `Authorization: Bearer <token>`.
   */
  getAccessToken?: () => Promise<string>;
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

  /**
   * The app this ConfigManager belongs to. Becomes the value of
   * AppData "AppId" in ApplicationContext (Session 7).
   * Defaults to "dev-app" if omitted.
   */
  appId?: string;

  /**
   * Authenticated identity supplied by the host app after sign-in.
   * Defaults to `{ userId: "dev-user", displayName: "Dev User" }` if
   * omitted. See `AppIdentity` JSDoc.
   */
  identity?: AppIdentity;
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
