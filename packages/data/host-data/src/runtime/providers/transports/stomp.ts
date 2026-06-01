/**
 * STOMP provider — `startStomp(cfg, emit)` + `probeStomp(cfg)` for
 * the editor's Test Connection / Infer Fields buttons.
 *
 * **IDataProvider alignment (streaming provider):**
 *   - `start()` → connect + subscribe; snapshot phase buffers rows
 *     locally and emits `{ rowsReceived }` for loading overlays.
 *   - Snapshot flush → chunked `{ rows, replace }` to the hub;
 *     client `SnapshotReassembler` assembles + fires `onSnapshotData`.
 *   - Live phase → keyed `{ rows }` deltas (maps to `onTick`).
 *   - `refresh()` on the adapter replays hub cache; `restart(extra)`
 *     reconnects and re-runs the snapshot lifecycle.
 *
 * Lifecycle:
 *   start():
 *     1. Connect WebSocket via @stomp/stompjs.
 *     2. On `onConnect`: subscribe to `cfg.listenerTopic`, publish
 *        the trigger frame to `cfg.requestMessage` (body =
 *        `cfg.requestBody ?? ''`).
 *     3. Each frame body is parsed as JSON. Arrays expand; single
 *        objects become a 1-element batch.
 *     4. **Snapshot phase** (before the case-insensitive
 *        `cfg.snapshotEndToken` matches a frame): rows are
 *        accumulated in an in-memory buffer. Each batch emits
 *        `{ rowsReceived: buffer.length }` so the hub can surface
 *        progressive counts before the cache exists. Row payloads are
 *        not emitted per-frame. When the end-token arrives we flush the
 *        buffer as chunked `emit({ rows, replace })` frames followed
 *        by `emit({ status: 'ready' })`. The Hub merges chunks into
 *        its cache; listeners apply via `setGridOption('rowData', ...)`
 *        (one cheap reset instead of N small `add` transactions).
 *     5. **Live phase** (after the end-token): each frame emits as
 *        keyed deltas via `emit({ rows })` — Hub upserts into its
 *        cache, listeners receive `{replace: false}` and route to
 *        `applyTransactionAsync` (split into adds vs updates by
 *        `getRowNode` on the consumer side).
 *     6. **No end-token configured** (legacy / probe paths): we
 *        cannot tell snapshot from live, so every frame emits as a
 *        delta. Status stays `loading` until something else flips
 *        it (typically the consumer relies on the cache filling up).
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

import type { StompProviderConfig } from '@starui/types';
import { composeRowId } from '@starui/types';
import type { ProviderEmit, ProviderHandle } from '../Provider.js';
import { resolveBracketCfg } from '../../template/bracketResolver.js';
import {
  assertAppDataResolved,
  resolveCfg,
  type AppDataLookup,
} from '../../template/resolver.js';
import { traceStompProviderCfg, traceStompWireDestinations } from '../../template/templateTrace.js';
import { validateStompPathContract } from './stompPathContract.js';

/**
 * Maximum rows to ship in a single `postMessage` from the worker.
 * Larger snapshots are split into multiple replace+delta frames so
 * the receiving main-thread `message` handler completes inside
 * Chromium's 50ms long-task budget (the source of the
 * "[Violation] 'message' handler took 266ms" advisories).
 *
 * 500 is a balance: empirically a 500-row structured-clone of
 * typical position rows takes ~10–25ms; halving it makes no
 * material difference but doubles the round-trips.
 */
const SNAPSHOT_CHUNK_SIZE = 500;

// ─── Minimal structural type for the stompjs Client we use ────────

interface StompClient {
  connected: boolean;
  reconnectDelay: number;
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
  deactivate(options?: { force?: boolean }): Promise<void> | void;
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

/** Resolve Client from @stomp/stompjs ESM or UMD interop shapes (Vite/Rollup). */
export function resolveStompClientCtor(
  mod: unknown,
): new (cfg: StompClientCfg) => StompClient {
  const root = mod as Record<string, unknown>;
  const defaultNs =
    root.default && typeof root.default === 'object'
      ? (root.default as Record<string, unknown>)
      : undefined;

  const candidates: unknown[] = [
    root.Client,
    defaultNs?.Client,
    typeof root.default === 'function' ? root.default : undefined,
    root.StompJs && typeof root.StompJs === 'object'
      ? (root.StompJs as Record<string, unknown>).Client
      : undefined,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'function') {
      return candidate as new (cfg: StompClientCfg) => StompClient;
    }
  }

