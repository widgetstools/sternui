import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AppDataProviderConfig, MockProviderConfig } from '@marketsui/shared-types';
import { DataPlaneClient, DataPlaneClientError } from './DataPlaneClient';
import { connectInPage } from './connect';
import { Router } from '../worker/router';
import { StreamProviderBase } from '../providers/StreamProviderBase';
import type { ProviderFactory, ProviderInstance } from '../worker/providerFactory';
import type { ProviderType } from '@marketsui/shared-types';

/**
 * These tests exercise the full client ↔ router round-trip via
 * `connectInPage` — no SharedWorker involved, but the wire format
 * crossing MessageChannel ports is identical to what a real worker
 * would see. If a test passes in-page, it passes in a SharedWorker
 * too (the only difference is where the router runs).
 */

const flush = () => new Promise((r) => setTimeout(r, 0));

class TestStream extends StreamProviderBase<{ keyColumn: string }, Record<string, unknown>> {
  readonly type: ProviderType = 'stomp';
  async configure(_c: { keyColumn: string }): Promise<void> {}
  async start(): Promise<void> { this.reportConnected(); }
  async stop(): Promise<void> { this.reportDisconnected(); }
  emitSnapshot(rows: Record<string, unknown>[]) { this.ingestSnapshotBatch(rows); }
  emitComplete() { this.markSnapshotComplete(); }
  emitUpdate(rows: Record<string, unknown>[]) { this.ingestUpdate(rows); }
}

describe('DataPlaneClient — keyed-resource round-trip', () => {
  it('configure → put → get works end-to-end', async () => {
    const router = new Router();
    const { client, close } = connectInPage(router);
    try {
      const cfg: AppDataProviderConfig = { providerType: 'appdata', variables: {} };
      await client.configure('app', cfg);
      await client.put('app', 'token', 'abc123');
      const value = await client.get<string>('app', 'token');
      expect(value).toBe('abc123');
    } finally {
      close();
    }
  });

  it('get on an unconfigured provider throws a typed error', async () => {
    const router = new Router();
    const { client, close } = connectInPage(router);
    try {
      await expect(client.get('missing', 'k')).rejects.toSatisfy(
        (err) =>
          err instanceof DataPlaneClientError &&
          err.code === 'PROVIDER_NOT_CONFIGURED' &&
          err.retryable === false,
      );
    } finally {
      close();
    }
  });

  it('subscribe fires on a put from the same provider', async () => {
    const router = new Router();
    const { client, close } = connectInPage(router);
    try {
      const cfg: AppDataProviderConfig = { providerType: 'appdata', variables: {} };
      await client.configure('app', cfg);

      const events: Array<{ key: string; value: unknown; seq: number }> = [];
      const unsub = await client.subscribe<string>('app', 'user', (ev) => {
        events.push({ key: ev.key, value: ev.value, seq: ev.seq });
      });

      await client.put('app', 'user', 'alice');
      await flush();
      await client.put('app', 'user', 'bob');
      await flush();

      expect(events.map((e) => e.value)).toEqual(['alice', 'bob']);
      expect(events[0].seq).toBeGreaterThan(0);
      expect(events[1].seq).toBeGreaterThan(events[0].seq);

      unsub();
      await client.put('app', 'user', 'charlie');
      await flush();
      // After unsubscribe, no further events.
      expect(events).toHaveLength(2);
    } finally {
      close();
    }
  });

  it('ping returns pong', async () => {
    const router = new Router();
    const { client, close } = connectInPage(router);
    try {
      await expect(client.ping()).resolves.toBeUndefined();
    } finally {
      close();
    }
  });

  it('teardown removes the provider; subsequent get rejects', async () => {
    const router = new Router();
    const { client, close } = connectInPage(router);
    try {
      const cfg: MockProviderConfig = { providerType: 'mock', dataType: 'positions', rowCount: 3 };
      await client.configure('mk', cfg);
      await client.teardown('mk');
      await expect(client.get('mk', 'x')).rejects.toSatisfy(
        (err) => err instanceof DataPlaneClientError && err.code === 'PROVIDER_NOT_CONFIGURED',
      );
    } finally {
      close();
    }
  });
});

