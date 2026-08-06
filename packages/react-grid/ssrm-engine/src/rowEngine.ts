/**
 * The row engine a MarketsGrid surface mounts on `@starui/ssrm-engine`.
 *
 * Peer to `createPerspectiveRowEngine`, and deliberately much smaller. The
 * pieces that file spends most of its length on do not exist here:
 *
 *   - **no per-tick re-read.** Perspective's `on_update` does not say which
 *     rows moved, so a tick there is `refreshServerSide({purge:false})` over
 *     every loaded block plus a per-route cascade. This engine PUSHES the
 *     sparse patch it applied, so a tick is one transaction of exactly the
 *     cells that ticked. Everything built around that re-read — the throttle,
 *     the scroll pause, the route walk — has nothing to do here;
 *   - **no `rowCount` guesswork.** The engine holds the book, so every block
 *     answers with the exact size of its level. The Perspective rule about
 *     omitting `rowCount` (a 0 sets `isLastRowKnown` and caps the store
 *     forever) cannot arise;
 *   - **no View lifecycle.** There is no wasm value to borrow, so nothing here
 *     can be deleted while a read is in flight.
 *
 * What IS here is everything the MarketsGrid platform asks a server-side engine
 * for, and each of those was a separate bug on the Perspective path: set-filter
 * values, a quick search the grid cannot apply itself, status counts AG's own
 * panels cannot produce, a grand total that has to be created one way and
 * updated another, an export that reads the book rather than the block cache,
 * and a cell edit that has to reach the book or be painted over.
 *
 * Free of any AG Grid import, like the rest of this package: the grid is typed
 * structurally, so this is testable with three methods and no grid at all.
 */
import { createAsyncSsrmDatasource } from './asyncDatasource.js';
import { createSsrmRowPump, type SsrmRowPump, type SsrmRowPumpStats } from './rowPump.js';
import type { SsrmDatasourceLike } from './datasource.js';
import type { SsrmCalcColumnDef } from './calcAst.js';
import type { SsrmCalcDiagnostic } from './calc.js';
import type {
  SsrmFilterModel,
  SsrmGetRowsRequest,
  SsrmGetRowsResult,
  SsrmRow,
} from './types.js';

/**
 * AG's own id for the grand total row.
 *
 * The same literal `@starui/perspective-grid` exports, and it is AG's rather
 * than either package's — a transaction can only reach that row by naming it,
 * so `getRowId` has to answer this exact string for it.
 */
export const SSRM_GRAND_TOTAL_ROW_ID = 'rowGroupFooter_ROOT_NODE_ID';

/** Marks the row the engine builds as the grand total, so `getRowId` knows it. */
export const SSRM_GRAND_TOTAL_FLAG = '__grandTotal';

/** The slice of AG's `GridApi` this engine drives. */
export interface SsrmGridApiLike {
  getRowNode(id: string): { data?: unknown } | null | undefined;
  applyServerSideTransaction(transaction: { update?: unknown[]; remove?: unknown[] }): unknown;
  refreshServerSide(params: { route?: string[]; purge?: boolean }): void;
  /** Illegal while grouping — AG error #28, and SILENT without ValidationModule. */
  setRowCount?(rows: number): void;
  isDestroyed?(): boolean;
  getFirstDisplayedRowIndex?(): number;
  getLastDisplayedRowIndex?(): number;
  /** Read rather than mirrored — see {@link SsrmEngineRowEngine} on the total. */
  getGridOption?(key: string): unknown;
}

/** What the window's handle on the worker-held book must provide. */
export interface SsrmEngineClientLike {
  readonly size: number;
  getRows(request: SsrmGetRowsRequest): Promise<SsrmGetRowsResult>;
  grandTotal(request: SsrmGetRowsRequest): Promise<Record<string, unknown>>;
  countFiltered(request: SsrmGetRowsRequest): Promise<number>;
  distinctValues(field: string): Promise<unknown[] | null>;
  setQuickFilter(text: string): Promise<boolean>;
  setCalcColumns(columns: SsrmCalcColumnDef[]): Promise<boolean>;
  calcDiagnostics(): Promise<SsrmCalcDiagnostic[]>;
  setViewport(viewport: { request: SsrmGetRowsRequest; startRow: number; endRow: number } | null): Promise<void>;
  applyUpdate(rows: SsrmRow[]): Promise<{ changed: unknown[]; removed: unknown[] }>;
  subscribe(listener: (delta: { rows: SsrmRow[]; removed: unknown[]; size: number }) => void): () => void;
}

