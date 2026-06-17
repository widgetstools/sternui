/**
 * Lifecycle / leak-regression tests — assert that attach/detach churn
 * does not retain workers, timers, or hub listeners.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProviderConfig } from '@starui/types';
import { SharedWorkerDataServicesClient } from './client/SharedWorkerDataServicesClient.js';
import { FanOutWorkerPool, type WorkerLike } from './worker/FanOutWorkerPool.js';
import { SharedWorkerDataServicesHub, type PortLike } from './worker/SharedWorkerDataServicesHub.js';
import { registerProvider } from './providers/registry.js';
import type { ProviderEmit, ProviderHandle } from './providers/Provider.js';

interface TestController {
  emit: ProviderEmit;
}

const controllers = new Map<string, TestController>();

function cfg(): ProviderConfig {
  return {
    providerType: 'mock',
    keyColumn: 'id',
  } as unknown as ProviderConfig;
}

beforeEach(() => {
  controllers.clear();
  registerProvider('mock' as ProviderConfig['providerType'], (_cfg, emit) => {
    const ctrl: TestController = { emit };
    controllers.set('default', ctrl);
    const handle: ProviderHandle = { stop() {}, restart() {} };
    return handle;
  });
});

function makeRecordingWorker(): {
  worker: WorkerLike;
  terminateCount: number;
} {
  let terminateCount = 0;
  const worker: WorkerLike = {
    postMessage() {},
    terminate() {
      terminateCount += 1;
    },
    addEventListener() {},
    removeEventListener() {},
  };
  return {
    get worker() { return worker; },
    get terminateCount() { return terminateCount; },
  };
}

describe('memory lifecycle — FanOutWorkerPool', () => {
  it('terminates all workers after repeated register/unregister churn', () => {
    const created: ReturnType<typeof makeRecordingWorker>[] = [];
    const pool = new FanOutWorkerPool({
      workerUrl: 'fanout-test.mjs',
      onClientDead: () => {},
      createWorker: () => {
        const rec = makeRecordingWorker();
        created.push(rec);
        return rec.worker;
      },
    });

    const port = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      start: vi.fn(),
      postMessage: vi.fn(),
    } as unknown as MessagePort;

    for (let i = 0; i < 25; i++) {
      const clientId = `client-${i}`;
      pool.registerPending(clientId, port, {
        onMessage: () => {},
        onError: () => {},
      });
      pool.activateSubscriber(`sub-${i}`, clientId);
      pool.unregisterSubscriber(`sub-${i}`);
      pool.unregisterClient(clientId);
    }

    pool.dispose();
    expect(created.every((w) => w.terminateCount >= 1)).toBe(true);
  });
});

describe('memory lifecycle — SharedWorkerDataServicesHub', () => {
  function makePort(): PortLike & { messages: unknown[] } {
    const messages: unknown[] = [];
    return {
      messages,
      postMessage(m: unknown) {
        messages.push(m);
      },
    };
  }

  it('clears data listeners and stops idle providers after detach churn', () => {
    const hub = new SharedWorkerDataServicesHub();
    for (let i = 0; i < 20; i++) {
      const port = makePort();
      const subId = `s${i}`;
      hub.handleRequest(port, {
        kind: 'attach',
        subId,
        providerId: 'p1',
        mode: 'data',
        cfg: cfg(),
      });
      hub.handleRequest(port, { kind: 'detach', subId });
    }

    const intro = hub.buildIntrospectSnapshot();
    expect(intro.providers).toHaveLength(0);
    expect(intro.providers.every((p) => (p.subscribers?.length ?? 0) === 0)).toBe(true);
  });

  it('calls port.dispose on onPortClosed (inline MessagePort path)', () => {
    const hub = new SharedWorkerDataServicesHub();
    const dispose = vi.fn();
    const port: PortLike = {
      postMessage: () => {},
      dispose,
    };
    hub.handleRequest(port, {
      kind: 'attach',
      subId: 's1',
      providerId: 'p1',
      mode: 'data',
      cfg: cfg(),
    });
    hub.onPortClosed(port);
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});

describe('memory lifecycle — SharedWorkerDataServicesClient', () => {
  it('clears heartbeat timers after attachStats/detach churn', () => {
    const posted: unknown[] = [];
    const port = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      start: vi.fn(),
      postMessage: (m: unknown) => posted.push(m),
      close: vi.fn(),
    } as unknown as MessagePort;

    const client = new SharedWorkerDataServicesClient(port, { disablePageHideClose: true });

    for (let i = 0; i < 30; i++) {
      const subId = client.attachStats('p1', { onStats: () => {} });
      client.detach(subId);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const timers = (client as any).heartbeatTimers as Map<string, unknown>;
    expect(timers.size).toBe(0);

    client.close();
    expect(port.close).toHaveBeenCalled();
  });
});
