/**
 * STOMP provider tests — exercise the trigger/snapshot/realtime
 * lifecycle against a controllable fake client.
 *
 * The real `@stomp/stompjs` Client is dynamically imported in
 * production; tests bypass that path entirely by passing
 * `createClient` so there's no socket touched and no module import
 * to mock.
 */

import { describe, it, expect } from 'vitest';
import { startStomp, probeStomp } from './stomp';
import type { ProviderEmitEvent } from './Provider';
import type { StompProviderConfig } from '@marketsui/shared-types';

interface FakeClient {
  connected: boolean;
  onConnect?: () => void;
  onWebSocketError?: () => void;
  onStompError?: (frame: { headers: Record<string, string> }) => void;
  onDisconnect?: () => void;
  publish(p: { destination: string; body?: string }): void;
  subscribe(d: string, cb: (msg: { body: string; headers: Record<string, string> }) => void): { unsubscribe(): void };
  activate(): void;
  deactivate(): Promise<void> | void;
}

interface FakeController {
  client: FakeClient;
  /** Trigger the onConnect callback from outside. */
  fireConnect(): void;
  /** Deliver a frame to the active subscription. */
  deliver(body: string): void;
  fireError(message?: string): void;
  fireWsError(): void;
  /** Captured publish calls (the trigger frame). */
  publishLog: Array<{ destination: string; body: string }>;
  /** Whether deactivate() has been called. */
  deactivated: boolean;
  /** Whether the subscription is currently active. */
  subscribed: boolean;
}

function makeFakeClient(): FakeController {
  let onMessage: ((m: { body: string; headers: Record<string, string> }) => void) | null = null;
  const ctrl: FakeController = {
    client: {} as FakeClient,
    fireConnect() {
      ctrl.client.connected = true;
      ctrl.client.onConnect?.();
    },
    deliver(body) { onMessage?.({ body, headers: {} }); },
    fireError(message) { ctrl.client.onStompError?.({ headers: { message: message ?? '' } }); },
    fireWsError() { ctrl.client.onWebSocketError?.(); },
    publishLog: [],
    deactivated: false,
    subscribed: false,
  };
  ctrl.client = {
    connected: false,
    publish: (p) => { ctrl.publishLog.push({ destination: p.destination, body: p.body ?? '' }); },
    subscribe: (_d, cb) => {
      onMessage = cb;
      ctrl.subscribed = true;
      return { unsubscribe() { onMessage = null; ctrl.subscribed = false; } };
    },
    activate: () => { /* no-op until tests fire onConnect */ },
    deactivate: () => { ctrl.deactivated = true; ctrl.client.connected = false; },
  };
  return ctrl;
}

function cfg(overrides: Partial<StompProviderConfig> = {}): StompProviderConfig {
  return {
    providerType: 'stomp',
    websocketUrl: 'ws://test',
    listenerTopic: '/topic/test',
    requestMessage: '/app/test/1000',
    requestBody: '',
    snapshotEndToken: 'Success',
    keyColumn: 'id',
    snapshotTimeoutMs: 30000,
    ...overrides,
  } as StompProviderConfig;
}

