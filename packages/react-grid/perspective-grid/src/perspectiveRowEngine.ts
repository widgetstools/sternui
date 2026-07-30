/**
 * The row engine: everything a grid needs to run on a worker-held Table.
 *
 * `createPerspectiveDatasource` answers one block, and `createViewManager`
 * decides which View that block reads from. This binds the two to a live grid —
 * the parts that were previously re-hand-written per page and are easy to get
 * subtly wrong:
 *
 *   - refreshing EVERY expanded group level, not just the root;
 *   - keeping the grand total moving with a transaction, because
 *     `grandTotalData` creates that row but does not update it;
 *   - throttling, so a feed ticking faster than the eye can follow does not
 *     re-read every loaded block per tick.
 *
 * Deliberately free of any AG Grid import: the grid api is described
 * structurally, so this package still has no dependency on AG Grid and can be
 * unit-tested without one.
 */
import {
  createPerspectiveDatasource,
  type PerspectiveDatasource,
  type SsrmRequestLike,
} from './perspectiveDatasource.js';
import {
  createViewManager,
  type PerspectiveTableLike,
  type ViewManagerEvent,
} from './viewManager.js';
import type { AgFilterItem, PerspectiveAggregate } from './viewConfig.js';
import { coerceEditedValue } from './cellEdits.js';

/** The slice of AG Grid's api the engine drives. */
export interface GridApiLike {
  refreshServerSide(params: { route?: string[]; purge?: boolean }): void;
  forEachNode(callback: (node: GridNodeLike) => void): void;
  getRowNode(id: string): unknown;
  applyServerSideTransaction(transaction: { update?: unknown[] }): void;
  setRowCount?(rows: number): void;
}

export interface GridNodeLike {
  group?: boolean;
  expanded?: boolean;
  level: number;
  key?: string | null;
  parent?: GridNodeLike | null;
}

/** AG's own id for the grand total row (`GRAND_TOTAL_ROW_ID`). */
export const GRAND_TOTAL_ROW_ID = 'rowGroupFooter_ROOT_NODE_ID';

/** Marks the row the engine hands back as the grand total, so a host's
 *  `getRowId` can return `GRAND_TOTAL_ROW_ID` for it. */
export const GRAND_TOTAL_FLAG = '__grandTotal';

export interface PerspectiveRowEngineOpts {
  table: PerspectiveTableLike;
  /** Index column — labels the grand total row where it is always visible. */
  keyColumn: string;
  /** Coalesce Table updates into at most one refresh per this many ms. */
  refreshMs?: number;
  /** Floor on how often a saved-filter count is recomputed. See `countMatching`. */
  countMinIntervalMs?: number;
  /** Floor on how often a set filter's value list is rebuilt. */
  valuesMinIntervalMs?: number;
  /**
   * Ceiling on a set filter's value list. Above it `distinctValues` answers
   * null rather than a partial list — see its docs for why truncating is worse
   * than refusing. Generous by default: CSRM shows every distinct value and AG
   * virtualises the list, so a lower cap would itself be a parity gap.
   */
  maxSetFilterValues?: number;
  /**
   * Search numeric and date columns too, not just text.
   *
   * MEASURED (`scripts/quickFilterProbe4.mjs`), 20,000 rows: the compiled
   * expression costs one `match()` per column per token, and that cost is
   * linear — 5 columns 188ms, 11 columns 307ms, 26 columns 993ms, and 26
   * columns x 2 tokens 2,408ms. Worse, an expression column is recomputed on
   * every Table update for as long as the View lives, so on a ticking book the
   * charge repeats. In the browser, over the proxied session and against the
   * live feed, 26 columns x 2 tokens was effectively unusable.
   *
   * Text columns are what a typed search is nearly always aiming at, and on the
   * demo book they are 11 of 26 — so the default halves the cost and keeps
   * multi-token searches responsive. Set true to accept the cost and match AG's
   * CSRM behaviour, which searches every column's formatted value.
   */
  quickFilterAllColumns?: boolean;
  /**
   * Ceiling on an export. Above it `readAllRows` answers null rather than a
   * short file, because an export that stopped early is indistinguishable from
   * a complete one once it is open in Excel.
   */
  maxExportRows?: number;
  /**
   * Ceiling on one master row's detail grid. Truncates rather than refusing,
   * unlike an export: a detail panel is a bounded surface the user is looking
   * at, not a file that will be read later with no way to tell it is short.
   */
  maxDetailRows?: number;
  /**
   * Column ids forming a tree hierarchy, outermost first — AG's SSRM **tree**
   * mode rather than its row-group mode. The rows served for a non-leaf level
   * carry `__treeKey` / `__treeGroup`, which is how AG reads a hierarchy off
   * the data when there are no group columns to read it from.
   */
  treeFields?: readonly string[];
  /** Coalesce cell edits made within this window into one Table write. */
  editFlushMs?: number;
  onEvent?(event: ViewManagerEvent): void;
  /** A block that failed. AG never retries one on its own. */
  onError?(error: unknown): void;
}

