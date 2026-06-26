/**
 * SSRM hub paths — `query` RPC, `control` attach mode, and post-ready
 * realtime forwarding (`ssrm-txn`). Uses a self-contained mock provider
 * whose `emit` the test drives directly.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { SharedWorkerDataServicesHub, type PortLike } from './SharedWorkerDataServicesHub';
import { registerProvider } from '../providers/registry';
import type { ProviderEmit, ProviderHandle } from '../providers/Provider';
import type { ProviderConfig } from '@starui/types';

interface CapturedPort extends PortLike {
  messages: Array<Record<string, unknown>>;
}

function makePort(): CapturedPort {
  const messages: Array<Record<string, unknown>> = [];
  return {
    messages,
    postMessage(m: unknown) {
      messages.push({ ...(m as Record<string, unknown>) });
    },
  };
}

let emitFn: ProviderEmit | null = null;

beforeEach(() => {
  emitFn = null;
  registerProvider('mock' as ProviderConfig['providerType'], (_cfg, emit) => {
    emitFn = emit;
    const handle: ProviderHandle = { stop() {}, restart() {} };
    return handle;
  });
});

const cfg = (): ProviderConfig =>
  ({ providerType: 'mock', keyColumn: 'id' } as unknown as ProviderConfig);

const attachControl = (hub: SharedWorkerDataServicesHub, port: PortLike, subId = 'c1') =>
  hub.handleRequest(port, { kind: 'attach', subId, providerId: 'p1', mode: 'control', cfg: cfg() });

describe('SharedWorkerDataServicesHub — SSRM control mode', () => {
  it('delivers status but never a row delta to a control subscriber', () => {
    const hub = new SharedWorkerDataServicesHub();
    const port = makePort();
    attachControl(hub, port);

    // Initial status is posted on attach.
    expect(port.messages.some((m) => m.kind === 'status')).toBe(true);

    // The snapshot (replace) fills the cache but is NOT pushed to control.
    emitFn!({ rows: [{ id: 1, v: 'a' }], replace: true });
    expect(port.messages.some((m) => m.kind === 'delta' || m.kind === 'delta-bin')).toBe(false);
  });

  it('forwards post-ready live ticks as ssrm-txn, not the snapshot', () => {
    const hub = new SharedWorkerDataServicesHub();
    const port = makePort();
    attachControl(hub, port);

    emitFn!({ rows: [{ id: 1, v: 'a' }], replace: true }); // snapshot
    expect(port.messages.some((m) => m.kind === 'ssrm-txn')).toBe(false);

    emitFn!({ status: 'ready' });
    emitFn!({ rows: [{ id: 1, v: 'b' }], replace: false }); // live tick

    const txn = port.messages.find((m) => m.kind === 'ssrm-txn');
    expect(txn).toBeDefined();
    expect(txn!.rows).toEqual([{ id: 1, v: 'b' }]);
  });

  it('keeps the provider alive while only a control subscriber is attached', () => {
    const hub = new SharedWorkerDataServicesHub();
    const port = makePort();
    attachControl(hub, port);
    emitFn!({ rows: [{ id: 1 }], replace: true });

    // A query still resolves against the populated cache.
    hub.handleRequest(port, {
      kind: 'query', reqId: 'q', providerId: 'p1', request: {},
    });
    const result = port.messages.find((m) => m.kind === 'query-result');
    expect(result?.ok).toBe(true);
    expect(result?.lastRow).toBe(1);
  });
});

describe('SharedWorkerDataServicesHub — query RPC', () => {
  it('filters, sorts and slices the provider cache off the request', () => {
    const hub = new SharedWorkerDataServicesHub();
    const port = makePort();
    attachControl(hub, port);
    emitFn!({
      rows: [
        { id: 1, v: 3, side: 'BUY' },
        { id: 2, v: 1, side: 'SELL' },
        { id: 3, v: 2, side: 'BUY' },
      ],
      replace: true,
    });

    hub.handleRequest(port, {
      kind: 'query',
      reqId: 'q1',
      providerId: 'p1',
      request: {
        filterModel: { side: { filterType: 'set', values: ['BUY'] } },
        sortModel: [{ colId: 'v', sort: 'asc' }],
        startRow: 0,
        endRow: 10,
      },
    });

    const result = port.messages.find((m) => m.kind === 'query-result');
    expect(result?.ok).toBe(true);
    expect((result?.rows as Array<{ id: number }>).map((r) => r.id)).toEqual([3, 1]);
    expect(result?.lastRow).toBe(2); // two BUY rows
  });

  it('returns an empty block (not an error) when the provider has no cache', () => {
    const hub = new SharedWorkerDataServicesHub();
    const port = makePort();
    hub.handleRequest(port, { kind: 'query', reqId: 'q', providerId: 'missing', request: {} });
    const result = port.messages.find((m) => m.kind === 'query-result');
    expect(result?.ok).toBe(true);
    expect(result?.rows).toEqual([]);
    expect(result?.lastRow).toBe(0);
  });
});
