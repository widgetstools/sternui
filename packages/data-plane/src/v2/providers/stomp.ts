/**
 * STOMP provider — `startStomp(cfg, emit)` + `probeStomp(cfg)` for
 * the editor's Test Connection / Infer Fields buttons.
 *
 * Lifecycle:
 *   start():
 *     1. Connect WebSocket via @stomp/stompjs.
 *     2. On `onConnect`: subscribe to `cfg.listenerTopic`, publish
 *        the trigger frame to `cfg.requestMessage` (body =
 *        `cfg.requestBody ?? ''`).
 *     3. Each frame body is parsed as JSON. Arrays expand; single
 *        objects become a 1-element batch. The case-insensitive
 *        `cfg.snapshotEndToken` flips status: 'loading' → 'ready'.
 *     4. Live-phase frames emit as keyed deltas via
 *        `emit({ rows })` — Hub upserts into its cache.
 *
 *   restart(extra):
 *     Disconnects, clears local state, emits `{ rows: [], replace:
 *     true }` + status: 'loading', re-runs start(). The `extra`
 *     overlay is merged into the trigger body (if it's JSON) — that
 *     lets the historical path send `{ asOfDate }` without
 *     re-authoring the cfg.
 *
 *   stop():
 *     Disconnects. No emit (Hub clears its cache when the slot
 *     drops).
 *
 * The stompjs Client lazy-loads via dynamic import so consumers who
 * never use STOMP don't pay for the dep.
 */

import type { StompProviderConfig } from '@marketsui/shared-types';
import type { ProviderEmit, ProviderHandle } from './Provider.js';

// ─── Minimal structural type for the stompjs Client we use ────────

interface StompClient {
  connected: boolean;
  onConnect: (() => void) | undefined;
  onStompError: ((frame: { headers: Record<string, string> }) => void) | undefined;
  onWebSocketError: ((event: unknown) => void) | undefined;
  onDisconnect: (() => void) | undefined;
  subscribe(
    destination: string,
    cb: (msg: { body: string; headers: Record<string, string> }) => void,
  ): { unsubscribe(): void };
  publish(params: { destination: string; body?: string }): void;
  activate(): void;
  deactivate(): Promise<void> | void;
}

interface StompClientCfg {
  brokerURL: string;
  reconnectDelay: number;
  heartbeatIncoming: number;
  heartbeatOutgoing: number;
  debug?: (msg: string) => void;
}

export type StompClientFactory = (cfg: StompClientCfg) => StompClient;

let _ctorPromise: Promise<new (cfg: StompClientCfg) => StompClient> | null = null;
let _ctor: (new (cfg: StompClientCfg) => StompClient) | null = null;

async function loadDefaultClientCtor(): Promise<new (cfg: StompClientCfg) => StompClient> {
  if (_ctor) return _ctor;
  if (!_ctorPromise) {
    _ctorPromise = import('@stomp/stompjs').then((m) => {
      _ctor = (m as unknown as { Client: new (cfg: StompClientCfg) => StompClient }).Client;
      return _ctor;
    });
  }
  return _ctorPromise;
}

export interface StompOpts {
  /** Inject the Client constructor for tests. */
  createClient?: StompClientFactory;
}

// ─── start() — long-running provider ───────────────────────────────

