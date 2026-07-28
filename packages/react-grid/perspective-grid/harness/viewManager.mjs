/**
 * Per-window View lifecycle for the AG Grid datasource.
 *
 * A flat blotter needs one View. A grouped one needs several at once: AG Grid
 * pulls a group tree one level at a time, so an expanded path keeps its own
 * level alive alongside the root and its siblings. This keeps a keyed map of
 * live Views rather than a single current one, because swapping on every
 * request would thrash a grouped grid into rebuilding a View per block.
 *
 * Every disposal goes through `createSafeView`, which drains in-flight reads
 * before deleting — the operation the engine can be killed by (`safeView.ts`).
 *
 * MEASURED, and the reason the generation counter is only ever moved by
 * `invalidate()`: the datasource captures the generation at `getRows` entry and
 * re-checks it after `getView` resolves, so if building the View a request
 * asked for bumped it, that request would fence ITSELF off and settle empty.
 * Symptom: the grid renders blank on first load and after every sort and
 * filter change, while the log reports the View was rebuilt with the correct
 * row count. So the generation means "something OTHER than a block request
 * invalidated the Views" — a schema change, new calculated columns, a
 * different Table.
 */
import { createSafeView } from '../src/safeView.js';
import {
  toGroupColumns,
  toPerspectiveGroupLevel,
  viewConfigKey,
} from '../src/viewConfig.js';

/** Constant expression column used to give a FLAT view a grand-total row. */
const TOTAL_GROUP = '__all__';

/** The shape of a request that determines which Views are still relevant. */
function shapeOf(request) {
  return JSON.stringify({
    sort: request.sortModel ?? null,
    filter: request.filterModel ?? null,
    groups: request.rowGroupCols?.map((c) => c.id) ?? null,
    values: request.valueCols?.map((c) => [c.id, c.aggFunc]) ?? null,
  });
}

function levelState(request) {
  return {
    sortModel: request.sortModel,
    filterModel: request.filterModel,
    rowGroupCols: request.rowGroupCols,
    valueCols: request.valueCols,
    groupKeys: request.groupKeys,
  };
}

