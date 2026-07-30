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
import { columnsToRows, type PerspectiveViewLike, type SsrmRequestLike } from './perspectiveDatasource.js';
import {
  isFilterModelMappable,
  toGroupColumns,
  toPerspectiveFilter,
  toPerspectiveGroupLevel,
  toTreeColumns,
  viewConfigKey,
  type AgFilterItem,
  type PerspectiveAggregate,
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
  /**
   * Pre-flight expression check. Returns the columns that compiled under
   * `expression_schema` and the ones that did not under `errors`.
   *
   * MEASURED: a single bad expression makes `table.view()` throw and takes the
   * WHOLE View down — so one broken calculated column would blank the entire
   * grid. Optional, because a Table that cannot check is still usable.
   */
  validate_expressions?(expressions: Record<string, string>): Promise<{
    expression_schema?: Record<string, string>;
    errors?: Record<string, { error_message?: string }>;
  }>;
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
  /**
   * Column ids forming a tree hierarchy, outermost first. Present means the
   * grid runs in AG's SSRM **tree** mode rather than its row-group mode.
   *
   * The two are the same pull shape — AG asks for the children of a path and
   * the level maps onto `group_by: [one column]` plus ancestor clauses — so
   * this reuses `toPerspectiveGroupLevel` by standing in for `rowGroupCols`,
   * which AG does not send in tree mode. What differs is the OUTPUT: tree rows
   * have to carry `__treeKey` and `__treeGroup`, because AG reads the hierarchy
   * off the data instead of off group columns.
   */
  treeFields?: readonly string[];
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
  /**
   * Rows of the CURRENT filtered book for which a Perspective boolean
   * expression is true — what a style rule needs to know about a book this
   * window does not hold.
   *
   * Counts against the grid's own filter and quick search (conjunctively), not
   * against the raw book, because the client-side equivalent this replaces is
   * `forEachNodeAfterFilter`. Null when the expression will not compile, so a
   * caller reports nothing rather than "no row matches".
   */
  countMatchingExpression(
    source: string,
    request: SsrmRequestLike,
  ): Promise<number | null>;
  /**
   * One aggregate over a whole column of the current filtered book.
   *
   * The expression language has NO cross-row aggregate — `avg("price")` parses
   * and silently answers the column's own values, so "above average" cannot be
   * one expression. This measures the scalar so a caller can substitute it as a
   * literal. See ARCHITECTURE.md, "avg() and sum() are row-wise".
   */
  aggregateScalar(
    colId: string,
    aggregate: PerspectiveAggregate,
    request: SsrmRequestLike,
  ): Promise<number | null>;
  /**
   * The book's rows whose columns equal every entry of `match` — the child
   * rows behind an expanded master row.
   *
   * Deliberately NOT scoped to the grid's filter or sort: a detail grid shows
   * what belongs to its master, and hiding a child because the master list is
   * filtered would make the same master expand differently depending on what
   * else is on screen.
   */
  readMatchingRows(
    match: Record<string, unknown>,
    limit: number,
  ): Promise<Record<string, unknown>[] | null>;
  /**
   * Every distinct value in a column, for a set filter's value list.
   *
   * Returns null when the column has MORE than `limit` distinct values — see
   * `distinctValues` in the implementation for why that is not a truncation.
   */
  distinctValues(colId: string, limit: number): Promise<unknown[] | null>;
  /**
   * Set the quick search. Returns true when it actually changed, so a caller
   * only pays for a purge when there is something to purge for.
   *
   * Held here rather than taken off the AG request because AG does not carry
   * it — `quickFilterText` is a client-side-row-model option and the server
   * row model never sees it.
   */
  setQuickFilter(text: string, columns: readonly string[]): boolean;
  /**
   * Calculated columns, as Perspective expression source keyed by column id.
   *
   * Held here for the same reason the quick filter is: AG's request does not
   * carry them, and they change what a View contains. Returns true when the map
   * actually changed.
   */
  setExpressions(expressions: Record<string, string>): boolean;
  /**
   * Every row of the current filtered, sorted book — for an export, which is
   * the one operation that legitimately wants the whole thing.
   *
   * Null when the book is larger than `limit`: an export that silently stopped
   * short would be taken for a complete one.
   */
  readAllRows(
    request: SsrmRequestLike,
    limit: number,
  ): Promise<Record<string, unknown>[] | null>;
  close(): Promise<void>;
}

/** Constant expression column that gives a FLAT view a grand-total row. */
const TOTAL_GROUP = '__all__';

/** Alias the style-rule boolean is published under in a transient count View. */
const RULE_MATCH = '__ruleMatch__';

