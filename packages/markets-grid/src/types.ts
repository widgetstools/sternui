import type { ColDef, SideBarDef, StatusPanelDef, Theme } from 'ag-grid-community';
import type { AnyModule } from '@grid-customizer/core';

/**
 * Public host-component props. Narrow contract — the ONE place a consumer
 * app configures the grid.
 */
export interface MarketsGridProps<TData = unknown> {
  /** Unique id per grid instance. Profile snapshots key off this. */
  gridId: string;
  /** Row data. Kept reactive — swapping triggers the usual AG-Grid diff. */
  rowData: TData[];
  /** Base column definitions — modules can transform them. */
  columnDefs: ColDef<TData>[];
  /** Module list. Default passes a curated set (see DEFAULT_MODULES). */
  modules?: AnyModule[];
  /** AG-Grid theme object. */
  theme?: Theme;
  /** Field on each row that uniquely identifies it. Defaults to `'id'`. */
  rowIdField?: string;
  /** Shown above the grid. Defaults to `true`. */
  showToolbar?: boolean;
  /** Filter pill toolbar. Defaults to `false`. */
  showFiltersToolbar?: boolean;
  /** Floating formatter toolbar (pill toggle on the filter bar). */
  showFormattingToolbar?: boolean;
  /** Save button on the toolbar. Defaults to `true`. */
  showSaveButton?: boolean;
  /** Settings button on the toolbar. Defaults to `true`. */
  showSettingsButton?: boolean;
  /** Profile selector pill. Defaults to `true`. */
  showProfileSelector?: boolean;
  /** AG-Grid sidebar config. */
  sideBar?: SideBarDef | boolean;
  /** AG-Grid status bar config. */
  statusBar?: { statusPanels: StatusPanelDef[] };
  /** AG-Grid default column def — merged with module-produced defaults. */
  defaultColDef?: ColDef<TData>;
  /** Row height in px. Defaults to `36`. */
  rowHeight?: number;
  /** Header height in px. Defaults to `32`. */
  headerHeight?: number;
  /** Enable row animations. Defaults to `true`. */
  animateRows?: boolean;
  /** Host can provide its own storage adapter (DexieAdapter, MemoryAdapter, …).
   *  When omitted, MarketsGrid uses an in-memory adapter scoped to the current session. */
  storageAdapter?: unknown;
  /** Auto-save debounce in ms. Defaults to 300. */
  autoSaveDebounceMs?: number;
  /** Additional className on the root. */
  className?: string;
  /** Additional inline style on the root. */
  style?: React.CSSProperties;
  /** Passed through to AG-Grid after our own onGridReady fires. */
  onGridReady?: (event: import('ag-grid-community').GridReadyEvent) => void;
}
