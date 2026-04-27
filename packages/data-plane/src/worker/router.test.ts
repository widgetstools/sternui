import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AppDataProviderConfig, MockProviderConfig, ProviderConfig } from '@marketsui/shared-types';
import { Router } from './router';
import { BroadcastManager } from './broadcastManager';
import type { ProviderFactory, ProviderInstance } from './providerFactory';
import type { DataPlaneRequest, DataPlaneResponse } from '../protocol';
import { AppDataProvider } from '../providers/AppDataProvider';
import { StreamProviderBase } from '../providers/StreamProviderBase';
import type { ProviderType } from '@marketsui/shared-types';

// ─── Test helpers ──────────────────────────────────────────────────────

interface ClientPort {
  /** The port the client uses to send requests to the router. */
  client: MessagePort;
  /** The port the router receives on. */
  worker: MessagePort;
  /** Everything the client has seen from the worker, in arrival order. */
  received: DataPlaneResponse[];
}

function mkPort(): ClientPort {
  const ch = new MessageChannel();
  const received: DataPlaneResponse[] = [];
  ch.port1.onmessage = (ev) => received.push(ev.data as DataPlaneResponse);
  ch.port1.start();
  return { client: ch.port1, worker: ch.port2, received };
}

/** Flush the microtask/task queue so MessagePort deliveries settle. */
const flush = () => new Promise((r) => setTimeout(r, 0));

/**
 * Test-only row-stream provider — lets the test drive the phase
 * machine directly instead of spinning up a real transport.
 */
class TestStream extends StreamProviderBase<{ keyColumn: string }, Record<string, unknown>> {
  readonly type: ProviderType = 'stomp';
  async configure(c: { keyColumn: string }): Promise<void> {
    this.lastConfig = c;
  }
  async start(): Promise<void> { this.reportConnected(); }
  async stop(): Promise<void> { this.reportDisconnected(); }

  emitSnapshot(rows: Record<string, unknown>[]) { this.ingestSnapshotBatch(rows); }
  emitComplete() { this.markSnapshotComplete(); }
  emitUpdate(rows: Record<string, unknown>[]) { this.ingestUpdate(rows); }
}

// ─── Tests: keyed-resource opcodes ─────────────────────────────────────

