import type { AppConfigRow, ConfigManager } from '@starui/host-config';
import type { ConfigBrowserTableKey } from '@starui/host-config';
import type {
  ConfigBrowserAccess,
  ConfigBrowserCounts,
  ConfigBrowserExportBundle,
} from './ConfigBrowserAccess.js';
import {
  configBrowserCounts,
  configBrowserDelete,
  configBrowserExportBundle,
  configBrowserExportDeployTables,
  configBrowserGet,
  configBrowserList,
  configBrowserSave,
} from './configBrowserHubOps.js';

/** Main-thread Dexie fallback for config-only windows. */
export class LocalConfigBrowserAccess implements ConfigBrowserAccess {
  constructor(private readonly manager: ConfigManager) {}

  getAppId(): string {
    return this.manager.getAppId();
  }

  getIdentity(): { userId: string; displayName?: string } {
    return this.manager.getIdentity();
  }

  getRestUrl(): string | undefined {
    return this.manager.getRestUrl?.();
  }

  fetchRestUrl(): Promise<string | undefined> {
    return Promise.resolve(this.getRestUrl());
  }

  getCounts(appId: string): Promise<ConfigBrowserCounts> {
    return configBrowserCounts(this.manager, appId);
  }

  listTable(table: ConfigBrowserTableKey, appId: string): Promise<unknown[]> {
    return configBrowserList(this.manager, table, appId);
  }

  getTableRow(table: ConfigBrowserTableKey, pk: string | number): Promise<unknown | undefined> {
    return configBrowserGet(this.manager, table, pk);
  }

  async saveConfig(row: AppConfigRow): Promise<void> {
    await configBrowserSave(this.manager, null, 'appConfig', row as unknown as Record<string, unknown>);
  }

  deleteConfig(id: string): Promise<void> {
    return configBrowserDelete(this.manager, null, 'appConfig', id);
  }

  async saveAppRegistry(row: Record<string, unknown>): Promise<void> {
    await configBrowserSave(this.manager, null, 'appRegistry', row);
  }

  deleteAppRegistry(id: string): Promise<void> {
    return configBrowserDelete(this.manager, null, 'appRegistry', id);
  }

  async saveUserProfile(row: Record<string, unknown>): Promise<void> {
    await configBrowserSave(this.manager, null, 'userProfile', row);
  }

  deleteUserProfile(id: string): Promise<void> {
    return configBrowserDelete(this.manager, null, 'userProfile', id);
  }

  async saveRole(row: Record<string, unknown>): Promise<void> {
    await configBrowserSave(this.manager, null, 'roles', row);
  }

  deleteRole(id: string): Promise<void> {
    return configBrowserDelete(this.manager, null, 'roles', id);
  }

  async savePermission(row: Record<string, unknown>): Promise<void> {
    await configBrowserSave(this.manager, null, 'permissions', row);
  }

  deletePermission(id: string): Promise<void> {
    return configBrowserDelete(this.manager, null, 'permissions', id);
  }

  async putPendingSync(row: Record<string, unknown>): Promise<void> {
    await configBrowserSave(this.manager, null, 'pendingSync', row);
  }

  deletePendingSync(id: string | number): Promise<void> {
    return configBrowserDelete(this.manager, null, 'pendingSync', id);
  }

  getAllConfigsUnfiltered(): Promise<AppConfigRow[]> {
    return this.manager.getAllConfigsUnfiltered();
  }

  exportBundle(appId: string): Promise<ConfigBrowserExportBundle> {
    return configBrowserExportBundle(this.manager, appId);
  }

  exportDeployTables(): Promise<ConfigBrowserExportBundle> {
    return configBrowserExportDeployTables(this.manager);
  }

  get profiles(): ConfigBrowserAccess['profiles'] {
    return this.manager.profiles;
  }
}
