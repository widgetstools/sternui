/**
 * RestDataProvider — snapshot-only StreamProvider that fetches rows
 * from a REST endpoint.
 *
 * Snapshot lifecycle
 * ------------------
 * Unlike STOMP (which has a snapshot phase + a continuous realtime
 * tail), REST endpoints typically return a single payload representing
 * the current view of the data. The provider:
 *   1. On `start()`: issues the request, parses the rows, ingests
 *      them via `ingestSnapshotBatch(rows)`, then immediately calls
 *      `markSnapshotComplete()`. No realtime phase follows.
 *   2. On `restart(extra)`: re-fetches. The `extra` bag is merged
 *      into the request body for templating — used by MarketsGrid's
 *      historical-mode date picker (`{ asOfDate: '2026-04-01' }`).
 *
 * Same `addListener()` surface as `StompStreamProvider`, so the worker
 * router can treat both interchangeably; the distinguishing fact is
 * "no row-update events ever fire".
 *
 * Templating
 * ----------
 * `body` may carry `{{providerId.key}}` tokens. Resolution happens at
 * `start()` time via the worker's resolve mechanism (the host shell
 * is expected to call `client.resolve(template)` and pass the resolved
 * string into the request body before this provider sees it). To keep
 * RestDataProvider transport-agnostic, the resolution is the caller's
 * responsibility — the provider just sends whatever body is in the
 * config plus any `extra` overlay from `restart()`.
 */

import type {
  ProviderType,
  RestProviderConfig,
} from '@marketsui/shared-types';
import { StreamProviderBase } from './StreamProviderBase';

type RestRow = Record<string, unknown>;

/** Optional fetch override for tests. */
export type RestFetchFn = (url: string, init: RequestInit) => Promise<Response>;

export interface RestProviderOpts {
  fetchImpl?: RestFetchFn;
}

export class RestDataProvider extends StreamProviderBase<RestProviderConfig, RestRow> {
  readonly type: ProviderType = 'rest';

  private config: RestProviderConfig | undefined;
  private readonly fetchImpl: RestFetchFn;
  /** Per-restart overlay onto the request body (e.g. { asOfDate }). */
  private restartOverlay: Record<string, unknown> | undefined;

  constructor(id: string, opts: RestProviderOpts = {}) {
    // Placeholder keyColumn replaced in configure() once the config
    // arrives. Same pattern as StompStreamProvider.
    super(id, { keyColumn: '__uninitialised__' });
    this.fetchImpl = opts.fetchImpl ?? (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null as unknown as RestFetchFn);
    if (!this.fetchImpl) {
      throw new Error('[RestDataProvider] no fetch implementation available');
    }
  }

  async configure(config: RestProviderConfig): Promise<void> {
    if (!config.baseUrl) throw new Error('[RestDataProvider] config.baseUrl is required');
    if (!config.endpoint) throw new Error('[RestDataProvider] config.endpoint is required');
    if (!config.keyColumn) throw new Error('[RestDataProvider] config.keyColumn is required');

    // Re-key the cache to the configured column. Mirror StompStreamProvider.
    const { RowCache } = await import('../worker/rowCache');
    (this as unknown as { cache: import('../worker/rowCache').RowCache<RestRow> }).cache =
      new RowCache<RestRow>({ keyColumn: config.keyColumn });

    this.config = config;
    this.lastConfig = config;
  }

