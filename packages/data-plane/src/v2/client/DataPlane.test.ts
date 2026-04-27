/**
 * DataPlane client tests — wires a real MessageChannel between the
 * client and a Hub instance running in the same process. End-to-end
 * coverage of the round-trip: client.attach → Hub → emit → port →
 * client.handleMessage → listener.onDelta.
 *
 * The Mock provider is registered for these tests since it's the
 * only one that doesn't need an external transport.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createInPageWiring, DataPlane } from './DataPlane';
import { Hub, type PortLike } from '../worker/Hub';
import { registerProvider } from '../providers/registry';
import type { ProviderConfig } from '@marketsui/shared-types';
import type { ProviderEmit, ProviderHandle } from '../providers/Provider';
import type { ProviderStats, ProviderStatus } from '../protocol';

interface TestController {
  emit: ProviderEmit;
  stops: number;
  restarts: Array<Record<string, unknown> | undefined>;
}

const controllers = new Map<string, TestController>();
let nextId = 1;

beforeEach(() => {
  controllers.clear();
  nextId = 1;
  registerProvider('mock' as ProviderConfig['providerType'], (cfg, emit) => {
    const ctrl: TestController = { emit, stops: 0, restarts: [] };
    const key = (cfg as unknown as { __key?: string }).__key ?? `c-${nextId++}`;
    controllers.set(key, ctrl);
    const handle: ProviderHandle = {
      stop() { ctrl.stops += 1; },
      restart(extra) { ctrl.restarts.push(extra); },
    };
    return handle;
  });
});

const cfg = (key = 'c-1'): ProviderConfig => ({
  providerType: 'mock',
  __key: key,
  keyColumn: 'id',
} as unknown as ProviderConfig);

interface Captured {
  deltas: Array<{ rows: readonly unknown[]; replace: boolean }>;
  statuses: Array<{ status: ProviderStatus; error?: string }>;
  stats: ProviderStats[];
}

function makeListener(): { listener: { onDelta: (rows: readonly unknown[], replace: boolean) => void; onStatus: (status: ProviderStatus, error?: string) => void }; captured: Captured } {
  const captured: Captured = { deltas: [], statuses: [], stats: [] };
  return {
    captured,
    listener: {
      onDelta: (rows, replace) => captured.deltas.push({ rows, replace }),
      onStatus: (status, error) => captured.statuses.push({ status, error }),
    },
  };
}

interface Wiring {
  hub: Hub;
  client: DataPlane;
  close(): void;
}

function wire(): Wiring {
  const hub = new Hub();
  const wiring = createInPageWiring((port) => {
    const portLike: PortLike = { postMessage: (m) => port.postMessage(m) };
    port.addEventListener('message', (ev: MessageEvent) => {
      hub.handleRequest(portLike, ev.data);
    });
    port.start();
  });
  return {
    hub,
    client: wiring.client,
    close: () => {
      wiring.close();
      void hub.dispose();
    },
  };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await new Promise<void>((r) => setTimeout(r, 0));
  }
}

describe('DataPlane client', () => {
  let w: Wiring;

  beforeEach(() => { w = wire(); });
  afterEach(() => w.close());

  it('attach() routes the first replace + status back to the listener', async () => {
    const { listener, captured } = makeListener();
    w.client.attach('p1', cfg(), listener);

    await flush();

    expect(captured.deltas).toHaveLength(1);
    expect(captured.deltas[0]).toMatchObject({ rows: [], replace: true });
    expect(captured.statuses[0]).toMatchObject({ status: 'loading' });
  });

  it('subsequent rows from the provider reach every attached listener', async () => {
    const a = makeListener();
    const b = makeListener();
    w.client.attach('p1', cfg(), a.listener);
    w.client.attach('p1', undefined, b.listener);
    await flush();

    a.captured.deltas.length = 0;
    b.captured.deltas.length = 0;
    controllers.get('c-1')!.emit({ rows: [{ id: 'r1', x: 1 }] });
    await flush();

    expect(a.captured.deltas).toHaveLength(1);
    expect(b.captured.deltas).toHaveLength(1);
    expect(a.captured.deltas[0].rows).toEqual([{ id: 'r1', x: 1 }]);
  });

  it('detach() stops further deliveries to that listener only', async () => {
    const a = makeListener();
    const b = makeListener();
    const subA = w.client.attach('p1', cfg(), a.listener);
    w.client.attach('p1', undefined, b.listener);
    await flush();

    w.client.detach(subA);
    await flush();
    a.captured.deltas.length = 0;
    b.captured.deltas.length = 0;
    controllers.get('c-1')!.emit({ rows: [{ id: 'r2' }] });
    await flush();

    expect(a.captured.deltas).toHaveLength(0);
    expect(b.captured.deltas).toHaveLength(1);
  });

  it('attach with extra triggers provider.restart on a running provider', async () => {
    const { listener } = makeListener();
    w.client.attach('p1', cfg(), listener);
    await flush();

    const { listener: l2 } = makeListener();
    w.client.attach('p1', undefined, l2, { extra: { asOfDate: '2026-04-01' } });
    await flush();

    expect(controllers.get('c-1')!.restarts).toEqual([{ asOfDate: '2026-04-01' }]);
  });

  it('stop() tears the provider down and surfaces error to subscribers', async () => {
    const { listener, captured } = makeListener();
    w.client.attach('p1', cfg(), listener);
    await flush();

    w.client.stop('p1');
    await flush();

    expect(controllers.get('c-1')!.stops).toBe(1);
    const err = captured.statuses.find((s) => s.status === 'error');
    expect(err).toBeTruthy();
  });

  it('attachStats() delivers stats events at the sampler cadence', async () => {
    const captured: ProviderStats[] = [];
    w.client.attach('p1', cfg(), makeListener().listener);
    w.client.attachStats('p1', { onStats: (s) => captured.push(s) });
    await flush();

    expect(captured.length).toBeGreaterThan(0);
    expect(captured[0]).toMatchObject({ rowCount: 0, subscriberCount: 1 });
  });

  it('close() detaches all listeners and ignores subsequent calls', () => {
    const { listener } = makeListener();
    w.client.attach('p1', cfg(), listener);
    w.client.close();
    expect(() => w.client.attach('p2', cfg('c-2'), listener)).toThrow();
    // Idempotent.
    w.client.close();
  });
});
