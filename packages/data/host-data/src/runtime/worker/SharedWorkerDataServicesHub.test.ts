/**
 * SharedWorkerDataServicesHub tests — focus on the invariants that v1 trial-and-error
 * uncovered:
 *
 *   1. **Late-joiner correctness.** A subscriber attaching after the
 *      provider has already started gets the full cache as one
 *      `delta { replace: true }` event, plus the current status.
 *
 *   2. **Idle auto-teardown.** When the last subscriber detaches (or
 *      misses heartbeats), the provider stops upstream. Re-attach
 *      cold-starts and rebuilds cache.
 *
 *   3. **Restart via attach.extra.** Passing `extra` on attach to a
 *      running provider triggers `provider.restart(extra)`.
 *
 *   4. **Stats sampler self-disables.** No stats listeners → the
 *      sampler timer is cleared. Adding the first listener arms it
 *      and one snapshot is delivered immediately.
 *
 * The tests inject a controllable timer (`fakeSetTimer`) so the stats
 * window is deterministic.
 */

import { describe, expect, it, beforeEach, vi } from 'vitest';
import { SharedWorkerDataServicesHub, type PortLike } from './SharedWorkerDataServicesHub';
import { ConfigCatalogCache } from '../../hub/ConfigCatalogCache.js';
import { registerProvider } from '../providers/registry';
import type { ProviderEmit, ProviderHandle } from '../providers/Provider';
import type { Event, RowPatch } from '../protocol';
import { decodeColumnar } from '../wire/columnarCodec';
import type { ProviderConfig } from '@starui/types';
import type { ConfigManager, AppConfigRow } from '@starui/host-config';
import {
  SUBSCRIBER_PING_TIMEOUT_MS,
  SUBSCRIBER_SWEEP_INTERVAL_MS,
} from './hubTypes.js';

interface CapturedPort extends PortLike {
  messages: Event[];
}

// PortLike contract: postMessage consumes the message synchronously
// (real MessagePorts structured-clone during the call), and the hub
// reuses one event object across fan-out loops. Fakes must therefore
// shallow-copy on capture or every captured message aliases the last
// listener's subId.
function makePort(): CapturedPort {
  const messages: Event[] = [];
  return {
    messages,
    postMessage(m: unknown) {
      messages.push({ ...(m as Event) });
    },
  };
}

const REPLAY_DECODER = new TextDecoder();

/** Rows carried by a delta — decodes pre-encoded `delta-bin` replay chunks. */
function rowsOf(m: Event): unknown[] | null {
  if (m.kind === 'delta') return [...m.rows];
  if (m.kind === 'delta-bin') {
    return m.enc === 'col'
      ? decodeColumnar(m.buf)
      : JSON.parse(REPLAY_DECODER.decode(m.buf)) as unknown[];
  }
  return null;
}

const isAnyDelta = (m: Event): boolean => m.kind === 'delta' || m.kind === 'delta-bin';
const isReplaceDelta = (m: Event): boolean =>
  isAnyDelta(m) && Boolean((m as { replace?: boolean }).replace);

interface FakeTimers {
  set: (cb: () => void, ms: number) => unknown;
  clear: (h: unknown) => void;
  /** Step time forward one tick. */
  tick(): void;
  /** True when an interval is currently armed. */
  armed: boolean;
}

function makeFakeTimers(): FakeTimers {
  const callbacks = new Map<number, () => void>();
  let nextId = 1;
  return {
    set(callback) {
      const id = nextId++;
      callbacks.set(id, callback);
      return id;
    },
    clear(handle) {
      callbacks.delete(handle as number);
    },
    tick() {
      for (const cb of [...callbacks.values()]) cb();
    },
    get armed() { return callbacks.size > 0; },
  };
}

// ─── Test provider — emits on demand via test-controlled hooks ───

interface TestController {
  emit: ProviderEmit;
  /** Number of times stop() was called. */
  stopCount: number;
  /** Recorded restart args. */
  restartLog: Array<Record<string, unknown> | undefined>;
}

const controllers = new Map<string, TestController>();

beforeEach(() => {
  controllers.clear();
  registerProvider('mock' as ProviderConfig['providerType'], (cfg, emit) => {
    const ctrl: TestController = { emit, stopCount: 0, restartLog: [] };
    // Key controllers by providerType + name so multiple instances
    // in one test can be told apart.
    controllers.set((cfg as unknown as { __testKey?: string }).__testKey ?? 'default', ctrl);
    const handle: ProviderHandle = {
      stop() { ctrl.stopCount += 1; },
      restart(extra) { ctrl.restartLog.push(extra); },
    };
    return handle;
  });
});

const cfg = (key = 'default', overrides: Record<string, unknown> = {}): ProviderConfig =>
  ({ providerType: 'mock', __testKey: key, keyColumn: 'id', ...overrides } as unknown as ProviderConfig);

describe('SharedWorkerDataServicesHub — SSRM (server-side row model)', () => {
  /** Start a provider + seed a 5-row cache, return the hub + an SSRM port. */
  function seeded() {
    const hub = new SharedWorkerDataServicesHub();
    const port = makePort();
    hub.handleRequest(port, { kind: 'attach', subId: 's1', providerId: 'p1', mode: 'ssrm', cfg: cfg() });
    const ctrl = controllers.get('default')!;
    ctrl.emit({
      rows: [
        { id: 'r0', v: 0 }, { id: 'r1', v: 1 }, { id: 'r2', v: 2 },
        { id: 'r3', v: 3 }, { id: 'r4', v: 4 },
      ],
      replace: true,
    });
    ctrl.emit({ status: 'ready' });
    port.messages.length = 0;
    return { hub, port, ctrl };
  }

  const ssrmRows = (m: Event) => (m as Event & { kind: 'ssrm-rows' });
  const ssrmTx = (m: Event) => (m as Event & { kind: 'ssrm-tx' });

  it('get-rows returns the requested block and the total row count', () => {
    const { hub, port } = seeded();
    hub.handleRequest(port, {
      kind: 'ssrm-get-rows', subId: 's1', providerId: 'p1', reqId: 'q1', startRow: 1, endRow: 3,
    });
    const evt = port.messages.find((m) => m.kind === 'ssrm-rows');
    expect(evt).toBeTruthy();
    expect(ssrmRows(evt!).reqId).toBe('q1');
    expect(ssrmRows(evt!).rowCount).toBe(5);
    expect(ssrmRows(evt!).rows).toEqual([{ id: 'r1', v: 1 }, { id: 'r2', v: 2 }]);
  });

  it('pushes a live tick ONLY for rows inside the loaded block', () => {
    const { hub, port, ctrl } = seeded();
    // Grid has loaded rows [1,3).
    hub.handleRequest(port, {
      kind: 'ssrm-get-rows', subId: 's1', providerId: 'p1', reqId: 'q1', startRow: 1, endRow: 3,
    });
    port.messages.length = 0;

    // Tick updates r2 (index 2, in range) and r4 (index 4, out of range).
    ctrl.emit({ rows: [{ id: 'r2', v: 22 }, { id: 'r4', v: 44 }] });

    const tx = port.messages.filter((m) => m.kind === 'ssrm-tx');
    expect(tx).toHaveLength(1);
    expect(ssrmTx(tx[0]!).rows).toEqual([{ id: 'r2', v: 22 }]);
  });

  it('pushes nothing before any block is pulled (empty loaded range)', () => {
    const { port, ctrl } = seeded();
    // No get-rows yet → loaded range empty.
    ctrl.emit({ rows: [{ id: 'r2', v: 99 }] });
    expect(port.messages.some((m) => m.kind === 'ssrm-tx')).toBe(false);
  });

  it('an SSRM subscriber gets NO cache replay / delta fan-out (it pulls)', () => {
    const hub = new SharedWorkerDataServicesHub();
    const port = makePort();
    hub.handleRequest(port, { kind: 'attach', subId: 's1', providerId: 'p1', mode: 'ssrm', cfg: cfg() });
    const ctrl = controllers.get('default')!;
    ctrl.emit({ rows: [{ id: 'r0', v: 0 }], replace: true });
    ctrl.emit({ status: 'ready' });
    // Only status events — never a delta / delta-bin replay.
    expect(port.messages.some(isAnyDelta)).toBe(false);
  });

  it('get-rows applies the request sortModel', () => {
    const { hub, port } = seeded();
    hub.handleRequest(port, {
      kind: 'ssrm-get-rows', subId: 's1', providerId: 'p1', reqId: 'q1',
      startRow: 0, endRow: 2, sortModel: [{ colId: 'v', sort: 'desc' }],
    });
    const evt = port.messages.find((m) => m.kind === 'ssrm-rows') as Event & { kind: 'ssrm-rows' };
    expect(evt.rows).toEqual([{ id: 'r4', v: 4 }, { id: 'r3', v: 3 }]);
    expect(evt.rowCount).toBe(5);
  });

  it('get-rows applies the request filterModel (count reflects filtered set)', () => {
    const { hub, port } = seeded();
    hub.handleRequest(port, {
      kind: 'ssrm-get-rows', subId: 's1', providerId: 'p1', reqId: 'q1',
      startRow: 0, endRow: 100,
      filterModel: { v: { filterType: 'number', type: 'greaterThan', filter: 2 } },
    });
    const evt = port.messages.find((m) => m.kind === 'ssrm-rows') as Event & { kind: 'ssrm-rows' };
    expect(evt.rows).toEqual([{ id: 'r3', v: 3 }, { id: 'r4', v: 4 }]);
    expect(evt.rowCount).toBe(2);
  });

  it('live tick respects the SORTED view for in-range push', () => {
    const { hub, port, ctrl } = seeded();
    // Sorted v desc → [r4,r3,r2,r1,r0]; load block [0,2) = r4,r3.
    hub.handleRequest(port, {
      kind: 'ssrm-get-rows', subId: 's1', providerId: 'p1', reqId: 'q1',
      startRow: 0, endRow: 2, sortModel: [{ colId: 'v', sort: 'desc' }],
    });
    port.messages.length = 0;
    // r3 is in the loaded block (sorted pos 1); r0 is not (sorted pos 4).
    ctrl.emit({ rows: [{ id: 'r3', v: 33 }, { id: 'r0', v: 100 }] });
    const tx = port.messages.filter((m) => m.kind === 'ssrm-tx') as Array<Event & { kind: 'ssrm-tx' }>;
    expect(tx).toHaveLength(1);
    expect(tx[0]!.rows).toEqual([{ id: 'r3', v: 33 }]);
  });

  it('ssrm-values returns the column distinct values', () => {
    const { hub, port } = seeded();
    hub.handleRequest(port, {
      kind: 'ssrm-values', subId: 's1', providerId: 'p1', reqId: 'vq', field: 'v',
    });
    const evt = port.messages.find((m) => m.kind === 'ssrm-values') as Event & { kind: 'ssrm-values' };
    expect(evt.values).toEqual(['0', '1', '2', '3', '4']);
  });

  it('grouping: get-rows returns group rows with aggregates; grouped sub gets no live tx', () => {
    const hub = new SharedWorkerDataServicesHub();
    const port = makePort();
    hub.handleRequest(port, { kind: 'attach', subId: 's1', providerId: 'p1', mode: 'ssrm', cfg: cfg() });
    const ctrl = controllers.get('default')!;
    ctrl.emit({
      rows: [
        { id: 'a', desk: 'EQ', qty: 10 }, { id: 'b', desk: 'FI', qty: 30 },
        { id: 'c', desk: 'EQ', qty: 20 }, { id: 'd', desk: 'FI', qty: 5 },
      ],
      replace: true,
    });
    ctrl.emit({ status: 'ready' });
    port.messages.length = 0;

    hub.handleRequest(port, {
      kind: 'ssrm-get-rows', subId: 's1', providerId: 'p1', reqId: 'g1',
      startRow: 0, endRow: 100,
      rowGroupCols: [{ id: 'desk' }],
      valueCols: [{ id: 'qty', aggFunc: 'sum' }],
      groupKeys: [],
    });
    const evt = port.messages.find((m) => m.kind === 'ssrm-rows') as Event & { kind: 'ssrm-rows' };
    expect(evt.rows).toEqual([{ desk: 'EQ', qty: 30 }, { desk: 'FI', qty: 35 }]);
    expect(evt.rowCount).toBe(2);

    // A leaf tick must NOT push to a grouped subscriber (aggregates refresh on pull).
    port.messages.length = 0;
    ctrl.emit({ rows: [{ id: 'a', desk: 'EQ', qty: 999 }] });
    expect(port.messages.some((m) => m.kind === 'ssrm-tx')).toBe(false);
  });

  it('get-rows returns a grand total of the FILTERED set when value columns are present', () => {
    const { hub, port } = seeded(); // rows r0..r4 with v:0..4
    hub.handleRequest(port, {
      kind: 'ssrm-get-rows', subId: 's1', providerId: 'p1', reqId: 'q1',
      startRow: 0, endRow: 100,
      filterModel: { v: { filterType: 'number', type: 'greaterThan', filter: 1 } },
      valueCols: [{ id: 'v', aggFunc: 'sum' }],
    });
    const evt = port.messages.find((m) => m.kind === 'ssrm-rows') as Event & { kind: 'ssrm-rows' };
    // Filtered set is v in {2,3,4} → sum 9 (r0,r1 excluded).
    expect(evt.grandTotal).toEqual({ v: 9 });
  });

  it('throttled aggregator re-totals live and pushes the moved grand total', () => {
    const { hub, port, ctrl } = seeded(); // r0..r4, v:0..4 → sum 10
    hub.handleRequest(port, {
      kind: 'ssrm-get-rows', subId: 's1', providerId: 'p1', reqId: 'q1',
      startRow: 0, endRow: 100, valueCols: [{ id: 'v', aggFunc: 'sum' }],
    });
    port.messages.length = 0;

    // A tick bumps r0.v 0 → 100; the throttled flush re-totals to 110.
    ctrl.emit({ rows: [{ id: 'r0', v: 100 }] });
    (hub as unknown as { flushSsrmAggregates(): void }).flushSsrmAggregates();

    const totalTx = (port.messages.filter((m) => m.kind === 'ssrm-tx') as Array<Event & { kind: 'ssrm-tx' }>)
      .find((t) => t.grandTotal);
    expect(totalTx?.grandTotal).toEqual({ v: 110 });
  });

  it('grouped live: expanded leaf ticks push with route; throttle re-aggregates the group level', () => {
    const hub = new SharedWorkerDataServicesHub();
    const port = makePort();
    hub.handleRequest(port, { kind: 'attach', subId: 's1', providerId: 'p1', mode: 'ssrm', cfg: cfg() });
    const ctrl = controllers.get('default')!;
    ctrl.emit({
      rows: [
        { id: 'a', desk: 'EQ', qty: 10 }, { id: 'c', desk: 'EQ', qty: 20 }, { id: 'b', desk: 'FI', qty: 30 },
      ],
      replace: true,
    });
    ctrl.emit({ status: 'ready' });
    const group = { rowGroupCols: [{ id: 'desk' }], valueCols: [{ id: 'qty', aggFunc: 'sum' }] } as const;
    // Load the top group level, then expand EQ (leaf level).
    hub.handleRequest(port, { kind: 'ssrm-get-rows', subId: 's1', providerId: 'p1', reqId: 'g0', startRow: 0, endRow: 100, ...group, groupKeys: [] });
    hub.handleRequest(port, { kind: 'ssrm-get-rows', subId: 's1', providerId: 'p1', reqId: 'g1', startRow: 0, endRow: 100, ...group, groupKeys: ['EQ'] });
    port.messages.length = 0;

    // Tick a leaf in EQ → immediate in-place leaf update routed to ['EQ'].
    ctrl.emit({ rows: [{ id: 'a', desk: 'EQ', qty: 111 }] });
    const leafTx = port.messages.filter((m) => m.kind === 'ssrm-tx') as Array<Event & { kind: 'ssrm-tx' }>;
    expect(leafTx).toHaveLength(1);
    expect(leafTx[0]!.route).toEqual(['EQ']);
    expect(leafTx[0]!.replaceLevel).toBeFalsy();
    expect(leafTx[0]!.rows).toEqual([{ id: 'a', desk: 'EQ', qty: 111 }]);

    // Throttled flush re-aggregates the top group level: EQ sum 111+20 = 131.
    port.messages.length = 0;
    (hub as unknown as { flushSsrmAggregates(): void }).flushSsrmAggregates();
    const repl = (port.messages.filter((m) => m.kind === 'ssrm-tx') as Array<Event & { kind: 'ssrm-tx' }>)
      .find((t) => t.replaceLevel);
    expect(repl?.route).toEqual([]);
    expect(repl?.rows).toContainEqual({ desk: 'EQ', qty: 131 });
  });
});

