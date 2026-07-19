/**
 * Provider-worker attach handler.
 *
 * The property that matters: every window attempts the hand-off, so exactly
 * ONE link must survive. N links against one table would multiply every write
 * by N — the failure this dedupe exists to prevent.
 */
import { describe, expect, it, vi } from 'vitest';
import { PerspectiveAttachHandler, type AttachClient } from './PerspectiveAttachHandler.js';
import type { PerspectiveAttachAck } from './perspectiveWorkerLink.js';
import type { BridgeTable } from './ProviderTableBridge.js';

function fakePort(): MessagePort & { closed: boolean } {
  const p = { closed: false, close: () => { p.closed = true; } };
  return p as unknown as MessagePort & { closed: boolean };
}

function fakeClient(hosted: string[] = []) {
  const table: BridgeTable = {
    update: vi.fn(async () => undefined),
    replace: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
  };
  const client: AttachClient = {
    table: vi.fn(async () => table),
    open_table: vi.fn(async () => table),
    get_hosted_table_names: vi.fn(async () => hosted),
  };
  return { client, table };
}

const req = (over: Record<string, unknown> = {}) => ({
  kind: 'psp-attach' as const,
  appId: 'Star-Demo',
  providerId: 'dp-1',
  dataset: 'main',
  keyColumn: 'positionId',
  schema: { positionId: 'string', px: 'float' },
  ...over,
});

