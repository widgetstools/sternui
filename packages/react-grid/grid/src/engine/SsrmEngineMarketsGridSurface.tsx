/**
 * `@starui/ssrm-engine` presentation surface — peer to
 * {@link PerspectiveMarketsGridSurface}, and the same shape on purpose.
 *
 * AG Grid stays the surface; only the row supply changes. The book lives once
 * in a SharedWorker and this window reads the blocks its viewport asks for, so
 * nothing here ever holds more than a few hundred rows.
 *
 * **Everything with a rule behind it belongs to `createSsrmEngineRowEngine`**,
 * in `@starui/ssrm-engine`, exactly as the Perspective surface pushes its rules
 * into `createPerspectiveRowEngine`. This file is the mount, plus the four
 * bridges that can only be built where AG's API is: the quick search (AG's own
 * option is client-side only), the set-filter value lists (AG builds them from
 * the rows the client holds, which is one block), the committed cell edit, and
 * the transaction applier the editing toolbars hand their patches to.
 *
 * Every one of those four was a SEPARATE bug on the Perspective path, found
 * only by driving the real toolbars — so they are here from the start, wired to
 * the same shared modules that path uses rather than to copies.
 */
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AgGridReact } from 'ag-grid-react';
import type {
  CellValueChangedEvent,
  GetContextMenuItems,
  GetRowIdParams,
  GridApi,
  GridReadyEvent,
  Theme,
} from 'ag-grid-community';
import type { RefObject } from 'react';
/**
 * The window parses; the worker evaluates. One language, one parser — the same
 * decision calculated columns took, and for the same two reasons: a compiled
 * closure is not structured-cloneable, and a second parser is a second thing to
 * keep in step with the customizer that authors these expressions.
 */
import { parse, tokenize } from '@starui/engine';
import {
  createSsrmEngineRowEngine,
  makeSsrmGetRowId,
  SSRM_GRAND_TOTAL_FLAG,
  SSRM_TREE_GROUP,
  SSRM_TREE_KEY,
  type SsrmCalcColumnDef,
  type SsrmCalcDiagnostic,
  type SsrmEngineClientLike,
  type SsrmEngineRowEngine,
} from '@starui/ssrm-engine';
/**
 * Shared with the Perspective surface, not copied.
 *
 * `toPerspectiveEdits` maps a `GridDataTransaction` to `{key, field, value}`
 * edits, dropping the key column and the grand-total row and diffing against
 * the node the grid holds. Nothing in it is Perspective-specific — the
 * grand-total flag is the same literal on both paths — and the reasoning it
 * encodes (why the key is never rewritten, why the whole row must not be
 * written) is exactly the reasoning this surface would otherwise restate. The
 * name is the only thing that does not travel, so it is aliased here.
 */
import { toPerspectiveEdits as toGridCellEdits } from '@starui/perspective-grid';
import { TRAFFIC_LIGHT_AGG_FUNCS } from './ssrmTrafficLightAgg.js';
import { useOptionalGridPlatform } from '../customizer/hooks/GridProvider.js';
import { buildStreamSafeComponents } from '../widget/buildStreamSafeComponents.js';
import { stripServerSurfaceManagedGridOptions } from '../widget/gridSurfaceOptions.js';
import {
  createServerEngineHolder,
  type ServerEngineHolder,
  type ServerGridContext,
} from './serverEngineHolder.js';
import { ServerStatusPanel } from './ServerStatusPanel.js';
import {
  SERVER_STATUS_PANEL_COMPONENTS,
  withServerStatusPanels,
} from './ServerStatusPanels.js';
import { withServerSetFilterValues } from './serverSetFilterValues.js';
import { publishSsrmTransactionDelta } from './ssrmRowChangeBridge.js';
import { SkeletonLoadingCellRenderer } from './serverLoadingCellRenderer.js';

const NO_HOST_OVERRIDES: ReadonlySet<string> = new Set<string>();

/**
 * How often this window tells the worker what it can see.
 *
 * On a timer rather than on a scroll event because the two things that move a
 * viewport — scrolling and a query change — do not share an event, and the
 * report is deduplicated against its own last value, so a still grid costs one
 * comparison per tick and no RPC.
 */
