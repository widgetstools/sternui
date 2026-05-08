import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { SqliteStorage } from '../storage/SqliteStorage.js';
import { ConfigurationService } from '../services/ConfigurationService.js';
import { createConfigurationRoutes } from './configurations.js';
import type { AppConfigRow } from '@starui/shared-types';

/**
 * Optimistic locking route tests (Decision 12.5 / Session 6).
 *
 *   PUT /:id with no If-Match  → 200 (last-write-wins, today's behavior)
 *   PUT /:id with matching If-Match → 200 + ETag header
 *   PUT /:id with stale If-Match  → 412 + current row in body + ETag
 */
describe('PUT /configurations/:configId — optimistic locking', () => {
  let app: express.Express;
  let storage: SqliteStorage;
  let dbPath: string;

  const seedRow: AppConfigRow = {
    configId: 'cfg-lock',
    appId: 'TestApp',
    userId: 'alice',
    isPublic: true,
    componentType: 'GRID',
    componentSubType: 'CREDIT',
    isTemplate: false,
    displayText: 'Original',
    payload: { v: 1 },
    createdBy: 'alice',
    updatedBy: 'alice',
    creationTime: '2026-05-01T00:00:00.000Z',
    updatedTime: '2026-05-01T00:00:00.000Z',
  };

  beforeEach(async () => {
    dbPath = path.join(os.tmpdir(), `sqlite-lock-${Date.now()}-${Math.random()}.db`);
    storage = new SqliteStorage(dbPath);
    await storage.connect();
    await storage.create(seedRow);

    const service = new ConfigurationService(storage);
    app = express();
    app.use(express.json());
    app.use('/api/v1/configurations', createConfigurationRoutes(service));
  });

  afterEach(async () => {
    await storage.disconnect();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  it('PUT without If-Match writes through (last-write-wins) and exposes ETag', async () => {
    const res = await request(app)
      .put('/api/v1/configurations/cfg-lock')
      .send({ displayText: 'No header write' });

    expect(res.status).toBe(200);
    expect(res.body.displayText).toBe('No header write');
    expect(res.headers.etag).toBe(res.body.updatedTime);
    expect(res.body.updatedTime).not.toBe(seedRow.updatedTime);
  });

  it('PUT with matching If-Match writes through and exposes ETag', async () => {
    const res = await request(app)
      .put('/api/v1/configurations/cfg-lock')
      .set('If-Match', seedRow.updatedTime)
      .send({ displayText: 'Match write' });

    expect(res.status).toBe(200);
    expect(res.body.displayText).toBe('Match write');
    expect(res.headers.etag).toBe(res.body.updatedTime);
  });

  it('PUT with stale If-Match returns 412 + current row + ETag', async () => {
    // First, advance the row past `seedRow.updatedTime`.
    const first = await request(app)
      .put('/api/v1/configurations/cfg-lock')
      .send({ displayText: 'Bumped by another writer' });
    expect(first.status).toBe(200);
    const newUpdatedTime = first.body.updatedTime;
    expect(newUpdatedTime).not.toBe(seedRow.updatedTime);

    // Second writer pins the original updatedTime — should be rejected.
    const stale = await request(app)
      .put('/api/v1/configurations/cfg-lock')
      .set('If-Match', seedRow.updatedTime)
      .send({ displayText: 'Stale write' });

    expect(stale.status).toBe(412);
    expect(stale.body.configId).toBe('cfg-lock');
    expect(stale.body.displayText).toBe('Bumped by another writer');
    expect(stale.body.updatedTime).toBe(newUpdatedTime);
    expect(stale.headers.etag).toBe(newUpdatedTime);
  });

  it('PUT against a missing configId returns 404 even with If-Match', async () => {
    const res = await request(app)
      .put('/api/v1/configurations/does-not-exist')
      .set('If-Match', seedRow.updatedTime)
      .send({ displayText: 'x' });

    expect(res.status).toBe(404);
  });
});