describe('SharedWorkerDataServicesHub — attach lifecycle', () => {
  it('first attach creates the provider and the listener immediately gets a replace + status', () => {
    const hub = new SharedWorkerDataServicesHub();
    const port = makePort();

    hub.handleRequest(port, { kind: 'attach', subId: 's1', providerId: 'p1', mode: 'data', cfg: cfg() });

    expect(port.messages).toHaveLength(2);
    expect(port.messages[0]).toMatchObject({ subId: 's1', kind: 'status', status: 'loading' });
    expect(port.messages[1]).toMatchObject({ subId: 's1', kind: 'delta', replace: true, rows: [] });
  });

  it('rejects with status:error if the providerId is not running and no cfg supplied', () => {
    const hub = new SharedWorkerDataServicesHub();
    const port = makePort();

    hub.handleRequest(port, { kind: 'attach', subId: 's1', providerId: 'p1', mode: 'data' });

    expect(port.messages).toHaveLength(1);
    expect(port.messages[0]).toMatchObject({ kind: 'status', status: 'error' });
  });

  it('late joiner gets the full cache as one replace delta', () => {
    const hub = new SharedWorkerDataServicesHub();
    const portA = makePort();

    hub.handleRequest(portA, { kind: 'attach', subId: 'sA', providerId: 'p1', mode: 'data', cfg: cfg() });
    const ctrl = controllers.get('default')!;
    ctrl.emit({ rows: [{ id: 'r1', x: 1 }, { id: 'r2', x: 2 }] });
    ctrl.emit({ status: 'ready' });

    // Late joiner attaches AFTER snapshot finished.
    const portB = makePort();
    hub.handleRequest(portB, { kind: 'attach', subId: 'sB', providerId: 'p1', mode: 'data' });

    // Late joiner sees the cache as a single replace delta (shipped
    // as a pre-encoded delta-bin chunk).
    const replaceB = portB.messages.find(isReplaceDelta);
    expect(replaceB).toBeTruthy();
    expect(rowsOf(replaceB!)).toHaveLength(2);

    // ...and the current status (loading precedes ready on replay).
    const statusesB = portB.messages.filter((m) => m.kind === 'status');
    expect(statusesB.map((s) => s.status)).toEqual(['loading', 'ready']);
  });

  it('passes extra to provider.restart on a re-attach', () => {
    const hub = new SharedWorkerDataServicesHub();
    const port = makePort();
    hub.handleRequest(port, { kind: 'attach', subId: 's1', providerId: 'p1', mode: 'data', cfg: cfg() });
    const ctrl = controllers.get('default')!;

    hub.handleRequest(port, { kind: 'attach', subId: 's2', providerId: 'p1', mode: 'data', extra: { asOfDate: '2026-04-01' } });

    expect(ctrl.restartLog).toEqual([{ asOfDate: '2026-04-01' }]);
  });

  it('skips provider.restart when a second window attaches with the same extra overlay', () => {
    const hub = new SharedWorkerDataServicesHub();
    const portA = makePort();
    const portB = makePort();
    hub.handleRequest(portA, {
      kind: 'attach',
      subId: 'sA',
      providerId: 'p1',
      mode: 'data',
      cfg: cfg(),
      extra: { asOfDate: '2026-04-01' },
    });
    const ctrl = controllers.get('default')!;
    expect(ctrl.restartLog).toEqual([{ asOfDate: '2026-04-01' }]);

    hub.handleRequest(portB, {
      kind: 'attach',
      subId: 'sB',
      providerId: 'p1',
      mode: 'data',
      extra: { asOfDate: '2026-04-01' },
    });

    expect(ctrl.restartLog).toEqual([{ asOfDate: '2026-04-01' }]);
    const replaceB = portB.messages.find(isReplaceDelta);
    expect(replaceB).toBeTruthy();
  });

  it('rebuilds the slot from a new cfg when a running provider is restarted with cfg (editor reconnect)', () => {
    const hub = new SharedWorkerDataServicesHub();
    const port = makePort();
    // Provider created with the original cfg.
    hub.handleRequest(port, { kind: 'attach', subId: 's1', providerId: 'p1', mode: 'data', cfg: cfg('v1') });
    const v1 = controllers.get('v1')!;
    expect(v1.stopCount).toBe(0);

    // Editor edits the connection settings and hits Restart: the attach
    // carries the NEW cfg plus a __refresh extra. The old slot is torn
    // down and a fresh provider is built from the new cfg, so the
    // reconnect uses the latest values rather than the stale ones.
    hub.handleRequest(port, {
      kind: 'attach',
      subId: 's2',
      providerId: 'p1',
      mode: 'data',
      cfg: cfg('v2'),
      extra: { __refresh: 1 },
    });

    expect(v1.stopCount).toBe(1);
    const v2 = controllers.get('v2')!;
    expect(v2).toBeTruthy();
    expect(v2.restartLog).toEqual([{ __refresh: 1 }]);
  });

  it('peer windows receive the loading status when one window restarts with a new cfg (RESTART+RECONFIG)', () => {
    // Regression: real transports emit `status: loading` SYNCHRONOUSLY
    // inside the factory call. createProvider used to register the slot
    // only after the factory returned, so applyEmit dropped that first
    // loading — and with the adopt-in-flight restart no longer
    // re-emitting via beginSnapshotPhase(), peer windows erratically
    // never learned a refresh had started.
    registerProvider('mock' as ProviderConfig['providerType'], (c, emit) => {
      const ctrl: TestController = { emit, stopCount: 0, restartLog: [] };
      controllers.set((c as unknown as { __testKey?: string }).__testKey ?? 'default', ctrl);
      emit({ status: 'loading' }); // synchronous, like startStomp/startRest
      return { stop() { ctrl.stopCount += 1; }, restart(extra) { ctrl.restartLog.push(extra); } };
    });

    const hub = new SharedWorkerDataServicesHub();
    const clicker = makePort();
    const peer = makePort();
    hub.handleRequest(clicker, { kind: 'attach', subId: 's1', providerId: 'p1', mode: 'data', cfg: cfg('v1') });
    hub.handleRequest(peer, { kind: 'attach', subId: 'sPeer', providerId: 'p1', mode: 'data' });
    const v1 = controllers.get('v1')!;
    v1.emit({ rows: [{ id: 'r1', x: 1 }], replace: true });
    v1.emit({ status: 'ready' });
    peer.messages.length = 0;

    // Window 1's adapter restarts: detach old sub, re-attach with the
    // current cfg + a __refresh extra (the editor/diagnostics flow).
    hub.handleRequest(clicker, { kind: 'detach', subId: 's1' });
    hub.handleRequest(clicker, {
      kind: 'attach',
      subId: 's1b',
      providerId: 'p1',
      mode: 'data',
      cfg: cfg('v2'),
      extra: { __refresh: 1 },
    });

    // The peer must see the refresh begin...
    const peerLoading = peer.messages.find(
      (m) => m.kind === 'status' && (m as { status: string }).status === 'loading',
    );
    expect(peerLoading).toBeTruthy();
    expect((peerLoading as { subId: string }).subId).toBe('sPeer');

    // ...and the fresh snapshot when it lands.
    const v2 = controllers.get('v2')!;
    v2.emit({ rows: [{ id: 'r1', x: 42 }], replace: true });
    v2.emit({ status: 'ready' });
    const freshReplace = peer.messages.find(isReplaceDelta);
    expect(freshReplace).toBeTruthy();
    expect(rowsOf(freshReplace!)).toEqual([{ id: 'r1', x: 42 }]);
  });

  it('passes extra to provider.restart on the first attach (fresh provider)', () => {
    const hub = new SharedWorkerDataServicesHub();
    const port = makePort();
    hub.handleRequest(port, {
      kind: 'attach',
      subId: 's1',
      providerId: 'p1',
      mode: 'data',
      cfg: cfg(),
      extra: { asOfDate: '2026-04-01' },
    });
    const ctrl = controllers.get('default')!;
    expect(ctrl.restartLog).toEqual([{ asOfDate: '2026-04-01' }]);
  });

  it('restart attach posts loading without replaying stale cache', () => {
    const hub = new SharedWorkerDataServicesHub();
    const portA = makePort();
    const portB = makePort();
    hub.handleRequest(portA, { kind: 'attach', subId: 's1', providerId: 'p1', mode: 'data', cfg: cfg() });
    const ctrl = controllers.get('default')!;
    ctrl.emit({ rows: [{ id: 'stale' }], replace: true });
    ctrl.emit({ status: 'ready' });
    portA.messages.length = 0;

    hub.handleRequest(portB, {
      kind: 'attach',
      subId: 's2',
      providerId: 'p1',
      mode: 'data',
      extra: { __refresh: 1 },
    });

    const deltasB = portB.messages.filter(isAnyDelta);
    expect(deltasB).toHaveLength(0);
    expect(portB.messages).toContainEqual({
      subId: 's2',
      kind: 'status',
      status: 'loading',
    });

    portB.messages.length = 0;
    ctrl.emit({ rows: [{ id: 'fresh' }], replace: true });
    ctrl.emit({ status: 'ready' });

    const replayed = portB.messages
      .filter(isAnyDelta)
      .flatMap((m) => rowsOf(m) as Array<{ id: string }>);
    expect(replayed.map((r) => r.id)).toEqual(['fresh']);
  });

  it('refresh-provider replays cache to one subId without provider.restart', () => {
    const hub = new SharedWorkerDataServicesHub();
    const portA = makePort();
    const portB = makePort();
    hub.handleRequest(portA, { kind: 'attach', subId: 'sA', providerId: 'p1', mode: 'data', cfg: cfg() });
    const ctrl = controllers.get('default')!;
    ctrl.emit({ rows: [{ id: 'r1' }, { id: 'r2' }], replace: true });
    ctrl.emit({ status: 'ready' });

    hub.handleRequest(portB, { kind: 'attach', subId: 'sB', providerId: 'p1', mode: 'data' });
    portA.messages.length = 0;
    portB.messages.length = 0;
    const restartsBefore = ctrl.restartLog.length;

    hub.handleRequest(portA, { kind: 'refresh-provider', subId: 'sA', providerId: 'p1' });

    const statusesA = portA.messages.filter((m) => m.kind === 'status') as Array<Event & { status: string }>;
    expect(statusesA[0]?.status).toBe('loading');
    expect(statusesA.at(-1)?.status).toBe('ready');
    const deltasA = portA.messages.filter(isAnyDelta);
    expect(deltasA.length).toBeGreaterThan(0);
    expect(portB.messages).toHaveLength(0);
    expect(ctrl.restartLog).toHaveLength(restartsBefore);
    const replayed = deltasA.flatMap((d) => rowsOf(d)) as Array<{ id: string }>;
    expect(replayed.map((r) => r.id)).toEqual(['r1', 'r2']);
  });

  it('broadcasts rows-received during snapshot before cache is ready', () => {
    const hub = new SharedWorkerDataServicesHub();
    const port = makePort();
    hub.handleRequest(port, { kind: 'attach', subId: 's1', providerId: 'p1', mode: 'data', cfg: cfg() });
    const ctrl = controllers.get('default')!;
    port.messages.length = 0;

    ctrl.emit({ rowsReceived: 100 });
    ctrl.emit({ rowsReceived: 250 });

    const received = port.messages.filter((m) => m.kind === 'rows-received') as Array<Event & { count: number }>;
    expect(received.map((m) => m.count)).toEqual([100, 250]);

    ctrl.emit({ rows: [{ id: 'r1' }], replace: true });
    ctrl.emit({ status: 'ready' });

    ctrl.emit({ rowsReceived: 999 });
    expect(port.messages.filter((m) => m.kind === 'rows-received')).toHaveLength(2);
  });

  it('dedupes by keyColumn when broadcasting a replace event so AG-Grid never sees duplicate row ids', () => {
    // STOMP's snapshot-phase buffer can carry the same row twice when
    // upstream delivers an updated version of an already-buffered row
    // before the end-token arrives. Hub must collapse those by
    // keyColumn before broadcasting; otherwise consumers running
    // `setRowData` on a grid with `getRowId(row) => row[keyColumn]`
    // emit AG-Grid warning #2 ("Duplicate node id detected").
    const hub = new SharedWorkerDataServicesHub();
    const port = makePort();
    hub.handleRequest(port, { kind: 'attach', subId: 's1', providerId: 'p1', mode: 'data', cfg: cfg() });
    const ctrl = controllers.get('default')!;
    port.messages.length = 0; // clear initial empty replace + status

    ctrl.emit({
      rows: [
        { id: 'r1', x: 1 },
        { id: 'r2', x: 2 },
        { id: 'r1', x: 99 }, // duplicate of r1 — last write wins
      ],
      replace: true,
    });

    const broadcast = port.messages.find(isReplaceDelta)!;
    const rows = rowsOf(broadcast) as Array<{ id: string; x: number }>;
    expect(rows).toHaveLength(2);
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get('r1')?.x).toBe(99); // last write wins
    expect(byId.get('r2')?.x).toBe(2);
  });

  it('dedupes by keyColumn on non-replace deltas (live ticks for the same id within one batch)', () => {
    // A single upstream message can carry multiple updates for the
    // same row id when the source coalesces ticks (e.g. a STOMP
    // server batching two updates for the same position into one
    // frame). Without dedup the consumer's
    // `applyTransactionAsync({add: [...], update: [...]})` ends up
    // with duplicate ids in one of those arrays — AG-Grid warning #2
    // ("Duplicate node id") fires.
    //
    // The hub collapses duplicates last-write-wins, matching the
    // semantics of the cache update that runs alongside.
    const hub = new SharedWorkerDataServicesHub();
    const port = makePort();
    hub.handleRequest(port, { kind: 'attach', subId: 's1', providerId: 'p1', mode: 'data', cfg: cfg() });
    const ctrl = controllers.get('default')!;
    port.messages.length = 0;

    ctrl.emit({ rows: [{ id: 'r1', x: 1 }, { id: 'r1', x: 2 }] });

    const delta = port.messages.find((m) => isAnyDelta(m) && !isReplaceDelta(m))!;
    const rows = rowsOf(delta) as Array<{ id: string; x: number }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ id: 'r1', x: 2 }); // last write wins
  });

  it('drops rows without a keyColumn value from the broadcast (no id → cannot route)', () => {
    // Defense in depth: rows lacking the keyColumn cannot be applied
    // by the grid's `getRowId` and would never land in the cache
    // either. Dropping them at the Hub keeps the broadcast contract
    // simple ("rows are always unique by keyColumn").
    const hub = new SharedWorkerDataServicesHub();
    const port = makePort();
    hub.handleRequest(port, { kind: 'attach', subId: 's1', providerId: 'p1', mode: 'data', cfg: cfg() });
    const ctrl = controllers.get('default')!;
    port.messages.length = 0;

    ctrl.emit({ rows: [{ id: 'r1', x: 1 }, { x: 'orphan' }, { id: 'r2', x: 3 }] });

    const delta = port.messages.find((m) => isAnyDelta(m) && !isReplaceDelta(m))!;
    const rows = rowsOf(delta) as Array<{ id?: string }>;
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.id !== undefined)).toBe(true);
  });

  it('dedupes by COMPOSITE keyColumn (array form — values joined with `-`)', () => {
    // Composite key: keyColumn = ['region', 'desk', 'instrumentId']
    // → row id = `${region}-${desk}-${instrumentId}`. Two rows that
    // share all three values are treated as the same logical row;
    // the latest write wins. Rows differing in ANY component are
    // distinct rows.
    const hub = new SharedWorkerDataServicesHub();
    const port = makePort();
    const compositeCfg = ({ providerType: 'mock', __testKey: 'composite', keyColumn: ['region', 'desk', 'instrumentId'] } as unknown as ProviderConfig);
    hub.handleRequest(port, { kind: 'attach', subId: 's1', providerId: 'p1', mode: 'data', cfg: compositeCfg });
    const ctrl = controllers.get('composite')!;
    port.messages.length = 0;

    ctrl.emit({
      rows: [
        { region: 'EMEA', desk: 'CRD', instrumentId: 'IBM',  qty: 100 }, // (A)
        { region: 'EMEA', desk: 'CRD', instrumentId: 'IBM',  qty: 250 }, // (A) — last-write-wins
        { region: 'EMEA', desk: 'CRD', instrumentId: 'AAPL', qty:  10 }, // (B)
        { region: 'AMER', desk: 'CRD', instrumentId: 'IBM',  qty:  50 }, // (C)
        { region: 'EMEA', desk: 'CRD',                       qty: 999 }, // missing component → dropped
      ],
    });

    const delta = port.messages.find((m) => isAnyDelta(m) && !isReplaceDelta(m))!;
    const rows = rowsOf(delta) as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(3);              // 4 distinct rows minus the orphan → 3
    expect(rows[0]).toEqual({ region: 'EMEA', desk: 'CRD', instrumentId: 'IBM', qty: 250 });
    expect(rows[1]).toEqual({ region: 'EMEA', desk: 'CRD', instrumentId: 'AAPL', qty: 10 });
    expect(rows[2]).toEqual({ region: 'AMER', desk: 'CRD', instrumentId: 'IBM', qty: 50 });
  });
});

