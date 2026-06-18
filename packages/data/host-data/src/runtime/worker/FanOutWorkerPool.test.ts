import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FanOutWorkerPool,
  FANOUT_BROADCAST_TIMEOUT_MS,
  type WorkerLike,
} from './FanOutWorkerPool.js';
import type { FanOutHubToWorker, FanOutWorkerToHub } from './fanOutProtocol.js';

function createMockPort(): MessagePort {
  return {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    start: vi.fn(),
    postMessage: vi.fn(),
    close: vi.fn(),
    dispatchEvent: vi.fn(),
    onmessage: null,
    onmessageerror: null,
  } as unknown as MessagePort;
}

function createRecordingWorker(
  onToHub?: (msg: FanOutWorkerToHub) => void,
  opts?: { respondToBroadcast?: boolean },
): {
  worker: WorkerLike;
  posted: FanOutHubToWorker[];
  errorListeners: Set<() => void>;
  fireError: () => void;
} {
  const posted: FanOutHubToWorker[] = [];
  const messageListeners = new Set<(ev: MessageEvent) => void>();
  const errorListeners = new Set<() => void>();
  const respond = opts?.respondToBroadcast ?? true;
  const worker: WorkerLike = {
    postMessage(message: unknown) {
      const data = message as FanOutHubToWorker | { type: 'init' };
      posted.push(data as FanOutHubToWorker);
      if (data.type === 'broadcast' && onToHub && respond) {
        const event = data.event as Record<string, unknown>;
        onToHub({
          type: 'deliver',
          jobId: data.jobId,
          clientId: data.clientId,
          subId: data.subId,
          message: { ...event, subId: data.subId },
        });
        onToHub({ type: 'broadcast-done', jobId: data.jobId, deadSubIds: [] });
      }
    },
    terminate() {
      messageListeners.clear();
      errorListeners.clear();
    },
    addEventListener(type, listener) {
      if (type === 'message') messageListeners.add(listener as (ev: MessageEvent) => void);
      else errorListeners.add(listener as () => void);
    },
    removeEventListener(type, listener) {
      if (type === 'message') messageListeners.delete(listener as (ev: MessageEvent) => void);
      else errorListeners.delete(listener as () => void);
    },
  };
  return {
    worker,
    posted,
    errorListeners,
    fireError: () => {
      for (const listener of errorListeners) listener();
    },
  };
}

