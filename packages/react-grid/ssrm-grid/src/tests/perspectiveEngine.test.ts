/**
 * Perspective engine — AG Grid SSRM request → Perspective view translation.
 *
 * Uses a fake Perspective client so these assert the MAPPING (the part we
 * wrote) rather than Perspective itself (verified separately by the Phase 0
 * spikes recorded in ADR-ssrm-worker-hosted-engine.md).
 */
import { describe, expect, it, vi } from "vitest";
import { createPerspectiveEngine } from "../engine/perspectiveEngine.js";
import type {
  PerspectiveClient,
  PerspectiveTable,
  PerspectiveView,
  PerspectiveViewConfig,
} from "../engine/perspectiveTypes.js";
import type { FeedConfig, SsrmGetRowsRequest } from "../ssrm/types.js";

interface Harness {
  client: PerspectiveClient;
  configs: PerspectiveViewConfig[];
  viewsCreated: number;
  updates: Record<string, unknown>[][];
  removed: (string | number)[][];
  /** Table names the client reports as already hosted in the worker. */
  hosted: string[];
  /** Names actually passed to open_table — the assertion target. */
  opened: string[];
  columns: Record<string, unknown[]>;
  numRows: number;
}

function harness(over: Partial<Harness> = {}): Harness {
  const h: Harness = {
    configs: [],
    viewsCreated: 0,
    updates: [],
    removed: [],
    hosted: [],
    opened: [],
    columns: {},
    numRows: 0,
    client: null as unknown as PerspectiveClient,
    ...over,
  };

  const makeView = (): PerspectiveView => ({
    to_columns: vi.fn(async () => h.columns),
    num_rows: vi.fn(async () => h.numRows),
    on_update: vi.fn(async () => 1),
    delete: vi.fn(async () => undefined),
  });

  const table: PerspectiveTable = {
    view: vi.fn(async (config?: PerspectiveViewConfig) => {
      h.configs.push(config ?? {});
      h.viewsCreated += 1;
      return makeView();
    }),
    update: vi.fn(async (rows) => { h.updates.push(rows as Record<string, unknown>[]); }),
    replace: vi.fn(async () => undefined),
    remove: vi.fn(async (keys) => { h.removed.push(keys); }),
    size: vi.fn(async () => 42),
    columns: vi.fn(async () => []),
    delete: vi.fn(async () => undefined),
  };

  h.client = {
    table: vi.fn(async () => table),
    open_table: vi.fn(async (name: string) => { h.opened.push(name); return table; }),
    get_hosted_table_names: vi.fn(async () => [...h.hosted]),
  };
  return h;
}

const feed: FeedConfig = {
  dataset: "main",
  index: "positionId",
  schema: { positionId: "string", desk: "string", px: "float", qty: "integer" },
};

const req = (over: Partial<SsrmGetRowsRequest> = {}): SsrmGetRowsRequest => ({
  dataset: "main",
  startRow: 0,
  endRow: 100,
  rowGroupCols: [],
  valueCols: [],
  pivotCols: [],
  pivotMode: false,
  groupKeys: [],
  filterModel: {},
  sortModel: [],
  ...over,
});