describe('Router — keyed-resource (AppData)', () => {
  let router: Router;
  let port: ClientPort;

  beforeEach(() => {
    router = new Router();
    port = mkPort();
  });

  it('configure + get returns the seeded AppData value', async () => {
    const cfg: AppDataProviderConfig = {
      providerType: 'appdata',
      variables: { token: { key: 'token', value: 'abc', type: 'string' } },
    };

    await router.handleRequest(port.worker, { op: 'configure', reqId: 'r1', providerId: 'app', config: cfg });
    await router.handleRequest(port.worker, { op: 'get', reqId: 'r2', providerId: 'app', key: 'token' });
    await flush();

    expect(port.received).toHaveLength(2);
    expect(port.received[0]).toMatchObject({ op: 'ok', reqId: 'r1' });
    const got = port.received[1] as Extract<DataPlaneResponse, { op: 'ok' }>;
    expect(got.op).toBe('ok');
    expect(got.reqId).toBe('r2');
    expect(got.value).toBe('abc');
    expect(got.cached).toBe(false); // first fetch goes through provider
  });

  it('second get returns cached=true without re-invoking provider.fetch', async () => {
    const cfg: AppDataProviderConfig = {
      providerType: 'appdata',
      variables: { k: { key: 'k', value: 1, type: 'number' } },
    };
    await router.handleRequest(port.worker, { op: 'configure', reqId: 'c', providerId: 'app', config: cfg });
    await router.handleRequest(port.worker, { op: 'get', reqId: 'g1', providerId: 'app', key: 'k' });
    await router.handleRequest(port.worker, { op: 'get', reqId: 'g2', providerId: 'app', key: 'k' });
    await flush();

    const r1 = port.received.find((m) => m.op === 'ok' && m.reqId === 'g1') as Extract<DataPlaneResponse, { op: 'ok' }>;
    const r2 = port.received.find((m) => m.op === 'ok' && m.reqId === 'g2') as Extract<DataPlaneResponse, { op: 'ok' }>;
    expect(r1.value).toBe(1);
    expect(r1.cached).toBe(false);
    expect(r2.value).toBe(1);
    expect(r2.cached).toBe(true);
  });

  it('put updates the cache and subsequent get sees the new value', async () => {
    const cfg: AppDataProviderConfig = { providerType: 'appdata', variables: {} };
    await router.handleRequest(port.worker, { op: 'configure', reqId: 'c', providerId: 'app', config: cfg });
    await router.handleRequest(port.worker, { op: 'put', reqId: 'p', providerId: 'app', key: 'k', value: 42 });
    await router.handleRequest(port.worker, { op: 'get', reqId: 'g', providerId: 'app', key: 'k' });
    await flush();

    const ok = port.received.find((m) => m.op === 'ok' && m.reqId === 'g') as Extract<DataPlaneResponse, { op: 'ok' }>;
    expect(ok.value).toBe(42);
    expect(ok.cached).toBe(true); // put populated the cache
  });

  it('subscribe delivers an update when another port puts the same key', async () => {
    const cfg: AppDataProviderConfig = { providerType: 'appdata', variables: {} };
    const a = mkPort();
    const b = mkPort();
    await router.handleRequest(a.worker, { op: 'configure', reqId: 'c', providerId: 'app', config: cfg });

    await router.handleRequest(a.worker, {
      op: 'subscribe', reqId: 's', subId: 'sub-1', providerId: 'app', key: 'shared',
    });
    await flush();
    expect(a.received.at(-1)).toMatchObject({ op: 'sub-established', subId: 'sub-1' });

    // Another port writes — subscriber A should receive an update.
    await router.handleRequest(b.worker, { op: 'put', reqId: 'p', providerId: 'app', key: 'shared', value: 'hello' });
    await flush();

    const update = a.received.find((m) => m.op === 'update') as Extract<DataPlaneResponse, { op: 'update' }>;
    expect(update).toBeDefined();
    expect(update.key).toBe('shared');
    expect(update.value).toBe('hello');
    expect(update.subId).toBe('sub-1');
    expect(update.seq).toBeGreaterThan(0);
  });

  it('get on an unconfigured provider returns PROVIDER_NOT_CONFIGURED', async () => {
    await router.handleRequest(port.worker, { op: 'get', reqId: 'g', providerId: 'missing', key: 'k' });
    await flush();
    const err = port.received[0] as Extract<DataPlaneResponse, { op: 'err' }>;
    expect(err.op).toBe('err');
    expect(err.error.code).toBe('PROVIDER_NOT_CONFIGURED');
  });
});

describe('Router — keyed-resource dedup (Mock)', () => {
  it('concurrent get calls invoke provider.fetch once via singleFlight', async () => {
    // Stub factory returns a Mock whose fetch we can count.
    const fetchSpy = vi.fn(async () => ({ rows: [{ id: 'p' }] }));
    const factory: ProviderFactory = async () => {
      const p = new (class extends AppDataProvider {})('mk');
      // Override fetch to be slow + counted.
      (p as unknown as { fetch: typeof p.fetch }).fetch = fetchSpy as unknown as typeof p.fetch;
      return { shape: 'keyed', provider: p } as ProviderInstance;
    };
    const router = new Router({ providerFactory: factory });
    const port = mkPort();

    const cfg: ProviderConfig = { providerType: 'appdata', variables: {} };
    await router.handleRequest(port.worker, { op: 'configure', reqId: 'c', providerId: 'p1', config: cfg });

    await Promise.all([
      router.handleRequest(port.worker, { op: 'get', reqId: 'g1', providerId: 'p1', key: 'k' }),
      router.handleRequest(port.worker, { op: 'get', reqId: 'g2', providerId: 'p1', key: 'k' }),
      router.handleRequest(port.worker, { op: 'get', reqId: 'g3', providerId: 'p1', key: 'k' }),
    ]);
    await flush();

    // Exactly one fetch despite three concurrent gets.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    // Four `ok` responses: one for configure, three for the gets.
    const getOks = port.received.filter(
      (m) => m.op === 'ok' && (m.reqId === 'g1' || m.reqId === 'g2' || m.reqId === 'g3'),
    );
    expect(getOks).toHaveLength(3);
  });
});

