/**
 * Optimistic locking tests for `RestConfigClient` (Decision 12.5 /
 * Session 6). The client sends `If-Match: <expectedUpdatedTime>` on
 * conditional updates and surfaces 412 responses as `OptimisticLockError`
 * carrying the server's current row body.
 *
 * AppIdentity.getAccessToken plumbing is exercised here too — when the
 * caller supplies one, every outbound REST call carries `Authorization:
 * Bearer <token>`. The server doesn't yet verify it (Decision 16
 * deferred), but the editor UI never has to think about auth.
 */

import { describe, it, expect, vi } from 'vitest';
import { createConfigClient, ConfigClientHttpError } from './client';
import { OptimisticLockError } from './errors';
import type { AppConfigRow, AppIdentity } from './types';

const baseRow: AppConfigRow = {
  configId: 'cfg-1',
  appId: 'TestApp',
  userId: 'alice',
  isPublic: true,
  componentType: 'GRID',
  componentSubType: 'CREDIT',
  isTemplate: false,
  displayText: 'Test',
  payload: { v: 1 },
  createdBy: 'alice',
  updatedBy: 'alice',
  creationTime: '2026-05-01T00:00:00.000Z',
  updatedTime: '2026-05-01T00:00:00.000Z',
};

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('RestConfigClient — optimistic locking', () => {
  it('updateConfig without expectedUpdatedTime sends no If-Match header', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, baseRow)) as unknown as typeof fetch;

    const client = createConfigClient({
      baseUrl: 'http://test.example/api/v1',
      fetchImpl,
    });

    await client.updateConfig('cfg-1', { displayText: 'New' });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const init = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(init.headers['If-Match']).toBeUndefined();
    expect(init.method).toBe('PUT');
  });

  it('updateConfig with expectedUpdatedTime sends If-Match header', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, baseRow)) as unknown as typeof fetch;

    const client = createConfigClient({
      baseUrl: 'http://test.example/api/v1',
      fetchImpl,
    });

    await client.updateConfig(
      'cfg-1',
      { displayText: 'New' },
      { expectedUpdatedTime: '2026-05-01T00:00:00.000Z' },
    );

    const init = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(init.headers['If-Match']).toBe('2026-05-01T00:00:00.000Z');
  });

  it('updateConfig surfaces HTTP 412 as OptimisticLockError with currentRow', async () => {
    const currentRow: AppConfigRow = {
      ...baseRow,
      displayText: 'Updated by someone else',
      updatedBy: 'bob',
      updatedTime: '2026-05-02T12:00:00.000Z',
    };
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify(currentRow), {
        status: 412,
        headers: { 'Content-Type': 'application/json', ETag: currentRow.updatedTime },
      }),
    ) as unknown as typeof fetch;

    const client = createConfigClient({
      baseUrl: 'http://test.example/api/v1',
      fetchImpl,
    });

    await expect(
      client.updateConfig(
        'cfg-1',
        { displayText: 'Stale write' },
        { expectedUpdatedTime: '2026-05-01T00:00:00.000Z' },
      ),
    ).rejects.toBeInstanceOf(OptimisticLockError);

    try {
      await client.updateConfig(
        'cfg-1',
        { displayText: 'Stale write' },
        { expectedUpdatedTime: '2026-05-01T00:00:00.000Z' },
      );
    } catch (err) {
      expect(err).toBeInstanceOf(OptimisticLockError);
      const lockErr = err as OptimisticLockError;
      expect(lockErr.currentRow?.configId).toBe('cfg-1');
      expect(lockErr.currentRow?.updatedBy).toBe('bob');
      expect(lockErr.currentRow?.updatedTime).toBe('2026-05-02T12:00:00.000Z');
    }
  });

  it('non-412 errors still surface as ConfigClientHttpError', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(500, { error: 'oops' })) as unknown as typeof fetch;

    const client = createConfigClient({
      baseUrl: 'http://test.example/api/v1',
      fetchImpl,
    });

    await expect(client.updateConfig('cfg-1', { displayText: 'x' })).rejects.toBeInstanceOf(
      ConfigClientHttpError,
    );
  });

  it('attaches Authorization: Bearer when identity.getAccessToken is present', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, baseRow)) as unknown as typeof fetch;
    const getAccessToken = vi.fn(async () => 'tok-abc');
    const identity: AppIdentity = { userId: 'alice', getAccessToken };

    const client = createConfigClient({
      baseUrl: 'http://test.example/api/v1',
      fetchImpl,
      identity,
    });

    await client.updateConfig('cfg-1', { displayText: 'New' });

    expect(getAccessToken).toHaveBeenCalledTimes(1);
    const init = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(init.headers['Authorization']).toBe('Bearer tok-abc');
  });

  it('omits Authorization header when identity.getAccessToken is absent', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, baseRow)) as unknown as typeof fetch;

    const client = createConfigClient({
      baseUrl: 'http://test.example/api/v1',
      fetchImpl,
      identity: { userId: 'alice' },
    });

    await client.updateConfig('cfg-1', { displayText: 'New' });

    const init = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(init.headers['Authorization']).toBeUndefined();
  });
});
