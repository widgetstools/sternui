/**
 * Per-window View lifecycle for the AG Grid datasource.
 *
 * A flat blotter needs one View. A grouped one needs several at once: AG Grid
 * pulls a group tree one level at a time, so an expanded path keeps its own
 * level alive alongside the root and its siblings. This keeps a keyed map of
 * live Views rather than a single current one — swapping on every request
 * would thrash a grouped grid into rebuilding a View per block.
 *
 * Live Views are not free (each costs the engine work on every table update),
 * so the map is capped and the least recently used are retired. Every disposal
 * goes through `createSafeView`, which drains in-flight reads before deleting —
 * the operation the engine can be killed by (see `safeView.ts`).
 *
 * MEASURED, and the reason `generation` moves only in `invalidate()`: the
 * datasource captures the generation at `getRows` entry and re-checks it after
 * `getView` resolves. If building the View that a request asked for bumped it,
 * that request would fence ITSELF off and settle empty — the grid renders
 * blank on first load and after every sort and filter change, while the log
 * cheerfully reports the View was rebuilt with the right row count. So the
 * generation means "something OTHER than a block request invalidated the
 * Views": a schema change, new calculated columns, a different Table.
 */
import { createSafeView, type DeletableView, type SafeView } from './safeView.js';
import type { PerspectiveViewLike, SsrmRequestLike } from './perspectiveDatasource.js';
import {
  isFilterModelMappable,
  toGroupColumns,
  toPerspectiveFilter,
  toPerspectiveGroupLevel,
  viewConfigKey,
  type AgFilterItem,
  type PerspectiveViewConfig,
} from './viewConfig.js';

/** A View that can also report table updates. `on_update` is optional so a
 *  minimal View still satisfies the contract. */
export interface UpdatableView extends DeletableView {
  on_update?(callback: () => void): Promise<unknown>;
}

/** The slice of a Perspective `Table` this needs. */
export interface PerspectiveTableLike {
  view(config: PerspectiveViewConfig): Promise<UpdatableView>;
  /** Rows in the whole book, ignoring any View's filters. */
  size?(): Promise<number>;
  /**
   * Upsert by the Table's index column. Sparse rows leave every omitted
   * column alone — which is what makes a single edited cell a legal write.
   * Optional so a read-only Table (and every test fake) still satisfies this.
   */
  update?(rows: Record<string, unknown>[]): Promise<void>;
  /** Declared column types. Used to coerce an edited value before writing it. */
  schema?(): Promise<Record<string, string>>;
}

export interface ViewManagerEvent {
  type: 'view' | 'retire';
  key: string;
  /** Present on `view`. */
  config?: PerspectiveViewConfig;
  depth?: number;
  groupColId?: string | null;
  /** Rows AG can ask for — excludes the level total row on a grouped View. */
  rows?: number;
  ms?: number;
  /** Present on `retire`. */
  why?: 'lru' | 'shape' | 'close';
}

export interface ViewManagerOpts {
  table: PerspectiveTableLike;
  onEvent?(event: ViewManagerEvent): void;
  /** Called when the Table behind a live View changes. */
  onUpdate?(): void;
  /** Cap on simultaneously live Views. */
  maxViews?: number;
}

export interface ViewManager {
  getGeneration(): number;
  /** Invalidate every View for a reason the grid did not cause, so blocks
   *  already in flight resolve empty instead of painting rows the grid can no
   *  longer interpret. */
  invalidate(): void;
  /** Rows in the root level — for `setRowCount`. Null until one is built. */
  readonly rowsAtRoot: number | null;
  readonly liveViews: number;
  getView(request: SsrmRequestLike): Promise<PerspectiveViewLike | null>;
  /** The grand total row, or null when unavailable. */
  readGrandTotal(request: SsrmRequestLike): Promise<Record<string, unknown> | null>;
  /**
   * Rows the whole book matches under an AG filter model, independent of what
   * the grid is currently showing. Null when the model cannot be translated
   * exactly, or once closed — never a guess.
   */
  countMatching(
    filterModel: Record<string, AgFilterItem> | null | undefined,
  ): Promise<number | null>;
  close(): Promise<void>;
}