  const keys = [
    ...Object.keys(root),
    ...(defaultNs ? Object.keys(defaultNs).map((k) => `default.${k}`) : []),
  ].join(', ');

  throw new Error(
    '[stomp] @stomp/stompjs loaded but Client constructor not found on the module namespace ' +
      '(tried `Client`, `default.Client`, `default` as ctor, `StompJs.Client`). Module keys: ' +
      keys,
  );
}

async function loadDefaultClientCtor(): Promise<new (cfg: StompClientCfg) => StompClient> {
  if (_ctor) return _ctor;
  if (!_ctorPromise) {
    _ctorPromise = import('@stomp/stompjs').then((m) => {
      const Ctor = resolveStompClientCtor(m);
      _ctor = Ctor;
      return _ctor;
    });
  }
  return _ctorPromise;
}

export interface StompOpts {
  /** Inject the Client constructor for tests. */
  createClient?: StompClientFactory;
  /**
   * Skip the snapshot-phase row buffer and forward every batch as a
   * `{rows}` delta in real time. Used by `probeStomp` (which wants
   * the first N rows ASAP regardless of where the end-token sits)
   * and by callers that just want raw frame fan-out. Default: false
   * — Hub consumers want the buffered, replace-flagged snapshot.
   */
  passthroughSnapshot?: boolean;
  /** Resolve `{{name.key}}` on every STOMP connect/restart (worker AppData). */
  appDataLookup?: AppDataLookup;
}

/** Keys commonly used for historical as-of dates in STOMP destination templates. */
export function isHistoricalDateAppDataKey(key: string): boolean {
  const normalized = key.replace(/-/g, '').toLowerCase();
  return normalized === 'asofdate' || normalized === 'positionasofdate';
}

/**
 * Merge worker AppData lookup with `restart({ asOfDate })` overlay.
 * When overlay carries `asOfDate`, it wins for historical date keys so
 * toolbar reload is deterministic even if AppData is stale or still syncing.
 */
export function lookupWithRestartOverlay(
  lookup: AppDataLookup | undefined,
  overlay: Record<string, unknown> | undefined,
): AppDataLookup | undefined {
  const asOfDate = typeof overlay?.asOfDate === 'string' ? overlay.asOfDate : undefined;
  if (!lookup && !asOfDate) return undefined;
  return (name, key) => {
    if (asOfDate && isHistoricalDateAppDataKey(key)) return asOfDate;
    return lookup?.(name, key);
  };
}

export interface StompWireDestinations {
  listenerTopic: string;
  requestMessage?: string;
  requestBody?: string;
}

/** @deprecated Prefer `validateStompWireReady`. */
export function stompWireDestinationsUnresolved(
  destinations: Pick<StompWireDestinations, 'listenerTopic' | 'requestMessage'>,
): string | null {
  return validateStompWireReady(destinations);
}

/**
 * Deterministic pre-wire gate: no `{{name.key}}` tokens on the broker path and
 * historical/live trigger shapes match the stomp-view-server contract.
 */
export function validateStompWireReady(destinations: StompWireDestinations): string | null {
  if (destinations.listenerTopic.includes('{{')) {
    return `Unresolved AppData template in STOMP listenerTopic: ${destinations.listenerTopic}`;
  }
  if (destinations.requestMessage?.includes('{{')) {
    return `Unresolved AppData template in STOMP requestMessage: ${destinations.requestMessage}`;
  }
  if (destinations.requestBody?.includes('{{')) {
    return `Unresolved AppData template in STOMP requestBody: ${destinations.requestBody}`;
  }
  return validateStompPathContract(
    destinations.listenerTopic,
    destinations.requestMessage,
  );
}

/** Resolve catalog cfg + overlay into broker wire destinations (deterministic order). */
export function resolveEffectiveStompCfg(
  templateCfg: StompProviderConfig,
  lookup: AppDataLookup | undefined,
  overlay: Record<string, unknown> | undefined,
): {
  cfg: StompProviderConfig;
  destinations: ReturnType<typeof resolveStompDestinations>;
} {
  const mergedLookup = lookupWithRestartOverlay(lookup, overlay);
  const cfgAfterAppData = mergedLookup
    ? resolveCfg(templateCfg, mergedLookup) as StompProviderConfig
    : templateCfg;
  return {
    cfg: cfgAfterAppData,
    destinations: resolveStompDestinations(cfgAfterAppData, overlay),
  };
}