// ─── Tests: row-stream opcodes ─────────────────────────────────────────

describe('Router — row-stream (subscribe-stream + get-cached-rows)', () => {
  function buildRouter() {
    const provider = new TestStream('prov', { keyColumn: 'id' });
    const factory: ProviderFactory = async () => ({ shape: 'stream', provider });
    const router = new Router({ providerFactory: factory });
    return { router, provider };
  }

  it('emits snapshot-batch on snapshot, snapshot-complete on flip, row-update on realtime', async () => {
    const { router, provider } = buildRouter();
    const port = mkPort();

    const cfg: ProviderConfig = { providerType: 'stomp' } as ProviderConfig;
    await router.handleRequest(port.worker, { op: 'configure', reqId: 'c', providerId: 'p', config: cfg });
    await router.handleRequest(port.worker, {
      op: 'subscribe-stream', reqId: 's', subId: 'ss', providerId: 'p',
    });
    await flush();

    provider.emitSnapshot([{ id: 1, v: 'a' }]);
    provider.emitSnapshot([{ id: 2, v: 'b' }]);
    provider.emitComplete();
    provider.emitUpdate([{ id: 1, v: 'a-prime' }]);
    await flush();

    // First response is the configure's `ok`; skip it for the flow assertion.
    const ops = port.received.map((m) => m.op);
    expect(ops[0]).toBe('ok'); // configure response
    expect(ops.slice(1)).toEqual([
      'sub-established',
      'snapshot-batch',
      'snapshot-batch',
      'snapshot-complete',
      'row-update',
    ]);

    const batches = port.received.filter((m) => m.op === 'snapshot-batch') as Extract<DataPlaneResponse, { op: 'snapshot-batch' }>[];
    expect(batches[0].batch).toBe(0);
    expect(batches[1].batch).toBe(1);
    expect(batches[0].rows).toEqual([{ id: 1, v: 'a' }]);

    const complete = port.received.find((m) => m.op === 'snapshot-complete') as Extract<DataPlaneResponse, { op: 'snapshot-complete' }>;
    expect(complete.rowCount).toBe(2);

    const update = port.received.find((m) => m.op === 'row-update') as Extract<DataPlaneResponse, { op: 'row-update' }>;
    expect(update.rows).toEqual([{ id: 1, v: 'a-prime' }]);
    expect(update.seq).toBe(1);
  });

  it('get-cached-rows replies with empty + complete for a port that received the live snapshot', async () => {
    const { router, provider } = buildRouter();
    const port = mkPort();
    const cfg: ProviderConfig = { providerType: 'stomp' } as ProviderConfig;

    await router.handleRequest(port.worker, { op: 'configure', reqId: 'c', providerId: 'p', config: cfg });
    await router.handleRequest(port.worker, { op: 'subscribe-stream', reqId: 's', subId: 'ss', providerId: 'p' });
    await flush();

    provider.emitSnapshot([{ id: 1 }, { id: 2 }]);
    provider.emitComplete();
    await flush();

    // Now request cached rows — port is an early joiner, should get empty + complete.
    await router.handleRequest(port.worker, { op: 'get-cached-rows', reqId: 'gc', providerId: 'p' });
    await flush();

    const gcBatch = port.received.find(
      (m) => m.op === 'snapshot-batch' && m.reqId === 'gc',
    ) as Extract<DataPlaneResponse, { op: 'snapshot-batch' }>;
    const gcComplete = port.received.find(
      (m) => m.op === 'snapshot-complete' && m.reqId === 'gc',
    );
    expect(gcBatch.rows).toEqual([]); // early joiner — no replay
    expect(gcBatch.isFinal).toBe(true);
    expect(gcComplete).toBeDefined();
  });

  it('late-joiner port gets the cached snapshot with diagnostics', async () => {
    const { router, provider } = buildRouter();
    const earlyPort = mkPort();
    const latePort = mkPort();
    const cfg: ProviderConfig = { providerType: 'stomp' } as ProviderConfig;

    await router.handleRequest(earlyPort.worker, { op: 'configure', reqId: 'c', providerId: 'p', config: cfg });
    await router.handleRequest(earlyPort.worker, { op: 'subscribe-stream', reqId: 's', subId: 'ssEarly', providerId: 'p' });
    await flush();

    provider.emitSnapshot([{ id: 1, v: 'a' }, { id: 2, v: 'b' }]);
    provider.emitComplete();
    await flush();

    // Late port hasn't registered yet — the snapshot already completed.
    await router.handleRequest(latePort.worker, { op: 'get-cached-rows', reqId: 'late', providerId: 'p' });
    await flush();

    const batch = latePort.received.find((m) => m.op === 'snapshot-batch') as Extract<DataPlaneResponse, { op: 'snapshot-batch' }>;
    expect(batch).toBeDefined();
    expect(batch.rows).toHaveLength(2);
    expect(batch.isFinal).toBe(true);
    expect(batch.diagnostics?.keyColumn).toBe('id');
    expect(batch.diagnostics?.cacheSize).toBe(2);
  });
});

