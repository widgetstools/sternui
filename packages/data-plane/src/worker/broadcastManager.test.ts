import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BroadcastManager } from './broadcastManager';
import type { DataPlaneResponse } from '../protocol';

/**
 * jsdom ships `MessageChannel`, so every test uses a real pair of
 * MessagePorts and listens on the counterpart to observe delivery.
 * This is more honest than mocking `postMessage` — it catches
 * transfer-semantics bugs too.
 */

function mkChannel(): { client: MessagePort; worker: MessagePort; received: DataPlaneResponse[]; } {
  const chan = new MessageChannel();
  const received: DataPlaneResponse[] = [];
  chan.port1.onmessage = (ev) => received.push(ev.data as DataPlaneResponse);
  chan.port1.start();
  return { client: chan.port1, worker: chan.port2, received };
}

const okMsg = (reqId = 'r1'): DataPlaneResponse => ({
  op: 'ok',
  reqId,
  cached: false,
  fetchedAt: 0,
});

/**
 * Poll until `received.length >= expected` — MessageChannel delivery
 * runs on the macrotask queue and can be delayed arbitrarily under
 * parallel-process load (turbo test runs hit this). A one-shot
 * `setTimeout(r, 0)` is insufficient; polling with a small interval
 * and generous deadline flushes reliably without slowing passing runs.
 */
async function waitForDelivery(received: unknown[], expected: number, maxMs = 500): Promise<void> {
  const start = Date.now();
  while (received.length < expected && Date.now() - start < maxMs) {
    await new Promise((r) => setTimeout(r, 5));
  }
}

describe('BroadcastManager — add / remove / count', () => {
  let bm: BroadcastManager;
  beforeEach(() => { bm = new BroadcastManager(); });

  it('addSubscriber + getSubscriberCount reflect presence', () => {
    const { worker: p1 } = mkChannel();
    const { worker: p2 } = mkChannel();
    bm.addSubscriber('prov', 'port-1', p1);
    bm.addSubscriber('prov', 'port-2', p2);
    expect(bm.getSubscriberCount('prov')).toBe(2);
    expect(bm.getSubscribers('prov').sort()).toEqual(['port-1', 'port-2']);
    expect(bm.getActiveProviders()).toEqual(['prov']);
  });

  it('removeSubscriber drops the provider entirely when empty', () => {
    const { worker } = mkChannel();
    bm.addSubscriber('prov', 'port-1', worker);
    bm.removeSubscriber('prov', 'port-1');
    expect(bm.getSubscriberCount('prov')).toBe(0);
    expect(bm.getActiveProviders()).toEqual([]);
  });

  it('removePortFromAll sweeps a port out of every provider', () => {
    const { worker: pA } = mkChannel();
    const { worker: pB } = mkChannel();
    bm.addSubscriber('prov-a', 'shared-port', pA);
    bm.addSubscriber('prov-b', 'shared-port', pB);
    bm.addSubscriber('prov-a', 'other-port', pA);

    const affected = bm.removePortFromAll('shared-port').sort();
    expect(affected).toEqual(['prov-a', 'prov-b']);
    expect(bm.getSubscriberCount('prov-a')).toBe(1); // other-port survives
    expect(bm.getSubscriberCount('prov-b')).toBe(0);
  });
});

describe('BroadcastManager — fan-out', () => {
  it('broadcast delivers the same message to every port', async () => {
    const bm = new BroadcastManager();
    const a = mkChannel();
    const b = mkChannel();
    bm.addSubscriber('prov', 'A', a.worker);
    bm.addSubscriber('prov', 'B', b.worker);

    const msg = okMsg();
    const dead = bm.broadcast('prov', msg);

    // Flush MessagePort delivery (macrotask queue).
    await waitForDelivery(a.received, 1);
    await waitForDelivery(b.received, 1);

    expect(dead).toEqual([]);
    expect(a.received).toEqual([msg]);
    expect(b.received).toEqual([msg]);
  });

  it('broadcast returns [] for an unknown provider (no-op)', () => {
    const bm = new BroadcastManager();
    expect(bm.broadcast('nope', okMsg())).toEqual([]);
  });

  it('broadcast purges a dead port and returns its id', () => {
    const bm = new BroadcastManager();
    const good = mkChannel();
    // Fake "dead" port that throws on postMessage.
    const dead = {
      postMessage: vi.fn(() => { throw new Error('closed'); }),
    } as unknown as MessagePort;

    bm.addSubscriber('prov', 'good', good.worker);
    bm.addSubscriber('prov', 'dead', dead);

    const removed = bm.broadcast('prov', okMsg());
    expect(removed).toEqual(['dead']);
    expect(bm.getSubscriberCount('prov')).toBe(1);
    expect(bm.getSubscribers('prov')).toEqual(['good']);
  });
});

describe('BroadcastManager — targeted send', () => {
  it('sendToSubscriber delivers only to the named port', async () => {
    const bm = new BroadcastManager();
    const a = mkChannel();
    const b = mkChannel();
    bm.addSubscriber('prov', 'A', a.worker);
    bm.addSubscriber('prov', 'B', b.worker);

    const ok = bm.sendToSubscriber('prov', 'A', okMsg('r42'));
    await waitForDelivery(a.received, 1);

    expect(ok).toBe(true);
    expect(a.received).toEqual([okMsg('r42')]);
    expect(b.received).toEqual([]);
  });

  it('sendToSubscriber returns false + purges when the port is dead', () => {
    const bm = new BroadcastManager();
    const dead = {
      postMessage: vi.fn(() => { throw new Error('closed'); }),
    } as unknown as MessagePort;
    bm.addSubscriber('prov', 'dead', dead);

    const ok = bm.sendToSubscriber('prov', 'dead', okMsg());
    expect(ok).toBe(false);
    expect(bm.getSubscriberCount('prov')).toBe(0);
  });

  it('sendToSubscriber returns false for unknown provider or port', () => {
    const bm = new BroadcastManager();
    expect(bm.sendToSubscriber('missing', 'p', okMsg())).toBe(false);
    const good = mkChannel();
    bm.addSubscriber('prov', 'A', good.worker);
    expect(bm.sendToSubscriber('prov', 'missing-port', okMsg())).toBe(false);
  });
});