/**
 * What a status bar can honestly say on the pull path.
 *
 * Every count comes from the worker-held Table, NOT from the rows this window
 * is holding. A stock AG status panel would aggregate the ~100 rows in the
 * loaded blocks and report a plausible, wrong number — which is the failure
 * mode this whole migration keeps running into.
 */
export interface PerspectiveGridStatus {
  /** Rows in the book, ignoring every filter. Null until measured. */
  bookRows: number | null;
  /** Rows after the server-side filters — what the grid is scrolling. */
  filteredRows: number | null;
  /** True when a filter is actually narrowing the book. */
  filtered: boolean;
  /** Re-reading on Table updates. */
  live: boolean;
  /** Live Views this window holds — one per open group level. */
  liveViews: number;
  /** Blocks that failed; AG never retries one on its own. */
  failedBlocks: number;
}

/** One committed cell edit, as the grid reports it. */
export interface PerspectiveCellEdit {
  /** The edited row's value for the Table's index column. */
  key: unknown;
  /** Column being written — the Perspective column name. */
  field: string;
  value: unknown;
}

export interface PerspectiveRowEngine {
  datasource: PerspectiveDatasource;
  /** Connect the grid once it exists; pass null to disconnect. */
  setApi(api: GridApiLike | null): void;
  /** Rows in the root level, for `setRowCount`. Null until a View is built. */
  readonly rowsAtRoot: number | null;
  /** Current status — safe to call at any time. */
  readonly status: PerspectiveGridStatus;
  /** Subscribe to status changes. Returns an unsubscribe. */
  subscribe(listener: (status: PerspectiveGridStatus) => void): () => void;
  /** Stop re-reading on Table updates without tearing anything down. */
  setLive(live: boolean): void;
  readonly live: boolean;
  /** Refresh every level now, ignoring the throttle. */
  refreshNow(): void;
  /**
   * Rows the whole book matches under an AG filter model — what a saved-filter
   * pill's badge shows. Null when the model cannot be translated exactly, so
   * the badge is absent rather than wrong.
   */
  countMatching(
    filterModel: Record<string, AgFilterItem> | null | undefined,
  ): Promise<number | null>;
  /**
   * Rows of the current filtered book matching a Perspective boolean
   * expression — for a style rule that has to know about rows this window
   * does not hold.
   *
   * Null when the expression will not compile, so a caller reports nothing
   * rather than the confidently-wrong "no row matches".
   */
  countMatchingExpression(source: string): Promise<number | null>;
  /**
   * One aggregate over a whole column of the current filtered book, so a rule
   * with cross-row context ("above average") can substitute the scalar into
   * its expression. There is no cross-row aggregate in the expression language
   * itself — `avg("col")` is row-wise and silently answers the column.
   */
  aggregateScalar(colId: string, aggregate: PerspectiveAggregate): Promise<number | null>;
  /**
   * The child rows behind an expanded master row — the book's rows whose
   * columns equal every entry of `match`.
   *
   * Not scoped to the grid's filter: a master row must expand onto the same
   * children whatever else is on screen.
   */
  readMatchingRows(
    match: Record<string, unknown>,
    limit?: number,
  ): Promise<Record<string, unknown>[] | null>;
  /**
   * Every distinct value in a column, for an AG set filter's value list.
   *
   * Null means "no honest list": either the column has more distinct values
   * than the configured ceiling, or the read failed. Callers must leave the
   * filter empty rather than supply a partial list.
   */
  distinctValues(colId: string): Promise<unknown[] | null>;
  /**
   * Apply the quick search across every column of the book.
   *
   * AG's own `quickFilterText` is a client-side-row-model option and does
   * nothing under a server row model, so the text has to be handed here and
   * compiled into the View.
   */
  /**
   * Publish the calculated columns as Perspective expression columns, so their
   * values feed sort, filter, group and aggregate server-side.
   *
   * Expressions are VALIDATED first and the broken ones dropped: a single bad
   * expression makes every `table.view()` throw, which would blank the grid
   * rather than hide one column. Each drop is reported through `onError`.
   */
  setCalcExpressions(expressions: Record<string, string>): Promise<void>;
  setQuickFilter(text: string): Promise<void>;
  /**
   * Every row of the current filtered, sorted book, flat — for an export.
   *
   * This is the one operation that legitimately wants the whole book, and the
   * only place on this path that materializes it. Null when the book exceeds
   * the configured ceiling, so a caller reports that rather than writing a file
   * that looks complete and is not.
   */
  readAllRows(): Promise<Record<string, unknown>[] | null>;
  /**
   * Persist a committed cell edit into the worker-held Table.
   *
   * Fire and forget — the grid has already painted the new value and the write
   * comes back through the normal refresh. Coalesced, so a bulk update or a
   * smart-edit patch lands as ONE write rather than one per cell.
   */
  applyEdit(edit: PerspectiveCellEdit): void;
  /** Write any buffered edits now. Resolves once the Table has them. */
  flushEdits(): Promise<void>;
  /** Number of live Views — diagnostics. */
  readonly liveViews: number;
  close(): Promise<void>;
}

