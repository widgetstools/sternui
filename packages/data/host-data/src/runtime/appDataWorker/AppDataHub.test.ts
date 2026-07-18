/**
 * AppDataHub + AppDataClient in-process tests (ADR Phase 3).
 */

import { describe, expect, it, beforeEach } from 'vitest';
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
});
