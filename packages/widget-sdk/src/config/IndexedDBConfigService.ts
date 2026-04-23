import Dexie, { type Table } from 'dexie';
import type { ConfigRow, ConfigService, ConfigQuery, SaveInput } from '@marketsui/shared-types';
import { ConfigId } from '@marketsui/shared-types';

class ConfigDB extends Dexie {
  configs!: Table<ConfigRow, string>;

  constructor(dbName: string) {
    super(dbName);
    this.version(1).stores({
      // Compound indexes cover all ConfigQuery patterns without full table scans
      configs: 'id, [appId+type], [appId+configType], [appId+configType+configSubType]',
    });
  }
}

export class IndexedDBConfigService implements ConfigService {
  private db: ConfigDB;

  constructor(
    private appId: string,
    private userId: string,
    dbName: string = 'marketsui',
  ) {
    this.db = new ConfigDB(dbName);
  }

  async get(id: string): Promise<ConfigRow | null> {
    return (await this.db.configs.get(id)) ?? null;
  }

  async save(input: SaveInput): Promise<ConfigRow> {
    const id = input.id ?? this.deriveId(input);
    const existing = await this.get(id);
    const now = Date.now();
    const row: ConfigRow = {
      ...input,
      id,
      appId: this.appId,
      createdBy: existing?.createdBy ?? this.userId, // write-once
      updatedBy: this.userId,
      updatedAt: now,
    };
    await this.db.configs.put(row);
    return row;
  }

  async list(q: ConfigQuery): Promise<ConfigRow[]> {
    let rows: ConfigRow[];

    if (q.configType && q.configSubType) {
      rows = await this.db.configs
        .where('[appId+configType+configSubType]')
        .equals([q.appId, q.configType, q.configSubType])
        .toArray();
    } else if (q.configType) {
      rows = await this.db.configs
        .where('[appId+configType]')
        .equals([q.appId, q.configType])
        .toArray();
    } else {
      rows = await this.db.configs
        .where('[appId+type]')
        .equals([q.appId, q.type!])
        .toArray();
    }

    if (q.type) rows = rows.filter((r) => r.type === q.type);
    if (q.idPrefix) rows = rows.filter((r) => r.id.startsWith(q.idPrefix!));
    return rows;
  }

  async delete(id: string): Promise<void> {
    await this.db.configs.delete(id);
  }

  async clone(sourceId: string, newId: string): Promise<ConfigRow> {
    const src = await this.get(sourceId);
    if (!src) throw new Error(`clone: source not found — ${sourceId}`);
    return this.save({
      id: newId,
      appId: this.appId,
      configType: src.configType,
      configSubType: src.configSubType,
      type: src.type,
      config: structuredClone(src.config),
      clonedFrom: sourceId,
    });
  }

  private deriveId(input: SaveInput): string {
    if (input.type === 'registration') return ConfigId.registration(input.configType, input.configSubType);
    if (input.type === 'template')     return ConfigId.template(input.configType, input.configSubType);
    if (input.type === 'workspace')    return ConfigId.workspace();
    return ConfigId.instance(input.configType, input.configSubType);
  }
}