describe('SharedWorkerDataServicesHub — idle auto-teardown', () => {
  it('stops the provider when the last data subscriber detaches', () => {
    const hub = new SharedWorkerDataServicesHub();
    const port = makePort();
    hub.handleRequest(port, { kind: 'attach', subId: 's1', providerId: 'p1', mode: 'data', cfg: cfg() });
    const ctrl = controllers.get('default')!;
    ctrl.emit({ rows: [{ id: 'r1' }] });

    hub.handleRequest(port, { kind: 'detach', subId: 's1' });

    expect(ctrl.stopCount).toBe(1);
  });

  it('keeps the provider running while any data subscriber remains', () => {
    const hub = new SharedWorkerDataServicesHub();
    const portA = makePort();
    const portB = makePort();
    hub.handleRequest(portA, { kind: 'attach', subId: 'sA', providerId: 'p1', mode: 'data', cfg: cfg() });
    hub.handleRequest(portB, { kind: 'attach', subId: 'sB', providerId: 'p1', mode: 'data' });
    const ctrl = controllers.get('default')!;

    hub.handleRequest(portA, { kind: 'detach', subId: 'sA' });
    expect(ctrl.stopCount).toBe(0);

    hub.handleRequest(portB, { kind: 'detach', subId: 'sB' });
    expect(ctrl.stopCount).toBe(1);
  });

  it('re-attaching after idle teardown cold-starts and replays a fresh cache', () => {
    const hub = new SharedWorkerDataServicesHub();
    const port = makePort();
    hub.handleRequest(port, { kind: 'attach', subId: 's1', providerId: 'p1', mode: 'data', cfg: cfg() });
    const ctrl = controllers.get('default')!;
    ctrl.emit({ rows: [{ id: 'r1' }] });

    hub.handleRequest(port, { kind: 'detach', subId: 's1' });
    expect(ctrl.stopCount).toBe(1);

    const portB = makePort();
    hub.handleRequest(portB, { kind: 'attach', subId: 's2', providerId: 'p1', mode: 'data', cfg: cfg() });
    const liveCtrl = controllers.get('default')!;
    liveCtrl.emit({ rows: [{ id: 'r2' }], replace: true });
    const replace = portB.messages
      .filter(isAnyDelta)
      .find((m) => rowsOf(m)?.some((r) => (r as { id: string }).id === 'r2'));
    expect(rowsOf(replace!)).toEqual([{ id: 'r2' }]);
    expect(ctrl.stopCount).toBe(1);
    expect(liveCtrl.stopCount).toBe(0);
  });

  it('explicit stop tears the provider down and notifies subscribers', () => {
    const hub = new SharedWorkerDataServicesHub();
    const port = makePort();
    hub.handleRequest(port, { kind: 'attach', subId: 's1', providerId: 'p1', mode: 'data', cfg: cfg() });
    const ctrl = controllers.get('default')!;

    hub.handleRequest(port, { kind: 'stop', providerId: 'p1' });

    expect(ctrl.stopCount).toBe(1);
    const errStatus = port.messages.find((m) => m.kind === 'status' && (m as { status: string }).status === 'error');
    expect(errStatus).toBeTruthy();
  });
});

describe('SharedWorkerDataServicesHub — broadcast fan-out', () => {
  it('every data delta reaches every attached subscriber for the provider', () => {
    const hub = new SharedWorkerDataServicesHub();
    const a = makePort();
    const b = makePort();
    hub.handleRequest(a, { kind: 'attach', subId: 'sA', providerId: 'p1', mode: 'data', cfg: cfg() });
    hub.handleRequest(b, { kind: 'attach', subId: 'sB', providerId: 'p1', mode: 'data' });
    const ctrl = controllers.get('default')!;

    a.messages.length = 0;
    b.messages.length = 0;

    ctrl.emit({ rows: [{ id: 'r1' }] });

    const aDelta = a.messages.find((m) => isAnyDelta(m) && rowsOf(m)?.length === 1);
    const bDelta = b.messages.find((m) => isAnyDelta(m) && rowsOf(m)?.length === 1);
    expect(aDelta).toBeTruthy();
    expect(bDelta).toBeTruthy();
    // Each carries its own subId.
    expect((aDelta as { subId: string }).subId).toBe('sA');
    expect((bDelta as { subId: string }).subId).toBe('sB');
  });
});

describe('SharedWorkerDataServicesHub — snapshot replay memoization', () => {
  const binChunks = (port: CapturedPort) =>
    port.messages.filter((m) => m.kind === 'delta-bin') as Array<Event & { kind: 'delta-bin' }>;

  /** Drive a provider to ready with `n` cached rows. */
  function readyHub(n: number) {
    const hub = new SharedWorkerDataServicesHub();
    const primer = makePort();
    hub.handleRequest(primer, { kind: 'attach', subId: 'primer', providerId: 'p1', mode: 'data', cfg: cfg() });
    const ctrl = controllers.get('default')!;
    ctrl.emit({ rows: Array.from({ length: n }, (_, i) => ({ id: `r${i}`, x: i })), replace: true });
    ctrl.emit({ status: 'ready' });
    return { hub, ctrl };
  }

  it('replays the cache as pre-encoded delta-bin chunks of ≤500 rows, first chunk replace=true', () => {
    const { hub } = readyHub(1200);
    const port = makePort();
    hub.handleRequest(port, { kind: 'attach', subId: 'late', providerId: 'p1', mode: 'data' });

    const chunks = binChunks(port);
    expect(chunks).toHaveLength(3); // 500 + 500 + 200
    expect(chunks.map((c) => Boolean(c.replace))).toEqual([true, false, false]);
    const rows = chunks.flatMap((c) => rowsOf(c)) as Array<{ id: string }>;
    expect(rows).toHaveLength(1200);
    expect(rows[0]).toEqual({ id: 'r0', x: 0 });
    expect(rows[1199]).toEqual({ id: 'r1199', x: 1199 });
    // Replay ends with the current status.
    expect(port.messages[port.messages.length - 1]).toMatchObject({ kind: 'status', status: 'ready' });
  });

  it('concurrent late joiners reuse the SAME encoded buffers — one serialization per cache generation', () => {
    const { hub } = readyHub(700);
    const portB = makePort();
    const portC = makePort();
    hub.handleRequest(portB, { kind: 'attach', subId: 'sB', providerId: 'p1', mode: 'data' });
    hub.handleRequest(portC, { kind: 'attach', subId: 'sC', providerId: 'p1', mode: 'data' });

    const bufsB = binChunks(portB).map((c) => c.buf);
    const bufsC = binChunks(portC).map((c) => c.buf);
    expect(bufsB).toHaveLength(2);
    expect(bufsC).toHaveLength(2);
    // Identity, not equality: the hub must not re-serialize per attach.
    expect(bufsC[0]).toBe(bufsB[0]);
    expect(bufsC[1]).toBe(bufsB[1]);
  });

  it('any cache mutation invalidates the memoized replay snapshot', () => {
    const { hub, ctrl } = readyHub(10);
    const portB = makePort();
    hub.handleRequest(portB, { kind: 'attach', subId: 'sB', providerId: 'p1', mode: 'data' });
    const bufB = binChunks(portB)[0].buf;

    ctrl.emit({ rows: [{ id: 'r0', x: 999 }] }); // live tick → invalidate

    const portC = makePort();
    hub.handleRequest(portC, { kind: 'attach', subId: 'sC', providerId: 'p1', mode: 'data' });
    const chunkC = binChunks(portC)[0];
    expect(chunkC.buf).not.toBe(bufB);
    const rowsC = rowsOf(chunkC) as Array<{ id: string; x: number }>;
    expect(rowsC.find((r) => r.id === 'r0')?.x).toBe(999);
  });

  it('a clean live batch (keyed, no intra-batch duplicates) is broadcast by reference — no copy', () => {
    const { hub, ctrl } = readyHub(2);
    const port = makePort();
    hub.handleRequest(port, { kind: 'attach', subId: 's1', providerId: 'p1', mode: 'data' });
    port.messages.length = 0;

    const batch = [{ id: 'r0', x: 7 }, { id: 'r1', x: 8 }];
    ctrl.emit({ rows: batch });

    const delta = port.messages.find((m) => m.kind === 'delta') as Event & { rows: readonly unknown[] };
    expect(delta.rows).toBe(batch);
  });
});

