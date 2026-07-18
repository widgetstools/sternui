/**
 * ProviderHub + ProviderClient in-process tests (ADR Phase 4a).
 */

import { describe, expect, it, beforeEach, vi } from 'vitest';
import { ProviderHub } from './ProviderHub.js';
import { ProviderClient } from './ProviderClient.js';
import { registerProvider } from '../providers/registry.js';
import type { ProviderEmit, ProviderHandle } from '../providers/Provider.js';
import type { ProviderConfig } from '@wellsfargo-starui/types';
import type { Event } from '../protocol.js';
import type { PortLike } from '../worker/hubTypes.js';
import { parseProviderWorkerName, providerSharedWorkerName } from '../../bootstrap/workerBootstrapPayload.js';

interface CapturedPort extends PortLike {
  messages: unknown[];
}

function makePort(): CapturedPort {
  const messages: unknown[] = [];
  return {
    messages,
    postMessage(m: unknown) {
      messages.push(
        m && typeof m === 'object' ? { ...(m as object) } : m,
      );
    },
  };
}

interface TestController {
  emit: ProviderEmit;
  stopCount: number;
}

const controllers = new Map<string, TestController>();

beforeEach(() => {
  controllers.clear();
  registerProvider('mock' as ProviderConfig['providerType'], (cfg, emit) => {
    const ctrl: TestController = { emit, stopCount: 0 };
    controllers.set(
      (cfg as unknown as { __testKey?: string }).__testKey ?? 'default',
      ctrl,
    );
    const handle: ProviderHandle = {
      stop() {
        ctrl.stopCount += 1;
      },
      restart() {
        /* no-op */
      },
    };
    return handle;
  });
});

const cfg = (key = 'default'): ProviderConfig =>
  ({
    providerType: 'mock',
    __testKey: key,
    keyColumn: 'id',
  } as unknown as ProviderConfig);

describe('provider worker naming', () => {
  it('round-trips appId and providerId (providerId may contain :)', () => {
    const name = providerSharedWorkerName('my-app', 'stomp:live');
    expect(name).toBe('starui-provider:my-app:stomp:live');
    expect(parseProviderWorkerName(name)).toEqual({
      appId: 'my-app',
      providerId: 'stomp:live',
    });
  });
});

describe('ProviderHub', () => {
  it('accepts attach for its providerId and fans replace + status', () => {
    const hub = new ProviderHub({ providerId: 'p1' });
    const port = makePort();

    hub.handleRequest(port, {
      kind: 'attach',
      subId: 's1',
      providerId: 'p1',
      mode: 'data',
      cfg: cfg(),
    });

    const kinds = port.messages.map((m) => (m as Event).kind);
    expect(kinds).toContain('status');
    expect(kinds.some((k) => k === 'delta' || k === 'delta-bin')).toBe(true);
  });

  it('rejects attach for a different providerId', () => {
    const hub = new ProviderHub({ providerId: 'p1' });
    const port = makePort();

    hub.handleRequest(port, {
      kind: 'attach',
      subId: 's1',
      providerId: 'other',
      mode: 'data',
      cfg: cfg(),
    });

    expect(port.messages).toEqual([
      expect.objectContaining({
        kind: 'status',
        status: 'error',
        subId: 's1',
      }),
    ]);
    expect(controllers.size).toBe(0);
  });

  it('answers provider-worker-ready', () => {
    const hub = new ProviderHub({ providerId: 'p1' });
    const port = makePort();
    hub.handleRequest(port, { kind: 'provider-worker-ready', reqId: 'r1' });
    expect(port.messages[0]).toEqual({
      kind: 'provider-worker-ready-ok',
      reqId: 'r1',
      ok: true,
      providerId: 'p1',
    });
  });

  it('late joiner gets cache snapshot after first subscriber', () => {
    const hub = new ProviderHub({ providerId: 'p1' });
    const portA = makePort();
    const portB = makePort();

    hub.handleRequest(portA, {
      kind: 'attach',
      subId: 'sA',
      providerId: 'p1',
      mode: 'data',
      cfg: cfg(),
    });

    const ctrl = controllers.get('default');
    expect(ctrl).toBeTruthy();
    ctrl!.emit({ kind: 'data', rows: [{ id: 1 }, { id: 2 }], replace: true });
    ctrl!.emit({ kind: 'status', status: 'ready' });

    hub.handleRequest(portB, {
      kind: 'attach',
      subId: 'sB',
      providerId: 'p1',
      mode: 'data',
    });

    const replace = portB.messages.filter(
      (m) =>
        ((m as Event).kind === 'delta' || (m as Event).kind === 'delta-bin') &&
        Boolean((m as { replace?: boolean }).replace),
    );
    expect(replace.length).toBeGreaterThan(0);
  });
});

describe('ProviderClient over MessageChannel', () => {
  it('ready + subscribe snapshot round-trip', async () => {
    const hub = new ProviderHub({ providerId: 'p1' });
    const { port1, port2 } = new MessageChannel();
    const hubPort: PortLike = {
      postMessage: (m) => port2.postMessage(m),
    };
    port2.onmessage = (ev) => {
      hub.handleRequest(hubPort, ev.data);
    };
    port2.start();

    const client = new ProviderClient(port1, {
      appId: 'app',
      providerId: 'p1',
    });
    await client.ready;

    const handle = client.subscribe<{ id: number }>(cfg());
    // MessageChannel delivers attach asynchronously.
    await vi.waitFor(() => {
      expect(controllers.get('default')).toBeTruthy();
    });

    const ctrl = controllers.get('default')!;
    ctrl.emit({ kind: 'data', rows: [{ id: 10 }], replace: true });
    ctrl.emit({ kind: 'status', status: 'ready' });

    const snap = await handle.snapshot;
    expect(snap).toEqual([{ id: 10 }]);

    handle.unsubscribe();
    client.close();
    port2.close();
  });
});
