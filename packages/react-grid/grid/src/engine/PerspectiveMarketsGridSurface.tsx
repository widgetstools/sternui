/**
 * Perspective presentation surface — peer to MarketsGridSurface (CSRM) and
 * SsrmMarketsGridSurface (CustomSSRMGrid).
 *
 * AG Grid stays the surface; only the row supply changes. The book lives once
 * as a Table in the worker and this window reads the blocks its viewport asks
 * for, so nothing here ever holds more than a few hundred rows — which is the
 * whole reason a second and third blotter open as fast as the first.
 *
 * Everything with a non-obvious rule behind it (per-level refresh, the
 * grand-total transaction, the row count that is illegal while grouping, the
 * throttle) belongs to `createPerspectiveRowEngine`. This file is the mount.
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
  Column,
  GetContextMenuItems,
  GetRowIdParams,
  GridApi,
  GridReadyEvent,
  Theme,
} from 'ag-grid-community';
import type { RefObject } from 'react';
import { TRAFFIC_LIGHT_AGG_FUNCS } from './ssrmTrafficLightAgg.js';
import {
  createPerspectiveRowEngine,
  toPerspectiveEdits,
  GRAND_TOTAL_FLAG,
  GRAND_TOTAL_ROW_ID,
  TREE_GROUP_FIELD,
  TREE_KEY_FIELD,
  type PerspectiveRowEngine,
  type PerspectiveTableLike,
} from '@starui/perspective-grid';
import { useOptionalGridPlatform } from '../customizer/hooks/GridProvider.js';
import { buildStreamSafeComponents } from '../widget/buildStreamSafeComponents.js';
import { stripPerspectiveManagedGridOptions } from '../widget/gridSurfaceOptions.js';
import {
  createPerspectiveEngineHolder,
  type PerspectiveEngineHolder,
  type PerspectiveGridContext,
} from './perspectiveEngineHolder.js';
import { PerspectiveStatusPanel } from './PerspectiveStatusPanel.js';
import {
  PERSPECTIVE_STATUS_PANEL_COMPONENTS,
  withPerspectiveStatusPanels,
} from './PerspectiveStatusPanels.js';
import { withPerspectiveSetFilterValues } from './perspectiveSetFilterValues.js';

const NO_HOST_OVERRIDES: ReadonlySet<string> = new Set<string>();

/**
 * How long after the last scroll event live re-reads resume. Long enough to
 * span the gap between wheel notches, short enough that a stopped grid looks
 * live immediately.
 */
const SCROLL_RESUME_MS = 150;

/**
 * Columns fetched either side of the visible band.
 *
 * One viewport's worth, so an ordinary nudge scroll stays inside the loaded
 * band and costs nothing. Bigger trades payload for fewer re-reads; the point
 * of a pad at all is that a re-read is the expensive event, not a column.
 */
const DEFAULT_COLUMN_WINDOW_PAD = 25;

/**
 * Coalesce band recalculation. AG fires `virtualColumnsChanged` per scroll
 * frame, so a horizontal fling across the whole book must produce ONE widen
 * rather than one per frame — the same reason `blockLoadDebounceMillis`
 * debounces row loads.
 */
const COLUMN_WINDOW_DEBOUNCE_MS = 150;

/**
 * The Table column a grid column reads.
 *
 * `colId` and `field` are the same string for every column in these demos, and
 * are NOT required to be: AG defaults `colId` to `field` but a colDef may set
 * either. The engine indexes the Table by field, so field wins where there is
 * one — a calculated column has only a colId, which is also its Perspective
 * expression alias.
 */
function tableField(column: Column): string {
  return column.getColDef().field ?? column.getColId();
}