const VIEWPORT_REPORT_MS = 250;

export interface SsrmEngineMarketsGridSurfaceHandle {
  getApi(): GridApi | null;
  /** Re-read every level now — used after an out-of-band change. */
  refresh(): void;
  /** Pause/resume applying pushed writes. */
  setLive(live: boolean): void;
  /** What the engine made of the installed expressions. Empty is the good case. */
  calcDiagnostics(): Promise<SsrmCalcDiagnostic[]>;
  /** Pump counters — how much the push path did. Null before the grid exists. */
  pumpStats(): unknown;
  /**
   * The grouped live path's counters — a DIFFERENT mechanism from the pump's.
   * Under grouping the pump is fed nothing and this is what moves the grid.
   */
  groupRefreshStats(): unknown;
}

export interface SsrmEngineMarketsGridSurfaceProps {
  /**
   * The window's handle on the worker-held book. Opened by the host, never
   * built here — WHICH worker holds it is the host's business (a generated book
   * lives in the app's own worker, a provider-fed one in the data-services
   * worker where its rows already are).
   */
  client: SsrmEngineClientLike;
  /** Index column — also labels the grand total row. */
  keyColumn: string;
  columnDefs: unknown[];
  height?: string | number;
  theme?: Theme;
  rowHeight?: number;
  headerHeight?: number;
  sideBar?: unknown;
  statusBar?: unknown;
  defaultColDef?: unknown;
  includeAllStreamSafeFilters?: boolean;
  onGridReady?: (event: GridReadyEvent) => void;
  grandTotalRow?: boolean | 'top' | 'bottom' | 'pinnedTop' | 'pinnedBottom';
  groupTotalRow?: 'top' | 'bottom';
  onError?: (error: unknown) => void;
  /**
   * Calculated columns as StarUI expression ASTs, keyed by column id.
   *
   * The AST and nothing else crosses the port: it is plain data, so it
   * structured-clones, where a compiled closure could not cross at all. The
   * engine computes the value where the BOOK is, which is what lets a
   * calculated column be sorted, filtered, grouped and aggregated on rather
   * than only displayed — a column resolved in this window could do none of
   * those, because this window holds only the blocks in view.
   */
  calcColumns?: readonly SsrmCalcColumnDef[];
  /** Ceiling on an export. Above it the export REFUSES rather than truncating. */
  maxExportRows?: number;
  /**
   * Module-pipeline grid options, same object the CSRM surface receives.
   * Spread FIRST so the explicit props below still win — everything a user
   * sets in the customizer reaches this surface too, minus the row-supply
   * mechanics listed in `SERVER_SURFACE_OWNED_KEYS`.
   */
  gridOptions?: Record<string, unknown>;
  /** Keys the host passed explicitly; the pipeline must not fight them. */
  hostOverrideKeys?: ReadonlySet<string>;
  /** The AgGridReact instance ref the host owns. */
  gridRef?: RefObject<AgGridReact | null>;
  /** Cell right-click menu builder. Built with `useCallback` in the host. */
  getContextMenuItems?: GetContextMenuItems;
  /** Profile / grid-state capture runs here; without it a layout is lost. */
  onGridPreDestroyed?: () => void;
  /** Block round trips — for a probe or a stats strip. */
  onBlock?: (ms: number, outcome: 'ok' | 'fail', request: unknown) => void;
  /**
   * TREE DATA — a self-referencing hierarchy, outermost field first.
   *
   * AG's SSRM tree mode sends no `rowGroupCols` at all and reads the hierarchy
   * off the DATA, through `isServerSideGroup` / `getServerSideGroupKey`. Nothing
   * in a book says which rows are parents, so the engine stamps the two markers
   * this surface then reads back.
   *
   * **New MarketsGrid API, not restored parity** — the CSRM surface exposes
   * neither this nor `masterDetail` on any path. They are `CustomSSRMGrid`
   * props, and that surface was discarded as buggy.
   */
  treeFields?: readonly string[];
  /**
   * MASTER/DETAIL — an expandable child grid per row, read from the same
   * worker-held book.
   */
  masterDetail?: SsrmMasterDetail;
}

