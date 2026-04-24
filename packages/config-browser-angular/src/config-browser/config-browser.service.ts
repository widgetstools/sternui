/* eslint-disable @typescript-eslint/no-explicit-any */
import { Injectable, signal, computed } from '@angular/core';
// /config subpath = workspace-platform-free entry; safe in non-OpenFin
// contexts. See packages/openfin-platform/src/config-only.ts.
import {
  getConfigManager,
  readHostEnv,
  type HostEnv,
} from '@marketsui/openfin-platform/config';
import type { ConfigManager } from '@marketsui/config-service';
import { TABLES, type TableKey, type TableMeta } from './tables';

export interface Counts {
  appConfig: number; appRegistry: number; userProfile: number;
  roles: number; permissions: number; pendingSync: number;
}

const ZERO_COUNTS: Counts = {
  appConfig: 0, appRegistry: 0, userProfile: 0,
  roles: 0, permissions: 0, pendingSync: 0,
};

function tableOf(manager: ConfigManager, key: TableKey): any {
  const db = (manager as unknown as { db: any }).db;
  switch (key) {
    case 'appConfig':   return db.appConfig;
    case 'appRegistry': return db.appRegistry;
    case 'userProfile': return db.userProfile;
    case 'roles':       return db.roles;
    case 'permissions': return db.permissions;
    case 'pendingSync': return db.pendingSync;
  }
}

@Injectable()
export class ConfigBrowserService {
  private manager: ConfigManager | null = null;

  private _hostEnv = signal<HostEnv>({ appId: '', configServiceUrl: '' });
  private _selected = signal<TableKey>('appConfig');
  private _rows = signal<any[]>([]);
  private _counts = signal<Counts>(ZERO_COUNTS);
  private _isLoading = signal(true);

  readonly hostEnv = computed(() => this._hostEnv());
  readonly selected = computed<TableMeta>(() =>
    TABLES.find((t) => t.key === this._selected())!,
  );
  readonly rows = computed(() => this._rows());
  readonly counts = computed(() => this._counts());
  readonly isLoading = computed(() => this._isLoading());

  async init(): Promise<void> {
    try {
      const [env, manager] = await Promise.all([
        readHostEnv(),
        getConfigManager(),
      ]);
      this._hostEnv.set(env);
      this.manager = manager;
      await this.loadCounts();
      await this.loadRows();
    } catch (err) {
      console.error('Config Browser boot failed:', err);
      this._isLoading.set(false);
    }
  }

  setSelected(key: TableKey): void {
    this._selected.set(key);
    void this.loadRows();
  }

  async refresh(): Promise<void> {
    await Promise.all([this.loadCounts(), this.loadRows()]);
  }

  async saveRow(row: any): Promise<void> {
    const manager = this.manager;
    if (!manager) return;
    const key = this._selected();
    switch (key) {
      case 'appConfig':   await manager.saveConfig(row); break;
      case 'appRegistry': await manager.saveAppRegistry(row); break;
      case 'userProfile': await manager.saveUserProfile(row); break;
      case 'roles':       await manager.saveRole(row); break;
      case 'permissions': await manager.savePermission(row); break;
      case 'pendingSync': await (manager as any).db.pendingSync.put(row); break;
    }
    await this.refresh();
  }

  async deleteRow(id: string | number): Promise<void> {
    const manager = this.manager;
    if (!manager) return;
    const key = this._selected();
    switch (key) {
      case 'appConfig':   await manager.deleteConfig(String(id)); break;
      case 'appRegistry': await manager.deleteAppRegistry(String(id)); break;
      case 'userProfile': await manager.deleteUserProfile(String(id)); break;
      case 'roles':       await manager.deleteRole(String(id)); break;
      case 'permissions': await manager.deletePermission(String(id)); break;
      case 'pendingSync': await (manager as any).db.pendingSync.delete(id); break;
    }
    await this.refresh();
  }

  private async loadCounts(): Promise<void> {
    const manager = this.manager;
    if (!manager) return;
    const appId = this._hostEnv().appId;
    const db = (manager as any).db;
    const [a, r, u, ro, p, ps] = await Promise.all([
      appId ? db.appConfig.where('appId').equals(appId).count() : db.appConfig.count(),
      db.appRegistry.count(),
      appId ? db.userProfile.where('appId').equals(appId).count() : db.userProfile.count(),
      db.roles.count(),
      db.permissions.count(),
      db.pendingSync.count(),
    ]);
    this._counts.set({
      appConfig: a, appRegistry: r, userProfile: u,
      roles: ro, permissions: p, pendingSync: ps,
    });
  }

  private async loadRows(): Promise<void> {
    const manager = this.manager;
    if (!manager) return;
    this._isLoading.set(true);
    const key = this._selected();
    const meta = TABLES.find((t) => t.key === key)!;
    const appId = this._hostEnv().appId;
    const table = tableOf(manager, key);
    const collection = meta.scopable && appId
      ? table.where('appId').equals(appId)
      : table;
    const data = await collection.toArray();
    this._rows.set(data);
    this._isLoading.set(false);
  }
}
