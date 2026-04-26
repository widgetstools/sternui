/**
 * StompStreamProvider — production STOMP/WebSocket row-stream provider.
 *
 * Direct port of stern-1's `StompEngine`
 * (`/Users/develop/Documents/projects/stern-1/client/src/workers/engine/StompEngine.ts`)
 * onto the Week-1.5 `StreamProviderBase`. Matches the wire protocol
 * documented in `/Users/develop/Documents/projects/stomp-server/STOMP_CLIENT_USAGE.md`:
 *
 *   1. Connect to `config.websocketUrl` via `@stomp/stompjs`.
 *   2. Subscribe to `config.listenerTopic` (`{clientId}` template
 *      variable resolved to a per-instance id).
 *   3. If `config.requestMessage` is set, publish a trigger message
 *      with `config.requestBody` so the server starts delivering.
 *   4. Incoming messages:
 *      • If the body (case-insensitive) contains
 *        `config.snapshotEndToken` (default `"Success"`) →
 *        `markSnapshotComplete()`. Flips to realtime phase.
 *      • Otherwise parse JSON, extract rows (supports payload shapes
 *        `[...]`, `{ rows: [...] }`, `{ data: [...] }`, or `{ ... }`),
 *        and route to `ingestSnapshotBatch()` pre-complete or
 *        `ingestUpdate()` post-complete. `StreamProviderBase` handles
 *        the cache upsert + listener fan-out + stats.
 *
 * Transport injection
 * -------------------
 * The constructor accepts an optional `createClient` factory that
 * returns a `@stomp/stompjs`-compatible client. In production that's
 * `(cfg) => new Client(cfg)`. Tests inject a fake so unit tests
 * don't need a live STOMP broker. This follows the same pattern
 * stern-1 uses in its own test suites and keeps the provider
 * framework-agnostic (a consumer could wire in a patched Client for
 * telemetry / auth middleware without touching provider code).
 */

import type { ProviderType, StompProviderConfig } from '@marketsui/shared-types';
import { RowCache } from '../worker/rowCache';
import { StreamProviderBase } from './StreamProviderBase';

// ─── Minimal structural types that mirror @stomp/stompjs ──────────────
//
// We don't import `@stomp/stompjs` at the module top-level so this
// file can load in environments that don't ship the dep (the peer
// dep in package.json is optional). Consumers pass a `createClient`
// at construction time that produces a real `Client` instance.

export interface StompClientLike {
  connected: boolean;
  onConnect: (() => void) | undefined;
  onStompError: ((frame: { headers: Record<string, string> }) => void) | undefined;
  onWebSocketError: ((event: unknown) => void) | undefined;
  onDisconnect: (() => void) | undefined;
  subscribe(
    destination: string,
    cb: (message: { body: string; headers: Record<string, string> }) => void,
  ): { unsubscribe(): void };
  publish(params: { destination: string; body?: string }): void;
  activate(): void;
  deactivate(): Promise<void> | void;
}

export interface StompClientConfig {
  brokerURL: string;
  reconnectDelay: number;
  heartbeatIncoming: number;
  heartbeatOutgoing: number;
  debug?: (msg: string) => void;
}

export type StompClientFactory = (cfg: StompClientConfig) => StompClientLike;

// ─── Module-shape normalisation ───────────────────────────────────────

export type StompRow = Record<string, unknown>;

export interface StompProviderOpts {
  /** Inject the transport. Defaults to dynamically importing `@stomp/stompjs`. */
  createClient?: StompClientFactory;
  /**
   * Override the client id used to resolve `{clientId}` in the listener
   * topic template. Defaults to a time/random id generated at
   * construction time.
   */
  clientId?: string;
}

export class StompStreamProvider extends StreamProviderBase<StompProviderConfig, StompRow> {
  readonly type: ProviderType = 'stomp';

  private config: StompProviderConfig | null = null;
  private client: StompClientLike | null = null;
  private subscription: { unsubscribe(): void } | null = null;
  private readonly clientId: string;
  private readonly createClient: StompClientFactory;

