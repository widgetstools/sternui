import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockHubState, MockSharedWorkerDataServicesHub } = vi.hoisted(() => {
  const state = {
    hubInstance: null as any,
    hydrationGate: null as null | Promise<void>,
  };

  class MockHub {
    constructor() {
      state.hubInstance = this;
      this.handleRequest = vi.fn();
      this.handleAppDataRequest = vi.fn();
      this.onPortClosed = vi.fn();
      this.dispose = vi.fn();
    }

    async hydrateCatalog(): Promise<void> {
      if (!state.hydrationGate) return;
      await state.hydrationGate;
    }

    async hydrateAppData(): Promise<void> {
      if (!state.hydrationGate) return;
      await state.hydrationGate;
    }
  }

  return { mockHubState: state, MockSharedWorkerDataServicesHub: MockHub };
});

vi.mock('./SharedWorkerDataServicesHub.js', () => ({
  SharedWorkerDataServicesHub: MockSharedWorkerDataServicesHub,
}));

import { installSharedWorkerHub } from './entry.js';

function createFakePort() {
  const listeners = new Map<string, Array<(ev: MessageEvent) => void>>();
  return {
    addEventListener(type: string, listener: (ev: MessageEvent) => void) {
      const bucket = listeners.get(type) ?? [];
      bucket.push(listener);
      listeners.set(type, bucket);
    },
    removeEventListener(type: string, listener: (ev: MessageEvent) => void) {
      const bucket = listeners.get(type) ?? [];
      listeners.set(type, bucket.filter((entry) => entry !== listener));
    },
    start() {
      // no-op for tests
    },
    postMessage(message: unknown) {
      void message;
    },
    dispatchMessage(message: unknown) {
      for (const listener of listeners.get('message') ?? []) {
        listener({ data: message } as MessageEvent);
      }
    },
  } as unknown as MessagePort;
}

describe('installSharedWorkerHub', () => {
  beforeEach(() => {
    mockHubState.hubInstance = null;
    mockHubState.hydrationGate = null;
  });

  it('attaches an incoming port before hydration has finished', async () => {
    let resolveHydration!: () => void;
    mockHubState.hydrationGate = new Promise<void>((resolve) => {
      resolveHydration = resolve;
    });

    const selfRef = { onconnect: null as ((ev: { ports: readonly MessagePort[] }) => void) | null };
    const port = createFakePort();

    const installPromise = installSharedWorkerHub({
      selfRef: selfRef as unknown as WorkerGlobalScope,
      fanOutPool: null as any,
    } as any);

    selfRef.onconnect?.({ ports: [port] } as any);
    port.dispatchMessage({ kind: 'attach', subId: 's1', providerId: 'p1', mode: 'data' });

    expect(mockHubState.hubInstance?.handleRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ kind: 'attach' }),
    );

    resolveHydration();
    await installPromise;
  });
});
