import { describe, expect, it, vi } from 'vitest';
import {
  createPerspectiveHost,
  installCustomElementsShim,
  type FramePortLike,
  type HostClientLike,
  type HostTableLike,
  type PerspectiveModuleLike,
} from './perspectiveHost.js';

function makePerspective() {
  const tables: { name?: string; index?: string; deleted: boolean }[] = [];
  const sessions: { requests: Uint8Array[]; closed: boolean; respond(bytes: Uint8Array): void }[] =
    [];

  const client: HostClientLike = {
    table: vi.fn(async (_schema, options) => {
      const record = { name: options.name, index: options.index, deleted: false };
      tables.push(record);
      const table: HostTableLike = {
        update: vi.fn(async () => {}),
        delete: vi.fn(async () => {
          record.deleted = true;
        }),
      };
      return table;
    }),
    new_proxy_session: vi.fn((onResponse: (r: Uint8Array) => void) => {
      const session = {
        requests: [] as Uint8Array[],
        closed: false,
        respond: (bytes: Uint8Array) => onResponse(bytes),
        handle_request: vi.fn(async (frame: Uint8Array) => {
          session.requests.push(frame);
        }),
        close: vi.fn(async () => {
          session.closed = true;
        }),
      };
      sessions.push(session);
      return session;
    }),
    // A real engine drops a deleted table from its hosted names.
    get_hosted_table_names: vi.fn(async () =>
      tables.filter((t) => !t.deleted).map((t) => t.name!).filter(Boolean),
    ),
  };

  const module: PerspectiveModuleLike = { worker: vi.fn(async () => client) };
  return { module, client, tables, sessions };
}

function makePort() {
  const sent: unknown[] = [];
  const port: FramePortLike & { sent: unknown[]; started: boolean } = {
    sent,
    started: false,
    onmessage: null,
    postMessage: (message: unknown) => sent.push(message),
    start: () => {
      port.started = true;
    },
  };
  return port;
}

describe('installCustomElementsShim', () => {
  // MEASURED: `worker()` fails in a worker on ONE unguarded line —
  // `customElements.get("perspective-viewer")` in get_client(). Everything
  // past it already falls through to the stored wasm module.
  it('makes the lookup return nothing instead of throwing', () => {
    const scope: Record<string, unknown> = {};
    installCustomElementsShim(scope);
    expect((scope.customElements as { get(n: string): unknown }).get('perspective-viewer')).toBeUndefined();
  });

  it('leaves a real customElements alone, so it is a no-op in a window', () => {
    const real = { get: () => 'real' };
    const scope: Record<string, unknown> = { customElements: real };
    installCustomElementsShim(scope);
    expect(scope.customElements).toBe(real);
  });
});

describe('createPerspectiveHost — tables', () => {
  it('names the hosted table so a window can open it by id', async () => {
    const p = makePerspective();
    const host = createPerspectiveHost({ loadPerspective: async () => p.module });

    await host.tableFactoryFor('positions')({ a: 'string' }, 'id');

    expect(p.tables[0]).toMatchObject({ name: 'positions', index: 'id' });
  });

  it('builds the engine once no matter how many tables and ports are added', async () => {
    const p = makePerspective();
    const host = createPerspectiveHost({ loadPerspective: async () => p.module });

    await host.tableFactoryFor('a')({}, 'id');
    await host.tableFactoryFor('b')({}, 'id');
    await host.attach(makePort());

    expect(p.module.worker).toHaveBeenCalledTimes(1);
  });

  // MEASURED against the real engine: the Table has two plausible owners —
  // the feed that built it and the host that serves it by name — and both
  // called delete() on shutdown. The second throws `null pointer passed to
  // rust` from a wasm microtask, the uncatchable family that can take the
  // whole worker down.
  it('deletes a table only once, however many owners ask', async () => {
    const p = makePerspective();
    const host = createPerspectiveHost({ loadPerspective: async () => p.module });
    const table = await host.tableFactoryFor('positions')({}, 'id');

    await table.delete();
    await table.delete();
    await host.stop();

    expect(p.tables).toHaveLength(1);
    expect(p.tables[0].deleted).toBe(true);
  });

  it('de-registers a table deleted by its other owner, so stop() cannot re-free it', async () => {
    const p = makePerspective();
    const host = createPerspectiveHost({ loadPerspective: async () => p.module });
    const table = await host.tableFactoryFor('positions')({}, 'id');

    await table.delete();
    expect(await host.hostedTableNames()).not.toContain('positions');
  });

  it('replaces a table rebuilt under the same name, so the id keeps working', async () => {
    const p = makePerspective();
    const host = createPerspectiveHost({ loadPerspective: async () => p.module });
    const factory = host.tableFactoryFor('positions');

    await factory({}, 'id');
    await factory({}, 'id'); // a restart

    expect(p.tables).toHaveLength(2);
    expect(p.tables[0].deleted).toBe(true);
    expect(p.tables[1].deleted).toBe(false);
  });
});

