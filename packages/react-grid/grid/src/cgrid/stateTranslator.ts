/**
 * MarketsCgrid — AG `GridState` blob ⇄ cgrid `GridState` v4.
 *
 * Profiles keep the AG-shaped on-disk format (portable between surfaces:
 * an AG-saved profile loads on cgrid and vice versa). The adapter's
 * `getState`/`setState` translate at the boundary:
 *
 *   AG slice                        cgrid slice
 *   ------------------------------- --------------------------------
 *   columnOrder.orderedColIds     ⇄ columnState[] (entry order)
 *   columnPinning.left/rightColIds⇄ columnState[].pinned
 *   columnSizing.columnSizingModel⇄ columnState[].width/flex
 *   columnVisibility.hiddenColIds ⇄ columnState[].hide
 *   sort.sortModel                ⇄ sortModel + columnState[].sort(Index)
 *   filter.filterModel            ⇄ filterModel   (discriminants match)
 *   rowGroup.groupColIds          ⇄ rowGroupColumns + columnState[].rowGroup
 *   rowGroupExpansion             ⇄ expandedRouteIds
 *   aggregation.aggregationModel  ⇄ columnState[].aggFunc
 *   pivot                         ⇄ pivotMode + pivotCols
 *   sideBar                       ⇄ sideBar (visible + open panel)
 *   scroll                        ⇄ scroll
 *   rowSelection (id form)        ⇄ rowSelection
 *
 * cgrid-only slices (modules envelopes, runtime gridOptions, themeParams)
 * ride inside the AG blob under `__cgrid` — AG's `setState` ignores keys
 * it doesn't know, so a cgrid-saved profile still loads cleanly on the AG
 * surface (the extras are simply unused there).
 *
 * Known-lossy corners (documented in the plan, M3+ work): AG multi-filter
 * sub-models beyond cgrid's single filter kind, cell range selection,
 * column-group open state on the AG side.
 */

type Dict = Record<string, unknown>;

export interface CgridColumnStateEntry {
  colId: string;
  width?: number;
  flex?: number | null;
  hide?: boolean;
  pinned?: 'left' | 'right' | null;
  sort?: 'asc' | 'desc' | null;
  sortIndex?: number | null;
  rowGroup?: boolean;
  rowGroupIndex?: number | null;
  pivot?: boolean;
  pivotIndex?: number | null;
  aggFunc?: string | null;
}

export interface CgridGridState extends Dict {
  version: number;
  columnState?: CgridColumnStateEntry[];
  filterModel?: Dict;
  sortModel?: Array<{ colId: string; direction: 'asc' | 'desc' }>;
  rowGroupColumns?: string[];
  expandedRouteIds?: string[];
  pivotMode?: boolean;
  pivotCols?: string[];
  sideBar?: { openedToolPanel: string | null; visible: boolean };
  gridOptions?: Dict;
  themeParams?: Record<string, string>;
  modules?: Dict;
  rowSelection?: string[];
  scroll?: { top: number; left: number };
}

/** cgrid GridState schema this translator targets (kernel STATE_SCHEMA_VERSION). */
export const CGRID_STATE_VERSION = 4;

/** Namespaced carrier for cgrid-only slices inside the AG blob. */
const CGRID_EXTRAS_KEY = '__cgrid';

// ── cgrid → AG ─────────────────────────────────────────────────────────

