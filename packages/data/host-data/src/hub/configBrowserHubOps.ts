/**
 * Worker-side Config Browser table I/O against the authoritative
 * {@link ConfigManager}. Invoked from hub RPC handlers.
 */

import type { ConfigManager, AppConfigRow } from '@starui/host-config';
import type { ConfigBrowserTableKey } from '@starui/host-config';
import type { ConfigCatalogCache } from './ConfigCatalogCache.js';
import { isCatalogConfigRow } from './isCatalogConfigRow.js';
import type { ConfigBrowserCounts, ConfigBrowserExportBundle } from './ConfigBrowserAccess.js';

type DexieTable = {
  count(): Promise<number>;
  toArray(): Promise<unknown[]>;
  get(key: string | number): Promise<unknown | undefined>;
  put(row: unknown): Promise<unknown>;
  delete(key: string | number): Promise<void>;
  where(field: string): { equals(value: string): { count(): Promise<number>; toArray(): Promise<unknown[]> } };
};

function dbOf(manager: ConfigManager): {
  appConfig: DexieTable;
  appRegistry: DexieTable;
  userProfile: DexieTable;
  roles: DexieTable;
  permissions: DexieTable;
  pendingSync: DexieTable;
} {
  return (manager as unknown as { db: ReturnType<typeof dbOf> }).db;
}

function tableOf(manager: ConfigManager, key: ConfigBrowserTableKey): DexieTable {
  return dbOf(manager)[key === 'userProfile' ? 'userProfile' : key];
}

const SCOPABLE: ReadonlySet<ConfigBrowserTableKey> = new Set(['appConfig', 'userProfile']);

export async function configBrowserCounts(
  manager: ConfigManager,
  appId: string,
): Promise<ConfigBrowserCounts> {
  const db = dbOf(manager);
  const [a, r, u, ro, p, ps] = await Promise.all([
    appId ? db.appConfig.where('appId').equals(appId).count() : db.appConfig.count(),
    db.appRegistry.count(),
    appId ? db.userProfile.where('appId').equals(appId).count() : db.userProfile.count(),
    db.roles.count(),
    db.permissions.count(),
    db.pendingSync.count(),
  ]);
  return {
    appConfig: a,
    appRegistry: r,
    userProfile: u,
    roles: ro,
    permissions: p,
    pendingSync: ps,
  };
}

export async function configBrowserList(
  manager: ConfigManager,
  table: ConfigBrowserTableKey,
  appId: string,
): Promise<unknown[]> {
  const t = tableOf(manager, table);
  if (SCOPABLE.has(table) && appId) {
    return t.where('appId').equals(appId).toArray();
  }
  return t.toArray();
}

export async function configBrowserGet(
  manager: ConfigManager,
  table: ConfigBrowserTableKey,
  pk: string | number,
): Promise<unknown | undefined> {
  return tableOf(manager, table).get(pk);
}

async function syncCatalogAfterAppConfigSave(
  catalog: ConfigCatalogCache | null,
  row: AppConfigRow,
): Promise<void> {
  if (!catalog || !isCatalogConfigRow(row)) return;
  await catalog.invalidate(row.configId);
}

export async function configBrowserSave(
  manager: ConfigManager,
  catalog: ConfigCatalogCache | null,
  table: ConfigBrowserTableKey,
  row: Record<string, unknown>,
): Promise<void> {
  switch (table) {
    case 'appConfig': {
      const appRow = row as unknown as AppConfigRow;
      await manager.saveConfig(appRow);
      await syncCatalogAfterAppConfigSave(catalog, appRow);
      return;
    }
    case 'appRegistry':
      await manager.saveAppRegistry(row as never);
      return;
    case 'userProfile':
      await manager.saveUserProfile(row as never);
      return;
    case 'roles':
      await manager.saveRole(row as never);
      return;
    case 'permissions':
      await manager.savePermission(row as never);
      return;
    case 'pendingSync':
      await dbOf(manager).pendingSync.put(row);
      return;
  }
}

export async function configBrowserDelete(
  manager: ConfigManager,
  catalog: ConfigCatalogCache | null,
  table: ConfigBrowserTableKey,
  pk: string | number,
): Promise<void> {
  switch (table) {
    case 'appConfig':
      await manager.deleteConfig(String(pk));
      if (catalog) await catalog.invalidate(String(pk));
      return;
    case 'appRegistry':
      await manager.deleteAppRegistry(String(pk));
      return;
    case 'userProfile':
      await manager.deleteUserProfile(String(pk));
      return;
    case 'roles':
      await manager.deleteRole(String(pk));
      return;
    case 'permissions':
      await manager.deletePermission(String(pk));
      return;
    case 'pendingSync':
      await dbOf(manager).pendingSync.delete(pk);
      return;
  }
}

export async function configBrowserExportBundle(
  manager: ConfigManager,
  appId: string,
): Promise<ConfigBrowserExportBundle> {
  const db = dbOf(manager);
  const [appConfig, appRegistry, userProfiles, roles, permissions] = await Promise.all([
    appId ? db.appConfig.where('appId').equals(appId).toArray() : db.appConfig.toArray(),
    db.appRegistry.toArray(),
    appId ? db.userProfile.where('appId').equals(appId).toArray() : db.userProfile.toArray(),
    db.roles.toArray(),
    db.permissions.toArray(),
  ]);
  return {
    appConfig: appConfig as AppConfigRow[],
    appRegistry,
    userProfiles,
    roles,
    permissions,
  };
}

export async function configBrowserExportDeployTables(
  manager: ConfigManager,
): Promise<ConfigBrowserExportBundle> {
  const db = dbOf(manager);
  const [appConfig, appRegistry, userProfiles, roles, permissions] = await Promise.all([
    manager.getAllConfigsUnfiltered(),
    db.appRegistry.toArray(),
    db.userProfile.toArray(),
    db.roles.toArray(),
    db.permissions.toArray(),
  ]);
  return {
    appConfig,
    appRegistry,
    userProfiles,
    roles,
    permissions,
  };
}
