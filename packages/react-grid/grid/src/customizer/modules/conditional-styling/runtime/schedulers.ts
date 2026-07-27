/**
 * Refresh / batching schedulers for the conditional-styling runtime.
 *
 * Three closely-related closures live here:
 *
 *  - `createRefreshScheduler` — one rAF-debounced full `refreshCells({force})`.
 *    Coalesces bursts (profile deserialize touches every module) into a
 *    single tick per frame.
 *
 *  - `createTargetedRefreshScheduler` — accumulates (rowId, colId, full-row?)
 *    triples in a pending set; one rAF flush calls
 *    `refreshCells({rowNodes, columns, force})` once with the merged surface.
 *    Avoids re-painting every visible cell when only a handful of rows /
 *    cols changed state.
 *
 *  - `createExpiryScheduler` — single coalesced `setTimeout` pointing at the
 *    next-to-expire timed activation across the whole grid. Each new upsert
 *    just rearms when the new expiry is earlier; under heavy ticks this keeps
 *    timer churn O(1) and avoids GC pressure of one setTimeout per cell.
 *
 * Each factory returns an object carrying its public methods PLUS a
 * `dispose()` that cleans up its own scheduled work. The orchestrator
 * calls them inside the safely() wrapper so a failure in one cleanup
 * doesn't skip the next.
 */

import type { PlatformHandle } from '@starui/engine';
import {
  collectAndPruneExpiredTimedEntries,
  getNextTimedExpiry,
} from '../transforms';
import type { ConditionalStylingState } from '../state';
import { traceTimed } from './utils';

/* ─── full-grid refresh ─────────────────────────────────────────────── */

export interface RefreshScheduler {
  /** Schedule a rAF-debounced full refreshCells. */
  scheduleRefresh: () => void;
  /** Cancel any pending rAF. */
  dispose: () => void;
}

export function createRefreshScheduler(
  platform: PlatformHandle<ConditionalStylingState>,
): RefreshScheduler {
  let refreshRaf: number | null = null;

  // Scroll-quiet gate. A full-grid `refreshCells({ force: true })` is the
  // dominant per-tick cost when styling rules are active; running it while
  // the user is flinging the grid makes scroll frames compete with a
  // whole-viewport restyle — the reported scroll jank. During an active
  // scroll we DEFER the restyle and coalesce it into ONE refresh the moment
  // scrolling settles. Only the VISUAL re-evaluation waits: data keeps
  // flowing (transactions still apply), so styles are at most a moment stale
  // mid-fling and snap correct as soon as the user stops. `cellSelection`
  // and filters are untouched.
  const SCROLL_SETTLE_MS = 120;
  let scrolling = false;
  let deferredWhileScrolling = false;
  let settleTimer: ReturnType<typeof setTimeout> | null = null;
  let unwireScroll: (() => void) | null = null;

  /**
   * Force `cellClassRules` / `rowClassRules` to re-evaluate. NEVER call
   * `redrawRows()` or `refreshHeader()` here — they rebuild DOM and
   * steal focus from active cell editors / floating-filter inputs,
   * which makes the grid feel unusable under live ticks. The headers
   * are painted by the DOM watcher in `evaluate()` directly, so
   * `refreshHeader()` would just trigger one more round of churn for
   * no benefit.
   */
  const refreshGridVisuals = () => {
    const api = platform.api.api;
    if (!api) return;
    try { api.refreshCells({ force: true }); } catch { /* grid mid-teardown */ }
  };

  const runRaf = () => {
    if (typeof window === 'undefined') {
      refreshGridVisuals();
      return;
    }
    if (refreshRaf != null) window.cancelAnimationFrame(refreshRaf);
    refreshRaf = window.requestAnimationFrame(() => {
      refreshRaf = null;
      refreshGridVisuals();
    });
  };

  const onScrollSettled = () => {
    scrolling = false;
    settleTimer = null;
    if (deferredWhileScrolling) {
      deferredWhileScrolling = false;
      runRaf();
    }
  };

  const armSettle = () => {
    if (typeof window === 'undefined') { onScrollSettled(); return; }
    if (settleTimer != null) clearTimeout(settleTimer);
    settleTimer = setTimeout(onScrollSettled, SCROLL_SETTLE_MS);
  };

  const onBodyScroll = () => {
    scrolling = true;
    armSettle();
  };

  // Wire scroll listeners lazily — the grid api may not exist when the
  // scheduler is constructed. Idempotent; wires once, on first use with a
  // live api. `bodyScrollEnd` is a hint; the settle timer is the source of
  // truth (it also covers scroll kinds that don't fire a clean end event).
  const ensureScrollWiring = () => {
    if (unwireScroll) return;
    const api = platform.api.api as unknown as {
      addEventListener?: (t: string, l: () => void) => void;
      removeEventListener?: (t: string, l: () => void) => void;
    } | null;
    if (!api?.addEventListener) return;
    api.addEventListener('bodyScroll', onBodyScroll);
    api.addEventListener('bodyScrollEnd', armSettle);
    unwireScroll = () => {
      try { api.removeEventListener?.('bodyScroll', onBodyScroll); } catch { /* torn down */ }
      try { api.removeEventListener?.('bodyScrollEnd', armSettle); } catch { /* torn down */ }
    };
  };

  const scheduleRefresh = () => {
    ensureScrollWiring();
    if (scrolling) {
      // Fling in progress — hold the restyle; it flushes once on settle.
      deferredWhileScrolling = true;
      return;
    }
    runRaf();
  };

  const dispose = () => {
    if (refreshRaf != null && typeof window !== 'undefined') {
      window.cancelAnimationFrame(refreshRaf);
      refreshRaf = null;
    }
    if (settleTimer != null) {
      clearTimeout(settleTimer);
      settleTimer = null;
    }
    unwireScroll?.();
    unwireScroll = null;
    scrolling = false;
    deferredWhileScrolling = false;
  };

  return { scheduleRefresh, dispose };
}

