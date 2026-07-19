/**
 * Dirty-signal routing for the SSRM grid — engine dirt in, grid mutations out,
 * paced by {@link RefreshScheduler} (worklog T4: the scheduler IS the refresh
 * policy; no inline quiet-window timers).
 *
 * Three engine signals map to three grid effects:
 *
 *  - **leaf transaction** — conflated by row id while withheld, applied as one
 *    `applyServerSideTransactionAsync({ update })` on flush. The block cache is
 *    patched IMMEDIATELY so sync serving never returns stale rows, even while
 *    the grid mutation is deferred behind a scroll.
 *  - **soft refresh** — `refreshAllLoadedServerSideStores({ purge: false })`
 *    on the next surgical flush; keeps the block cache (scroll still hits sync).
 *  - **purge** — cache clear + generation bump + engine view invalidation run
 *    IMMEDIATELY (correctness: nothing may serve the dead book), only the grid
 *    store purge waits for the scheduler (a purge mid-drag resets the viewport).
 *
 * Group/grand-total aggregate patching keeps its own trailing-edge throttle
 * (`aggPatchThrottleMs`, default 250ms) and is skipped while scrolling — the
 * old component's behavior, minus the hand-rolled quiet window.
 */

import type { GridApi } from "ag-grid-community";
import type { SsrmEngine } from "../engine/types";
import type { DirtyMessage } from "./../ssrm/applyWorkerDirtyToGrid";
import { applyWorkerDirtyToGrid } from "./../ssrm/applyWorkerDirtyToGrid";
import { mergeLeafUpdateRows } from "../ssrm/mergeLeafUpdateRows";
import { refreshAllLoadedServerSideStores } from "../ssrm/refreshAllLoadedStores";
import type { SsrmBlockCache } from "../ssrm/ssrmBlockCache";
import {
  RefreshScheduler,
  type RefreshKind,
  type RefreshSchedulerOpts,
} from "../ssrm/refreshScheduler";

export interface SsrmDirtyRouterOpts {
  engine: SsrmEngine;
  blockCache: SsrmBlockCache;
  idField: string;
  getApi: () => GridApi | null;
  isConfigured: () => boolean;
  /** Bumped on purge so stale async block results miss the cache. */
  bumpGeneration: () => void;
  /** Recompute + patch grand-total / group-header aggregates (throttled). */
  patchAggregates: (api: GridApi) => void;
  aggPatchThrottleMs?: number;
  /** Scheduler pacing / timer injection (tests). */
  scheduler?: Omit<RefreshSchedulerOpts, "flush">;
  setTimer?: (cb: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export interface SsrmDirtyRouter {
  /** Engine dirty handler — wire to `engine.setDirtyHandler`. */
  handleDirty(msg: DirtyMessage): void;
  /** Grid scroll (both axes) — defers flushes until motion settles. */
  onScroll(): void;
  dispose(): void;
}

export function createSsrmDirtyRouter(opts: SsrmDirtyRouterOpts): SsrmDirtyRouter {
  const {
    engine,
    blockCache,
    idField,
    getApi,
    isConfigured,
    bumpGeneration,
    patchAggregates,
  } = opts;
  const setTimer = opts.setTimer ?? ((cb, ms) => setTimeout(cb, ms));
  const clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as never));
  const aggPatchThrottleMs = opts.aggPatchThrottleMs ?? 250;

  /** Withheld leaf patches, conflated by row id (later fields win). */
  const pendingLeaf = new Map<string, Record<string, unknown>>();
  let softPending = false;
  let aggTimer: unknown = null;
  let disposed = false;

  const scheduler = new RefreshScheduler({
    ...opts.scheduler,
    setTimer: opts.scheduler?.setTimer ?? setTimer,
    clearTimer: opts.scheduler?.clearTimer ?? clearTimer,
    flush: (kind) => flush(kind),
  });

  const flush = (kind: RefreshKind): void => {
    const api = getApi();
    if (!api || disposed) {
      pendingLeaf.clear();
      softPending = false;
      return;
    }
    if (kind === "purge") {
      // Cache/generation/view were already invalidated when the signal
      // arrived; withheld leaf patches describe the dead book.
      pendingLeaf.clear();
      softPending = false;
      refreshAllLoadedServerSideStores(api, { purge: true });
      return;
    }
    if (pendingLeaf.size > 0) {
      const patches = [...pendingLeaf.values()];
      pendingLeaf.clear();
      const update = mergeLeafUpdateRows(
        idField,
        patches,
        (id) =>
          engine.tryFindById?.(id) ??
          blockCache.findRow(idField, id) ??
          (api.getRowNode(id)?.data as Record<string, unknown> | undefined),
      );
      api.applyServerSideTransactionAsync({ update });
    }
    if (softPending) {
      softPending = false;
      refreshAllLoadedServerSideStores(api, { purge: false });
    }
  };

  const scheduleAggPatch = (api: GridApi): void => {
    if (aggTimer !== null || disposed) return;
    aggTimer = setTimer(() => {
      aggTimer = null;
      // Mid-drag agg rebuilds fight the scroll — drop; the next tick re-arms.
      if (scheduler.isScrolling) return;
      const liveApi = getApi();
      if (liveApi) patchAggregates(liveApi);
    }, aggPatchThrottleMs);
    void api;
  };

  const handleDirty = (msg: DirtyMessage): void => {
    const api = getApi();
    if (!api || !isConfigured() || disposed) return;
    applyWorkerDirtyToGrid(msg, {
      applyLeafTransaction: (leaf) => {
        // Engine book is already patched. Cache is patched NOW (sync serving
        // must stay fresh); the grid transaction is conflated + scheduled.
        for (const row of [...(leaf.update ?? []), ...(leaf.add ?? [])]) {
          const raw = row[idField];
          if (raw == null || raw === "") continue;
          const id = String(raw);
          blockCache.patchRows(idField, [row]);
          if (!api.getRowNode(id)) continue; // unloaded — cache-only
          const prev = pendingLeaf.get(id);
          pendingLeaf.set(id, prev ? { ...prev, ...row } : row);
        }
        scheduleAggPatch(api);
        if (pendingLeaf.size > 0) scheduler.request("surgical");
      },
      throttleRefresh: () => {
        softPending = true;
        scheduler.request("surgical");
      },
      purgeRefresh: () => {
        bumpGeneration();
        blockCache.clear();
        engine.invalidateView?.();
        scheduler.request("purge");
      },
    });
  };

  return {
    handleDirty,
    onScroll: () => scheduler.onScroll(),
    dispose: () => {
      disposed = true;
      scheduler.dispose();
      if (aggTimer !== null) {
        clearTimer(aggTimer);
        aggTimer = null;
      }
      pendingLeaf.clear();
    },
  };
}
