import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { IConfigurationStorage } from './IConfigurationStorage.js';
import type {
  UnifiedConfig,
  ConfigurationFilter,
  PaginatedResult,
  StorageHealthStatus,
  BulkUpdateRequest,
  BulkUpdateResult,
  CleanupResult
} from '@marketsui/shared-types';

/**
 * SQLite storage implementation using sql.js (pure JavaScript, no native bindings).
 * Extended with nodeId column for hierarchy support.
 */
export class SqliteStorage implements IConfigurationStorage {
  private db: SqlJsDatabase | null = null;
  private dbPath: string;
  private SQL: any = null;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || process.env.SQLITE_DATABASE_PATH || './data/stern-configs.db';
    this.ensureDirectoryExists();
  }

  private ensureDirectoryExists(): void {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  async connect(): Promise<void> {
    this.SQL = await initSqlJs();

    if (fs.existsSync(this.dbPath)) {
      const buffer = fs.readFileSync(this.dbPath);
      this.db = new this.SQL.Database(buffer);
    } else {
      this.db = new this.SQL.Database();
    }

    this.initializeSchema();
  }

  async disconnect(): Promise<void> {
    if (this.db) {
      this.saveToFile();
      this.db.close();
      this.db = null;
    }
  }

  private saveToFile(): void {
    if (this.db) {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(this.dbPath, buffer);
    }
  }

  private initializeSchema(): void {
    if (!this.db) throw new Error('Database not connected');

    this.db.run(`
      CREATE TABLE IF NOT EXISTS configurations (
        configId TEXT PRIMARY KEY,
        appId TEXT NOT NULL,
        userId TEXT NOT NULL,
        parentId TEXT,
        nodeId TEXT,
        componentType TEXT NOT NULL,
        componentSubType TEXT,
        name TEXT NOT NULL,
        description TEXT,
        icon TEXT,
        config TEXT NOT NULL,
        settings TEXT NOT NULL,
        activeSetting TEXT NOT NULL,
        tags TEXT,
        category TEXT,
        isShared BOOLEAN DEFAULT FALSE,
        isDefault BOOLEAN DEFAULT FALSE,
        isLocked BOOLEAN DEFAULT FALSE,
        createdBy TEXT NOT NULL,
        lastUpdatedBy TEXT NOT NULL,
        creationTime DATETIME NOT NULL,
        lastUpdated DATETIME NOT NULL,
        deletedAt DATETIME,
        deletedBy TEXT,
        rowKind TEXT
      );
    `);

    // Migration: Add columns if they don't exist (for existing databases)
    try {
      const tableInfo = this.db.exec("PRAGMA table_info(configurations)");
      const columns = tableInfo[0]?.values?.map((row: any) => row[1]) || [];

      if (!columns.includes('parentId')) {
        this.db.run('ALTER TABLE configurations ADD COLUMN parentId TEXT');
      }
      if (!columns.includes('nodeId')) {
        this.db.run('ALTER TABLE configurations ADD COLUMN nodeId TEXT');
      }
      if (!columns.includes('rowKind')) {
        this.db.run('ALTER TABLE configurations ADD COLUMN rowKind TEXT');
      }
    } catch {
      // Columns already exist or table is new
    }

    // Indexes
    this.db.run('CREATE INDEX IF NOT EXISTS idx_app_user ON configurations(appId, userId)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_component ON configurations(componentType, componentSubType)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_user ON configurations(userId)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_parent ON configurations(parentId)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_node ON configurations(nodeId)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_created ON configurations(creationTime)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_updated ON configurations(lastUpdated)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_deleted ON configurations(deletedAt)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_name ON configurations(name)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_composite_lookup ON configurations(userId, componentType, componentSubType, name)');

    this.saveToFile();
  }

  async create(config: UnifiedConfig): Promise<UnifiedConfig> {
    if (!this.db) throw new Error('Database not connected');

    const sql = `
      INSERT INTO configurations (
        configId, appId, userId, parentId, nodeId, componentType, componentSubType,
        name, description, icon, config, settings, activeSetting, tags, category,
        isShared, isDefault, isLocked, createdBy, lastUpdatedBy,
        creationTime, lastUpdated, deletedAt, deletedBy, rowKind
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    try {
      this.db.run(sql, [
        config.configId,
        config.appId,
        config.userId,
        config.parentId || null,
        config.nodeId || null,
        config.componentType,
        config.componentSubType || null,
        config.name,
        config.description || null,
        config.icon || null,
        JSON.stringify(config.config),
        JSON.stringify(config.settings),
        config.activeSetting,
        config.tags ? JSON.stringify(config.tags) : null,
        config.category || null,
        config.isShared ? 1 : 0,
        config.isDefault ? 1 : 0,
        config.isLocked ? 1 : 0,
        config.createdBy,
        config.lastUpdatedBy,
        config.creationTime.toISOString(),
        config.lastUpdated.toISOString(),
        config.deletedAt ? config.deletedAt.toISOString() : null,
        config.deletedBy || null,
        config.rowKind || null,
      ]);

      this.saveToFile();
      return config;
    } catch (error) {
      if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
        throw new Error(`Configuration with ID ${config.configId} already exists`);
      }
      throw error;
    }
  }

  async findById(configId: string, includeDeleted = false): Promise<UnifiedConfig | null> {
    if (!this.db) throw new Error('Database not connected');

    const whereClause = includeDeleted
      ? 'WHERE configId = ?'
      : 'WHERE configId = ? AND deletedAt IS NULL';

    const result = this.db.exec(`SELECT * FROM configurations ${whereClause}`, [configId]);

    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }

    return this.deserializeConfig(result[0].columns, result[0].values[0]);
  }

  async findByCompositeKey(
    userId: string,
    componentType: string,
    name: string,
    componentSubType?: string
  ): Promise<UnifiedConfig | null> {
    if (!this.db) throw new Error('Database not connected');

    const whereClause = componentSubType
      ? 'WHERE userId = ? AND componentType = ? AND componentSubType = ? AND name = ? AND deletedAt IS NULL'
      : 'WHERE userId = ? AND componentType = ? AND name = ? AND deletedAt IS NULL';

    const params = componentSubType
      ? [userId, componentType, componentSubType, name]
      : [userId, componentType, name];

    const result = this.db.exec(`SELECT * FROM configurations ${whereClause}`, params);

    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }

    return this.deserializeConfig(result[0].columns, result[0].values[0]);
  }

  async update(configId: string, updates: Partial<UnifiedConfig>): Promise<UnifiedConfig> {
    const existing = await this.findById(configId);
    if (!existing) {
      throw new Error(`Configuration ${configId} not found`);
    }

    const updated: UnifiedConfig = {
      ...existing,
      ...updates,
      configId: existing.configId,
      lastUpdated: new Date()
    };

    if (!this.db) throw new Error('Database not connected');

    const sql = `
      UPDATE configurations SET
        appId = ?, userId = ?, parentId = ?, nodeId = ?,
        componentType = ?, componentSubType = ?, name = ?,
        description = ?, icon = ?, config = ?, settings = ?, activeSetting = ?,
        tags = ?, category = ?, isShared = ?, isDefault = ?, isLocked = ?,
        lastUpdatedBy = ?, lastUpdated = ?, rowKind = ?
      WHERE configId = ?
    `;

    this.db.run(sql, [
      updated.appId,
      updated.userId,
      updated.parentId || null,
      updated.nodeId || null,
      updated.componentType,
      updated.componentSubType || null,
      updated.name,
      updated.description || null,
      updated.icon || null,
      JSON.stringify(updated.config),
      JSON.stringify(updated.settings),
      updated.activeSetting,
      updated.tags ? JSON.stringify(updated.tags) : null,
      updated.category || null,
      updated.isShared ? 1 : 0,
      updated.isDefault ? 1 : 0,
      updated.isLocked ? 1 : 0,
      updated.lastUpdatedBy,
      updated.lastUpdated.toISOString(),
      updated.rowKind || null,
      configId,
    ]);

    this.saveToFile();
    return updated;
  }

  async delete(configId: string): Promise<boolean> {
    if (!this.db) throw new Error('Database not connected');

    const sql = `
      UPDATE configurations SET deletedAt = ?, deletedBy = ?
      WHERE configId = ? AND deletedAt IS NULL
    `;

    try {
      this.db.run(sql, [new Date().toISOString(), 'system', configId]);
      this.saveToFile();
      return true;
    } catch {
      return false;
    }
  }

  async clone(sourceConfigId: string, newName: string, userId: string): Promise<UnifiedConfig> {
    const sourceConfig = await this.findById(sourceConfigId);
    if (!sourceConfig) {
      throw new Error(`Configuration ${sourceConfigId} not found`);
    }

    const clonedConfig: UnifiedConfig = {
      ...sourceConfig,
      configId: uuidv4(),
      name: newName,
      userId,
      createdBy: userId,
      lastUpdatedBy: userId,
      creationTime: new Date(),
      lastUpdated: new Date(),
      isDefault: false,
      isLocked: false,
      deletedAt: null,
      deletedBy: null
    };

    return this.create(clonedConfig);
  }

  async findByMultipleCriteria(criteria: ConfigurationFilter): Promise<UnifiedConfig[]> {
    if (!this.db) throw new Error('Database not connected');

    const { whereClause, params } = this.buildWhereClause(criteria);
    const result = this.db.exec(`SELECT * FROM configurations ${whereClause} ORDER BY lastUpdated DESC`, params);

    if (result.length === 0) {
      return [];
    }

    return result[0].values.map((row: any) => this.deserializeConfig(result[0].columns, row));
  }

  async findByAppId(appId: string, includeDeleted = false): Promise<UnifiedConfig[]> {
    return this.findByMultipleCriteria({ appIds: [appId], includeDeleted });
  }

  async findByUserId(userId: string, includeDeleted = false): Promise<UnifiedConfig[]> {
    return this.findByMultipleCriteria({ userIds: [userId], includeDeleted });
  }

  async findByComponentType(
    componentType: string,
    componentSubType?: string,
    includeDeleted = false
  ): Promise<UnifiedConfig[]> {
    const criteria: ConfigurationFilter = {
      componentTypes: [componentType],
      includeDeleted
    };

    if (componentSubType) {
      criteria.componentSubTypes = [componentSubType];
    }

    return this.findByMultipleCriteria(criteria);
  }

  async findWithPagination(
    criteria: ConfigurationFilter,
    page: number,
    limit: number,
    sortBy = 'lastUpdated',
    sortOrder: 'asc' | 'desc' = 'desc'
  ): Promise<PaginatedResult<UnifiedConfig>> {
    if (!this.db) throw new Error('Database not connected');

    const { whereClause, params } = this.buildWhereClause(criteria);

    const countResult = this.db.exec(`SELECT COUNT(*) as total FROM configurations ${whereClause}`, params);
    const total = countResult.length > 0 ? countResult[0].values[0][0] as number : 0;

    const offset = (page - 1) * limit;
    const totalPages = Math.ceil(total / limit);

    const dataResult = this.db.exec(
      `SELECT * FROM configurations ${whereClause} ORDER BY ${sortBy} ${sortOrder.toUpperCase()} LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const data = dataResult.length > 0
      ? dataResult[0].values.map((row: any) => this.deserializeConfig(dataResult[0].columns, row))
      : [];

    return {
      data,
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1
    };
  }

  async bulkCreate(configs: UnifiedConfig[]): Promise<UnifiedConfig[]> {
    if (!this.db) throw new Error('Database not connected');

    const sql = `
      INSERT INTO configurations (
        configId, appId, userId, parentId, nodeId, componentType, componentSubType,
        name, description, icon, config, settings, activeSetting, tags, category,
        isShared, isDefault, isLocked, createdBy, lastUpdatedBy,
        creationTime, lastUpdated, deletedAt, deletedBy
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    for (const config of configs) {
      this.db.run(sql, [
        config.configId,
        config.appId,
        config.userId,
        config.parentId || null,
        config.nodeId || null,
        config.componentType,
        config.componentSubType || null,
        config.name,
        config.description || null,
        config.icon || null,
        JSON.stringify(config.config),
        JSON.stringify(config.settings),
        config.activeSetting,
        config.tags ? JSON.stringify(config.tags) : null,
        config.category || null,
        config.isShared ? 1 : 0,
        config.isDefault ? 1 : 0,
        config.isLocked ? 1 : 0,
        config.createdBy,
        config.lastUpdatedBy,
        config.creationTime.toISOString(),
        config.lastUpdated.toISOString(),
        config.deletedAt ? config.deletedAt.toISOString() : null,
        config.deletedBy || null
      ]);
    }

    this.saveToFile();
    return configs;
  }

  async bulkUpdate(updates: BulkUpdateRequest[]): Promise<BulkUpdateResult[]> {
    const results: BulkUpdateResult[] = [];

    for (const updateReq of updates) {
      try {
        await this.update(updateReq.configId, updateReq.updates);
        results.push({ configId: updateReq.configId, success: true });
      } catch (error) {
        results.push({
          configId: updateReq.configId,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return results;
  }

  async bulkDelete(configIds: string[]): Promise<BulkUpdateResult[]> {
    if (!this.db) throw new Error('Database not connected');

    const results: BulkUpdateResult[] = [];
    const now = new Date().toISOString();

    const sql = `
      UPDATE configurations SET deletedAt = ?, deletedBy = ?
      WHERE configId = ? AND deletedAt IS NULL
    `;

    for (const configId of configIds) {
      try {
        this.db.run(sql, [now, 'system', configId]);
        results.push({ configId, success: true });
      } catch (error) {
        results.push({
          configId,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    this.saveToFile();
    return results;
  }

  async cleanup(dryRun = true): Promise<CleanupResult> {
    if (!this.db) throw new Error('Database not connected');

    const retentionPeriod = 30;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionPeriod);

    const selectResult = this.db.exec(
      `SELECT * FROM configurations WHERE deletedAt IS NOT NULL AND deletedAt < ?`,
      [cutoffDate.toISOString()]
    );

    const configs = selectResult.length > 0
      ? selectResult[0].values.map((row: any) => this.deserializeConfig(selectResult[0].columns, row))
      : [];

    if (!dryRun && configs.length > 0) {
      this.db.run(
        `DELETE FROM configurations WHERE deletedAt IS NOT NULL AND deletedAt < ?`,
        [cutoffDate.toISOString()]
      );
      this.saveToFile();
    }

    return {
      removedCount: configs.length,
      configs: dryRun ? configs : undefined,
      dryRun
    };
  }

  async healthCheck(): Promise<StorageHealthStatus> {
    const startTime = Date.now();

    try {
      if (!this.db) {
        return {
          isHealthy: false,
          connectionStatus: 'disconnected',
          lastChecked: new Date(),
          responseTime: Date.now() - startTime,
          storageType: 'sqlite'
        };
      }

      this.db.exec('SELECT COUNT(*) as count FROM configurations');
      const responseTime = Math.max(1, Date.now() - startTime);

      return {
        isHealthy: true,
        connectionStatus: 'connected',
        lastChecked: new Date(),
        responseTime,
        storageType: 'sqlite'
      };
    } catch (error) {
      return {
        isHealthy: false,
        connectionStatus: 'error',
        lastChecked: new Date(),
        responseTime: Date.now() - startTime,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        storageType: 'sqlite'
      };
    }
  }

  private buildWhereClause(criteria: ConfigurationFilter): { whereClause: string; params: any[] } {
    const conditions: string[] = [];
    const params: any[] = [];

    if (!criteria.includeDeleted) {
      conditions.push('deletedAt IS NULL');
    }

    if (criteria.configIds?.length) {
      conditions.push(`configId IN (${criteria.configIds.map(() => '?').join(',')})`);
      params.push(...criteria.configIds);
    }

    if (criteria.appIds?.length) {
      conditions.push(`appId IN (${criteria.appIds.map(() => '?').join(',')})`);
      params.push(...criteria.appIds);
    }

    if (criteria.userIds?.length) {
      conditions.push(`userId IN (${criteria.userIds.map(() => '?').join(',')})`);
      params.push(...criteria.userIds);
    }

    if (criteria.parentIds?.length) {
      conditions.push(`parentId IN (${criteria.parentIds.map(() => '?').join(',')})`);
      params.push(...criteria.parentIds);
    }

    if (criteria.nodeIds?.length) {
      conditions.push(`nodeId IN (${criteria.nodeIds.map(() => '?').join(',')})`);
      params.push(...criteria.nodeIds);
    }

    if (criteria.componentTypes?.length) {
      conditions.push(`componentType IN (${criteria.componentTypes.map(() => '?').join(',')})`);
      params.push(...criteria.componentTypes);
    }

    if (criteria.componentSubTypes?.length) {
      conditions.push(`componentSubType IN (${criteria.componentSubTypes.map(() => '?').join(',')})`);
      params.push(...criteria.componentSubTypes);
    }

    if (criteria.nameContains) {
      conditions.push('name LIKE ?');
      params.push(`%${criteria.nameContains}%`);
    }

    if (criteria.descriptionContains) {
      conditions.push('description LIKE ?');
      params.push(`%${criteria.descriptionContains}%`);
    }

    if (criteria.isShared !== undefined) {
      conditions.push('isShared = ?');
      params.push(criteria.isShared);
    }

    if (criteria.isDefault !== undefined) {
      conditions.push('isDefault = ?');
      params.push(criteria.isDefault);
    }

    if (criteria.isLocked !== undefined) {
      conditions.push('isLocked = ?');
      params.push(criteria.isLocked);
    }

    if (criteria.createdAfter) {
      conditions.push('creationTime > ?');
      params.push(criteria.createdAfter.toISOString());
    }

    if (criteria.createdBefore) {
      conditions.push('creationTime < ?');
      params.push(criteria.createdBefore.toISOString());
    }

    if (criteria.updatedAfter) {
      conditions.push('lastUpdated > ?');
      params.push(criteria.updatedAfter.toISOString());
    }

    if (criteria.updatedBefore) {
      conditions.push('lastUpdated < ?');
      params.push(criteria.updatedBefore.toISOString());
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    return { whereClause, params };
  }

  private deserializeConfig(columns: string[], values: any[]): UnifiedConfig {
    const row: any = {};
    columns.forEach((col, idx) => {
      row[col] = values[idx];
    });

    return {
      configId: row.configId,
      appId: row.appId,
      userId: row.userId,
      parentId: row.parentId || null,
      nodeId: row.nodeId || undefined,
      componentType: row.componentType,
      componentSubType: row.componentSubType,
      name: row.name,
      description: row.description,
      icon: row.icon,
      config: JSON.parse(row.config),
      settings: JSON.parse(row.settings),
      activeSetting: row.activeSetting,
      tags: row.tags ? JSON.parse(row.tags) : undefined,
      category: row.category,
      isShared: Boolean(row.isShared),
      isDefault: Boolean(row.isDefault),
      isLocked: Boolean(row.isLocked),
      createdBy: row.createdBy,
      lastUpdatedBy: row.lastUpdatedBy,
      creationTime: new Date(row.creationTime),
      lastUpdated: new Date(row.lastUpdated),
      deletedAt: row.deletedAt ? new Date(row.deletedAt) : null,
      deletedBy: row.deletedBy || null,
      rowKind: row.rowKind || undefined,
    };
  }
}
