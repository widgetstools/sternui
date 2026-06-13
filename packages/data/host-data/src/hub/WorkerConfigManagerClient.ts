/**
 * UI-thread facade over the SharedWorker's authoritative ConfigManager.
 *
 * All reads and writes route through hub RPC — the worker owns Dexie,
 * seeding, and REST sync. Covers data-provider catalog, Config Browser
 * table I/O, and grid profile persistence (`getConfig` / `saveConfig`).
 */

import type { AppConfigRow, ConfigManager } from '@starui/host-config';
import type { ConfigBrowserTableKey } from '@starui/host-config';
import type { SharedWorkerDataServicesClient } from '../runtime/client/SharedWorkerDataServicesClient.js';
import type {
  ConfigBrowserAccess,
  ConfigBrowserCounts,
  ConfigBrowserExportBundle,
} from './ConfigBrowserAccess.js';
import { HubDataProviderConfigStore } from './HubDataProviderConfigStore.js';

export interface WorkerConfigIdentity {
  appId: string;
  userId: string;
}

export class WorkerConfigManagerClient implements ConfigBrowserAccess {
  private readonly providers: HubDataProviderConfigStore;

  constructor(
    private readonly hub: SharedWorkerDataServicesClient,
    private readonly identity: WorkerConfigIdentity,
  ) {
    this.providers = new HubDataProviderConfigStore(hub);
  }

  dataProviders(): HubDataProviderConfigStore {
    return this.providers;
  }

  getAppId(): string {
    return this.identity.appId;
  }

  getIdentity(): { userId: string; displayName?: string } {
    return { userId: this.identity.userId, displayName: this.identity.userId };
  }

  fetchRestUrl(): Promise<string | undefined> {
    return this.hub.getConfigBrowserMeta();
  }

  async ready(): Promise<void> {
    await this.hub.waitForCatalogReady();
  }

  dispose(): void {
    /* hub bundle owns client lifetime */
  }

  onConfigChanged(_fn: (configId: string) => void): () => void {
    return () => {};
  }

  getCounts(appId: string): Promise<ConfigBrowserCounts> {
    return this.hub.configBrowserCounts(appId);
  }

  listTable(table: ConfigBrowserTableKey, appId: string): Promise<unknown[]> {
    return this.hub.configBrowserList(table, appId);
  }

  getTableRow(table: ConfigBrowserTableKey, pk: string | number): Promise<unknown | undefined> {
    return this.hub.configBrowserGet(table, pk);
  }

  saveConfig(row: AppConfigRow): Promise<void> {
    return this.hub.configBrowserSave('appConfig', row as unknown as Record<string, unknown>);
  }

  deleteConfig(id: string): Promise<void> {
    return this.hub.configBrowserDelete('appConfig', id);
  }

  saveAppRegistry(row: Record<string, unknown>): Promise<void> {
    return this.hub.configBrowserSave('appRegistry', row);
  }

  deleteAppRegistry(id: string): Promise<void> {
    return this.hub.configBrowserDelete('appRegistry', id);
  }

  saveUserProfile(row: Record<string, unknown>): Promise<void> {
    return this.hub.configBrowserSave('userProfile', row);
  }

  deleteUserProfile(id: string): Promise<void> {
    return this.hub.configBrowserDelete('userProfile', id);
  }

  saveRole(row: Record<string, unknown>): Promise<void> {
    return this.hub.configBrowserSave('roles', row);
  }

  deleteRole(id: string): Promise<void> {
    return this.hub.configBrowserDelete('roles', id);
  }

  savePermission(row: Record<string, unknown>): Promise<void> {
    return this.hub.configBrowserSave('permissions', row);
  }

  deletePermission(id: string): Promise<void> {
    return this.hub.configBrowserDelete('permissions', id);
  }

  putPendingSync(row: Record<string, unknown>): Promise<void> {
    return this.hub.configBrowserSave('pendingSync', row);
  }

  deletePendingSync(id: string | number): Promise<void> {
    return this.hub.configBrowserDelete('pendingSync', id);
  }

  async getAllConfigsUnfiltered(): Promise<AppConfigRow[]> {
    const bundle = await this.hub.configBrowserExport({ deploy: true });
    return bundle.appConfig;
  }

  exportBundle(appId: string): Promise<ConfigBrowserExportBundle> {
    return this.hub.configBrowserExport({ appId });
  }

  exportDeployTables(): Promise<ConfigBrowserExportBundle> {
    return this.hub.configBrowserExport({ deploy: true });
  }

  readonly profiles = {
    subscribe: (scope: { instanceId: string }, fn: () => void) =>
      this.hub.onCatalogChange((detail) => {
        if (!detail.providerId || detail.providerId === scope.instanceId) fn();
      }),
  };
};

export function isWorkerConfigManagerClient(
  cm: ConfigManager | WorkerConfigManagerClient | unknown,
): cm is WorkerConfigManagerClient {
  return cm instanceof WorkerConfigManagerClient;
}