/** Rows per read when draining the whole book for an export. One read of
 *  20,000 x 26 would cross the proxy as a single message. */
const EXPORT_CHUNK_ROWS = 10_000;

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
function shapeOf(
  request: SsrmRequestLike,
  quick: QuickFilter,
  expressionsForShape: Record<string, string>,
): string {
  return JSON.stringify({
    sort: request.sortModel ?? null,
    filter: request.filterModel ?? null,
    groups: request.rowGroupCols?.map((c) => c.id) ?? null,
    values: request.valueCols?.map((c) => [c.id, c.aggFunc]) ?? null,
    // The quick filter is NOT part of the AG request — it is held here — but it
    // changes which rows a View contains, so it has to change the shape or
    // every live View would survive a search with the wrong rows in it.
    quick: quick.text || null,
    // A changed calc column makes every live View stale in the same way.
    exprs: Object.keys(expressionsForShape).sort().map((k) => [k, expressionsForShape[k]]),
  });
}

/** Quick-search text plus the columns it spans. */
interface QuickFilter {
  text: string;
  columns: readonly string[];
}

function levelState(
  request: SsrmRequestLike,
  quick: QuickFilter,
  exprs: Record<string, string>,
) {
  return {
    sortModel: request.sortModel,
    filterModel: request.filterModel as Record<string, AgFilterItem> | null | undefined,
    rowGroupCols: request.rowGroupCols,
    valueCols: request.valueCols,
    groupKeys: request.groupKeys,
    quickFilterText: quick.text,
    quickFilterColumns: quick.columns,
    expressions: exprs,
  };
}

