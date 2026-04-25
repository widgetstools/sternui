import { describe, it, expect, vi } from 'vitest';
import type { StompProviderConfig } from '@marketsui/shared-types';
import {
  StompStreamProvider,
  type StompClientLike,
  type StompClientFactory,
} from './StompStreamProvider';

/**
 * A fake STOMP client — we drive the protocol lifecycle directly
 * (fake.connect() fires onConnect, fake.deliver(body) invokes the
 * subscriber's callback, etc.) without any real WebSocket. This is
 * the pattern stern-1 uses in its own tests and keeps the unit tests
 * offline.
 */
interface FakeClient extends StompClientLike {
  _publish: ReturnType<typeof vi.fn>;
  _activated: boolean;
  _subscribedDestinations: string[];
  /** Call to simulate `onConnect` firing. */
  connect(): void;
  /** Call to deliver a body to the topic subscriber. */
  deliver(body: string): void;
  /** Simulate a transport-level error. */
  stompError(message: string): void;
  websocketError(event?: unknown): void;
  /** Simulate broker-sent disconnect. */
  disconnect(): void;
}

function mkFake(): { client: FakeClient; factory: StompClientFactory } {
  let subscriber: ((msg: { body: string; headers: Record<string, string> }) => void) | null = null;
  const client: FakeClient = {
    connected: false,
    onConnect: undefined,
    onStompError: undefined,
    onWebSocketError: undefined,
    onDisconnect: undefined,
    _publish: vi.fn(),
    _activated: false,
    _subscribedDestinations: [],
    subscribe(destination, cb) {
      this._subscribedDestinations.push(destination);
      subscriber = cb;
      return {
        unsubscribe: () => {
          subscriber = null;
        },
      };
    },
    publish({ destination, body }) {
      this._publish({ destination, body });
    },
    activate() {
      this._activated = true;
    },
    deactivate() {
      this.connected = false;
    },
    connect() {
      this.connected = true;
      this.onConnect?.();
    },
    deliver(body) {
      subscriber?.({ body, headers: {} });
    },
    stompError(message) {
      this.onStompError?.({ headers: { message } });
    },
    websocketError(event) {
      this.onWebSocketError?.(event);
    },
    disconnect() {
      this.connected = false;
      this.onDisconnect?.();
    },
  };
  const factory: StompClientFactory = () => client;
  return { client, factory };
}

const baseConfig: StompProviderConfig = {
  providerType: 'stomp',
  websocketUrl: 'ws://localhost:8080',
  listenerTopic: '/snapshot/positions/{clientId}',
  requestMessage: '/snapshot/positions/{clientId}/1000',
  requestBody: '',
  snapshotEndToken: 'Success',
  keyColumn: 'positionId',
};

describe('StompStreamProvider — configuration', () => {
  it('throws when configure() is missing required fields', async () => {
    const { factory } = mkFake();
    const p = new StompStreamProvider('p1', { createClient: factory });
    await expect(p.configure({ ...baseConfig, keyColumn: '' } as StompProviderConfig)).rejects.toThrow(/keyColumn/);
    await expect(p.configure({ ...baseConfig, websocketUrl: '' })).rejects.toThrow(/websocketUrl/);
    await expect(p.configure({ ...baseConfig, listenerTopic: '' })).rejects.toThrow(/listenerTopic/);
  });

  it('throws if start() runs before configure()', async () => {
    const { factory } = mkFake();
    const p = new StompStreamProvider('p1', { createClient: factory });
    await expect(p.start()).rejects.toThrow(/configure/);
  });
});

