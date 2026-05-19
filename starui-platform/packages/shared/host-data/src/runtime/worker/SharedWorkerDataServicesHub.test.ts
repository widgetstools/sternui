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
import { registerProvider } from '../providers/registry';
import type { ProviderEmit, ProviderHandle } from '../providers/Provider';
import type { Event } from '../protocol';
import type { ProviderConfig } from '@starui/types';

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
  it('arms on first stats listener, disarms when last detaches', () => {
    const timers = makeFakeTimers();
    const hub = new SharedWorkerDataServicesHub({ setTimer: timers.set, clearTimer: timers.clear });
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

  it('second attacher sees the previously-seeded snapshot (no double-hydrate)', () => {
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
    hub.handleAppDataRequest(portB, {
      kind: 'appdata-attach',
      subId: 'b',
      seed: [appDataRow('z', 'wouldOverwrite')],
    });
    expect(portB.messages[0]).toMatchObject({
      kind: 'appdata-snapshot',
      rows: [{ configId: 'a', name: 'positions' }],
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
