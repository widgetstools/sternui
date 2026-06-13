/**
 * Config Browser persistence surface — implemented by the worker
 * {@link WorkerConfigManagerClient} (RPC) and {@link LocalConfigBrowserAccess}
 * (main-thread Dexie fallback for config-only windows).
 */

import type { AppConfigRow } from '@starui/host-config';
import type { ConfigBrowserTableKey } from '@starui/host-config';

export interface ConfigBrowserCounts {
  appConfig: number;
  appRegistry: number;
  userProfile: number;
  roles: number;
  permissions: number;
  pendingSync: number;
}

export interface ConfigBrowserExportBundle {
  appConfig: AppConfigRow[];
  appRegistry: unknown[];
  userProfiles: unknown[];
  roles: unknown[];
  permissions: unknown[];
}

export interface ConfigBrowserAccess {
  getAppId(): string;
  getIdentity(): { userId: string; displayName?: string };
  getRestUrl?(): string | undefined;
  /** Async REST URL lookup (worker RPC). */
  fetchRestUrl?(): Promise<string | undefined>;

  getCounts(appId: string): Promise<ConfigBrowserCounts>;
  listTable(table: ConfigBrowserTableKey, appId: string): Promise<unknown[]>;
  getTableRow(table: ConfigBrowserTableKey, pk: string | number): Promise<unknown | undefined>;

  saveConfig(row: AppConfigRow): Promise<void>;
  deleteConfig(id: string): Promise<void>;
  saveAppRegistry(row: Record<string, unknown>): Promise<void>;
  deleteAppRegistry(id: string): Promise<void>;
  saveUserProfile(row: Record<string, unknown>): Promise<void>;
  deleteUserProfile(id: string): Promise<void>;
  saveRole(row: Record<string, unknown>): Promise<void>;
  deleteRole(id: string): Promise<void>;
  savePermission(row: Record<string, unknown>): Promise<void>;
  deletePermission(id: string): Promise<void>;
  putPendingSync(row: Record<string, unknown>): Promise<void>;
  deletePendingSync(id: string | number): Promise<void>;

  getAllConfigsUnfiltered(): Promise<AppConfigRow[]>;
  exportBundle(appId: string): Promise<ConfigBrowserExportBundle>;
  exportDeployTables(): Promise<ConfigBrowserExportBundle>;

  /** Grid profile cross-tab refresh — optional on local fallback. */
  profiles?: {
    subscribe(scope: { instanceId: string }, fn: () => void): () => void;
  };
}