describe('PerspectiveAttachHandler', () => {
  it('links on first attach and exposes a bridge', async () => {
    const { client } = fakeClient();
    const acks: PerspectiveAttachAck[] = [];
    const h = new PerspectiveAttachHandler({ connect: async () => client });

    const handled = h.handleMessage(req(), [fakePort()], (a) => acks.push(a));
    expect(handled).toBe(true);
    await vi.waitFor(() => expect(acks).toHaveLength(1));

    expect(acks[0]).toMatchObject({ providerId: 'dp-1', linked: true });
    expect(h.isLinked('dp-1')).toBe(true);
    expect(h.bridgeFor('dp-1')).toBeDefined();
  });

  it('creates the table from the request schema with the key column as index', async () => {
    const { client } = fakeClient([]);
    const h = new PerspectiveAttachHandler({ connect: async () => client });
    h.handleMessage(req(), [fakePort()], () => undefined);
    await vi.waitFor(() => expect(h.isLinked('dp-1')).toBe(true));
    expect(client.table).toHaveBeenCalledWith(
      { positionId: 'string', px: 'float' },
      { index: 'positionId', name: 'main' },
    );
  });

  it('injects the key column when the schema lacks it', async () => {
    const { client } = fakeClient([]);
    const h = new PerspectiveAttachHandler({ connect: async () => client });
    h.handleMessage(req({ schema: { px: 'float' } }), [fakePort()], () => undefined);
    await vi.waitFor(() => expect(h.isLinked('dp-1')).toBe(true));
    expect(client.table).toHaveBeenCalledWith(
      { px: 'float', positionId: 'string' },
      { index: 'positionId', name: 'main' },
    );
  });

  it('falls back to an async schemaFor when the request carries no schema', async () => {
    const { client } = fakeClient([]);
    const h = new PerspectiveAttachHandler({
      connect: async () => client,
      schemaFor: async () => ({ positionId: 'string', qty: 'float' }),
    });
    h.handleMessage(req({ schema: undefined }), [fakePort()], () => undefined);
    await vi.waitFor(() => expect(h.isLinked('dp-1')).toBe(true));
    expect(client.table).toHaveBeenCalledWith(
      { positionId: 'string', qty: 'float' },
      { index: 'positionId', name: 'main' },
    );
  });

  it('acks an error when no schema is available for a new table', async () => {
    const { client } = fakeClient([]);
    const acks: PerspectiveAttachAck[] = [];
    const h = new PerspectiveAttachHandler({ connect: async () => client });
    h.handleMessage(req({ schema: undefined }), [fakePort()], (a) => acks.push(a));
    await vi.waitFor(() => expect(acks).toHaveLength(1));
    expect(acks[0]).toMatchObject({ linked: false });
    expect(acks[0]?.error).toMatch(/no schema available/);
    expect(h.isLinked('dp-1')).toBe(false);
  });

  it('opens an existing table instead of recreating it', async () => {
    const { client } = fakeClient(['main']);
    const h = new PerspectiveAttachHandler({ connect: async () => client });
    h.handleMessage(req(), [fakePort()], () => undefined);
    await vi.waitFor(() => expect(h.isLinked('dp-1')).toBe(true));
    expect(client.open_table).toHaveBeenCalledWith('main');
    expect(client.table).not.toHaveBeenCalled();
  });

  it('links ONCE when several windows race the same provider', async () => {
    const { client } = fakeClient();
    const connect = vi.fn(async () => client);
    const acks: PerspectiveAttachAck[] = [];
    const h = new PerspectiveAttachHandler({ connect });

    const ports = [fakePort(), fakePort(), fakePort()];
    for (const p of ports) h.handleMessage(req(), [p], (a) => acks.push(a));
    await vi.waitFor(() => expect(acks).toHaveLength(3));

    // One client, one bridge — not three writers against one table.
    expect(connect).toHaveBeenCalledTimes(1);
    expect(acks.filter((a) => a.linked)).toHaveLength(1);
    expect(acks.filter((a) => !a.linked)).toHaveLength(2);
    // Late windows' ports are closed rather than leaked.
    expect(ports.filter((p) => p.closed)).toHaveLength(2);
  });

  it('keeps distinct providers on distinct links', async () => {
    const { client } = fakeClient();
    const h = new PerspectiveAttachHandler({ connect: async () => client });
    h.handleMessage(req(), [fakePort()], () => undefined);
    h.handleMessage(req({ providerId: 'dp-2', dataset: 'other' }), [fakePort()], () => undefined);
    await vi.waitFor(() => {
      expect(h.isLinked('dp-1')).toBe(true);
      expect(h.isLinked('dp-2')).toBe(true);
    });
    expect(h.bridgeFor('dp-1')).not.toBe(h.bridgeFor('dp-2'));
  });

  it('acks with an error and closes the port when connect fails', async () => {
    const acks: PerspectiveAttachAck[] = [];
    const errors: unknown[] = [];
    const h = new PerspectiveAttachHandler({
      connect: async () => { throw new Error('wasm blocked'); },
      onError: (e) => errors.push(e),
    });
    const port = fakePort();
    h.handleMessage(req(), [port], (a) => acks.push(a));
    await vi.waitFor(() => expect(acks).toHaveLength(1));

    expect(acks[0]).toMatchObject({ linked: false, error: 'wasm blocked' });
    expect(h.isLinked('dp-1')).toBe(false);
    expect(port.closed).toBe(true);
    expect(errors).toHaveLength(1);
  });

  it('allows a retry after a failed attach', async () => {
    const { client } = fakeClient();
    let attempt = 0;
    const h = new PerspectiveAttachHandler({
      connect: async () => {
        attempt += 1;
        if (attempt === 1) throw new Error('transient');
        return client;
      },
    });
    const acks: PerspectiveAttachAck[] = [];
    h.handleMessage(req(), [fakePort()], (a) => acks.push(a));
    await vi.waitFor(() => expect(acks).toHaveLength(1));
    expect(acks[0]?.linked).toBe(false);

    h.handleMessage(req(), [fakePort()], (a) => acks.push(a));
    await vi.waitFor(() => expect(acks).toHaveLength(2));
    expect(acks[1]?.linked).toBe(true);
  });

  it('rejects an attach that carried no port', async () => {
    const { client } = fakeClient();
    const acks: PerspectiveAttachAck[] = [];
    const h = new PerspectiveAttachHandler({ connect: async () => client });
    h.handleMessage(req(), [], (a) => acks.push(a));
    await vi.waitFor(() => expect(acks).toHaveLength(1));
    expect(acks[0]).toMatchObject({ linked: false, error: /no MessagePort/ as never });
    expect(h.isLinked('dp-1')).toBe(false);
  });

  it('ignores messages that are not attach requests', () => {
    const { client } = fakeClient();
    const h = new PerspectiveAttachHandler({ connect: async () => client });
    expect(h.handleMessage({ kind: 'attach', subId: 's1' }, [], () => undefined)).toBe(false);
    expect(h.handleMessage(null, [], () => undefined)).toBe(false);
  });

  it('fires onLinked with the new bridge before acking (seed window)', async () => {
    const { client, table } = fakeClient();
    const events: string[] = [];
    const h = new PerspectiveAttachHandler({
      connect: async () => client,
      onLinked: (providerId, bridge) => {
        events.push(`linked:${providerId}`);
        void bridge.snapshot([{ positionId: 'x' }]);
      },
    });

    h.handleMessage(req(), [fakePort()], () => events.push('ack'));
    await vi.waitFor(() => expect(events).toContain('ack'));

    expect(events[0]).toBe('linked:dp-1');
    expect(table.replace).toHaveBeenCalledWith([{ positionId: 'x' }]);
  });

  it('release() drops one link and dispose() drops all', async () => {
    const { client } = fakeClient();
    const h = new PerspectiveAttachHandler({ connect: async () => client });
    h.handleMessage(req(), [fakePort()], () => undefined);
    h.handleMessage(req({ providerId: 'dp-2' }), [fakePort()], () => undefined);
    await vi.waitFor(() => expect(h.isLinked('dp-2')).toBe(true));

    h.release('dp-1');
    expect(h.isLinked('dp-1')).toBe(false);
    expect(h.isLinked('dp-2')).toBe(true);

    h.dispose();
    expect(h.isLinked('dp-2')).toBe(false);
  });
});