/**
 * What a status bar can honestly say here.
 *
 * Every figure comes from the WORKER. AG's own row-count panels render nothing
 * under a server row model and `forEachNode` visits only the ~100 loaded rows,
 * so a panel that counted what this window holds would report a plausible wrong
 * number — which is the failure this whole path keeps producing.
 */
export interface SsrmGridStatus {
  /** Rows in the book, ignoring every filter. */
  bookRows: number | null;
  /**
   * Rows the grid's ROOT LEVEL holds — what AG sizes its store from, and under
   * grouping the number of top-level GROUPS rather than of rows.
   *
   * For "how many rows is the user looking at" use {@link leafRows}. Reading
   * this one on the Perspective path produced "9 of 50,000" over a book grouped
   * into nine asset classes; `engine.countFiltered` exists precisely because it
   * is NOT this number.
   */
  filteredRows: number | null;
  /** Rows of the filtered book ignoring grouping. Null until measured. */
  leafRows: number | null;
  /** True when a filter or the quick search is actually narrowing the book. */
  filtered: boolean;
  /** Applying pushed writes. */
  live: boolean;
  /** Blocks that failed; AG never retries one on its own. */
  failedBlocks: number;
}

/** One committed cell edit, as the grid reports it. */
export interface SsrmCellEdit {
  key: unknown;
  field: string;
  value: unknown;
}

export interface SsrmEngineRowEngineOpts {
  client: SsrmEngineClientLike;
  /** Index column — also labels the grand total row. */
  keyColumn: string;
  /**
   * Ceiling on an export. Above it `readAllRows` answers null rather than a
   * short file: a spreadsheet that stopped early is indistinguishable from a
   * complete one once it is open.
   */
  maxExportRows?: number;
  /**
   * Floor on how often the whole-book counts behind the status bar and the
   * grand total are recomputed.
   *
   * A write clears the engine's index cache, so each of these is a fresh
   * materialise — 1.5-15 ms at 20k rows, in the same worker the block the user
   * is waiting for has to be answered by. A count nobody acts on per tick does
   * not get to compete with that.
   */
  countMinIntervalMs?: number;
  /** Rows of slack either side of the declared viewport. See the surface. */
  viewportSlackRows?: number;
  /** Block round trips, for a probe or a stats strip. */
  onBlock?(ms: number, outcome: 'ok' | 'fail', request: SsrmGetRowsRequest): void;
  onError?(error: unknown): void;
}

export interface SsrmEngineRowEngine {
  datasource: SsrmDatasourceLike;
  /** Connect the grid once it exists; pass null to disconnect. */
  setApi(api: SsrmGridApiLike | null): void;
  readonly status: SsrmGridStatus;
  subscribe(listener: (status: SsrmGridStatus) => void): () => void;
  readonly live: boolean;
  setLive(live: boolean): void;
  /** Re-read every level now. For an out-of-band change only. */
  refreshNow(): void;
  /**
   * Rows the whole book matches under an AG filter model — a saved-filter
   * pill's badge.
   *
   * The engine answers every model it can answer for a block, so unlike the
   * Perspective path there is no "cannot be translated exactly" case and this
   * never resolves null for that reason. It IS measured with the quick search
   * applied, because the quick search is engine state rather than part of the
   * request; a pill therefore reads "how many rows this filter would show",
   * which is what a badge beside a search box should mean.
   */
  countMatching(filterModel: SsrmFilterModel | null | undefined): Promise<number | null>;
  /** Every distinct value in a column, for a set filter. Null = no honest list. */
  distinctValues(colId: string): Promise<unknown[] | null>;
  /**
   * The quick search. AG's `quickFilterText` is a client-side-row-model option
   * and does nothing under `serverSide`, so the text has to be handed here.
   * Purges only when the engine says something changed.
   */
  setQuickFilter(text: string): Promise<void>;
  /** Install the calculated columns, as expression ASTs. Purges when they move. */
  setCalcColumns(columns: readonly SsrmCalcColumnDef[]): Promise<void>;
  /** Refusals, runtime failures and named columns the book does not have. */
  calcDiagnostics(): Promise<SsrmCalcDiagnostic[]>;
  /**
   * The whole filtered, sorted book — for an export. Null above the ceiling,
   * because a short file reads as a complete one.
   */
  readAllRows(): Promise<Record<string, unknown>[] | null>;
  /** A committed cell edit. Coalesced per row so one keystroke is one write. */
  applyEdit(edit: SsrmCellEdit): void;
  /** Tell the worker what this window can see, so a tick carries only those rows. */
  reportViewport(): void;
  /** Pump counters — how much the push path did. */
  pumpStats(): SsrmRowPumpStats | null;
  close(): void;
}

