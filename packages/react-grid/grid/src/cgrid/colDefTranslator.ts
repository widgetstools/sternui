/**
 * MarketsCgrid — AG ColDef[] → cgrid CColDef[] translation.
 *
 * The container's `buildColumnDefs` + the customizer pipeline emit AG
 * `ColDef`s (incl. AG filter component names and valueGetter closures).
 * cgrid's `CColDef` mirrors most field names, so translation is a
 * field-intersection copy plus:
 *   - filter-name mapping (AG component strings → cgrid filter kinds;
 *     cgrid columns take ONE filter kind, so `agMultiColumnFilter`
 *     degrades to the best kind for the column's cellDataType — the
 *     known M1 parity gap, compound filter is later kernel work);
 *   - dropping AG-only props with a warn-once (visible in dev, quiet
 *     in prod).
 *
 * Groups (`children`) recurse; cgrid group defs share AG's
 * groupId/headerName/children/openByDefault/marryChildren shape.
 */

const FILTER_NAME_MAP: Record<string, string> = {
  agTextColumnFilter: 'text',
  agNumberColumnFilter: 'number',
  agDateColumnFilter: 'date',
  agSetColumnFilter: 'set',
};

/** ColDef fields cgrid accepts under the same name. */
const COLDEF_PASSTHROUGH = [
  'colId', 'field', 'headerName', 'headerTooltip', 'width', 'minWidth', 'maxWidth',
  'flex', 'hide', 'pinned', 'sortable', 'resizable', 'editable', 'lockVisible',
  'lockPosition', 'suppressMovable', 'cellDataType', 'valueFormatter',
  'valueParser', 'cellClass', 'cellClassRules', 'cellStyle', 'headerClass',
  'cellRenderer', 'cellRendererParams', 'cellRendererSelector', 'cellEditor',
  'cellEditorParams', 'cellEditorPopup', 'aggFunc', 'enableRowGroup', 'enablePivot',
  'enableValue', 'rowGroup', 'rowGroupIndex', 'sort', 'sortIndex', 'sortingOrder',
  'comparator', 'wrapText', 'autoHeight', 'wrapHeaderText', 'autoHeaderHeight',
  'floatingFilter', 'suppressHeaderMenuButton', 'checkboxSelection',
  'headerCheckboxSelection', 'columnGroupShow', 'suppressSizeToFit', 'tooltipField',
  'tooltipValueGetter', 'initialWidth', 'initialHide', 'initialPinned', 'type',
] as const;

const GROUP_PASSTHROUGH = [
  'groupId', 'headerName', 'openByDefault', 'marryChildren', 'headerClass',
  'headerStyle', 'columnGroupShow', 'headerTooltip',
] as const;

const warned = new Set<string>();

function warnOnce(what: string): void {
  if (warned.has(what)) return;
  warned.add(what);
  // eslint-disable-next-line no-console
  console.warn(`[MarketsCgrid] ${what}`);
}

function bestFilterFor(cellDataType: unknown): string {
  switch (cellDataType) {
    case 'number': return 'number';
    case 'date':
    case 'dateString': return 'date';
    default: return 'text';
  }
}

function translateFilter(def: Record<string, unknown>): unknown {
  const filter = def.filter;
  if (filter === undefined || filter === null) return undefined;
  if (filter === false) return false;
  if (filter === true) return bestFilterFor(def.cellDataType);
  if (typeof filter === 'string') {
    if (filter === 'agMultiColumnFilter') {
      // AG's two-tab Multi Filter has no cgrid equivalent yet: degrade
      // to the best single kind for the column's data type.
      warnOnce("filter 'agMultiColumnFilter' degrades to a single cgrid filter kind (compound filter is planned kernel work)");
      return bestFilterFor(def.cellDataType);
    }
    const mapped = FILTER_NAME_MAP[filter];
    if (mapped) return mapped;
    if (filter === 'text' || filter === 'number' || filter === 'date' || filter === 'set') return filter;
    warnOnce(`filter '${filter}' has no cgrid mapping — using cellDataType default`);
    return bestFilterFor(def.cellDataType);
  }
  warnOnce('component-class filters are not supported on the cgrid surface — using cellDataType default');
  return bestFilterFor(def.cellDataType);
}

function translateLeaf(def: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of COLDEF_PASSTHROUGH) {
    if (def[key] !== undefined) out[key] = def[key];
  }
  if (typeof def.valueGetter === 'function') {
    // Verified by spike: CColDef types valueGetter but the kernel never
    // evaluates it (row data lives worker-side; computed columns ship as
    // @cgrid/calc programs). Passing the closure would render an empty
    // column that also sorts/filters as null — drop it loudly instead.
    warnOnce(`column '${String(def.colId ?? def.field)}' has a JS valueGetter — not supported on the cgrid surface; computed columns must compile to a @cgrid/calc program (M3 calculated-columns work)`);
  }
  const filter = translateFilter(def);
  if (filter !== undefined) out.filter = filter;
  // AG initial* fields: cgrid uses plain width/hide/pinned; map when the
  // plain field is absent.
  if (out.width === undefined && typeof def.initialWidth === 'number') out.width = def.initialWidth;
  if (out.hide === undefined && typeof def.initialHide === 'boolean') out.hide = def.initialHide;
  if (out.pinned === undefined && def.initialPinned !== undefined) out.pinned = def.initialPinned;
  delete out.initialWidth;
  delete out.initialHide;
  delete out.initialPinned;
  return out;
}

export function translateColumnDefs(defs: readonly unknown[]): unknown[] {
  return defs.map((d) => {
    const def = d as Record<string, unknown>;
    if (Array.isArray(def.children)) {
      const out: Record<string, unknown> = {};
      for (const key of GROUP_PASSTHROUGH) {
        if (def[key] !== undefined) out[key] = def[key];
      }
      out.children = translateColumnDefs(def.children as unknown[]);
      return out;
    }
    return translateLeaf(def);
  });
}
