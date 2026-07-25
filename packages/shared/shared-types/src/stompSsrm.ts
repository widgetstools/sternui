// `stomp-ssrm` provider configuration — the SSRM STOMP provider V2
// (pull plane). See docs/SSRM_PROVIDER_V2_DESIGN.md.
//
// Unlike the push-plane `stomp` provider (whose worker hub caches rows
// and fans deltas out to every window), the SSRM provider's SharedWorker
// ingests the STOMP snapshot + live ticks straight into a Perspective
// table it hosts itself — THE ONLY COPY of the book — and windows read
// that table directly through AG Grid's server-side row model. The two
// providers therefore carry DIFFERENT knobs: none of the push-plane
// fan-out/throttle/conflation/wire-format options exist here, and every
// field below maps onto something the SSRM worker actually consumes
// (`SsrmDatasetConfig` in @starui/host-data — see `toSsrmDatasetConfig`)
// except where explicitly documented as editor-side or reserved.

import type { ColumnDefinition, FieldInfo } from './dataProvider.js';

/**
 * SSRM STOMP Provider Configuration (`providerType: 'stomp-ssrm'`).
 *
 * Stored as a `data-provider` catalog row with
 * `componentSubType: 'stomp-ssrm'`, exactly like the other provider
 * types. Attaching goes through the dedicated SSRM provider
 * SharedWorker (`connectSsrmProvider` in @starui/ssrm-grid), never
 * through the CSRM data-services hub.
 */
export interface StompSsrmProviderConfig {
  providerType: 'stomp-ssrm';
  /** WebSocket broker URL, e.g. `ws://localhost:8081`. */
  websocketUrl: string;
  /** Topic carrying snapshot batches + live ticks. */
  listenerTopic: string;
  /** SEND destination that triggers the snapshot (optional for push-only brokers). */
  requestMessage?: string;
  /** Literal body for the trigger frame. */
  requestBody?: string;
  /** Extra STOMP headers on the trigger SEND (e.g. `snapshot-rows`). */
  requestHeaders?: Record<string, string>;
  /** Case-insensitive substring marking end-of-snapshot in a frame body. */
  snapshotEndToken?: string;
  /**
   * Unique-row identity — becomes the Perspective table index; every
   * write is keyed on it. REQUIRED, and a SINGLE column only (the pull
   * plane has no composite-key support — see `validateStompSsrmConfig`).
   */
  keyColumn: string;
  /**
   * Column definitions — the SINGLE declaration of the Perspective
   * table schema AND the grid columns (dotted-leaf projection; no
   * drift). Columns without a usable `cellDataType` are refined from
   * the first snapshot rows while the dataset is `seeding`; when the
   * list is empty the sample rows define the whole schema.
   */
  columnDefinitions?: ColumnDefinition[];
  /** Persisted schema introspection — same role as on the push-plane configs. */
  inferredFields?: FieldInfo[];
  /**
   * Perspective table name windows `open_table(...)`. Default
   * `'dataset'`. One provider hosts one table.
   */
  tableName?: string;
  /** STOMP heartbeat (ms). Default 4000/4000. */
  heartbeat?: { outgoing?: number; incoming?: number };
  /**
   * Bound on the worker's pre-table row buffer (frames that arrive
   * before the first snapshot batch creates the table). Overflow is a
   * hard dataset error — the buffer is a startup shim, never a second
   * book. Default 100000.
   */
  maxBufferedRows?: number;
  /**
   * RESERVED — not consumed by the V2 worker and not mapped by
   * `toSsrmDatasetConfig`. The SSRM ingest session deliberately never
   * auto-redials (a broken session surfaces as a dataset `error`;
   * recovery is an explicit restart that bumps THE generation token).
   * The field mirrors the push-plane `reconnect` schema so a future
   * worker-side auto-restart policy needs no config migration.
   */
  reconnect?: {
    /** Reserved for a future auto-restart policy. Currently ignored. */
    initialDelayMs?: number;
  };
}

// ─── Validation ───────────────────────────────────────────────────────

/** Config fields a validation issue can point at (drives inline editor errors). */
export type StompSsrmIssueField = 'websocketUrl' | 'listenerTopic' | 'keyColumn';

export type StompSsrmIssueCode =
  | 'missing'
  | 'malformed'
  | 'composite-key'
  | 'key-not-in-columns';

export interface StompSsrmValidationIssue {
  field: StompSsrmIssueField;
  code: StompSsrmIssueCode;
  message: string;
}

/** True when the string carries `{{appData.key}}` / `[name]` template tokens. */
function hasTemplateTokens(value: string): boolean {
  return value.includes('{{') || value.includes('[');
}

/**
 * Pure structural validation for a `stomp-ssrm` config. Returns one
 * issue per problem (empty array = valid):
 *
 * - `websocketUrl` blank → `missing`; non-blank but not a parseable
 *   `ws://` / `wss://` URL → `malformed` (skipped when the value
 *   carries template tokens — shape can't be judged until resolution).
 * - `listenerTopic` blank → `missing`.
 * - `keyColumn` absent/blank → `missing`; an array (composite key,
 *   which the push-plane configs allow) → `composite-key`; not among
 *   the declared `columnDefinitions[].field`s → `key-not-in-columns`
 *   (only checked when columns are declared — an empty list means the
 *   schema is refined from the first snapshot rows, and the worker
 *   always injects the key column into the table schema).
 *
 * Accepts `Partial` + unknown-shaped `keyColumn` because editor drafts
 * and hand-authored catalog rows routinely hold both.
 */
export function validateStompSsrmConfig(
  cfg: Partial<Omit<StompSsrmProviderConfig, 'keyColumn'>> & { keyColumn?: unknown },
): StompSsrmValidationIssue[] {
  const issues: StompSsrmValidationIssue[] = [];

  const url = typeof cfg.websocketUrl === 'string' ? cfg.websocketUrl.trim() : '';
  if (!url) {
    issues.push({
      field: 'websocketUrl',
      code: 'missing',
      message: 'WebSocket URL is required.',
    });
  } else if (!hasTemplateTokens(url) && !isWsUrl(url)) {
    issues.push({
      field: 'websocketUrl',
      code: 'malformed',
      message: 'WebSocket URL must be a valid ws:// or wss:// URL.',
    });
  }

  const topic = typeof cfg.listenerTopic === 'string' ? cfg.listenerTopic.trim() : '';
  if (!topic) {
    issues.push({
      field: 'listenerTopic',
      code: 'missing',
      message: 'Listener topic is required.',
    });
  }

  const key = cfg.keyColumn;
  if (Array.isArray(key)) {
    issues.push({
      field: 'keyColumn',
      code: 'composite-key',
      message: 'SSRM providers key rows on a single column — composite keys are not supported.',
    });
  } else {
    const keyStr = typeof key === 'string' ? key.trim() : '';
    if (!keyStr) {
      issues.push({
        field: 'keyColumn',
        code: 'missing',
        message: 'Key column is required — the Perspective table is indexed by it.',
      });
    } else {
      const fields = (cfg.columnDefinitions ?? []).map((c) => c.field);
      if (fields.length > 0 && !fields.includes(keyStr)) {
        issues.push({
          field: 'keyColumn',
          code: 'key-not-in-columns',
          message: `Key column '${keyStr}' must appear in the column definitions.`,
        });
      }
    }
  }

  return issues;
}

function isWsUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'ws:' || parsed.protocol === 'wss:';
  } catch {
    return false;
  }
}
