import Dexie from 'dexie';
import type { ProfileSnapshot, GridConfig } from '../types/profile';
import { CURRENT_SCHEMA_VERSION } from '../types/profile';
import { BaseStorageAdapter } from './BaseStorageAdapter';

interface GridConfigRecord extends GridConfig {
  // primary key is `gridId` (already on GridConfig)
}

// Legacy v1 shape — kept solely for one-time migration
interface LegacyProfileRecord extends ProfileSnapshot {
  id: string;
}
interface LegacyDefaultRecord {
  gridId: string;
  profileId: string;
}

class GridCustomizerDB extends Dexie {
  // v2: single document per grid
  gridConfigs!: Dexie.Table<GridConfigRecord, string>;
  // v1 tables — left in the schema only so migration can read from them
  profiles!: Dexie.Table<LegacyProfileRecord, string>;
  defaults!: Dexie.Table<LegacyDefaultRecord, string>;

  constructor() {
    super('GridCustomizerDB');

    // v1: legacy per-profile schema (existing data)
    this.version(1).stores({
      profiles: 'id, gridId, name, updatedAt',
      defaults: 'gridId',
    });

    // v2: per-grid schema. Migrate old per-profile rows into a single
    // GridConfig per gridId, then leave the old tables in place (Dexie
    // can't drop them mid-migration without data loss for older clients).
    this.version(2)
      .stores({
        gridConfigs: 'gridId, updatedAt',
        profiles: 'id, gridId, name, updatedAt',
        defaults: 'gridId',
      })
      .upgrade(async (tx) => {
        const oldProfiles = await tx.table<LegacyProfileRecord>('profiles').toArray();
        const oldDefaults = await tx.table<LegacyDefaultRecord>('defaults').toArray();
        const defaultMap = new Map(oldDefaults.map((d) => [d.gridId, d.profileId]));

        // Bucket profiles by gridId
        const buckets = new Map<string, GridConfigRecord>();
        for (const rec of oldProfiles) {
          const gridId = rec.gridId;
          let bucket = buckets.get(gridId);
          if (!bucket) {
            bucket = {
              version: CURRENT_SCHEMA_VERSION,
              gridId,
              defaultProfileId: defaultMap.get(gridId) ?? null,
              profiles: {},
              updatedAt: Date.now(),
            };
            buckets.set(gridId, bucket);
          }
          // Strip the synthetic `id` field — it lived on the row, not the snapshot
          const { id, ...snapshot } = rec;
          bucket.profiles[id] = snapshot as ProfileSnapshot;
        }

        if (buckets.size > 0) {
          await tx.table<GridConfigRecord>('gridConfigs').bulkPut(Array.from(buckets.values()));
        }
      });
  }
}

export class DexieAdapter extends BaseStorageAdapter {
  private db: GridCustomizerDB;

  constructor() {
    super();
    this.db = new GridCustomizerDB();
  }

  async loadGridConfig(gridId: string): Promise<GridConfig | null> {
    const rec = await this.db.gridConfigs.get(gridId);
    return rec ?? null;
  }

  async saveGridConfig(config: GridConfig): Promise<void> {
    await this.db.gridConfigs.put(config);
  }

  async deleteGridConfig(gridId: string): Promise<void> {
    await this.db.gridConfigs.delete(gridId);
  }

  /** List every grid that has a config record — useful for clone UIs. */
  async listGridIds(): Promise<string[]> {
    return this.db.gridConfigs.orderBy('updatedAt').reverse().primaryKeys();
  }
}
