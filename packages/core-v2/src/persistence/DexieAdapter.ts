import Dexie, { type Table } from 'dexie';
import type { ProfileSnapshot, StorageAdapter } from './StorageAdapter';

const DB_NAME = 'gc-customizer-v2';

interface ProfileRow extends ProfileSnapshot {
  /** Compound key string `${gridId}::${id}`. Dexie indexes scalar primary
   *  keys cleanly; a string concat is the simplest stable shape. */
  pk: string;
}

class GcDb extends Dexie {
  profiles!: Table<ProfileRow, string>;

  constructor() {
    super(DB_NAME);
    // v1 schema: pk is the primary key; (gridId) is indexed for listProfiles.
    this.version(1).stores({
      profiles: 'pk, gridId',
    });
  }
}

/**
 * IndexedDB-backed storage adapter, lazily opens a single shared Dexie
 * instance the first time any method is called. Safe to construct in module
 * scope — no I/O happens until used.
 */
export class DexieAdapter implements StorageAdapter {
  private db: GcDb | null = null;

  private getDb(): GcDb {
    if (!this.db) this.db = new GcDb();
    return this.db;
  }

  async loadProfile(gridId: string, profileId: string): Promise<ProfileSnapshot | null> {
    const row = await this.getDb().profiles.get(pk(gridId, profileId));
    return row ? rowToSnapshot(row) : null;
  }

  async saveProfile(snapshot: ProfileSnapshot): Promise<void> {
    const row: ProfileRow = { ...snapshot, pk: pk(snapshot.gridId, snapshot.id) };
    await this.getDb().profiles.put(row);
  }

  async deleteProfile(gridId: string, profileId: string): Promise<void> {
    await this.getDb().profiles.delete(pk(gridId, profileId));
  }

  async listProfiles(gridId: string): Promise<ProfileSnapshot[]> {
    const rows = await this.getDb().profiles.where('gridId').equals(gridId).toArray();
    return rows.map(rowToSnapshot);
  }
}

const pk = (gridId: string, profileId: string): string => `${gridId}::${profileId}`;

const rowToSnapshot = (row: ProfileRow): ProfileSnapshot => {
  // Strip the synthetic `pk` field so consumers only see the public shape.
  const { pk: _pk, ...rest } = row;
  void _pk;
  return rest;
};
