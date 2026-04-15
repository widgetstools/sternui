import type { ReactNode } from 'react';
import type { ColDef, ColGroupDef, GridReadyEvent, SideBarDef, StatusPanelDef } from 'ag-grid-community';
import type { AnyModule, StorageAdapter } from '@grid-customizer/core';

/** Defines an additional toolbar that shares space with the formatting toolbar. */
export interface ToolbarSlotConfig {
  /** Unique ID for this toolbar */
  id: string;
  /** Short label shown in the pill (e.g. "Layout", "Data") */
  label: string;
  /** Pill accent color — CSS color string */
  color?: string;
  /** Icon element shown in the toolbar switcher dropdown */
  icon?: ReactNode;
  /** The toolbar React element to render */
  content: ReactNode;
}

/** A saved filter snapshot with a user-editable label and toggle state. */
export interface SavedFilter {
  /** Unique ID: `sf_{timestamp}_{random}` */
  id: string;
  /** User-editable label (e.g. "Buy Orders", "Status: FILLED") */
  label: string;
  /** Snapshot of AG-Grid's getFilterModel() at capture time */
  filterModel: Record<string, any>;
  /** Whether this filter is currently applied */
  active: boolean;
}

export interface MarketsGridProps<TData = any> {
  // Required
  rowData: TData[];
  columnDefs: (ColDef<TData> | ColGroupDef)[];
  theme: any; // themeQuartz.withParams() result

  // Grid identity
  gridId?: string;
  rowIdField?: string;

  // Feature toggles
  modules?: AnyModule[];
  showToolbar?: boolean;
  showSettingsButton?: boolean;
  persistState?: boolean;

  /**
   * Additional toolbars that share space with the formatting toolbar.
   * The formatting toolbar is always the first slot (id: "style").
   * Users switch between toolbars via colored pills at the top edge.
   */
  extraToolbars?: ToolbarSlotConfig[];

  /**
   * Show the built-in Filters toolbar in the toolbar switcher.
   * Allows users to capture, name, and toggle saved grid filters.
   */
  showFiltersToolbar?: boolean;

  /**
   * Optional storage backend enabling multi-profile support (the Profiles
   * settings panel). Typical choices: `new DexieAdapter()` (IndexedDB),
   * `new LocalStorageAdapter()`, or `new RestAdapter({ baseUrl })`.
   * If omitted, the Profiles panel shows its "not configured" empty state.
   */
  storageAdapter?: StorageAdapter;

  // AG-Grid passthrough
  rowHeight?: number;
  headerHeight?: number;
  animateRows?: boolean;
  sideBar?: SideBarDef | boolean;
  statusBar?: { statusPanels: StatusPanelDef[] };
  defaultColDef?: ColDef;
  onGridReady?: (event: GridReadyEvent) => void;

  // Style
  className?: string;
  style?: React.CSSProperties;
}
