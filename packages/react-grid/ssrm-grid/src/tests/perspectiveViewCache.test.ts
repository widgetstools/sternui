/**
 * View cache — the leak-critical piece. Perspective `View`s hold WASM-heap
 * allocations that are NOT garbage collected, so every eviction path must
 * `delete()`. These tests exist to keep that true.
 */
import { describe, expect, it, vi } from "vitest";
import {
  PerspectiveViewCache,
  viewCacheKey,
} from "../engine/perspectiveViewCache.js";
import type { PerspectiveView } from "../engine/perspectiveTypes.js";

function fakeView(): PerspectiveView & { deleted: number } {
  const v = {
    deleted: 0,
    to_columns: vi.fn(async () => ({})),
    num_rows: vi.fn(async () => 0),
    on_update: vi.fn(async () => 1),
    delete: vi.fn(async () => {
      v.deleted += 1;
    }),
  };
  return v as unknown as PerspectiveView & { deleted: number };
}

const key = (over: Partial<Parameters<typeof viewCacheKey>[0]> = {}) =>
  viewCacheKey({
    dataset: "main",
    groupBy: [],
    splitBy: [],
    filter: [],
    filterOp: "and",
    sort: [],
    aggregates: {},
    expressions: {},
    groupKeys: [],
    ...over,
  });

describe("viewCacheKey", () => {
  it("is stable for structurally identical shapes", () => {
    expect(key({ groupBy: ["desk"] })).toBe(key({ groupBy: ["desk"] }));
  });

  it("ignores record insertion order (same shape must share a view)", () => {
    const a = key({ aggregates: { px: "avg", qty: "sum" } });
    const b = key({ aggregates: { qty: "sum", px: "avg" } });
    expect(a).toBe(b);
  });

  it("separates different group drill-down paths", () => {
    expect(key({ groupKeys: ["EMEA"] })).not.toBe(key({ groupKeys: ["APAC"] }));
  });

  it("separates different sorts and filters", () => {
    expect(key({ sort: [["px", "desc"]] })).not.toBe(key({ sort: [["px", "asc"]] }));
    expect(key({ filter: [["desk", "==", "EMEA"]] })).not.toBe(key());
  });
});

describe("PerspectiveViewCache", () => {
  it("reuses a cached view for the same shape", async () => {
    const cache = new PerspectiveViewCache();
    const v = fakeView();
    await cache.put(key(), v);
    expect(cache.peek(key())).toBe(v);
    expect(v.deleted).toBe(0);
  });

  it("evicts and DELETES the least-recently-used view past the bound", async () => {
    const cache = new PerspectiveViewCache({ maxViews: 2 });
    const a = fakeView(), b = fakeView(), c = fakeView();
    await cache.put(key({ groupKeys: ["a"] }), a);
    await cache.put(key({ groupKeys: ["b"] }), b);

    // Touch `a` so `b` becomes least-recently-used.
    cache.peek(key({ groupKeys: ["a"] }));
    await cache.put(key({ groupKeys: ["c"] }), c);

    expect(cache.size).toBe(2);
    expect(b.deleted).toBe(1);          // evicted → deleted, not leaked
    expect(a.deleted).toBe(0);
    expect(cache.peek(key({ groupKeys: ["b"] }))).toBeUndefined();
  });

  it("deletes every view on dispose", async () => {
    const cache = new PerspectiveViewCache();
    const a = fakeView(), b = fakeView();
    await cache.put(key({ groupKeys: ["a"] }), a);
    await cache.put(key({ groupKeys: ["b"] }), b);
    await cache.dispose();
    expect(a.deleted).toBe(1);
    expect(b.deleted).toBe(1);
    expect(cache.size).toBe(0);
  });

  it("deletes an incoming view when the cache is already disposed", async () => {
    const cache = new PerspectiveViewCache();
    await cache.dispose();
    const late = fakeView();
    await cache.put(key(), late);
    expect(late.deleted).toBe(1);       // window closed mid-flight — must not leak
    expect(cache.size).toBe(0);
  });

  it("drops the loser when two creations race the same key", async () => {
    const cache = new PerspectiveViewCache();
    const first = fakeView(), second = fakeView();
    await cache.put(key(), first);
    await cache.put(key(), second);
    expect(second.deleted).toBe(1);     // duplicate deleted
    expect(cache.peek(key())).toBe(first);
  });

  it("notifies onEvict so callers can drop derived state", async () => {
    const evicted: string[] = [];
    const cache = new PerspectiveViewCache({
      maxViews: 1,
      onEvict: (k) => evicted.push(k),
    });
    await cache.put(key({ groupKeys: ["a"] }), fakeView());
    await cache.put(key({ groupKeys: ["b"] }), fakeView());
    expect(evicted).toEqual([key({ groupKeys: ["a"] })]);
  });

  it("survives a view whose delete() rejects", async () => {
    const cache = new PerspectiveViewCache();
    const bad = {
      to_columns: vi.fn(), num_rows: vi.fn(), on_update: vi.fn(),
      delete: vi.fn(async () => { throw new Error("worker gone"); }),
    } as unknown as PerspectiveView;
    await cache.put(key(), bad);
    await expect(cache.dispose()).resolves.toBeUndefined();
  });
});
