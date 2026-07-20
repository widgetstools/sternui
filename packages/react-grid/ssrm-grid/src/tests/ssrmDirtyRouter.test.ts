/**
 * Dirty routing policy (worklog T4) — engine dirt reaches the grid through
 * the RefreshScheduler: conflated, scroll-deferred, purge-subsuming, with
 * the block cache always patched immediately.
 */
import { describe, expect, it, vi } from "vitest";
import { createSsrmDirtyRouter } from "../custom/ssrmDirtyRouter.js";
import { SsrmBlockCache } from "../ssrm/ssrmBlockCache.js";
import type { DirtyMessage } from "../ssrm/applyWorkerDirtyToGrid.js";
import type { SsrmEngine } from "../engine/types.js";

/** Manual timers — fire in FIFO order on demand. */
function fakeTimers() {
  let nextId = 1;
  const timers = new Map<number, () => void>();
  return {
    set: (cb: () => void, _ms: number) => {
      const id = nextId++;
      timers.set(id, cb);
      return id;
    },
    clear: (h: unknown) => {
      timers.delete(h as number);
    },
    fireAll: () => {
      const cbs = [...timers.values()];
      timers.clear();
      for (const cb of cbs) cb();
    },
    get armed() {
      return timers.size > 0;
    },
  };
}

function makeApi(loadedIds: string[]) {
  const loaded = new Set(loadedIds);
  return {
    getRowNode: (id: string) => (loaded.has(id) ? { data: { id } } : undefined),
    applyServerSideTransactionAsync: vi.fn(),
    refreshServerSide: vi.fn(),
    getServerSideGroupLevelState: () => [],
    getRowGroupColumns: () => [],
  } as never;
}

function makeRouter(over: {
  api: unknown;
  engine?: Partial<SsrmEngine>;
  blockCache?: SsrmBlockCache;
  timers: ReturnType<typeof fakeTimers>;
  patchAggregates?: (api: unknown) => void;
  now?: () => number;
}) {
  const blockCache = over.blockCache ?? new SsrmBlockCache();
  const bumpGeneration = vi.fn();
  const engine = {
    invalidateView: vi.fn(),
    tryFindById: () => null,
    ...over.engine,
  } as never as SsrmEngine;
  const router = createSsrmDirtyRouter({
    engine,
    blockCache,
    idField: "id",
    getApi: () => over.api as never,
    isConfigured: () => true,
    bumpGeneration,
    patchAggregates: (over.patchAggregates ?? (() => undefined)) as never,
    setTimer: over.timers.set,
    clearTimer: over.timers.clear,
    scheduler: {
      setTimer: over.timers.set,
      clearTimer: over.timers.clear,
      ...(over.now ? { now: over.now } : {}),
    },
  });
  return { router, blockCache, bumpGeneration, engine };
}

const leafDirty = (rows: Record<string, unknown>[]): DirtyMessage => ({
  type: "dirty",
  at: 0,
  transaction: { dataset: "main", update: rows },
});