describe('SharedWorkerDataServicesHub — binary snapshot broadcast (restart/initial fan-out)', () => {
  const binChunks = (port: CapturedPort) =>
    port.messages.filter((m) => m.kind === 'delta-bin') as Array<Event & { kind: 'delta-bin' }>;

  it('pre-ready snapshot chunks broadcast as delta-bin with ONE shared buffer per chunk across all ports', () => {
    const hub = new SharedWorkerDataServicesHub();
    const a = makePort();
    const b = makePort();
    hub.handleRequest(a, { kind: 'attach', subId: 'sA', providerId: 'p1', mode: 'data', cfg: cfg() });
    hub.handleRequest(b, { kind: 'attach', subId: 'sB', providerId: 'p1', mode: 'data' });
    const ctrl = controllers.get('default')!;
    a.messages.length = 0;
    b.messages.length = 0;

    // 700-row replace while status is still loading → sliced into 500 + 200.
    ctrl.emit({ rows: Array.from({ length: 700 }, (_, i) => ({ id: `r${i}`, x: i })), replace: true });

    const chunksA = binChunks(a);
    const chunksB = binChunks(b);
    expect(chunksA).toHaveLength(2);
    expect(chunksB).toHaveLength(2);
    expect(chunksA.map((c) => Boolean(c.replace))).toEqual([true, false]);
    // Identity across ports: one serialization, N flat byte copies.
    expect(chunksB[0].buf).toBe(chunksA[0].buf);
    expect(chunksB[1].buf).toBe(chunksA[1].buf);
    const rows = chunksA.flatMap((c) => rowsOf(c)) as Array<{ id: string }>;
    expect(rows).toHaveLength(700);
    expect(rows[0]).toEqual({ id: 'r0', x: 0 });
    expect(rows[699]).toEqual({ id: 'r699', x: 699 });
    // Each port's chunks carry its own subId.
    expect(chunksA.every((c) => c.subId === 'sA')).toBe(true);
    expect(chunksB.every((c) => c.subId === 'sB')).toBe(true);
  });

  it('the broadcast encoding seeds the replay snapshot — a late joiner reuses the SAME buffers', () => {
    const hub = new SharedWorkerDataServicesHub();
    const primer = makePort();
    hub.handleRequest(primer, { kind: 'attach', subId: 'primer', providerId: 'p1', mode: 'data', cfg: cfg() });
    const ctrl = controllers.get('default')!;
    primer.messages.length = 0;

    // STOMP-style streamed snapshot: replace head + clean append tail.
    ctrl.emit({ rows: Array.from({ length: 500 }, (_, i) => ({ id: `r${i}`, x: i })), replace: true });
    ctrl.emit({ rows: Array.from({ length: 200 }, (_, i) => ({ id: `r${500 + i}`, x: 500 + i })) });
    ctrl.emit({ status: 'ready' });

    const broadcastBufs = binChunks(primer).map((c) => c.buf);
    expect(broadcastBufs).toHaveLength(2);

    const late = makePort();
    hub.handleRequest(late, { kind: 'attach', subId: 'late', providerId: 'p1', mode: 'data' });
    const replayBufs = binChunks(late).map((c) => c.buf);
    // No re-serialization on attach: the replay IS the broadcast encoding.
    expect(replayBufs).toHaveLength(2);
    expect(replayBufs[0]).toBe(broadcastBufs[0]);
    expect(replayBufs[1]).toBe(broadcastBufs[1]);
    const rows = binChunks(late).flatMap((c) => rowsOf(c)) as Array<{ id: string }>;
    expect(rows).toHaveLength(700);
  });

  it('a pre-ready chunk that UPDATES an existing key invalidates the seed — replay re-encodes correctly', () => {
    const hub = new SharedWorkerDataServicesHub();
    const primer = makePort();
    hub.handleRequest(primer, { kind: 'attach', subId: 'primer', providerId: 'p1', mode: 'data', cfg: cfg() });
    const ctrl = controllers.get('default')!;
    primer.messages.length = 0;

    ctrl.emit({ rows: [{ id: 'r0', x: 0 }, { id: 'r1', x: 1 }], replace: true });
    // Same key again while still loading → cache overwrites in place;
    // the appended-chunk shortcut must NOT apply.
    ctrl.emit({ rows: [{ id: 'r0', x: 99 }] });
    ctrl.emit({ status: 'ready' });

    const broadcastBufs = binChunks(primer).map((c) => c.buf);
    const late = makePort();
    hub.handleRequest(late, { kind: 'attach', subId: 'late', providerId: 'p1', mode: 'data' });
    const lateChunks = binChunks(late);
    expect(lateChunks).toHaveLength(1);
    expect(lateChunks[0].buf).not.toBe(broadcastBufs[0]);
    expect(rowsOf(lateChunks[0])).toEqual([{ id: 'r0', x: 99 }, { id: 'r1', x: 1 }]);
  });
});

describe('SharedWorkerDataServicesHub — stats sampler', () => {
  it('arms on first provider start, stays armed until the last provider stops', () => {
    const timers = makeFakeTimers();
    const hub = new SharedWorkerDataServicesHub({ setTimer: timers.set, clearTimer: timers.clear });
    const port = makePort();
    hub.handleRequest(port, { kind: 'attach', subId: 'data', providerId: 'p1', mode: 'data', cfg: cfg() });

    expect(timers.armed).toBe(true);

    hub.handleRequest(port, { kind: 'attach', subId: 'stats', providerId: 'p1', mode: 'stats' });
    expect(timers.armed).toBe(true);

    hub.handleRequest(port, { kind: 'detach', subId: 'stats' });
    expect(timers.armed).toBe(true);

    hub.handleRequest(port, { kind: 'stop', providerId: 'p1' });
    expect(timers.armed).toBe(false);
  });

  it('emits a stats snapshot immediately on attach + each tick', () => {
    const timers = makeFakeTimers();
    const hub = new SharedWorkerDataServicesHub({ setTimer: timers.set, clearTimer: timers.clear });
    const port = makePort();
    hub.handleRequest(port, { kind: 'attach', subId: 'data', providerId: 'p1', mode: 'data', cfg: cfg() });
    const ctrl = controllers.get('default')!;
    ctrl.emit({ rows: [{ id: 'r1' }, { id: 'r2' }] });

    hub.handleRequest(port, { kind: 'attach', subId: 'stats', providerId: 'p1', mode: 'stats' });

    const initialStats = port.messages.find((m) => m.kind === 'stats') as { stats: { rowCount: number; subscriberCount: number } };
    expect(initialStats).toBeTruthy();
    expect(initialStats.stats.rowCount).toBe(2);
    expect(initialStats.stats.subscriberCount).toBe(1);

    port.messages.length = 0;
    timers.tick();
    const tickStats = port.messages.find((m) => m.kind === 'stats');
    expect(tickStats).toBeTruthy();
  });

  it('keeps stats listeners across a stop, emits a zeroed snapshot, and resumes them on restart', () => {
    const timers = makeFakeTimers();
    const hub = new SharedWorkerDataServicesHub({ setTimer: timers.set, clearTimer: timers.clear });
    const port = makePort();
    hub.handleRequest(port, { kind: 'attach', subId: 'data', providerId: 'p1', mode: 'data', cfg: cfg('v1') });
    const v1 = controllers.get('v1')!;
    v1.emit({ rows: [{ id: 'r1' }, { id: 'r2' }] });
    hub.handleRequest(port, { kind: 'attach', subId: 'stats', providerId: 'p1', mode: 'stats' });

    port.messages.length = 0;
    hub.handleRequest(port, { kind: 'stop', providerId: 'p1' });

    // Stop pushes one final zeroed stats snapshot to the surviving sub —
    // the diagnostics pane reflects the stopped state without being
    // unsubscribed.
    const stoppedStats = port.messages.find((m) => m.kind === 'stats') as { subId: string; stats: { rowCount: number } };
    expect(stoppedStats).toBeTruthy();
    expect(stoppedStats.subId).toBe('stats');
    expect(stoppedStats.stats.rowCount).toBe(0);

    // Restart (editor reconnect with cfg) re-creates the provider; the
    // SAME stats subscription resumes receiving ticks — it was never
    // dropped, so the client never had to re-subscribe.
    hub.handleRequest(port, {
      kind: 'attach',
      subId: 'data2',
      providerId: 'p1',
      mode: 'data',
      cfg: cfg('v2'),
      extra: { __refresh: 1 },
    });
    const v2 = controllers.get('v2')!;
    v2.emit({ rows: [{ id: 'r3' }] });

    port.messages.length = 0;
    timers.tick();
    const resumed = port.messages.find(
      (m) => m.kind === 'stats' && (m as { subId: string }).subId === 'stats',
    ) as { stats: { rowCount: number } };
    expect(resumed).toBeTruthy();
    expect(resumed.stats.rowCount).toBe(1);
  });

  it('tracks snapshot fetch duration and post-snapshot publish rates', () => {
    const timers = makeFakeTimers();
    const hub = new SharedWorkerDataServicesHub({ setTimer: timers.set, clearTimer: timers.clear });
    const portA = makePort();
    const portB = makePort();
    hub.handleRequest(portA, { kind: 'attach', subId: 'data-a', providerId: 'p1', mode: 'data', cfg: cfg() });
    hub.handleRequest(portB, { kind: 'attach', subId: 'data-b', providerId: 'p1', mode: 'data' });
    const ctrl = controllers.get('default')!;

    // Snapshot phase — not counted as client publishes.
    ctrl.emit({ rows: [{ id: 'r1' }], replace: true });
    ctrl.emit({ status: 'ready' });

    hub.handleRequest(portA, { kind: 'attach', subId: 'stats', providerId: 'p1', mode: 'stats' });
    const afterReady = portA.messages.find((m) => m.kind === 'stats') as { stats: {
      snapshotFetchMs: number | null;
      publishCount: number;
      publishPerSec: number;
    } };
    expect(afterReady.stats.snapshotFetchMs).not.toBeNull();
    expect(afterReady.stats.publishCount).toBe(0);

    portA.messages.length = 0;
    // Live tick — fan-out to two data listeners.
    ctrl.emit({ rows: [{ id: 'r1', x: 2 }] });
    timers.tick();
    const liveStats = portA.messages.find((m) => m.kind === 'stats') as { stats: {
      publishCount: number;
      publishPerSec: number;
      publishPerMin: number;
    } };
    expect(liveStats.stats.publishCount).toBe(2);
    expect(liveStats.stats.publishPerSec).toBeGreaterThan(0);
    expect(liveStats.stats.publishPerMin).toBeGreaterThan(0);
  });

  it('surfaces connection-latency timing samples and resets them on loading', () => {
    const timers = makeFakeTimers();
    const hub = new SharedWorkerDataServicesHub({ setTimer: timers.set, clearTimer: timers.clear });
    const port = makePort();
    hub.handleRequest(port, { kind: 'attach', subId: 'data', providerId: 'p1', mode: 'data', cfg: cfg() });
    hub.handleRequest(port, { kind: 'attach', subId: 'stats', providerId: 'p1', mode: 'stats' });
    const ctrl = controllers.get('default')!;

    // Provider reports the click→request and request→first-message
    // latencies; each flushes a stats snapshot immediately.
    ctrl.emit({ timing: { requestSentMs: 42 } });
    ctrl.emit({ timing: { firstMessageMs: 17 } });

    const withTiming = [...port.messages].reverse().find((m) => m.kind === 'stats') as { stats: {
      restartRequestMs: number | null;
      firstMessageMs: number | null;
    } };
    expect(withTiming.stats.restartRequestMs).toBe(42);
    expect(withTiming.stats.firstMessageMs).toBe(17);

    // A restart (loading) clears the latency fields back to null.
    port.messages.length = 0;
    ctrl.emit({ status: 'loading' });
    const afterReset = port.messages.find((m) => m.kind === 'stats') as { stats: {
      restartRequestMs: number | null;
      firstMessageMs: number | null;
    } };
    expect(afterReset.stats.restartRequestMs).toBeNull();
    expect(afterReset.stats.firstMessageMs).toBeNull();
  });

  it('resets all diagnostics counters when the provider emits loading (restart)', () => {
    const timers = makeFakeTimers();
    const hub = new SharedWorkerDataServicesHub({ setTimer: timers.set, clearTimer: timers.clear });
    const port = makePort();
    hub.handleRequest(port, { kind: 'attach', subId: 'data', providerId: 'p1', mode: 'data', cfg: cfg() });
    hub.handleRequest(port, { kind: 'attach', subId: 'stats', providerId: 'p1', mode: 'stats' });
    const ctrl = controllers.get('default')!;

    ctrl.emit({ rows: [{ id: 'r1' }, { id: 'r2' }] });
    ctrl.emit({ status: 'ready' });
    ctrl.emit({ rows: [{ id: 'r1', x: 99 }] });
    timers.tick();

    port.messages.length = 0;
    ctrl.emit({ rows: [], replace: true });
    ctrl.emit({ status: 'loading' });

    const resetStats = port.messages.find((m) => m.kind === 'stats') as { stats: {
      rowCount: number;
      msgCount: number;
      publishCount: number;
      msgPerSec: number;
      publishPerSec: number;
      publishPerMin: number;
      snapshotFetchMs: number | null;
      errorCount: number;
    } };
    expect(resetStats).toBeTruthy();
    expect(resetStats.stats.rowCount).toBe(0);
    expect(resetStats.stats.msgCount).toBe(0);
    expect(resetStats.stats.publishCount).toBe(0);
    expect(resetStats.stats.msgPerSec).toBe(0);
    expect(resetStats.stats.publishPerSec).toBe(0);
    expect(resetStats.stats.publishPerMin).toBe(0);
    expect(resetStats.stats.snapshotFetchMs).toBeNull();
    expect(resetStats.stats.errorCount).toBe(0);
  });

  it('rotates publish/min buckets while only data listeners are attached', () => {
    const timers = makeFakeTimers();
    const hub = new SharedWorkerDataServicesHub({ setTimer: timers.set, clearTimer: timers.clear });
    const port = makePort();
    hub.handleRequest(port, { kind: 'attach', subId: 'data', providerId: 'p1', mode: 'data', cfg: cfg() });
    const ctrl = controllers.get('default')!;

    ctrl.emit({ rows: [{ id: 'r1' }], replace: true });
    ctrl.emit({ status: 'ready' });
    port.messages.length = 0;

    ctrl.emit({ rows: [{ id: 'r1', x: 2 }] });
    timers.tick();

    hub.handleRequest(port, { kind: 'attach', subId: 'stats', providerId: 'p1', mode: 'stats' });
    const stats = port.messages.find((m) => m.kind === 'stats') as { stats: { publishPerMin: number; publishPerSec: number } };
    expect(stats.stats.publishPerSec).toBeGreaterThan(0);
    expect(stats.stats.publishPerMin).toBeGreaterThan(0);
  });
});