const EMPTY_REQUEST: SsrmGetRowsRequest = {};

/** Nothing in a filter model, or nothing left in it. */
function hasFilter(model: SsrmFilterModel | null | undefined): boolean {
  return !!model && Object.keys(model).length > 0;
}

export function createSsrmEngineRowEngine(
  opts: SsrmEngineRowEngineOpts,
): SsrmEngineRowEngine {
  const { client, keyColumn } = opts;
  const maxExportRows = opts.maxExportRows ?? 200_000;
  const countMinIntervalMs = opts.countMinIntervalMs ?? 500;
  const viewportSlack = opts.viewportSlackRows ?? 50;

  let api: SsrmGridApiLike | null = null;
  let closed = false;
  let live = true;
  let pump: SsrmRowPump | null = null;
  let unsubscribeDelta: (() => void) | null = null;

  /**
   * The shape AG is currently pulling with, read off the requests the
   * datasource actually SERVED.
   *
   * Not reconstructed from the grid's column state: the served shape is what
   * the worker's index is keyed on, and a viewport or a count built from a
   * different one names positions in an index nobody is reading.
   */
  let lastRequest: SsrmGetRowsRequest = EMPTY_REQUEST;
  /** The last ROOT request — the one a grand total belongs to. */
  let lastRootRequest: SsrmGetRowsRequest = EMPTY_REQUEST;
  let quickFilterText = '';

  let bookRows: number | null = client.size;
  let filteredRows: number | null = null;
  let leafRows: number | null = null;
  let failedBlocks = 0;

  const listeners = new Set<(status: SsrmGridStatus) => void>();

  function currentStatus(): SsrmGridStatus {
    return {
      bookRows,
      filteredRows,
      leafRows,
      filtered: hasFilter(lastRequest.filterModel) || quickFilterText !== '',
      live,
      failedBlocks,
    };
  }

  function announce(): void {
    if (listeners.size === 0) return;
    const status = currentStatus();
    for (const listener of listeners) listener(status);
  }

  /** True while the request is asking for a level below the root. */
  function grouped(request: SsrmGetRowsRequest): boolean {
    return (request.rowGroupCols?.length ?? 0) > 0;
  }

  /**
   * Whole-book questions, coalesced onto one trailing timer.
   *
   * Both of them clear-and-rebuild an index in the worker, and both are asked
   * again by every pushed tick. Running them per tick would put a 1.5-15 ms
   * materialise in front of the block the user is scrolling towards, five times
   * a second, for figures nobody reads that fast.
   */
  let countTimer: ReturnType<typeof setTimeout> | null = null;
  let countPending = false;
  function scheduleWholeBookReads(): void {
    if (closed || countTimer !== null) {
      countPending = countTimer !== null;
      return;
    }
    countTimer = setTimeout(() => {
      countTimer = null;
      const again = countPending;
      countPending = false;
      void wholeBookReads();
      if (again) scheduleWholeBookReads();
    }, countMinIntervalMs);
    (countTimer as unknown as { unref?(): void }).unref?.();
  }

  /**
   * ONE whole-book count per tick, feeding both the status bar and the store.
   *
   * The status bar's `leafRows` and the store's row count are the SAME number —
   * `countFiltered` strips `rowGroupCols`/`groupKeys` itself, so both were
   * issuing an identical RPC and the worker was materialising the index twice
   * for one figure. It is a synchronous engine behind a serialized port, so the
   * second pass sits in front of the block the user is scrolling towards.
   *
   * MEASURED: two passes per tick against one took AG's end-to-end `getRows`
   * from a 2.8-3.0 ms median on the plain control to **6.6-12.2 ms** on the
   * MarketsGrid surface, with a 35-214 ms p90. Asking twice for one number was
   * most of the difference the platform appeared to cost.
   */
  async function wholeBookReads(): Promise<void> {
    if (closed) return;
    await Promise.all([measureLeafRows(), pushGrandTotal()]);
    announce();
  }

  /**
   * `leafRows`, and — while ungrouped — the store's row count with it.
   *
   * `countFiltered` is NOT a grouped level's `rowCount`: that is the number of
   * top-level GROUPS, and reading it in a status bar is what produced "9 of
   * 50,000".
   *
   * Skipped entirely when nothing is listening AND there is no api to size: a
   * grid with no status bar should not pay a whole-book pass for a figure
   * nothing reads.
   */
  async function measureLeafRows(): Promise<void> {
    if (listeners.size === 0 && api === null) return;
    try {
      const next = await client.countFiltered(lastRequest);
      if (closed) return;
      leafRows = next;
      bookRows = client.size;
      syncRowCount(next);
    } catch (error) {
      opts.onError?.(error);
    }
  }

  /**
   * Keep the grand total moving.
   *
   * `grandTotalData` on a block response CREATES that row and does NOT update
   * it — MEASURED on the Perspective path across five refreshes, where five
   * fresh totals left the row showing the first. The documented way to move an
   * existing one is a transaction whose row id is the grand total's, so both
   * paths are needed and they answer different moments.
   *
   * Free when there is no total row: the lookup below is the first thing it
   * does, and a grid without `grandTotalRow` never gets past it.
   */
  async function pushGrandTotal(): Promise<void> {
    if (api === null || closed) return;
    if (!api.getRowNode(SSRM_GRAND_TOTAL_ROW_ID)) return;
    const request = lastRootRequest;
    const total = await grandTotalFor(request);
    if (
      total &&
      api !== null &&
      !closed &&
      request === lastRootRequest &&
      api.getRowNode(SSRM_GRAND_TOTAL_ROW_ID)
    ) {
      api.applyServerSideTransaction({ update: [total] });
    }
  }

  /**
   * Does this grid HAVE a totals row?
   *
   * Asked of the grid rather than mirrored from a prop, so it cannot drift from
   * what is on screen — and asked at all because a grand total is a whole-book
   * materialise and aggregate, awaited before the ROOT block settles.
   *
   * MEASURED on the lab's 20,000 x 126 book, which has no totals row: fetching
   * it anyway took AG's end-to-end `getRows` from a 2.6-3.2 ms median to a
   * **69 ms p90 and a 79 ms max** — a whole-book aggregate on every root block,
   * for a row that does not exist. Before this check the platform looked like it
   * cost the read path an order of magnitude; it does not, and that was the
   * measurement worth taking.
   */
  function wantsGrandTotal(): boolean {
    return Boolean(api?.getGridOption?.('grandTotalRow'));
  }

  async function grandTotalFor(
    request: SsrmGetRowsRequest,
  ): Promise<Record<string, unknown> | null> {
    if (!wantsGrandTotal()) return null;
    try {
      const total = await client.grandTotal(request);
      // The caption goes on the KEY column: it is the one AG never hides, where
      // a grouped column disappears and the auto-group column renders nothing
      // for a total row.
      return { ...total, [keyColumn]: 'GRAND TOTAL', [SSRM_GRAND_TOTAL_FLAG]: true };
    } catch (error) {
      opts.onError?.(error);
      return null;
    }
  }

  /**
   * A row inserted or removed outside every viewport still moves the book, and
   * nothing re-reads a block to tell AG so.
   *
   * **Never while grouping.** `setRowCount` raises AG error #28 whenever a
   * row-group column exists, and without `ValidationModule` registered that
   * error is SILENT — so the guard is the only thing standing between this and
   * a store that stops responding for reasons nothing reports.
   */
  function syncRowCount(rows: number): void {
    if (api === null || closed || grouped(lastRequest)) return;
    if (rows === filteredRows) return;
    filteredRows = rows;
    api.setRowCount?.(rows);
  }

  /**
   * The AG boundary, with the two things a host has to add around it: the
   * served request shape, and the grand total a root block CREATES.
   */
  const inner = createAsyncSsrmDatasource(client, {
    ...(opts.onError ? { onError: (error: unknown) => opts.onError?.(error) } : {}),
    onBlock: (ms, outcome, request) => {
      lastRequest = request;
      if ((request.groupKeys?.length ?? 0) === 0) lastRootRequest = request;
      if (outcome === 'fail') failedBlocks += 1;
      opts.onBlock?.(ms, outcome, request);
    },
  });

  const datasource: SsrmDatasourceLike = {
    getRows(params) {
      const request = params.request;
      const isRoot = (request.groupKeys?.length ?? 0) === 0;
      inner.getRows({
        ...params,
        success: (result) => {
          // The root level of an UNGROUPED request is the only level whose row
          // count is a count of rows; grouped, it is the number of top-level
          // groups, and calling that "rows" is what produced "9 of 50,000".
          if (isRoot && !grouped(request)) filteredRows = result.rowCount;
          if (!isRoot || closed || !wantsGrandTotal()) {
            params.success(result);
            announce();
            return;
          }
          // A missing total must never cost the block — rule 1. Either way the
          // rows settle exactly once.
          void grandTotalFor(request).then(
            (total) => {
              params.success(total ? { ...result, grandTotalData: total } : result);
              announce();
              scheduleWholeBookReads();
            },
            () => {
              params.success(result);
              announce();
            },
          );
        },
        fail: params.fail,
      });
    },
  };

  /**
   * The live path: the worker PUSHES what changed, this window applies it.
   *
   * Through a pump rather than straight into `applyServerSideTransaction` — it
   * conflates by row id so several frames touching one row are one transaction,
   * and spends at most `sliceBudgetMs` per flush so a burst becomes latency
   * instead of a dropped frame.
   */
  function attachPump(): void {
    detachPump();
    pump = createSsrmRowPump(
      {
        getRowNode: (id) => api?.getRowNode(id) ?? null,
        applyServerSideTransaction: (tx) => api?.applyServerSideTransaction(tx) ?? null,
        isDestroyed: () => api === null || api.isDestroyed?.() === true,
      },
      { keyField: keyColumn, sliceBudgetMs: 4 },
    );
    unsubscribeDelta = client.subscribe((delta) => {
      if (!live) return;
      pump?.push(delta);
      bookRows = delta.size;
      // A write moves the counts and the total, and neither is carried by the
      // patch. Coalesced rather than asked per frame.
      scheduleWholeBookReads();
    });
  }

  function detachPump(): void {
    unsubscribeDelta?.();
    unsubscribeDelta = null;
    pump?.dispose();
    pump = null;
  }

  /**
   * Committed edits, coalesced per row.
   *
   * A cell editor writes one field at a time and AG commits each on blur, so
   * three edits to one row would otherwise be three worker round trips and
   * three broadcasts to every peer window. The flush is a microtask: a single
   * edit still lands in the same turn the user finished it.
   */
  const pendingEdits = new Map<unknown, SsrmRow>();
  let editFlushScheduled = false;
  function flushEdits(): void {
    editFlushScheduled = false;
    if (closed || pendingEdits.size === 0) return;
    const rows = [...pendingEdits.values()];
    pendingEdits.clear();
    void client.applyUpdate(rows).catch((error: unknown) => opts.onError?.(error));
  }

  /** Viewport reporting — see `setViewport`'s contract on the client. */
  let lastViewport = '';
  function reportViewport(): void {
    if (api === null || closed || api.isDestroyed?.() === true) return;
    const first = api.getFirstDisplayedRowIndex?.();
    const last = api.getLastDisplayedRowIndex?.();
    if (typeof first !== 'number' || typeof last !== 'number' || first < 0) return;
    const viewport = {
      // Only the SHAPE. Carrying the block's own `startRow`/`endRow` would put
      // a stale block range on the wire beside the live one.
      request: { ...lastRequest, startRow: 0, endRow: 0 },
      startRow: Math.max(0, first - viewportSlack),
      endRow: last + 1 + viewportSlack,
    };
    const signature = JSON.stringify(viewport);
    if (signature === lastViewport) return;
    lastViewport = signature;
    void client.setViewport(viewport).catch(() => {
      // A viewport that did not land costs this window a narrower push, not its
      // updates: the worker's default is to send everything.
      lastViewport = '';
    });
  }

  function purge(): void {
    if (api === null || closed) return;
    api.refreshServerSide({ purge: true });
  }

  return {
    datasource,

    setApi(next) {
      api = next;
      if (next === null) {
        detachPump();
        return;
      }
      attachPump();
      announce();
    },

    get status() {
      return currentStatus();
    },

    subscribe(listener) {
      listeners.add(listener);
      // Measured on first interest rather than at construction: a grid with no
      // status bar should not pay for a figure nothing reads.
      void wholeBookReads();
      listener(currentStatus());
      return () => {
        listeners.delete(listener);
      };
    },

    get live() {
      return live;
    },

    setLive(next) {
      if (next === live) return;
      live = next;
      announce();
    },

    refreshNow() {
      api?.refreshServerSide({ purge: false });
      scheduleWholeBookReads();
    },

    async countMatching(filterModel) {
      try {
        return await client.countFiltered(
          hasFilter(filterModel) ? { filterModel: filterModel as SsrmFilterModel } : {},
        );
      } catch (error) {
        opts.onError?.(error);
        return null;
      }
    },

    async distinctValues(colId) {
      try {
        return await client.distinctValues(colId);
      } catch (error) {
        opts.onError?.(error);
        return null;
      }
    },

    async setQuickFilter(text) {
      const next = (text ?? '').trim();
      try {
        // The ENGINE decides whether anything changed, and a caller only purges
        // when it did — a purge that was not needed re-reads every loaded block
        // and, since a purge fires `modelUpdated`, the bridge that called this
        // would hear its own echo.
        const changed = await client.setQuickFilter(next);
        quickFilterText = next;
        if (!changed) return;
        purge();
        scheduleWholeBookReads();
      } catch (error) {
        opts.onError?.(error);
      }
    },

    async setCalcColumns(columns) {
      try {
        const changed = await client.setCalcColumns([...columns]);
        if (!changed) return;
        // An index materialised under the previous expressions is a permutation
        // of the book by values that no longer exist, and AG's request carries
        // no calculated columns at all — so nothing else would invalidate it.
        purge();
        scheduleWholeBookReads();
      } catch (error) {
        opts.onError?.(error);
      }
    },

    calcDiagnostics() {
      return client.calcDiagnostics().catch((error: unknown) => {
        opts.onError?.(error);
        return [];
      });
    },

    async readAllRows() {
      // Flat, filtered and sorted: an export is the rows the user is looking at
      // in the order they are looking at them, not the group tree.
      const flat: SsrmGetRowsRequest = {
        ...(lastRequest.filterModel ? { filterModel: lastRequest.filterModel } : {}),
        ...(lastRequest.sortModel ? { sortModel: lastRequest.sortModel } : {}),
      };
      try {
        const rows = await client.countFiltered(flat);
        // REFUSE rather than truncate. A spreadsheet that stopped early is
        // indistinguishable from a complete one once it is open, and there is
        // no "there is more" affordance in a file.
        if (rows > maxExportRows) return null;
        const result = await client.getRows({ ...flat, startRow: 0, endRow: rows });
        return result.rowData;
      } catch (error) {
        opts.onError?.(error);
        return null;
      }
    },

    applyEdit(edit) {
      if (closed || edit.key === undefined || edit.key === null) return;
      const held = pendingEdits.get(edit.key);
      if (held === undefined) {
        pendingEdits.set(edit.key, { [keyColumn]: edit.key, [edit.field]: edit.value });
      } else {
        held[edit.field] = edit.value;
      }
      if (editFlushScheduled) return;
      editFlushScheduled = true;
      queueMicrotask(flushEdits);
    },

    reportViewport,

    pumpStats: () => pump?.stats() ?? null,

    close() {
      closed = true;
      detachPump();
      if (countTimer !== null) clearTimeout(countTimer);
      countTimer = null;
      listeners.clear();
      pendingEdits.clear();
      api = null;
    },
  };
}