describe('FanOutWorkerPool', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not spawn a worker until activateSubscriber', () => {
    let created = 0;
    const pool = new FanOutWorkerPool({
      workerUrl: 'test-worker.mjs',
      createWorker: () => {
        created += 1;
        return createRecordingWorker().worker;
      },
      onClientDead: vi.fn(),
    });

    const noop = vi.fn();
    pool.registerPending('client-1', createMockPort(), { onMessage: noop, onError: noop });
    expect(created).toBe(0);

    pool.activateSubscriber('sub-1', 'client-1');
    expect(created).toBe(1);

    pool.dispose();
  });

  it('spawns one dedicated worker per subId', () => {
    let created = 0;
    const pool = new FanOutWorkerPool({
      workerUrl: 'test-worker.mjs',
      createWorker: () => {
        created += 1;
        return createRecordingWorker().worker;
      },
      onClientDead: vi.fn(),
    });

    const noop = vi.fn();
    pool.registerPending('client-1', createMockPort(), { onMessage: noop, onError: noop });
    pool.activateSubscriber('sub-1', 'client-1');
    pool.activateSubscriber('sub-2', 'client-1');
    expect(created).toBe(2);

    pool.unregisterSubscriber('sub-1');
    pool.activateSubscriber('sub-3', 'client-1');
    expect(created).toBe(3);

    pool.dispose();
  });

  it('recycles a worker when the same subId binds to a different client', () => {
    let created = 0;
    const pool = new FanOutWorkerPool({
      workerUrl: 'test-worker.mjs',
      createWorker: () => {
        created += 1;
        return createRecordingWorker().worker;
      },
      onClientDead: vi.fn(),
    });

    const noop = vi.fn();
    pool.registerPending('client-a', createMockPort(), { onMessage: noop, onError: noop });
    pool.registerPending('client-b', createMockPort(), { onMessage: noop, onError: noop });
    pool.activateSubscriber('sub-1', 'client-a');
    expect(created).toBe(1);

    pool.activateSubscriber('sub-1', 'client-b');
    expect(created).toBe(2);
    expect(pool.isActive('sub-1')).toBe(true);

    pool.dispose();
  });

  it('delivers unicast directly via hub-held port', () => {
    const pool = new FanOutWorkerPool({
      workerUrl: 'test-worker.mjs',
      createWorker: () => createRecordingWorker().worker,
      onClientDead: vi.fn(),
    });

    const port = createMockPort();
    const proxy = pool.createPortProxy('client-1');
    pool.registerPending('client-1', port, { onMessage: vi.fn(), onError: vi.fn() });
    pool.activateSubscriber('sub-1', 'client-1');

    proxy.postMessage({ kind: 'status', status: 'ready', subId: 'sub-1' });
    expect(port.postMessage).toHaveBeenCalledWith({
      kind: 'status',
      status: 'ready',
      subId: 'sub-1',
    });

    pool.dispose();
  });

  it('sends one broadcast job per subId worker', async () => {
    const postedByWorker: FanOutHubToWorker[][] = [];
    const listeners: Array<Set<(ev: MessageEvent) => void>> = [];

    const pool = new FanOutWorkerPool({
      workerUrl: 'test-worker.mjs',
      createWorker: () => {
        const rec = createRecordingWorker((msg) => {
          for (const listener of listeners.at(-1) ?? []) {
            listener({ data: msg } as MessageEvent);
          }
        });
        postedByWorker.push(rec.posted);
        listeners.push(new Set());
        const idx = listeners.length - 1;
        const origAdd = rec.worker.addEventListener;
        rec.worker.addEventListener = (type, l) => {
          if (type === 'message') listeners[idx].add(l as (ev: MessageEvent) => void);
          else origAdd(type, l);
        };
        return rec.worker;
      },
      onClientDead: vi.fn(),
    });

    const port = createMockPort();
    const noop = vi.fn();
    pool.registerPending('client-1', port, { onMessage: noop, onError: noop });
    for (const subId of ['sub-0', 'sub-1', 'sub-2']) {
      pool.activateSubscriber(subId, 'client-1');
    }

    const dead = await pool.broadcast(
      [
        { clientId: 'client-1', subId: 'sub-0' },
        { clientId: 'client-1', subId: 'sub-1' },
        { clientId: 'client-1', subId: 'sub-2' },
      ],
      { kind: 'delta', rows: [{ id: 1 }], replace: false, subId: '' },
    );

    expect(dead).toEqual([]);
    const broadcasts = postedByWorker.flat().filter(
      (m): m is Extract<FanOutHubToWorker, { type: 'broadcast' }> => m.type === 'broadcast',
    );
    expect(broadcasts).toHaveLength(3);
    expect(port.postMessage).toHaveBeenCalledTimes(3);

    pool.dispose();
  });

  it('resolves timed-out jobs with dead subId instead of rejecting', async () => {
    vi.useFakeTimers();
    const pool = new FanOutWorkerPool({
      workerUrl: 'test-worker.mjs',
      createWorker: () => createRecordingWorker(undefined, { respondToBroadcast: false }).worker,
      onClientDead: vi.fn(),
    });

    const port = createMockPort();
    pool.registerPending('client-1', port, { onMessage: vi.fn(), onError: vi.fn() });
    pool.activateSubscriber('sub-hung', 'client-1');

    const deadPromise = pool.broadcast(
      [{ clientId: 'client-1', subId: 'sub-hung' }],
      { kind: 'delta', rows: [{ id: 1 }], replace: false, subId: '' },
    );
    vi.advanceTimersByTime(FANOUT_BROADCAST_TIMEOUT_MS);

    await expect(deadPromise).resolves.toEqual(['sub-hung']);
    expect(port.postMessage).not.toHaveBeenCalled();
    pool.dispose();
  });

  it('delivers successful jobs when a sibling job times out', async () => {
    vi.useFakeTimers();
    let workerIndex = 0;
    const hubListeners: Array<Set<(ev: MessageEvent) => void>> = [];

    const pool = new FanOutWorkerPool({
      workerUrl: 'test-worker.mjs',
      createWorker: () => {
        const idx = workerIndex++;
        const respond = idx === 0;
        const rec = createRecordingWorker((msg) => {
          for (const listener of hubListeners[idx] ?? []) {
            listener({ data: msg } as MessageEvent);
          }
        }, { respondToBroadcast: respond });
        hubListeners[idx] = new Set();
        const origAdd = rec.worker.addEventListener;
        rec.worker.addEventListener = (type, l) => {
          if (type === 'message') hubListeners[idx].add(l as (ev: MessageEvent) => void);
          else origAdd(type, l);
        };
        return rec.worker;
      },
      onClientDead: vi.fn(),
    });

    const port = createMockPort();
    pool.registerPending('client-1', port, { onMessage: vi.fn(), onError: vi.fn() });
    pool.activateSubscriber('sub-ok', 'client-1');
    pool.activateSubscriber('sub-hung', 'client-1');

    const deadPromise = pool.broadcast(
      [
        { clientId: 'client-1', subId: 'sub-ok' },
        { clientId: 'client-1', subId: 'sub-hung' },
      ],
      { kind: 'delta', rows: [{ id: 1 }], replace: false, subId: '' },
    );
    vi.advanceTimersByTime(FANOUT_BROADCAST_TIMEOUT_MS);

    const dead = await deadPromise;
    expect(dead).toEqual(['sub-hung']);
    expect(port.postMessage).toHaveBeenCalledTimes(1);
    pool.dispose();
  });

  it('drops worker on script error and fails in-flight jobs', async () => {
    const rec = createRecordingWorker(undefined, { respondToBroadcast: false });
    const pool = new FanOutWorkerPool({
      workerUrl: 'test-worker.mjs',
      createWorker: () => rec.worker,
      onClientDead: vi.fn(),
    });

    pool.registerPending('client-1', createMockPort(), { onMessage: vi.fn(), onError: vi.fn() });
    pool.activateSubscriber('sub-1', 'client-1');
    expect(pool.isActive('sub-1')).toBe(true);

    const deadPromise = pool.broadcast(
      [{ clientId: 'client-1', subId: 'sub-1' }],
      { kind: 'delta', rows: [{ id: 1 }], replace: false, subId: '' },
    );
    rec.fireError();

    await expect(deadPromise).resolves.toEqual(['sub-1']);
    expect(pool.isActive('sub-1')).toBe(false);
    pool.dispose();
  });

  it('removes worker on unregisterSubscriber', () => {
    const terminate = vi.fn();
    const pool = new FanOutWorkerPool({
      workerUrl: 'test-worker.mjs',
      createWorker: () => {
        const rec = createRecordingWorker();
        rec.worker.terminate = terminate;
        return rec.worker;
      },
      onClientDead: vi.fn(),
    });

    pool.registerPending('client-1', createMockPort(), { onMessage: vi.fn(), onError: vi.fn() });
    pool.activateSubscriber('sub-1', 'client-1');
    expect(pool.isActive('sub-1')).toBe(true);

    pool.unregisterSubscriber('sub-1');
    expect(pool.isActive('sub-1')).toBe(false);
    expect(terminate).toHaveBeenCalledTimes(1);
  });
});
