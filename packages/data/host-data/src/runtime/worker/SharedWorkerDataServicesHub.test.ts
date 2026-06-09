/**
 * SharedWorkerDataServicesHub tests — focus on the invariants that v1 trial-and-error
 * uncovered:
 *
 *   1. **Late-joiner correctness.** A subscriber attaching after the
 *      provider has already started gets the full cache as one
 *      `delta { replace: true }` event, plus the current status.
 *
 *   2. **No auto-teardown.** When the last subscriber detaches, the
 *      provider stays running. A subsequent attach reuses the
 *      existing instance (and its cache).
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
import type { Event } from '../protocol';
import type { ProviderConfig } from '@starui/types';
import type { ConfigManager, AppConfigRow } from '@starui/host-config';

interface CapturedPort extends PortLike {
  messages: Event[];
}

function makePort(): CapturedPort {
  const messages: Event[] = [];
  return {
    messages,
    postMessage(m: unknown) {
      messages.push(m as Event);
    },
  };
}

interface FakeTimers {
  set: (cb: () => void, ms: number) => unknown;
  clear: (h: unknown) => void;
  /** Step time forward one tick. */
  tick(): void;
  /** True when an interval is currently armed. */
  armed: boolean;
}

function makeFakeTimers(): FakeTimers {
  let cb: (() => void) | null = null;
  return {
    set(callback) { cb = callback; return 1; },
    clear() { cb = null; },
    tick() { cb?.(); },
    get armed() { return cb !== null; },
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

const cfg = (key = 'default'): ProviderConfig =>
  ({ providerType: 'mock', __testKey: key, keyColumn: 'id' } as unknown as ProviderConfig);

describe('SharedWorkerDataServicesHub — attach lifecycle', () => {
  it('first attach creates the provider and the listener immediately gets a replace + status', () => {
    const hub = new SharedWorkerDataServicesHub();
    const port = makePort();

    hub.handleRequest(port, { kind: 'attach', subId: 's1', providerId: 'p1', mode: 'data', cfg: cfg() });

    expect(port.messages).toHaveLength(2);
    expect(port.messages[0]).toMatchObject({ subId: 's1', kind: 'delta', replace: true, rows: [] });
    expect(port.messages[1]).toMatchObject({ subId: 's1', kind: 'status', status: 'loading' });
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

    // Late joiner sees the cache as a single replace delta.
    const replaceB = portB.messages.find((m) => m.kind === 'delta' && (m as { replace?: boolean }).replace) as Event & { rows: unknown[] };
    expect(replaceB).toBeTruthy();
    expect(replaceB.rows).toHaveLength(2);

    // ...and the current status.
    const statusB = portB.messages.find((m) => m.kind === 'status');
    expect(statusB).toMatchObject({ status: 'ready' });
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
    const replaceB = portB.messages.find((m) => m.kind === 'delta' && (m as { replace?: boolean }).replace);
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

    const deltasB = portB.messages.filter((m) => m.kind === 'delta');
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
      .filter((m) => m.kind === 'delta')
      .flatMap((m) => (m as Event & { rows: Array<{ id: string }> }).rows);
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

    const deltasA = portA.messages.filter((m) => m.kind === 'delta') as Array<Event & { rows: unknown[] }>;
    expect(deltasA.length).toBeGreaterThan(0);
    expect(portB.messages).toHaveLength(0);
    expect(ctrl.restartLog).toHaveLength(restartsBefore);
    const replayed = deltasA.flatMap((d) => d.rows) as Array<{ id: string }>;
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

    const broadcast = port.messages.find((m) => m.kind === 'delta' && (m as { replace?: boolean }).replace) as Event & { rows: Array<{ id: string; x: number }> };
    expect(broadcast.rows).toHaveLength(2);
    const byId = new Map(broadcast.rows.map((r) => [r.id, r]));
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

    const delta = port.messages.find((m) => m.kind === 'delta' && !(m as { replace?: boolean }).replace) as Event & { rows: Array<{ id: string; x: number }> };
    expect(delta.rows).toHaveLength(1);
    expect(delta.rows[0]).toEqual({ id: 'r1', x: 2 }); // last write wins
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

    const delta = port.messages.find((m) => m.kind === 'delta' && !(m as { replace?: boolean }).replace) as Event & { rows: Array<{ id?: string }> };
    expect(delta.rows).toHaveLength(2);
    expect(delta.rows.every((r) => r.id !== undefined)).toBe(true);
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

    const delta = port.messages.find((m) => m.kind === 'delta' && !(m as { replace?: boolean }).replace) as Event & { rows: Array<Record<string, unknown>> };
    expect(delta.rows).toHaveLength(3);              // 4 distinct rows minus the orphan → 3
    expect(delta.rows[0]).toEqual({ region: 'EMEA', desk: 'CRD', instrumentId: 'IBM', qty: 250 });
    expect(delta.rows[1]).toEqual({ region: 'EMEA', desk: 'CRD', instrumentId: 'AAPL', qty: 10 });
    expect(delta.rows[2]).toEqual({ region: 'AMER', desk: 'CRD', instrumentId: 'IBM', qty: 50 });
  });
});

describe('SharedWorkerDataServicesHub — no auto-teardown', () => {
  it('keeps the provider running after the last data subscriber detaches', () => {
    const hub = new SharedWorkerDataServicesHub();
    const port = makePort();
    hub.handleRequest(port, { kind: 'attach', subId: 's1', providerId: 'p1', mode: 'data', cfg: cfg() });
    const ctrl = controllers.get('default')!;
    ctrl.emit({ rows: [{ id: 'r1' }] });

    hub.handleRequest(port, { kind: 'detach', subId: 's1' });

    expect(ctrl.stopCount).toBe(0);

    // Re-attaching reuses the existing provider; new listener gets
    // the cached row in its first replace delta.
    const portB = makePort();
    hub.handleRequest(portB, { kind: 'attach', subId: 's2', providerId: 'p1', mode: 'data' });
    const replace = portB.messages.find((m) => m.kind === 'delta') as { rows: unknown[] };
    expect(replace.rows).toEqual([{ id: 'r1' }]);
    expect(ctrl.stopCount).toBe(0);
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

    expect(a.messages.find((m) => m.kind === 'delta' && (m as { rows: unknown[] }).rows.length === 1)).toBeTruthy();
    expect(b.messages.find((m) => m.kind === 'delta' && (m as { rows: unknown[] }).rows.length === 1)).toBeTruthy();
    // Each carries its own subId.
    const aDelta = a.messages.find((m) => m.kind === 'delta' && (m as { rows: unknown[] }).rows.length === 1);
    const bDelta = b.messages.find((m) => m.kind === 'delta' && (m as { rows: unknown[] }).rows.length === 1);
    expect((aDelta as { subId: string }).subId).toBe('sA');
    expect((bDelta as { subId: string }).subId).toBe('sB');
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
  it('drops every subscription owned by the closed port', () => {
    const hub = new SharedWorkerDataServicesHub();
    const port = makePort();
    hub.handleRequest(port, { kind: 'attach', subId: 's1', providerId: 'p1', mode: 'data', cfg: cfg() });
    hub.handleRequest(port, { kind: 'attach', subId: 's2', providerId: 'p1', mode: 'stats' });

    hub.onPortClosed(port);

    // Provider is still running (no auto-teardown).
    const ctrl = controllers.get('default')!;
    expect(ctrl.stopCount).toBe(0);

    // But broadcasts no longer reach the dead port.
    port.messages.length = 0;
    ctrl.emit({ rows: [{ id: 'r1' }] });
    expect(port.messages).toHaveLength(0);
  });
});

// ─── AppData wire round-trip ─────────────────────────────────────

interface AppDataPort {
  messages: unknown[];
  postMessage(m: unknown): void;
}

function makeAppDataPort(): AppDataPort {
  const messages: unknown[] = [];
  return {
    messages,
    postMessage(m) { messages.push(m); },
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
    // post-fetch replace with rows, then ready.
    const deltas = port.messages.filter((m) => m.kind === 'delta');
    const statuses = port.messages.filter((m) => m.kind === 'status') as Array<Event & { status: string }>;

    expect(statuses.map((s) => s.status)).toEqual(['loading', 'ready']);

    // The last delta carries the fetched rows (the immediate attach
    // replay sent an empty cache; the post-fetch broadcast carried
    // the snapshot). Hub dedupes by keyColumn so we expect exactly 2.
    const finalDelta = deltas[deltas.length - 1] as Event & { rows: unknown[]; replace?: boolean };
    expect(finalDelta.replace).toBe(true);
    expect(finalDelta.rows).toHaveLength(2);
    expect(finalDelta.rows.map((r) => (r as { id: string }).id)).toEqual(['r1', 'r2']);

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
    postMessage(m: unknown) { messages.push(m); },
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

    expect(port.messages[0]).toMatchObject({ kind: 'config-snapshot', reqId: 'ready-1', ok: true, ready: true });
    expect(port.messages[1]).toMatchObject({ kind: 'config-snapshot', reqId: 'get-1', ok: true, config: { providerId: 'p1' } });
    expect(port.messages[2]).toMatchObject({
      kind: 'config-snapshot',
      reqId: 'list-1',
      ok: true,
      configs: expect.arrayContaining([
        expect.objectContaining({ providerId: 'p1' }),
        expect.objectContaining({ providerId: 'p2' }),
      ]),
    });
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
