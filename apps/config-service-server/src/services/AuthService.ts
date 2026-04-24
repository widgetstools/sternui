import { StorageFactory } from '../storage/StorageFactory.js';
import {
  IAuthStorage,
  AppRegistryRow,
  UserProfileRow,
  RoleRow,
  PermissionRow,
  AuthSeedData,
} from '../storage/IAuthStorage.js';
import { AuthValidationUtils } from '../utils/authValidation.js';
import logger from '../utils/logger.js';

/**
 * Business-logic layer for the 4 auth tables. Same pattern as
 * `ConfigurationService` — validate via Joi, stamp timestamps,
 * delegate to storage.
 */
export class AuthService {
  private readonly storage: IAuthStorage;

  constructor(storage?: IAuthStorage) {
    this.storage = storage || StorageFactory.createAuthStorage();
  }

  async initialize(): Promise<void> {
    await this.storage.connect();
    logger.info('AuthService initialized');
  }

  async shutdown(): Promise<void> {
    await this.storage.disconnect();
    logger.info('AuthService shut down');
  }

  // ─── appRegistry ──────────────────────────────────────────────────

  async createApp(input: Partial<AppRegistryRow>): Promise<AppRegistryRow> {
    const now = new Date().toISOString();
    const row: AppRegistryRow = {
      appId: input.appId ?? '',
      displayName: input.displayName ?? '',
      manifestUrl: input.manifestUrl ?? '',
      configServiceEnabled: Boolean(input.configServiceEnabled),
      environment: input.environment ?? '',
      updatedTime: now,
    };
    const { error } = AuthValidationUtils.validateApp(row);
    if (error) throw new Error(`Validation failed: ${error}`);
    const result = await this.storage.createApp(row);
    logger.info('App registry entry created', { appId: result.appId });
    return result;
  }

  getApp(appId: string, includeDeleted = false): Promise<AppRegistryRow | null> {
    return this.storage.getApp(appId, includeDeleted);
  }

  async updateApp(appId: string, updates: Partial<AppRegistryRow>): Promise<AppRegistryRow> {
    const { error } = AuthValidationUtils.validateAppUpdate(updates);
    if (error) throw new Error(`Validation failed: ${error}`);
    const result = await this.storage.updateApp(appId, updates);
    logger.info('App registry entry updated', { appId });
    return result;
  }

  deleteApp(appId: string): Promise<boolean> {
    logger.info('App registry entry deleted', { appId });
    return this.storage.deleteApp(appId);
  }

  listApps(includeDeleted = false): Promise<AppRegistryRow[]> {
    return this.storage.listApps(includeDeleted);
  }

  // ─── userProfiles ─────────────────────────────────────────────────

  async createUserProfile(input: Partial<UserProfileRow>): Promise<UserProfileRow> {
    const now = new Date().toISOString();
    const row: UserProfileRow = {
      userId: input.userId ?? '',
      appId: input.appId ?? '',
      roleIds: Array.isArray(input.roleIds) ? input.roleIds : [],
      displayName: input.displayName ?? '',
      updatedTime: now,
    };
    const { error } = AuthValidationUtils.validateUserProfile(row);
    if (error) throw new Error(`Validation failed: ${error}`);
    const result = await this.storage.createUserProfile(row);
    logger.info('User profile created', { userId: result.userId });
    return result;
  }

  getUserProfile(
    userId: string,
    includeDeleted = false,
  ): Promise<UserProfileRow | null> {
    return this.storage.getUserProfile(userId, includeDeleted);
  }

  async updateUserProfile(
    userId: string,
    updates: Partial<UserProfileRow>,
  ): Promise<UserProfileRow> {
    const { error } = AuthValidationUtils.validateUserProfileUpdate(updates);
    if (error) throw new Error(`Validation failed: ${error}`);
    const result = await this.storage.updateUserProfile(userId, updates);
    logger.info('User profile updated', { userId });
    return result;
  }

  deleteUserProfile(userId: string): Promise<boolean> {
    logger.info('User profile deleted', { userId });
    return this.storage.deleteUserProfile(userId);
  }