describe('StompStreamProvider — lifecycle', () => {
  it('activates the client and resolves start() on onConnect', async () => {
    const { client, factory } = mkFake();
    const p = new StompStreamProvider('p1', { createClient: factory, clientId: 'TEST' });
    await p.configure(baseConfig);

    const startPromise = p.start();
    expect(client._activated).toBe(true);
    // Simulate broker accepting.
    client.connect();
    await startPromise;

    expect(p.getStatistics().isConnected).toBe(true);
    expect(p.getStatistics().connectionCount).toBe(1);
    // Subscribed to the resolved topic template.
    expect(client._subscribedDestinations).toEqual(['/snapshot/positions/TEST']);
    // Trigger publish happened.
    expect(client._publish).toHaveBeenCalledWith({
      destination: '/snapshot/positions/TEST/1000',
      body: '',
    });
  });

  it('rejects start() with the STOMP error message', async () => {
    const { client, factory } = mkFake();
    const p = new StompStreamProvider('p1', { createClient: factory });
    await p.configure(baseConfig);

    const startPromise = p.start();
    client.stompError('auth failed');
    await expect(startPromise).rejects.toThrow('auth failed');
    expect(p.getStatistics().mode).toBe('error');
  });

  it('rejects start() with a WebSocket error', async () => {
    const { client, factory } = mkFake();
    const p = new StompStreamProvider('p1', { createClient: factory });
    await p.configure(baseConfig);

    const startPromise = p.start();
    client.websocketError();
    await expect(startPromise).rejects.toThrow(/WebSocket/);
  });

  it('stop() deactivates the client, unsubscribes, and clears the cache', async () => {
    const { client, factory } = mkFake();
    const p = new StompStreamProvider('p1', { createClient: factory });
    await p.configure(baseConfig);
    const startPromise = p.start();
    client.connect();
    await startPromise;

    client.deliver(JSON.stringify([{ positionId: 'P1', v: 'a' }]));
    expect(p.getCache()).toHaveLength(1);

    await p.stop();
    expect(p.getCache()).toHaveLength(0);
    expect(p.isSnapshotComplete()).toBe(false);
  });
});