/* ─── targeted refresh batcher ──────────────────────────────────────── */

export interface TargetedRefreshScheduler {
  /** Enqueue rows / columns / full-row flag for the next rAF flush. */
  scheduleTargetedRefresh: (
    rowIds: Iterable<string>,
    colIds: Iterable<string>,
    includesRowScope: boolean,
  ) => void;
  /** Cancel any pending rAF + clear the pending set. */
  dispose: () => void;
}

export function createTargetedRefreshScheduler(
  platform: PlatformHandle<ConditionalStylingState>,
): TargetedRefreshScheduler {
  const pendingTargetedRowIds = new Set<string>();
  const pendingTargetedColIds = new Set<string>();
  let pendingTargetedFullRow = false;
  let targetedRefreshRaf: number | null = null;

  const flushTargetedRefresh = () => {
    targetedRefreshRaf = null;
    const api = platform.api.api;
    if (!api) {
      pendingTargetedRowIds.clear();
      pendingTargetedColIds.clear();
      pendingTargetedFullRow = false;
      return;
    }
    const rowIds = [...pendingTargetedRowIds];
    const colIds = [...pendingTargetedColIds];
    const fullRow = pendingTargetedFullRow;
    pendingTargetedRowIds.clear();
    pendingTargetedColIds.clear();
    pendingTargetedFullRow = false;
    if (rowIds.length === 0 && colIds.length === 0 && !fullRow) return;
    try {
      const rowNodes = rowIds
        .map((id) => api.getRowNode?.(id))
        .filter((n): n is NonNullable<typeof n> => !!n);
      if (rowNodes.length === 0) return;
      const params: Record<string, unknown> = { rowNodes, force: true };
      // When at least one entry was row-scope, refresh ALL columns for
      // those rows — the row's class membership flipped, every cell
      // needs to re-evaluate. Cell-scope-only entries restrict to
      // their explicit column set.
      if (!fullRow && colIds.length > 0) params.columns = colIds;
      api.refreshCells(params as never);
    } catch {
      /* grid mid-teardown */
    }
  };

  const scheduleTargetedRefresh = (
    rowIds: Iterable<string>,
    colIds: Iterable<string>,
    includesRowScope: boolean,
  ) => {
    let added = false;
    for (const id of rowIds) {
      if (!pendingTargetedRowIds.has(id)) {
        pendingTargetedRowIds.add(id);
        added = true;
      }
    }
    for (const id of colIds) {
      if (!pendingTargetedColIds.has(id)) {
        pendingTargetedColIds.add(id);
        added = true;
      }
    }
    if (includesRowScope) {
      pendingTargetedFullRow = true;
      added = true;
    }
    if (!added) return;
    if (typeof window === 'undefined') {
      flushTargetedRefresh();
      return;
    }
    if (targetedRefreshRaf != null) return; // already scheduled
    targetedRefreshRaf = window.requestAnimationFrame(flushTargetedRefresh);
  };

  const dispose = () => {
    if (targetedRefreshRaf != null && typeof window !== 'undefined') {
      window.cancelAnimationFrame(targetedRefreshRaf);
      targetedRefreshRaf = null;
    }
    pendingTargetedRowIds.clear();
    pendingTargetedColIds.clear();
    pendingTargetedFullRow = false;
  };

  return { scheduleTargetedRefresh, dispose };
}

