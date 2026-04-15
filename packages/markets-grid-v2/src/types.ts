import type { ReactNode, CSSProperties } from 'react';
import type {
  ColDef,
  ColGroupDef,
  GridReadyEvent,
  SideBarDef,
  StatusPanelDef,
  Theme,
} from 'ag-grid-community';
import type { AnyModule, StorageAdapter } from '@grid-customizer/core-v2';

/**
 * One captured grid filter the user has named and pinned to the toolbar.
 * Same shape v1 used (and the same shape the v1→v2 migration produces) so
 * existing profile snapshots load into v2 without any field renames.
 */
export interface SavedFilter {
  /** Stable id: `sf_<timestamp>_<rand>`. */
  id: string;
  /** User-editable label shown on the pill. */
  label: string;
  /** Snapshot of `gridApi.getFilterModel()` taken at capture time. */
  filterModel: Record<string, unknown>;
  /** Whether this filter is currently being applied to the grid. */
  active: boolean;
}

export interface MarketsGridV2Props<TData = unknown> {
  // ─── Required ──────────────────────────────────────────────────────────
  rowData: TData[];
  columnDefs: (ColDef<TData> | ColGroupDef)[];
  /** Result of `themeQuartz.withParams(...)` from ag-grid-community, or
   *  `'legacy'` to opt into AG-Grid's legacy CSS-only theming. */
  theme: Theme | 'legacy';
  /** Storage backend. v2 ships only `DexieAdapter` (IndexedDB). Required —
   *  the core-v2 profile manager has no localStorage cache fallback. */
  storageAdapter: StorageAdapter;

  // ─── Identity ──────────────────────────────────────────────────────────
  gridId?: string;
  /** Field on each row used to build a stable `getRowId`. Default: `'id'`. */
  rowIdField?: string;

  // ─── Modules ───────────────────────────────────────────────────────────
  /** Override the default module list. If omitted, host wires up the
   *  built-in 5 modules from `@grid-customizer/core-v2`. */
  modules?: AnyModule[];

  // ─── Feature toggles ───────────────────────────────────────────────────
  showToolbar?: boolean;
  /** Show the saved-filters toolbar (pills). */
  showFiltersToolbar?: boolean;
  /** Show the explicit Save button. With auto-save on, this is a "force
   *  flush + visible confirmation" affordance, not a correctness requirement. */
  showSaveButton?: boolean;
  /** Show the Settings button (opens the SettingsSheet drawer). Default true. */
  showSettingsButton?: boolean;
  /** Show the profile selector dropdown. */
  showProfileSelector?: boolean;
  /** Auto-save debounce window. Default 300ms. Set to 0 to write on every
   *  store change (use sparingly — IndexedDB doesn't love it). */
  autoSaveDebounceMs?: number;

  // ─── AG-Grid passthrough ───────────────────────────────────────────────
  rowHeight?: number;
  headerHeight?: number;
  animateRows?: boolean;
  sideBar?: SideBarDef | boolean;
  statusBar?: { statusPanels: StatusPanelDef[] };
  defaultColDef?: ColDef;
  onGridReady?: (event: GridReadyEvent) => void;

  // ─── Style ─────────────────────────────────────────────────────────────
  className?: string;
  style?: CSSProperties;
  /** Slot for any extra UI to render in the toolbar's right cluster. */
  toolbarExtras?: ReactNode;
}