export function agStateFromCgrid(cg: CgridGridState): Dict {
  const ag: Dict = {};
  const cols = cg.columnState ?? [];

  if (cols.length > 0) {
    ag.columnOrder = { orderedColIds: cols.map((c) => c.colId) };

    const leftColIds = cols.filter((c) => c.pinned === 'left').map((c) => c.colId);
    const rightColIds = cols.filter((c) => c.pinned === 'right').map((c) => c.colId);
    if (leftColIds.length || rightColIds.length) {
      ag.columnPinning = { leftColIds, rightColIds };
    }

    const sizing = cols
      .filter((c) => typeof c.width === 'number' || typeof c.flex === 'number')
      .map((c) => {
        const entry: Dict = { colId: c.colId };
        if (typeof c.width === 'number') entry.width = c.width;
        if (typeof c.flex === 'number') entry.flex = c.flex;
        return entry;
      });
    if (sizing.length) ag.columnSizing = { columnSizingModel: sizing };

    const hiddenColIds = cols.filter((c) => c.hide === true).map((c) => c.colId);
    if (hiddenColIds.length) ag.columnVisibility = { hiddenColIds };

    const aggregationModel = cols
      .filter((c) => typeof c.aggFunc === 'string' && c.aggFunc)
      .map((c) => ({ colId: c.colId, aggFunc: c.aggFunc }));
    if (aggregationModel.length) ag.aggregation = { aggregationModel };
  }

  const sortEntries =
    cg.sortModel && cg.sortModel.length > 0
      ? cg.sortModel.map((s) => ({ colId: s.colId, sort: s.direction }))
      : cols
          .filter((c) => c.sort === 'asc' || c.sort === 'desc')
          .sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0))
          .map((c) => ({ colId: c.colId, sort: c.sort }));
  if (sortEntries.length) ag.sort = { sortModel: sortEntries };

  if (cg.filterModel && Object.keys(cg.filterModel).length > 0) {
    ag.filter = { filterModel: cg.filterModel };
  }

  const groupColIds =
    cg.rowGroupColumns && cg.rowGroupColumns.length > 0
      ? cg.rowGroupColumns
      : cols
          .filter((c) => c.rowGroup === true)
          .sort((a, b) => (a.rowGroupIndex ?? 0) - (b.rowGroupIndex ?? 0))
          .map((c) => c.colId);
  if (groupColIds.length) ag.rowGroup = { groupColIds };

  if (cg.expandedRouteIds && cg.expandedRouteIds.length > 0) {
    ag.rowGroupExpansion = { expandedRowGroupIds: cg.expandedRouteIds };
  }

  if (cg.pivotMode !== undefined || (cg.pivotCols && cg.pivotCols.length > 0)) {
    ag.pivot = { pivotMode: cg.pivotMode === true, pivotColIds: cg.pivotCols ?? [] };
  }

  if (cg.sideBar) {
    ag.sideBar = {
      visible: cg.sideBar.visible,
      position: 'right',
      openToolPanel: cg.sideBar.openedToolPanel,
      toolPanels: {},
    };
  }

  if (cg.rowSelection && cg.rowSelection.length > 0) {
    ag.rowSelection = cg.rowSelection;
  }

  if (cg.scroll) ag.scroll = { top: cg.scroll.top, left: cg.scroll.left };

  // cgrid-only slices ride along, namespaced.
  const extras: Dict = {};
  if (cg.gridOptions && Object.keys(cg.gridOptions).length > 0) extras.gridOptions = cg.gridOptions;
  if (cg.themeParams && Object.keys(cg.themeParams).length > 0) extras.themeParams = cg.themeParams;
  if (cg.modules && Object.keys(cg.modules).length > 0) extras.modules = cg.modules;
  if (Object.keys(extras).length > 0) ag[CGRID_EXTRAS_KEY] = extras;

  return ag;
}

// ── AG → cgrid ─────────────────────────────────────────────────────────

