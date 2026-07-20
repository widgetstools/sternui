/**
 * Which module-pipeline gridOptions may pass through to the SSRM grid.
 *
 * `SsrmGrid` accepts the host's computed gridOptions (general-settings
 * et al) via its `gridOptions` prop so panel toggles reach the SSRM surface
 * instead of being silently discarded (worklog T5). The keys below are
 * SSRM-structural — the component owns them (row model wiring, datasource,
 * sync-serving tuning, its own event handlers) — or are delivered through
 * dedicated surface props; a pipeline copy would either break the server row
 * model or fight the explicit prop.
 */

export const SSRM_STRUCTURAL_GRID_OPTION_KEYS = [
  // Row model / data wiring — the component IS the datasource.
  'rowData',
  'rowModelType',
  'serverSideDatasource',
  'getRowId',
  'getChildCount',
  'treeData',
  'isServerSideGroup',
  'getServerSideGroupKey',
  'masterDetail',
  'detailCellRendererParams',
  // Block/scroll tuning — load-bearing for sync serving + scroll quality.
  'cacheBlockSize',
  'maxBlocksInCache',
  'maxConcurrentDatasourceRequests',
  'blockLoadDebounceMillis',
  'suppressAnimationFrame',
  'debounceVerticalScrollbar',
  'suppressServerSideFullWidthLoadingRow',
  'asyncTransactionWaitMillis',
  'animateRows',
  // Component-owned handlers / registries.
  'aggFuncs',
  'components',
  'context',
  'getContextMenuItems',
  'onGridReady',
  'onCellValueChanged',
  'onFilterChanged',
  'onBodyScroll',
  'onColumnRowGroupChanged',
  // Delivered via dedicated surface props instead.
  'theme',
  'loadThemeGoogleFonts',
  'columnDefs',
  'defaultColDef',
  'sideBar',
  'statusBar',
  'rowHeight',
  'headerHeight',
  'grandTotalRow',
  'groupTotalRow',
  'pinnedTopRowData',
  'pinnedBottomRowData',
  'suppressNoRowsOverlay',
  'overlayNoRowsTemplate',
  // Client-row-model-only options — inert or harmful under serverSide.
  'quickFilterText',
  'pivotMode',
  'rowDragManaged',
] as const;

/**
 * Note: `statusBar` stays in the strip list because it is not blanket-
 * forwarded — `SsrmGrid` reads the pipeline `statusBar` explicitly and
 * translates AG's client-side count panels to the SSRM stand-ins
 * (`translateSsrmStatusBar`, worklog T8) before merging.
 */
export function stripSsrmStructuralGridOptions(
  opts: Record<string, unknown>,
): Record<string, unknown> {
  const out = { ...opts };
  for (const key of SSRM_STRUCTURAL_GRID_OPTION_KEYS) {
    delete out[key];
  }
  return out;
}