/**
 * A stub cell is a SKELETON, not a blank — and not the word "Loading...".
 *
 * Under the server row model AG commits a scroll immediately and paints a stub
 * for every row whose block has not arrived. What that stub looks like is a
 * correctness question on a blotter, not a cosmetic one, and this renderer has
 * now been wrong in both directions:
 *
 *   - AG's default writes **"Loading..."** into the cell. On a book scrolled
 *     continuously that is a word flickering down the leftmost column on every
 *     drag — noise, and it only appears in one column.
 *   - So it was made **blank**, on the reasoning that "this window does not hold
 *     the book, so blank is the only honest stub". That reasoning is wrong. An
 *     empty cell is exactly how this grid renders a genuine null, so a stub is
 *     indistinguishable from "this position has no bid". A trader reading a
 *     blank price cell on a live blotter has no way to tell "not fetched yet"
 *     from "the value is gone", and the second one is alarming.
 *
 * A muted bar is unambiguous: nothing in the book renders as a grey rectangle,
 * so it can only mean "not here yet". It is drawn from `currentColor` at low
 * opacity rather than any palette value, so it themes with the cell in both
 * light and dark without reaching for a token the grid package does not own.
 *
 * Imperative rather than a function component: AG frequently creates the stub
 * before `rowIndex` is assigned, and a functional cell that returns once would
 * never repaint.
 *
 * **This renderer does nothing on its own, which is how it shipped inert the
 * first time.** AG's server row model paints a FULL-WIDTH loading row — a
 * spinner and the word "Loading..." spanning the whole row — and reaches for
 * the colDef `loadingCellRenderer` ONLY when
 * `suppressServerSideFullWidthLoadingRow` is set. Setting the renderer without
 * that flag changes nothing visible, which is exactly what happened. The flag is
 * set where the other server-row-model options are, on the grid element below.
 */
class SkeletonLoadingCellRenderer {
  private readonly eGui: HTMLElement;

  constructor() {
    this.eGui = document.createElement('span');
    this.eGui.className = 'starui-loading-cell';
    this.eGui.setAttribute('aria-label', 'loading');
    this.eGui.style.cssText =
      'display:inline-block;width:62%;height:0.7em;border-radius:2px;' +
      'background:currentColor;opacity:0.15;vertical-align:middle';
  }

  init(): void {}

  getGui(): HTMLElement {
    return this.eGui;
  }

  refresh(): boolean {
    return true;
  }

  destroy(): void {}
}

export interface PerspectiveMarketsGridSurfaceHandle {
  getApi(): GridApi | null;
  /** Re-read every level now — used after an out-of-band change. */
  refresh(): void;
  /** Pause/resume re-reading when the Table moves. */
  setLive(live: boolean): void;
}

export interface PerspectiveMarketsGridSurfaceProps {
  /** Worker-held Table this window reads. Opened by the host, never built here. */
  table: PerspectiveTableLike;
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
  /** Coalesce Table updates into at most one re-read per this many ms. */
  refreshMs?: number;
  onError?: (error: unknown) => void;
  /**
   * Module-pipeline grid options, same object the CSRM surface receives.
   * Spread FIRST so the explicit props below still win — everything a user
   * sets in the customizer reaches this surface too, minus the row-supply
   * mechanics listed in `PERSPECTIVE_SURFACE_OWNED_KEYS`.
   */
  gridOptions?: Record<string, unknown>;
  /** Keys the host passed explicitly; the pipeline must not fight them. */
  hostOverrideKeys?: ReadonlySet<string>;
  /**
   * The AgGridReact instance ref the host owns. Same ref the CSRM surface
   * takes — the grid is the same component, only the row supply differs.
   */
  gridRef?: RefObject<AgGridReact | null>;
  /** Cell right-click menu builder. Built with `useCallback` in the host. */
  getContextMenuItems?: GetContextMenuItems;
  /**
   * Calculated columns as Perspective expression source, keyed by column id.
   * Published to the worker so their values feed sort, filter, group and
   * aggregate — a calc column resolved client-side could do none of those,
   * because this window holds only the blocks in view.
   */
  calcExpressions?: Record<string, string>;
  /**
   * Tree hierarchy fields, outermost first — AG's SSRM tree mode instead of
   * its row-group mode. The engine serves each level from the worker the same
   * way it serves a group level, and stamps the markers AG reads a hierarchy
   * from onto the parent rows.
   */
  treeFields?: readonly string[];
  /**
   * Master/detail. `matchFields` maps a DETAIL column id to the MASTER column
   * whose value it must equal; the detail rows are read from the same
   * worker-held book, so a master row expands without this window holding
   * anything extra.
   */
  masterDetail?: PerspectiveMasterDetail;
  /**
   * Fetch only the columns the grid is showing. Off unless `enabled` is set.
   *
   * See {@link PerspectiveColumnWindowOptions} — and read its `pinned` note
   * before turning this on, because every way of getting the list wrong is
   * silent.
   */
  columnWindow?: PerspectiveColumnWindowOptions;
  /** Profile / grid-state capture runs here; without it a layout is lost. */
  onGridPreDestroyed?: () => void;
}

