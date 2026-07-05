/**
 * MarketsCgrid — AG GridOptions key translation for the cgrid surface.
 *
 * The module pipeline emits AG-shaped `GridOptions`; `useGridHost`'s
 * post-mount sync loop pushes changed keys through `setGridOption`.
 * cgrid deliberately mirrors AG's option names, so most supported keys
 * pass through verbatim — this map is the explicit intersection, and
 * everything else is a warn-once no-op (fail loud in dev, never crash).
 *
 * M1 scope: the keys general-settings/density/host actually push today.
 * Extend alongside the general-settings intersection work in M3.
 */

/** AG option keys cgrid accepts under the SAME name. */
const PASSTHROUGH_KEYS = new Set<string>([
  'rowData',
  'quickFilterText',
  'animateRows',
  'rowHeight',
  'headerHeight',
  'suppressClickEdit',
  'singleClickEdit',
  'rowSelection',
  'suppressRowClickSelection',
  'rowMultiSelectWithClick',
  'enableCellChangeFlash',
  'cellFlashDuration',
  'cellFadeDuration',
  'asyncTransactionWaitMillis',
  'suppressContextMenu',
  'rowGroupPanelShow',
  'pivotPanelShow',
  'domLayout',
  'defaultColDef',
  'sideBar',
  'statusBar',
  'context',
  'loading',
  'pinnedTopRowData',
  'pinnedBottomRowData',
  'aggFuncs',
  'suppressAggFuncInHeader',
  'groupSelectsChildren',
  'suppressCount',
  'enableFillHandle',
  'fillHandleDirection',
  'cellSelection',
  'getContextMenuItems',
  'clipboardDelimiter',
  'suppressClipboardApi',
  'suppressClipboardPaste',
]);

/** AG keys with cgrid equivalents under a DIFFERENT name or shape. */
const RENAMED: Record<string, string> = {
  // (none yet — reserved for M3 general-settings intersection work)
};

/** AG keys we consciously ignore on cgrid (feature absent or handled
 *  elsewhere). Ignored silently — they are expected traffic. */
const IGNORED = new Set<string>([
  'theme', // cgrid themes via CSS class + setThemeParams (surface handles it)
  'maintainColumnOrder', // cgrid maintains order by default
  'suppressNoRowsOverlay',
  'overlayNoRowsTemplate',
  'readOnlyEdit', // M4 kernel work — editing gated on cgrid until then
  'getRowId', // handled explicitly by the surface (Proxy probe → rowIdField)
]);

const warned = new Set<string>();

export interface TranslatedOption {
  readonly kind: 'set' | 'ignore';
  readonly key?: string;
  readonly value?: unknown;
}

export function translateGridOption(key: string, value: unknown): TranslatedOption {
  if (PASSTHROUGH_KEYS.has(key)) return { kind: 'set', key, value };
  const renamed = RENAMED[key];
  if (renamed) return { kind: 'set', key: renamed, value };
  if (IGNORED.has(key)) return { kind: 'ignore' };
  if (!warned.has(key)) {
    warned.add(key);
    // eslint-disable-next-line no-console
    console.warn(`[MarketsCgrid] grid option '${key}' is not supported on the cgrid surface — ignored`);
  }
  return { kind: 'ignore' };
}

/** Initial-construction options: translate a whole AG GridOptions bag
 *  into the subset cgrid's constructor accepts. */
export function translateGridOptionsBag(bag: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(bag)) {
    if (value === undefined) continue;
    const t = translateGridOption(key, value);
    if (t.kind === 'set' && t.key) out[t.key] = t.value;
  }
  return out;
}
