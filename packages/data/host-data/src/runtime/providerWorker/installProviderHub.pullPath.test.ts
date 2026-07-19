/**
 * Pull-path wiring through the provider worker (worklog T3):
 *
 *  - `psp-attach` messages route to the PerspectiveAttachHandler, not the
 *    hub protocol;
 *  - on link, the table is seeded from the hub's row cache;
 *  - subsequent provider frames tee into the bridge (replace → snapshot,
 *    live → conflated update) with no window in the data path.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProviderConfig } from '@wellsfargo-starui/types';
import { installProviderHub } from './installProviderHub.js';
import { registerProvider } from '../providers/registry.js';
import type { ProviderEmit, ProviderHandle } from '../providers/Provider.js';
import type { AttachClient } from '../perspective/PerspectiveAttachHandler.js';
import type { BridgeTable } from '../perspective/ProviderTableBridge.js';
import { SharedWorkerDataServicesHub } from '../worker/SharedWorkerDataServicesHub.js';
import type { ProviderPullSink } from '../worker/hubTypes.js';

// ─── Fakes ───────────────────────────────────────────────────────────

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

/** Worker-side view of a connected window port. */
function fakeWorkerPort() {
  const listeners = new Map<string, Set<(ev: { data: unknown; ports: readonly MessagePort[] }) => void>>();
  const sent: unknown[] = [];
  return {
    sent,
    addEventListener(type: string, fn: (ev: never) => void) {
      let set = listeners.get(type);
      if (!set) {
        set = new Set();
        listeners.set(type, set);
      }
      set.add(fn as never);
    },
    removeEventListener(type: string, fn: (ev: never) => void) {
      listeners.get(type)?.delete(fn as never);
    },
    start() {},
    postMessage(m: unknown) {
      sent.push(m);
    },
    /** Simulate an inbound window message (optionally carrying ports). */
    deliver(data: unknown, ports: readonly MessagePort[] = []) {
      for (const fn of listeners.get('message') ?? []) fn({ data, ports });
    },
  };
}

const transferredPort = () =>
  ({ close: vi.fn() }) as unknown as MessagePort;

// ─── Mock transport ──────────────────────────────────────────────────

let emitters: ProviderEmit[] = [];

beforeEach(() => {
  emitters = [];
  registerProvider('mock' as ProviderConfig['providerType'], (_cfg, emit) => {
    emitters.push(emit);
    const handle: ProviderHandle = { stop() {}, restart() {} };
    return handle;
  });
});

const mockCfg = (): ProviderConfig =>
  ({ providerType: 'mock', keyColumn: 'id' }) as unknown as ProviderConfig;

const pspAttach = () => ({
  kind: 'psp-attach',
  appId: 'Star-Demo',
  providerId: 'p1',
  dataset: 'main',
  keyColumn: 'id',
});

// ─── Hub tee (unit) ──────────────────────────────────────────────────

describe('SharedWorkerDataServicesHub pullSinkFor tee', () => {
  it('routes replace frames to snapshot and live frames to push once linked', () => {
    const sink: ProviderPullSink = {
      snapshot: vi.fn(async () => undefined),
      push: vi.fn(),
    };
    let linked = false;
    const hub = new SharedWorkerDataServicesHub({
      pullSinkFor: () => (linked ? sink : undefined),
    });
    hub.handleRequest(
      { postMessage: () => undefined },
      { kind: 'attach', subId: 's1', providerId: 'p1', mode: 'data', cfg: mockCfg() },
    );
    const emit = emitters[0]!;

    // Unlinked: frames only reach the cache.
    emit({ rows: [{ id: '1', px: 1 }], replace: true });
    expect(sink.snapshot).not.toHaveBeenCalled();
    expect(hub.getCachedRows('p1')).toEqual([{ id: '1', px: 1 }]);

    linked = true;
    emit({ rows: [{ id: '2', px: 2 }], replace: true });
    expect(sink.snapshot).toHaveBeenCalledWith([{ id: '2', px: 2 }]);

    emit({ rows: [{ id: '2', px: 3 }] });
    expect(sink.push).toHaveBeenCalledWith([{ id: '2', px: 3 }]);
  });
});

// ─── installProviderHub (end-to-end inside the worker) ───────────────

describe('installProviderHub pull path', () => {
  it('routes psp-attach, seeds the table from the cache, tees live frames', async () => {
    const { client, table } = fakeClient([]);
    const selfRef: { onconnect: ((ev: { ports: readonly MessagePort[] }) => void) | null } = {
      onconnect: null,
    };

    const installed = await installProviderHub({
      providerId: 'p1',
      selfRef,
      perspectiveConnect: async () => client,
      perspectiveFlushMs: 1,
    });
    expect(installed.perspectiveAttach).not.toBeNull();

    const port = fakeWorkerPort();
    selfRef.onconnect!({ ports: [port as unknown as MessagePort] });

    // Start the provider and give the hub a cached book (pre-link rows).
    port.deliver({ kind: 'attach', subId: 's1', providerId: 'p1', mode: 'data', cfg: mockCfg() });
    const emit = emitters[0]!;
    emit({ rows: [{ id: '1', px: 10 }], replace: true });

    // Window performs the hand-off.
    port.deliver(pspAttach(), [transferredPort()]);
    await vi.waitFor(() =>
      expect(port.sent).toContainEqual(
        expect.objectContaining({ kind: 'psp-attach-ok', providerId: 'p1', linked: true }),
      ),
    );

    // Table created with a row-inferred schema, key column as index, and
    // seeded from the cache.
    expect(client.table).toHaveBeenCalledWith(
      { id: 'string', px: 'float' },
      expect.objectContaining({ index: 'id', name: 'main' }),
    );
    await vi.waitFor(() =>
      expect(table.replace).toHaveBeenCalledWith([{ id: '1', px: 10 }]),
    );

    // Live frames now tee into the bridge and flush into the table —
    // no window in the data path.
    emit({ rows: [{ id: '2', px: 20 }] });
    await vi.waitFor(() =>
      expect(table.update).toHaveBeenCalledWith([{ id: '2', px: 20 }]),
    );

    // A second window's hand-off is deduped, not re-linked.
    port.deliver(pspAttach(), [transferredPort()]);
    await vi.waitFor(() =>
      expect(port.sent).toContainEqual(
        expect.objectContaining({ kind: 'psp-attach-ok', providerId: 'p1', linked: false }),
      ),
    );

    await installed.stop();
  });

  it('leaves hub protocol untouched when no perspectiveConnect is given', async () => {
    const selfRef: { onconnect: ((ev: { ports: readonly MessagePort[] }) => void) | null } = {
      onconnect: null,
    };
    const installed = await installProviderHub({ providerId: 'p1', selfRef });
    expect(installed.perspectiveAttach).toBeNull();

    const port = fakeWorkerPort();
    selfRef.onconnect!({ ports: [port as unknown as MessagePort] });
    // A psp-attach with no handler installed is ignored (not an ack, not a crash).
    port.deliver(pspAttach(), [transferredPort()]);
    expect(port.sent).toHaveLength(0);

    await installed.stop();
  });
});