/** Tear down STOMP subscription + session; disable auto-reconnect. */
async function teardownStompConnection(
  client: StompClient | null,
  sub: { unsubscribe(): void } | null,
): Promise<void> {
  if (sub) {
    try { sub.unsubscribe(); } catch { /* ignore */ }
  }
  if (!client) return;

  client.onConnect = undefined;
  client.onStompError = undefined;
  client.onWebSocketError = undefined;
  client.onDisconnect = undefined;
  client.reconnectDelay = 0;

  try {
    await client.deactivate();
  } catch {
    try {
      await client.deactivate({ force: true });
    } catch { /* ignore */ }
  }
}

// ─── start() — long-running provider ───────────────────────────────

export function startStomp(
  cfg: StompProviderConfig,
  emit: ProviderEmit,
  opts: StompOpts = {},
): ProviderHandle {
  // `hasEndToken` decides whether we buffer-then-flush (true) or
  // straight-pass each frame (false). When the cfg has no end token
  // there is no defined "snapshot complete" moment, so buffering
  // would never flush.
  // `passthroughSnapshot` (probe / debug callers) also disables
  // buffering — they want frames as they arrive.
  const hasEndToken = Boolean(cfg.snapshotEndToken);
  const buffering = hasEndToken && !opts.passthroughSnapshot;

  const state = {
    client: null as StompClient | null,
    sub: null as { unsubscribe(): void } | null,
    snapshotComplete: !buffering, // no buffering → start in live phase
    receivingSnapshot: false,
    snapshotBuffer: [] as unknown[],
    overlay: undefined as Record<string, unknown> | undefined,
    stopped: false,
    /** Bumped on stop/restart so in-flight connect callbacks are ignored. */
    connectGeneration: 0,
    /** True after the first successful STOMP session (subscribe + trigger). */
    hadSuccessfulConnect: false,
    /** When set, the next onConnect restarts the snapshot from scratch. */
    reconnectRestartPending: false,
  };

  const beginSnapshotPhase = () => {
    state.snapshotComplete = !buffering;
    state.receivingSnapshot = false;
    state.snapshotBuffer = [];
    emit({ rows: [], replace: true });
    emit({ status: 'loading' });
  };

  const markDisconnected = () => {
    if (state.stopped || !state.hadSuccessfulConnect) return;
    state.reconnectRestartPending = true;
    emit({ status: 'error', error: 'Provider disconnected' });
  };

  const flushSnapshot = () => {
    // Stream the snapshot in chunks so each `postMessage` across the
    // worker→main boundary stays small enough that the receiving
    // `message` handler completes under Chromium's 50ms long-task
    // threshold. The first chunk carries `replace: true` so the Hub
    // resets its cache and the consumer's snapshot promise can
    // resolve; subsequent chunks ride as `replace: false` deltas
    // (the Hub merges them into its cache, the client buffers them
    // until `onUpdate` is registered, then they flush as live
    // updates). A zero-row snapshot still emits one replace=true
    // frame so consumers see the deterministic snapshot-complete
    // signal.
    // Dedupe by keyColumn before chunking so the same row id doesn't
    // appear in two different chunks. Non-chunked snapshots used to
    // ride a single replace=true broadcast which the Hub deduped via
    // its cache; with chunking, chunks 1..N broadcast their own batch
    // values, so an id appearing in both chunk0 (set in cache) and
    // chunk1 (set in cache again) would be sent twice — once via
    // replace=true cache snapshot, once via replace=false batch — and
    // the consumer would see a duplicate. Last-write-wins ordering is
    // preserved by Map's insertion semantics.
    const keyColumn = (cfg as { keyColumn?: string | readonly string[] }).keyColumn;
    const buffer = dedupSnapshotBuffer(state.snapshotBuffer, keyColumn);
    state.snapshotBuffer = [];
    state.receivingSnapshot = false;
    // eslint-disable-next-line no-console
    console.log(
      `[v2/stomp] flushSnapshot: ${buffer.length} rows in ${
        Math.max(1, Math.ceil(buffer.length / SNAPSHOT_CHUNK_SIZE))
      } chunk(s) of ${SNAPSHOT_CHUNK_SIZE}`,
    );
    if (buffer.length === 0) {
      emit({ rows: [], replace: true });
      return;
    }
    for (let offset = 0; offset < buffer.length; offset += SNAPSHOT_CHUNK_SIZE) {
      const chunk = buffer.slice(offset, offset + SNAPSHOT_CHUNK_SIZE);
      emit({ rows: chunk, replace: offset === 0 });
    }
  };

  const handleFrame = (body: string) => {
    if (state.stopped) return;
    const trimmed = body.trim();
    const byteSize = body.length;

    // End-of-snapshot token (case-insensitive substring match).
    if (matchesEndToken(trimmed, cfg.snapshotEndToken)) {
      // eslint-disable-next-line no-console
      console.log(`[v2/stomp] end-token matched: "${cfg.snapshotEndToken}" — closing snapshot phase`);
      if (!state.snapshotComplete) {
        flushSnapshot();
        state.snapshotComplete = true;
      }
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

    if (!state.snapshotComplete) {
      // Snapshot phase: accumulate in memory; surface progressive count.
      if (rows.length > 0) {
        state.receivingSnapshot = true;
      }
      state.snapshotBuffer.push(...rows);
      emit({ rowsReceived: state.snapshotBuffer.length });
      emit({ byteSize });
      return;
    }

    // Live phase: pass through as a keyed delta.
    emit({ rows });
    emit({ byteSize });
  };

  const start = async () => {
    if (state.stopped) return;
    const generation = ++state.connectGeneration;
    state.receivingSnapshot = false;
    emit({ status: 'loading' });

    let client: StompClient;
    try {
      const Ctor = opts.createClient
        ? null
        : await loadDefaultClientCtor();
      if (state.stopped || generation !== state.connectGeneration) return;
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
    if (state.stopped || generation !== state.connectGeneration) return;

    state.client = client;

    client.onConnect = () => {
      if (state.stopped || generation !== state.connectGeneration) return;
      if (state.reconnectRestartPending) {
        state.reconnectRestartPending = false;
        beginSnapshotPhase();
      }
      state.hadSuccessfulConnect = true;
      const { cfg: resolvedCfg, destinations } = resolveEffectiveStompCfg(
        cfg,
        opts.appDataLookup,
        state.overlay,
      );
      traceStompProviderCfg(
        'stomp.onConnect (after worker AppData resolve)',
        resolvedCfg,
        { extra: state.overlay, lookup: lookupWithRestartOverlay(opts.appDataLookup, state.overlay) },
      );
      const publishBody = destinations.requestMessage
        ? mergeOverlay(resolvedCfg.requestBody ?? '', state.overlay)
        : undefined;
      traceStompWireDestinations('stomp.onConnect (wire destinations sent to broker)', {
        listenerTopic: destinations.listenerTopic,
        requestMessage: destinations.requestMessage,
        requestBody: publishBody,
        overlay: state.overlay,
        cfgHadUnresolvedTemplates:
          resolvedCfg.listenerTopic.includes('{{')
          || Boolean(resolvedCfg.requestMessage?.includes('{{'))
          || Boolean(resolvedCfg.requestBody?.includes('{{'))
          || Boolean(publishBody?.includes('{{')),
      });
      const cfgUnresolved = assertAppDataResolved(resolvedCfg, 'STOMP provider cfg');
      if (cfgUnresolved) {
        emit({ status: 'error', error: cfgUnresolved });
        return;
      }
      const wireError = validateStompWireReady({
        listenerTopic: destinations.listenerTopic,
        requestMessage: destinations.requestMessage,
        requestBody: publishBody,
      });
      if (wireError) {
        emit({ status: 'error', error: wireError });
        return;
      }
      try {
        state.sub = client.subscribe(destinations.listenerTopic, (msg) => handleFrame(msg.body));
      } catch (err) {
        emit({ status: 'error', error: err instanceof Error ? err.message : String(err) });
        return;
      }
      // Publish the trigger frame. The body can be a literal string or
      // a JSON template; if `extra` was supplied AND the body parses
      // as JSON, we merge the overlay in (the historical-mode pattern).
      if (destinations.requestMessage) {
        const body = publishBody ?? mergeOverlay(resolvedCfg.requestBody ?? '', state.overlay);
        try {
          client.publish({ destination: destinations.requestMessage, body });
        } catch (err) {
          emit({ status: 'error', error: err instanceof Error ? err.message : String(err) });
        }
      }
    };
    client.onDisconnect = () => {
      if (state.stopped || generation !== state.connectGeneration) return;
      markDisconnected();
    };
    client.onWebSocketError = () => {
      if (state.stopped || generation !== state.connectGeneration) return;
      if (state.hadSuccessfulConnect) {
        markDisconnected();
      } else {
        emit({ status: 'error', error: 'WebSocket connection failed' });
      }
    };
    client.onStompError = (frame) => {
      if (state.stopped || generation !== state.connectGeneration) return;
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
    state.connectGeneration += 1;
    const client = state.client;
    const sub = state.sub;
    state.sub = null;
    state.client = null;
    state.receivingSnapshot = false;
    state.snapshotBuffer = [];
    await teardownStompConnection(client, sub);
  };

  // Kick off async start so listeners attached after `startStomp`
  // returns still see the loading status event (Hub calls us
  // synchronously from attach).
  void start();

  return {
    stop,
    restart: async (extra) => {
      state.overlay = extra;
      state.connectGeneration += 1;
      const client = state.client;
      const sub = state.sub;
      state.sub = null;
      state.client = null;
      await teardownStompConnection(client, sub);
      // Reset snapshot tracking. `snapshotComplete` returns to its
      // initial value (`!buffering`) so the new connection re-buffers
      // its snapshot phase if buffering is enabled.
      state.reconnectRestartPending = false;
      beginSnapshotPhase();
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
  // Resolve [bracket] tokens before probing — same as startProvider does
  // for the live path. Without this, tokens like [sid] reach the server
  // as literal strings instead of session-unique IDs.
  const resolvedCfg = resolveBracketCfg(cfg, new Map());
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

    const handle = startStomp(resolvedCfg, (event) => {
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
    }, {
      // Probe must see rows as they arrive so it can cap at maxRows
      // and resolve quickly. Buffering the snapshot would defer
      // every row to the end-token (or never, if there isn't one).
      passthroughSnapshot: true,
      ...(opts.createClient ? { createClient: opts.createClient } : {}),
    });
  });
}

// ─── helpers ───────────────────────────────────────────────────────

function matchesEndToken(body: string, token: string | undefined): boolean {
  if (!token) return false;
  return body.toLowerCase().includes(token.toLowerCase());
}

/**
 * Deduplicate a snapshot buffer by keyColumn, preserving last-write-
 * wins ordering. Rows without a resolvable key fall through unchanged
 * (we can't dedup them, and dropping them would lose data). When the
 * cfg has no keyColumn, the buffer is returned as-is — the consumer
 * must already accept arbitrary duplicates in that mode.
 */
function dedupSnapshotBuffer(
  rows: readonly unknown[],
  keyColumn: string | readonly string[] | undefined,
): unknown[] {
  if (!keyColumn || rows.length === 0) return rows.slice();
  const byKey = new Map<string, unknown>();
  const noKey: unknown[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') {
      noKey.push(row);
      continue;
    }
    const id = composeRowId(row as Record<string, unknown>, keyColumn);
    if (id === null) {
      noKey.push(row);
      continue;
    }
    byKey.set(id, row);
  }
  // Keyed rows first (last-write-wins per key), then keyless tail.
  return [...byKey.values(), ...noKey];
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

/** Substitute `overlay.asOfDate` into STOMP destination strings for historical snapshots. */
export function resolveStompDestinations(
  cfg: Pick<StompProviderConfig, 'listenerTopic' | 'requestMessage'>,
  overlay: Record<string, unknown> | undefined,
): { listenerTopic: string; requestMessage: string | undefined } {
  const asOfDate = typeof overlay?.asOfDate === 'string' ? overlay.asOfDate : undefined;
  if (!asOfDate) {
    return {
      listenerTopic: cfg.listenerTopic,
      requestMessage: cfg.requestMessage,
    };
  }
  const replaceAsOfDate = (value: string) =>
    value
      .replace(/\{\{positions\.asOfDate\}\}/g, asOfDate)
      .replace(/\{\{asOfDate\}\}/g, asOfDate);
  return {
    listenerTopic: replaceAsOfDate(cfg.listenerTopic),
    requestMessage: cfg.requestMessage ? replaceAsOfDate(cfg.requestMessage) : undefined,
  };
}
