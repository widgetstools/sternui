// ─── IAuthStorage ────────────────────────────────────────────────────
//
// Storage interface for the 4 auth tables that live alongside the main
// `configurations` table:
//   • appRegistry   — one row per registered app
//   • userProfiles  — user ↔ app ↔ role mappings
//   • roles         — role definitions (list of permissionIds)
//   • permissions   — fine-grained access control entries
//
// Row shapes are kept in sync with the canonical types in
// `packages/config-service/src/types.ts`. Added server-only fields:
//   • deletedAt   — ISO soft-delete timestamp (or null)
//   • updatedTime — ISO last-modified timestamp (used for conflict res)

/** App registry row — matches `AppRegistryRow` on the client. */
export interface AppRegistryRow {
  appId: string;
  displayName: string;
  manifestUrl: string;
  configServiceEnabled: boolean;
  environment: string;
  updatedTime: string;
}

/** User profile row — matches `UserProfileRow` on the client. */
export interface UserProfileRow {
  userId: string;
  appId: string;
  roleIds: string[];
  displayName: string;
  updatedTime: string;
}

/** Role row — matches `RoleRow` on the client. */
export interface RoleRow {
  roleId: string;
  displayName: string;
  permissionIds: string[];
  updatedTime: string;
}

/** Permission row — matches `PermissionRow` on the client. */
export interface PermissionRow {
  permissionId: string;
  description: string;
  category: string;
  updatedTime: string;
}

/**
 * The shape of the seed JSON loaded on first boot. Mirrors the client
 * `SeedData` interface so the same file works for both sides.
 */
export interface AuthSeedData {
  appRegistry?: Omit<AppRegistryRow, 'updatedTime'>[];
  userProfiles?: Omit<UserProfileRow, 'updatedTime'>[];
  roles?: Omit<RoleRow, 'updatedTime'>[];
  permissions?: Omit<PermissionRow, 'updatedTime'>[];
}

/**
 * Storage engine for the 4 auth tables. One interface so the server can
 * swap backends (sql.js today, anything later) without touching the
 * service layer.
 */
export interface IAuthStorage {
  // Lifecycle
  connect(): Promise<void>;
  disconnect(): Promise<void>;

  // appRegistry
  createApp(row: AppRegistryRow): Promise<AppRegistryRow>;
  getApp(appId: string, includeDeleted?: boolean): Promise<AppRegistryRow | null>;
  updateApp(appId: string, updates: Partial<AppRegistryRow>): Promise<AppRegistryRow>;
  deleteApp(appId: string): Promise<boolean>;
  listApps(includeDeleted?: boolean): Promise<AppRegistryRow[]>;
  countApps(): Promise<number>;

  // userProfiles
  createUserProfile(row: UserProfileRow): Promise<UserProfileRow>;
  getUserProfile(userId: string, includeDeleted?: boolean): Promise<UserProfileRow | null>;
  updateUserProfile(userId: string, updates: Partial<UserProfileRow>): Promise<UserProfileRow>;
  deleteUserProfile(userId: string): Promise<boolean>;
  listUserProfiles(includeDeleted?: boolean): Promise<UserProfileRow[]>;
  listUsersByApp(appId: string, includeDeleted?: boolean): Promise<UserProfileRow[]>;

  // roles
  createRole(row: RoleRow): Promise<RoleRow>;
  getRole(roleId: string, includeDeleted?: boolean): Promise<RoleRow | null>;
  updateRole(roleId: string, updates: Partial<RoleRow>): Promise<RoleRow>;
  deleteRole(roleId: string): Promise<boolean>;
  listRoles(includeDeleted?: boolean): Promise<RoleRow[]>;

  // permissions
  createPermission(row: PermissionRow): Promise<PermissionRow>;
  getPermission(permissionId: string, includeDeleted?: boolean): Promise<PermissionRow | null>;
  updatePermission(
    permissionId: string,
    updates: Partial<PermissionRow>,
  ): Promise<PermissionRow>;
  deletePermission(permissionId: string): Promise<boolean>;
  listPermissions(includeDeleted?: boolean): Promise<PermissionRow[]>;
  listPermissionsByCategory(category: string, includeDeleted?: boolean): Promise<PermissionRow[]>;

  // Derived queries (join roles ↔ permissions via a user's roleIds)
  getUserPermissions(userId: string): Promise<PermissionRow[]>;
  userHasPermission(userId: string, permissionId: string): Promise<boolean>;

  // Bulk seeding — a single transaction that's a no-op if any table is
  // already populated (idempotent boot).
  bulkSeedIfEmpty(seed: AuthSeedData): Promise<boolean>;
}
