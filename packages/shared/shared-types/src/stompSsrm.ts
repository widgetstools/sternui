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
   * Calc/expression columns: column name → Perspective (ExprTK)
   * expression over REAL columns, e.g.
   * `{ pnlPerUnit: '"pnl" / "quantity"' }`. WINDOW-side: the pull
   * datasource attaches these to every Perspective view it builds
   * (leaf, group-level, rollup, distinct-values, queryAll), so calc
   * columns sort, filter, aggregate and export like real columns. NOT
   * part of the worker's table schema and not mapped by
   * `toSsrmDatasetConfig`. Names must not collide with
   * `columnDefinitions` fields, must not use the reserved `__ssrm`
   * prefix (the plane's expression/stamp namespace), and cannot
   * reference other calc columns (engine limit). Enforced by
   * `validateStompSsrmConfig`.
   */
  calcExpressions?: Record<string, string>;
  /**
   * Server-side TREE data: ordered categorical fields that synthesize
   * the hierarchy (level i groups by `treePathFields[i]`; the deepest
   * route reads leaf rows), e.g. `['bookName', 'trader']` — the
   * dataset needs no natural parent/child column. WINDOW-side
   * (datasource + grid wiring), not mapped by `toSsrmDatasetConfig`.
   * Mutually exclusive with row grouping in the consuming grid.
   */
  treePathFields?: string[];
  /**
   * Wide-book delta gate (design fact #5): column count at/above which
   * the tick sweep degrades to `sweepThrottleWideMs` and refreshes
   * only the viewport's blocks. WINDOW-side, not mapped by
   * `toSsrmDatasetConfig`. Default 80.
   */
  wideColumnThreshold?: number;
  /** Degraded tick-sweep throttle (ms) for wide books. Window-side. Default 1000. */
  sweepThrottleWideMs?: number;
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
export type StompSsrmIssueField =
  | 'websocketUrl'
  | 'listenerTopic'
  | 'keyColumn'
  | 'calcExpressions'
  | 'treePathFields'
  | 'wideColumnThreshold'
  | 'sweepThrottleWideMs';

export type StompSsrmIssueCode =
  | 'missing'
  | 'malformed'
  | 'composite-key'
  | 'key-not-in-columns'
  | 'calc-name-collision'
  | 'calc-reserved-prefix'
  | 'calc-cross-reference'
  | 'tree-field-not-in-columns'
  | 'tree-field-duplicate';

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
 * - `calcExpressions` (window-side, P4b-2): a blank name or blank
 *   expression → `missing`; a name colliding with a declared column →
 *   `calc-name-collision`; a name under the plane's reserved `__ssrm_`
 *   prefix → `calc-reserved-prefix`; an expression referencing another
 *   calc alias (as a quoted `"column"` term) → `calc-cross-reference`
 *   (Perspective expressions cannot see other expression aliases).
 * - `treePathFields`: a blank level → `missing`; a repeated level →
 *   `tree-field-duplicate`; a level not among the declared columns →
 *   `tree-field-not-in-columns` (only when columns are declared, same
 *   rule as `keyColumn`).
 * - `wideColumnThreshold` / `sweepThrottleWideMs`: present but not a
 *   positive finite number (threshold additionally an integer) →
 *   `malformed`.
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

  const columnFields = (cfg.columnDefinitions ?? []).map((c) => c.field);
  validateCalcExpressions(cfg.calcExpressions, columnFields, issues);
  validateTreePathFields(cfg.treePathFields, columnFields, issues);
  validatePositiveNumber(cfg.wideColumnThreshold, 'wideColumnThreshold', true, issues);
  validatePositiveNumber(cfg.sweepThrottleWideMs, 'sweepThrottleWideMs', false, issues);

  return issues;
}

/** Aliases the pull plane reserves for its own stamps/expressions. */
const RESERVED_CALC_PREFIX = '__ssrm';

function validateCalcExpressions(
  calc: Record<string, string> | undefined,
  columnFields: string[],
  issues: StompSsrmValidationIssue[],
): void {
  if (!calc) return;
  const names = Object.keys(calc);
  for (const [name, expression] of Object.entries(calc)) {
    const label = name.trim() === '' ? '(unnamed)' : name;
    if (name.trim() === '') {
      issues.push({
        field: 'calcExpressions',
        code: 'missing',
        message: 'Calc columns need a name.',
      });
    } else if (name.startsWith(RESERVED_CALC_PREFIX)) {
      issues.push({
        field: 'calcExpressions',
        code: 'calc-reserved-prefix',
        message: `Calc column '${name}' uses the reserved '${RESERVED_CALC_PREFIX}' prefix.`,
      });
    } else if (columnFields.includes(name)) {
      issues.push({
        field: 'calcExpressions',
        code: 'calc-name-collision',
        message: `Calc column '${name}' collides with a declared column of the same name.`,
      });
    }
    if (typeof expression !== 'string' || expression.trim() === '') {
      issues.push({
        field: 'calcExpressions',
        code: 'missing',
        message: `Calc column '${label}' needs an expression.`,
      });
      continue;
    }
    // Perspective expressions can only reference REAL columns —
    // an alias quoted as a "column" term inside another expression
    // silently reads as unknown (engine limit, verified P4b-2).
    const referenced = names.find(
      (other) => other !== '' && other !== name && expression.includes(`"${other}"`),
    );
    if (referenced !== undefined) {
      issues.push({
        field: 'calcExpressions',
        code: 'calc-cross-reference',
        message: `Calc column '${label}' references calc column '${referenced}' — expressions can only use real columns.`,
      });
    }
  }
}

function validateTreePathFields(
  treePathFields: string[] | undefined,
  columnFields: string[],
  issues: StompSsrmValidationIssue[],
): void {
  if (!treePathFields || treePathFields.length === 0) return;
  const seen = new Set<string>();
  for (const level of treePathFields) {
    const trimmedLevel = typeof level === 'string' ? level.trim() : '';
    if (trimmedLevel === '') {
      issues.push({
        field: 'treePathFields',
        code: 'missing',
        message: 'Tree levels cannot be blank.',
      });
      continue;
    }
    if (seen.has(trimmedLevel)) {
      issues.push({
        field: 'treePathFields',
        code: 'tree-field-duplicate',
        message: `Tree level '${trimmedLevel}' is repeated.`,
      });
    }
    seen.add(trimmedLevel);
    if (columnFields.length > 0 && !columnFields.includes(trimmedLevel)) {
      issues.push({
        field: 'treePathFields',
        code: 'tree-field-not-in-columns',
        message: `Tree level '${trimmedLevel}' must appear in the column definitions.`,
      });
    }
  }
}

function validatePositiveNumber(
  value: number | undefined,
  field: 'wideColumnThreshold' | 'sweepThrottleWideMs',
  integer: boolean,
  issues: StompSsrmValidationIssue[],
): void {
  if (value === undefined) return;
  const bad =
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 1 ||
    (integer && !Number.isInteger(value));
  if (bad) {
    issues.push({
      field,
      code: 'malformed',
      message:
        field === 'wideColumnThreshold'
          ? 'Wide-column threshold must be a positive whole number of columns.'
          : 'Wide sweep throttle must be a positive number of milliseconds.',
    });
  }
}

function isWsUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'ws:' || parsed.protocol === 'wss:';
  } catch {
    return false;
  }
}
