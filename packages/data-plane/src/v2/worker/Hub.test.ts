/**
 * Hub tests — focus on the invariants that v1 trial-and-error
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
import { Hub, type PortLike } from './Hub';
import { registerProvider } from '../providers/registry';
import type { ProviderEmit, ProviderHandle } from '../providers/Provider';
import type { Event } from '../protocol';
import type { ProviderConfig } from '@marketsui/shared-types';

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

describe('Hub — attach lifecycle', () => {
  it('first attach creates the provider and the listener immediately gets a replace + status', () => {
    const hub = new Hub();
    const port = makePort();

    hub.handleRequest(port, { kind: 'attach', subId: 's1', providerId: 'p1', mode: 'data', cfg: cfg() });

    expect(port.messages).toHaveLength(2);
    expect(port.messages[0]).toMatchObject({ subId: 's1', kind: 'delta', replace: true, rows: [] });
    expect(port.messages[1]).toMatchObject({ subId: 's1', kind: 'status', status: 'loading' });
  });

  it('rejects with status:error if the providerId is not running and no cfg supplied', () => {
    const hub = new Hub();
    const port = makePort();

    hub.handleRequest(port, { kind: 'attach', subId: 's1', providerId: 'p1', mode: 'data' });

    expect(port.messages).toHaveLength(1);
    expect(port.messages[0]).toMatchObject({ kind: 'status', status: 'error' });
  });

  it('late joiner gets the full cache as one replace delta', () => {
    const hub = new Hub();
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
    const hub = new Hub();
    const port = makePort();
    hub.handleRequest(port, { kind: 'attach', subId: 's1', providerId: 'p1', mode: 'data', cfg: cfg() });
    const ctrl = controllers.get('default')!;

    hub.handleRequest(port, { kind: 'attach', subId: 's2', providerId: 'p1', mode: 'data', extra: { asOfDate: '2026-04-01' } });

    expect(ctrl.restartLog).toEqual([{ asOfDate: '2026-04-01' }]);
  });
});

describe('Hub — no auto-teardown', () => {
  it('keeps the provider running after the last data subscriber detaches', () => {
    const hub = new Hub();
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
    const hub = new Hub();
    const port = makePort();
    hub.handleRequest(port, { kind: 'attach', subId: 's1', providerId: 'p1', mode: 'data', cfg: cfg() });
    const ctrl = controllers.get('default')!;

    hub.handleRequest(port, { kind: 'stop', providerId: 'p1' });

    expect(ctrl.stopCount).toBe(1);
    const errStatus = port.messages.find((m) => m.kind === 'status' && (m as { status: string }).status === 'error');
    expect(errStatus).toBeTruthy();
  });
});

describe('Hub — broadcast fan-out', () => {
  it('every data delta reaches every attached subscriber for the provider', () => {
    const hub = new Hub();
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

describe('Hub — stats sampler', () => {
  it('arms on first stats listener, disarms when last detaches', () => {
    const timers = makeFakeTimers();
    const hub = new Hub({ setTimer: timers.set, clearTimer: timers.clear });
    const port = makePort();
    hub.handleRequest(port, { kind: 'attach', subId: 'data', providerId: 'p1', mode: 'data', cfg: cfg() });

    expect(timers.armed).toBe(false);

    hub.handleRequest(port, { kind: 'attach', subId: 'stats', providerId: 'p1', mode: 'stats' });
    expect(timers.armed).toBe(true);

    hub.handleRequest(port, { kind: 'detach', subId: 'stats' });
    expect(timers.armed).toBe(false);
  });

  it('emits a stats snapshot immediately on attach + each tick', () => {
    const timers = makeFakeTimers();
    const hub = new Hub({ setTimer: timers.set, clearTimer: timers.clear });
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
});

describe('Hub — port closure', () => {
  it('drops every subscription owned by the closed port', () => {
    const hub = new Hub();
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