export function createViewManager(opts: ViewManagerOpts): ViewManager {
  const { table, onEvent = () => {}, onUpdate, maxViews = 24, treeFields } = opts;

  const tree = treeFields ?? [];
  /**
   * Stand the tree fields in for `rowGroupCols`, which AG does not send in tree
   * mode. A request that DOES carry group columns is left alone: the user has
   * dragged a column into the group panel, and that intent wins over the
   * configured hierarchy rather than silently merging with it.
   */
  const withTreeLevels = (request: SsrmRequestLike): SsrmRequestLike =>
    tree.length > 0 && !(request.rowGroupCols?.length)
      ? { ...request, rowGroupCols: tree.map((id) => ({ id })) }
      : request;

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
  /** Quick search. Held here rather than read off the request, because AG does
   *  not carry it: `quickFilterText` is a client-side-row-model option. */
  let quick: QuickFilter = { text: '', columns: [] };
  /** Calculated columns. Every View built here carries them, so a calc column
   *  is sortable, filterable and groupable like any real one. */
  let expressions: Record<string, string> = {};

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

      const levelled = withTreeLevels(request);

      // A new sort/filter/grouping makes every existing View garbage. Retire
      // them now rather than waiting for the LRU: they would otherwise keep
      // charging the engine on every tick for a shape nothing will ask for.
      const nextShape = shapeOf(levelled, quick, expressions);
      if (shape !== null && shape !== nextShape) {
        for (const entry of [...entries.values()]) retire(entry, 'shape');
      }
      shape = nextShape;

      const level = toPerspectiveGroupLevel(levelState(levelled, quick, expressions));
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
          if (groupColId === null) return columns;
          // In tree mode the rows also carry the markers AG reads the
          // hierarchy from; a leaf level is ungrouped and never reaches here,
          // which is why every row this produces is a parent.
          return tree.length > 0
            ? toTreeColumns(columns, groupColId)
            : toGroupColumns(columns, groupColId);
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

      const level = toPerspectiveGroupLevel({ ...levelState(request, quick, expressions), groupKeys: [] });
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
      // Carry the calc columns: a saved filter may well be ON one, and a
      // View that omits them cannot resolve the clause at all.
      const config: PerspectiveViewConfig = {
        ...(filter ? { filter } : {}),
        ...(Object.keys(expressions).length > 0 ? { expressions } : {}),
      };

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

    /**
     * Every distinct value in a column — an AG set filter's value list.
     *
     * `group_by: [colId]` gives exactly one row per distinct value, and row 0
     * is the level total (an empty `__ROW_PATH__`), so the distinct count is
     * `num_rows - 1`. Like `countMatching`, this builds its own View outside
     * the keyed map: a value list is not the grid's current intent and must not
     * retire the Views the viewport is reading from.
     *
     * **Over `limit`, this answers null rather than a partial list.** A set
     * filter has no affordance for "there are more" — a truncated list renders
     * as if it were the whole domain, and its Select All silently excludes
     * everything omitted. Refusing to answer leaves the filter empty, which
     * reads as "cannot filter here"; answering with 500 of 20,000 values reads
     * as a complete list and is wrong. Same rule as `countMatching`: no
     * confidently-wrong answers on this path.
     */
    /**
     * The whole current book, flat.
     *
     * Grouping is deliberately dropped: an export wants the leaf rows in the
     * order the grid is showing them, not an interleaved group tree. Read in
     * chunks rather than one call — a single `to_columns` over 20,000 x 26 has
     * to cross the proxy as one message, and chunking keeps each transfer and
     * each buffer copy bounded.
     */
    async readAllRows(
      request: SsrmRequestLike,
      limit: number,
    ): Promise<Record<string, unknown>[] | null> {
      if (closed) return null;

      const level = toPerspectiveGroupLevel({
        ...levelState(request, quick, expressions),
        rowGroupCols: undefined,
        groupKeys: [],
      });

      const safe = createSafeView(await table.view(level.config));
      if (closed) {
        void safe.close();
        return null;
      }
      transient.add(safe);
      try {
        const total = await safe.rows();
        if (total === null) return null;
        if (total > limit) return null;

        const rows: Record<string, unknown>[] = [];
        for (let start = 0; start < total; start += EXPORT_CHUNK_ROWS) {
          const columns = await safe.read({
            start_row: start,
            end_row: Math.min(start + EXPORT_CHUNK_ROWS, total),
          });
          if (columns === null) return null;
          rows.push(...columnsToRows(columns));
        }
        return rows;
      } finally {
        transient.delete(safe);
        void safe.close();
      }
    },

    /**
     * "Does any row in the book match this style rule, and how many?"
     *
     * The client-side answer is `forEachNodeAfterFilter`, which on this path
     * walks the ~100 rows in the loaded blocks and calls a rule that matches
     * 8,000 rows further down "no match". This asks the worker instead.
     *
     * Transient, like `countMatching` — and deliberately NOT added to the live
     * Views. An expression column is recomputed on every Table update for as
     * long as its View lives, which is what made a 26-column quick search
     * unusable; a rule column in the viewport's View would charge that on every
     * tick, forever, for something only the header painter reads. Here it is
     * built, read once and dropped, and the caller throttles.
     *
     * The rule clause is appended to the grid's own filter clauses, which AND
     * together — "rows the grid is showing that also match the rule", which is
     * what the client-side original computes.
     */
    async countMatchingExpression(
      source: string,
      request: SsrmRequestLike,
    ): Promise<number | null> {
      if (closed || !source) return null;

      // Flat and unsorted: grouping would interleave a tree and a sort cannot
      // change a count, so neither is worth the engine work.
      const level = toPerspectiveGroupLevel({
        ...levelState(request, quick, expressions),
        sortModel: undefined,
        rowGroupCols: undefined,
        groupKeys: [],
      });
      const config: PerspectiveViewConfig = {
        ...level.config,
        // Spread the rule LAST so a calculated column that happens to be named
        // the same cannot take the alias out from under the clause below.
        expressions: { ...(level.config.expressions ?? {}), [RULE_MATCH]: source },
        filter: [...(level.config.filter ?? []), [RULE_MATCH, '==', true]],
      };

      let safe: SafeView;
      try {
        safe = createSafeView(await table.view(config));
      } catch {
        // A rule that does not compile takes only its own count down — the
        // View is transient, so the grid never sees it. Null, not zero: "no
        // row matches" is a claim, and this cannot make it.
        return null;
      }
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

    /**
     * One column aggregate over the WHOLE book — filters deliberately dropped.
     *
     * Its only caller is a style rule comparing a row against the set
     * (`[price] > AVG([price])`), and DECIDED for that use: the threshold is a
     * property of the book, so the colours mean the same thing whatever the
     * user has filtered to. That is Excel's conditional-formatting convention
     * — a filter hides rows, it does not move the threshold — against the
     * SQL/BI convention of filtering first, which is what this used to do.
     *
     * The cost of the choice, stated so nobody re-derives it as a bug: a rule
     * reading "above average" can disagree with the average in the totals row
     * on the same screen, because group totals, the grand total and the status
     * bar all DO follow the filter. If a filtered aggregate is ever wanted
     * here, pass the request's `filterModel` through instead of dropping it —
     * and cache-key on it, which `aggregateScalar` in the engine no longer
     * does.
     *
     * Same shape the grand total uses — one constant expression column gives a
     * flat View exactly one group, whose row 0 is the aggregate over
     * everything. Transient for the same reason as above.
     */
    async aggregateScalar(
      colId: string,
      aggregate: PerspectiveAggregate,
      request: SsrmRequestLike,
    ): Promise<number | null> {
      if (closed || !colId) return null;

      const level = toPerspectiveGroupLevel({
        ...levelState(request, quick, expressions),
        sortModel: undefined,
        rowGroupCols: undefined,
        groupKeys: [],
        // The whole book, not the filtered one — see above. The quick filter
        // goes with it: it is a filter the user typed, no different in kind.
        filterModel: undefined,
        quickFilterText: '',
      });
      const config: PerspectiveViewConfig = {
        ...level.config,
        expressions: { ...(level.config.expressions ?? {}), [TOTAL_GROUP]: "'ALL'" },
        group_by: [TOTAL_GROUP],
        aggregates: { [colId]: aggregate },
      };

      let safe: SafeView;
      try {
        safe = createSafeView(await table.view(config));
      } catch {
        return null;
      }
      if (closed) {
        void safe.close();
        return null;
      }
      transient.add(safe);
      try {
        const columns = await safe.read({ start_row: 0, end_row: 1 });
        const value = columns?.[colId]?.[0];
        return typeof value === 'number' && Number.isFinite(value) ? value : null;
      } finally {
        transient.delete(safe);
        void safe.close();
      }
    },

    /**
     * The child rows behind an expanded master row.
     *
     * Transient like every other question-shaped read: built, drained, dropped.
     * The clause shape is the one `toPerspectiveGroupLevel` already uses for
     * ancestor keys, including the null case — `== null` matches nothing in
     * Perspective, so a null match value has to become `is null` or a master
     * row keyed on a missing value would open onto an empty detail grid.
     */
    async readMatchingRows(
      match: Record<string, unknown>,
      limit: number,
    ): Promise<Record<string, unknown>[] | null> {
      if (closed) return null;
      const entries = Object.entries(match ?? {});
      // No clauses would select the WHOLE book as one row's children, which is
      // never what a master row means.
      if (entries.length === 0) return [];

      const config: PerspectiveViewConfig = {
        filter: entries.map(([colId, value]) =>
          value === null || value === undefined ? [colId, 'is null'] : [colId, '==', value],
        ),
        ...(Object.keys(expressions).length > 0 ? { expressions } : {}),
      };

      let safe: SafeView;
      try {
        safe = createSafeView(await table.view(config));
      } catch {
        return null;
      }
      if (closed) {
        void safe.close();
        return null;
      }
      transient.add(safe);
      try {
        const total = await safe.rows();
        if (total === null) return null;
        // A detail grid is a fixed-height panel, so this truncates rather than
        // refusing — unlike an export, where a short file is indistinguishable
        // from a complete one. The caller states the limit it chose.
        const wanted = Math.min(total, limit);
        if (wanted === 0) return [];
        const columns = await safe.read({ start_row: 0, end_row: wanted });
        return columns === null ? null : columnsToRows(columns);
      } finally {
        transient.delete(safe);
        void safe.close();
      }
    },

    setExpressions(next: Record<string, string>): boolean {
      const keys = Object.keys(next).sort();
      const same =
        keys.length === Object.keys(expressions).length &&
        keys.every((k) => expressions[k] === next[k]);
      if (same) return false;
      expressions = { ...next };
      // Like the quick filter: `getView` retires on shape change, and the shape
      // now includes these — so the next block request drops the stale Views
      // rather than deleting Views with reads still in flight.
      return true;
    },

    setQuickFilter(text: string, columns: readonly string[]): boolean {
      const next = (text ?? '').trim();
      if (next === quick.text) return false;
      quick = { text: next, columns };
      // Do NOT retire here. `getView` retires on shape change, and the shape
      // now includes the quick text — so the next block request drops the stale
      // Views itself. Retiring now would delete Views with reads still in
      // flight from the request that is about to be superseded.
      return true;
    },

    async distinctValues(colId: string, limit: number): Promise<unknown[] | null> {
      if (closed) return null;

      // The column may itself be a calculated one, so the View has to carry
      // the expressions or the group_by names a column that does not exist.
      const safe = createSafeView(
        await table.view({
          group_by: [colId],
          ...(Object.keys(expressions).length > 0 ? { expressions } : {}),
        }),
      );
      if (closed) {
        void safe.close();
        return null;
      }
      transient.add(safe);
      try {
        const total = await safe.rows();
        if (total === null) return null;
        // Row 0 is the level total, not a value.
        const distinct = Math.max(0, total - 1);
        if (distinct > limit) return null;

        const columns = await safe.read({ start_row: 1, end_row: distinct + 1 });
        const paths = columns?.__ROW_PATH__;
        if (!Array.isArray(paths)) return null;
        return paths.map((path) =>
          Array.isArray(path) && path.length > 0 ? path[path.length - 1] : null,
        );
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