/**
 * A keyed cache whose entries expire on two conditions at once: the Table has
 * moved since the answer was taken, AND enough time has passed to justify
 * paying for another one.
 *
 * Both users (filter counts, set-filter value lists) cost a View over the whole
 * book and are driven by grid events that fire far faster than the answer
 * meaningfully changes. Without the floor, AG's `modelUpdated` alone would
 * queue a full-book View build per key per tick behind the read path.
 *
 * In-flight promises are cached too, so N callers asking at once pay once.
 */
interface StaleCache<T> {
  /** Cached answer, or null when it must be recomputed. */
  get(key: string): Promise<T> | null;
  set(key: string, value: Promise<T>): void;
  /** Mark every entry stale — the Table moved. */
  invalidate(): void;
  clear(): void;
}

function createStaleCache<T>(minIntervalMs: number, maxKeys = 32): StaleCache<T> {
  const entries = new Map<string, { at: number; value: Promise<T> }>();
  let staleAt = 0;

  return {
    get(key) {
      const hit = entries.get(key);
      if (!hit) return null;
      // Strictly after, not at: an answer taken in the same millisecond as an
      // invalidation cannot be ordered against it, so treat it as stale. The
      // cost of being wrong that way is one extra recompute; the other way it
      // would never expire.
      const stillTrue = hit.at > staleAt;
      const tooSoon = Date.now() - hit.at < minIntervalMs;
      return stillTrue || tooSoon ? hit.value : null;
    },
    set(key, value) {
      // Delete first so a recomputed key moves to the back of the Map's
      // insertion order — that order is what the cap below evicts from.
      entries.delete(key);
      entries.set(key, { at: Date.now(), value });
      if (entries.size > maxKeys) entries.delete(entries.keys().next().value as string);
    },
    invalidate() {
      staleAt = Date.now();
    },
    clear() {
      entries.clear();
    },
  };
}

