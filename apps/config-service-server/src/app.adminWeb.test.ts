import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import request from 'supertest';
import { createApp } from './app.js';

/**
 * Session 15 acceptance — once the SPA bundle has been copied into
 * `dist/admin-web/`, the server serves `index.html` for any non-API
 * route (so client-side router URLs deep-link), serves the static
 * assets directly, and leaves the API + /health untouched.
 *
 * The test fakes a minimal SPA bundle directly under the same
 * `dist/admin-web/` path the production build produces (via
 * `scripts/copy-admin-web.mjs`). That keeps the test independent of
 * whether the SPA workspace has actually been built — the server's
 * mount logic is what we're verifying.
 *
 * Each test gets its own tmpdir for the SQLite db so they don't
 * collide with the dev `data/stern-configs.db` file.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Mirror app.ts's resolution exactly. In production __dirname is `dist/`
// so this is `dist/admin-web`; in this test the harness loads the TS
// source so __dirname is `src/` and the fake bundle goes to
// `src/admin-web/`. Either way the path matches what app.ts probes.
const ADMIN_WEB_DIR = path.resolve(__dirname, 'admin-web');
const ADMIN_WEB_INDEX = path.join(ADMIN_WEB_DIR, 'index.html');
const ADMIN_WEB_ASSET = path.join(ADMIN_WEB_DIR, 'assets', 'main.js');

const FAKE_INDEX_BODY = '<!doctype html><html><body data-test="admin-spa"></body></html>';
const FAKE_ASSET_BODY = "console.log('admin-spa-asset');";

let preExisting = false;
let originalIndex: string | null = null;
let originalAsset: string | null = null;

function ensureFakeBundle() {
  preExisting = fs.existsSync(ADMIN_WEB_INDEX);
  if (preExisting) {
    originalIndex = fs.readFileSync(ADMIN_WEB_INDEX, 'utf-8');
    if (fs.existsSync(ADMIN_WEB_ASSET)) {
      originalAsset = fs.readFileSync(ADMIN_WEB_ASSET, 'utf-8');
    }
  }
  fs.mkdirSync(path.dirname(ADMIN_WEB_ASSET), { recursive: true });
  fs.writeFileSync(ADMIN_WEB_INDEX, FAKE_INDEX_BODY);
  fs.writeFileSync(ADMIN_WEB_ASSET, FAKE_ASSET_BODY);
}

function restoreBundle() {
  if (preExisting) {
    if (originalIndex !== null) fs.writeFileSync(ADMIN_WEB_INDEX, originalIndex);
    if (originalAsset !== null) fs.writeFileSync(ADMIN_WEB_ASSET, originalAsset);
    return;
  }
  // Bundle was synthesized by this test — clean up.
  try {
    fs.rmSync(ADMIN_WEB_DIR, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
}

describe('Admin SPA mount (Session 15)', () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  const dbPath = path.join(
    os.tmpdir(),
    `admin-web-smoke-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
  );

  beforeAll(() => {
    ensureFakeBundle();
  });

  afterAll(() => {
    restoreBundle();
  });

  beforeEach(async () => {
    process.env.SQLITE_DATABASE_PATH = dbPath;
    app = await createApp();
  });

  afterEach(() => {
    delete process.env.SQLITE_DATABASE_PATH;
    try {
      fs.unlinkSync(dbPath);
    } catch {
      /* ignore */
    }
  });

  it('serves the SPA index.html at /', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('data-test="admin-spa"');
  });

  it('serves the SPA index.html for unknown deep-link routes', async () => {
    const res = await request(app).get('/permissions');
    expect(res.status).toBe(200);
    expect(res.text).toContain('data-test="admin-spa"');
  });

  it('serves static assets directly without falling back to index', async () => {
    const res = await request(app).get('/assets/main.js');
    expect(res.status).toBe(200);
    expect(res.text).toContain('admin-spa-asset');
  });

  it('still returns JSON 404 for unknown /api routes', async () => {
    const res = await request(app).get('/api/v1/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: 'Not Found' });
  });

  it('still serves /health as JSON', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok' });
  });

});
