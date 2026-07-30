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
import type { AgFilterItem } from './viewConfig.js';
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

export function createPerspectiveRowEngine(
  opts: PerspectiveRowEngineOpts,
): PerspectiveRowEngine {
  const {
    table,
    keyColumn,
    refreshMs = 250,
    countMinIntervalMs = 1000,
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
  /** Set once the root level has been grouped, so row count is not published. */
  let grouped = false;

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
  const counts = new Map<string, { at: number; value: Promise<number | null> }>();
  /** When the Table last moved. A count taken before this is stale. */
  let countsStaleAt = 0;
  /** Bound on distinct filter models remembered — editing a pill's JSON walks
   *  through a new key per keystroke-save, and none of them recur. */
  const MAX_COUNT_KEYS = 32;

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
    onUpdate: () => {
      // The book itself can grow or shrink under the feed, so the unfiltered
      // total is re-measured on updates rather than read once at startup.
      measureBook();
      countsStaleAt = Date.now();
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
      grouped = (request.rowGroupCols?.length ?? 0) > 0;
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
      const now = Date.now();
      const cached = counts.get(key);
      // Reuse while the answer is still true (nothing has moved since it was
      // taken) OR while it is too soon to pay for another one.
      if (cached && (cached.at >= countsStaleAt || now - cached.at < countMinIntervalMs)) {
        return cached.value;
      }

      // A count must never break the grid, and `useFilterModel` reads a
      // rejection as zero — which is a wrong number, not a missing one.
      const value = views.countMatching(filterModel).catch(() => null);
      // Delete first so a re-counted key moves to the back of the Map's
      // insertion order — that order is what the cap below evicts from.
      counts.delete(key);
      counts.set(key, { at: now, value });
      if (counts.size > MAX_COUNT_KEYS) {
        counts.delete(counts.keys().next().value as string);
      }
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
      await views.close();
    },
  };
}
