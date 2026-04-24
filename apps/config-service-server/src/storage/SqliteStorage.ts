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
  CleanupResult,
} from '@marketsui/shared-types';

/**
 * SQLite storage implementation using sql.js (pure JS, no native bindings).
 *
 * Schema — single `configurations` table with the unified columns only.
 * Soft-delete is a timestamp column; there is no hierarchy, versioning,
 * tags, or access-control on the row. Opaque per-component data lives
 * inside `payload`.
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

    // Detect the legacy schema (columns: name, config, lastUpdated, ...)
    // and refuse to start — guarding against silent data loss. The
    // operator decides: drop the .db file or run a manual migration.
    try {
      const tableInfo = this.db.exec("PRAGMA table_info(configurations)");
      const columns: string[] = tableInfo[0]?.values?.map((row: any) => String(row[1])) ?? [];
      const hasLegacy = columns.includes('name') || columns.includes('lastUpdated');
      const hasUnified = columns.includes('displayText') && columns.includes('payload') && columns.includes('updatedTime');
      if (hasLegacy && !hasUnified) {
        throw new Error(
          `SqliteStorage: legacy schema detected in ${this.dbPath}. ` +
          `The configurations table uses the pre-unified shape (name/config/lastUpdated/hierarchy). ` +
          `Delete the .db file (dev only) or run the migration script before starting the server.`,
        );
      }
    } catch (e) {
      // If the table doesn't exist yet, PRAGMA returns empty — fall through
      // to CREATE TABLE below. Only rethrow real errors (legacy schema).
      if (e instanceof Error && e.message.includes('legacy schema')) {
        throw e;
      }
    }

    this.db.run(`
      CREATE TABLE IF NOT EXISTS configurations (
        configId TEXT PRIMARY KEY,
        appId TEXT NOT NULL,
        userId TEXT NOT NULL,
        componentType TEXT NOT NULL,
        componentSubType TEXT NOT NULL DEFAULT '',
        isTemplate INTEGER NOT NULL DEFAULT 0,
        displayText TEXT NOT NULL,
        payload TEXT NOT NULL,
        createdBy TEXT NOT NULL,
        updatedBy TEXT NOT NULL,
        creationTime TEXT NOT NULL,
        updatedTime TEXT NOT NULL,
        deletedAt TEXT,
        deletedBy TEXT
      );
    `);

    this.db.run('CREATE INDEX IF NOT EXISTS idx_app_user ON configurations(appId, userId)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_component ON configurations(componentType, componentSubType)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_user ON configurations(userId)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_updated ON configurations(updatedTime)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_deleted ON configurations(deletedAt)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_composite_lookup ON configurations(userId, componentType, componentSubType, displayText)');

    this.saveToFile();
  }

  async create(config: UnifiedConfig): Promise<UnifiedConfig> {
    if (!this.db) throw new Error('Database not connected');
    try {
      this.db.run(
        `INSERT INTO configurations (
          configId, appId, userId, componentType, componentSubType, isTemplate,
          displayText, payload, createdBy, updatedBy, creationTime, updatedTime,
          deletedAt, deletedBy
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
        [
          config.configId,
          config.appId,
          config.userId,
          config.componentType,
          config.componentSubType,
          config.isTemplate ? 1 : 0,
          config.displayText,
          JSON.stringify(config.payload ?? null),
          config.createdBy,
          config.updatedBy,
          config.creationTime,
          config.updatedTime,
        ],
      );
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
    const where = includeDeleted ? 'WHERE configId = ?' : 'WHERE configId = ? AND deletedAt IS NULL';
    const result = this.db.exec(`SELECT * FROM configurations ${where}`, [configId]);
    if (result.length === 0 || result[0].values.length === 0) return null;
    return this.deserialize(result[0].columns, result[0].values[0]);
  }

  async findByCompositeKey(
    userId: string,
    componentType: string,
    displayText: string,
    componentSubType?: string,
  ): Promise<UnifiedConfig | null> {
    if (!this.db) throw new Error('Database not connected');
    const where = componentSubType
      ? 'WHERE userId = ? AND componentType = ? AND componentSubType = ? AND displayText = ? AND deletedAt IS NULL'
      : 'WHERE userId = ? AND componentType = ? AND displayText = ? AND deletedAt IS NULL';
    const params = componentSubType
      ? [userId, componentType, componentSubType, displayText]
      : [userId, componentType, displayText];
    const result = this.db.exec(`SELECT * FROM configurations ${where}`, params);
    if (result.length === 0 || result[0].values.length === 0) return null;
    return this.deserialize(result[0].columns, result[0].values[0]);
  }

  async update(configId: string, updates: Partial<UnifiedConfig>): Promise<UnifiedConfig> {
    const existing = await this.findById(configId);
    if (!existing) throw new Error(`Configuration ${configId} not found`);

    const updated: UnifiedConfig = {
      ...existing,
      ...updates,
      configId: existing.configId,
      updatedTime: new Date().toISOString(),
    };

    if (!this.db) throw new Error('Database not connected');
    this.db.run(
      `UPDATE configurations SET
        appId = ?, userId = ?, componentType = ?, componentSubType = ?, isTemplate = ?,
        displayText = ?, payload = ?, updatedBy = ?, updatedTime = ?
       WHERE configId = ?`,
      [
        updated.appId,
        updated.userId,
        updated.componentType,
        updated.componentSubType,
        updated.isTemplate ? 1 : 0,
        updated.displayText,
        JSON.stringify(updated.payload ?? null),
        updated.updatedBy,
        updated.updatedTime,
        configId,
      ],
    );
    this.saveToFile();
    return updated;
  }

  async delete(configId: string): Promise<boolean> {
    if (!this.db) throw new Error('Database not connected');
    const now = new Date().toISOString();
    this.db.run(
      `UPDATE configurations SET deletedAt = ?, deletedBy = ?
       WHERE configId = ? AND deletedAt IS NULL`,
      [now, 'system', configId],
    );
    this.saveToFile();
    return true;
  }

  async clone(
    sourceConfigId: string,
    newDisplayText: string,
    userId: string,
  ): Promise<UnifiedConfig> {
    const src = await this.findById(sourceConfigId);
    if (!src) throw new Error(`Configuration ${sourceConfigId} not found`);
    const now = new Date().toISOString();
    const clone: UnifiedConfig = {
      ...src,
      configId: uuidv4(),
      displayText: newDisplayText,
      userId,
      isTemplate: false,
      createdBy: userId,
      updatedBy: userId,
      creationTime: now,
      updatedTime: now,
    };
    return this.create(clone);
  }

  async findByMultipleCriteria(criteria: ConfigurationFilter): Promise<UnifiedConfig[]> {
    if (!this.db) throw new Error('Database not connected');
    const { whereClause, params } = this.buildWhereClause(criteria);
    const result = this.db.exec(
      `SELECT * FROM configurations ${whereClause} ORDER BY updatedTime DESC`,
      params,
    );
    if (result.length === 0) return [];
    return result[0].values.map((row: any) => this.deserialize(result[0].columns, row));
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
    includeDeleted = false,
  ): Promise<UnifiedConfig[]> {
    const criteria: ConfigurationFilter = { componentTypes: [componentType], includeDeleted };
    if (componentSubType) criteria.componentSubTypes = [componentSubType];
    return this.findByMultipleCriteria(criteria);
  }

  async findWithPagination(
    criteria: ConfigurationFilter,
    page: number,
    limit: number,
    sortBy = 'updatedTime',
    sortOrder: 'asc' | 'desc' = 'desc',
  ): Promise<PaginatedResult<UnifiedConfig>> {
    if (!this.db) throw new Error('Database not connected');
    const { whereClause, params } = this.buildWhereClause(criteria);

    const countResult = this.db.exec(
      `SELECT COUNT(*) as total FROM configurations ${whereClause}`,
      params,
    );
    const total = countResult.length > 0 ? (countResult[0].values[0][0] as number) : 0;
    const offset = (page - 1) * limit;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    const dataResult = this.db.exec(
      `SELECT * FROM configurations ${whereClause} ORDER BY ${sortBy} ${sortOrder.toUpperCase()} LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );

    const data =
      dataResult.length > 0
        ? dataResult[0].values.map((row: any) => this.deserialize(dataResult[0].columns, row))
        : [];

    return {
      data,
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    };
  }

  async bulkCreate(configs: UnifiedConfig[]): Promise<UnifiedConfig[]> {
    for (const c of configs) await this.create(c);
    return configs;
  }

  async bulkUpdate(updates: BulkUpdateRequest[]): Promise<BulkUpdateResult[]> {
    const results: BulkUpdateResult[] = [];
    for (const u of updates) {
      try {
        await this.update(u.configId, u.updates);
        results.push({ configId: u.configId, success: true });
      } catch (err) {
        results.push({
          configId: u.configId,
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }
    return results;
  }

  async bulkDelete(configIds: string[]): Promise<BulkUpdateResult[]> {
    const results: BulkUpdateResult[] = [];
    for (const id of configIds) {
      try {
        await this.delete(id);
        results.push({ configId: id, success: true });
      } catch (err) {
        results.push({
          configId: id,
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }
    return results;
  }

  async cleanup(dryRun = true): Promise<CleanupResult> {
    if (!this.db) throw new Error('Database not connected');
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const cutoffIso = cutoff.toISOString();

    const selectResult = this.db.exec(
      `SELECT * FROM configurations WHERE deletedAt IS NOT NULL AND deletedAt < ?`,
      [cutoffIso],
    );
    const configs =
      selectResult.length > 0
        ? selectResult[0].values.map((row: any) =>
            this.deserialize(selectResult[0].columns, row),
          )
        : [];

    if (!dryRun && configs.length > 0) {
      this.db.run(
        `DELETE FROM configurations WHERE deletedAt IS NOT NULL AND deletedAt < ?`,
        [cutoffIso],
      );
      this.saveToFile();
    }

    return { removedCount: configs.length, configs: dryRun ? configs : undefined, dryRun };
  }

  async healthCheck(): Promise<StorageHealthStatus> {
    const start = Date.now();
    try {
      if (!this.db) {
        return {
          isHealthy: false,
          connectionStatus: 'disconnected',
          lastChecked: new Date().toISOString(),
          responseTime: Date.now() - start,
          storageType: 'sqlite',
        };
      }
      this.db.exec('SELECT COUNT(*) FROM configurations');
      return {
        isHealthy: true,
        connectionStatus: 'connected',
        lastChecked: new Date().toISOString(),
        responseTime: Math.max(1, Date.now() - start),
        storageType: 'sqlite',
      };
    } catch (err) {
      return {
        isHealthy: false,
        connectionStatus: 'error',
        lastChecked: new Date().toISOString(),
        responseTime: Date.now() - start,
        errorMessage: err instanceof Error ? err.message : 'Unknown error',
        storageType: 'sqlite',
      };
    }
  }

  private buildWhereClause(criteria: ConfigurationFilter): { whereClause: string; params: any[] } {
    const conditions: string[] = [];
    const params: any[] = [];

    if (!criteria.includeDeleted) conditions.push('deletedAt IS NULL');

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
    if (criteria.componentTypes?.length) {
      conditions.push(`componentType IN (${criteria.componentTypes.map(() => '?').join(',')})`);
      params.push(...criteria.componentTypes);
    }
    if (criteria.componentSubTypes?.length) {
      conditions.push(`componentSubType IN (${criteria.componentSubTypes.map(() => '?').join(',')})`);
      params.push(...criteria.componentSubTypes);
    }
    if (criteria.displayTextContains) {
      conditions.push('displayText LIKE ?');
      params.push(`%${criteria.displayTextContains}%`);
    }
    if (criteria.isTemplate !== undefined) {
      conditions.push('isTemplate = ?');
      params.push(criteria.isTemplate ? 1 : 0);
    }
    if (criteria.createdAfter) {
      conditions.push('creationTime > ?');
      params.push(criteria.createdAfter);
    }
    if (criteria.createdBefore) {
      conditions.push('creationTime < ?');
      params.push(criteria.createdBefore);
    }
    if (criteria.updatedAfter) {
      conditions.push('updatedTime > ?');
      params.push(criteria.updatedAfter);
    }
    if (criteria.updatedBefore) {
      conditions.push('updatedTime < ?');
      params.push(criteria.updatedBefore);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    return { whereClause, params };
  }

  private deserialize(columns: string[], values: any[]): UnifiedConfig {
    const row: any = {};
    columns.forEach((col, idx) => {
      row[col] = values[idx];
    });
    return {
      configId: row.configId,
      appId: row.appId,
      userId: row.userId,
      componentType: row.componentType,
      componentSubType: row.componentSubType ?? '',
      isTemplate: Boolean(row.isTemplate),
      displayText: row.displayText,
      payload: row.payload ? JSON.parse(row.payload) : null,
      createdBy: row.createdBy,
      updatedBy: row.updatedBy,
      creationTime: row.creationTime,
      updatedTime: row.updatedTime,
    };
  }
}
