import type { ProfileSnapshot, ProfileMeta, GridConfig } from '../types/profile';
import { CURRENT_SCHEMA_VERSION } from '../types/profile';
import type { StorageAdapter } from './StorageAdapter';
import { migrateSnapshot } from './migrations';

/**
 * Most adapters only differ in *where* they put the GridConfig blob. This
 * base class derives every per-profile operation from a tiny set of per-grid
 * read/write primitives, so concrete adapters only have to implement four
 * methods (load/save/delete/listGridIds).
 */
export abstract class BaseStorageAdapter implements StorageAdapter {
  abstract loadGridConfig(gridId: string): Promise<GridConfig | null>;
  abstract saveGridConfig(config: GridConfig): Promise<void>;
  abstract deleteGridConfig(gridId: string): Promise<void>;

  // ─── Per-profile operations (derived) ───────────────────────────────────

  async saveProfile(gridId: string, profileId: string, snapshot: ProfileSnapshot): Promise<void> {
    const config = (await this.loadGridConfig(gridId)) ?? this.emptyConfig(gridId);
    config.profiles[profileId] = { ...snapshot, gridId };
    config.updatedAt = Date.now();
    await this.saveGridConfig(config);
  }

  async loadProfile(gridId: string, profileId: string): Promise<ProfileSnapshot | null> {
    const config = await this.loadGridConfig(gridId);
    const snap = config?.profiles[profileId];
    return snap ? migrateSnapshot(snap) : null;
  }

  async deleteProfile(gridId: string, profileId: string): Promise<void> {
    const config = await this.loadGridConfig(gridId);
    if (!config) return;
    if (!(profileId in config.profiles)) return;
    delete config.profiles[profileId];
    if (config.defaultProfileId === profileId) config.defaultProfileId = null;
    config.updatedAt = Date.now();
    await this.saveGridConfig(config);
  }

  async listProfiles(gridId: string): Promise<ProfileMeta[]> {
    const config = await this.loadGridConfig(gridId);
    if (!config) return [];
    return Object.entries(config.profiles)
      .map(([id, snap]) => ({
        id,
        gridId: snap.gridId,
        name: snap.name,
        description: snap.description,
        createdAt: snap.createdAt,
        updatedAt: snap.updatedAt,
        isDefault: config.defaultProfileId === id,
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async getDefault(gridId: string): Promise<string | null> {
    const config = await this.loadGridConfig(gridId);
    return config?.defaultProfileId ?? null;
  }

  async setDefault(gridId: string, profileId: string | null): Promise<void> {
    const config = (await this.loadGridConfig(gridId)) ?? this.emptyConfig(gridId);
    config.defaultProfileId = profileId;
    config.updatedAt = Date.now();
    await this.saveGridConfig(config);
  }

  // ─── Per-profile JSON ───────────────────────────────────────────────────

  async exportProfile(gridId: string, profileId: string): Promise<string> {
    const snap = await this.loadProfile(gridId, profileId);
    if (!snap) throw new Error(`Profile not found: ${profileId}`);
    return JSON.stringify(snap, null, 2);
  }

  async importProfile(gridId: string, json: string): Promise<string> {
    const parsed = JSON.parse(json) as ProfileSnapshot;
    const snapshot = migrateSnapshot({ ...parsed, gridId });
    const profileId = `imported-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await this.saveProfile(gridId, profileId, snapshot);
    return profileId;
  }

  // ─── Whole-grid operations ──────────────────────────────────────────────

  async exportGridConfig(gridId: string): Promise<string> {
    const config = await this.loadGridConfig(gridId);
    if (!config) throw new Error(`No config for grid: ${gridId}`);
    return JSON.stringify(config, null, 2);
  }

  async importGridConfig(json: string, asGridId?: string): Promise<string> {
    const parsed = JSON.parse(json) as GridConfig;
    const gridId = asGridId ?? parsed.gridId;
    // Re-stamp gridId on every nested profile so they stay consistent
    const profiles: Record<string, ProfileSnapshot> = {};
    for (const [pid, snap] of Object.entries(parsed.profiles ?? {})) {
      profiles[pid] = { ...snap, gridId };
    }
    const config: GridConfig = {
      version: parsed.version ?? CURRENT_SCHEMA_VERSION,
      gridId,
      defaultProfileId: parsed.defaultProfileId ?? null,
      profiles,
      updatedAt: Date.now(),
    };
    await this.saveGridConfig(config);
    return gridId;
  }

  async cloneGridConfig(srcGridId: string, destGridId: string): Promise<void> {
    const src = await this.loadGridConfig(srcGridId);
    if (!src) throw new Error(`No config for grid: ${srcGridId}`);
    // Stamp destGridId throughout
    const profiles: Record<string, ProfileSnapshot> = {};
    for (const [pid, snap] of Object.entries(src.profiles)) {
      profiles[pid] = { ...snap, gridId: destGridId };
    }
    await this.saveGridConfig({
      version: src.version,
      gridId: destGridId,
      defaultProfileId: src.defaultProfileId,
      profiles,
      updatedAt: Date.now(),
    });
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  protected emptyConfig(gridId: string): GridConfig {
    return {
      version: CURRENT_SCHEMA_VERSION,
      gridId,
      defaultProfileId: null,
      profiles: {},
      updatedAt: Date.now(),
    };
  }
}
