/**
 * SSRM STOMP provider V2 — pull-plane window types.
 *
 * The pull plane reads THE hosted Perspective table directly (no JS row
 * copy in the window). These are minimal structural surfaces over the
 * vendor `@finos/perspective` client objects so the datasource stays
 * unit-testable with injected fakes; the vendor `Table`/`View` satisfy
 * them at runtime (see `connectSsrmProvider`).
 *
 * See docs/SSRM_PROVIDER_V2_DESIGN.md (P2).
 */

import type { DatasetStateSnapshot } from '@starui/host-data/runtime/ssrm';

// ─── Perspective query surface (structural) ────────────────────────

/** Perspective filter operators the P2 mapping emits. */
export type PullFilterOp =
  | '=='
  | '!='
  | '>'
  | '>='
  | '<'
  | '<='
  | 'contains'
  | 'begins with'
  | 'ends with'
  | 'in'
  | 'not in'
  | 'is null'
  | 'is not null';

export type PullFilterTerm =
  | string
  | number
  | boolean
  | null
  | Array<string | number | boolean | null>;

/** One Perspective filter clause — clauses join with AND. */
export type PullFilter = [string, PullFilterOp, PullFilterTerm];

export type PullSort = [string, 'asc' | 'desc'];

/** The subset of Perspective's ViewConfig the pull plane emits. */
export interface PullViewConfig {
  columns?: string[];
  sort?: PullSort[];
  filter?: PullFilter[];
  /** Row grouping — ONE level per view (the request's next level). */
  group_by?: string[];
  /**
   * How the `filter` clauses combine. VIEW-GLOBAL, hence the default
   * (AND) for everything except the single-token quick-filter fast path,
   * where the clauses are the only ones present and must OR across
   * columns. Setting this with any other clause in `filter` would widen
   * the result instead of narrowing it.
   */
  filter_op?: 'and' | 'or';
  /** Boolean/constant expression columns (filters, quick filter, rollup). */
  expressions?: Record<string, string>;
  /** Per-column aggregates for grouped/rollup views. */
  aggregates?: PullAggregates;
}

/**
 * Per-column aggregate spec. Usually a name (`'sum'`, `'avg'`, `'first'`
 * …), but weighted mean is a TUPLE — `['weighted mean', [weightField]]`
 * — because the weight lives in another column. There is no bare
 * `wavg` in this engine build.
 */
export type PullAggregate = string | [string, string[]];
export type PullAggregates = Record<string, PullAggregate>;

/** Structural surface of a vendor `View`. */
export interface PullView {
  num_rows(): Promise<number>;
  to_json(window?: { start_row?: number; end_row?: number }): Promise<Record<string, unknown>[]>;
  on_update(callback: () => void): Promise<number>;
  remove_update(callbackId: number): Promise<void>;
  delete(): Promise<void>;
}

/** Structural surface of a vendor `Table`. */
export interface PullTable {
  view(config?: PullViewConfig): Promise<PullView>;
  size(): Promise<number>;
}

// ─── Provider connection seam ──────────────────────────────────────

/**
 * What the datasource needs from `connectSsrmProvider` — narrow on
 * purpose so tests inject a fake connection.
 */
export interface PullDatasourceConnection {
  /** Latest DatasetState snapshot, or null before the first one. */
  readonly state: DatasetStateSnapshot | null;
  /**
   * Subscribe to DatasetState. Replays the latest snapshot immediately
   * (when one exists), then every transition. Returns unsubscribe.
   */
  onState(listener: (state: DatasetStateSnapshot) => void): () => void;
  /** The hosted Perspective table (memoized by the connection). */
  openTable(): Promise<PullTable>;
}
