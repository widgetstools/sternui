import Dexie, { type Table } from 'dexie';
import type { LayoutSnapshot, StorageAdapter } from './StorageAdapter';

/**
 * IndexedDB-backed adapter. Keeps v2's database name (`gc-customizer-v2`)
 * and record shape so layouts saved on main continue to load on v3 with
 * zero migration.
 *
 * Shape on disk:
 *   { id, gridId, name, state, createdAt, updatedAt, pk: "<gridId>::<id>" }
 *
 * `pk` is the primary key; the `[gridId]` index lets us list all layouts
 * for one grid quickly.
 *
 * Wire-format note: the Dexie table name remains `profiles` and the
 * database name remains `gc-customizer-v2` — these are byte-identical
 * to pre-rename installs so existing users' data keeps loading without
 * migration. Only the in-code symbol names changed (LayoutSnapshot,
 * loadLayout, etc.).
 */
interface DbRow extends LayoutSnapshot {
  pk: string;
}

class Database extends Dexie {
  profiles!: Table<DbRow, string>;

  constructor() {
    super('gc-customizer-v2');
    this.version(1).stores({
      profiles: 'pk, gridId',
    });
  }
}

export class DexieAdapter implements StorageAdapter {
  private db = new Database();

  private pk(gridId: string, id: string): string {
    return `${gridId}::${id}`;
  }

  async loadLayout(gridId: string, id: string): Promise<LayoutSnapshot | null> {
    const row = await this.db.profiles.get(this.pk(gridId, id));
    if (!row) return null;
    const { pk: _pk, ...rest } = row;
    void _pk;
    return rest;
  }

  async saveLayout(snapshot: LayoutSnapshot): Promise<void> {
    await this.db.profiles.put({
      ...snapshot,
      pk: this.pk(snapshot.gridId, snapshot.id),
    });
  }

  async deleteLayout(gridId: string, id: string): Promise<void> {
    await this.db.profiles.delete(this.pk(gridId, id));
  }

  async listLayouts(gridId: string): Promise<LayoutSnapshot[]> {
    const rows = await this.db.profiles.where('gridId').equals(gridId).toArray();
    return rows.map(({ pk: _pk, ...rest }) => {
      void _pk;
      return rest;
    });
  }
}