  async start(): Promise<void> {
    if (!this.config) {
      throw new Error('[RestDataProvider] configure() must be called before start()');
    }
    const cfg = this.config;

    const url = this.buildUrl(cfg);
    const init: RequestInit = {
      method: cfg.method,
      headers: this.buildHeaders(cfg),
    };
    if (cfg.method === 'POST') {
      init.body = this.buildBody(cfg);
    }

    let res: Response;
    try {
      this.reportConnected();
      res = await this.fetchImpl(url, init);
    } catch (err) {
      this.reportError(err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
    if (!res.ok) {
      const err = new Error(`[RestDataProvider] ${cfg.method} ${url} → ${res.status}`);
      this.reportError(err);
      throw err;
    }

    let body: unknown;
    try {
      body = await res.json();
    } catch (err) {
      this.reportError(err instanceof Error ? err : new Error('failed to parse JSON response'));
      throw err;
    }

    const rows = this.extractRows(body, cfg.rowsPath);
    if (rows.length > 0) {
      this.ingestSnapshotBatch(rows);
    }
    this.markSnapshotComplete();
  }

  async stop(): Promise<void> {
    // No persistent connection — start() is fully resolved by the time
    // it returns. stop() is a marker for symmetry; reportDisconnected
    // makes the stat counters consistent.
    this.reportDisconnected();
  }

  /**
   * Re-fetch the snapshot. `extra` is overlaid onto the request body
   * before sending — used by MarketsGrid's historical-mode date picker
   * (`{ asOfDate }`). The overlay only applies to the next `start()`;
   * subsequent natural restarts revert to the configured body unless
   * a fresh `extra` is passed.
   */
  override async restart(extra?: Record<string, unknown>): Promise<void> {
    this.restartOverlay = extra;
    await super.restart(extra);
    this.restartOverlay = undefined;
  }

  // ─── Helpers ────────────────────────────────────────────────────────

  private buildUrl(cfg: RestProviderConfig): string {
    const base = cfg.baseUrl.replace(/\/+$/, '');
    const ep = cfg.endpoint.replace(/^\/+/, '');
    let url = `${base}/${ep}`;
    if (cfg.queryParams && Object.keys(cfg.queryParams).length > 0) {
      const qs = new URLSearchParams(cfg.queryParams).toString();
      url += (url.includes('?') ? '&' : '?') + qs;
    }
    return url;
  }

  private buildHeaders(cfg: RestProviderConfig): Record<string, string> {
    const headers: Record<string, string> = { 'Accept': 'application/json' };
    if (cfg.method === 'POST') headers['Content-Type'] = 'application/json';
    if (cfg.headers) Object.assign(headers, cfg.headers);
    if (cfg.auth) {
      switch (cfg.auth.type) {
        case 'bearer': headers['Authorization'] = `Bearer ${cfg.auth.credentials}`; break;
        case 'apikey': headers[cfg.auth.headerName ?? 'X-API-Key'] = cfg.auth.credentials; break;
        case 'basic':  headers['Authorization'] = `Basic ${cfg.auth.credentials}`; break;
      }
    }
    return headers;
  }

  private buildBody(cfg: RestProviderConfig): string | undefined {
    // The configured body is treated as a JSON string. Merge in any
    // restart overlay so callers (e.g. MarketsGrid) can ship per-call
    // parameters without rewriting the body each time.
    if (!cfg.body && !this.restartOverlay) return undefined;

    let parsed: Record<string, unknown> = {};
    if (cfg.body) {
      try {
        parsed = JSON.parse(cfg.body) as Record<string, unknown>;
      } catch {
        // Non-JSON bodies pass through unchanged when no overlay.
        if (!this.restartOverlay) return cfg.body;
        // Otherwise we can't merge — emit the overlay alone.
        parsed = {};
      }
    }
    return JSON.stringify({ ...parsed, ...(this.restartOverlay ?? {}) });
  }

  /** Walk a dot-notation path; default to the body itself when path is omitted. */
  private extractRows(body: unknown, path?: string): RestRow[] {
    let cursor: unknown = body;
    if (path) {
      for (const seg of path.split('.')) {
        if (cursor && typeof cursor === 'object' && seg in (cursor as Record<string, unknown>)) {
          cursor = (cursor as Record<string, unknown>)[seg];
        } else {
          return [];
        }
      }
    }
    if (!Array.isArray(cursor)) return [];
    return cursor.filter((r): r is RestRow => typeof r === 'object' && r !== null);
  }

  /**
   * One-shot snapshot fetch for the configurator. Builds a temporary
   * provider, runs start() to populate the cache, then returns the
   * rows + error info. Used by the REST configurator's Test
   * Connection + Infer Fields buttons; does NOT register with the
   * worker or hold resources after returning.
   */
  static async fetchSnapshot(
    config: RestProviderConfig,
    opts?: { fetchImpl?: RestFetchFn },
  ): Promise<{ success: boolean; data?: RestRow[]; error?: string }> {
    const p = new RestDataProvider('__configurator-probe__', { fetchImpl: opts?.fetchImpl });
    try {
      // configure() validates the required fields; surface errors
      // verbatim so the configurator can show them in its diagnostics.
      await p.configure(config);
      await p.start();
      return { success: true, data: [...p.getCache()] as RestRow[] };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
