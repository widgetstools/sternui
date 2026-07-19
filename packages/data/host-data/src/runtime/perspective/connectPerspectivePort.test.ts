/**
 * Perspective `init` handshake over a transferred MessagePort.
 *
 * Simulates the engine worker's side of the contract (ack `{id}`, then binary
 * frames) so the handshake is verified without a browser.
 */
import { describe, expect, it, vi } from 'vitest';
import { connectPerspectivePort } from './connectPerspectivePort.js';

/** Stand-in for the engine worker: acks `init`, then echoes binary frames. */
function fakePort(opts: { ack?: boolean } = {}) {
  const ack = opts.ack ?? true;
  const listeners: Array<(ev: MessageEvent) => void> = [];
  const sent: unknown[] = [];
  let closed = false;

  const port = {
    addEventListener: (_t: string, fn: (ev: MessageEvent) => void) => { listeners.push(fn); },
    removeEventListener: (_t: string, fn: (ev: MessageEvent) => void) => {
      const i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    },
    start: vi.fn(),
    close: () => { closed = true; },
    postMessage: (msg: unknown) => {
      sent.push(msg);
      const m = msg as { cmd?: string; id?: string };
      if (ack && m?.cmd === 'init') {
        queueMicrotask(() => emit({ id: m.id }));
      }
    },
  } as unknown as MessagePort;

  const emit = (data: unknown): void => {
    for (const fn of [...listeners]) fn({ data } as MessageEvent);
  };

  return {
    port,
    sent,
    emit,
    get closed() { return closed; },
    get listenerCount() { return listeners.length; },
  };
}

function fakePerspective() {
  const responses: unknown[] = [];
  const initClient = vi.fn(async () => undefined);
  class Client {
    constructor(
      public send_request: (p: Uint8Array) => Promise<void> | void,
      public close?: () => void,
    ) {}
    async handle_response(v: unknown): Promise<void> { responses.push(v); }
    async table(): Promise<never> { throw new Error('unused'); }
    async open_table(): Promise<never> { throw new Error('unused'); }
    async get_hosted_table_names(): Promise<string[]> { return []; }
  }
  return { perspective: { init_client: initClient, Client: Client as never }, responses, initClient };
}

const wasm = new ArrayBuffer(8);

describe('connectPerspectivePort', () => {
  it('sends the init handshake and resolves on ack', async () => {
    const p = fakePort();
    const { perspective, initClient } = fakePerspective();

    const client = await connectPerspectivePort(p.port, {
      perspective,
      clientWasm: {},
      serverWasm: wasm,
    });

    expect(initClient).toHaveBeenCalledTimes(1);
    const init = p.sent[0] as { cmd: string; args: unknown[] };
    expect(init.cmd).toBe('init');
    expect(init.args[0]).toBe(wasm);       // server WASM crosses on init
    expect(client).toBeDefined();
  });

  it('routes post-handshake frames into handle_response, not the ack path', async () => {
    const p = fakePort();
    const { perspective, responses } = fakePerspective();
    await connectPerspectivePort(p.port, { perspective, clientWasm: {}, serverWasm: wasm });

    const frame = new Uint8Array([1, 2, 3]);
    p.emit(frame);
    await Promise.resolve();
    expect(responses).toEqual([frame]);
  });

  it('rejects rather than hanging when the worker never acks', async () => {
    vi.useFakeTimers();
    try {
      const p = fakePort({ ack: false });
      const { perspective } = fakePerspective();
      const promise = connectPerspectivePort(p.port, {
        perspective,
        clientWasm: {},
        serverWasm: wasm,
        timeoutMs: 1000,
      });
      const assertion = expect(promise).rejects.toThrow(
        /did not complete the init handshake within 1000ms/,
      );
      await vi.advanceTimersByTimeAsync(1001);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it('detaches its listener when the handshake times out', async () => {
    vi.useFakeTimers();
    try {
      const p = fakePort({ ack: false });
      const { perspective } = fakePerspective();
      const promise = connectPerspectivePort(p.port, {
        perspective, clientWasm: {}, serverWasm: wasm, timeoutMs: 500,
      });
      const assertion = expect(promise).rejects.toThrow();
      await vi.advanceTimersByTimeAsync(501);
      await assertion;
      expect(p.listenerCount).toBe(0);      // no leaked listener on a dead port
    } finally {
      vi.useRealTimers();
    }
  });

  it('copies request bytes out of the WASM heap before transferring', async () => {
    const p = fakePort();
    const { perspective } = fakePerspective();
    const client = (await connectPerspectivePort(p.port, {
      perspective, clientWasm: {}, serverWasm: wasm,
    })) as unknown as { send_request: (b: Uint8Array) => Promise<void> };

    // A view over a larger buffer, as Perspective hands out.
    const heap = new Uint8Array([9, 9, 1, 2, 3, 9]);
    const view = heap.subarray(2, 5);
    await client.send_request(view);

    const outgoing = p.sent[1] as ArrayBuffer;
    expect(outgoing.byteLength).toBe(3);    // sliced, not the whole heap
    expect([...new Uint8Array(outgoing)]).toEqual([1, 2, 3]);
  });

  it('throws a clear error when no Client constructor is available', async () => {
    const p = fakePort();
    await expect(
      connectPerspectivePort(p.port, {
        perspective: { init_client: async () => undefined },
        clientWasm: {},
        serverWasm: wasm,
      }),
    ).rejects.toThrow(/Client constructor unavailable/);
  });
});