/* ─── coalesced expiry timer ───────────────────────────────────────── */

export interface ExpirySchedulerDeps {
  /** Repaint the cell grid after expiry / activation (full refreshCells). */
  scheduleRefresh: () => void;
  /** Repaint specific rows/cols after a coalesced expiry fires. */
  scheduleTargetedRefresh: (
    rowIds: Iterable<string>,
    colIds: Iterable<string>,
    includesRowScope: boolean,
  ) => void;
  /** Header-flash + indicator class diff repaint. */
  evaluate: () => void;
}

export interface ExpiryScheduler {
  /** Set / reset the single coalesced timer to fire at the next expiry. */
  armNextExpiry: () => void;
  /** Cancel any pending expiry timer. */
  dispose: () => void;
}

/**
 * Rearm the single coalesced expiry timer. Called after every batch of
 * activations (and after each expiry fires) so the timer always points
 * at the *current* earliest pending expiry. If nothing is pending the
 * timer is left disarmed.
 */
export function createExpiryScheduler(deps: ExpirySchedulerDeps): ExpiryScheduler {
  let expiryTimer: ReturnType<typeof setTimeout> | null = null;
  let expiryTimerFiresAt: number | null = null;

  const armNextExpiry = (): void => {
    const nextAt = getNextTimedExpiry();
    if (nextAt == null) {
      if (expiryTimer != null) {
        clearTimeout(expiryTimer);
        expiryTimer = null;
        expiryTimerFiresAt = null;
        traceTimed('armNextExpiry:disarmed');
      }
      return;
    }
    // If the existing timer already fires at-or-before the new earliest,
    // leave it alone — re-arming would just churn the timer pool.
    if (
      expiryTimer != null &&
      expiryTimerFiresAt != null &&
      expiryTimerFiresAt <= nextAt
    ) {
      return;
    }
    if (expiryTimer != null) clearTimeout(expiryTimer);
    const delay = Math.max(0, nextAt - Date.now()) + 8;
    expiryTimerFiresAt = nextAt;
    traceTimed('armNextExpiry', { delay, firesAt: nextAt });
    expiryTimer = setTimeout(() => {
      expiryTimer = null;
      expiryTimerFiresAt = null;
      traceTimed('expiry refresh fired');
      // Collect the exact (rowId, colIds) pairs that just expired,
      // prune them in one pass, then target-refresh just those rows
      // / columns instead of force-refreshing the entire grid.
      const expired = collectAndPruneExpiredTimedEntries();
      const rowIds = new Set<string>();
      const colIds = new Set<string>();
      for (const e of expired.rowScope) rowIds.add(e.rowId);
      for (const e of expired.cellScope) {
        rowIds.add(e.rowId);
        for (const c of e.colIds) colIds.add(c);
      }
      const includesRowScope = expired.rowScope.length > 0;
      // Header flash / indicator badge classes are managed via the
      // DOM watcher inside `evaluate()`; we still need to call it so
      // the header treatments flip with the cells.
      deps.evaluate();
      if (rowIds.size > 0 || includesRowScope) {
        deps.scheduleTargetedRefresh(rowIds, colIds, includesRowScope);
      }
      // Chain to the next pending expiry (if any) so a long ticking
      // window keeps cascading without piling up timers.
      armNextExpiry();
    }, delay);
  };

  const dispose = () => {
    if (expiryTimer != null) {
      clearTimeout(expiryTimer);
      expiryTimer = null;
      expiryTimerFiresAt = null;
    }
  };

  return { armNextExpiry, dispose };
}