/**
 * Column-window fetching — opt-in, and off by default on purpose.
 *
 * A Perspective View carries every column it was built with, and AG renders
 * about fifteen of a 400-column book, so ~96% of every block read is fetched,
 * shipped and discarded. Narrowing the View is the one lever on both the read
 * latency and the renderer memory that go with that.
 *
 * It is off by default because AG's SSRM request carries no column window, so
 * this window state is invented here and the ways it can be wrong do not
 * announce themselves: a column left out renders BLANK, and a value getter or
 * style rule reading a left-out field gets `undefined` and quietly reports
 * nothing. A slow blotter is recoverable; a confidently blank one is not.
 *
 * What is carried without being asked for:
 *   - the key column and the tree fields (the engine pins them — a block whose
 *     rows all key the same is discarded by AG, not rendered wrong);
 *   - every value column with an `aggFunc`, or the totals row empties;
 *   - **every Table field no grid column binds at all** — value-getter inputs,
 *     style-rule inputs, anything the book carries that nothing renders.
 *
 * What is NOT, and is what `pinned` is for: a field that IS a grid column but
 * is read by something other than its own cell — a value getter computing from
 * a neighbouring column, a style rule keyed on a hidden one.
 *
 * Sort, filter and grouping need no pinning at all. MEASURED against 4.5.2
 * (`columnWindowProbe.mjs` in the perspective-grid package): a filter clause,
 * a sort and a `group_by` all resolve correctly against columns the View does
 * not carry.
 */
export interface PerspectiveColumnWindowOptions {
  enabled?: boolean;
  /** Columns fetched either side of the visible band. Defaults to 25. */
  pad?: number;
  /** Columns that are always fetched, wherever the band is. */
  pinned?: readonly string[];
}

export interface PerspectiveMasterDetail {
  detailColumnDefs: unknown[];
  /** detail column id -> master column id. */
  matchFields?: Record<string, string>;
  /** Supply the rows yourself instead of reading the book. */
  getDetailRowData?: (
    masterRow: Record<string, unknown>,
  ) => Promise<Record<string, unknown>[]>;
  /** Ceiling on one detail grid. Truncates — a detail panel is bounded. */
  detailLimit?: number;
  /** Which rows can be expanded at all. Defaults to every leaf row. */
  isRowMaster?: (row: Record<string, unknown>) => boolean;
  detailRowHeight?: number;
  detailRowAutoHeight?: boolean;
}

/**
 * Row ids must be the group PATH, not a leaf key.
 *
 * Group rows carry no key column of their own, so an id derived from it
 * collides across every group at a level — and duplicate ids turn a
 * successful block into a failed one (AG warn 205) rather than warning
 * visibly.
 *
 * Tree rows need the same treatment and cannot get it the same way: in tree
 * mode there ARE no row-group columns, so the `level < groupCols.length` test
 * is false at every depth and every parent would be keyed off the leaf column
 * it does not have. They are recognised by the marker the engine stamps on
 * instead.
 */
function makeGetRowId(keyColumn: string) {
  return ({ level, parentKeys = [], data, api }: GetRowIdParams): string => {
    const row = data as Record<string, unknown> | undefined;
    if (row?.[GRAND_TOTAL_FLAG]) return GRAND_TOTAL_ROW_ID;
    if (row?.[TREE_GROUP_FIELD]) {
      return [...parentKeys, row?.[TREE_KEY_FIELD]].join('/');
    }
    const groupCols = api.getRowGroupColumns?.() ?? [];
    if (level < groupCols.length) {
      const field = groupCols[level].getColDef().field;
      return [...parentKeys, field ? row?.[field] : undefined].join('/');
    }
    return [...parentKeys, row?.[keyColumn]].join('/');
  };
}

export const PerspectiveMarketsGridSurface = forwardRef<
  PerspectiveMarketsGridSurfaceHandle,
  PerspectiveMarketsGridSurfaceProps
