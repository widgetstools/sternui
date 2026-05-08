import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import initSqlJs from 'sql.js';
import { SqliteStorage } from './SqliteStorage.js';

/**
 * Migration tests for the SQLite storage layer (Decision 6 in the
 * redesign). When the storage opens a database created before the
 * `isPublic` column existed, it must add the column with a default of
 * `1` (public) so existing rows continue to read identically.
 */
describe('SqliteStorage — isPublic column migration', () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `sqlite-migration-${Date.now()}-${Math.random()}.db`);
  });

  afterEach(() => {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  it('adds isPublic column to a pre-redesign database and backfills 1', async () => {
    // Build a database with the old schema (no isPublic column) and a
    // single row, then open it through SqliteStorage to trigger migration.
    const SQL = await initSqlJs();
    const oldDb = new SQL.Database();
    oldDb.run(`
      CREATE TABLE configurations (
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
    oldDb.run(
      `INSERT INTO configurations (
        configId, appId, userId, componentType, componentSubType, isTemplate,
        displayText, payload, createdBy, updatedBy, creationTime, updatedTime
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'pre-redesign',
        'app-A',
        'alice',
        'GRID',
        'CREDIT',
        0,
        'Pre-redesign row',
        '{}',
        'alice',
        'alice',
        '2026-01-01T00:00:00.000Z',
        '2026-01-01T00:00:00.000Z',
      ],
    );
    fs.writeFileSync(dbPath, Buffer.from(oldDb.export()));
    oldDb.close();

    // Open through SqliteStorage — migration should run silently.
    const storage = new SqliteStorage(dbPath);
    await storage.connect();

    const row = await storage.findById('pre-redesign');
    expect(row).not.toBeNull();
    expect(row?.isPublic).toBe(true);

    await storage.disconnect();
  });

  it('migration is idempotent — re-opening an upgraded DB is a no-op', async () => {
    // First open creates the schema with isPublic.
    let storage = new SqliteStorage(dbPath);
    await storage.connect();
    await storage.disconnect();

    // Second open should not fail or duplicate-add the column.
    storage = new SqliteStorage(dbPath);
    await storage.connect();
    expect(async () => await storage.findByAppId('app-A')).not.toThrow();
    await storage.disconnect();
  });
});
