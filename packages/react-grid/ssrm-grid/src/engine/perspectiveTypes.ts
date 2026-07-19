/**
 * Minimal structural types for the `@finos/perspective` client surface the
 * SSRM engine uses.
 *
 * Declared here rather than importing `@finos/perspective` so `ssrm-grid`
 * carries no hard runtime dependency on it: the host (window) creates the
 * client — `perspective.worker(sharedWorker)` — and injects it. Keeps the
 * package installable for consumers that only use the custom engine, and
 * keeps the WASM out of bundles that never touch Perspective.
 *
 * See ADR-ssrm-worker-hosted-engine.md.
 */

/** A Perspective `View` — a query over a table, maintained incrementally. */
export interface PerspectiveView {
  to_columns(window?: {
    start_row?: number;
    end_row?: number;
  }): Promise<Record<string, unknown[]>>;
  num_rows(): Promise<number>;
  on_update(callback: (updated: unknown) => void, options?: unknown): Promise<number>;
  delete(): Promise<void>;
}

/** Perspective view config — the subset the engine builds. */
export interface PerspectiveViewConfig {
  columns?: string[];
  group_by?: string[];
  split_by?: string[];
  filter?: Array<[string, string, unknown]>;
  filter_op?: "and" | "or";
  sort?: Array<[string, string]>;
  aggregates?: Record<string, string>;
  expressions?: Record<string, string>;
}

/** A Perspective `Table` — the single shared dataset. */
export interface PerspectiveTable {
  view(config?: PerspectiveViewConfig): Promise<PerspectiveView>;
  update(rows: Record<string, unknown>[] | string): Promise<void>;
  replace(rows: Record<string, unknown>[] | string): Promise<void>;
  remove(keys: (string | number)[]): Promise<void>;
  size(): Promise<number>;
  columns(): Promise<string[]>;
  delete(): Promise<void>;
}

/**
 * A Perspective `Client` — in this architecture a proxy to the server hosted
 * in the provider SharedWorker, so every call round-trips off the main thread.
 */
export interface PerspectiveClient {
  table(
    data: Record<string, unknown>[] | Record<string, string> | string,
    options?: { index?: string; name?: string; limit?: number },
  ): Promise<PerspectiveTable>;
  open_table(name: string): Promise<PerspectiveTable>;
  get_hosted_table_names(): Promise<string[]>;
}
