import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { SqliteStorage } from './SqliteStorage.js';
import type { AppConfigRow } from '@starui/shared-types';

/**
 * Visibility filter tests for the SQLite storage layer (Decision 6 in
 * the redesign). When the caller supplies `effectiveUserId`, list
 * methods must return only rows that satisfy
 * `(isPublic = 1 OR userId = effectiveUserId)`. When omitted, no
 * visibility filter applies — the unfiltered admin path.
 */
describe('SqliteStorage — visibility filter', () => {
  let storage: SqliteStorage;
  let dbPath: string;

  const baseRow: Omit<AppConfigRow, 'configId' | 'userId' | 'isPublic' | 'displayText'> = {
    appId: 'app-A',
    componentType: 'GRID',
    componentSubType: 'CREDIT',
    isTemplate: false,
    payload: { foo: 'bar' },
    createdBy: 'system',
    updatedBy: 'system',
    creationTime: '2026-01-01T00:00:00.000Z',
    updatedTime: '2026-01-01T00:00:00.000Z',
  };

  const makeRow = (
    configId: string,
    userId: string,
    isPublic: boolean,
    displayText: string,
    overrides: Partial<AppConfigRow> = {},
  ): AppConfigRow => ({
    ...baseRow,
    configId,
    userId,
    isPublic,
    displayText,
    ...overrides,
  });

  beforeEach(async () => {
    dbPath = path.join(os.tmpdir(), `sqlite-visibility-${Date.now()}-${Math.random()}.db`);
    storage = new SqliteStorage(dbPath);
    await storage.connect();
  });

  afterEach(async () => {
    await storage.disconnect();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  it('persists isPublic and round-trips it through findById', async () => {
    await storage.create(makeRow('c-pub', 'alice', true, 'Public row'));
    await storage.create(makeRow('c-priv', 'alice', false, 'Private row'));

    const pub = await storage.findById('c-pub');
    const priv = await storage.findById('c-priv');

    expect(pub?.isPublic).toBe(true);
    expect(priv?.isPublic).toBe(false);
  });

  it('findByAppId without effectiveUserId returns every row (admin path)', async () => {
    await storage.create(makeRow('c1', 'alice', true, 'A1'));
    await storage.create(makeRow('c2', 'alice', false, 'A2'));
    await storage.create(makeRow('c3', 'bob', false, 'B1'));

    const rows = await storage.findByAppId('app-A');
    const ids = rows.map((r) => r.configId).sort();
    expect(ids).toEqual(['c1', 'c2', 'c3']);
  });

  it('findByAppId with effectiveUserId filters out other users\' private rows', async () => {
    await storage.create(makeRow('c1', 'alice', true, 'A1'));
    await storage.create(makeRow('c2', 'alice', false, 'A2'));
    await storage.create(makeRow('c3', 'bob', false, 'B1'));
    await storage.create(makeRow('c4', 'bob', true, 'B2'));

    const aliceView = await storage.findByAppId('app-A', false, 'alice');
    expect(aliceView.map((r) => r.configId).sort()).toEqual(['c1', 'c2', 'c4']);

    const bobView = await storage.findByAppId('app-A', false, 'bob');
    expect(bobView.map((r) => r.configId).sort()).toEqual(['c1', 'c3', 'c4']);

    const anonView = await storage.findByAppId('app-A', false, 'anonymous');
    expect(anonView.map((r) => r.configId).sort()).toEqual(['c1', 'c4']);
  });

  it('findByMultipleCriteria honors effectiveUserId in the filter', async () => {
    await storage.create(makeRow('c1', 'alice', true, 'A1'));
    await storage.create(makeRow('c2', 'alice', false, 'A2'));
    await storage.create(makeRow('c3', 'bob', false, 'B1'));

    const aliceRows = await storage.findByMultipleCriteria({
      appIds: ['app-A'],
      effectiveUserId: 'alice',
    });
    expect(aliceRows.map((r) => r.configId).sort()).toEqual(['c1', 'c2']);

    const bobRows = await storage.findByMultipleCriteria({
      appIds: ['app-A'],
      effectiveUserId: 'bob',
    });
    expect(bobRows.map((r) => r.configId).sort()).toEqual(['c1', 'c3']);
  });

  it('rows missing isPublic (legacy) are normalized to public on read', async () => {
    // Simulate a legacy row by inserting directly through the underlying
    // sql.js handle, bypassing the typed `create()` path.
    const internal = storage as unknown as { db: any };
    // The schema migration adds isPublic with DEFAULT 1; an explicit row
    // omitting the column should still round-trip with isPublic = true.
    internal.db.run(
      `INSERT INTO configurations (
        configId, appId, userId, componentType, componentSubType, isTemplate,
        displayText, payload, createdBy, updatedBy, creationTime, updatedTime
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'legacy-1',
        'app-A',
        'alice',
        'GRID',
        'CREDIT',
        0,
        'Legacy row',
        '{}',
        'alice',
        'alice',
        '2026-01-01T00:00:00.000Z',
        '2026-01-01T00:00:00.000Z',
      ],
    );

    const row = await storage.findById('legacy-1');
    expect(row?.isPublic).toBe(true);

    const bobView = await storage.findByAppId('app-A', false, 'bob');
    expect(bobView.find((r) => r.configId === 'legacy-1')).toBeDefined();
  });

  it('cross-app rows are excluded by appId regardless of visibility', async () => {
    await storage.create(makeRow('c-A', 'alice', true, 'A row'));
    await storage.create(makeRow('c-B', 'alice', true, 'B row', { appId: 'app-B' }));

    const rows = await storage.findByAppId('app-A', false, 'alice');
    expect(rows.map((r) => r.configId)).toEqual(['c-A']);
  });
});
