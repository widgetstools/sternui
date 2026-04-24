import type { ColDef, GridApi, SideBarDef, StatusPanelDef, Theme } from 'ag-grid-community';
import type { AnyModule, GridPlatform, UseProfileManagerResult } from '@marketsui/core';
import type { StorageAdapter } from '@marketsui/core';

/**
 * One saved filter pinned to the toolbar. Shape is stable across
 * schema versions so on-disk profile snapshots load cleanly.
 */
export interface SavedFilter {
  id: string;
  label: string;
  filterModel: Record<string, unknown>;
  active: boolean;
}

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

  // ── v2 additions (all optional, additive) ────────────────────────────

  /**
   * Stable identity for this instance when running inside a framework
   * that supplies one (OpenFin customData, app router, etc.). When
   * omitted, falls back to `gridId`.
   *
   * Used as the scope key for storage adapters — especially
   * `createConfigServiceStorage()` which keys UnifiedConfig rows by
   * `(appId, userId, instanceId)`.
   */
  instanceId?: string;

  /**
   * Storage adapter factory. When provided, takes precedence over
   * `storageAdapter`. Called internally with the resolved
   * `effectiveInstanceId = instanceId ?? gridId`.
   *
   * Typical construction at app bootstrap:
   *   const storage = createConfigServiceStorage({ baseUrl, appId, userId });
   *   <MarketsGrid ... storage={storage} />
   *
   * Same factory may be reused across many grids; each receives its own
   * `StorageAdapter` closed over the resolved instanceId.
   */
  storage?: StorageAdapterFactory;

  /**
   * Fires once per mount after: (1) AG-Grid is ready, (2) GridPlatform is
   * mounted, (3) the active profile has been applied. Receives a single
   * `MarketsGridHandle` aggregating AG-Grid's `GridApi`, our `GridPlatform`,
   * and the active `ProfileManager`.
   *
   * Equivalent to reading `ref.current` — same handle instance.
   */
  onReady?: (handle: MarketsGridHandle) => void;

  /**
   * Admin-tool entries exposed through the settings sheet's Tools menu.
   * When omitted or empty (or every entry has `visible: false`), the
   * Tools button is not rendered — end-user grids pay zero chrome cost.
   *
   * Consumer controls role gating per-entry via `visible`. MarketsGrid
   * knows nothing about roles or permissions.
   */
  adminActions?: AdminAction[];
}

/**
 * Factory that, given a resolved instanceId, returns a `StorageAdapter`
 * scoped to that instance. Produced by helpers like
 * `createConfigServiceStorage({ appId, userId })`.
 */
export type StorageAdapterFactory = (instanceId: string) => StorageAdapter;

/**
 * Imperative handle returned by `ref` / `onReady`. Bundles the three
 * things a consumer might reach for when interacting programmatically
 * with a MarketsGrid instance.
 */
export interface MarketsGridHandle {
  /** AG-Grid's GridApi — column manipulation, filters, sort, export, etc. */
  gridApi: GridApi;
  /** Our module-system handle — module state, transforms, expression engine. */
  platform: GridPlatform;
  /** The hook-shaped profile manager — `{ activeProfileId, profiles,
   *  isDirty, saveActiveProfile(), loadProfile(id), cloneProfile(…),
   *  deleteProfile(…), renameProfile(…), exportProfile(), importProfile(),
   *  … }`. This is `UseProfileManagerResult` (from @marketsui/core) rather
   *  than the raw ProfileManager class — matches how consumers already
   *  interact with profiles via the useProfileManager hook. */
  profiles: UseProfileManagerResult;
}

/**
 * An entry in the settings sheet's Tools menu. Used for admin-only
 * actions like "Open Config Browser", "Audit Log", "Perf Trace".
 *
 * MarketsGrid does not take a dep on any admin tool — consumers mount
 * those themselves and wire the launcher via `onClick`.
 */
export interface AdminAction {
  /** Stable id. Used for React keys + e2e testids (`admin-action-${id}`). */
  id: string;
  /** Human-readable label. */
  label: string;
  /** Icon ref (`mkt:*` or `lucide:*`). Default: `lucide:wrench`. */
  icon?: string;
  /** Muted subtitle below the label. Optional. */
  description?: string;
  /** Invoked when the user picks the action. Consumer decides what
   *  "launch" means — navigate, openfin window, modal, etc. */
  onClick: () => void | Promise<void>;
  /** When false, the entry is omitted from the dropdown. Default true. */
  visible?: boolean;
}
