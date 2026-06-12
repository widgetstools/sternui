import type { RowProfile } from "./data/fiRecords.js";

export type LiveMode = "legacy" | "sparse";

export interface AppConfig {
  port: number;
  nodeEnv: string;
  /**
   * Snapshot row width (env `ROW_PROFILE`): `wide` (default) = full
   * ~8.5 KB nested records, `slim` = top-level primitives only
   * (~1.1 KB) — serialization stops being the bottleneck so the live
   * sweep sustains 4x the row rate. Use `slim` for high-frequency
   * blotter stress tests.
   */
  rowProfile: RowProfile;
  /** Rows delivered in snapshot unless overridden by STOMP header `snapshot-rows` */
  defaultSnapshotRows: number;
  minSnapshotRows: number;
  maxSnapshotRows: number;
  /**
   * Distinct rows mutated + sent per live-update tick unless overridden by
   * STOMP header `updates-per-tick`. Default 1 (one row per frame, the
   * original behaviour). Raise to push a high-frequency stream — aggregate
   * row-updates/sec ≈ `rate × liveUpdatesPerTick`.
   */
  liveUpdatesPerTick: number;
  /**
   * Cap on sweep-driven coverage rows/sec per live stream (env
   * `SWEEP_ROWS_PER_SEC`). The live loop sweeps the whole delivered set
   * in parity waves (evens, then odds), targeting full coverage every
   * second; above this cap it degrades to full coverage every
   * rowCount/cap seconds instead of saturating the event loop. Default
   * tracks the row profile's measured single-thread ceiling: `wide`
   * rows (~8.5 KB) serialize at ~12k rows/s → default 10000; `slim`
   * rows (~1.1 KB) at ~60k rows/s → default 40000. Drop it back if
   * running many simultaneous clients.
   */
  maxSweepRowsPerSec: number;
  /**
   * Live update wire shape (env `LIVE_MODE`): `legacy` = full-row
   * sweep batches; `sparse` = partial headline-field deltas for
   * positions (positions only — trades stay legacy). Overridable per
   * SEND via STOMP header `live-mode: sparse`.
   */
  defaultLiveMode: LiveMode;
  /**
   * Rows targeted per sparse live tick (env `SPARSE_ROWS_PER_TICK`).
   * Actual count jitters ±35%. Overridden by STOMP `updates-per-tick`
   * when `live-mode: sparse`.
   */
  sparseRowsPerTick: number;
  /** Verbose STOMP / per-tick logging */
  debug: boolean;
  /** Log outbound STOMP frames (CONNECTED + MESSAGE) to the terminal */
  logOutbound: boolean;
  /** Log every Nth live-update MESSAGE when logOutbound (1 = all) */
  logLiveEvery: number;
  /** Max characters of MESSAGE body to print before truncation */
  logBodyPreviewChars: number;
}

export function loadConfig(): AppConfig {
  const port = Number(process.env.PORT ?? 8081);
  const rawDefault = Number(process.env.DEFAULT_SNAPSHOT_ROWS ?? 1_000);
  const rawMin = Number(process.env.MIN_SNAPSHOT_ROWS ?? 20_000);
  const rawMax = Number(process.env.MAX_SNAPSHOT_ROWS ?? 20_000);

  const minSnapshotRows = Number.isFinite(rawMin) ? rawMin : 1_000;
  const maxSnapshotRows = Number.isFinite(rawMax)
    ? Math.max(minSnapshotRows, rawMax)
    : Math.max(minSnapshotRows, 1_000);
  const defaultSnapshotRows = clamp(
    Number.isFinite(rawDefault) ? rawDefault : 1_000,
    minSnapshotRows,
    maxSnapshotRows,
  );

  const rawUpdatesPerTick = Number.parseInt(
    process.env.UPDATES_PER_TICK ?? "1",
    10,
  );

  const rowProfile: RowProfile =
    process.env.ROW_PROFILE === "slim" ? "slim" : "wide";

  const defaultSweepRows = rowProfile === "slim" ? 40_000 : 10_000;
  const rawSweepRows = Number.parseInt(
    process.env.SWEEP_ROWS_PER_SEC ?? String(defaultSweepRows),
    10,
  );

  const logLiveRaw = Number.parseInt(process.env.LOG_LIVE_EVERY ?? "1", 10);
  const logPreviewRaw = Number.parseInt(
    process.env.LOG_BODY_PREVIEW ?? "400",
    10,
  );

  const defaultLiveMode: LiveMode =
    process.env.LIVE_MODE === "sparse" ? "sparse" : "legacy";

  const rawSparseRows = Number.parseInt(
    process.env.SPARSE_ROWS_PER_TICK ?? "100",
    10,
  );

  return {
    port: Number.isFinite(port) ? port : 8081,
    nodeEnv: process.env.NODE_ENV ?? "development",
    rowProfile,
    defaultSnapshotRows,
    minSnapshotRows,
    maxSnapshotRows,
    liveUpdatesPerTick: clampUpdatesPerTick(rawUpdatesPerTick),
    maxSweepRowsPerSec:
      Number.isFinite(rawSweepRows) && rawSweepRows >= 1
        ? Math.min(rawSweepRows, 1_000_000)
        : defaultSweepRows,
    defaultLiveMode,
    sparseRowsPerTick:
      Number.isFinite(rawSparseRows) && rawSparseRows >= 1
        ? Math.min(rawSparseRows, MAX_UPDATES_PER_TICK)
        : 100,
    debug: process.env.DEBUG === "1" || process.env.DEBUG === "true",
    logOutbound:
      process.env.LOG_OUTBOUND !== "0" &&
      process.env.LOG_OUTBOUND !== "false",
    logLiveEvery: Number.isFinite(logLiveRaw) && logLiveRaw >= 1 ? logLiveRaw : 1,
    logBodyPreviewChars:
      Number.isFinite(logPreviewRaw) && logPreviewRaw >= 80
        ? Math.min(logPreviewRaw, 50_000)
        : 400,
  };
}

/** Upper bound on rows-per-tick — a sanity cap, not a perf recommendation. */
export const MAX_UPDATES_PER_TICK = 100_000;

/** Clamp a requested rows-per-tick to `[1, MAX_UPDATES_PER_TICK]`; default 1. */
export function clampUpdatesPerTick(requested: number | undefined): number {
  if (requested === undefined || !Number.isFinite(requested)) return 1;
  return Math.min(MAX_UPDATES_PER_TICK, Math.max(1, Math.floor(requested)));
}

export function clampSnapshotRows(
  config: AppConfig,
  requested: number | undefined,
): number {
  const lo = Math.max(1, config.minSnapshotRows);
  const hi = Math.max(lo, config.maxSnapshotRows);
  const raw = requested ?? config.defaultSnapshotRows;
  if (!Number.isFinite(raw)) return clamp(config.defaultSnapshotRows, lo, hi);
  return clamp(Math.floor(raw), lo, hi);
}

export function parseLiveMode(
  config: AppConfig,
  requested: string | undefined,
): LiveMode {
  const raw = (requested ?? config.defaultLiveMode).trim().toLowerCase();
  return raw === "sparse" || raw === "sparse-erratic" ? "sparse" : "legacy";
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
