/**
 * SSRM STOMP ingest — one generation, one session.
 *
 * Deliberately leaner than the CSRM transport (`providers/transports/
 * stomp.ts`, untouched): no hub frames, no snapshot re-buffering, no
 * conflation dispatch — frames classify straight into generation-
 * stamped events the worker feeds to the `DatasetStateMachine` and
 * `TableWriter`. One session serves exactly one generation; restart =
 * close this session (off the critical path) + open a new one with the
 * bumped token. There is no silent auto-redial: a broken session is an
 * `onError`, and recovery is an explicit restart — state, never a hang.
 */

import type { SsrmDatasetConfig } from '../types.js';
import type { SsrmRow } from '../TableWriter.js';
import { classifyFrame } from '../stompFrames.js';

// ─── Minimal structural stompjs surface (headers included) ────────

export interface SsrmStompMessage {
  body: string;
  headers: Record<string, string>;
}

export interface SsrmStompClient {
  onConnect: (() => void) | undefined;
  onStompError: ((frame: { headers: Record<string, string> }) => void) | undefined;
  onWebSocketError: ((event: unknown) => void) | undefined;
  onDisconnect: (() => void) | undefined;
  reconnectDelay: number;
  subscribe(
    destination: string,
    cb: (msg: SsrmStompMessage) => void,
  ): { unsubscribe(): void };
  publish(params: { destination: string; body?: string; headers?: Record<string, string> }): void;
  activate(): void;
  deactivate(options?: { force?: boolean }): Promise<void> | void;
}

export interface SsrmStompClientCfg {
  brokerURL: string;
  reconnectDelay: number;
  heartbeatIncoming: number;
  heartbeatOutgoing: number;
}

export type SsrmStompClientFactory = (cfg: SsrmStompClientCfg) => SsrmStompClient;

let _ctorPromise: Promise<new (cfg: SsrmStompClientCfg) => SsrmStompClient> | null = null;

/** Lazy-load @stomp/stompjs (ESM/UMD interop shapes) once per worker. */
async function loadDefaultFactory(): Promise<SsrmStompClientFactory> {
  if (!_ctorPromise) {
    _ctorPromise = Promise.all([
      import('@stomp/stompjs'),
      import('../../providers/transports/stomp.js'),
    ]).then(([mod, interop]) =>
      interop.resolveStompClientCtor(mod) as unknown as new (
        cfg: SsrmStompClientCfg,
      ) => SsrmStompClient,
    );
  }
  const Ctor = await _ctorPromise;
  return (cfg) => new Ctor(cfg);
}

// ─── Session events (all stamped with the session's generation) ───

export interface SsrmIngestEvents {
  /** STOMP handshake done + subscription live + trigger published. */
  onDialed(generation: number): void;
  onSnapshotBatch(generation: number, rows: SsrmRow[]): void;
  onSnapshotEnd(generation: number): void;
  onLiveBatch(generation: number, rows: SsrmRow[]): void;
  onError(generation: number, detail: string): void;
}

export interface SsrmIngestSession {
  readonly generation: number;
  /** Tear down subscription + socket. Safe to call twice. */
  close(): Promise<void>;
}

export interface OpenStompSessionOpts {
  /** Inject the client factory for tests. */
  createClient?: SsrmStompClientFactory;
}

/**
 * Dial the broker and run the snapshot→live lifecycle for exactly one
 * generation. Events fired after `close()` are suppressed here AND
 * fenced by generation in the state machine (belt and braces — the
 * async seams are precisely where V1 leaked).
 */
export function openStompSession(
  config: SsrmDatasetConfig,
  generation: number,
  events: SsrmIngestEvents,
  opts: OpenStompSessionOpts = {},
): SsrmIngestSession {
  let client: SsrmStompClient | null = null;
  let sub: { unsubscribe(): void } | null = null;
  let closed = false;
  let snapshotDone = !config.snapshotEndToken; // no end token → straight to live semantics

  const fail = (detail: string) => {
    if (closed) return;
    events.onError(generation, detail);
  };

  const handleFrame = (body: string) => {
    if (closed) return;
    const frame = classifyFrame(body, config.snapshotEndToken);
    if (frame.kind === 'ignore') return;
    if (frame.kind === 'end') {
      if (!snapshotDone) {
        snapshotDone = true;
        events.onSnapshotEnd(generation);
      }
      return;
    }
    if (snapshotDone) events.onLiveBatch(generation, frame.rows);
    else events.onSnapshotBatch(generation, frame.rows);
  };

  const start = async () => {
    let factory: SsrmStompClientFactory;
    try {
      factory = opts.createClient ?? (await loadDefaultFactory());
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
      return;
    }
    if (closed) return;

    try {
      client = factory({
        brokerURL: config.websocketUrl,
        // No silent auto-redial: a dead session is an error the
        // orchestrator surfaces; restart mints a new session.
        reconnectDelay: 0,
        heartbeatIncoming: config.heartbeat?.incoming ?? 4000,
        heartbeatOutgoing: config.heartbeat?.outgoing ?? 4000,
      });
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
      return;
    }

    client.onConnect = () => {
      if (closed || !client) return;
      try {
        sub = client.subscribe(config.listenerTopic, (msg) => handleFrame(msg.body));
        if (config.requestMessage) {
          client.publish({
            destination: config.requestMessage,
            body: config.requestBody ?? '',
            ...(config.requestHeaders ? { headers: config.requestHeaders } : {}),
          });
        }
        events.onDialed(generation);
      } catch (err) {
        fail(err instanceof Error ? err.message : String(err));
      }
    };
    client.onWebSocketError = () => fail('WebSocket connection failed');
    client.onDisconnect = () => fail('Provider disconnected');
    client.onStompError = (frame) => fail(frame.headers['message'] ?? 'STOMP error');

    try {
      client.activate();
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
    }
  };

  void start();

  return {
    generation,
    close: async () => {
      if (closed) return;
      closed = true;
      const c = client;
      const s = sub;
      client = null;
      sub = null;
      try {
        s?.unsubscribe();
      } catch {
        /* socket may already be gone */
      }
      if (!c) return;
      c.onConnect = undefined;
      c.onStompError = undefined;
      c.onWebSocketError = undefined;
      c.onDisconnect = undefined;
      c.reconnectDelay = 0;
      try {
        await c.deactivate();
      } catch {
        try {
          await c.deactivate({ force: true });
        } catch {
          /* ignore */
        }
      }
    },
  };
}