describe('SharedWorkerDataServicesHub — port closure', () => {
  it('drops every subscription owned by the closed port and stops idle providers', () => {
    const hub = new SharedWorkerDataServicesHub();
    const port = makePort();
    hub.handleRequest(port, { kind: 'attach', subId: 's1', providerId: 'p1', mode: 'data', cfg: cfg() });
    hub.handleRequest(port, { kind: 'attach', subId: 's2', providerId: 'p1', mode: 'stats' });

    hub.onPortClosed(port);

    const ctrl = controllers.get('default')!;
    expect(ctrl.stopCount).toBe(1);

    // But broadcasts no longer reach the dead port.
    port.messages.length = 0;
    ctrl.emit({ rows: [{ id: 'r1' }] });
    expect(port.messages).toHaveLength(0);
  });

  it('live ticks still reach healthy listeners when a zombie port throws on postMessage', () => {
    const hub = new SharedWorkerDataServicesHub();
    const dead = makePort();
    const alive = makePort();
    hub.handleRequest(dead, { kind: 'attach', subId: 'sDead', providerId: 'p1', mode: 'data', cfg: cfg() });
    hub.handleRequest(alive, { kind: 'attach', subId: 'sAlive', providerId: 'p1', mode: 'data' });
    const ctrl = controllers.get('default')!;

    ctrl.emit({ rows: [{ id: 'r1' }], replace: true });
    ctrl.emit({ status: 'ready' });

    // Abrupt window close: listener lingers but the port is gone.
    dead.postMessage = () => { throw new Error('port dead'); };
    dead.messages.length = 0;
    alive.messages.length = 0;

    ctrl.emit({ rows: [{ id: 'r1', x: 99 }] });

    const aliveDelta = alive.messages.find((m) => isAnyDelta(m));
    expect(aliveDelta).toBeTruthy();
    expect(rowsOf(aliveDelta!)).toEqual([{ id: 'r1', x: 99 }]);

    alive.messages.length = 0;
    ctrl.emit({ rows: [{ id: 'r1', x: 100 }] });
    expect(alive.messages.find((m) => isAnyDelta(m))).toBeTruthy();
  });
});

describe('SharedWorkerDataServicesHub — subscriber heartbeats', () => {
  it('evicts stale subscribers and stops idle providers on sweep', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const timers = makeFakeTimers();
    const hub = new SharedWorkerDataServicesHub({ setTimer: timers.set, clearTimer: timers.clear });
    const port = makePort();
    hub.handleRequest(port, { kind: 'attach', subId: 's1', providerId: 'p1', mode: 'data', cfg: cfg() });
    const ctrl = controllers.get('default')!;
    ctrl.emit({ rows: [{ id: 'r1' }] });

    vi.setSystemTime(SUBSCRIBER_PING_TIMEOUT_MS + SUBSCRIBER_SWEEP_INTERVAL_MS);
    timers.tick();

    expect(port.messages.some((m) => m.kind === 'subscription-lost')).toBe(true);
    expect(ctrl.stopCount).toBe(1);
    vi.useRealTimers();
    port.messages.length = 0;
    ctrl.emit({ rows: [{ id: 'r2' }] });
    expect(port.messages).toHaveLength(0);
  });

  it('extends ping grace for hidden subscribers', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const timers = makeFakeTimers();
    const hub = new SharedWorkerDataServicesHub({ setTimer: timers.set, clearTimer: timers.clear });
    const port = makePort();
    hub.handleRequest(port, { kind: 'attach', subId: 's1', providerId: 'p1', mode: 'data', cfg: cfg() });
    const ctrl = controllers.get('default')!;
    hub.handleRequest(port, { kind: 'ping', subId: 's1', meta: { hidden: true } });

    vi.setSystemTime(SUBSCRIBER_PING_TIMEOUT_MS + SUBSCRIBER_SWEEP_INTERVAL_MS);
    timers.tick();
    expect(ctrl.stopCount).toBe(0);

    vi.useRealTimers();
  });

  it('ping refreshes liveness and keeps the provider running', () => {
    const timers = makeFakeTimers();
    const hub = new SharedWorkerDataServicesHub({ setTimer: timers.set, clearTimer: timers.clear });
    const port = makePort();
    hub.handleRequest(port, { kind: 'attach', subId: 's1', providerId: 'p1', mode: 'data', cfg: cfg() });
    const ctrl = controllers.get('default')!;

    timers.tick(SUBSCRIBER_PING_TIMEOUT_MS / 2);
    hub.handleRequest(port, { kind: 'ping', subId: 's1', meta: { label: 'grid-1' } });
    timers.tick(SUBSCRIBER_PING_TIMEOUT_MS);

    expect(ctrl.stopCount).toBe(0);
    const intro = hub.buildIntrospectSnapshot();
    expect(intro.providers[0]?.subscribers?.[0]?.meta?.label).toBe('grid-1');
    expect(intro.providers[0]?.subscribers?.[0]?.stale).toBe(false);
  });
});

// ─── AppData wire round-trip ─────────────────────────────────────

interface AppDataPort {
  messages: unknown[];
  postMessage(m: unknown): void;
}

// Shallow-copy on capture — see makePort note (hub reuses fan-out events).
function makeAppDataPort(): AppDataPort {
  const messages: unknown[] = [];
  return {
    messages,
    postMessage(m) { messages.push({ ...(m as object) }); },
  };
}

function appDataRow(configId: string, name: string, values: Record<string, unknown> = {}) {
  return { configId, name, isPublic: false, values, userId: 'alice' };
}

describe('SharedWorkerDataServicesHub — AppData', () => {
  it('snapshot delivered on attach reflects the seed', () => {
    const hub = new SharedWorkerDataServicesHub();
    const port = makeAppDataPort();
    hub.handleAppDataRequest(port, {
      kind: 'appdata-attach',
      subId: 'a',
      seed: [appDataRow('a', 'positions', { asOfDate: '2026-04-01' })],
    });
    expect(port.messages).toHaveLength(1);
    expect(port.messages[0]).toMatchObject({
      kind: 'appdata-snapshot',
      subId: 'a',
      rows: [{ configId: 'a', name: 'positions' }],
    });
  });

  it('second attacher sees the previously-seeded snapshot (no double-hydrate)', async () => {
    const hub = new SharedWorkerDataServicesHub();
    const portA = makeAppDataPort();
    const portB = makeAppDataPort();

    // First attacher seeds.
    hub.handleAppDataRequest(portA, {
      kind: 'appdata-attach',
      subId: 'a',
      seed: [appDataRow('a', 'positions', { asOfDate: '2026-04-01' })],
    });
    // Second attacher attempts a different seed — ignored.
    void hub.handleAppDataRequest(portB, {
      kind: 'appdata-attach',
      subId: 'b',
      seed: [appDataRow('z', 'wouldOverwrite')],
    });
    await Promise.resolve();
    expect(portB.messages[0]).toMatchObject({
      kind: 'appdata-snapshot',
      rows: [{ configId: 'a', name: 'positions' }],
    });
  });

  it('reattach resyncs AppData rows persisted while the worker stayed alive', async () => {
    const rows = new Map<string, AppConfigRow>([
      ['ad-1', {
        configId: 'ad-1',
        appId: 'TestApp',
        userId: 'dev1',
        componentType: 'data-provider',
        componentSubType: 'appdata',
        isTemplate: false,
        displayText: 'App1Data',
        payload: {
          providerType: 'appdata',
          variables: {
            userId: { key: 'userId', value: 'alice', type: 'string', durability: 'volatile' },
          },
          __providerMeta: {},
        },
        createdBy: 'dev1',
        updatedBy: 'dev1',
        creationTime: '2026-01-01T00:00:00.000Z',
        updatedTime: '2026-01-01T00:00:00.000Z',
      }],
    ]);
    const cm = {
      async getAllConfigsUnfiltered() { return [...rows.values()]; },
    async getConfigsByComponentTypesUnfiltered(types: string[]) { return [...rows.values()].filter((r) => types.includes(r.componentType)); },
      async getConfig(id: string) { return rows.get(id); },
      async saveConfig(row: AppConfigRow) { rows.set(row.configId, row); },
      async deleteConfig(id: string) { rows.delete(id); },
    } as unknown as ConfigManager;

    const hub = new SharedWorkerDataServicesHub({ configManager: cm });
    await hub.hydrateAppData();

    const portA = makeAppDataPort();
    void hub.handleAppDataRequest(portA, { kind: 'appdata-attach', subId: 'a' });
    await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
    expect(portA.messages[0]).toMatchObject({
      kind: 'appdata-snapshot',
      rows: [expect.objectContaining({ name: 'App1Data' })],
    });

    rows.set('ad-2', {
      ...rows.get('ad-1')!,
      configId: 'ad-2',
      displayText: 'App2Data',
      payload: {
        providerType: 'appdata',
        variables: {
          clientId: { key: 'clientId', value: 'desk-1', type: 'string', durability: 'volatile' },
        },
        __providerMeta: {},
      },
    });

    const portB = makeAppDataPort();
    void hub.handleAppDataRequest(portB, { kind: 'appdata-attach', subId: 'b' });
    await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
    expect(portB.messages[0]).toMatchObject({
      kind: 'appdata-snapshot',
      rows: expect.arrayContaining([
        expect.objectContaining({ name: 'App1Data' }),
        expect.objectContaining({ name: 'App2Data' }),
      ]),
    });
  });

  it('set fans out a delta to every attached subscriber including originator', () => {
    const hub = new SharedWorkerDataServicesHub();
    const portA = makeAppDataPort();
    const portB = makeAppDataPort();
    hub.handleAppDataRequest(portA, { kind: 'appdata-attach', subId: 'a', seed: [] });
    hub.handleAppDataRequest(portB, { kind: 'appdata-attach', subId: 'b' });

    const next = appDataRow('a1', 'positions', { asOfDate: '2026-05-08' });
    hub.handleAppDataRequest(portA, { kind: 'appdata-set', reqId: 'r1', row: next });

    // A: snapshot, delta, ack (broadcast happens before ack — see hub).
    expect(portA.messages).toHaveLength(3);
    // B: snapshot, delta.
    expect(portB.messages).toHaveLength(2);

    const aDelta = portA.messages[1] as { kind: string; subId: string; op: string; row: { configId: string } };
    expect(aDelta).toMatchObject({ kind: 'appdata-delta', subId: 'a', op: 'upsert', row: { configId: 'a1' } });
    const aAck = portA.messages[2] as { kind: string; reqId: string; ok: boolean };
    expect(aAck).toMatchObject({ kind: 'appdata-ack', reqId: 'r1', ok: true });

    const bDelta = portB.messages[1] as { kind: string; subId: string; op: string };
    expect(bDelta).toMatchObject({ kind: 'appdata-delta', subId: 'b', op: 'upsert' });
  });

  it('remove fans out a remove delta + ack', () => {
    const hub = new SharedWorkerDataServicesHub();
    const port = makeAppDataPort();
    hub.handleAppDataRequest(port, {
      kind: 'appdata-attach', subId: 'a',
      seed: [appDataRow('a1', 'positions')],
    });
    hub.handleAppDataRequest(port, {
      kind: 'appdata-remove', reqId: 'r1', configId: 'a1',
    });
    const lastTwo = port.messages.slice(-2) as { kind: string }[];
    expect(lastTwo[0]).toMatchObject({ kind: 'appdata-delta', op: 'remove' });
    expect(lastTwo[1]).toMatchObject({ kind: 'appdata-ack', reqId: 'r1', ok: true });
  });

  it('detach stops further deltas reaching the listener', () => {
    const hub = new SharedWorkerDataServicesHub();
    const portA = makeAppDataPort();
    const portB = makeAppDataPort();
    hub.handleAppDataRequest(portA, { kind: 'appdata-attach', subId: 'a', seed: [] });
    hub.handleAppDataRequest(portB, { kind: 'appdata-attach', subId: 'b' });
    hub.handleAppDataRequest(portA, { kind: 'appdata-detach', subId: 'a' });

    portA.messages.length = 0;
    portB.messages.length = 0;
    hub.handleAppDataRequest(portB, {
      kind: 'appdata-set', reqId: 'r2',
      row: appDataRow('a2', 'trades'),
    });
    expect(portA.messages).toHaveLength(0);
    // B: delta + ack (no snapshot — already attached).
    expect(portB.messages).toHaveLength(2);
  });

  it('onPortClosed cleans up appdata listeners', () => {
    const hub = new SharedWorkerDataServicesHub();
    const portA = makeAppDataPort();
    const portB = makeAppDataPort();
    hub.handleAppDataRequest(portA, { kind: 'appdata-attach', subId: 'a', seed: [] });
    hub.handleAppDataRequest(portB, { kind: 'appdata-attach', subId: 'b' });
    hub.onPortClosed(portA);

    portA.messages.length = 0;
    portB.messages.length = 0;
    hub.handleAppDataRequest(portB, {
      kind: 'appdata-set', reqId: 'r3',
      row: appDataRow('a3', 'orders'),
    });
    expect(portA.messages).toHaveLength(0);
    expect(portB.messages).toHaveLength(2);
  });
});