>(function PerspectiveMarketsGridSurface(props, ref) {
  const { table, keyColumn, refreshMs, onError } = props;
  const apiRef = useRef<GridApi | null>(null);
  const [engine, setEngine] = useState<PerspectiveRowEngine | null>(null);
  /**
   * State as well as the ref, because the column-window effect has to run
   * AFTER the grid exists and a ref never re-runs an effect. One extra render
   * at mount; `AgGridReact` re-renders with identical props and does nothing.
   */
  const [gridApi, setGridApi] = useState<GridApi | null>(null);

  // Joined so a caller passing a fresh array literal every render does not
  // rebuild the engine — which would tear down every live View per render.
  const treeFieldsKey = (props.treeFields ?? []).join(' ');

  // One engine per Table. Rebuilt when the Table changes (a provider restart
  // hands over a new one), and always closed — its Views hold engine memory
  // and are charged on every tick until they are deleted.
  useEffect(() => {
    const treeFields = treeFieldsKey ? treeFieldsKey.split(' ') : undefined;
    const next = createPerspectiveRowEngine({
      table,
      keyColumn,
      refreshMs,
      onError,
      treeFields,
    });
    if (apiRef.current) next.setApi(apiRef.current as never);
    setEngine(next);
    return () => {
      void next.close();
    };
  }, [table, keyColumn, refreshMs, onError, treeFieldsKey]);

  useImperativeHandle(
    ref,
    () => ({
      getApi: () => apiRef.current,
      refresh: () => engine?.refreshNow(),
      setLive: (live: boolean) => engine?.setLive(live),
    }),
    [engine],
  );

  const streamSafeComponents = useMemo(
    () =>
      buildStreamSafeComponents(
        props.columnDefs as Parameters<typeof buildStreamSafeComponents>[0],
        props.includeAllStreamSafeFilters ?? true,
      ),
    [props.columnDefs, props.includeAllStreamSafeFilters],
  );

  const getRowId = useMemo(() => makeGetRowId(keyColumn), [keyColumn]);

  /**
   * The engine reaches the status panel through the grid `context`. The holder
   * is what makes that survive an engine swap — see its own docs.
   */
  const holderRef = useRef<PerspectiveEngineHolder | null>(null);
  holderRef.current ??= createPerspectiveEngineHolder();
  // In a layout effect, not during render: `set` notifies its subscribers
  // synchronously, and one of them is a status panel — updating it mid-render
  // is the "cannot update a component while rendering another" warning. Layout
  // effects all run before any passive effect, so the holder is current before
  // AgGridReact's own effect creates the grid and instantiates the panel.
  useLayoutEffect(() => {
    holderRef.current!.set(engine);
  }, [engine]);
  /**
   * Built once and never rebuilt — AG reads `context` when it CREATES the
   * grid. Everything engine-dependent therefore reads through the holder at
   * call time instead of closing over an engine that will be swapped out.
   */
  const context = useMemo<PerspectiveGridContext>(() => {
    const holder = holderRef.current!;
    return {
      perspectiveEngineHolder: holder,
      ssrmCountMatching: (filterModel) =>
        holder.get()?.countMatching(filterModel as never) ?? Promise.resolve(null),
      ssrmCountMatchingExpression: (source) =>
        holder.get()?.countMatchingExpression(source) ?? Promise.resolve(null),
      ssrmAggregateScalar: (colId, aggregate) =>
        holder.get()?.aggregateScalar(colId, aggregate as never) ?? Promise.resolve(null),
      get ssrmConfigured() {
        return holder.get() !== null;
      },
    };
  }, []);

  /**
   * Bridge the quick search into the engine.
   *
   * `QuickSearch` pushes the text with `setGridOption('quickFilterText')`, which
   * AG implements for the CLIENT-side row model only — under `serverSide` it is
   * stored and otherwise ignored, so the box did nothing at all on this path.
   *
   * MEASURED: changing that option under `serverSide` fires **`modelUpdated`
   * only** — not `filterChanged`, which is the event you would reach for. So
   * that is the hook, and since `modelUpdated` also fires on every block load
   * and every live refresh, the handler compares against the last value it
   * acted on and does nothing the rest of the time. The engine's own purge then
   * fires `modelUpdated` again, which is why that comparison is load-bearing
   * rather than an optimisation: without it this would loop.
   */
  // Republish the calculated columns whenever they change — including on the
  // first engine, since an engine built before the customizer state was read
  // starts with none.
  useEffect(() => {
    if (!engine) return;
    void engine.setCalcExpressions(props.calcExpressions ?? {});
  }, [engine, props.calcExpressions]);

  /**
   * Keep the engine's column window over the band the user is looking at.
   *
   * Two events, and both are needed. `virtualColumnsChanged` is what a
   * HORIZONTAL SCROLL fires — it carries `afterScroll` and is not deprecated in
   * AG Grid 36 (the `@deprecated v32.2` note nearby belongs to
   * `ColumnEverythingChangedEvent`, which is a different event and cost a
   * reading of the type file to establish). `displayedColumnsChanged` covers
   * everything that changes the column set without scrolling: hide, show, move,
   * pin, and the auto-group column appearing when the user groups.
   *
   * The hysteresis is the whole design. Recomputing the band on every event
   * would be one full re-read per scroll frame; instead the band is only
   * replaced when the VISIBLE set has left it, so ordinary nudges inside the
   * pad cost nothing at all.
   */
  // Flattened to scalars for the dep list, the same way `treeFieldsKey` is: a
  // host passing a fresh object literal every render would otherwise tear the
  // listeners down and reset the band on every render.
  const columnWindowOn = props.columnWindow?.enabled === true;
  const columnWindowPad = props.columnWindow?.pad ?? DEFAULT_COLUMN_WINDOW_PAD;
  const columnWindowPinned = (props.columnWindow?.pinned ?? []).join(' ');
  useEffect(() => {
    if (!engine || !gridApi || !columnWindowOn) return;
    const pad = columnWindowPad;
    const pinned = columnWindowPinned ? columnWindowPinned.split(' ') : [];

    let band: Set<string> | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const visibleFields = () =>
      gridApi.getAllDisplayedVirtualColumns().map(tableField);

    const apply = () => {
      // Order matters and it is AG's, not ours: the pad is a slice of the
      // DISPLAYED columns around the visible run, so a user who moved a column
      // to the front pads around where it now is.
      const displayed = gridApi.getAllDisplayedColumns();
      const visible = new Set(visibleFields());
      if (visible.size === 0) return;
      let lo = displayed.length;
      let hi = -1;
      displayed.forEach((column, index) => {
        if (!visible.has(tableField(column))) return;
        lo = Math.min(lo, index);
        hi = Math.max(hi, index);
      });
      if (hi < 0) return;

      // Still inside the loaded band: nothing to fetch, and re-reading every
      // loaded block for a two-column nudge is exactly what the pad prevents.
      if (band && [...visible].every((field) => band!.has(field))) return;

      const next = new Set<string>(pinned);
      for (const column of displayed.slice(Math.max(0, lo - pad), hi + pad + 1)) {
        next.add(tableField(column));
      }
      band = next;
      engine.setColumnWindow({
        columns: [...next],
        // Every grid column, hidden ones included — the engine carries Table
        // fields that appear in NO grid column, which is how a value getter's
        // inputs survive a window that has never heard of them.
        gridColumns: (gridApi.getColumns() ?? []).map(tableField),
      });
    };

    const schedule = () => {
      if (timer !== null) return;
      timer = setTimeout(() => {
        timer = null;
        apply();
      }, COLUMN_WINDOW_DEBOUNCE_MS);
    };

    apply();
    gridApi.addEventListener('virtualColumnsChanged', schedule);
    gridApi.addEventListener('displayedColumnsChanged', schedule);
    return () => {
      if (timer !== null) clearTimeout(timer);
      if (!gridApi.isDestroyed?.()) {
        gridApi.removeEventListener('virtualColumnsChanged', schedule);
        gridApi.removeEventListener('displayedColumnsChanged', schedule);
      }
      // Back to every column. A surface that turns this off mid-life, or an
      // engine about to be replaced, must not leave a narrowed View behind.
      engine.setColumnWindow(null);
    };
  }, [engine, gridApi, columnWindowOn, columnWindowPad, columnWindowPinned]);

  const lastQuickFilter = useRef('');
  const onModelUpdated = useCallback((event: { api: GridApi }) => {
    const next = (event.api.getGridOption('quickFilterText') ?? '') as string;
    if (next === lastQuickFilter.current) return;
    lastQuickFilter.current = next;
    void holderRef.current?.get()?.setQuickFilter(next);
  }, []);

  /**
   * Set filters get their checkbox list from the Table, not from the rows this
   * window holds — it holds only the loaded blocks, so without this every
   * column filter menu is empty. Read through the holder so the list still
   * resolves after an engine swap.
   */
  const columnDefs = useMemo(
    () =>
      withPerspectiveSetFilterValues(props.columnDefs, (colId) =>
        holderRef.current?.get()?.distinctValues(colId) ?? Promise.resolve(null),
      ),
    [props.columnDefs],
  );

  const components = useMemo(
    () => ({
      ...streamSafeComponents,
      perspectiveStatusPanel: PerspectiveStatusPanel,
      ...PERSPECTIVE_STATUS_PANEL_COMPONENTS,
    }),
    [streamSafeComponents],
  );

  /**
   * Master/detail, read from the same worker-held book.
   *
   * `CustomSSRMGrid` answers this from its client-side mirror engine, which
   * holds every row; this window holds only the blocks in view, so the detail
   * rows come from a transient filtered View over the Table. Deliberately not
   * scoped to the grid's filter — a master row must expand onto the same
   * children whatever else is on screen.
   */
  const md = props.masterDetail;
  const detailCellRendererParams = useMemo(() => {
    if (!md) return undefined;
    const fetchDetail = async (
      master: Record<string, unknown>,
    ): Promise<Record<string, unknown>[]> => {
      if (md.getDetailRowData) return md.getDetailRowData(master);
      const fields = md.matchFields ?? {};
      if (Object.keys(fields).length === 0) return [];
      const match: Record<string, unknown> = {};
      for (const [detailField, masterField] of Object.entries(fields)) {
        match[detailField] = master[masterField] ?? null;
      }
      const rows = await holderRef.current?.get()?.readMatchingRows(match, md.detailLimit);
      return rows ?? [];
    };
    return {
      detailGridOptions: {
        columnDefs: md.detailColumnDefs,
        defaultColDef: { flex: 1, minWidth: 90 },
      },
      // AG's callback contract, not a promise: it wants `successCallback`
      // called exactly once. A rejection still has to call it — with no rows —
      // or the detail grid spins forever on a book that simply had none.
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
      if (data[GRAND_TOTAL_FLAG] || data[TREE_GROUP_FIELD]) return false;
      return md.isRowMaster ? md.isRowMaster(data) : true;
    };
  }, [md]);

  const treeProps = useMemo(() => {
    if (!treeFieldsKey) return {};
    return {
      treeData: true,
      isServerSideGroup: (data: Record<string, unknown>) => data[TREE_GROUP_FIELD] === true,
      getServerSideGroupKey: (data: Record<string, unknown>) =>
        String(data[TREE_KEY_FIELD] ?? ''),
    };
  }, [treeFieldsKey]);

  /**
   * Committed edits go to the Table, or they do not survive.
   *
   * Under the server row model `cellValueChanged` still fires, but AG's write
   * lands only on the block-cache row node. The very next refresh re-reads that
   * block from the Table and paints the old value back over it — an edit that
   * appears to take and silently reverts a fraction of a second later. Routing
   * it through the engine also propagates it to every peer window, because they
   * are all reading the one Table this writes to.
   *
   * Registered with `addEventListener` rather than the `onCellValueChanged`
   * grid option so it COMPOSES: alerts, conditional styling, data-change
   * history and smart-edit all attach to the same event, and an option set here
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
    if (row[GRAND_TOTAL_FLAG] || event.node?.group) return;
    holderRef.current
      ?.get()
      ?.applyEdit({ key: row[keyColumnRef.current], field, value: event.newValue });
  }, []);

  /**
   * Do not re-read the book while the user is scrolling.
   *
   * MEASURED, and the largest scroll cost on this surface by far: the live
   * re-read calls `api.refreshServerSide({ purge: false })`, which invalidates
   * EVERY loaded block and re-requests it — four times a second at the default
   * 250 ms throttle. Scrolling needs that same worker for the blocks it is
   * moving onto, and the engine serializes requests, so the two fight. On a
   * 500-row book that showed as a **2,533 ms** frame during a vertical wheel
   * scroll, against 266 ms for the same scroll on the CSRM lab.
   *
   * Pausing is honest rather than a trick: a row that ticks while it is flying
   * past cannot be read anyway, and resuming schedules an immediate refresh,
   * so the grid is current the moment the user stops. `bodyScrollEnd` fires
   * per-axis, hence a settle timer rather than resuming on the first one.
   */
  const scrollIdleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onBodyScroll = useCallback(() => {
    const scrolling = holderRef.current?.get();
    if (!scrolling) return;
    if (scrolling.live) scrolling.setLive(false);
    if (scrollIdleTimer.current !== null) clearTimeout(scrollIdleTimer.current);
    scrollIdleTimer.current = setTimeout(() => {
      scrollIdleTimer.current = null;
      // Re-read the holder: an engine swapped out mid-scroll must not be the
      // one resumed.
      holderRef.current?.get()?.setLive(true);
    }, SCROLL_RESUME_MS);
  }, []);

  useEffect(
    () => () => {
      if (scrollIdleTimer.current !== null) clearTimeout(scrollIdleTimer.current);
    },
    [],
  );

  useEffect(
    () => () => {
      const liveApi = apiRef.current;
      if (liveApi && !liveApi.isDestroyed?.()) {
        liveApi.removeEventListener('cellValueChanged', onCellValueChanged);
        liveApi.removeEventListener('modelUpdated', onModelUpdated);
        liveApi.removeEventListener('bodyScroll', onBodyScroll);
      }
    },
    [onCellValueChanged, onModelUpdated, onBodyScroll],
  );

  /**
   * The OTHER write path: smart edit, bulk update and history undo/redo.
   *
   * They never touch the cell editor, so `cellValueChanged` above does not see
   * them — they build a patch list and hand it to
   * `GridPlatform.applyDataTransaction`, which the host routes to
   * `GridApi.applyTransactionAsync`. Under the server row model that is not a
   * write path, so every one of them was a silent no-op here while the same
   * flow worked on the CSRM twin. Registering the ENGINE applier takes
   * precedence over the host's (see `GridPlatform`) — deliberately explicit,
   * because this surface is a CHILD of the host and its effect runs first, so
   * ordering alone would give the wrong answer.
   */
  // Optional, like `GridDensityPill`: this surface is also rendered directly by
  // characterisation tests that assert on grid options and mount no provider,
  // and a throw there would be about the harness rather than the surface.
  const platform = useOptionalGridPlatform();
  useEffect(() => {
    if (!platform) return;
    platform.setEngineDataTransactionApplier((tx) => {
      const engine = holderRef.current?.get();
      if (!engine) return;
      const edits = toPerspectiveEdits(tx, keyColumnRef.current, {
        // Diff against the node so only the fields the module actually changed
        // are written — see `toPerspectiveEdits` for why writing the whole row
        // would trample the live feed for every peer window.
        currentRow: (key) =>
          apiRef.current?.getRowNode(String(key))?.data as
            | Record<string, unknown>
            | undefined,
      });
      for (const edit of edits) engine.applyEdit(edit);
    });
    return () => platform.setEngineDataTransactionApplier(null);
  }, [platform]);


  /**
   * Default to the Perspective status bar; a host that asked for its own keeps
   * its panels, order and alignment — with the row-count ones served by
   * components that can answer on this path.
   *
   * MEASURED on both labs: AG's own row-count panels render NOTHING under the
   * server row model, and select-all answers `Selected : ?`, because the rows
   * they would count were never sent to this window. Rewriting the names rather
   * than asking hosts to use ours is what lets a `statusBar` written for the
   * CSRM grid mean the same thing here. `agAggregationComponent` is left alone
   * on purpose — it aggregates the selected cell RANGE, which this window does
   * hold (see `PerspectiveStatusPanels`).
   */
  const statusBar = useMemo(
    () =>
      withPerspectiveStatusPanels(props.statusBar) ?? {
        statusPanels: [{ statusPanel: 'perspectiveStatusPanel', align: 'left' }],
      },
    [props.statusBar],
  );

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
      stripPerspectiveManagedGridOptions(
        props.gridOptions ?? {},
        props.hostOverrideKeys ?? NO_HOST_OVERRIDES,
      ),
    [props.gridOptions, props.hostOverrideKeys],
  );

  /**
   * Host props are applied only when the host actually passed them. Listing
   * them as always-present JSX attributes would send `undefined` for the ones
   * it omitted, and an explicit `undefined` beats a pipeline value — the same
   * reason `MarketsGridSurface` builds this object instead of spreading.
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
    () =>
      engine === null
        ? undefined
        : {
            getRows: (params: Parameters<typeof engine.datasource.getRows>[0]) =>
              engine.datasource.getRows(params),
          },
    [engine],
  );

  // Do not mount the grid until the engine exists. AG reads `context` and
  // `serverSideDatasource` when it CREATES the grid and instantiates status
  // panels once — mounting a render earlier gave the status panel a null
  // engine, and it then rendered nothing forever even though the engine
  // arrived a tick later. One extra render is the whole cost.
  if (engine === null) {
    return <div style={{ flex: 1, minHeight: 0, width: '100%', height: props.height ?? '100%' }} />;
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
        // They are in SURFACE_FIXED_GRID_OPTION_KEYS, so the pipeline's copies
        // are stripped and the surface owns them — omitting them here left
        // `cellSelection` off entirely, and the formatting toolbar resolves its
        // target columns from `api.getCellRanges()`.
        maintainColumnOrder
        cellSelection={true}
        aggFuncs={TRAFFIC_LIGHT_AGG_FUNCS}
        getContextMenuItems={props.getContextMenuItems}
        rowModelType="serverSide"
        serverSideDatasource={datasource as never}
        getRowId={getRowId}
        {...(treeProps as Record<string, unknown>)}
        {...(md
          ? {
              masterDetail: true,
              isRowMaster,
              detailCellRendererParams,
              ...(md.detailRowHeight !== undefined
                ? { detailRowHeight: md.detailRowHeight }
                : {}),
              ...(md.detailRowAutoHeight !== undefined
                ? { detailRowAutoHeight: md.detailRowAutoHeight }
                : {}),
            }
          : {})}
        // 100 rows is the window size every measurement in the package's
        // ARCHITECTURE.md used, and the depth at which reads stay flat.
        cacheBlockSize={100}
        /**
         * Generous, and the trade is explicit: a block is 100 rows of EVERY
         * column the View carries, so on the 400-column book each one is real
         * memory in a renderer already measured at 1.7-2.0 GB against Chrome's
         * ~4 GB ceiling. Bigger means fewer re-fetches when the user scrolls
         * back over ground they have already seen; it does not make any single
         * read cheaper.
         */
        maxBlocksInCache={100}
        /**
         * Coalesce block requests during a drag — modestly, and this number is
         * the honest end of an investigation rather than a tuned optimum.
         *
         * It was 100 ms, justified by "do not fetch what the user is scrolling
         * PAST … the stub cells are blank, so the gap costs nothing visible".
         * Both halves were measured false: a 120-column block read is 8 ms with
         * the feed paused, and the gap is the most visible thing on the surface.
         * MEASURED with `stubVisibilityProbe.mjs` on the 20k x 120 book, real
         * wheel events, live feed: a NORMAL scroll leaves the WHOLE viewport
         * dataless for seconds at a time.
         *
         * What the same probe then established, over four runs at three
         * settings, is that this knob is NOT the lever. Going to 0 issued 176
         * block requests where 40 ms issues 92, and the blank exposure did not
         *improve — run-to-run variance on an identical build (17% of samples
         * against 34%) is as large as the difference between settings.
         *
         * The lever is read latency under a live feed: the SAME read is **8 ms
         * paused and a 119-145 ms median while the feed ticks**, because a
         * `table.update()` blocks reads while it applies and everything crosses
         * one serialized ProxySession. That is a worker-side problem and it is
         * not fixable from here.
         *
         * So this stays at a small value for the one thing that IS measured —
         * halving the requests a fling issues, with no observed cost — and the
         * user-facing half of the problem is answered by the stub renderer
         * above, which no longer lets "not loaded" look like "null".
         */
        blockLoadDebounceMillis={40}
        // Without this the blank stub renderer below is never reached: AG's
        // server row model paints a FULL-WIDTH loading row by default and only
        // consults the colDef `loadingCellRenderer` when this is on. See the
        // note on `SkeletonLoadingCellRenderer`.
        suppressServerSideFullWidthLoadingRow
        statusBar={statusBar as never}
        components={components as Record<string, unknown>}
        context={context}
        suppressAggFuncInHeader
        suppressNoRowsOverlay
        overlayNoRowsTemplate=" "
        onGridReady={(event) => {
          apiRef.current = event.api;
          setGridApi(event.api);
          engine?.setApi(event.api as never);
          event.api.addEventListener('cellValueChanged', onCellValueChanged);
          event.api.addEventListener('modelUpdated', onModelUpdated);
          event.api.addEventListener('bodyScroll', onBodyScroll);
          props.onGridReady?.(event);
        }}
        onGridPreDestroyed={props.onGridPreDestroyed}
      />
    </div>
  );
});