export function cgridStateFromAg(ag: Dict): CgridGridState {
  const cg: CgridGridState = { version: CGRID_STATE_VERSION };

  const orderedColIds =
    ((ag.columnOrder as Dict | undefined)?.orderedColIds as string[] | undefined) ?? [];
  const pinning = ag.columnPinning as { leftColIds?: string[]; rightColIds?: string[] } | undefined;
  const left = new Set(pinning?.leftColIds ?? []);
  const right = new Set(pinning?.rightColIds ?? []);
  const hidden = new Set(
    ((ag.columnVisibility as Dict | undefined)?.hiddenColIds as string[] | undefined) ?? [],
  );
  const sizingModel =
    ((ag.columnSizing as Dict | undefined)?.columnSizingModel as
      | Array<{ colId: string; width?: number; flex?: number }>
      | undefined) ?? [];
  const sizeByCol = new Map(sizingModel.map((s) => [s.colId, s]));
  const sortModel =
    ((ag.sort as Dict | undefined)?.sortModel as
      | Array<{ colId: string; sort: 'asc' | 'desc' }>
      | undefined) ?? [];
  const sortByCol = new Map(sortModel.map((s, i) => [s.colId, { sort: s.sort, index: i }]));
  const groupColIds =
    ((ag.rowGroup as Dict | undefined)?.groupColIds as string[] | undefined) ?? [];
  const aggregationModel =
    ((ag.aggregation as Dict | undefined)?.aggregationModel as
      | Array<{ colId: string; aggFunc: string }>
      | undefined) ?? [];
  const aggByCol = new Map(aggregationModel.map((a) => [a.colId, a.aggFunc]));

  // Every colId any slice mentions, saved order first.
  const allIds = [...orderedColIds];
  const seen = new Set(allIds);
  for (const id of [
    ...left, ...right, ...hidden, ...sizeByCol.keys(), ...sortByCol.keys(),
    ...groupColIds, ...aggByCol.keys(),
  ]) {
    if (!seen.has(id)) { seen.add(id); allIds.push(id); }
  }

  if (allIds.length > 0) {
    cg.columnState = allIds.map((colId) => {
      const entry: CgridColumnStateEntry = {
        colId,
        hide: hidden.has(colId),
        pinned: left.has(colId) ? 'left' : right.has(colId) ? 'right' : null,
      };
      const size = sizeByCol.get(colId);
      if (size && typeof size.width === 'number') entry.width = size.width;
      if (size && typeof size.flex === 'number') entry.flex = size.flex;
      const sort = sortByCol.get(colId);
      entry.sort = sort ? sort.sort : null;
      entry.sortIndex = sort ? sort.index : null;
      const gi = groupColIds.indexOf(colId);
      entry.rowGroup = gi >= 0;
      entry.rowGroupIndex = gi >= 0 ? gi : null;
      const agg = aggByCol.get(colId);
      if (agg) entry.aggFunc = agg;
      return entry;
    });
  }

  if (sortModel.length > 0) {
    cg.sortModel = sortModel.map((s) => ({ colId: s.colId, direction: s.sort }));
  }

  const filterModel = (ag.filter as Dict | undefined)?.filterModel as Dict | undefined;
  if (filterModel && Object.keys(filterModel).length > 0) cg.filterModel = filterModel;

  if (groupColIds.length > 0) cg.rowGroupColumns = groupColIds;

  const expanded =
    ((ag.rowGroupExpansion as Dict | undefined)?.expandedRowGroupIds as string[] | undefined) ?? [];
  if (expanded.length > 0) cg.expandedRouteIds = expanded;

  const pivot = ag.pivot as { pivotMode?: boolean; pivotColIds?: string[] } | undefined;
  if (pivot) {
    cg.pivotMode = pivot.pivotMode === true;
    if (pivot.pivotColIds && pivot.pivotColIds.length > 0) cg.pivotCols = pivot.pivotColIds;
  }

  const sideBar = ag.sideBar as { visible?: boolean; openToolPanel?: string | null } | undefined;
  if (sideBar) {
    cg.sideBar = {
      visible: sideBar.visible !== false,
      openedToolPanel: sideBar.openToolPanel ?? null,
    };
  }

  const rowSelection = ag.rowSelection;
  if (Array.isArray(rowSelection) && rowSelection.every((x) => typeof x === 'string')) {
    cg.rowSelection = rowSelection as string[];
  }

  const scroll = ag.scroll as { top?: number; left?: number } | undefined;
  if (scroll) cg.scroll = { top: scroll.top ?? 0, left: scroll.left ?? 0 };

  const extras = ag[CGRID_EXTRAS_KEY] as Dict | undefined;
  if (extras) {
    if (extras.gridOptions) cg.gridOptions = extras.gridOptions as Dict;
    if (extras.themeParams) cg.themeParams = extras.themeParams as Record<string, string>;
    if (extras.modules) cg.modules = extras.modules as Dict;
  }

  return cg;
}