export function createViewManager({ table, onEvent = () => {}, onUpdate = null, maxViews = 24 }) {
  /** key -> { key, config, safe, rows, groupColId, usedAt } */
  const entries = new Map();
  /** key -> in-flight creation, so two blocks cannot build the same View twice. */
  const building = new Map();
  let shape = null;
  let generation = 0;
  let closed = false;

  function retire(entry, why) {
    entries.delete(entry.key);
    void entry.safe.close();
    onEvent({ type: 'retire', key: entry.key, why });
  }

  /** Drop the least recently used Views. Live Views are not free — each one
   *  costs the engine work on every tick — so the map is capped. */
  function evict() {
    if (entries.size <= maxViews) return;
    const byAge = [...entries.values()].sort((a, b) => a.usedAt - b.usedAt);
    for (const entry of byAge.slice(0, entries.size - maxViews)) retire(entry, 'lru');
  }

  async function build(key, config, groupColId, depth) {
    const started = performance.now();
    const view = await table.view(config);
    const safe = createSafeView(view);
    const entry = { key, config, safe, groupColId, depth, usedAt: performance.now() };

    const rows = await view.num_rows();
    // A grouped View's row 0 is the grand total, which is not one of the
    // children AG asked for.
    entry.totalRows = rows;
    entry.rows = groupColId === null ? rows : Math.max(0, rows - 1);

    if (onUpdate) {
      // The subscription belongs to this View and dies with it, so it is
      // re-made per View. A tick for a View already retired is ignored.
      await view.on_update(() => {
        if (entries.get(key) === entry) onUpdate(entry);
      });
    }

    entries.set(key, entry);
    evict();
    onEvent({
      type: 'view',
      key,
      config,
      depth,
      groupColId,
      rows: entry.rows,
      ms: performance.now() - started,
    });
    return entry;
  }

  async function ensure(key, config, groupColId, depth) {
    const existing = entries.get(key);
    if (existing) {
      existing.usedAt = performance.now();
      return existing;
    }
    const inFlight = building.get(key);
    if (inFlight) return inFlight;

    const promise = build(key, config, groupColId, depth).finally(() => building.delete(key));
    building.set(key, promise);
    return promise;
  }

  /** Read one window from an entry, rebuilding it if it was retired underneath. */
  async function readFrom(entry, window) {
    const columns = await entry.safe.read(window);
    if (columns !== null) return columns;
    // Retired between `getView` and the read. Settling short here would look
    // like the end of the book and cap the store permanently
    // (ARCHITECTURE.md, "Empty resolutions omit rowCount"), so re-open instead.
    const rebuilt = await ensure(entry.key, entry.config, entry.groupColId, entry.depth);
    const retry = await rebuilt.safe.read(window);
    if (retry === null) throw new Error(`view ${entry.key} closed twice under one block`);
    return retry;
  }

  return {
    getGeneration: () => generation,

    /** Invalidate every View for a reason the grid did not cause. */
    invalidate() {
      generation += 1;
    },

    /** Rows in the level currently serving the root — for `setRowCount`. */
    rowsAtRoot: null,

    get liveViews() {
      return entries.size;
    },

    async getView(request) {
      if (closed) return null;

      // A new sort/filter/grouping makes every existing View garbage. Retire
      // them now rather than waiting for the LRU: they would otherwise keep
      // charging the engine on every tick for a shape nothing will ask for.
      const nextShape = shapeOf(request);
      if (shape !== null && shape !== nextShape) {
        for (const entry of [...entries.values()]) retire(entry, 'shape');
      }
      shape = nextShape;

      const level = toPerspectiveGroupLevel(levelState(request));
      const key = viewConfigKey(level.config);
      const entry = await ensure(key, level.config, level.groupColId, level.depth);
      if (closed) return null;

      if (level.depth === 0) this.rowsAtRoot = entry.rows;

      const { groupColId } = entry;
      return {
        to_columns: async (window) => {
          // Group levels are offset by one: row 0 is this level's own total,
          // and AG asked for children.
          const offset = groupColId === null ? 0 : 1;
          const columns = await readFrom(entry, {
            start_row: (window?.start_row ?? 0) + offset,
            end_row: (window?.end_row ?? 0) + offset,
          });
          return groupColId === null ? columns : toGroupColumns(columns, groupColId);
        },
        num_rows: () => Promise.resolve(entry.rows ?? 0),
      };
    },

    /**
     * The grand total, live.
     *
     * When grouping is on this is free — it is row 0 of the root level View,
     * the one AG is already pulling. When it is off there is no total row at
     * all, because an ungrouped View is just rows; a single constant
     * expression column produces exactly one group, whose row 0 is the total
     * over the whole (filtered) book.
     */
    async readGrandTotal(request) {
      if (closed) return null;

      const level = toPerspectiveGroupLevel({ ...levelState(request), groupKeys: [] });
      let { config, groupColId } = level;
      if (groupColId === null) {
        config = {
          ...config,
          expressions: { ...(config.expressions ?? {}), [TOTAL_GROUP]: "'ALL'" },
          group_by: [TOTAL_GROUP],
        };
        groupColId = TOTAL_GROUP;
      }

      const key = viewConfigKey(config);
      const entry = await ensure(key, config, groupColId, 0);
      const columns = await readFrom(entry, { start_row: 0, end_row: 1 });

      const total = {};
      for (const name of Object.keys(columns)) {
        if (name === '__ROW_PATH__') continue;
        total[name] = columns[name]?.[0];
      }
      return total;
    },

    async close() {
      closed = true;
      const live = [...entries.values()];
      entries.clear();
      await Promise.all(live.map((entry) => entry.safe.close()));
    },
  };
}