describe('DataPlaneClient — row-stream round-trip', () => {
  function wireRouter() {
    const provider = new TestStream('prov', { keyColumn: 'id' });
    const factory: ProviderFactory = async () => ({ shape: 'stream', provider }) as ProviderInstance;
    const router = new Router({ providerFactory: factory });
    return { provider, router };
  }

  it('subscribeStream delivers snapshot / complete / row-update in order', async () => {
    const { router, provider } = wireRouter();
    const { client, close } = connectInPage(router);
    try {
      await client.configure('p', { providerType: 'stomp' } as never);

      const batches: unknown[][] = [];
      const completes: number[] = [];
      const updates: unknown[][] = [];
      const unsub = await client.subscribeStream<Record<string, unknown>>('p', {
        onSnapshotBatch: (b) => batches.push([...b.rows]),
        onSnapshotComplete: (c) => completes.push(c.rowCount),
        onRowUpdate: (u) => updates.push([...u.rows]),
      });

      provider.emitSnapshot([{ id: 1, v: 'a' }]);
      provider.emitSnapshot([{ id: 2, v: 'b' }]);
      provider.emitComplete();
      provider.emitUpdate([{ id: 1, v: 'aprime' }]);
      await flush();

      expect(batches).toEqual([
        [{ id: 1, v: 'a' }],
        [{ id: 2, v: 'b' }],
      ]);
      expect(completes).toEqual([2]); // rowCount at the moment of complete
      expect(updates).toEqual([[{ id: 1, v: 'aprime' }]]);

      unsub();
    } finally {
      close();
    }
  });

  it('getCachedRows resolves with the cached set for a late joiner', async () => {
    const { router, provider } = wireRouter();

    // Early subscriber drives the snapshot to complete on the router side.
    // Keep the early subscription alive — if we unsubscribe, the stream
    // provider auto-tears-down (correct behaviour for network-backed
    // providers; the cached rows go with it).
    const early = connectInPage(router);
    await early.client.configure('p', { providerType: 'stomp' } as never);
    const unsubEarly = await early.client.subscribeStream('p', {});
    provider.emitSnapshot([{ id: 1, v: 'a' }, { id: 2, v: 'b' }]);
    provider.emitComplete();
    await flush();

    // Late joiner on a different port — provider already completed,
    // still alive because `early` is still subscribed.
    const late = connectInPage(router);
    try {
      const rows = await late.client.getCachedRows<{ id: number }>('p');
      expect(rows).toHaveLength(2);
      expect(rows.map((r) => r.id).sort()).toEqual([1, 2]);
    } finally {
      unsubEarly();
      late.close();
      early.close();
    }
  });

  it('getCachedRows for an early-joiner port returns empty (no duplicate delivery)', async () => {
    const { router, provider } = wireRouter();
    const { client, close } = connectInPage(router);
    try {
      await client.configure('p', { providerType: 'stomp' } as never);
      const unsub = await client.subscribeStream('p', {});
      provider.emitSnapshot([{ id: 1 }, { id: 2 }]);
      provider.emitComplete();
      await flush();

      const rows = await client.getCachedRows('p');
      expect(rows).toEqual([]);
      unsub();
    } finally {
      close();
    }
  });
});

describe('DataPlaneClient — lifecycle', () => {
  it('close() rejects pending requests with TRANSPORT_CLOSED', async () => {
    const router = new Router();
    // Intentionally don't let the configure land — close between request
    // and response. We rig a router that never replies.
    const silentFactory: ProviderFactory = () => new Promise(() => { /* never */ });
    const stuck = new Router({ providerFactory: silentFactory });
    const { client, close } = connectInPage(stuck);

    const p = client.configure('p', { providerType: 'appdata', variables: {} });
    // Race close() against the stuck request.
    client.close();
    close();
    await expect(p).rejects.toSatisfy(
      (err) => err instanceof DataPlaneClientError && err.code === 'TRANSPORT_CLOSED',
    );
    // Silence unused-var warning on `router`.
    void router;
  });
});