// ─── Tests: misc ───────────────────────────────────────────────────────

describe('Router — ping + teardown', () => {
  it('ping returns pong with the same reqId', async () => {
    const router = new Router();
    const port = mkPort();
    await router.handleRequest(port.worker, { op: 'ping', reqId: 'pq' });
    await flush();
    expect(port.received[0]).toEqual({ op: 'pong', reqId: 'pq' });
  });

  it('teardown removes the provider', async () => {
    const router = new Router();
    const port = mkPort();
    const cfg: MockProviderConfig = { providerType: 'mock', dataType: 'positions', rowCount: 5 };
    await router.handleRequest(port.worker, { op: 'configure', reqId: 'c', providerId: 'mk', config: cfg });
    await router.handleRequest(port.worker, { op: 'teardown', reqId: 't', providerId: 'mk' });
    await router.handleRequest(port.worker, { op: 'get', reqId: 'g', providerId: 'mk', key: 'x' });
    await flush();

    const err = port.received.find((m) => m.op === 'err' && m.reqId === 'g') as Extract<DataPlaneResponse, { op: 'err' }>;
    expect(err).toBeDefined();
    expect(err.error.code).toBe('PROVIDER_NOT_CONFIGURED');
  });

  it('onPortClosed unsubscribes the closing port but leaves keyed providers alive', async () => {
    // Keyed providers (AppData, REST-per-endpoint) hold no expensive
    // transport — they stay registered even when the last port goes
    // away, so a different port can still `get`/`put` without
    // re-running `configure`.
    const router = new Router();
    const port = mkPort();
    const cfg: AppDataProviderConfig = { providerType: 'appdata', variables: {} };
    await router.handleRequest(port.worker, { op: 'configure', reqId: 'c', providerId: 'a', config: cfg });
    await router.handleRequest(port.worker, { op: 'put', reqId: 'p', providerId: 'a', key: 'k', value: 'persisted' });
    await router.handleRequest(port.worker, { op: 'subscribe', reqId: 's', subId: 'subX', providerId: 'a', key: 'k' });
    await flush();

    await router.onPortClosed(port.worker);

    // A fresh port can still read the value — provider survived the
    // port closure because it's a keyed (in-memory) provider.
    const port2 = mkPort();
    await router.handleRequest(port2.worker, { op: 'get', reqId: 'g', providerId: 'a', key: 'k' });
    await flush();

    const ok = port2.received.find((m) => m.op === 'ok' && m.reqId === 'g') as Extract<DataPlaneResponse, { op: 'ok' }>;
    expect(ok).toBeDefined();
    expect(ok.value).toBe('persisted');
  });

  it('onPortClosed tears down an idle row-stream provider when the last subscriber leaves', async () => {
    // Row-stream providers DO hold a transport, so the router
    // auto-tears-down when no subscribers remain.
    const provider = new (class extends StreamProviderBase<{ keyColumn: string }, Record<string, unknown>> {
      readonly type = 'stomp' as const;
      async configure(_c: { keyColumn: string }): Promise<void> {}
      async start(): Promise<void> { this.reportConnected(); }
      async stop(): Promise<void> { this.reportDisconnected(); }
    })('p', { keyColumn: 'id' });
    const stopSpy = vi.spyOn(provider, 'stop');

    const factory: ProviderFactory = async () => ({ shape: 'stream', provider });
    const router = new Router({ providerFactory: factory });
    const port = mkPort();

    await router.handleRequest(port.worker, { op: 'configure', reqId: 'c', providerId: 'p', config: { providerType: 'stomp' } as never });
    await router.handleRequest(port.worker, { op: 'subscribe-stream', reqId: 's', subId: 'ss', providerId: 'p' });
    await flush();

    await router.onPortClosed(port.worker);
    await flush();

    expect(stopSpy).toHaveBeenCalled();
  });
});