/** Constant expression column that gives a FLAT view a grand-total row. */
const TOTAL_GROUP = '__all__';

interface Entry {
  key: string;
  config: PerspectiveViewConfig;
  safe: SafeView;
  groupColId: string | null;
  depth: number;
  /** Rows AG can ask for — the level total row is not one of them. */
  rows: number;
  usedAt: number;
}

/** The parts of a request that decide which Views are still relevant. */
function shapeOf(request: SsrmRequestLike): string {
  return JSON.stringify({
    sort: request.sortModel ?? null,
    filter: request.filterModel ?? null,
    groups: request.rowGroupCols?.map((c) => c.id) ?? null,
    values: request.valueCols?.map((c) => [c.id, c.aggFunc]) ?? null,
  });
}

function levelState(request: SsrmRequestLike) {
  return {
    sortModel: request.sortModel,
    filterModel: request.filterModel as Record<string, AgFilterItem> | null | undefined,
    rowGroupCols: request.rowGroupCols,
    valueCols: request.valueCols,
    groupKeys: request.groupKeys,
  };
}

export function createViewManager(opts: ViewManagerOpts): ViewManager {
  const { table, onEvent = () => {}, onUpdate, maxViews = 24 } = opts;

  const entries = new Map<string, Entry>();
  /** Creation in flight, so two blocks cannot build the same View twice. */
  const building = new Map<string, Promise<Entry>>();
  /**
   * Views built to answer a question rather than to serve a block — they are
   * read once and dropped. Tracked only so `close()` can drain them: a
   * transient View outliving the manager is a live View charged on every tick
   * that nothing will ever retire.
   */
  const transient = new Set<SafeView>();
  let shape: string | null = null;
  let generation = 0;
  let rowsAtRoot: number | null = null;
  let closed = false;

  function retire(entry: Entry, why: 'lru' | 'shape' | 'close'): void {
    entries.delete(entry.key);
    void entry.safe.close();
    onEvent({ type: 'retire', key: entry.key, why });
  }

  function evict(): void {
    if (entries.size <= maxViews) return;
    const byAge = [...entries.values()].sort((a, b) => a.usedAt - b.usedAt);
    for (const entry of byAge.slice(0, entries.size - maxViews)) retire(entry, 'lru');
  }

  async function build(
    key: string,
    config: PerspectiveViewConfig,
    groupColId: string | null,
    depth: number,
  ): Promise<Entry> {
    const started = Date.now();
    const view = await table.view(config);
    const safe = createSafeView(view);
    const total = await view.num_rows();

    const entry: Entry = {
      key,
      config,
      safe,
      groupColId,
      depth,
      // Row 0 of a grouped View is that level's own total, which is not one of
      // the children AG asked for.
      rows: groupColId === null ? total : Math.max(0, total - 1),
      usedAt: Date.now(),
    };

    if (onUpdate && typeof view.on_update === 'function') {
      // The subscription belongs to this View and dies with it, so it is
      // re-made per View. A tick for an already-retired View is ignored.
      await view.on_update(() => {
        if (entries.get(key) === entry) onUpdate();
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
      ms: Date.now() - started,
    });
    return entry;
  }

  /**
   * Re-read a live View's row count.
   *
   * MEASURED on the live feed: `rows` used to be captured once at build time
   * and never revisited, so a blotter that attached during the snapshot — the
   * normal case, since a window opens long before ~20,000 rows arrive — held a
   * View that reported 0 forever. The book filled underneath it, the status
   * bar read "0 of 20,000", and no amount of refreshing helped: every refresh
   * re-used the same cached count. The count is what AG sizes its store from,
   * so it has to be as live as the rows are.
   */
  async function remeasure(entry: Entry): Promise<Entry> {
    const total = await entry.safe.rows();
    if (total !== null) {
      entry.rows = entry.groupColId === null ? total : Math.max(0, total - 1);
    }
    return entry;
  }

  function ensure(
    key: string,
    config: PerspectiveViewConfig,
    groupColId: string | null,
    depth: number,
  ): Promise<Entry> {
    const existing = entries.get(key);
    if (existing) {
      existing.usedAt = Date.now();
      return remeasure(existing);
    }
    const inFlight = building.get(key);
    if (inFlight) return inFlight;

    const promise = build(key, config, groupColId, depth).finally(() => building.delete(key));
    building.set(key, promise);
    return promise;
  }

  /** Read a window, re-opening the View if it was retired underneath. */
  async function readFrom(
    entry: Entry,
    window: { start_row: number; end_row: number },
  ): Promise<Record<string, unknown[]>> {
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

    invalidate() {
      generation += 1;
    },

    get rowsAtRoot() {
      return rowsAtRoot;
    },

    get liveViews() {
      return entries.size;
    },

    async getView(request: SsrmRequestLike): Promise<PerspectiveViewLike | null> {
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

      // Only a View built for a BLOCK request counts as the root. The
      // grand-total View is depth 0 too, and it holds exactly one group, so
      // recording its count here published a row count of 1 to the grid and
      // capped the store at a single row.
      if (level.depth === 0) rowsAtRoot = entry.rows;

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
        num_rows: () => Promise.resolve(entry.rows),
      };
    },

    /**
     * The grand total, live.
     *
     * When grouping is on this is free — it is row 0 of the root level View,
     * the one AG is already pulling, so it resolves to the same key. When
     * grouping is off there is no total row at all, because an ungrouped View
     * is just rows; one constant expression column produces exactly one group,
     * whose row 0 is the total over the whole filtered book.
     */
    async readGrandTotal(request: SsrmRequestLike): Promise<Record<string, unknown> | null> {
      if (closed) return null;

      const level = toPerspectiveGroupLevel({ ...levelState(request), groupKeys: [] });
      let config = level.config;
      let groupColId = level.groupColId;
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

      const total: Record<string, unknown> = {};
      for (const name of Object.keys(columns)) {
        if (name === '__ROW_PATH__') continue;
        total[name] = columns[name]?.[0];
      }
      return total;
    },

    /**
     * Count a filter model against the whole book.
     *
     * Deliberately NOT routed through `getView`. That path treats every call
     * as the grid's current intent: it retires every live View whose shape
     * differs, and the count's shape (a bare filter, no sort, no grouping)
     * differs from essentially every real request. Counting a saved-filter
     * pill would therefore tear down the Views the grid is scrolling and
     * rebuild them on the next block — a badge costing a full re-read of the
     * viewport. So the count builds its own View outside `entries`, reads it
     * once, and drops it.
     */
    async countMatching(
      filterModel: Record<string, AgFilterItem> | null | undefined,
    ): Promise<number | null> {
      if (closed) return null;
      if (!isFilterModelMappable(filterModel)) return null;

      const filter = toPerspectiveFilter(filterModel);
      const config: PerspectiveViewConfig = filter ? { filter } : {};

      // A live View already answers this exact question — an unsorted,
      // ungrouped grid under the same filter is the common case for a pill the
      // user just activated. Reading it costs nothing extra.
      const existing = entries.get(viewConfigKey(config));
      if (existing && existing.groupColId === null) {
        existing.usedAt = Date.now();
        return existing.safe.rows();
      }

      const safe = createSafeView(await table.view(config));
      if (closed) {
        void safe.close();
        return null;
      }
      transient.add(safe);
      try {
        return await safe.rows();
      } finally {
        transient.delete(safe);
        void safe.close();
      }
    },

    async close(): Promise<void> {
      closed = true;
      const live = [...entries.values()];
      entries.clear();
      for (const entry of live) onEvent({ type: 'retire', key: entry.key, why: 'close' });
      const pending = [...transient];
      transient.clear();
      await Promise.all([
        ...live.map((entry) => entry.safe.close()),
        ...pending.map((safe) => safe.close()),
      ]);
    },
  };
}