describe('createPerspectiveHost — attaching a window', () => {
  it('answers the vendor handshake with exactly one message', async () => {
    const p = makePerspective();
    const host = createPerspectiveHost({ loadPerspective: async () => p.module });
    const port = makePort();
    await host.attach(port);

    // `_init` resolves on the FIRST message it sees, so a second reply — or a
    // reply batched with anything else — desynchronises the client.
    port.onmessage!({ data: { cmd: 'init', id: 7, args: [new ArrayBuffer(4)] } });

    expect(port.sent).toEqual([{ id: 7 }]);
  });

  it('forwards protocol frames into the session', async () => {
    const p = makePerspective();
    const host = createPerspectiveHost({ loadPerspective: async () => p.module });
    const port = makePort();
    await host.attach(port);

    port.onmessage!({ data: new Uint8Array([1, 2, 3]).buffer });
    await new Promise((r) => setTimeout(r, 0));

    expect([...p.sessions[0].requests[0]]).toEqual([1, 2, 3]);
  });

  it('serializes requests so one cannot enter the engine while another decodes', async () => {
    const p = makePerspective();
    const order: string[] = [];
    const host = createPerspectiveHost({ loadPerspective: async () => p.module });
    const port = makePort();
    await host.attach(port);

    p.sessions[0].handle_request = vi.fn(async (frame: Uint8Array) => {
      const id = frame[0];
      if (id === 1) await new Promise((r) => setTimeout(r, 10));
      order.push(`f${id}`);
    });

    port.onmessage!({ data: new Uint8Array([1]).buffer });
    port.onmessage!({ data: new Uint8Array([2]).buffer });
    await new Promise((r) => setTimeout(r, 30));

    expect(order).toEqual(['f1', 'f2']);
  });

  it('copies a response before posting it — wasm buffers detach on memory growth', async () => {
    const p = makePerspective();
    const host = createPerspectiveHost({ loadPerspective: async () => p.module });
    const port = makePort();
    await host.attach(port);

    const owned = new Uint8Array([9, 9]);
    p.sessions[0].respond(owned);

    const posted = port.sent[0] as ArrayBuffer;
    expect(new Uint8Array(posted)).toEqual(new Uint8Array([9, 9]));
    // A view over the engine's heap would alias; this must be a copy.
    expect(posted).not.toBe(owned.buffer);
  });

  it('starts the port, or nothing would ever be delivered', async () => {
    const p = makePerspective();
    const host = createPerspectiveHost({ loadPerspective: async () => p.module });
    const port = makePort();
    await host.attach(port);

    expect(port.started).toBe(true);
  });

  it('gives every window its own session', async () => {
    const p = makePerspective();
    const host = createPerspectiveHost({ loadPerspective: async () => p.module });
    await host.attach(makePort());
    await host.attach(makePort());

    expect(p.sessions).toHaveLength(2);
    expect(host.attachedPorts).toBe(2);
  });

  it('reports a failed request instead of throwing into the port handler', async () => {
    const p = makePerspective();
    const onError = vi.fn();
    const host = createPerspectiveHost({ loadPerspective: async () => p.module, onError });
    const port = makePort();
    await host.attach(port);
    p.sessions[0].handle_request = vi.fn(async () => {
      throw new Error('bad frame');
    });

    port.onmessage!({ data: new Uint8Array([1]).buffer });
    await new Promise((r) => setTimeout(r, 0));

    expect(onError).toHaveBeenCalledWith('request', expect.any(Error));
  });

  it('reports a failed engine boot rather than rejecting attach', async () => {
    const onError = vi.fn();
    const host = createPerspectiveHost({
      loadPerspective: async () => {
        throw new Error('wasm blocked');
      },
      onError,
    });

    await expect(host.attach(makePort())).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledWith('attach', expect.any(Error));
  });
});

describe('createPerspectiveHost — shutdown', () => {
  it('closes sessions and deletes tables', async () => {
    const p = makePerspective();
    const host = createPerspectiveHost({ loadPerspective: async () => p.module });
    await host.tableFactoryFor('positions')({}, 'id');
    await host.attach(makePort());

    await host.stop();

    expect(p.sessions[0].closed).toBe(true);
    expect(p.tables[0].deleted).toBe(true);
    expect(host.attachedPorts).toBe(0);
  });

  it('ignores attach after stop', async () => {
    const p = makePerspective();
    const host = createPerspectiveHost({ loadPerspective: async () => p.module });
    await host.stop();
    await host.attach(makePort());

    expect(p.sessions).toHaveLength(0);
  });
});
