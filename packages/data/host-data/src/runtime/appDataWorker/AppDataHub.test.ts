/**
 * AppDataHub + AppDataClient in-process tests (ADR Phase 3).
 */

import { describe, expect, it, beforeEach, vi } from 'vitest';
import { AppDataHub } from './AppDataHub.js';
import { AppDataClient } from './AppDataClient.js';
import type { AppDataRow } from '../protocol.js';

function row(partial: Partial<AppDataRow> & Pick<AppDataRow, 'configId' | 'name'>): AppDataRow {
  return {
    description: '',
    isPublic: false,
    values: {},
    userId: 'alice',
    ...partial,
  };
}

describe('AppDataHub', () => {
  it('serves snapshot on attach and lookup RPC', async () => {
    const hub = new AppDataHub();
    hub.getService().hydrateFromSeed([
      row({ configId: 'c1', name: 'positions', values: { asOfDate: '2026-07-18' } }),
    ]);

    const messages: unknown[] = [];
    const port = { postMessage: (m: unknown) => { messages.push(m); } };

    await hub.handleRequest(port, { kind: 'appdata-attach', subId: 's1' });
    expect(messages[0]).toMatchObject({
      kind: 'appdata-snapshot',
      subId: 's1',
      rows: [expect.objectContaining({ name: 'positions' })],
    });

    messages.length = 0;
    await hub.handleRequest(port, {
      kind: 'appdata-lookup',
      reqId: 'l1',
      name: 'positions',
      key: 'asOfDate',
    });
    expect(messages[0]).toEqual({
      kind: 'appdata-lookup-ok',
      reqId: 'l1',
      ok: true,
      value: '2026-07-18',
    });
  });

  it('broadcasts delta on upsert and acks', async () => {
    const hub = new AppDataHub();
    const messages: unknown[] = [];
    const port = { postMessage: (m: unknown) => { messages.push(m); } };

    await hub.handleRequest(port, { kind: 'appdata-attach', subId: 's1' });
    messages.length = 0;

    const next = row({
      configId: 'c2',
      name: 'fx',
      values: { base: 'USD' },
    });
    await hub.handleRequest(port, {
      kind: 'appdata-upsert',
      reqId: 'u1',
      row: next,
    });

    expect(messages.some((m) => (m as { kind: string }).kind === 'appdata-delta')).toBe(true);
    expect(messages.some((m) => (m as { kind: string }).kind === 'appdata-ack')).toBe(true);
    expect(hub.lookup('fx', 'base')).toBe('USD');
  });
});

describe('AppDataClient over MessageChannel', () => {
  beforeEach(() => {
    /* no-op — keep symmetric with ConfigClient tests */
  });

  it('round-trips ready + mirror attach + lookup', async () => {
    const hub = new AppDataHub();
    hub.getService().hydrateFromSeed([
      row({ configId: 'c1', name: 'positions', values: { asOfDate: '2026-01-01' } }),
    ]);

    const { port1, port2 } = new MessageChannel();
    const hubPort = {
      postMessage: (m: unknown) => port2.postMessage(m),
    };
    port2.onmessage = (ev) => {
      void hub.handleRequest(hubPort, ev.data);
    };
    port2.start();

    const client = new AppDataClient(port1);
    await client.ready;

    const mirror = client.attachAppData({ userId: 'alice', subId: 'm1' });
    await mirror.attach();
    await mirror.ready();
    expect(mirror.get('positions', 'asOfDate')).toBe('2026-01-01');

    await mirror.set('positions', 'asOfDate', '2026-07-18');
    expect(mirror.get('positions', 'asOfDate')).toBe('2026-07-18');

    const viaRpc = await client.lookup('positions', 'asOfDate');
    expect(viaRpc).toBe('2026-07-18');

    client.close();
    port2.close();
  });

  it('rejects rather than hanging when the worker never replies', async () => {
    vi.useFakeTimers();
    try {
      // No hub behind the port — the shape of a worker asset that 404s or
      // is CSP-blocked. Without a timeout this hangs bootstrap forever
      // instead of falling back to in-process AppData on the data hub.
      const { port1, port2 } = new MessageChannel();
      const client = new AppDataClient(port1, { timeoutMs: 1000 });
      const settled = client.ready.then(
        () => 'resolved',
        (err: Error) => err.message,
      );
      await vi.advanceTimersByTimeAsync(1001);
      expect(await settled).toMatch(
        /did not reply to 'appdata-worker-ready' within 1000ms/,
      );
      client.close();
      port2.close();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('AppDataHub port liveness', () => {
  it('evicts stale ports and their mirror subscriptions', async () => {
    let now = 1_000_000;
    const hub = new AppDataHub({ portTimeoutMs: 60_000, now: () => now });
    hub.getService().hydrateFromSeed([
      row({ configId: 'c1', name: 'positions', values: { asOfDate: '2026-07-18' } }),
    ]);

    const livePort = { postMessage: vi.fn() };
    const deadPort = { postMessage: vi.fn() };
    await hub.handleRequest(livePort, { kind: 'appdata-attach', subId: 's-live', userId: 'alice' });
    await hub.handleRequest(deadPort, { kind: 'appdata-attach', subId: 's-dead', userId: 'bob' });
    expect(hub.portCount()).toBe(2);
    expect(hub.listenerCount()).toBe(2);

    // `deadPort`'s window closed mid-session: no detach, no throw on post.
    now += 90_000;
    await hub.handleRequest(livePort, { kind: 'appdata-ping' });

    expect(hub.sweepStalePorts()).toBe(1);
    expect(hub.portCount()).toBe(1);
    expect(hub.listenerCount()).toBe(1);

    livePort.postMessage.mockClear();
    deadPort.postMessage.mockClear();
    await hub.handleRequest(livePort, {
      kind: 'appdata-set',
      subId: 's-live',
      name: 'positions',
      key: 'asOfDate',
      value: '2026-07-19',
    });

    // The evicted window no longer receives delta fan-out.
    expect(deadPort.postMessage).not.toHaveBeenCalled();
    expect(livePort.postMessage).toHaveBeenCalled();
  });

  it('answers appdata-ping without replying', async () => {
    const hub = new AppDataHub();
    const port = { postMessage: vi.fn() };
    await hub.handleRequest(port, { kind: 'appdata-ping' });
    expect(port.postMessage).not.toHaveBeenCalled();
    expect(hub.portCount()).toBe(1);
  });
});