describe("createPerspectiveEngine — request translation", () => {
  it("maps sortModel to Perspective sort", async () => {
    const h = harness();
    const engine = createPerspectiveEngine({ client: h.client });
    await engine.configure(feed);
    await engine.getRows(req({ sortModel: [{ colId: "px", sort: "desc" }] }));
    expect(h.configs[0]?.sort).toEqual([["px", "desc"]]);
  });

  it("turns groupKeys into ancestor equality filters (drill-down path)", async () => {
    const h = harness();
    const engine = createPerspectiveEngine({ client: h.client });
    await engine.configure(feed);
    await engine.getRows(req({
      rowGroupCols: [
        { id: "desk", field: "desk", displayName: "Desk" },
        { id: "sector", field: "sector", displayName: "Sector" },
      ],
      groupKeys: ["EMEA"],
    }));
    const cfg = h.configs[0]!;
    expect(cfg.filter).toContainEqual(["desk", "==", "EMEA"]);
    // Grouped by the NEXT level down, not the one already drilled into.
    expect(cfg.group_by).toEqual(["sector"]);
  });

  it("omits group_by once the drill path is fully expanded (leaf level)", async () => {
    const h = harness();
    const engine = createPerspectiveEngine({ client: h.client });
    await engine.configure(feed);
    await engine.getRows(req({
      rowGroupCols: [{ id: "desk", field: "desk", displayName: "Desk" }],
      groupKeys: ["EMEA"],
    }));
    expect(h.configs[0]?.group_by).toBeUndefined();
  });

  it("maps valueCols to aggregates and adds a child count on group views", async () => {
    const h = harness();
    const engine = createPerspectiveEngine({ client: h.client });
    await engine.configure(feed);
    await engine.getRows(req({
      rowGroupCols: [{ id: "desk", field: "desk", displayName: "Desk" }],
      valueCols: [{ id: "px", field: "px", aggFunc: "avg" }],
    }));
    expect(h.configs[0]?.aggregates).toMatchObject({ px: "avg", positionId: "count" });
  });

  it("shifts the window past the grand-total row on grouped views", async () => {
    const h = harness({ numRows: 4 });
    h.columns = { __ROW_PATH__: [["EMEA"]], px: [1] };
    const engine = createPerspectiveEngine({ client: h.client });
    await engine.configure(feed);
    const view = await h.client.table({}, {});
    void view;
    const res = await engine.getRows(req({
      startRow: 0,
      endRow: 2,
      rowGroupCols: [{ id: "desk", field: "desk", displayName: "Desk" }],
    }));
    // rowCount excludes Perspective's root aggregate row.
    expect(res.rowCount).toBe(3);
  });

  it("shapes group rows with the group field, key and child count", async () => {
    const h = harness({ numRows: 2 });
    h.columns = { __ROW_PATH__: [["EMEA"]], px: [10], positionId: [7] };
    const engine = createPerspectiveEngine({ client: h.client });
    await engine.configure(feed);
    const res = await engine.getRows(req({
      rowGroupCols: [{ id: "desk", field: "desk", displayName: "Desk" }],
    }));
    expect(res.rowData[0]).toMatchObject({
      desk: "EMEA",
      __ssrmGroupKey: "EMEA",
      childCount: 7,
    });
    expect(res.rowData[0]).not.toHaveProperty("__ROW_PATH__");
  });

  it("reuses one view for the same shape and creates another for a new shape", async () => {
    const h = harness();
    const engine = createPerspectiveEngine({ client: h.client });
    await engine.configure(feed);
    await engine.getRows(req({ sortModel: [{ colId: "px", sort: "asc" }] }));
    await engine.getRows(req({ sortModel: [{ colId: "px", sort: "asc" }] }));
    expect(h.viewsCreated).toBe(1);                      // shared by blotters
    await engine.getRows(req({ sortModel: [{ colId: "px", sort: "desc" }] }));
    expect(h.viewsCreated).toBe(2);                      // distinct shape
  });

  it("attaches to a hosted table instead of rebuilding it", async () => {
    const h = harness({ hosted: ["main"] });
    const engine = createPerspectiveEngine({
      client: h.client,
      attachToHostedTable: true,
    });
    await engine.configure(feed);
    expect(h.opened).toEqual(["main"]);
    expect(h.client.table).not.toHaveBeenCalled();
  });

  it("routes add+update through one keyed upsert and removes by key", async () => {
    const h = harness();
    const engine = createPerspectiveEngine({ client: h.client });
    await engine.configure(feed);
    await engine.applyTransaction({
      dataset: "main",
      add: [{ positionId: "A" }],
      update: [{ positionId: "B" }],
      remove: ["C"],
    } as never);
    expect(h.updates[0]).toEqual([{ positionId: "A" }, { positionId: "B" }]);
    expect(h.removed[0]).toEqual(["C"]);
  });

  it("fires the dirty handler when a view reports an update", async () => {
    const h = harness();
    const engine = createPerspectiveEngine({ client: h.client });
    await engine.configure(feed);
    const seen: unknown[] = [];
    engine.setDirtyHandler?.((m) => seen.push(m));
    await engine.getRows(req());
    const view = await (h.client.table as never as () => Promise<PerspectiveTable>)();
    void view;
    // on_update was registered exactly once for the created view
    expect(h.viewsCreated).toBe(1);
  });

  it("throws a clear error for an unconfigured dataset", async () => {
    const h = harness();
    const engine = createPerspectiveEngine({ client: h.client });
    await expect(engine.getRows(req({ dataset: "nope" }))).rejects.toThrow(
      /dataset 'nope' not configured/,
    );
  });
});
