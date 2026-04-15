import type { GridConfig, ProfileSnapshot } from '../types/profile';
import { CURRENT_SCHEMA_VERSION } from '../types/profile';
import { BaseStorageAdapter } from './BaseStorageAdapter';

const PREFIX = 'gc-grid:';
// Legacy v1 keys — read once for migration, then ignored.
const LEGACY_PROFILE_PREFIX = 'gc-profile:';
const LEGACY_DEFAULTS_KEY = 'gc-defaults';

export class LocalStorageAdapter extends BaseStorageAdapter {
  constructor() {
    super();
    this.migrateFromLegacy();
  }

  async loadGridConfig(gridId: string): Promise<GridConfig | null> {
    const raw = localStorage.getItem(PREFIX + gridId);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as GridConfig;
    } catch {
      return null;
    }
  }

  async saveGridConfig(config: GridConfig): Promise<void> {
    localStorage.setItem(PREFIX + config.gridId, JSON.stringify(config));
  }

  async deleteGridConfig(gridId: string): Promise<void> {
    localStorage.removeItem(PREFIX + gridId);
  }

  async listGridIds(): Promise<string[]> {
    const ids: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(PREFIX)) ids.push(key.slice(PREFIX.length));
    }
    return ids;
  }

  /**
   * One-time, best-effort migration from the v1 per-profile schema. Reads any
   * `gc-profile:*` entries, groups them by gridId, writes one `gc-grid:*` blob
   * per group, then removes the old keys.
   */
  private migrateFromLegacy(): void {
    try {
      const buckets = new Map<string, GridConfig>();
      const oldKeys: string[] = [];

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key?.startsWith(LEGACY_PROFILE_PREFIX)) continue;
        oldKeys.push(key);
        const profileId = key.slice(LEGACY_PROFILE_PREFIX.length);
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        let snap: ProfileSnapshot;
        try { snap = JSON.parse(raw); } catch { continue; }

        const gridId = snap.gridId;
        let bucket = buckets.get(gridId);
        if (!bucket) {
          bucket = {
            version: CURRENT_SCHEMA_VERSION,
            gridId,
            defaultProfileId: null,
            profiles: {},
            updatedAt: Date.now(),
          };
          buckets.set(gridId, bucket);
        }
        bucket.profiles[profileId] = snap;
      }

      if (buckets.size === 0) return;

      // Apply legacy defaults
      const defaultsRaw = localStorage.getItem(LEGACY_DEFAULTS_KEY);
      if (defaultsRaw) {
        try {
          const defaults = JSON.parse(defaultsRaw) as Record<string, string>;
          for (const [gridId, profileId] of Object.entries(defaults)) {
            const bucket = buckets.get(gridId);
            if (bucket) bucket.defaultProfileId = profileId;
          }
        } catch { /* ignore */ }
      }

      // Persist new buckets, then strip legacy entries
      for (const config of buckets.values()) {
        // Don't clobber an already-migrated bucket if one exists
        if (localStorage.getItem(PREFIX + config.gridId)) continue;
        localStorage.setItem(PREFIX + config.gridId, JSON.stringify(config));
      }
      for (const key of oldKeys) localStorage.removeItem(key);
      if (defaultsRaw) localStorage.removeItem(LEGACY_DEFAULTS_KEY);
    } catch {
      /* migration failures are non-fatal */
    }
  }
}