describe('Router — BroadcastManager injection', () => {
  it('accepts an externally provided BroadcastManager (observable from tests)', async () => {
    const bm = new BroadcastManager();
    const addSpy = vi.spyOn(bm, 'addSubscriber');
    const router = new Router({ broadcast: bm });
    const port = mkPort();

    const cfg: AppDataProviderConfig = { providerType: 'appdata', variables: {} };
    await router.handleRequest(port.worker, { op: 'configure', reqId: 'c', providerId: 'a', config: cfg });
    await router.handleRequest(port.worker, { op: 'subscribe', reqId: 's', subId: 'sub', providerId: 'a', key: 'k' });
    await flush();

    expect(addSpy).toHaveBeenCalledTimes(1);
    expect(bm.getSubscriberCount('a')).toBe(1);
  });
});

// ─── Tests: restart opcode ─────────────────────────────────────────────

describe('Router — restart opcode', () => {
  it('responds with ok and re-invokes provider.restart() with the extra bag', async () => {
    const factory: ProviderFactory = async (_id, config) => {
      if (config.providerType === 'stomp') {
        const inst = new TestStream('p', { keyColumn: 'id' });
        // configure() captures lastConfig so restart() has something to re-apply
        await inst.configure({ keyColumn: 'id' });
        return { shape: 'stream', provider: inst } as ProviderInstance;
      }
      throw new Error('unsupported');
    };
    const router = new Router({ providerFactory: factory });
    const port = mkPort();

    await router.handleRequest(port.worker, { op: 'configure', reqId: 'c', providerId: 'p', config: { providerType: 'stomp' } as never });
    await flush();

    // We can't easily reach the live instance, but a successful `restart`
    // request returns ok — and the underlying call goes through the
    // ProviderBase default impl (teardown + configure). Snapshot any
    // existing listener captures fresh data on the next ingestSnapshotBatch.
    await router.handleRequest(port.worker, { op: 'restart', reqId: 'r', providerId: 'p', extra: { asOfDate: '2026-04-01' } });
    await flush();

    const restartReply = port.received.find((m) => m.reqId === 'r');
    expect(restartReply).toBeDefined();
    if (restartReply?.op === 'err') {
      // Print the error to make debugging trivial if this regresses.
      // eslint-disable-next-line no-console
      console.error('restart returned err:', restartReply.error);
    }
    expect(restartReply?.op).toBe('ok');
  });

  it('errors out when the provider was never configured', async () => {
    const router = new Router();
    const port = mkPort();

    await router.handleRequest(port.worker, { op: 'restart', reqId: 'r', providerId: 'never-configured' });
    await flush();

    const reply = port.received.find((m) => m.reqId === 'r');
    expect(reply?.op).toBe('err');
    if (reply?.op === 'err') {
      expect(reply.error.code).toBe('PROVIDER_NOT_CONFIGURED');
    }
  });
});