describe('StompStreamProvider — message handling', () => {
  async function buildStarted() {
    const { client, factory } = mkFake();
    const p = new StompStreamProvider('p1', { createClient: factory, clientId: 'TEST' });
    await p.configure(baseConfig);
    const startP = p.start();
    client.connect();
    await startP;
    return { client, p };
  }

  it('top-level JSON array → snapshot rows land in cache', async () => {
    const { client, p } = await buildStarted();
    client.deliver(JSON.stringify([
      { positionId: 'P1', qty: 100 },
      { positionId: 'P2', qty: 50 },
    ]));
    const cache = p.getCache();
    expect(cache).toHaveLength(2);
    expect(p.getStatistics().mode).toBe('snapshot');
    expect(p.getStatistics().snapshotBatches).toBe(1);
  });

  it('{ rows: [...] } shape works', async () => {
    const { client, p } = await buildStarted();
    client.deliver(JSON.stringify({ rows: [{ positionId: 'P1' }, { positionId: 'P2' }] }));
    expect(p.getCache()).toHaveLength(2);
  });

  it('{ data: [...] } shape works', async () => {
    const { client, p } = await buildStarted();
    client.deliver(JSON.stringify({ data: [{ positionId: 'P1' }] }));
    expect(p.getCache()).toHaveLength(1);
  });

  it('single-object JSON body is treated as one row', async () => {
    const { client, p } = await buildStarted();
    client.deliver(JSON.stringify({ positionId: 'P1', qty: 100 }));
    expect(p.getCache()).toHaveLength(1);
    expect(p.getCache()[0]).toMatchObject({ positionId: 'P1', qty: 100 });
  });

  it('rows missing the keyColumn are skipped', async () => {
    const { client, p } = await buildStarted();
    client.deliver(JSON.stringify([
      { positionId: 'P1', v: 'kept' },
      { wrongKey: 'oops', v: 'dropped' },
    ]));
    expect(p.getCache()).toHaveLength(1);
    expect(p.getStatistics().snapshotRowsReceived).toBe(1);
  });

  it('non-JSON body is dropped silently (no throw, no cache change)', async () => {
    const { client, p } = await buildStarted();
    client.deliver('NOT JSON AT ALL');
    expect(p.getCache()).toHaveLength(0);
  });

  it('body containing snapshotEndToken (case-insensitive) flips to realtime', async () => {
    const { client, p } = await buildStarted();
    client.deliver(JSON.stringify([{ positionId: 'P1' }]));
    expect(p.isSnapshotComplete()).toBe(false);

    client.deliver("Success: All 1000 positions delivered to client 'TEST'. Starting live updates...");
    expect(p.isSnapshotComplete()).toBe(true);
    expect(p.getStatistics().mode).toBe('realtime');
  });

  it('case-insensitive end-token: "success" / "SUCCESS" / "Success" all match', async () => {
    const configLowercase: StompProviderConfig = { ...baseConfig, snapshotEndToken: 'finished' };
    const { client, factory } = mkFake();
    const p = new StompStreamProvider('p1', { createClient: factory });
    await p.configure(configLowercase);
    const startP = p.start();
    client.connect();
    await startP;

    client.deliver('Stream FINISHED — switching to live');
    expect(p.isSnapshotComplete()).toBe(true);
  });

  it('updates post-complete route through the realtime path', async () => {
    const { client, p } = await buildStarted();
    client.deliver(JSON.stringify([{ positionId: 'P1', qty: 100 }]));
    client.deliver('Success: done');
    expect(p.isSnapshotComplete()).toBe(true);

    // Realtime update — same positionId, new qty.
    client.deliver(JSON.stringify([{ positionId: 'P1', qty: 150 }]));

    const cached = p.getCache();
    expect(cached).toHaveLength(1);
    expect(cached[0]).toMatchObject({ positionId: 'P1', qty: 150 });
    expect(p.getStatistics().mode).toBe('realtime');
    expect(p.getStatistics().updateRowsReceived).toBe(1);
  });

  it('invokes listeners for snapshot / complete / update in order', async () => {
    const { client, p } = await buildStarted();
    const calls: string[] = [];
    p.addListener({
      onSnapshotBatch: () => calls.push('snap'),
      onSnapshotComplete: () => calls.push('complete'),
      onRowUpdate: () => calls.push('update'),
    });

    client.deliver(JSON.stringify([{ positionId: 'P1' }]));
    client.deliver(JSON.stringify([{ positionId: 'P2' }]));
    client.deliver('Success');
    client.deliver(JSON.stringify([{ positionId: 'P1', q: 99 }]));

    expect(calls).toEqual(['snap', 'snap', 'complete', 'update']);
  });
});

describe('StompStreamProvider — template variables', () => {
  it('{clientId} is resolved in listenerTopic AND requestMessage', async () => {
    const { client, factory } = mkFake();
    const p = new StompStreamProvider('p1', { createClient: factory, clientId: 'TRADER-42' });
    await p.configure(baseConfig);
    const startP = p.start();
    client.connect();
    await startP;

    expect(client._subscribedDestinations).toEqual(['/snapshot/positions/TRADER-42']);
    expect(client._publish).toHaveBeenCalledWith({
      destination: '/snapshot/positions/TRADER-42/1000',
      body: '',
    });
  });

  it('constructor-generated clientId is stable for the life of the provider', async () => {
    const { client: c1, factory: f1 } = mkFake();
    const p1 = new StompStreamProvider('p', { createClient: f1 });
    await p1.configure(baseConfig);
    const startP1 = p1.start();
    c1.connect();
    await startP1;

    const topicA = c1._subscribedDestinations[0];

    // Disconnect + restart → same clientId should be used.
    await p1.stop();

    const { client: c2, factory: f2 } = mkFake();
    // Inject a fresh fake so the second start observes it.
    (p1 as unknown as { createClient: typeof f2 }).createClient = f2;
    const startP2 = p1.start();
    c2.connect();
    await startP2;

    expect(c2._subscribedDestinations[0]).toBe(topicA);
  });
});
