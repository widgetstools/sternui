import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import path from 'path';
import fs from 'fs';
import {
  IAuthStorage,
  AppRegistryRow,
  UserProfileRow,
  RoleRow,
  PermissionRow,
  AuthSeedData,
} from './IAuthStorage.js';

/**
 * SQLite-backed storage for the 4 auth tables. Uses sql.js so the
 * server stays pure-JS (no native bindings).
 *
 * Schema notes:
 *   • snake_case column names (SQLite convention) are translated to
 *     camelCase in `deserialize*()` — API JSON stays camelCase.
 *   • `role_ids` / `permission_ids` are JSON-encoded arrays in a single
 *     column. Simpler than a join table, and the data is small enough
 *     that referential-integrity loss is acceptable.
 *   • `deleted_at` soft-delete mirrors the pattern in `SqliteStorage`.
 */
export class SqliteAuthStorage implements IAuthStorage {
  private db: SqlJsDatabase | null = null;
  private readonly dbPath: string;
  private SQL: any = null;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || process.env.AUTH_DATABASE_PATH || './data/stern-auth.db';
    this.ensureDirectoryExists();
  }

  private ensureDirectoryExists(): void {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  async connect(): Promise<void> {
    this.SQL = await initSqlJs();
    if (fs.existsSync(this.dbPath)) {
      const buffer = fs.readFileSync(this.dbPath);
      this.db = new this.SQL.Database(buffer);
    } else {
      this.db = new this.SQL.Database();
    }
    this.initializeSchema();
  }

  async disconnect(): Promise<void> {
    if (this.db) {
      this.saveToFile();
      this.db.close();
      this.db = null;
    }
  }

  private saveToFile(): void {
    if (this.db) {
      const data = this.db.export();
      fs.writeFileSync(this.dbPath, Buffer.from(data));
    }
  }

  private initializeSchema(): void {
    if (!this.db) throw new Error('Auth DB not connected');

    this.db.run(`
      CREATE TABLE IF NOT EXISTS app_registry (
        app_id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        manifest_url TEXT NOT NULL,
        config_service_enabled INTEGER NOT NULL DEFAULT 0,
        environment TEXT NOT NULL,
        deleted_at TEXT,
        updated_time TEXT NOT NULL
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS user_profiles (
        user_id TEXT PRIMARY KEY,
        app_id TEXT NOT NULL,
        role_ids TEXT NOT NULL,
        display_name TEXT NOT NULL,
        deleted_at TEXT,
        updated_time TEXT NOT NULL
      );
    `);
    this.db.run('CREATE INDEX IF NOT EXISTS idx_user_profiles_app ON user_profiles(app_id)');

    this.db.run(`
      CREATE TABLE IF NOT EXISTS roles (
        role_id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        permission_ids TEXT NOT NULL,
        deleted_at TEXT,
        updated_time TEXT NOT NULL
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS permissions (
        permission_id TEXT PRIMARY KEY,
        description TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT '',
        deleted_at TEXT,
        updated_time TEXT NOT NULL
      );
    `);
    this.db.run('CREATE INDEX IF NOT EXISTS idx_permissions_category ON permissions(category)');

    this.saveToFile();
  }

  private requireDb(): SqlJsDatabase {
    if (!this.db) throw new Error('Auth DB not connected');
    return this.db;
  }

  // ─── appRegistry ──────────────────────────────────────────────────

  async createApp(row: AppRegistryRow): Promise<AppRegistryRow> {
    const db = this.requireDb();
    try {
      db.run(
        `INSERT INTO app_registry
           (app_id, display_name, manifest_url, config_service_enabled, environment, deleted_at, updated_time)
         VALUES (?, ?, ?, ?, ?, NULL, ?)`,
        [
          row.appId,
          row.displayName,
          row.manifestUrl,
          row.configServiceEnabled ? 1 : 0,
          row.environment,
          row.updatedTime,
        ],
      );
      this.saveToFile();
      return row;
    } catch (error) {
      if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
        throw new Error(`App registry entry with appId "${row.appId}" already exists`);
      }
      throw error;
    }
  }

  async getApp(appId: string, includeDeleted = false): Promise<AppRegistryRow | null> {
    const db = this.requireDb();
    const where = includeDeleted ? 'WHERE app_id = ?' : 'WHERE app_id = ? AND deleted_at IS NULL';
    const result = db.exec(`SELECT * FROM app_registry ${where}`, [appId]);
    if (result.length === 0 || result[0].values.length === 0) return null;
    return this.deserializeApp(result[0].columns, result[0].values[0]);
  }

  async updateApp(appId: string, updates: Partial<AppRegistryRow>): Promise<AppRegistryRow> {
    const existing = await this.getApp(appId);
    if (!existing) throw new Error(`App "${appId}" not found`);
    const merged: AppRegistryRow = {
      ...existing,
      ...updates,
      appId: existing.appId,
      updatedTime: new Date().toISOString(),
    };
    const db = this.requireDb();
    db.run(
      `UPDATE app_registry
       SET display_name = ?, manifest_url = ?, config_service_enabled = ?, environment = ?, updated_time = ?
       WHERE app_id = ?`,
      [
        merged.displayName,
        merged.manifestUrl,
        merged.configServiceEnabled ? 1 : 0,
        merged.environment,
        merged.updatedTime,
        appId,
      ],
    );
    this.saveToFile();
    return merged;
  }

  async deleteApp(appId: string): Promise<boolean> {
    const db = this.requireDb();
    const now = new Date().toISOString();
    db.run(
      `UPDATE app_registry SET deleted_at = ?, updated_time = ? WHERE app_id = ? AND deleted_at IS NULL`,
      [now, now, appId],
    );
    this.saveToFile();
    return true;
  }

  async listApps(includeDeleted = false): Promise<AppRegistryRow[]> {
    const db = this.requireDb();
    const where = includeDeleted ? '' : 'WHERE deleted_at IS NULL';
    const result = db.exec(`SELECT * FROM app_registry ${where} ORDER BY display_name ASC`);
    if (result.length === 0) return [];
    return result[0].values.map((r: any) => this.deserializeApp(result[0].columns, r));
  }

  async countApps(): Promise<number> {
    const db = this.requireDb();
    const result = db.exec(`SELECT COUNT(*) as c FROM app_registry`);
    if (result.length === 0 || result[0].values.length === 0) return 0;
    return Number(result[0].values[0][0]);
  }

  // ─── userProfiles ─────────────────────────────────────────────────

  async createUserProfile(row: UserProfileRow): Promise<UserProfileRow> {
    const db = this.requireDb();
    try {
      db.run(
        `INSERT INTO user_profiles
           (user_id, app_id, role_ids, display_name, deleted_at, updated_time)
         VALUES (?, ?, ?, ?, NULL, ?)`,
        [
          row.userId,
          row.appId,
          JSON.stringify(row.roleIds ?? []),
          row.displayName,
          row.updatedTime,
        ],
      );
      this.saveToFile();
      return row;
    } catch (error) {
      if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
        throw new Error(`User profile "${row.userId}" already exists`);
      }
      throw error;
    }
  }

  async getUserProfile(
    userId: string,
    includeDeleted = false,
  ): Promise<UserProfileRow | null> {
    const db = this.requireDb();
    const where = includeDeleted
      ? 'WHERE user_id = ?'
      : 'WHERE user_id = ? AND deleted_at IS NULL';
    const result = db.exec(`SELECT * FROM user_profiles ${where}`, [userId]);
    if (result.length === 0 || result[0].values.length === 0) return null;
    return this.deserializeUserProfile(result[0].columns, result[0].values[0]);
  }

  async updateUserProfile(
    userId: string,
    updates: Partial<UserProfileRow>,
  ): Promise<UserProfileRow> {
    const existing = await this.getUserProfile(userId);
    if (!existing) throw new Error(`User profile "${userId}" not found`);
    const merged: UserProfileRow = {
      ...existing,
      ...updates,
      userId: existing.userId,
      updatedTime: new Date().toISOString(),
    };
    const db = this.requireDb();
    db.run(
      `UPDATE user_profiles
       SET app_id = ?, role_ids = ?, display_name = ?, updated_time = ?
       WHERE user_id = ?`,
      [
        merged.appId,
        JSON.stringify(merged.roleIds ?? []),
        merged.displayName,
        merged.updatedTime,
        userId,
      ],
    );
    this.saveToFile();
    return merged;
  }

  async deleteUserProfile(userId: string): Promise<boolean> {
    const db = this.requireDb();
    const now = new Date().toISOString();
    db.run(
      `UPDATE user_profiles SET deleted_at = ?, updated_time = ? WHERE user_id = ? AND deleted_at IS NULL`,
      [now, now, userId],
    );
    this.saveToFile();
    return true;
  }

  async listUserProfiles(includeDeleted = false): Promise<UserProfileRow[]> {
    const db = this.requireDb();
    const where = includeDeleted ? '' : 'WHERE deleted_at IS NULL';
    const result = db.exec(`SELECT * FROM user_profiles ${where} ORDER BY display_name ASC`);
    if (result.length === 0) return [];
    return result[0].values.map((r: any) => this.deserializeUserProfile(result[0].columns, r));
  }

  async listUsersByApp(appId: string, includeDeleted = false): Promise<UserProfileRow[]> {
    const db = this.requireDb();
    const where = includeDeleted
      ? 'WHERE app_id = ?'
      : 'WHERE app_id = ? AND deleted_at IS NULL';
    const result = db.exec(
      `SELECT * FROM user_profiles ${where} ORDER BY display_name ASC`,
      [appId],
    );
    if (result.length === 0) return [];
    return result[0].values.map((r: any) => this.deserializeUserProfile(result[0].columns, r));
  }

  // ─── roles ────────────────────────────────────────────────────────

  async createRole(row: RoleRow): Promise<RoleRow> {
    const db = this.requireDb();
    try {
      db.run(
        `INSERT INTO roles
           (role_id, display_name, permission_ids, deleted_at, updated_time)
         VALUES (?, ?, ?, NULL, ?)`,
        [row.roleId, row.displayName, JSON.stringify(row.permissionIds ?? []), row.updatedTime],
      );
      this.saveToFile();
      return row;
    } catch (error) {
      if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
        throw new Error(`Role "${row.roleId}" already exists`);
      }
      throw error;
    }
  }

  async getRole(roleId: string, includeDeleted = false): Promise<RoleRow | null> {
    const db = this.requireDb();
    const where = includeDeleted ? 'WHERE role_id = ?' : 'WHERE role_id = ? AND deleted_at IS NULL';
    const result = db.exec(`SELECT * FROM roles ${where}`, [roleId]);
    if (result.length === 0 || result[0].values.length === 0) return null;
    return this.deserializeRole(result[0].columns, result[0].values[0]);
  }

  async updateRole(roleId: string, updates: Partial<RoleRow>): Promise<RoleRow> {
    const existing = await this.getRole(roleId);
    if (!existing) throw new Error(`Role "${roleId}" not found`);
    const merged: RoleRow = {
      ...existing,
      ...updates,
      roleId: existing.roleId,
      updatedTime: new Date().toISOString(),
    };
    const db = this.requireDb();
    db.run(
      `UPDATE roles
       SET display_name = ?, permission_ids = ?, updated_time = ?
       WHERE role_id = ?`,
      [merged.displayName, JSON.stringify(merged.permissionIds ?? []), merged.updatedTime, roleId],
    );
    this.saveToFile();
    return merged;
  }

  async deleteRole(roleId: string): Promise<boolean> {
    const db = this.requireDb();
    const now = new Date().toISOString();
    db.run(
      `UPDATE roles SET deleted_at = ?, updated_time = ? WHERE role_id = ? AND deleted_at IS NULL`,
      [now, now, roleId],
    );
    this.saveToFile();
    return true;
  }

  async listRoles(includeDeleted = false): Promise<RoleRow[]> {
    const db = this.requireDb();
    const where = includeDeleted ? '' : 'WHERE deleted_at IS NULL';
    const result = db.exec(`SELECT * FROM roles ${where} ORDER BY display_name ASC`);
    if (result.length === 0) return [];
    return result[0].values.map((r: any) => this.deserializeRole(result[0].columns, r));
  }

  // ─── permissions ──────────────────────────────────────────────────

  async createPermission(row: PermissionRow): Promise<PermissionRow> {
    const db = this.requireDb();
    try {
      db.run(
        `INSERT INTO permissions
           (permission_id, description, category, deleted_at, updated_time)
         VALUES (?, ?, ?, NULL, ?)`,
        [row.permissionId, row.description, row.category ?? '', row.updatedTime],
      );
      this.saveToFile();
      return row;
    } catch (error) {
      if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
        throw new Error(`Permission "${row.permissionId}" already exists`);
      }
      throw error;
    }
  }

  async getPermission(
    permissionId: string,
    includeDeleted = false,
  ): Promise<PermissionRow | null> {
    const db = this.requireDb();
    const where = includeDeleted
      ? 'WHERE permission_id = ?'
      : 'WHERE permission_id = ? AND deleted_at IS NULL';
    const result = db.exec(`SELECT * FROM permissions ${where}`, [permissionId]);
    if (result.length === 0 || result[0].values.length === 0) return null;
    return this.deserializePermission(result[0].columns, result[0].values[0]);
  }

  async updatePermission(
    permissionId: string,
    updates: Partial<PermissionRow>,
  ): Promise<PermissionRow> {
    const existing = await this.getPermission(permissionId);
    if (!existing) throw new Error(`Permission "${permissionId}" not found`);
    const merged: PermissionRow = {
      ...existing,
      ...updates,
      permissionId: existing.permissionId,
      updatedTime: new Date().toISOString(),
    };
    const db = this.requireDb();
    db.run(
      `UPDATE permissions
       SET description = ?, category = ?, updated_time = ?
       WHERE permission_id = ?`,
      [merged.description, merged.category ?? '', merged.updatedTime, permissionId],
    );
    this.saveToFile();
    return merged;
  }

  async deletePermission(permissionId: string): Promise<boolean> {
    const db = this.requireDb();
    const now = new Date().toISOString();
    db.run(
      `UPDATE permissions SET deleted_at = ?, updated_time = ? WHERE permission_id = ? AND deleted_at IS NULL`,
      [now, now, permissionId],
    );
    this.saveToFile();
    return true;
  }

  async listPermissions(includeDeleted = false): Promise<PermissionRow[]> {
    const db = this.requireDb();
    const where = includeDeleted ? '' : 'WHERE deleted_at IS NULL';
    const result = db.exec(`SELECT * FROM permissions ${where} ORDER BY permission_id ASC`);
    if (result.length === 0) return [];
    return result[0].values.map((r: any) => this.deserializePermission(result[0].columns, r));
  }

  async listPermissionsByCategory(
    category: string,
    includeDeleted = false,
  ): Promise<PermissionRow[]> {
    const db = this.requireDb();
    const where = includeDeleted
      ? 'WHERE category = ?'
      : 'WHERE category = ? AND deleted_at IS NULL';
    const result = db.exec(
      `SELECT * FROM permissions ${where} ORDER BY permission_id ASC`,
      [category],
    );
    if (result.length === 0) return [];
    return result[0].values.map((r: any) => this.deserializePermission(result[0].columns, r));
  }

  // ─── Derived queries ──────────────────────────────────────────────

  async getUserPermissions(userId: string): Promise<PermissionRow[]> {
    const user = await this.getUserProfile(userId);
    if (!user) return [];

    const permissionIds = new Set<string>();
    for (const roleId of user.roleIds) {
      const role = await this.getRole(roleId);
      if (role) {
        for (const permId of role.permissionIds) permissionIds.add(permId);
      }
    }

    const out: PermissionRow[] = [];
    for (const permId of permissionIds) {
      const perm = await this.getPermission(permId);
      if (perm) out.push(perm);
    }
    return out;
  }

  async userHasPermission(userId: string, permissionId: string): Promise<boolean> {
    const user = await this.getUserProfile(userId);
    if (!user) return false;
    for (const roleId of user.roleIds) {
      const role = await this.getRole(roleId);
      if (role && role.permissionIds.includes(permissionId)) return true;
    }
    return false;
  }

  // ─── Bulk seed (idempotent) ───────────────────────────────────────

  async bulkSeedIfEmpty(seed: AuthSeedData): Promise<boolean> {
    const existingApps = await this.countApps();
    if (existingApps > 0) return false;

    const db = this.requireDb();
    const now = new Date().toISOString();

    db.run('BEGIN TRANSACTION');
    try {
      if (seed.permissions) {
        for (const p of seed.permissions) {
          db.run(
            `INSERT INTO permissions (permission_id, description, category, deleted_at, updated_time)
             VALUES (?, ?, ?, NULL, ?)`,
            [p.permissionId, p.description, p.category ?? '', now],
          );
        }
      }
      if (seed.roles) {
        for (const r of seed.roles) {
          db.run(
            `INSERT INTO roles (role_id, display_name, permission_ids, deleted_at, updated_time)
             VALUES (?, ?, ?, NULL, ?)`,
            [r.roleId, r.displayName, JSON.stringify(r.permissionIds ?? []), now],
          );
        }
      }
      if (seed.appRegistry) {
        for (const a of seed.appRegistry) {
          db.run(
            `INSERT INTO app_registry (app_id, display_name, manifest_url, config_service_enabled, environment, deleted_at, updated_time)
             VALUES (?, ?, ?, ?, ?, NULL, ?)`,
            [
              a.appId,
              a.displayName,
              a.manifestUrl,
              a.configServiceEnabled ? 1 : 0,
              a.environment,
              now,
            ],
          );
        }
      }
      if (seed.userProfiles) {
        for (const u of seed.userProfiles) {
          db.run(
            `INSERT INTO user_profiles (user_id, app_id, role_ids, display_name, deleted_at, updated_time)
             VALUES (?, ?, ?, ?, NULL, ?)`,
            [u.userId, u.appId, JSON.stringify(u.roleIds ?? []), u.displayName, now],
          );
        }
      }
      db.run('COMMIT');
    } catch (err) {
      db.run('ROLLBACK');
      throw err;
    }

    this.saveToFile();
    return true;
  }

  // ─── Deserializers (snake_case → camelCase) ──────────────────────

  private deserializeApp(columns: string[], values: any[]): AppRegistryRow {
    const row = this.toRow(columns, values);
    return {
      appId: row.app_id,
      displayName: row.display_name,
      manifestUrl: row.manifest_url,
      configServiceEnabled: Boolean(row.config_service_enabled),
      environment: row.environment,
      updatedTime: row.updated_time,
    };
  }

  private deserializeUserProfile(columns: string[], values: any[]): UserProfileRow {
    const row = this.toRow(columns, values);
    return {
      userId: row.user_id,
      appId: row.app_id,
      roleIds: row.role_ids ? JSON.parse(row.role_ids) : [],
      displayName: row.display_name,
      updatedTime: row.updated_time,
    };
  }

  private deserializeRole(columns: string[], values: any[]): RoleRow {
    const row = this.toRow(columns, values);
    return {
      roleId: row.role_id,
      displayName: row.display_name,
      permissionIds: row.permission_ids ? JSON.parse(row.permission_ids) : [],
      updatedTime: row.updated_time,
    };
  }

  private deserializePermission(columns: string[], values: any[]): PermissionRow {
    const row = this.toRow(columns, values);
    return {
      permissionId: row.permission_id,
      description: row.description,
      category: row.category ?? '',
      updatedTime: row.updated_time,
    };
  }

  private toRow(columns: string[], values: any[]): any {
    const out: any = {};
    columns.forEach((c, i) => {
      out[c] = values[i];
    });
    return out;
  }
}