// ─── REST transport — hub round-trip ─────────────────────────────────
//
// The hub's per-request plumbing is transport-agnostic; the same
// invariants the mock-based tests above exercise should hold for any
// registered factory. This block plugs the real `startRest` factory
// (with an injected fetchImpl) into the registry and asserts the
// attach → snapshot → ready flow works through the hub.
//
// Future transports (websocket, kafka, ...) get a parallel describe
// block with the same shape.

describe('SharedWorkerDataServicesHub — REST round-trip', () => {
  it('attach → fetched rows → ready over the hub protocol', async () => {
    // Inject the REST factory directly so we control the fetchImpl.
    // The default registration in registry.ts uses global fetch; tests
    // need a stubbed response.
    const { startRest } = await import('../providers/transports/rest.js');
    registerProvider('rest' as ProviderConfig['providerType'], (cfg, emit) =>
      startRest(cfg as never, emit, {
        fetchImpl: async () =>
          new Response(JSON.stringify([{ id: 'r1', x: 1 }, { id: 'r2', x: 2 }]), { status: 200 }),
      }),
    );

    const hub = new SharedWorkerDataServicesHub();
    const port = makePort();

    const restCfg = {
      providerType: 'rest',
      baseUrl: 'http://api.test',
      endpoint: '/positions',
      method: 'GET',
      keyColumn: 'id',
    } as unknown as ProviderConfig;

    hub.handleRequest(port, { kind: 'attach', subId: 's1', providerId: 'p-rest', mode: 'data', cfg: restCfg });

    // Same flush dance as rest.test.ts — Response.text() needs a real
    // macrotask hop in jsdom + undici.
    for (let i = 0; i < 3; i++) await new Promise<void>((r) => setTimeout(r, 0));

    // Initial attach replay (cache empty), then loading, then the
    // post-fetch replace with rows (pre-ready → delta-bin), then ready.
    const deltas = port.messages.filter(isAnyDelta);
    const statuses = port.messages.filter((m) => m.kind === 'status') as Array<Event & { status: string }>;

    expect(statuses.map((s) => s.status)).toEqual(['loading', 'ready']);

    // The last delta carries the fetched rows (the immediate attach
    // replay sent an empty cache; the post-fetch broadcast carried
    // the snapshot). Hub dedupes by keyColumn so we expect exactly 2.
    const finalDelta = deltas[deltas.length - 1]!;
    expect(isReplaceDelta(finalDelta)).toBe(true);
    const finalRows = rowsOf(finalDelta)!;
    expect(finalRows).toHaveLength(2);
    expect(finalRows.map((r) => (r as { id: string }).id)).toEqual(['r1', 'r2']);

    // Detach is a clean fire-and-forget; no further events.
    port.messages.length = 0;
    hub.handleRequest(port, { kind: 'detach', subId: 's1' });
    expect(port.messages).toHaveLength(0);

    // Restore the mock factory the rest of the suite expects so other
    // tests in this file aren't disturbed by the REST registration.
    registerProvider('mock' as ProviderConfig['providerType'], (cfg, emit) => {
      const ctrl: TestController = { emit, stopCount: 0, restartLog: [] };
      controllers.set((cfg as unknown as { __testKey?: string }).__testKey ?? 'default', ctrl);
      return { stop() { ctrl.stopCount += 1; }, restart(extra) { ctrl.restartLog.push(extra); } };
    });
  });
});

function mockProviderRow(id: string, testKey = 'default'): AppConfigRow {
  return {
    configId: id,
    appId: 'TestApp',
    userId: 'system',
    componentType: 'data-provider',
    componentSubType: 'mock',
    isTemplate: false,
    displayText: id,
    payload: {
      providerType: 'mock',
      keyColumn: 'id',
      __testKey: testKey,
      __providerMeta: { public: true },
    },
    createdBy: 'dev1',
    updatedBy: 'dev1',
    creationTime: '2026-01-01T00:00:00.000Z',
    updatedTime: '2026-01-01T00:00:00.000Z',
  };
}

function mockConfigManager(rows: AppConfigRow[]): ConfigManager {
  const map = new Map(rows.map((r) => [r.configId, r]));
  return {
    getAppId() { return 'TestApp'; },
    async getAllConfigsUnfiltered() { return [...map.values()]; },
    async getConfigsByComponentTypesUnfiltered(types: string[]) { return [...map.values()].filter((r) => types.includes(r.componentType)); },
    async getConfig(id: string) { return map.get(id); },
  } as unknown as ConfigManager;
}

function makeAnyPort(): PortLike & { messages: unknown[] } {
  const messages: unknown[] = [];
  return {
    messages,
    postMessage(m: unknown) { messages.push({ ...(m as object) }); },
  };
}

describe('SharedWorkerDataServicesHub — config catalog', () => {
  it('cfg-free first attach resolves cfg from catalog and starts the provider', async () => {
    const cache = new ConfigCatalogCache(mockConfigManager([mockProviderRow('p1')]));
    await cache.loadAll();
    const hub = new SharedWorkerDataServicesHub({ configCatalog: cache });
    const port = makePort();

    hub.handleRequest(port, { kind: 'attach', subId: 's1', providerId: 'p1', mode: 'data' });

    expect(port.messages.some((m) => m.kind === 'status' && (m as { status?: string }).status === 'error')).toBe(false);
    expect(port.messages.some((m) => m.kind === 'delta' && (m as { replace?: boolean }).replace)).toBe(true);
  });

  it('first attach without cfg or catalog entry returns error', async () => {
    const cache = new ConfigCatalogCache(mockConfigManager([]));
    await cache.loadAll();
    const hub = new SharedWorkerDataServicesHub({ configCatalog: cache });
    const port = makePort();

    hub.handleRequest(port, { kind: 'attach', subId: 's1', providerId: 'missing', mode: 'data' });

    expect(port.messages).toHaveLength(1);
    expect(port.messages[0]).toMatchObject({
      kind: 'status',
      status: 'error',
      error: expect.stringContaining('not in catalog'),
    });
  });

  it('hub-ready, get-config, and list-configs respond from catalog', async () => {
    const cache = new ConfigCatalogCache(mockConfigManager([mockProviderRow('p1'), mockProviderRow('p2')]));
    await cache.loadAll();
    const hub = new SharedWorkerDataServicesHub({ configCatalog: cache });
    const port = makeAnyPort();

    hub.handleRequest(port, { kind: 'hub-ready', reqId: 'ready-1' });
    hub.handleRequest(port, { kind: 'get-config', reqId: 'get-1', providerId: 'p1' });
    hub.handleRequest(port, { kind: 'list-configs', reqId: 'list-1' });
    // get-config now resolves the provider on demand (async), so match by
    // reqId rather than positional index.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    const byReqId = (reqId: string) =>
      port.messages.find((m) => (m as { reqId?: string }).reqId === reqId);
    expect(byReqId('ready-1')).toMatchObject({ kind: 'config-snapshot', ok: true, ready: true });
    expect(byReqId('get-1')).toMatchObject({ kind: 'config-snapshot', ok: true, config: { providerId: 'p1' } });
    expect(byReqId('list-1')).toMatchObject({
      kind: 'config-snapshot',
      ok: true,
      configs: expect.arrayContaining([
        expect.objectContaining({ providerId: 'p1' }),
        expect.objectContaining({ providerId: 'p2' }),
      ]),
    });
  });

  it('get-config resolves a provider on demand before the catalog preloads', async () => {
    const cache = new ConfigCatalogCache(mockConfigManager([mockProviderRow('p1')]));
    // Deliberately skip loadAll() — the worker should still resolve the one
    // provider via a single-row read (Phase 3 on-demand path).
    expect(cache.isReady()).toBe(false);
    const hub = new SharedWorkerDataServicesHub({ configCatalog: cache });
    const port = makeAnyPort();

    hub.handleRequest(port, { kind: 'get-config', reqId: 'get-od', providerId: 'p1' });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(port.messages.find((m) => (m as { reqId?: string }).reqId === 'get-od')).toMatchObject({
      kind: 'config-snapshot',
      ok: true,
      config: { providerId: 'p1' },
    });
    // The resolved row is now cached, so a follow-up attach finds it.
    expect(cache.get('p1')?.providerId).toBe('p1');
  });

  it('config-invalidate reloads an updated row from ConfigManager', async () => {
    const rows = new Map([['p1', { ...mockProviderRow('p1'), displayText: 'Original' }]]);
    const cm = {
      async getAllConfigsUnfiltered() { return [...rows.values()]; },
    async getConfigsByComponentTypesUnfiltered(types: string[]) { return [...rows.values()].filter((r) => types.includes(r.componentType)); },
      async getConfig(id: string) { return rows.get(id); },
    } as unknown as ConfigManager;
    const cache = new ConfigCatalogCache(cm);
    await cache.loadAll();
    const hub = new SharedWorkerDataServicesHub({ configCatalog: cache });
    const port = makeAnyPort();

    rows.set('p1', { ...mockProviderRow('p1'), displayText: 'Updated' });
    await cache.invalidate('p1');
    expect(cache.get('p1')?.name).toBe('Updated');

    port.messages.length = 0;
    hub.handleRequest(port, { kind: 'get-config', reqId: 'get-2', providerId: 'p1' });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(port.messages[0]).toMatchObject({
      kind: 'config-snapshot',
      ok: true,
      config: { providerId: 'p1', name: 'Updated' },
    });
  });

  it('handleConfigInvalidate RPC reloads a single catalog row', async () => {
    const rows = new Map([['p1', { ...mockProviderRow('p1'), displayText: 'Original' }]]);
    const cm = {
      async getAllConfigsUnfiltered() { return [...rows.values()]; },
    async getConfigsByComponentTypesUnfiltered(types: string[]) { return [...rows.values()].filter((r) => types.includes(r.componentType)); },
      async getConfig(id: string) { return rows.get(id); },
    } as unknown as ConfigManager;
    const cache = new ConfigCatalogCache(cm);
    await cache.loadAll();
    const hub = new SharedWorkerDataServicesHub({ configCatalog: cache });
    const port = makeAnyPort();

    rows.set('p1', { ...mockProviderRow('p1'), displayText: 'Updated' });
    hub.handleRequest(port, { kind: 'config-invalidate', reqId: 'inv-1', providerId: 'p1' });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(port.messages.find((m) => (m as { reqId?: string }).reqId === 'inv-1')).toMatchObject({
      kind: 'config-snapshot',
      ok: true,
    });
    expect(cache.get('p1')?.name).toBe('Updated');
  });

  it('hub-introspect returns running providers, catalog idle rows, and AppData', async () => {
    const cache = new ConfigCatalogCache(mockConfigManager([mockProviderRow('p1'), mockProviderRow('p2')]));
    await cache.loadAll();
    const hub = new SharedWorkerDataServicesHub({ configCatalog: cache });
    const port = makePort();

    hub.handleRequest(port, { kind: 'attach', subId: 'd1', providerId: 'p1', mode: 'data', cfg: cfg() });
    hub.handleAppDataRequest(port, {
      kind: 'appdata-attach',
      subId: 'appdata-1',
    });
    hub.handleAppDataRequest(port, {
      kind: 'appdata-upsert',
      reqId: 'upsert-1',
      row: {
        configId: 'cfg-positions',
        name: 'positions',
        isPublic: true,
        values: { asOfDate: '2026-05-28' },
        userId: 'system',
      },
    });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    hub.handleRequest(port, { kind: 'hub-introspect', reqId: 'intro-1' });

    const snap = port.messages.find((m) => (m as { reqId?: string }).reqId === 'intro-1') as {
      ok: boolean;
      introspect?: {
        runningProviderCount: number;
        providers: Array<{ providerId: string; running: boolean }>;
        appData: { rows: Array<{ name: string }> };
      };
    };
    expect(snap).toMatchObject({ kind: 'config-snapshot', ok: true });
    expect(snap.introspect?.runningProviderCount).toBe(1);
    expect(snap.introspect?.providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ providerId: 'p1', name: 'p1', running: true, cfg: expect.objectContaining({ providerType: 'mock' }) }),
        expect.objectContaining({ providerId: 'p2', name: 'p2', running: false, cfg: expect.objectContaining({ providerType: 'mock' }) }),
      ]),
    );
    expect(snap.introspect?.appData.rows).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'positions', keyCount: 1, values: { asOfDate: '2026-05-28' } })]),
    );
  });
});