export function startStomp(
  cfg: StompProviderConfig,
  emit: ProviderEmit,
  opts: StompOpts = {},
): ProviderHandle {
  const state = {
    client: null as StompClient | null,
    sub: null as { unsubscribe(): void } | null,
    snapshotComplete: false,
    overlay: undefined as Record<string, unknown> | undefined,
    stopped: false,
  };

  const handleFrame = (body: string) => {
    if (state.stopped) return;
    const trimmed = body.trim();
    const byteSize = body.length;

    // End-of-snapshot token (case-insensitive substring match).
    if (matchesEndToken(trimmed, cfg.snapshotEndToken)) {
      state.snapshotComplete = true;
      emit({ byteSize });
      emit({ status: 'ready' });
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      // Non-JSON frame (heartbeat, comment) — count bytes, ignore.
      emit({ byteSize });
      return;
    }
    const rows = extractRows(parsed);
    if (rows.length === 0) {
      emit({ byteSize });
      return;
    }
    emit({ rows });
    emit({ byteSize });
  };

  const start = async () => {
    if (state.stopped) return;
    emit({ status: 'loading' });

    let client: StompClient;
    try {
      const Ctor = opts.createClient
        ? null
        : await loadDefaultClientCtor();
      const factory: StompClientFactory = opts.createClient
        ?? ((c) => new Ctor!(c));
      client = factory({
        brokerURL: cfg.websocketUrl,
        reconnectDelay: cfg.reconnect?.initialDelayMs ?? 5000,
        heartbeatIncoming: cfg.heartbeat?.incoming ?? 4000,
        heartbeatOutgoing: cfg.heartbeat?.outgoing ?? 4000,
      });
    } catch (err) {
      emit({ status: 'error', error: err instanceof Error ? err.message : String(err) });
      return;
    }
    if (state.stopped) return;

    state.client = client;

    client.onConnect = () => {
      if (state.stopped) return;
      try {
        state.sub = client.subscribe(cfg.listenerTopic, (msg) => handleFrame(msg.body));
      } catch (err) {
        emit({ status: 'error', error: err instanceof Error ? err.message : String(err) });
        return;
      }
      // Publish the trigger frame. The body can be a literal string or
      // a JSON template; if `extra` was supplied AND the body parses
      // as JSON, we merge the overlay in (the historical-mode pattern).
      if (cfg.requestMessage) {
        const body = mergeOverlay(cfg.requestBody ?? '', state.overlay);
        try {
          client.publish({ destination: cfg.requestMessage, body });
        } catch (err) {
          emit({ status: 'error', error: err instanceof Error ? err.message : String(err) });
        }
      }
    };
    client.onWebSocketError = () => {
      emit({ status: 'error', error: 'WebSocket connection failed' });
    };
    client.onStompError = (frame) => {
      emit({ status: 'error', error: frame.headers['message'] ?? 'STOMP error' });
    };

    try {
      client.activate();
    } catch (err) {
      emit({ status: 'error', error: err instanceof Error ? err.message : String(err) });
    }
  };

  const stop = async () => {
    state.stopped = true;
    try {
      state.sub?.unsubscribe();
    } catch { /* ignore */ }
    state.sub = null;
    try {
      await state.client?.deactivate();
    } catch { /* ignore */ }
    state.client = null;
  };

  // Kick off async start so listeners attached after `startStomp`
  // returns still see the loading status event (Hub calls us
  // synchronously from attach).
  void start();

  return {
    stop,
    restart: async (extra) => {
      state.overlay = extra;
      // Tear down the old connection, reset state, wipe consumer view.
      try { state.sub?.unsubscribe(); } catch { /* ignore */ }
      state.sub = null;
      try { await state.client?.deactivate(); } catch { /* ignore */ }
      state.client = null;
      state.snapshotComplete = false;
      emit({ rows: [], replace: true });
      // Allow the new start() to proceed (resets stopped flag, but
      // only if the consumer didn't call stop() in between).
      if (!state.stopped) void start();
    },
  };
}

// ─── probeStomp() — one-shot connect + collect snapshot ───────────

export interface ProbeResult {
  ok: boolean;
  rows?: readonly unknown[];
  error?: string;
}

export interface ProbeOpts {
  /** Maximum rows to collect before resolving. Default 200. */
  maxRows?: number;
  /** Hard timeout in ms. Default 15s. */
  timeoutMs?: number;
  /** Inject the client factory for tests. */
  createClient?: StompClientFactory;
}

export async function probeStomp(
  cfg: StompProviderConfig,
  opts: ProbeOpts = {},
): Promise<ProbeResult> {
  const max = opts.maxRows ?? 200;
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const collected: unknown[] = [];
  let settled = false;

  return new Promise<ProbeResult>((resolve) => {
    const finish = (result: ProbeResult) => {
      if (settled) return;
      settled = true;
      void handle.stop();
      resolve(result);
    };

    const timer = setTimeout(() => finish({ ok: false, error: `Probe timed out after ${timeoutMs}ms` }), timeoutMs);

    const handle = startStomp(cfg, (event) => {
      if ('rows' in event && event.rows) {
        for (const r of event.rows) {
          collected.push(r);
          if (collected.length >= max) {
            clearTimeout(timer);
            finish({ ok: true, rows: collected });
            return;
          }
        }
      }
      if ('status' in event) {
        if (event.status === 'ready') {
          clearTimeout(timer);
          finish({ ok: true, rows: collected });
        }
        if (event.status === 'error') {
          clearTimeout(timer);
          finish({ ok: false, error: event.error ?? 'Unknown STOMP error' });
        }
      }
    }, opts.createClient ? { createClient: opts.createClient } : {});
  });
}

// ─── helpers ───────────────────────────────────────────────────────

function matchesEndToken(body: string, token: string | undefined): boolean {
  if (!token) return false;
  return body.toLowerCase().includes(token.toLowerCase());
}

function extractRows(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  if (!parsed || typeof parsed !== 'object') return [];
  const obj = parsed as Record<string, unknown>;
  if (Array.isArray(obj.rows)) return obj.rows;
  if (Array.isArray(obj.data)) return obj.data;
  return [obj];
}

/**
 * If `body` is JSON-shaped and `overlay` is set, merge overlay keys
 * onto the parsed body and re-stringify. Otherwise return body as-is.
 * This is the cheap "pass {asOfDate} through to the historical
 * provider's trigger" path.
 */
function mergeOverlay(body: string, overlay: Record<string, unknown> | undefined): string {
  if (!overlay) return body;
  const trimmed = body.trim();
  if (!trimmed) return JSON.stringify(overlay);
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return body;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return body;
  return JSON.stringify({ ...(parsed as Record<string, unknown>), ...overlay });
}
