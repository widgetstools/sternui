import type { Database as SqlJsDatabase } from 'sql.js';
import initSqlJs from 'sql.js';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { IHierarchyStorage } from './IHierarchyStorage.js';
import type { HierarchyNode } from '@stern/shared-types';

/**
 * SQLite implementation of hierarchy storage.
 * Uses a separate table for hierarchy nodes with path-based tree queries.
 */
export class SqliteHierarchyStorage implements IHierarchyStorage {
  private db: SqlJsDatabase | null = null;
  private dbPath: string;
  private SQL: any = null;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || process.env.SQLITE_DATABASE_PATH || './data/stern-configs.db';
  }

  /** Attach to an existing sql.js Database instance (shared with SqliteStorage) */
  attachDatabase(db: SqlJsDatabase): void {
    this.db = db;
    this.initializeSchema();
  }

  async connect(): Promise<void> {
    // If already attached via attachDatabase(), skip
    if (this.db) {
      return;
    }

    this.SQL = await initSqlJs();
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

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
      CREATE TABLE IF NOT EXISTS hierarchy_nodes (
        id TEXT PRIMARY KEY,
        nodeName TEXT NOT NULL,
        nodeType TEXT NOT NULL,
        parentId TEXT,
        path TEXT UNIQUE NOT NULL,
        level INTEGER NOT NULL DEFAULT 0,
        metadata TEXT,
        createdAt DATETIME NOT NULL,
        updatedAt DATETIME NOT NULL,
        FOREIGN KEY (parentId) REFERENCES hierarchy_nodes(id) ON DELETE SET NULL
      );
    `);

    this.db.run('CREATE INDEX IF NOT EXISTS idx_hierarchy_parent ON hierarchy_nodes(parentId)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_hierarchy_path ON hierarchy_nodes(path)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_hierarchy_type ON hierarchy_nodes(nodeType)');

    this.saveToFile();
  }

  async create(node: HierarchyNode): Promise<HierarchyNode> {
    if (!this.db) throw new Error('Database not connected');

    const now = new Date().toISOString();
    const newNode: HierarchyNode = {
      ...node,
      id: node.id || uuidv4(),
      createdAt: now,
      updatedAt: now
    };

    this.db.run(
      `INSERT INTO hierarchy_nodes (id, nodeName, nodeType, parentId, path, level, metadata, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newNode.id,
        newNode.nodeName,
        newNode.nodeType,
        newNode.parentId || null,
        newNode.path,
        newNode.level,
        newNode.metadata ? JSON.stringify(newNode.metadata) : null,
        newNode.createdAt!,
        newNode.updatedAt!
      ]
    );

    this.saveToFile();
    return newNode;
  }

  async findById(id: string): Promise<HierarchyNode | null> {
    if (!this.db) throw new Error('Database not connected');

    const result = this.db.exec('SELECT * FROM hierarchy_nodes WHERE id = ?', [id]);

    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }

    return this.deserializeNode(result[0].columns, result[0].values[0]);
  }

  async findByPath(path: string): Promise<HierarchyNode | null> {
    if (!this.db) throw new Error('Database not connected');

    const result = this.db.exec('SELECT * FROM hierarchy_nodes WHERE path = ?', [path]);

    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }

    return this.deserializeNode(result[0].columns, result[0].values[0]);
  }

  async findChildren(parentId: string): Promise<HierarchyNode[]> {
    if (!this.db) throw new Error('Database not connected');

    const result = this.db.exec(
      'SELECT * FROM hierarchy_nodes WHERE parentId = ? ORDER BY nodeName',
      [parentId]
    );

    if (result.length === 0) return [];
    return result[0].values.map((row: any) => this.deserializeNode(result[0].columns, row));
  }

  async getAncestors(nodeId: string): Promise<HierarchyNode[]> {
    if (!this.db) throw new Error('Database not connected');

    // Walk up the tree collecting ancestors
    const ancestors: HierarchyNode[] = [];
    let current = await this.findById(nodeId);

    while (current && current.parentId) {
      const parent = await this.findById(current.parentId);
      if (parent) {
        ancestors.push(parent);
        current = parent;
      } else {
        break;
      }
    }

    return ancestors; // Ordered from immediate parent to root
  }

  async getDescendants(nodeId: string): Promise<HierarchyNode[]> {
    if (!this.db) throw new Error('Database not connected');

    // Use path prefix matching for efficient descendant query
    const node = await this.findById(nodeId);
    if (!node) return [];

    const result = this.db.exec(
      `SELECT * FROM hierarchy_nodes WHERE path LIKE ? AND id != ? ORDER BY level, nodeName`,
      [`${node.path}/%`, nodeId]
    );

    if (result.length === 0) return [];
    return result[0].values.map((row: any) => this.deserializeNode(result[0].columns, row));
  }

  async update(id: string, updates: Partial<HierarchyNode>): Promise<HierarchyNode> {
    if (!this.db) throw new Error('Database not connected');

    const existing = await this.findById(id);
    if (!existing) {
      throw new Error(`Hierarchy node ${id} not found`);
    }

    const updated: HierarchyNode = {
      ...existing,
      ...updates,
      id: existing.id, // Prevent ID changes
      updatedAt: new Date().toISOString()
    };

    this.db.run(
      `UPDATE hierarchy_nodes SET
        nodeName = ?, nodeType = ?, parentId = ?, path = ?, level = ?,
        metadata = ?, updatedAt = ?
       WHERE id = ?`,
      [
        updated.nodeName,
        updated.nodeType,
        updated.parentId || null,
        updated.path,
        updated.level,
        updated.metadata ? JSON.stringify(updated.metadata) : null,
        updated.updatedAt!,
        id
      ]
    );

    this.saveToFile();
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    if (!this.db) throw new Error('Database not connected');

    // Check for children first
    const children = await this.findChildren(id);
    if (children.length > 0) {
      throw new Error(`Cannot delete node ${id}: has ${children.length} children. Delete children first.`);
    }

    this.db.run('DELETE FROM hierarchy_nodes WHERE id = ?', [id]);
    this.saveToFile();
    return true;
  }

  async getTree(): Promise<HierarchyNode[]> {
    if (!this.db) throw new Error('Database not connected');

    const result = this.db.exec('SELECT * FROM hierarchy_nodes ORDER BY level, path');

    if (result.length === 0) return [];
    return result[0].values.map((row: any) => this.deserializeNode(result[0].columns, row));
  }

  private deserializeNode(columns: string[], values: any[]): HierarchyNode {
    const row: any = {};
    columns.forEach((col, idx) => {
      row[col] = values[idx];
    });

    return {
      id: row.id,
      nodeName: row.nodeName,
      nodeType: row.nodeType,
      parentId: row.parentId || null,
      path: row.path,
      level: row.level,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  }
}
