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
  GRAND_TOTAL_FLAG,
  GRAND_TOTAL_ROW_ID,
  type PerspectiveRowEngine,
  type PerspectiveTableLike,
} from '@starui/perspective-grid';
import { buildStreamSafeComponents } from '../widget/buildStreamSafeComponents.js';
import { stripPerspectiveManagedGridOptions } from '../widget/gridSurfaceOptions.js';
import {
  createPerspectiveEngineHolder,
  type PerspectiveEngineHolder,
  type PerspectiveGridContext,
} from './perspectiveEngineHolder.js';
import { PerspectiveStatusPanel } from './PerspectiveStatusPanel.js';

const NO_HOST_OVERRIDES: ReadonlySet<string> = new Set<string>();

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
  /** Profile / grid-state capture runs here; without it a layout is lost. */
  onGridPreDestroyed?: () => void;
}

/**
 * Row ids must be the group PATH, not a leaf key.
 *
 * Group rows carry no key column of their own, so an id derived from it
 * collides across every group at a level — and duplicate ids turn a
 * successful block into a failed one (AG warn 205) rather than warning
 * visibly.
 */
function makeGetRowId(keyColumn: string) {
  return ({ level, parentKeys = [], data, api }: GetRowIdParams): string => {
    const row = data as Record<string, unknown> | undefined;
    if (row?.[GRAND_TOTAL_FLAG]) return GRAND_TOTAL_ROW_ID;
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

  // One engine per Table. Rebuilt when the Table changes (a provider restart
  // hands over a new one), and always closed — its Views hold engine memory
  // and are charged on every tick until they are deleted.
  useEffect(() => {
    const next = createPerspectiveRowEngine({ table, keyColumn, refreshMs, onError });
    if (apiRef.current) next.setApi(apiRef.current as never);
    setEngine(next);
    return () => {
      void next.close();
    };
  }, [table, keyColumn, refreshMs, onError]);

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
      get ssrmConfigured() {
        return holder.get() !== null;
      },
    };
  }, []);

  const components = useMemo(
    () => ({ ...streamSafeComponents, perspectiveStatusPanel: PerspectiveStatusPanel }),
    [streamSafeComponents],
  );

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

  useEffect(
    () => () => {
      const liveApi = apiRef.current;
      if (liveApi && !liveApi.isDestroyed?.()) {
        liveApi.removeEventListener('cellValueChanged', onCellValueChanged);
      }
    },
    [onCellValueChanged],
  );

  /**
   * Default to the Perspective status bar, but never override a host that
   * asked for its own. AG's stock panels count the rows the CLIENT holds — on
   * this path the loaded blocks — so they would report a confidently wrong
   * total; ours reads the Table.
   */
  const statusBar = useMemo(
    () =>
      props.statusBar ?? {
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
    if (props.defaultColDef !== undefined) out.defaultColDef = props.defaultColDef;
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
        columnDefs={props.columnDefs as never}
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
        // 100 rows is the window size every measurement in the package's
        // ARCHITECTURE.md used, and the depth at which reads stay flat.
        cacheBlockSize={100}
        maxBlocksInCache={20}
        blockLoadDebounceMillis={0}
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
          props.onGridReady?.(event);
        }}
        onGridPreDestroyed={props.onGridPreDestroyed}
      />
    </div>
  );
});