export function createPerspectiveRowEngine(
  opts: PerspectiveRowEngineOpts,
): PerspectiveRowEngine {
  const {
    table,
    keyColumn,
    refreshMs = 250,
    countMinIntervalMs = 1000,
    valuesMinIntervalMs = 30_000,
    maxSetFilterValues = 50_000,
    quickFilterAllColumns = false,
    maxExportRows = 200_000,
    maxDetailRows = 500,
    treeFields,
    editFlushMs = 0,
    onEvent,
    onError,
  } = opts;

  let api: GridApiLike | null = null;
  let live = true;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingUpdate = false;
  let closed = false;
  /** The most recent root-level request, so the total matches the grid shape. */
  let lastRootRequest: SsrmRequestLike = {};
  /**
   * Set once the root level has been grouped, so row count is not published.
   *
   * Tree mode counts as grouped from the start: `setRowCount` raises AG error
   * #28 whenever a row-group column exists, the error is SILENT without
   * ValidationModule, and a tree level is a group level by another name.
   */
  let grouped = (treeFields?.length ?? 0) > 0;

  let bookRows: number | null = null;
  let failedBlocks = 0;
  const listeners = new Set<(status: PerspectiveGridStatus) => void>();

  /**
   * Saved-filter badge counts, cached.
   *
   * Each answer costs a View over the whole book, and the recount is driven by
   * AG's `modelUpdated` — which fires on every block load and every live
   * refresh, several times a second. Recomputing at that rate would put one
   * full-book View build per pill per tick into the same engine the read path
   * queues behind, and on this path writes already block reads. So a resolved
   * count is reused until the Table actually moves, and then no sooner than
   * `countMinIntervalMs` after it was taken: a badge trailing the book by a
   * second is indistinguishable from a live one, and a grid that stutters is
   * not.
   */
  const counts = createStaleCache<number | null>(countMinIntervalMs);

  /**
   * Set-filter value lists, cached the same way and for the same reason — one
   * View over the whole book per column — but with a much longer floor. A
   * column's set of distinct values is far more stable than its aggregates: it
   * only moves when a row appears, disappears, or changes category, none of
   * which the price-tick sweep does.
   */
  const values = createStaleCache<unknown[] | null>(valuesMinIntervalMs);

  /**
   * Style-rule match counts, and the scalars a cross-row rule substitutes.
   *
   * Same shape and floor as the saved-filter counts — the header painter
   * re-evaluates on the platform's row signal and on every filter change,
   * which under a live feed is several times a second, and each answer is a
   * View over the whole book. A header badge trailing the book by a second is
   * indistinguishable from a live one.
   */
  const ruleCounts = createStaleCache<number | null>(countMinIntervalMs);
  const scalars = createStaleCache<number | null>(countMinIntervalMs);

  // ─── Cell edits ────────────────────────────────────────────────────────────
  //
  // The write goes DIRECT from this window to the worker-held Table, not back
  // out through the provider. Three reasons, in order of weight:
  //
  //   - There is nowhere else for it to go. The STOMP provider is one-way:
  //     `startStomp` publishes only a subscribe frame, and `StompProviderConfig`
  //     carries no write channel at all. "Through the provider" would mean a new
  //     hub RPC whose entire body is the same `table.update()` one process
  //     later, with an extra hop and a new way to fail.
  //   - The Table IS the shared book. One write updates the single copy every
  //     window reads, and each peer's View notifies it — so an edit propagates
  //     to other blotters for free, which the push path never managed.
  //   - It matches the other two surfaces. CSRM writes into the row node it
  //     renders from; CustomSSRMGrid writes into its mirror engine. Both put
  //     the edit into the store that supplies the grid, and here that store
  //     lives in the worker.
  //
  // What this is NOT: the Table is not a system of record. A provider snapshot
  // arrives as a `replace` and discards local edits — the same lifetime a CSRM
  // edit has when the next full row for that key ticks in.
  /** Edited rows awaiting a write, keyed by index value so repeated touches of
   *  the same row merge into one sparse row rather than N writes. */
  const pendingEdits = new Map<string, Record<string, unknown>>();
  let editTimer: ReturnType<typeof setTimeout> | null = null;
  let editFlush: Promise<void> = Promise.resolve();
  /** Declared column types, fetched once. Null when the Table cannot report
   *  them, in which case values are written as the grid produced them. */
  let schemaPromise: Promise<Record<string, string> | null> | null = null;

  function tableSchema(): Promise<Record<string, string> | null> {
    schemaPromise ??=
      typeof table.schema === 'function'
        ? table.schema().catch(() => null)
        : Promise.resolve(null);
    return schemaPromise;
  }

  async function writePendingEdits(): Promise<void> {
    if (closed || pendingEdits.size === 0) return;
    const staged = [...pendingEdits.values()];
    pendingEdits.clear();

    if (typeof table.update !== 'function') {
      onError?.(new Error('perspective: this Table is read-only — edit discarded'));
      return;
    }

    const schema = await tableSchema();
    const rows: Record<string, unknown>[] = [];
    for (const staging of staged) {
      const row: Record<string, unknown> = {};
      let usable = true;
      for (const field of Object.keys(staging)) {
        const coerced = coerceEditedValue(schema?.[field], staging[field]);
        if (!coerced.ok) {
          // Refuse the whole row: writing the columns that did coerce would
          // half-apply an edit the user made as one action.
          onError?.(new Error(`perspective: cannot write ${field} — ${coerced.reason}`));
          usable = false;
          break;
        }
        row[field] = coerced.value;
      }
      if (usable) rows.push(row);
    }
    if (rows.length === 0 || closed) return;

    try {
      await table.update(rows);
    } catch (error) {
      onError?.(error);
    }
  }

  function scheduleEditFlush(): void {
    if (editTimer !== null || closed) return;
    editTimer = setTimeout(() => {
      editTimer = null;
      editFlush = editFlush.then(writePendingEdits);
    }, editFlushMs);
  }

  function currentStatus(): PerspectiveGridStatus {
    const filteredRows = views.rowsAtRoot;
    return {
      bookRows,
      filteredRows,
      // Only claim "filtered" once both numbers are known — an unmeasured
      // book must not render as "0 of N".
      filtered:
        bookRows !== null && filteredRows !== null && filteredRows < bookRows,
      live,
      liveViews: views.liveViews,
      failedBlocks,
    };
  }

  function publishStatus(): void {
    if (listeners.size === 0) return;
    const snapshot = currentStatus();
    for (const listener of listeners) listener(snapshot);
  }

  /** Measure the unfiltered book. Cheap, and the only figure a View cannot
   *  give — a View only ever knows its own filtered row count. */
  function measureBook(): void {
    if (closed || typeof table.size !== 'function') return;
    void table
      .size()
      .then((size) => {
        if (closed) return;
        const changed = size !== bookRows;
        bookRows = size;
        if (changed) publishStatus();
        // A non-empty book under a grid showing nothing is the signature of a
        // store that settled before the rows existed — the normal case for a
        // blotter that opened during the snapshot. Nothing else will nudge it:
        // AG does not re-ask a store it believes is empty.
        if (size > 0 && views.rowsAtRoot === 0) scheduleRefresh();
      })
      .catch(() => {
        /* a status figure must never break the grid */
      });
  }

  const views = createViewManager({
    table,
    treeFields,
    onUpdate: () => {
      // The book itself can grow or shrink under the feed, so the unfiltered
      // total is re-measured on updates rather than read once at startup.
      measureBook();
      counts.invalidate();
      values.invalidate();
      ruleCounts.invalidate();
      scalars.invalidate();
      scheduleRefresh();
    },
    onEvent: (event) => {
      onEvent?.(event);
      if (event.type !== 'view' || event.depth !== 0) return;
      // `setRowCount` raises AG error #28 while grouping, and the error is
      // SILENT without ValidationModule. Grouped levels are small enough to
      // discover by walking off the end.
      if (!grouped && typeof event.rows === 'number') api?.setRowCount?.(event.rows);
      // A new root View means a new filtered count — the figure the status bar
      // exists to show.
      publishStatus();
    },
  });

  /**
   * Refresh the root store AND every expanded group's store.
   *
   * MEASURED: `refreshServerSide` does NOT cascade into child stores. With
   * two levels expanded it refreshed the top rows and their footer and left
   * the rows underneath frozen at their opening values — aggregates that look
   * live at the top and are stale one row down, which is worse than obviously
   * not updating.
   */
  function refreshEveryLevel(): void {
    if (api === null) return;
    // MEASURED on the live feed: a root store that settled at ZERO rows never
    // re-asks on a non-purging refresh — there are no blocks to invalidate, so
    // there is nothing to reload. That is precisely the state a blotter opens
    // in when it attaches before the snapshot lands: the Table then fills to
    // 20,000 rows and the grid stays empty forever, reporting "0 of 20,000".
    // Purge ONLY in that case — purging a populated store would throw away the
    // user's scroll position on every tick.
    api.refreshServerSide({ purge: views.rowsAtRoot === 0 });
    const routes: string[][] = [];
    api.forEachNode((node) => {
      if (!node.group || !node.expanded) return;
      const route: string[] = [];
      for (let n: GridNodeLike | null | undefined = node; n && n.level >= 0; n = n.parent) {
        if (typeof n.key === 'string') route.unshift(n.key);
      }
      routes.push(route);
    });
    for (const route of routes) api.refreshServerSide({ route, purge: false });
  }

  /**
   * Keep the grand total moving.
   *
   * MEASURED: `grandTotalData` on a block response CREATES the row and
   * updates it after a purge, but a `refreshServerSide({purge:false})` does
   * NOT apply it — five distinct fresh totals over five refreshes left the row
   * showing the first. The documented way to update an existing one is a
   * transaction whose row id is `GRAND_TOTAL_ROW_ID`.
   */
  async function pushGrandTotal(): Promise<void> {
    if (api === null || closed) return;
    if (!api.getRowNode(GRAND_TOTAL_ROW_ID)) return;
    const total = await grandTotalFor(lastRootRequest);
    if (total && api !== null) api.applyServerSideTransaction({ update: [total] });
  }

  async function grandTotalFor(
    request: SsrmRequestLike,
  ): Promise<Record<string, unknown> | null> {
    const total = await views.readGrandTotal(request);
    if (!total) return null;
    // The caption goes on the key column: it is the one AG never hides, while
    // a grouped column disappears and the auto-group column renders nothing
    // for a total row.
    return { ...total, [keyColumn]: 'GRAND TOTAL', [GRAND_TOTAL_FLAG]: true };
  }

  function scheduleRefresh(): void {
    if (!live || closed) return;
    pendingUpdate = true;
    // MEASURED: AG requests its FIRST block before `onGridReady` fires, so the
    // grid is not connected yet when that block settles empty and asks for a
    // heal. Dropping the intent here left the store permanently at zero rows
    // over a full book. Remember it; `setApi` flushes it on connect.
    if (api === null) return;
    if (timer !== null) return;
    timer = setTimeout(() => {
      timer = null;
      if (!pendingUpdate || !live || closed) return;
      pendingUpdate = false;
      refreshEveryLevel();
      void pushGrandTotal();
    }, refreshMs);
  }

  const datasource = createPerspectiveDatasource({
    getView: async (request) => {
      grouped =
        (request.rowGroupCols?.length ?? 0) > 0 || (treeFields?.length ?? 0) > 0;
      if (!request.groupKeys?.length) lastRootRequest = request;
      const view = await views.getView(request);
      // A root level that reads as empty is either a genuinely empty book or a
      // store that raced the snapshot. `measureBook` tells the two apart and
      // schedules the refresh when it was the race — the loop terminates
      // because the answer stops being zero as soon as rows exist.
      if (!grouped && views.rowsAtRoot === 0) measureBook();
      // The `view` event fires only when a View is BUILT. A cached View that
      // was re-measured — the normal case once the book has settled — changes
      // the filtered count without one, and the status bar was left showing
      // "0 of 20,000" over a grid that had just filled.
      publishStatus();
      return view;
    },
    getGeneration: () => views.getGeneration(),
    getGrandTotal: grandTotalFor,
    onError: (error) => {
      failedBlocks += 1;
      publishStatus();
      onError?.(error);
    },
  });

  return {
    datasource,

    setApi(next: GridApiLike | null) {
      api = next;
      if (api === null) return;
      if (!grouped && views.rowsAtRoot !== null) {
        api.setRowCount?.(views.rowsAtRoot);
      }
      measureBook();
      // Anything that asked for a refresh while the grid was unconnected.
      if (pendingUpdate) scheduleRefresh();
    },

    get rowsAtRoot() {
      return views.rowsAtRoot;
    },

    get status() {
      return currentStatus();
    },

    subscribe(listener: (status: PerspectiveGridStatus) => void) {
      listeners.add(listener);
      // Measure on first interest rather than at construction: a grid with no
      // status bar should not pay for a figure nothing reads.
      measureBook();
      listener(currentStatus());
      return () => listeners.delete(listener);
    },

    get liveViews() {
      return views.liveViews;
    },

    get live() {
      return live;
    },

    setLive(next: boolean) {
      live = next;
      if (live) scheduleRefresh();
      publishStatus();
    },

    refreshNow() {
      if (closed) return;
      refreshEveryLevel();
      void pushGrandTotal();
    },

    applyEdit(edit) {
      if (closed) return;
      const { key, field, value } = edit;
      if (key === null || key === undefined || !field) return;
      // Rewriting the index column is not an edit, it is a re-key: the upsert
      // would insert a second row and leave the original behind, and every
      // `getRowId` in the grid still points at the old one.
      if (field === keyColumn) {
        onError?.(new Error(`perspective: "${keyColumn}" is the index column and cannot be edited`));
        return;
      }

      const id = String(key);
      const staged = pendingEdits.get(id) ?? { [keyColumn]: key };
      staged[field] = value;
      pendingEdits.set(id, staged);
      scheduleEditFlush();
    },

    async flushEdits() {
      if (editTimer !== null) {
        clearTimeout(editTimer);
        editTimer = null;
      }
      editFlush = editFlush.then(writePendingEdits);
      await editFlush;
    },

    countMatching(filterModel) {
      if (closed) return Promise.resolve(null);

      const key = JSON.stringify(filterModel ?? null);
      const cached = counts.get(key);
      if (cached) return cached;

      // A count must never break the grid, and a rejection would be read as
      // zero — a wrong number rather than a missing one.
      const value = views.countMatching(filterModel).catch(() => null);
      counts.set(key, value);
      return value;
    },

    countMatchingExpression(source) {
      if (closed || !source) return Promise.resolve(null);

      // Cached on the same terms as a saved-filter count, and for the same
      // reason: the header painter re-evaluates on every `rows` notification
      // and every filter change, several times a second, and each answer costs
      // a View over the whole book in the engine the read path queues behind.
      // The key carries the root request because the count is scoped to the
      // grid's current filter — the same rule under a different filter is a
      // different question.
      const key = `${source} ${JSON.stringify(lastRootRequest.filterModel ?? null)}`;
      const cached = ruleCounts.get(key);
      if (cached) return cached;

      const value = views
        .countMatchingExpression(source, lastRootRequest)
        .catch(() => null);
      ruleCounts.set(key, value);
      return value;
    },

    aggregateScalar(colId, aggregate) {
      if (closed || !colId) return Promise.resolve(null);

      // NOT keyed on the filter model, because the answer no longer depends
      // on it: this aggregate is measured over the WHOLE book by decision
      // (see `viewManager.aggregateScalar`). Keying on it would miss the
      // cache on every filter change and rebuild an identical View.
      const key = `${colId} ${aggregate}`;
      const cached = scalars.get(key);
      if (cached) return cached;

      const value = views
        .aggregateScalar(colId, aggregate, lastRootRequest)
        .catch(() => null);
      scalars.set(key, value);
      return value;
    },

    readMatchingRows(match, limit = maxDetailRows) {
      if (closed) return Promise.resolve(null);
      // Deliberately uncached: a detail grid is opened by a click, not by a
      // per-tick paint, so there is no burst to absorb — and a cached answer
      // would be the wrong trade, since the rows are shown next to a master
      // row the user just expanded and expects to be current.
      return views.readMatchingRows(match, limit).catch(() => null);
    },

    readAllRows() {
      if (closed) return Promise.resolve(null);
      // The last ROOT request carries the sort and filter the user is looking
      // at; grouping is dropped inside, since an export wants leaf rows.
      return views.readAllRows(lastRootRequest, maxExportRows).catch(() => null);
    },

    async setCalcExpressions(next) {
      if (closed) return;

      let usable = next ?? {};
      // MEASURED: one bad expression takes the whole View down, not just its
      // own column — so a typo in a calculated column would blank the grid.
      // Check first and keep only what compiles.
      if (Object.keys(usable).length > 0 && typeof table.validate_expressions === 'function') {
        try {
          const report = await table.validate_expressions(usable);
          if (closed) return;
          const errors = report?.errors ?? {};
          if (Object.keys(errors).length > 0) {
            const kept: Record<string, string> = {};
            for (const [colId, source] of Object.entries(usable)) {
              if (!errors[colId]) kept[colId] = source;
              else {
                onError?.(
                  new Error(
                    `perspective: calculated column "${colId}" did not compile — ${
                      errors[colId]?.error_message ?? 'unknown error'
                    }`,
                  ),
                );
              }
            }
            usable = kept;
          }
        } catch (error) {
          // The check itself failing must not cost the user every calc column.
          onError?.(error);
        }
      }

      if (!views.setExpressions(usable)) return;
      // Same reasoning as the quick filter: AG cannot know these changed.
      api?.refreshServerSide({ purge: true });
      void pushGrandTotal();
    },

    async setQuickFilter(text) {
      if (closed) return;

      // Text columns only by default — the cost is one `match()` per column
      // per token, recharged on every Table update while the View lives, and
      // searching all 26 columns of the demo book was unusable at two tokens.
      // `string()` in the compiled expression means opting in to the rest still
      // works; see `quickFilterAllColumns`.
      const schema = await tableSchema();
      if (closed) return;
      const columns = schema
        ? Object.keys(schema).filter(
            (col) => quickFilterAllColumns || schema[col] === 'string',
          )
        : [];
      if (!views.setQuickFilter(text ?? '', columns)) return;

      // AG does not know this filter exists, so nothing invalidates its store:
      // it would keep serving the pre-search blocks and its row count. A quick
      // search changes the row count drastically, so this is the one case that
      // always purges — `refreshEveryLevel` only purges an empty store.
      api?.refreshServerSide({ purge: true });
      void pushGrandTotal();
    },

    distinctValues(colId) {
      if (closed || !colId) return Promise.resolve(null);

      const cached = values.get(colId);
      if (cached) return cached;

      const value = views
        .distinctValues(colId, maxSetFilterValues)
        .then((list) => {
          if (list === null) {
            // Not a silent truncation: the filter list stays empty and the
            // reason is stated once, rather than the user reading a partial
            // list as the whole domain.
            // eslint-disable-next-line no-console
            console.warn(
              `[perspective-grid] column "${colId}" has more than ${maxSetFilterValues} distinct values — its set filter is left empty rather than truncated.`,
            );
          }
          return list;
        })
        .catch(() => null);
      values.set(colId, value);
      return value;
    },

    async close() {
      // Edits first, and BEFORE `closed` is set: an engine is closed whenever
      // the Table is swapped or the grid unmounts, and a cell committed in the
      // last frame before that would otherwise be dropped without a trace.
      if (editTimer !== null) {
        clearTimeout(editTimer);
        editTimer = null;
      }
      editFlush = editFlush.then(writePendingEdits);
      await editFlush;

      closed = true;
      if (timer !== null) clearTimeout(timer);
      timer = null;
      api = null;
      listeners.clear();
      counts.clear();
      values.clear();
      ruleCounts.clear();
      scalars.clear();
      await views.close();
    },
  };
}