  listUserProfiles(includeDeleted = false): Promise<UserProfileRow[]> {
    return this.storage.listUserProfiles(includeDeleted);
  }

  listUsersByApp(appId: string, includeDeleted = false): Promise<UserProfileRow[]> {
    return this.storage.listUsersByApp(appId, includeDeleted);
  }

  // ─── roles ────────────────────────────────────────────────────────

  async createRole(input: Partial<RoleRow>): Promise<RoleRow> {
    const now = new Date().toISOString();
    const row: RoleRow = {
      roleId: input.roleId ?? '',
      displayName: input.displayName ?? '',
      permissionIds: Array.isArray(input.permissionIds) ? input.permissionIds : [],
      updatedTime: now,
    };
    const { error } = AuthValidationUtils.validateRole(row);
    if (error) throw new Error(`Validation failed: ${error}`);
    const result = await this.storage.createRole(row);
    logger.info('Role created', { roleId: result.roleId });
    return result;
  }

  getRole(roleId: string, includeDeleted = false): Promise<RoleRow | null> {
    return this.storage.getRole(roleId, includeDeleted);
  }

  async updateRole(roleId: string, updates: Partial<RoleRow>): Promise<RoleRow> {
    const { error } = AuthValidationUtils.validateRoleUpdate(updates);
    if (error) throw new Error(`Validation failed: ${error}`);
    const result = await this.storage.updateRole(roleId, updates);
    logger.info('Role updated', { roleId });
    return result;
  }

  deleteRole(roleId: string): Promise<boolean> {
    logger.info('Role deleted', { roleId });
    return this.storage.deleteRole(roleId);
  }

  listRoles(includeDeleted = false): Promise<RoleRow[]> {
    return this.storage.listRoles(includeDeleted);
  }

  // ─── permissions ──────────────────────────────────────────────────

  async createPermission(input: Partial<PermissionRow>): Promise<PermissionRow> {
    const now = new Date().toISOString();
    const row: PermissionRow = {
      permissionId: input.permissionId ?? '',
      description: input.description ?? '',
      category: input.category ?? '',
      updatedTime: now,
    };
    const { error } = AuthValidationUtils.validatePermission(row);
    if (error) throw new Error(`Validation failed: ${error}`);
    const result = await this.storage.createPermission(row);
    logger.info('Permission created', { permissionId: result.permissionId });
    return result;
  }

  getPermission(
    permissionId: string,
    includeDeleted = false,
  ): Promise<PermissionRow | null> {
    return this.storage.getPermission(permissionId, includeDeleted);
  }

  async updatePermission(
    permissionId: string,
    updates: Partial<PermissionRow>,
  ): Promise<PermissionRow> {
    const { error } = AuthValidationUtils.validatePermissionUpdate(updates);
    if (error) throw new Error(`Validation failed: ${error}`);
    const result = await this.storage.updatePermission(permissionId, updates);
    logger.info('Permission updated', { permissionId });
    return result;
  }

  deletePermission(permissionId: string): Promise<boolean> {
    logger.info('Permission deleted', { permissionId });
    return this.storage.deletePermission(permissionId);
  }

  listPermissions(includeDeleted = false): Promise<PermissionRow[]> {
    return this.storage.listPermissions(includeDeleted);
  }

  listPermissionsByCategory(
    category: string,
    includeDeleted = false,
  ): Promise<PermissionRow[]> {
    return this.storage.listPermissionsByCategory(category, includeDeleted);
  }

  // ─── Derived queries ──────────────────────────────────────────────

  getUserPermissions(userId: string): Promise<PermissionRow[]> {
    return this.storage.getUserPermissions(userId);
  }

  userHasPermission(userId: string, permissionId: string): Promise<boolean> {
    return this.storage.userHasPermission(userId, permissionId);
  }

  // ─── Bulk seed ────────────────────────────────────────────────────

  seedIfEmpty(seed: AuthSeedData): Promise<boolean> {
    return this.storage.bulkSeedIfEmpty(seed);
  }
}