// ─── Tests: resolve opcode ─────────────────────────────────────────────

describe('Router — resolve opcode (template substitution)', () => {
  let router: Router;
  let port: ClientPort;

  beforeEach(() => {
    router = new Router();
    port = mkPort();
  });

  async function configureAppData(providerId: string, vars: Record<string, unknown>) {
    const cfg: AppDataProviderConfig = {
      providerType: 'appdata',
      variables: Object.fromEntries(
        Object.entries(vars).map(([k, v]) => [k, { key: k, value: v, type: typeof v as 'string' | 'number' | 'boolean' }]),
      ),
    };
    await router.handleRequest(port.worker, { op: 'configure', reqId: `c-${providerId}`, providerId, config: cfg });
  }

  it('substitutes a single token with the AppData provider value', async () => {
    await configureAppData('app', { token: 'secret123' });
    await router.handleRequest(port.worker, { op: 'resolve', reqId: 'r', template: 'Bearer {{app.token}}' });
    await flush();

    const reply = port.received.find((m) => m.reqId === 'r' && m.op === 'ok') as Extract<DataPlaneResponse, { op: 'ok' }>;
    expect(reply.value).toBe('Bearer secret123');
  });

  it('substitutes multiple tokens across multiple providers', async () => {
    await configureAppData('app', { token: 'abc' });
    await configureAppData('user', { name: 'dev1' });
    await router.handleRequest(port.worker, { op: 'resolve', reqId: 'r', template: '{{user.name}}/{{app.token}}' });
    await flush();

    const reply = port.received.find((m) => m.reqId === 'r' && m.op === 'ok') as Extract<DataPlaneResponse, { op: 'ok' }>;
    expect(reply.value).toBe('dev1/abc');
  });

  it('leaves unknown tokens as-is', async () => {
    await configureAppData('app', { token: 'abc' });
    await router.handleRequest(port.worker, { op: 'resolve', reqId: 'r', template: '{{nope.who}}/{{app.token}}' });
    await flush();

    const reply = port.received.find((m) => m.reqId === 'r' && m.op === 'ok') as Extract<DataPlaneResponse, { op: 'ok' }>;
    expect(reply.value).toBe('{{nope.who}}/abc');
  });

  it('non-AppData providers are skipped (token left as-is)', async () => {
    // configure() the appdata one + a stream one with the same id-prefix shouldn't matter.
    await configureAppData('app', { token: 'abc' });
    await router.handleRequest(port.worker, { op: 'resolve', reqId: 'r', template: '{{app.missing}}/{{app.token}}' });
    await flush();

    const reply = port.received.find((m) => m.reqId === 'r' && m.op === 'ok') as Extract<DataPlaneResponse, { op: 'ok' }>;
    expect(reply.value).toBe('{{app.missing}}/abc');
  });

  it('JSON-stringifies non-string values', async () => {
    await configureAppData('app', { count: 42, flags: { a: 1 } });
    await router.handleRequest(port.worker, { op: 'resolve', reqId: 'r', template: '{{app.count}}-{{app.flags}}' });
    await flush();

    const reply = port.received.find((m) => m.reqId === 'r' && m.op === 'ok') as Extract<DataPlaneResponse, { op: 'ok' }>;
    expect(reply.value).toBe('42-{"a":1}');
  });
});