export interface SsrmMasterDetail {
  /** Column defs for the detail grid. */
  detailColumnDefs: unknown[];
  /**
   * `{ detailField: masterField }` — the equality the children are found by.
   *
   * An empty map answers NO rows rather than the whole book: a master row with
   * no match fields has no children by definition, and 50,000 rows in a detail
   * panel is a hung tab rather than a degraded answer.
   */
  matchFields?: Record<string, string>;
  /** Ceiling on the children of one master row. */
  detailLimit?: number;
  /** Override the read entirely — for a detail set that is not a book query. */
  getDetailRowData?(master: Record<string, unknown>): Promise<Record<string, unknown>[]>;
  /** Which rows expand. Every leaf row by default. */
  isRowMaster?(row: Record<string, unknown>): boolean;
}

export const SsrmEngineMarketsGridSurface = forwardRef<
  SsrmEngineMarketsGridSurfaceHandle,
  SsrmEngineMarketsGridSurfaceProps
>(function SsrmEngineMarketsGridSurface(props, ref) {
  const { client, keyColumn, onError } = props;
  const apiRef = useRef<GridApi | null>(null);
  const [engine, setEngine] = useState<SsrmEngineRowEngine | null>(null);

  const onBlockRef = useRef(props.onBlock);
  onBlockRef.current = props.onBlock;

  // One engine per client. Rebuilt when the client changes (a provider restart
  // hands over a new book) and always closed — it holds a pump, a subscription
  // and a coalescing timer.
  const platform = useOptionalGridPlatform();
  const platformRef = useRef(platform);
  platformRef.current = platform;

  const treeFieldsKey = (props.treeFields ?? []).join(' ');

  useEffect(() => {
    const next = createSsrmEngineRowEngine({
      client,
      keyColumn,
      ...(props.maxExportRows === undefined ? {} : { maxExportRows: props.maxExportRows }),
      ...(onError === undefined ? {} : { onError }),
      onBlock: (ms, outcome, request) => onBlockRef.current?.(ms, outcome, request),
      /**
       * Put every pushed transaction on the platform's shared row-change
       * signal, the way the CSRM path's `asyncTransactionsFlushed` does.
       *
       * MEASURED before this existed: that signal fired 30 times in 5 s on this
       * surface and **every one was a `full` change** — the pump writes through
       * `applyServerSideTransaction`, which raises no `asyncTransactionsFlushed`,
       * so `RowChangeBus` only ever saw `modelUpdated`. Everything keyed on
       * WHICH cells moved was therefore inert here: conditional styling's timed
       * activations (which is where a tick FLASH lives), the alerts delta path,
       * and the incremental saved-filter counts. Not a grouping problem and not
       * new — it was true of this surface from the day it was built.
       */
      onTransaction: (tx) =>
        publishSsrmTransactionDelta(platformRef.current?.rows, tx, keyColumn),
      // Flattened to a string for the dep list, so a caller building the array
      // inline does not rebuild the engine — and with it the pump, the
      // subscription and every coalescing timer — on every render.
      ...(treeFieldsKey ? { treeFields: treeFieldsKey.split(' ') } : {}),
    });
    if (apiRef.current) next.setApi(apiRef.current as never);
    setEngine(next);
    return () => next.close();
  }, [client, keyColumn, props.maxExportRows, onError, treeFieldsKey]);

  useImperativeHandle(
    ref,
    () => ({
      getApi: () => apiRef.current,
      refresh: () => engine?.refreshNow(),
      setLive: (live: boolean) => engine?.setLive(live),
      calcDiagnostics: () => engine?.calcDiagnostics() ?? Promise.resolve([]),
      pumpStats: () => engine?.pumpStats() ?? null,
      groupRefreshStats: () => engine?.groupRefreshStats() ?? null,
    }),
    [engine],
  );

  /**
   * The engine reaches the status panels, the export and the alerts rescan
   * through the grid `context`, and the holder is what makes that survive an
   * engine swap — AG reads `context` when it CREATES the grid and hands that
   * exact value to every panel it instantiates.
   */
  const holderRef = useRef<ServerEngineHolder<SsrmEngineRowEngine> | null>(null);
  holderRef.current ??= createServerEngineHolder<SsrmEngineRowEngine>();
  // In a layout effect, not during render: `set` notifies its subscribers
  // synchronously and one of them is a status panel, so updating it mid-render
  // is the "cannot update a component while rendering another" warning.
  useLayoutEffect(() => {
    holderRef.current!.set(engine);
  }, [engine]);

  /**
   * Built once and never rebuilt. Everything engine-dependent reads through the
   * holder at CALL time rather than closing over an engine that will be
   * swapped out.
   *
   * ## The whole-book expression seam
   *
   * `ssrmCountMatchingExpression` and `ssrmAggregateScalar` are what
   * `headerPainter` asks, and until session 9 this surface omitted both — so on
   * the surface that SHIPS the header painter was not degraded but DEAD, and
   * silently, because a rule that lights no header looks exactly like a rule
   * whose condition is false. (`forEachNodeAfterFilter`, its client-side
   * original, visits **zero** nodes under a server row model.)
   *
   * Two things about the contract are not obvious and both are declared rather
   * than inferred:
   *
   *   - the dialect is **StarUI source**, not Perspective's. It is parsed HERE,
   *     with `@starui/engine`'s `tokenize`/`parse` — the same tree calculated
   *     columns already send this engine — because a closure is not
   *     structured-cloneable and there must not be a second parser;
   *   - the AGGREGATE measures the **whole book**, dropping the grid's filter
   *     model and quick filter, while the COUNT follows them. That asymmetry is
   *     deliberate and inherited: an "above average" threshold is a property of
   *     the book (Excel's convention), and a header must not light for rows the
   *     user has filtered away. Its known cost is that such a rule can disagree
   *     with the average in the totals row on the same screen.
   */
  const context = useMemo<ServerGridContext>(() => {
    const holder = holderRef.current!;
    return {
      serverEngineHolder: holder,
      ssrmCountMatching: (filterModel) =>
        holder.get()?.countMatching(filterModel as never) ?? Promise.resolve(null),
      ssrmExpressionDialect: 'starui',
      ssrmCountMatchingExpression: async (source) => {
        const engine = holder.get();
        if (!engine) return null;
        let ast: SsrmCalcColumnDef['ast'];
        try {
          ast = parse(tokenize(source)) as SsrmCalcColumnDef['ast'];
        } catch {
          // A rule that does not parse is not a rule the worker can be asked.
          // Null routes it back to the client scan rather than unlighting it.
          return null;
        }
        return engine.countMatchingExpression(ast);
      },
      ssrmAggregateScalar: (colId, aggregate) =>
        holder.get()?.aggregateScalar(colId, aggregate as never) ?? Promise.resolve(null),
      // Read back so the AUTHOR of a calculated column can be told why it came
      // back blank. `[]` while no engine is attached — an empty list renders
      // nothing, which is the same thing the panel does when it has no seam at
      // all, and neither is a claim that the expression is fine.
      ssrmCalcDiagnostics: async () => [...((await holder.get()?.calcDiagnostics()) ?? [])],
      get ssrmConfigured() {
        return holder.get() !== null;
      },
    };
  }, []);

  /**
   * Publish the calculated columns, and purge only if the engine says they
   * moved.
   *
   * Keyed on the SERIALISED defs rather than on the array identity: a host
   * building the list from customizer state produces a fresh array every
   * render, and re-publishing on every render would purge the grid on every
   * render.
   */
  const calcKey = useMemo(() => JSON.stringify(props.calcColumns ?? []), [props.calcColumns]);
  useEffect(() => {
    if (!engine) return;
    void engine.setCalcColumns(JSON.parse(calcKey) as SsrmCalcColumnDef[]);
  }, [engine, calcKey]);

  /**
   * Bridge the quick search into the engine.
   *
   * `QuickSearch` pushes the text with `setGridOption('quickFilterText')`, which
   * AG implements for the CLIENT-side row model only — under `serverSide` it is
   * stored and otherwise ignored, so the box does nothing at all on this path.
   *
   * MEASURED on the Perspective surface: changing that option under
   * `serverSide` fires **`modelUpdated` only** — not `filterChanged`, which is
   * the event you would reach for. Since `modelUpdated` also fires on every
   * block load, the handler compares against the last value it acted on. That
   * comparison is load-bearing rather than an optimisation: the engine reacts by
   * purging, the purge fires `modelUpdated` again, and without it this loops.
   *
   * **`modelUpdated` is not enough on its own, and this is MEASURED on this
   * surface rather than inherited.** With a search term that matches nothing,
   * clearing the box fires NOTHING — not `modelUpdated`, not `filterChanged`,
   * not `storeUpdated`, not `gridOptionChanged`. AG has no rows and no store to
   * update, so no event happens, and the search box becomes unclearable from
   * exactly the state a user most needs to escape: an empty grid. (Verified by
   * subscribing to all four and setting the option: ten events on the way in,
   * zero on the way out.)
   *
   * So the reconciliation ALSO runs on the same timer that reports the viewport
   * — the second mechanism this surface needs because AG has no event for it.
   * Both call the one function below, so there is one comparison and one
   * definition of "the text changed"; the event is the fast path, the timer is
   * the one that works when there is nothing on screen.
   */
  const lastQuickFilter = useRef('');
  const applyQuickFilter = useCallback((api: GridApi | null) => {
    if (!api || api.isDestroyed?.()) return;
    const next = (api.getGridOption('quickFilterText') ?? '') as string;
    if (next === lastQuickFilter.current) return;
    lastQuickFilter.current = next;
    void holderRef.current?.get()?.setQuickFilter(next);
  }, []);
  const onModelUpdated = useCallback(
    (event: { api: GridApi }) => applyQuickFilter(event.api),
    [applyQuickFilter],
  );

  /**
   * Set filters get their checkbox list from the ENGINE, not from the rows this
   * window holds.
   *
   * It holds only the loaded blocks — one page of a 20,000-row book — so
   * without this every column filter menu is empty. Worse than empty: a bare
   * `filter: true` resolves to `agSetColumnFilter` under AG Enterprise, and a
   * set filter handed no values at all throws `r.values is not iterable`.
   *
   * `distinctValues` answers a CALCULATED column too (it scans, since an
   * expression has no dictionary) and REFUSES above its ceiling rather than
   * truncating — a partial list renders as the whole domain and its Select All
   * silently excludes the rest.
   */
  const columnDefs = useMemo(
    () =>
      withServerSetFilterValues(props.columnDefs, (colId) =>
        holderRef.current?.get()?.distinctValues(colId) ?? Promise.resolve(null),
      ),
    [props.columnDefs],
  );

  const streamSafeComponents = useMemo(
    () =>
      buildStreamSafeComponents(
        props.columnDefs as Parameters<typeof buildStreamSafeComponents>[0],
        props.includeAllStreamSafeFilters ?? true,
      ),
    [props.columnDefs, props.includeAllStreamSafeFilters],
  );

  const components = useMemo(
    () => ({
      ...streamSafeComponents,
      serverStatusPanel: ServerStatusPanel,
      ...SERVER_STATUS_PANEL_COMPONENTS,
    }),
    [streamSafeComponents],
  );

  /**
   * ONE definition of a row id, imported from the package that owns it.
   *
   * This file used to carry its own — group path from AG's `level` /
   * `parentKeys` — while `@starui/ssrm-engine`'s `makeSsrmGetRowId` had a
   * different one, and the fuzz that guards the push path tested the second.
   * Two spellings of an id let a defect that dropped 100% of pushed rows under
   * grouping through 260 adversarial frames. `makeSsrmGetRowId` IS this
   * definition now, and the pump and the fuzz are bound by the same function.
   */
  const getRowId = useMemo(
    () => makeSsrmGetRowId(keyColumn) as unknown as (params: GetRowIdParams) => string,
    [keyColumn],
  );

  /**
   * Committed edits go to the BOOK, or they do not survive.
   *
   * Under the server row model `cellValueChanged` still fires, but AG's write
   * lands only on the block-cache row node. The next re-read of that block
   * paints the old value back over it — an edit that appears to take and
   * silently reverts. Routing it through the engine also propagates it to every
   * peer window, because they are all reading the one book this writes to.
   *
   * And it is what brings the author's own CALCULATED cells back: the worker
   * skips the port that caused a write, so until session 6 a window that edited
   * saw its derived columns stay stale until the block was re-read. The host
   * now sends the author a calc-only echo, and the pump merges it in.
   *
   * Registered with `addEventListener` rather than the `onCellValueChanged`
   * grid option so it COMPOSES: alerts, conditional styling, data-change
   * history and smart edit all attach to the same event, and an option set here
   * would silently take the slot from a pipeline-supplied one.
   */
  const keyColumnRef = useRef(keyColumn);
  keyColumnRef.current = keyColumn;
  const onCellValueChanged = useCallback((event: CellValueChangedEvent) => {
    const field = event.colDef?.field;
    const row = event.data as Record<string, unknown> | undefined;
    if (!field || !row) return;
    // Neither the grand total nor a group row is a row of the book; both carry
    // aggregates, and upserting one would invent an index value.
    if (row[SSRM_GRAND_TOTAL_FLAG] || event.node?.group) return;
    holderRef.current
      ?.get()
      ?.applyEdit({ key: row[keyColumnRef.current], field, value: event.newValue });
  }, []);

  /**
   * The OTHER write path: smart edit, bulk update and history undo/redo.
   *
   * They never touch the cell editor, so `cellValueChanged` above does not see
   * them — they build a patch list and hand it to
   * `GridPlatform.applyDataTransaction`, which the host routes to
   * `GridApi.applyTransactionAsync`. Under the server row model that is not a
   * write path, so every one of them was a silent no-op on the Perspective
   * surface until the engine applier landed. Registering the ENGINE applier
   * takes precedence over the host's, deliberately explicitly: this surface is
   * a CHILD of the host and its effect runs first, so ordering alone would give
   * the wrong answer.
   */
  useEffect(() => {
    if (!platform) return;
    platform.setEngineDataTransactionApplier((tx) => {
      const live = holderRef.current?.get();
      if (!live) return;
      const edits = toGridCellEdits(tx, keyColumnRef.current, {
        // Diff against the node so only the fields the module actually changed
        // are written — writing the whole row would trample the live feed's own
        // cells for every peer window.
        currentRow: (key) =>
          apiRef.current?.getRowNode(String(key))?.data as Record<string, unknown> | undefined,
      });
      for (const edit of edits) live.applyEdit(edit);
    });
    return () => platform.setEngineDataTransactionApplier(null);
  }, [platform]);

  /**
   * Tell the worker what this window can see, so a tick carries only those rows.
   *
   * MEASURED at 0.8 rows per tick against 200 with it off — 267x fewer rows on
   * the wire, with the block round trip unchanged.
   */
  useEffect(() => {
    if (!engine) return;
    const timer = setInterval(() => {
      engine.reportViewport();
      // The other half of the quick-search bridge — see its note. A grid with
      // no rows fires no event when the box is cleared.
      applyQuickFilter(apiRef.current);
    }, VIEWPORT_REPORT_MS);
    return () => clearInterval(timer);
  }, [engine, applyQuickFilter]);

  useEffect(
    () => () => {
      const liveApi = apiRef.current;
      if (liveApi && !liveApi.isDestroyed?.()) {
        liveApi.removeEventListener('cellValueChanged', onCellValueChanged);
        liveApi.removeEventListener('modelUpdated', onModelUpdated);
      }
    },
    [onCellValueChanged, onModelUpdated],
  );

  /**
   * Default to the shared server-side status panel; a host that asked for its
   * own keeps its panels, order and alignment — with the row-count ones served
   * by components that can answer here.
   *
   * MEASURED on both labs: AG's own row-count panels render NOTHING under the
   * server row model and select-all answers `Selected : ?`, because the rows
   * they would count were never sent to this window. `forEachNode` is no help
   * either — it visits the ~100 loaded rows. Rewriting the stock NAMES rather
   * than asking hosts to use ours is what lets a `statusBar` written for the
   * CSRM grid mean the same thing here. `agAggregationComponent` is left alone:
   * it aggregates the selected cell RANGE, which this window does hold.
   */
  const statusBar = useMemo(
    () =>
      withServerStatusPanels(props.statusBar) ?? {
        statusPanels: [{ statusPanel: 'serverStatusPanel', align: 'left' }],
      },
    [props.statusBar],
  );

  /**
   * TREE DATA. AG reads the hierarchy off the DATA in this mode, not off
   * column state — nothing in a book says which rows are parents, so the engine
   * stamps the two markers and these two callbacks read them back.
   *
   * Spread as `{}` when there is no hierarchy rather than passing
   * `treeData: false`: an explicit `false` is still a value, and it would beat
   * a pipeline-supplied option from the customizer.
   */
  const treeProps = useMemo(() => {
    if (!treeFieldsKey) return {};
    return {
      treeData: true,
      isServerSideGroup: (data: Record<string, unknown>) => data[SSRM_TREE_GROUP] === true,
      getServerSideGroupKey: (data: Record<string, unknown>) =>
        String(data[SSRM_TREE_KEY] ?? ''),
    };
  }, [treeFieldsKey]);

  /**
   * MASTER/DETAIL, read from the same worker-held book.
   *
   * `CustomSSRMGrid` answers this from a client-side mirror holding every row;
   * this window holds only the blocks in view, so the children come from a
   * filtered read of the book — deliberately NOT scoped to the grid's own
   * filter, because a master row expands onto the same children whatever else
   * is on screen.
   */
  const md = props.masterDetail;
  const detailCellRendererParams = useMemo(() => {
    if (!md) return undefined;
    const fetchDetail = async (
      master: Record<string, unknown>,
    ): Promise<Record<string, unknown>[]> => {
      if (md.getDetailRowData) return md.getDetailRowData(master);
      const match: Record<string, unknown> = {};
      for (const [detailField, masterField] of Object.entries(md.matchFields ?? {})) {
        match[detailField] = master[masterField] ?? null;
      }
      return (
        (await holderRef.current?.get()?.readMatchingRows(match, md.detailLimit)) ?? []
      );
    };
    return {
      detailGridOptions: {
        columnDefs: md.detailColumnDefs,
        defaultColDef: { flex: 1, minWidth: 90 },
      },
      // AG's contract is a CALLBACK called exactly once, not a promise. A
      // rejection still has to call it — with no rows — or the detail grid
      // spins forever on a book that simply had none.
      getDetailRowData: (p: {
        data: Record<string, unknown>;
        successCallback: (rows: Record<string, unknown>[]) => void;
      }) => {
        void fetchDetail(p.data)
          .then((rows) => p.successCallback(rows))
          .catch(() => p.successCallback([]));
      },
    };
  }, [md]);

  const isRowMaster = useMemo(() => {
    if (!md) return undefined;
    return (data: Record<string, unknown> | undefined) => {
      if (!data) return false;
      // Neither a tree parent nor the grand total is a row of the book, so
      // neither has children to show.
      if (data[SSRM_GRAND_TOTAL_FLAG] || data[SSRM_TREE_GROUP]) return false;
      return md.isRowMaster ? md.isRowMaster(data) : true;
    };
  }, [md]);

  // The shell still carries the legacy boolean form of this setting; AG Grid 36
  // takes a position only.
  const grandTotalRow =
    props.grandTotalRow === true
      ? ('pinnedBottom' as const)
      : props.grandTotalRow === false
        ? undefined
        : props.grandTotalRow;

  const pipelineGridOptions = useMemo(
    () =>
      stripServerSurfaceManagedGridOptions(
        props.gridOptions ?? {},
        props.hostOverrideKeys ?? NO_HOST_OVERRIDES,
      ),
    [props.gridOptions, props.hostOverrideKeys],
  );

  /**
   * Host props are applied only when the host actually passed them. Listing
   * them as always-present JSX attributes would send `undefined` for the ones
   * it omitted, and an explicit `undefined` beats a pipeline value.
   */
  const hostOverrides = useMemo(() => {
    const out: Record<string, unknown> = {};
    if (props.rowHeight !== undefined) out.rowHeight = props.rowHeight;
    if (props.headerHeight !== undefined) out.headerHeight = props.headerHeight;
    if (props.sideBar !== undefined) out.sideBar = props.sideBar;
    // Merged rather than assigned: a host's defaultColDef must survive, and a
    // host that sets its own `loadingCellRenderer` still wins.
    out.defaultColDef = {
      loadingCellRenderer: SkeletonLoadingCellRenderer,
      ...((props.defaultColDef as Record<string, unknown>) ?? {}),
    };
    if (grandTotalRow !== undefined) out.grandTotalRow = grandTotalRow;
    if (props.groupTotalRow !== undefined) out.groupTotalRow = props.groupTotalRow;
    return out;
  }, [
    props.rowHeight,
    props.headerHeight,
    props.sideBar,
    props.defaultColDef,
    grandTotalRow,
    props.groupTotalRow,
  ]);

  const datasource = useMemo(
    () => (engine === null ? undefined : { getRows: engine.datasource.getRows }),
    [engine],
  );

  // Do not mount the grid until the engine exists. AG reads `context` and
  // `serverSideDatasource` when it CREATES the grid and instantiates status
  // panels once — mounting earlier gave the panel a null engine and it then
  // rendered nothing forever even though the engine arrived a tick later.
  if (engine === null) {
    return (
      <div style={{ flex: 1, minHeight: 0, width: '100%', height: props.height ?? '100%' }} />
    );
  }

  return (
    <div style={{ flex: 1, minHeight: 0, width: '100%', height: props.height ?? '100%' }}>
      <AgGridReact
        ref={props.gridRef}
        {...pipelineGridOptions}
        {...hostOverrides}
        theme={props.theme}
        loadThemeGoogleFonts={false}
        columnDefs={columnDefs as never}
        // Parity with the CSRM surface, which sets all four unconditionally.
        // Omitting `cellSelection` left the formatting toolbar's
        // `api.getCellRanges()` a permanently empty list on the other path.
        maintainColumnOrder
        cellSelection={true}
        aggFuncs={TRAFFIC_LIGHT_AGG_FUNCS}
        getContextMenuItems={props.getContextMenuItems}
        rowModelType="serverSide"
        serverSideDatasource={datasource as never}
        getRowId={getRowId}
        /**
         * Must match the engine's `pivotResultFieldSeparator`. AG rebuilds its
         * secondary columns by SPLITTING each `pivotResultFields` entry on
         * this, so a mismatch does not error — it carves the field name in the
         * wrong place and produces columns named after fragments.
         */
        serverSidePivotResultFieldSeparator="_"
        /**
         * How many rows a PURGED store claims until the first block answers.
         * AG's default is 1, so a sort, filter or quick search leaves the grid
         * momentarily reporting a one-row book. A viewport of skeletons reads
         * as "loading" rather than "the book emptied", and AG corrects it from
         * the first response — this engine always supplies the exact count.
         */
        serverSideInitialRowCount={100}
        // 100 rows is the window size every measurement in this package used.
        cacheBlockSize={100}
        maxBlocksInCache={100}
        blockLoadDebounceMillis={40}
        // Without this the skeleton stub is never reached: AG's server row model
        // paints a FULL-WIDTH loading row by default and only consults the
        // colDef `loadingCellRenderer` when this is on.
        suppressServerSideFullWidthLoadingRow
        {...treeProps}
        {...(md ? { masterDetail: true, isRowMaster, detailCellRendererParams } : {})}
        statusBar={statusBar as never}
        components={components as Record<string, unknown>}
        context={context}
        suppressAggFuncInHeader
        suppressNoRowsOverlay
        overlayNoRowsTemplate=" "
        onGridReady={(event) => {
          apiRef.current = event.api;
          engine?.setApi(event.api as never);
          event.api.addEventListener('cellValueChanged', onCellValueChanged);
          event.api.addEventListener('modelUpdated', onModelUpdated);
          props.onGridReady?.(event);
        }}
        onGridPreDestroyed={props.onGridPreDestroyed}
      />
    </div>
  );
});