describe("createSsrmDirtyRouter", () => {
  it("conflates leaf updates by id and flushes ONE merged transaction", () => {
    const timers = fakeTimers();
    const api = makeApi(["a", "b"]);
    const { router } = makeRouter({ api, timers });

    router.handleDirty(leafDirty([{ id: "a", px: 1 }]));
    router.handleDirty(leafDirty([{ id: "a", px: 2, qty: 9 }, { id: "b", px: 5 }]));
    expect((api as never as { applyServerSideTransactionAsync: ReturnType<typeof vi.fn> })
      .applyServerSideTransactionAsync).not.toHaveBeenCalled();

    timers.fireAll(); // settle window elapses
    const apply = (api as never as { applyServerSideTransactionAsync: ReturnType<typeof vi.fn> })
      .applyServerSideTransactionAsync;
    expect(apply).toHaveBeenCalledTimes(1);
    const update = apply.mock.calls[0]![0].update as Record<string, unknown>[];
    expect(update).toHaveLength(2);
    expect(update.find((r) => r.id === "a")).toMatchObject({ px: 2, qty: 9 });
  });

  it("patches the block cache immediately, and cache-only for unloaded rows", () => {
    const timers = fakeTimers();
    const api = makeApi(["a"]); // "zz" is NOT loaded
    const blockCache = new SsrmBlockCache();
    blockCache.set("blk", {
      rowData: [{ id: "a", px: 0 }, { id: "zz", px: 0 }],
      rowCount: 2,
    });
    const { router } = makeRouter({ api, timers, blockCache });

    router.handleDirty(leafDirty([{ id: "a", px: 7 }, { id: "zz", px: 8 }]));
    // Cache fresh BEFORE any flush.
    expect(blockCache.get("blk")?.rowData).toEqual([
      { id: "a", px: 7 },
      { id: "zz", px: 8 },
    ]);

    timers.fireAll();
    const apply = (api as never as { applyServerSideTransactionAsync: ReturnType<typeof vi.fn> })
      .applyServerSideTransactionAsync;
    // Only the LOADED row reaches the grid transaction.
    expect(apply.mock.calls[0]![0].update.map((r: { id: string }) => r.id)).toEqual(["a"]);
  });

  it("defers flushes while scrolling; settle flushes once", () => {
    const timers = fakeTimers();
    const api = makeApi(["a"]);
    const { router } = makeRouter({ api, timers });

    router.handleDirty(leafDirty([{ id: "a", px: 1 }]));
    router.onScroll();
    router.onScroll(); // re-arms the settle window
    const apply = (api as never as { applyServerSideTransactionAsync: ReturnType<typeof vi.fn> })
      .applyServerSideTransactionAsync;
    expect(apply).not.toHaveBeenCalled();

    timers.fireAll(); // settle
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it("bare dirty invalidates cache/generation/view IMMEDIATELY, then refreshes SOFT (no stub flicker)", () => {
    const timers = fakeTimers();
    const api = makeApi(["a"]);
    const blockCache = new SsrmBlockCache();
    blockCache.set("blk", { rowData: [{ id: "a" }], rowCount: 1 });
    const { router, bumpGeneration, engine } = makeRouter({ api, timers, blockCache });

    router.handleDirty(leafDirty([{ id: "a", px: 1 }]));
    router.handleDirty({ type: "dirty", at: 0 }); // no transaction — async-engine tick / replace

    // Correctness effects happen at signal time…
    expect(bumpGeneration).toHaveBeenCalled();
    expect(blockCache.size).toBe(0);
    expect(engine.invalidateView).toHaveBeenCalled();
    const apiMock = api as never as {
      refreshServerSide: ReturnType<typeof vi.fn>;
      applyServerSideTransactionAsync: ReturnType<typeof vi.fn>;
    };
    expect(apiMock.refreshServerSide).not.toHaveBeenCalled();

    timers.fireAll();
    // …the grid refresh waits for the scheduler, refetches IN PLACE (soft —
    // a hard purge would stub out every loaded block on every tick batch),
    // and swallows the superseded leaf tx.
    expect(apiMock.refreshServerSide).toHaveBeenCalledWith({ purge: false });
    expect(apiMock.applyServerSideTransactionAsync).not.toHaveBeenCalled();
  });

  it("an empty transaction also refreshes soft", () => {
    const timers = fakeTimers();
    const api = makeApi([]);
    const { router } = makeRouter({ api, timers });

    router.handleDirty({
      type: "dirty",
      at: 0,
      transaction: { dataset: "main" }, // no update/add
    });
    timers.fireAll();
    const apiMock = api as never as { refreshServerSide: ReturnType<typeof vi.fn> };
    expect(apiMock.refreshServerSide).toHaveBeenCalledWith({ purge: false });
  });

  it("throttles aggregate patching and skips it mid-scroll", () => {
    const timers = fakeTimers();
    const api = makeApi(["a"]);
    const patchAggregates = vi.fn();
    const { router } = makeRouter({ api, timers, patchAggregates });

    router.handleDirty(leafDirty([{ id: "a", px: 1 }]));
    router.onScroll(); // scrolling when the agg timer fires
    timers.fireAll();
    expect(patchAggregates).not.toHaveBeenCalled();

    router.handleDirty(leafDirty([{ id: "a", px: 2 }]));
    timers.fireAll(); // not scrolling any more
    expect(patchAggregates).toHaveBeenCalledTimes(1);
  });

  it("dispose drops pending work", () => {
    const timers = fakeTimers();
    const api = makeApi(["a"]);
    const { router } = makeRouter({ api, timers });
    router.handleDirty(leafDirty([{ id: "a", px: 1 }]));
    router.dispose();
    timers.fireAll();
    const apiMock = api as never as { applyServerSideTransactionAsync: ReturnType<typeof vi.fn> };
    expect(apiMock.applyServerSideTransactionAsync).not.toHaveBeenCalled();
  });
});