describe('SharedWorkerDataServicesHub — live binary fan-out', () => {
  it('broadcasts large post-ready live ticks as delta-bin to every listener', () => {
    const hub = new SharedWorkerDataServicesHub();
    const portA = makePort();
    const portB = makePort();
    hub.handleRequest(portA, { kind: 'attach', subId: 'sA', providerId: 'p1', mode: 'data', cfg: cfg() });
    hub.handleRequest(portB, { kind: 'attach', subId: 'sB', providerId: 'p1', mode: 'data' });
    const ctrl = controllers.get('default')!;
    ctrl.emit({ rows: [{ id: 'seed', x: 0 }], replace: true });
    ctrl.emit({ status: 'ready' });
    portA.messages.length = 0;
    portB.messages.length = 0;

    // Sweep-style frame: many distinct keys, well over LIVE_BIN_MIN_ROWS.
    const rows = Array.from({ length: 100 }, (_, i) => ({ id: `r${i}`, x: i }));
    ctrl.emit({ rows });

    for (const port of [portA, portB]) {
      const bins = port.messages.filter((m) => m.kind === 'delta-bin');
      expect(bins).toHaveLength(1);
      expect(rowsOf(bins[0]!)).toHaveLength(100);
      // Incremental tick — must not wipe the grid.
      expect(Boolean((bins[0] as { replace?: boolean }).replace)).toBe(false);
    }
  });

  it('keeps small post-ready conflated ticks as plain object deltas', () => {
    const hub = new SharedWorkerDataServicesHub();
    const port = makePort();
    hub.handleRequest(port, { kind: 'attach', subId: 's1', providerId: 'p1', mode: 'data', cfg: cfg() });
    const ctrl = controllers.get('default')!;
    ctrl.emit({ rows: [{ id: 'r1', x: 0 }], replace: true });
    ctrl.emit({ status: 'ready' });
    port.messages.length = 0;

    ctrl.emit({ rows: [{ id: 'r1', x: 1 }, { id: 'r2', x: 2 }] });

    const deltas = port.messages.filter(isAnyDelta);
    expect(deltas).toHaveLength(1);
    expect(deltas[0]!.kind).toBe('delta');
    expect(rowsOf(deltas[0]!)).toHaveLength(2);
  });
});

describe('SharedWorkerDataServicesHub — keyColumn mismatch diagnostics', () => {
  it('drops rows whose keyColumn does not resolve and warns once per cycle', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const hub = new SharedWorkerDataServicesHub();
      const port = makePort();
      // cfg() keys on 'id'; rows below carry 'ID' (wrong case) → every key is null.
      hub.handleRequest(port, { kind: 'attach', subId: 's1', providerId: 'p1', mode: 'data', cfg: cfg() });
      const ctrl = controllers.get('default')!;
      port.messages.length = 0;

      ctrl.emit({ rows: [{ ID: 'r1', x: 1 }, { ID: 'r2', x: 2 }], replace: true });
      // Second batch in the same cycle must NOT produce a second warning.
      ctrl.emit({ rows: [{ ID: 'r3', x: 3 }] });

      // Nothing reaches subscribers (cache + broadcasts are empty).
      const broadcastRows = port.messages
        .filter((m) => m.kind === 'delta')
        .flatMap((m) => (m as Event & { rows: unknown[] }).rows);
      expect(broadcastRows).toHaveLength(0);

      // Exactly one warning, naming the key and the actual fields.
      expect(warn).toHaveBeenCalledTimes(1);
      const msg = warn.mock.calls[0][0] as string;
      expect(msg).toContain('"id"');
      expect(msg).toContain('ID'); // sample field names
    } finally {
      warn.mockRestore();
    }
  });

  it('surfaces keyDropCount in the hub introspect snapshot', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const hub = new SharedWorkerDataServicesHub();
      const port = makePort();
      hub.handleRequest(port, { kind: 'attach', subId: 's1', providerId: 'p1', mode: 'data', cfg: cfg() });
      const ctrl = controllers.get('default')!;
      ctrl.emit({ rows: [{ ID: 'r1' }, { ID: 'r2' }, { ID: 'r3' }], replace: true });

      hub.handleRequest(port, { kind: 'hub-introspect', reqId: 'intro-keydrop' });
      const snap = port.messages.find((m) => (m as { reqId?: string }).reqId === 'intro-keydrop') as {
        introspect?: { providers: Array<{ providerId: string; keyDropCount?: number; rowCount?: number }> };
      };
      const row = snap.introspect?.providers.find((p) => p.providerId === 'p1');
      expect(row?.keyDropCount).toBe(3);
      expect(row?.rowCount).toBe(0);
    } finally {
      warn.mockRestore();
    }
  });

  it('resets the warning + drop count on provider restart (status loading)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const hub = new SharedWorkerDataServicesHub();
      const port = makePort();
      hub.handleRequest(port, { kind: 'attach', subId: 's1', providerId: 'p1', mode: 'data', cfg: cfg() });
      const ctrl = controllers.get('default')!;

      ctrl.emit({ rows: [{ ID: 'r1' }], replace: true });
      expect(warn).toHaveBeenCalledTimes(1);

      // A new cycle (loading) re-arms the one-shot warning.
      ctrl.emit({ status: 'loading' });
      ctrl.emit({ rows: [{ ID: 'r2' }], replace: true });
      expect(warn).toHaveBeenCalledTimes(2);
    } finally {
      warn.mockRestore();
    }
  });
});

describe('SharedWorkerDataServicesHub — thin field-level deltas (cfg.thinDeltas)', () => {
  /** Hub with a thin-delta provider driven to ready with seed rows. */
  function thinHub(seed: unknown[]) {
    const hub = new SharedWorkerDataServicesHub();
    const port = makePort();
    hub.handleRequest(port, {
      kind: 'attach', subId: 's1', providerId: 'p1', mode: 'data',
      cfg: cfg('default', { thinDeltas: true }),
    });
    const ctrl = controllers.get('default')!;
    ctrl.emit({ rows: seed, replace: true });
    ctrl.emit({ status: 'ready' });
    port.messages.length = 0;
    return { hub, ctrl, port };
  }

  const patchesOf = (m: Event): readonly RowPatch[] | null => {
    if (m.kind !== 'delta-patch') return null;
    if (m.patches) return m.patches;
    if (m.buf) return JSON.parse(REPLAY_DECODER.decode(m.buf)) as RowPatch[];
    return [];
  };

  it('posts sub-init with the keyColumn before the replay on attach', () => {
    const hub = new SharedWorkerDataServicesHub();
    const port = makePort();
    hub.handleRequest(port, {
      kind: 'attach', subId: 's1', providerId: 'p1', mode: 'data',
      cfg: cfg('default', { thinDeltas: true }),
    });
    expect(port.messages[0]).toMatchObject({ kind: 'sub-init', subId: 's1', keyColumn: 'id' });
    expect(port.messages[1]).toMatchObject({ kind: 'status', status: 'loading' });
    expect(port.messages[2]).toMatchObject({ kind: 'delta', replace: true });
  });

  it('broadcasts only the changed top-level fields for an updated row', () => {
    const { ctrl, port } = thinHub([{ id: 'r1', px: 1, qty: 10 }]);

    ctrl.emit({ rows: [{ id: 'r1', px: 2, qty: 10 }] });

    const patchEvents = port.messages.filter((m) => m.kind === 'delta-patch');
    expect(patchEvents).toHaveLength(1);
    expect(patchesOf(patchEvents[0]!)).toEqual([{ k: 'r1', s: { px: 2 } }]);
    // No full-row delta rides alongside.
    expect(port.messages.filter(isAnyDelta)).toHaveLength(0);
  });

  it('ships inserts (unseen keys) as full rows under f', () => {
    const { ctrl, port } = thinHub([{ id: 'r1', px: 1 }]);

    ctrl.emit({ rows: [{ id: 'r2', px: 5 }] });

    const patches = patchesOf(port.messages.find((m) => m.kind === 'delta-patch')!);
    expect(patches).toEqual([{ k: 'r2', f: { id: 'r2', px: 5 } }]);
  });

  it('reports removed fields under d', () => {
    const { ctrl, port } = thinHub([{ id: 'r1', px: 1, stale: true }]);

    ctrl.emit({ rows: [{ id: 'r1', px: 1 }] });

    const patches = patchesOf(port.messages.find((m) => m.kind === 'delta-patch')!);
    expect(patches).toEqual([{ k: 'r1', d: ['stale'] }]);
  });

  it('skips rows that did not observably change (free conflation)', () => {
    const { ctrl, port } = thinHub([{ id: 'r1', px: 1 }]);

    ctrl.emit({ rows: [{ id: 'r1', px: 1 }] });

    expect(port.messages.filter((m) => m.kind === 'delta-patch')).toHaveLength(0);
    expect(port.messages.filter(isAnyDelta)).toHaveLength(0);
  });

  it('keeps the full row in the hub cache so late joiners still replay complete rows', () => {
    const { hub, ctrl } = thinHub([{ id: 'r1', px: 1, qty: 10 }]);

    ctrl.emit({ rows: [{ id: 'r1', px: 2, qty: 10 }] });

    const late = makePort();
    hub.handleRequest(late, { kind: 'attach', subId: 'late', providerId: 'p1', mode: 'data' });
    const replay = late.messages.find(isReplaceDelta)!;
    expect(rowsOf(replay)).toEqual([{ id: 'r1', px: 2, qty: 10 }]);
  });

  it('encodes large patch batches to a shared buffer (one serialization, N byte copies)', () => {
    const seed = Array.from({ length: 100 }, (_, i) => ({ id: `r${i}`, x: 0 }));
    const { hub, ctrl, port } = thinHub(seed);
    const portB = makePort();
    hub.handleRequest(portB, { kind: 'attach', subId: 'sB', providerId: 'p1', mode: 'data' });
    port.messages.length = 0;
    portB.messages.length = 0;

    ctrl.emit({ rows: Array.from({ length: 100 }, (_, i) => ({ id: `r${i}`, x: 1 })) });

    const evA = port.messages.find((m) => m.kind === 'delta-patch')!;
    const evB = portB.messages.find((m) => m.kind === 'delta-patch')!;
    // (Not toBeInstanceOf — jsdom's realm has its own Uint8Array.)
    expect(ArrayBuffer.isView((evA as { buf?: Uint8Array }).buf)).toBe(true);
    // Identity: encoded once, byte-copied per port (fake ports share refs).
    expect((evB as { buf?: Uint8Array }).buf).toBe((evA as { buf?: Uint8Array }).buf);
    expect(patchesOf(evA)).toHaveLength(100);
    expect(patchesOf(evA)![0]).toEqual({ k: 'r0', s: { x: 1 } });
  });

  it('replace frames bypass the thin path — restarts still broadcast full rows', () => {
    const { ctrl, port } = thinHub([{ id: 'r1', px: 1 }]);

    ctrl.emit({ status: 'loading' });
    port.messages.length = 0;
    ctrl.emit({ rows: [{ id: 'r1', px: 9 }], replace: true });

    expect(port.messages.filter((m) => m.kind === 'delta-patch')).toHaveLength(0);
    const replace = port.messages.find(isReplaceDelta)!;
    expect(rowsOf(replace)).toEqual([{ id: 'r1', px: 9 }]);
  });
});

