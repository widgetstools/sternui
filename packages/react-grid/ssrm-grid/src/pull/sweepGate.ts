/**
 * Wide-book delta gate (design fact #5, P4b-2).
 *
 * The tick path is bare `on_update` → throttled sweep → refetch cached
 * blocks. On WIDE books (hundreds of columns) refetching EVERY cached
 * block per tick cycle materializes width × blocks cells over and over
 * and saturates the engine thread — the measured V1 failure mode. The
 * gate degrades wide books to:
 *
 * • a LONGER sweep throttle (`sweepThrottleWideMs`, never below the
 *   narrow throttle), and
 * • a VISIBLE-blocks-only sweep — the `WIDE_SWEEP_MAX_BLOCKS`
 *   most-recently-used cached blocks. The block LRU's recency order IS
 *   viewport order (every `getRows`/serve-then-refresh touch is a
 *   viewport touch), so the MRU slice is what the user is looking at;
 *   off-screen blocks catch up when scrolled back into view (a plain
 *   cache-miss read), never on the tick path.
 *
 * The decision is pure — `resolveSweepGate` — so it unit-tests without
 * a grid. Width comes from the datasource's configured `columns` when
 * present, else it is OBSERVED from the first leaf read (a row's key
 * count); `null` (nothing read yet) stays on the narrow path — the
 * first sweep after a read re-decides.
 */

/** Column count at/above which a book is treated as wide. */
export const DEFAULT_WIDE_COLUMN_THRESHOLD = 80;
/** Degraded sweep throttle for wide books. */
export const DEFAULT_SWEEP_THROTTLE_WIDE_MS = 1000;
/** Wide sweeps refetch at most this many MRU blocks (~the viewport). */
export const WIDE_SWEEP_MAX_BLOCKS = 4;
/**
 * Narrow sweeps are MRU-gated too (perf pass 2026-07): refetching EVERY
 * cached block per cycle cost ~29 block reads/s at steady state on a
 * 20k book — the viewport is ~1 block. The MRU slice (viewport + the
 * most recently visited neighborhood) keeps painted rows ticking;
 * off-screen blocks catch up via serve-then-refresh when scrolled back.
 * Larger than the wide budget because narrow blocks are cheap to read.
 */
export const NARROW_SWEEP_MAX_BLOCKS = 6;

export interface SweepGateConfig {
  /** Narrow-book tick→refetch trailing throttle (ms). */
  tickRefreshMs: number;
  /** Column count at/above which the book degrades. */
  wideColumnThreshold: number;
  /** Degraded throttle (ms); clamped to at least `tickRefreshMs`. */
  sweepThrottleWideMs: number;
}

export interface SweepGateDecision {
  wide: boolean;
  /** The tick sweep's trailing throttle under this decision. */
  throttleMs: number;
  /** Sweeps refetch at most this many MRU cached blocks per cycle. */
  maxSweepBlocks: number;
}

/**
 * Decide the sweep behavior for a book `columnCount` columns wide
 * (`null` = width not yet observed → narrow path).
 */
export function resolveSweepGate(
  columnCount: number | null,
  config: SweepGateConfig,
): SweepGateDecision {
  const wide = columnCount !== null && columnCount >= config.wideColumnThreshold;
  return {
    wide,
    throttleMs: wide
      ? Math.max(config.sweepThrottleWideMs, config.tickRefreshMs)
      : config.tickRefreshMs,
    maxSweepBlocks: wide ? WIDE_SWEEP_MAX_BLOCKS : NARROW_SWEEP_MAX_BLOCKS,
  };
}