  constructor(id: string, opts: StompProviderOpts = {}) {
    // keyColumn is REQUIRED for row-stream providers. Configured on
    // subsequent `configure()` call; until then we seed with a
    // placeholder that upsert will reject (every row ends up in
    // `skipped`). The router + factory call configure before start,
    // so production code never sees the placeholder.
    super(id, { keyColumn: '__uninitialised__' });
    this.clientId = opts.clientId ?? `client-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    this.createClient = opts.createClient ?? defaultCreateClient;
  }

  async configure(config: StompProviderConfig): Promise<void> {
    if (!config.keyColumn) {
      throw new Error('[StompStreamProvider] config.keyColumn is required');
    }
    if (!config.websocketUrl) {
      throw new Error('[StompStreamProvider] config.websocketUrl is required');
    }
    if (!config.listenerTopic) {
      throw new Error('[StompStreamProvider] config.listenerTopic is required');
    }
    // RowCache's keyColumn is `readonly` after construction. Replace
    // the cache with one keyed by the configured column. Safe because
    // configure() runs before start() (factory contract); the base
    // class never touches `this.cache` outside ingest paths, which
    // can't fire before start().
    (this as unknown as { cache: RowCache<StompRow> }).cache = new RowCache<StompRow>({
      keyColumn: config.keyColumn,
    });
    this.config = config;
    this.lastConfig = config;
  }

  async start(): Promise<void> {
    if (!this.config) {
      throw new Error('[StompStreamProvider] configure() must be called before start()');
    }
    if (this.client?.connected) return;
    const cfg = this.config;

    return new Promise((resolve, reject) => {
      const client = this.createClient({
        brokerURL: cfg.websocketUrl,
        reconnectDelay: 5000,
        heartbeatIncoming: cfg.heartbeat?.incoming ?? 4000,
        heartbeatOutgoing: cfg.heartbeat?.outgoing ?? 4000,
        debug: (msg) => {
          // Forward warnings/errors only — the STOMP debug stream is
          // far too chatty otherwise.
          if (msg.includes('ERROR') || msg.includes('WARN')) {
            // eslint-disable-next-line no-console
            console.warn(`[StompStreamProvider:${this.id}]`, msg);
          }
        },
      });

      const timeoutMs = cfg.snapshotTimeoutMs ?? 30_000;
      const timer = setTimeout(() => {
        if (!client.connected) {
          const err = new Error(`STOMP connect timeout after ${timeoutMs}ms`);
          this.reportError(err);
          reject(err);
        }
      }, timeoutMs);

      client.onConnect = () => {
        clearTimeout(timer);
        this.reportConnected();
        this.subscribeToTopic();
        this.publishTrigger();
        resolve();
      };
      client.onStompError = (frame) => {
        clearTimeout(timer);
        const err = new Error(frame.headers['message'] ?? 'STOMP error');
        this.reportError(err);
        reject(err);
      };
      client.onWebSocketError = () => {
        clearTimeout(timer);
        const err = new Error('WebSocket connection failed');
        this.reportError(err);
        reject(err);
      };
      client.onDisconnect = () => {
        this.reportDisconnected();
      };

      this.client = client;
      client.activate();
    });
  }

  async stop(): Promise<void> {
    if (this.subscription) {
      try { this.subscription.unsubscribe(); } catch { /* ignore */ }
      this.subscription = null;
    }
    if (this.client) {
      try { await this.client.deactivate(); } catch { /* ignore */ }
      this.client = null;
    }
    this.cache.clear();
    this.resetSnapshotState();
  }

  // ─── Internals ──────────────────────────────────────────────────────

  private subscribeToTopic(): void {
    if (!this.client || !this.config) return;
    const topic = this.resolveTemplate(this.config.listenerTopic);
    this.subscription = this.client.subscribe(topic, (msg) => this.handleMessage(msg.body));
  }

  private publishTrigger(): void {
    if (!this.client || !this.config?.requestMessage) return;
    const destination = this.resolveTemplate(this.config.requestMessage);
    this.client.publish({
      destination,
      body: this.config.requestBody ?? '',
    });
  }

  private handleMessage(body: string): void {
    const trimmed = body.trim();
    const byteSize = body.length;

    // Snapshot-end detection — stern-1's rule: case-insensitive
    // substring match against `snapshotEndToken` (default "Success").
    // This covers both the explicit server message-type header AND
    // the legacy body-only "Success: All N records delivered..."
    // completion notice.
    if (this.containsEndToken(trimmed)) {
      this.markSnapshotComplete();
      return;
    }

    let data: unknown;
    try {
      data = JSON.parse(trimmed);
    } catch {
      // Non-JSON STOMP frame — drop silently. The server occasionally
      // sends control frames without a JSON body.
      return;
    }

    const rows = this.extractRows(data);
    if (rows.length === 0) return;

    if (this.isSnapshotComplete()) {
      this.ingestUpdate(rows, byteSize);
    } else {
      this.ingestSnapshotBatch(rows, byteSize);
    }
  }

  private containsEndToken(body: string): boolean {
    if (!this.config?.snapshotEndToken) return false;
    return body.toLowerCase().includes(this.config.snapshotEndToken.toLowerCase());
  }

  /**
   * Normalise the server's JSON shape into `StompRow[]`. Supports:
   *   • `[{...}, {...}]`               — top-level array
   *   • `{ rows: [...] }`              — named array
   *   • `{ data: [...] }`              — alternate name
   *   • `{ positionId: ... }`          — single-row object
   * Anything else returns `[]` (and the message is effectively dropped).
   */
  private extractRows(data: unknown): StompRow[] {
    if (Array.isArray(data)) return data as StompRow[];
    if (!data || typeof data !== 'object') return [];
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.rows)) return obj.rows as StompRow[];
    if (Array.isArray(obj.data)) return obj.data as StompRow[];
    return [obj as StompRow];
  }

  private resolveTemplate(input: string): string {
    return input.replace(/{clientId}/g, this.clientId);
  }
}

// ─── Default `createClient` — lazy imports `@stomp/stompjs` ───────────

let _clientCtor:
  | (new (cfg: StompClientConfig) => StompClientLike)
  | null = null;

const defaultCreateClient: StompClientFactory = (cfg) => {
  if (!_clientCtor) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@stomp/stompjs') as { Client: new (cfg: StompClientConfig) => StompClientLike };
    _clientCtor = mod.Client;
  }
  return new _clientCtor(cfg);
};