describe('SharedWorkerDataServicesHub — columnar wire format (cfg.wireFormat)', () => {
  it('encodes pre-ready snapshot chunks columnar with enc=col, decodable and shared across ports', () => {
    const hub = new SharedWorkerDataServicesHub();
    const a = makePort();
    const b = makePort();
    hub.handleRequest(a, {
      kind: 'attach', subId: 'sA', providerId: 'p1', mode: 'data',
      cfg: cfg('default', { wireFormat: 'columnar' }),
    });
    hub.handleRequest(b, { kind: 'attach', subId: 'sB', providerId: 'p1', mode: 'data' });
    const ctrl = controllers.get('default')!;
    a.messages.length = 0;
    b.messages.length = 0;

    ctrl.emit({ rows: Array.from({ length: 700 }, (_, i) => ({ id: `r${i}`, x: i })), replace: true });

    const chunksA = a.messages.filter((m) => m.kind === 'delta-bin');
    const chunksB = b.messages.filter((m) => m.kind === 'delta-bin');
    expect(chunksA).toHaveLength(2);
    expect(chunksA.every((c) => (c as { enc?: string }).enc === 'col')).toBe(true);
    expect((chunksB[0] as { buf: Uint8Array }).buf).toBe((chunksA[0] as { buf: Uint8Array }).buf);
    const rows = chunksA.flatMap((c) => rowsOf(c)) as Array<{ id: string; x: number }>;
    expect(rows).toHaveLength(700);
    expect(rows[0]).toEqual({ id: 'r0', x: 0 });
    expect(rows[699]).toEqual({ id: 'r699', x: 699 });
  });

  it('replays the cache to late joiners as columnar chunks', () => {
    const hub = new SharedWorkerDataServicesHub();
    const primer = makePort();
    hub.handleRequest(primer, {
      kind: 'attach', subId: 'primer', providerId: 'p1', mode: 'data',
      cfg: cfg('default', { wireFormat: 'columnar' }),
    });
    const ctrl = controllers.get('default')!;
    ctrl.emit({ rows: [{ id: 'r1', px: 1.5, live: true }, { id: 'r2', px: 2.5, live: false }], replace: true });
    ctrl.emit({ status: 'ready' });

    const late = makePort();
    hub.handleRequest(late, { kind: 'attach', subId: 'late', providerId: 'p1', mode: 'data' });
    const chunk = late.messages.find((m) => m.kind === 'delta-bin')!;
    expect((chunk as { enc?: string }).enc).toBe('col');
    expect(rowsOf(chunk)).toEqual([
      { id: 'r1', px: 1.5, live: true },
      { id: 'r2', px: 2.5, live: false },
    ]);
  });

  it('broadcasts large post-ready live ticks columnar', () => {
    const hub = new SharedWorkerDataServicesHub();
    const port = makePort();
    hub.handleRequest(port, {
      kind: 'attach', subId: 's1', providerId: 'p1', mode: 'data',
      cfg: cfg('default', { wireFormat: 'columnar' }),
    });
    const ctrl = controllers.get('default')!;
    ctrl.emit({ rows: [{ id: 'seed', x: 0 }], replace: true });
    ctrl.emit({ status: 'ready' });
    port.messages.length = 0;

    ctrl.emit({ rows: Array.from({ length: 100 }, (_, i) => ({ id: `r${i}`, x: i })) });

    const bins = port.messages.filter((m) => m.kind === 'delta-bin');
    expect(bins).toHaveLength(1);
    expect((bins[0] as { enc?: string }).enc).toBe('col');
    expect(rowsOf(bins[0]!)).toHaveLength(100);
  });

  it('providers without wireFormat default to columnar (enc=col)', () => {
    const hub = new SharedWorkerDataServicesHub();
    const port = makePort();
    hub.handleRequest(port, { kind: 'attach', subId: 's1', providerId: 'p1', mode: 'data', cfg: cfg() });
    const ctrl = controllers.get('default')!;
    ctrl.emit({ rows: Array.from({ length: 100 }, (_, i) => ({ id: `r${i}` })), replace: true });

    const bins = port.messages.filter((m) => m.kind === 'delta-bin');
    expect(bins.length).toBeGreaterThan(0);
    expect(bins.every((b) => (b as { enc?: string }).enc === 'col')).toBe(true);
  });

  it('wireFormat: "json" opts out of columnar (enc=json)', () => {
    const hub = new SharedWorkerDataServicesHub();
    const port = makePort();
    hub.handleRequest(port, {
      kind: 'attach', subId: 's1', providerId: 'p1', mode: 'data',
      cfg: cfg('default', { wireFormat: 'json' }),
    });
    const ctrl = controllers.get('default')!;
    ctrl.emit({ rows: Array.from({ length: 100 }, (_, i) => ({ id: `r${i}` })), replace: true });

    const bins = port.messages.filter((m) => m.kind === 'delta-bin');
    expect(bins.length).toBeGreaterThan(0);
    expect(bins.every((b) => (b as { enc?: string }).enc === 'json')).toBe(true);
  });
});

describe('SharedWorkerDataServicesHub — fan-out worker pool', () => {
  interface PooledPort extends PortLike {
    messages: Event[];
    fanOutClientId: string;
  }

  function makePooledPort(clientId: string): PooledPort {
    const messages: Event[] = [];
    return {
      fanOutClientId: clientId,
      messages,
      postMessage(m: unknown) {
        messages.push({ ...(m as Event) });
      },
    };
  }

  /** Minimal pool double — synchronous broadcast like the real pool. */
  function makeMockFanOutPool(ports: Map<string, PooledPort>) {
    const activeSubIds = new Set<string>();
    return {
      createPortProxy(clientId: string): PortLike {
        const existing = ports.get(clientId);
        if (existing) return existing;
        const port = makePooledPort(clientId);
        ports.set(clientId, port);
        return port;
      },
      getProxy(clientId: string) { return ports.get(clientId); },
      registerPending() {},
      activateSubscriber(subId: string) { activeSubIds.add(subId); },
      unregisterSubscriber(subId: string) { activeSubIds.delete(subId); },
      unregisterClient(clientId: string) { ports.delete(clientId); },
      isActive(subId: string) { return activeSubIds.has(subId); },
      async broadcast(
        items: ReadonlyArray<{ clientId: string; subId: string }>,
        event: unknown,
      ) {
        const dead: string[] = [];
        for (const item of items) {
          if (!activeSubIds.has(item.subId)) { dead.push(item.subId); continue; }
          const port = ports.get(item.clientId);
          if (!port) { dead.push(item.subId); continue; }
          try {
            port.postMessage({ ...(event as Event), subId: item.subId });
          } catch {
            dead.push(item.subId);
          }
        }
        return dead;
      },
      dispose() {},
    };
  }

  it('routes multi-listener broadcasts through the fan-out pool', async () => {
    const pooled = new Map<string, PooledPort>();
    const fanOutPool = makeMockFanOutPool(pooled);
    const hub = new SharedWorkerDataServicesHub({ fanOutPool: fanOutPool as never, fanOutMinListeners: 1 });

    const portA = fanOutPool.createPortProxy('client-a');
    const portB = fanOutPool.createPortProxy('client-b');

    hub.handleRequest(portA, { kind: 'attach', subId: 's1', providerId: 'p1', mode: 'data', cfg: cfg() });
    hub.handleRequest(portB, { kind: 'attach', subId: 's2', providerId: 'p1', mode: 'data', cfg: cfg() });

    const ctrl = controllers.get('default')!;
    ctrl.emit({ status: 'ready' });
    ctrl.emit({ rows: [{ id: '1' }, { id: '2' }] });

    await vi.waitFor(() => {
      expect(pooled.get('client-a')?.messages.some((m) => m.kind === 'delta')).toBe(true);
      expect(pooled.get('client-b')?.messages.some((m) => m.kind === 'delta')).toBe(true);
    });

    const deltaA = pooled.get('client-a')!.messages.filter(
      (m): m is Event & { kind: 'delta' } => m.kind === 'delta' && !(m as { replace?: boolean }).replace,
    ).pop();
    const deltaB = pooled.get('client-b')!.messages.filter(
      (m): m is Event & { kind: 'delta' } => m.kind === 'delta' && !(m as { replace?: boolean }).replace,
    ).pop();
    expect(deltaA).toMatchObject({ subId: 's1', rows: [{ id: '1' }, { id: '2' }] });
    expect(deltaB).toMatchObject({ subId: 's2', rows: [{ id: '1' }, { id: '2' }] });
  });

  it('posts delta-bin directly from the hub without fan-out worker round-trip', () => {
    const pooled = new Map<string, PooledPort>();
    let broadcastCalls = 0;
    const base = makeMockFanOutPool(pooled);
    const fanOutPool = {
      ...base,
      async broadcast(
        items: ReadonlyArray<{ clientId: string; subId: string }>,
        event: unknown,
      ) {
        broadcastCalls += 1;
        return base.broadcast(items, event);
      },
    };
    const hub = new SharedWorkerDataServicesHub({ fanOutPool: fanOutPool as never, fanOutMinListeners: 1 });

    const portA = fanOutPool.createPortProxy('client-a');
    const portB = fanOutPool.createPortProxy('client-b');
    hub.handleRequest(portA, { kind: 'attach', subId: 'sA', providerId: 'p1', mode: 'data', cfg: cfg() });
    hub.handleRequest(portB, { kind: 'attach', subId: 'sB', providerId: 'p1', mode: 'data' });

    const ctrl = controllers.get('default')!;
    pooled.get('client-a')!.messages.length = 0;
    pooled.get('client-b')!.messages.length = 0;
    broadcastCalls = 0;

    ctrl.emit({
      rows: Array.from({ length: 700 }, (_, i) => ({ id: `r${i}`, x: i })),
      replace: true,
    });

    expect(broadcastCalls).toBe(0);
    const chunksA = pooled.get('client-a')!.messages.filter((m) => m.kind === 'delta-bin');
    const chunksB = pooled.get('client-b')!.messages.filter((m) => m.kind === 'delta-bin');
    expect(chunksA).toHaveLength(2);
    expect(chunksB).toHaveLength(2);
    expect((chunksB[0] as { buf?: Uint8Array }).buf).toBe((chunksA[0] as { buf?: Uint8Array }).buf);
    expect((chunksB[1] as { buf?: Uint8Array }).buf).toBe((chunksA[1] as { buf?: Uint8Array }).buf);
    expect(chunksA.every((c) => c.subId === 'sA')).toBe(true);
    expect(chunksB.every((c) => c.subId === 'sB')).toBe(true);
  });

  it('releases fan-out worker when a subscription detaches', () => {
    const pooled = new Map<string, PooledPort>();
    const unregistered: string[] = [];
    const fanOutPool = {
      ...makeMockFanOutPool(pooled),
      unregisterSubscriber(subId: string) {
        unregistered.push(subId);
      },
    };
    const hub = new SharedWorkerDataServicesHub({ fanOutPool: fanOutPool as never, fanOutMinListeners: 1 });
    const port = fanOutPool.createPortProxy('client-a');

    hub.handleRequest(port, { kind: 'attach', subId: 's1', providerId: 'p1', mode: 'data', cfg: cfg() });
    hub.handleRequest(port, { kind: 'attach', subId: 's2', providerId: 'p1', mode: 'data', cfg: cfg() });
    expect(unregistered).toEqual(['s1', 's2']);

    hub.handleRequest(port, { kind: 'detach', subId: 's1' });
    expect(unregistered).toEqual(['s1', 's2', 's1']);

    hub.handleRequest(port, { kind: 'detach', subId: 's2' });
    expect(unregistered).toEqual(['s1', 's2', 's1', 's2']);
  });

  it('posts stats directly from the hub without fan-out worker round-trip', () => {
    const timers = makeFakeTimers();
    const pooled = new Map<string, PooledPort>();
    let broadcastCalls = 0;
    const base = makeMockFanOutPool(pooled);
    const fanOutPool = {
      ...base,
      async broadcast(
        items: ReadonlyArray<{ clientId: string; subId: string }>,
        event: unknown,
      ) {
        broadcastCalls += 1;
        return base.broadcast(items, event);
      },
    };
    const hub = new SharedWorkerDataServicesHub({
      fanOutPool: fanOutPool as never,
      fanOutMinListeners: 1,
      setTimer: timers.set,
      clearTimer: timers.clear,
    });
    const port = fanOutPool.createPortProxy('client-a');
    hub.handleRequest(port, { kind: 'attach', subId: 'data', providerId: 'p1', mode: 'data', cfg: cfg() });
    hub.handleRequest(port, { kind: 'attach', subId: 's1', providerId: 'p1', mode: 'stats' });

    pooled.get('client-a')!.messages.length = 0;
    broadcastCalls = 0;
    timers.tick();

    expect(pooled.get('client-a')?.messages.some((m) => m.kind === 'stats')).toBe(true);
    expect(broadcastCalls).toBe(0);
  });

  it('does not duplicate delivery when one pooled fan-out job fails', async () => {
    const pooled = new Map<string, PooledPort>();
    const base = makeMockFanOutPool(pooled);
    const fanOutPool = {
      ...base,
      async broadcast(
        items: ReadonlyArray<{ clientId: string; subId: string }>,
        event: unknown,
      ) {
        const dead: string[] = [];
        for (const item of items) {
          if (item.subId === 's2') {
            dead.push('s2');
            continue;
          }
          const port = pooled.get(item.clientId);
          if (!port) { dead.push(item.subId); continue; }
          port.postMessage({ ...(event as Event), subId: item.subId });
        }
        return dead;
      },
    };
    const hub = new SharedWorkerDataServicesHub({ fanOutPool: fanOutPool as never, fanOutMinListeners: 1 });
    const portA = fanOutPool.createPortProxy('client-a');
    const portB = fanOutPool.createPortProxy('client-b');
    hub.handleRequest(portA, { kind: 'attach', subId: 's1', providerId: 'p1', mode: 'data', cfg: cfg() });
    hub.handleRequest(portB, { kind: 'attach', subId: 's2', providerId: 'p1', mode: 'data', cfg: cfg() });

    const ctrl = controllers.get('default')!;
    ctrl.emit({ status: 'ready' });
    pooled.get('client-a')!.messages.length = 0;
    pooled.get('client-b')!.messages.length = 0;

    ctrl.emit({ rows: [{ id: '1' }, { id: '2' }] });

    await vi.waitFor(() => {
      expect(pooled.get('client-a')?.messages.some((m) => m.kind === 'delta')).toBe(true);
    });

    const deltasA = pooled.get('client-a')!.messages.filter((m) => m.kind === 'delta');
    const deltasB = pooled.get('client-b')!.messages.filter((m) => m.kind === 'delta');
    expect(deltasA).toHaveLength(1);
    expect(deltasB).toHaveLength(1);
    expect(deltasA[0]).toMatchObject({ subId: 's1', rows: [{ id: '1' }, { id: '2' }] });
    expect(deltasB[0]).toMatchObject({ subId: 's2', rows: [{ id: '1' }, { id: '2' }] });
  });
});
