import { describe, expect, it } from 'vitest';
import type { SsrmDatasetConfig } from '../types.js';
import {
  openStompSession,
  type SsrmIngestEvents,
  type SsrmStompClient,
  type SsrmStompClientCfg,
  type SsrmStompMessage,
} from './stompIngest.js';

const config: SsrmDatasetConfig = {
  websocketUrl: 'ws://test:8081',
  listenerTopic: '/snapshot/positions/T1',
  requestMessage: '/snapshot/positions/T1/10/500',
  requestBody: '',
  requestHeaders: { 'snapshot-rows': '100' },
  snapshotEndToken: 'Success',
  keyColumn: 'positionId',
};

interface FakeBroker {
  client: FakeStompClient | null;
  factory: (cfg: SsrmStompClientCfg) => SsrmStompClient;
}

class FakeStompClient implements SsrmStompClient {
  onConnect: (() => void) | undefined;
  onStompError: ((frame: { headers: Record<string, string> }) => void) | undefined;
  onWebSocketError: ((event: unknown) => void) | undefined;
  onDisconnect: (() => void) | undefined;
  reconnectDelay = 0;
  activated = false;
  deactivated = false;
  published: Array<{ destination: string; body?: string; headers?: Record<string, string> }> = [];
  subscriptions: Array<{ destination: string; cb: (msg: SsrmStompMessage) => void; active: boolean }> = [];

  constructor(readonly cfg: SsrmStompClientCfg) {}

  subscribe(destination: string, cb: (msg: SsrmStompMessage) => void) {
    const sub = { destination, cb, active: true };
    this.subscriptions.push(sub);
    return { unsubscribe: () => { sub.active = false; } };
  }

  publish(params: { destination: string; body?: string; headers?: Record<string, string> }) {
    this.published.push(params);
  }

  activate() {
    this.activated = true;
  }

  deactivate() {
    this.deactivated = true;
  }

  /** Test helper — deliver a frame body on the (active) subscription. */
  deliver(body: string) {
    for (const sub of this.subscriptions) {
      if (sub.active) sub.cb({ body, headers: {} });
    }
  }
}

function fakeBroker(): FakeBroker {
  const broker: FakeBroker = {
    client: null,
    factory: (cfg) => {
      broker.client = new FakeStompClient(cfg);
      return broker.client;
    },
  };
  return broker;
}

type EventLogEntry =
  | { e: 'dialed'; gen: number }
  | { e: 'batch'; gen: number; n: number }
  | { e: 'end'; gen: number }
  | { e: 'live'; gen: number; n: number }
  | { e: 'error'; gen: number; detail: string };

function recordingEvents(): { events: SsrmIngestEvents; log: EventLogEntry[] } {
  const log: EventLogEntry[] = [];
  return {
    log,
    events: {
      onDialed: (gen) => log.push({ e: 'dialed', gen }),
      onSnapshotBatch: (gen, rows) => log.push({ e: 'batch', gen, n: rows.length }),
      onSnapshotEnd: (gen) => log.push({ e: 'end', gen }),
      onLiveBatch: (gen, rows) => log.push({ e: 'live', gen, n: rows.length }),
      onError: (gen, detail) => log.push({ e: 'error', gen, detail }),
    },
  };
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('openStompSession', () => {
  it('dials, subscribes, publishes the trigger with headers, and stamps the generation', async () => {
    const broker = fakeBroker();
    const { events, log } = recordingEvents();
    openStompSession(config, 3, events, { createClient: broker.factory });
    await flush();
    const client = broker.client!;
    expect(client.activated).toBe(true);
    expect(client.cfg.reconnectDelay).toBe(0); // no silent redial
    client.onConnect!();
    expect(client.subscriptions[0]!.destination).toBe(config.listenerTopic);
    expect(client.published).toEqual([
      {
        destination: config.requestMessage,
        body: '',
        headers: { 'snapshot-rows': '100' },
      },
    ]);
    expect(log).toEqual([{ e: 'dialed', gen: 3 }]);
  });

  it('routes snapshot batches, the end token, then live batches', async () => {
    const broker = fakeBroker();
    const { events, log } = recordingEvents();
    openStompSession(config, 1, events, { createClient: broker.factory });
    await flush();
    const client = broker.client!;
    client.onConnect!();
    client.deliver('[{"positionId":"a"},{"positionId":"b"}]');
    client.deliver('[{"positionId":"c"}]');
    client.deliver('Success: All 3 positions records delivered. Starting live updates...');
    client.deliver('[{"positionId":"a","pnl":5}]');
    expect(log).toEqual([
      { e: 'dialed', gen: 1 },
      { e: 'batch', gen: 1, n: 2 },
      { e: 'batch', gen: 1, n: 1 },
      { e: 'end', gen: 1 },
      { e: 'live', gen: 1, n: 1 },
    ]);
  });

  it('a duplicate end token does not re-fire onSnapshotEnd', async () => {
    const broker = fakeBroker();
    const { events, log } = recordingEvents();
    openStompSession(config, 1, events, { createClient: broker.factory });
    await flush();
    broker.client!.onConnect!();
    broker.client!.deliver('Success');
    broker.client!.deliver('Success');
    expect(log.filter((l) => l.e === 'end')).toHaveLength(1);
  });

  it('without an end token every batch is live (no phantom snapshot phase)', async () => {
    const broker = fakeBroker();
    const { events, log } = recordingEvents();
    openStompSession({ ...config, snapshotEndToken: undefined }, 1, events, {
      createClient: broker.factory,
    });
    await flush();
    broker.client!.onConnect!();
    broker.client!.deliver('[{"positionId":"a"}]');
    expect(log).toEqual([
      { e: 'dialed', gen: 1 },
      { e: 'live', gen: 1, n: 1 },
    ]);
  });

  it('maps socket/broker failures to onError with the generation', async () => {
    const broker = fakeBroker();
    const { events, log } = recordingEvents();
    openStompSession(config, 2, events, { createClient: broker.factory });
    await flush();
    broker.client!.onWebSocketError!({});
    expect(log).toEqual([{ e: 'error', gen: 2, detail: 'WebSocket connection failed' }]);
  });

  it('close() suppresses every later callback — the stale-session fence', async () => {
    const broker = fakeBroker();
    const { events, log } = recordingEvents();
    const session = openStompSession(config, 1, events, { createClient: broker.factory });
    await flush();
    const client = broker.client!;
    client.onConnect!();
    client.deliver('[{"positionId":"a"}]');
    const deliverAfterClose = client.subscriptions[0]!.cb;
    await session.close();
    expect(client.deactivated).toBe(true);
    // In-flight frame + error land after close (async seam) — both dropped.
    deliverAfterClose({ body: '[{"positionId":"zombie"}]', headers: {} });
    expect(log).toEqual([
      { e: 'dialed', gen: 1 },
      { e: 'batch', gen: 1, n: 1 },
    ]);
  });

  it('a connect completing after close() is dropped — no zombie dial', async () => {
    const broker = fakeBroker();
    const { events, log } = recordingEvents();
    const session = openStompSession(config, 1, events, { createClient: broker.factory });
    await flush();
    const client = broker.client!;
    const lateConnect = client.onConnect;
    await session.close();
    // The socket's connect callback lands after teardown (async seam):
    // close() nulled the client's handlers, but even a captured stale
    // reference must be suppressed by the closed flag.
    lateConnect?.();
    expect(client.subscriptions).toHaveLength(0);
    expect(log).toEqual([]);
  });
});
