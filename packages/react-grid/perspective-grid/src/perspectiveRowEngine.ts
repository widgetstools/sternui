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
  onEvent?(event: ViewManagerEvent): void;
  /** A block that failed. AG never retries one on its own. */
  onError?(error: unknown): void;
}

export interface PerspectiveRowEngine {
  datasource: PerspectiveDatasource;
  /** Connect the grid once it exists; pass null to disconnect. */
  setApi(api: GridApiLike | null): void;
  /** Rows in the root level, for `setRowCount`. Null until a View is built. */
  readonly rowsAtRoot: number | null;
  /** Stop re-reading on Table updates without tearing anything down. */
  setLive(live: boolean): void;
  readonly live: boolean;
  /** Refresh every level now, ignoring the throttle. */
  refreshNow(): void;
  /** Number of live Views — diagnostics. */
  readonly liveViews: number;
  close(): Promise<void>;
}

export function createPerspectiveRowEngine(
  opts: PerspectiveRowEngineOpts,
): PerspectiveRowEngine {
  const { table, keyColumn, refreshMs = 250, onEvent, onError } = opts;

  let api: GridApiLike | null = null;
  let live = true;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingUpdate = false;
  let closed = false;
  /** The most recent root-level request, so the total matches the grid shape. */
  let lastRootRequest: SsrmRequestLike = {};
  /** Set once the root level has been grouped, so row count is not published. */
  let grouped = false;

  const views = createViewManager({
    table,
    onUpdate: () => scheduleRefresh(),
    onEvent: (event) => {
      onEvent?.(event);
      if (event.type !== 'view' || event.depth !== 0) return;
      // `setRowCount` raises AG error #28 while grouping, and the error is
      // SILENT without ValidationModule. Grouped levels are small enough to
      // discover by walking off the end.
      if (!grouped && typeof event.rows === 'number') api?.setRowCount?.(event.rows);
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
    api.refreshServerSide({ purge: false });
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
    if (!live || api === null || closed) return;
    pendingUpdate = true;
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
    getView: (request) => {
      grouped = (request.rowGroupCols?.length ?? 0) > 0;
      if (!request.groupKeys?.length) lastRootRequest = request;
      return views.getView(request);
    },
    getGeneration: () => views.getGeneration(),
    getGrandTotal: grandTotalFor,
    onError: (error) => onError?.(error),
  });

  return {
    datasource,

    setApi(next: GridApiLike | null) {
      api = next;
      if (api !== null && !grouped && views.rowsAtRoot !== null) {
        api.setRowCount?.(views.rowsAtRoot);
      }
    },

    get rowsAtRoot() {
      return views.rowsAtRoot;
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
    },

    refreshNow() {
      if (closed) return;
      refreshEveryLevel();
      void pushGrandTotal();
    },

    async close() {
      closed = true;
      if (timer !== null) clearTimeout(timer);
      timer = null;
      api = null;
      await views.close();
    },
  };
}
