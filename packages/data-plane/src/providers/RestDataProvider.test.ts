import { describe, it, expect, vi } from 'vitest';
import type { RestProviderConfig } from '@marketsui/shared-types';
import { RestDataProvider } from './RestDataProvider';

const baseConfig: RestProviderConfig = {
  providerType: 'rest',
  baseUrl: 'https://api.example.com',
  endpoint: '/positions',
  method: 'GET',
  keyColumn: 'id',
};

function mockFetch(body: unknown, opts: { ok?: boolean; status?: number } = {}) {
  return vi.fn(async () => ({
    ok: opts.ok ?? true,
    status: opts.status ?? 200,
    json: async () => body,
  } as Response));
}

describe('RestDataProvider — configure', () => {
  it('requires baseUrl, endpoint, and keyColumn', async () => {
    const p = new RestDataProvider('rp', { fetchImpl: mockFetch([]) });
    await expect(p.configure({ ...baseConfig, baseUrl: '' } as RestProviderConfig)).rejects.toThrow(/baseUrl/);
    await expect(p.configure({ ...baseConfig, endpoint: '' } as RestProviderConfig)).rejects.toThrow(/endpoint/);
    await expect(p.configure({ ...baseConfig, keyColumn: '' } as RestProviderConfig)).rejects.toThrow(/keyColumn/);
  });
});

describe('RestDataProvider — start (snapshot fetch)', () => {
  it('GETs the configured URL and ingests the response as a snapshot', async () => {
    const fetchImpl = mockFetch([{ id: 1, name: 'a' }, { id: 2, name: 'b' }]);
    const p = new RestDataProvider('rp', { fetchImpl });
    await p.configure(baseConfig);
    await p.start();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://api.example.com/positions');
    expect(p.isSnapshotComplete()).toBe(true);
    expect(p.getCache()).toHaveLength(2);
  });

  it('resolves rows via rowsPath when the JSON wraps the array', async () => {
    const body = { data: { results: [{ id: 1 }, { id: 2 }, { id: 3 }] } };
    const fetchImpl = mockFetch(body);
    const p = new RestDataProvider('rp', { fetchImpl });
    await p.configure({ ...baseConfig, rowsPath: 'data.results' });
    await p.start();
    expect(p.getCache()).toHaveLength(3);
  });

  it('appends queryParams to the URL', async () => {
    const fetchImpl = mockFetch([]);
    const p = new RestDataProvider('rp', { fetchImpl });
    await p.configure({ ...baseConfig, queryParams: { tenant: 'x', limit: '10' } });
    await p.start();
    expect(fetchImpl.mock.calls[0]?.[0]).toContain('tenant=x');
    expect(fetchImpl.mock.calls[0]?.[0]).toContain('limit=10');
  });

  it('forwards configured headers + auth', async () => {
    const fetchImpl = mockFetch([]);
    const p = new RestDataProvider('rp', { fetchImpl });
    await p.configure({
      ...baseConfig,
      headers: { 'X-Tenant': 'acme' },
      auth: { type: 'bearer', credentials: 'tok-1' },
    });
    await p.start();
    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers['X-Tenant']).toBe('acme');
    expect(headers['Authorization']).toBe('Bearer tok-1');
  });

  it('reports error and rejects on non-2xx', async () => {
    const fetchImpl = mockFetch({}, { ok: false, status: 500 });
    const p = new RestDataProvider('rp', { fetchImpl });
    await p.configure(baseConfig);
    await expect(p.start()).rejects.toThrow(/500/);
  });
});

describe('RestDataProvider — POST + restart overlay', () => {
  it('POST body merges the restart overlay (e.g. { asOfDate })', async () => {
    const fetchImpl = mockFetch([{ id: 1 }]);
    const p = new RestDataProvider('rp', { fetchImpl });
    await p.configure({
      ...baseConfig,
      method: 'POST',
      body: JSON.stringify({ baseFilter: 'positions' }),
    });

    await p.restart({ asOfDate: '2026-04-01' });

    // Two fetch calls: one initial start (kicked by restart→stop+configure+start),
    // actually restart() does stop → cache.clear → resetSnapshotState → configure
    // → start(). So fetchImpl is called once on this restart.
    const calls = fetchImpl.mock.calls;
    const lastInit = calls[calls.length - 1]?.[1] as RequestInit;
    expect(lastInit.method).toBe('POST');
    const sentBody = JSON.parse(lastInit.body as string) as Record<string, unknown>;
    expect(sentBody.baseFilter).toBe('positions');
    expect(sentBody.asOfDate).toBe('2026-04-01');
  });

  it('restart without overlay reverts to the configured body', async () => {
    const fetchImpl = mockFetch([]);
    const p = new RestDataProvider('rp', { fetchImpl });
    await p.configure({
      ...baseConfig,
      method: 'POST',
      body: JSON.stringify({ tenant: 'x' }),
    });

    await p.restart({ asOfDate: '2026-04-01' });
    await p.restart(); // no overlay
    const lastInit = fetchImpl.mock.calls[fetchImpl.mock.calls.length - 1]?.[1] as RequestInit;
    const sentBody = JSON.parse(lastInit.body as string) as Record<string, unknown>;
    expect(sentBody.tenant).toBe('x');
    expect(sentBody.asOfDate).toBeUndefined();
  });
});
