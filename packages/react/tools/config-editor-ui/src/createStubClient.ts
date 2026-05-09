import type {
  AppConfigRow,
  AppRegistryRow,
  PermissionRow,
  RoleRow,
  UserProfileRow,
} from '@starui/config-service';
import type {
  AppRegistryOps,
  ConfigClient,
  PermissionOps,
  RoleOps,
  UserProfileOps,
} from '@starui/config-service';

/**
 * Hand-rolled in-memory `ConfigClient` for tests and Storybook-style
 * smoke screens. Implements every method on the contract so type
 * checking passes; the four editors only touch the auth-table ops, so
 * the appConfig methods all throw (loud failures beat silent stubs).
 *
 * Keep this in `src/` (not `test/`) so consumer apps can import it for
 * demos — that's how Session 12 acceptance is checked under
 * `[data-theme]` toggles.
 */

export interface StubClientSeed {
  apps?: AppRegistryRow[];
  userProfiles?: UserProfileRow[];
  roles?: RoleRow[];
  permissions?: PermissionRow[];
}

export interface StubClient extends ConfigClient {
  /** All recorded write calls in order — useful for test assertions. */
  readonly calls: Array<{ method: string; args: unknown[] }>;
}

export function createStubClient(seed: StubClientSeed = {}): StubClient {
  const apps = new Map<string, AppRegistryRow>();
  const userProfiles = new Map<string, UserProfileRow>();
  const roles = new Map<string, RoleRow>();
  const permissions = new Map<string, PermissionRow>();
  const calls: Array<{ method: string; args: unknown[] }> = [];

  for (const a of seed.apps ?? []) apps.set(a.appId, a);
  for (const u of seed.userProfiles ?? []) userProfiles.set(u.userId, u);
  for (const r of seed.roles ?? []) roles.set(r.roleId, r);
  for (const p of seed.permissions ?? []) permissions.set(p.permissionId, p);

  function record(method: string, ...args: unknown[]) {
    calls.push({ method, args });
  }

  const appsOps: AppRegistryOps = {
    async create(row) {
      record('apps.create', row);
      apps.set(row.appId, row);
      return row;
    },
    async get(appId) {
      return apps.get(appId);
    },
    async update(appId, patch) {
      record('apps.update', appId, patch);
      const existing = apps.get(appId);
      if (!existing) throw new Error(`App not found: ${appId}`);
      const next: AppRegistryRow = { ...existing, ...patch, appId };
      apps.set(appId, next);
      return next;
    },
    async upsert(row) {
      record('apps.upsert', row);
      apps.set(row.appId, row);
      return row;
    },
    async delete(appId) {
      record('apps.delete', appId);
      return apps.delete(appId);
    },
    async list() {
      return Array.from(apps.values());
    },
  };

  const userProfilesOps: UserProfileOps = {
    async create(row) {
      record('userProfiles.create', row);
      userProfiles.set(row.userId, row);
      return row;
    },
    async get(userId) {
      return userProfiles.get(userId);
    },
    async update(userId, patch) {
      record('userProfiles.update', userId, patch);
      const existing = userProfiles.get(userId);
      if (!existing) throw new Error(`User not found: ${userId}`);
      const next: UserProfileRow = { ...existing, ...patch, userId };
      userProfiles.set(userId, next);
      return next;
    },
    async upsert(row) {
      record('userProfiles.upsert', row);
      userProfiles.set(row.userId, row);
      return row;
    },
    async delete(userId) {
      record('userProfiles.delete', userId);
      return userProfiles.delete(userId);
    },
    async list() {
      return Array.from(userProfiles.values());
    },
    async listByApp(appId) {
      return Array.from(userProfiles.values()).filter((u) => u.appId === appId);
    },
  };

  const rolesOps: RoleOps = {
    async create(row) {
      record('roles.create', row);
      roles.set(row.roleId, row);
      return row;
    },
    async get(roleId) {
      return roles.get(roleId);
    },
    async update(roleId, patch) {
      record('roles.update', roleId, patch);
      const existing = roles.get(roleId);
      if (!existing) throw new Error(`Role not found: ${roleId}`);
      const next: RoleRow = { ...existing, ...patch, roleId };
      roles.set(roleId, next);
      return next;
    },
    async upsert(row) {
      record('roles.upsert', row);
      roles.set(row.roleId, row);
      return row;
    },
    async delete(roleId) {
      record('roles.delete', roleId);
      return roles.delete(roleId);
    },
    async list() {
      return Array.from(roles.values());
    },
  };

  const permissionsOps: PermissionOps = {
    async create(row) {
      record('permissions.create', row);
      permissions.set(row.permissionId, row);
      return row;
    },
    async get(permissionId) {
      return permissions.get(permissionId);
    },
    async update(permissionId, patch) {
      record('permissions.update', permissionId, patch);
      const existing = permissions.get(permissionId);
      if (!existing) throw new Error(`Permission not found: ${permissionId}`);
      const next: PermissionRow = { ...existing, ...patch, permissionId };
      permissions.set(permissionId, next);
      return next;
    },
    async upsert(row) {
      record('permissions.upsert', row);
      permissions.set(row.permissionId, row);
      return row;
    },
    async delete(permissionId) {
      record('permissions.delete', permissionId);
      return permissions.delete(permissionId);
    },
    async list() {
      return Array.from(permissions.values());
    },
    async listByCategory(category) {
      return Array.from(permissions.values()).filter(
        (p) => p.category === category,
      );
    },
    async getForUser(userId) {
      const profile = userProfiles.get(userId);
      if (!profile) return [];
      const ids = new Set<string>();
      for (const roleId of profile.roleIds) {
        const role = roles.get(roleId);
        if (role) for (const pid of role.permissionIds) ids.add(pid);
      }
      return Array.from(permissions.values()).filter((p) =>
        ids.has(p.permissionId),
      );
    },
    async checkForUser(userId, permissionId) {
      const all = await permissionsOps.getForUser(userId);
      return all.some((p) => p.permissionId === permissionId);
    },
  };

  function unsupported(name: string): never {
    throw new Error(`StubClient.${name} is not implemented — use the real ConfigClient.`);
  }

  const client: StubClient = {
    calls,
    apps: appsOps,
    userProfiles: userProfilesOps,
    roles: rolesOps,
    permissions: permissionsOps,
    async init() {
      /* no-op */
    },
    dispose() {
      /* no-op */
    },
    async createConfig() {
      return unsupported('createConfig');
    },
    async getConfig(): Promise<AppConfigRow | undefined> {
      return undefined;
    },
    async updateConfig() {
      return unsupported('updateConfig');
    },
    async upsertConfig() {
      return unsupported('upsertConfig');
    },
    async deleteConfig() {
      return false;
    },
    async findByCompositeKey() {
      return undefined;
    },
    async cloneConfig() {
      return unsupported('cloneConfig');
    },
    async bulkCreate() {
      return [];
    },
    async bulkUpdate() {
      return [];
    },
    async bulkDelete() {
      return [];
    },
    async queryConfigs() {
      return [];
    },
    async queryConfigsPaginated() {
      return { items: [], total: 0, page: 1, limit: 0 };
    },
    async findByAppId() {
      return [];
    },
    async findByUserId() {
      return [];
    },
    async findByComponentType() {
      return [];
    },
    async getHealth() {
      return { isHealthy: true, mode: 'stub' };
    },
  };

  return client;
}