describe('startStomp', () => {
  it('emits loading, connects, subscribes, publishes the trigger', async () => {
    const events: ProviderEmitEvent[] = [];
    const ctrl = makeFakeClient();
    startStomp(cfg(), (e) => events.push(e), { createClient: () => ctrl.client });

    // Allow the async start() to resolve into the synchronous wiring.
    await Promise.resolve();
    await Promise.resolve();

    // Loading status emits up-front; subscribe + publish only fire
    // after `onConnect`.
    expect(events.find((e) => 'status' in e && e.status === 'loading')).toBeTruthy();
    expect(ctrl.subscribed).toBe(false);
    expect(ctrl.publishLog).toEqual([]);

    ctrl.fireConnect();
    expect(ctrl.subscribed).toBe(true);
    expect(ctrl.publishLog).toEqual([{ destination: '/app/test/1000', body: '' }]);
  });

  it('parses snapshot batches as keyed deltas; flips to ready on the end token', async () => {
    const events: ProviderEmitEvent[] = [];
    const ctrl = makeFakeClient();
    startStomp(cfg(), (e) => events.push(e), { createClient: () => ctrl.client });
    await Promise.resolve();
    ctrl.fireConnect();

    ctrl.deliver(JSON.stringify([{ id: 'r1', x: 1 }, { id: 'r2', x: 2 }]));
    ctrl.deliver(JSON.stringify({ id: 'r3', x: 3 }));   // single object → 1-row batch
    ctrl.deliver('Success: All 3 records delivered');    // case-insensitive token

    const deltas = events.filter((e): e is { rows: readonly unknown[]; replace?: boolean } => 'rows' in e);
    expect(deltas).toHaveLength(2);
    expect(deltas[0].rows).toHaveLength(2);
    expect(deltas[1].rows).toHaveLength(1);

    expect(events.find((e) => 'status' in e && e.status === 'ready')).toBeTruthy();
  });

  it('treats post-Success frames as live updates (no replace, no new status)', async () => {
    const events: ProviderEmitEvent[] = [];
    const ctrl = makeFakeClient();
    startStomp(cfg(), (e) => events.push(e), { createClient: () => ctrl.client });
    await Promise.resolve();
    ctrl.fireConnect();
    ctrl.deliver('Success');
    events.length = 0;

    ctrl.deliver(JSON.stringify({ id: 'r1', price: 99 }));

    const lastDelta = events.find((e) => 'rows' in e) as { rows: unknown[]; replace?: boolean };
    expect(lastDelta.rows).toEqual([{ id: 'r1', price: 99 }]);
    expect(lastDelta.replace).toBeUndefined();

    // No spurious status flip after ready.
    expect(events.filter((e) => 'status' in e)).toHaveLength(0);
  });

  it('counts byteSize even on non-row frames (heartbeats, end token)', async () => {
    const events: ProviderEmitEvent[] = [];
    const ctrl = makeFakeClient();
    startStomp(cfg(), (e) => events.push(e), { createClient: () => ctrl.client });
    await Promise.resolve();
    ctrl.fireConnect();

    ctrl.deliver('not-json');
    ctrl.deliver('Success');

    const byteEvents = events.filter((e): e is { byteSize: number } => 'byteSize' in e);
    // 'not-json' = 8 bytes, 'Success' = 7 bytes
    expect(byteEvents.map((e) => e.byteSize)).toEqual([8, 7]);
  });

  it('restart() deactivates, emits replace:[], reconnects with overlay merged into trigger body', async () => {
    const events: ProviderEmitEvent[] = [];
    const controllers: FakeController[] = [];
    const handle = startStomp(
      cfg({ requestBody: '{"clientId":"X"}' }),
      (e) => events.push(e),
      {
        createClient: () => {
          const c = makeFakeClient();
          controllers.push(c);
          return c.client;
        },
      },
    );
    await Promise.resolve();
    controllers[0].fireConnect();
    controllers[0].deliver('Success');
    events.length = 0;

    await handle.restart({ asOfDate: '2026-04-01' });
    await Promise.resolve();
    await Promise.resolve();

    expect(controllers[0].deactivated).toBe(true);
    expect(controllers).toHaveLength(2);
    controllers[1].fireConnect();

    const replaceClear = events.find((e) => 'rows' in e && (e as { replace?: boolean }).replace);
    expect(replaceClear).toMatchObject({ rows: [], replace: true });

    const lastPublish = controllers[1].publishLog.at(-1)!;
    expect(JSON.parse(lastPublish.body)).toEqual({ clientId: 'X', asOfDate: '2026-04-01' });
  });

  it('surfaces WebSocket failure as status:error', async () => {
    const events: ProviderEmitEvent[] = [];
    const ctrl = makeFakeClient();
    startStomp(cfg(), (e) => events.push(e), { createClient: () => ctrl.client });
    await Promise.resolve();
    ctrl.fireWsError();
    expect(events.find((e) => 'status' in e && e.status === 'error')).toBeTruthy();
  });
});

describe('probeStomp', () => {
  it('resolves with collected rows once the end token arrives', async () => {
    const ctrl = makeFakeClient();
    const promise = probeStomp(cfg(), {
      createClient: () => ctrl.client,
      timeoutMs: 1000,
    });
    // Drive the connect + frames after the probe call. Use a microtask
    // gap so startStomp's async start() has wired everything up.
    await Promise.resolve();
    ctrl.fireConnect();
    ctrl.deliver(JSON.stringify([{ id: 'r1' }, { id: 'r2' }]));
    ctrl.deliver('Success');

    const result = await promise;
    expect(result.ok).toBe(true);
    expect(result.rows).toHaveLength(2);
  });

  it('rejects with error when WebSocket fails', async () => {
    const ctrl = makeFakeClient();
    const promise = probeStomp(cfg(), { createClient: () => ctrl.client, timeoutMs: 1000 });
    await Promise.resolve();
    ctrl.fireWsError();
    const result = await promise;
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/WebSocket/);
  });

  it('caps at maxRows and resolves without waiting for the end token', async () => {
    const ctrl = makeFakeClient();
    const rows = Array.from({ length: 250 }, (_, i) => ({ id: `r${i}` }));
    const promise = probeStomp(cfg(), {
      createClient: () => ctrl.client,
      maxRows: 100,
      timeoutMs: 1000,
    });
    await Promise.resolve();
    ctrl.fireConnect();
    ctrl.deliver(JSON.stringify(rows));

    const result = await promise;
    expect(result.ok).toBe(true);
    expect(result.rows).toHaveLength(100);
  });
});
