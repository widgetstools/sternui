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
  /**
   * Field(s) on each row that uniquely identify it. Defaults to `'id'`.
   * A single column name keys rows by that field; an array of column
   * names produces a composite key (joined with `-`). Used by the
   * platform's `getRowId` and must match the worker-side cache key
   * produced by the data-plane Hub.
   */
  rowIdField?: string | readonly string[];
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
   * App identity — required when `storage` is a ConfigService-backed
   * factory. Scopes all profile writes so they land on the right app's
   * rows and never leak across apps sharing the same ConfigService.
   *
   * Typed as optional because pure-local-storage consumers don't need
   * it, but a runtime assertion inside `<MarketsGrid>` throws loudly
   * when `storage` is supplied without `appId`.
   */
  appId?: string;

  /**
   * User identity — required when `storage` is a ConfigService-backed
   * factory. Scopes profile writes to the signed-in user so different
   * users on the same machine see independent profile sets.
   *
   * Typed as optional because pure-local-storage consumers don't need
   * it, but a runtime assertion inside `<MarketsGrid>` throws loudly
   * when `storage` is supplied without `userId`.
   */
  userId?: string;

  /**
   * Storage adapter factory. When provided, takes precedence over
   * `storageAdapter`. Called internally with
   * `{ instanceId, appId, userId }` — consumers using
   * `createConfigServiceStorage()` get scoped writes without having
   * to re-close the factory on every userId change.
   *
   * Required companion props when this is set:
   *   - `appId`   — non-empty string
   *   - `userId`  — non-empty string
   * MarketsGrid throws at mount time if either is missing.
   *
   * Typical construction at app bootstrap:
   *   const storage = createConfigServiceStorage({ configManager });
   *   <MarketsGrid ... storage={storage} appId={...} userId={userId} />
   *
   * Same factory can be reused across many grids; each receives its
   * own `StorageAdapter` closed over the resolved
   * (instanceId, appId, userId) triple.
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

  /**
   * Opaque, top-level data persisted alongside the grid's profile-set
   * in the same backing storage row — but at the grid level, NOT
   * inside any particular profile. Used for state that must survive
   * profile switches (e.g. v2's data-provider selection:
   * `{ liveProviderId, historicalProviderId, mode }`).
   *
   * Treat this as a controlled prop: pass the current value in via
   * `gridLevelData`, receive the persisted value once via
   * `onGridLevelDataLoad`. MarketsGrid persists every subsequent
   * change to the prop via the configured storage adapter.
   *
   * Shape is opaque to MarketsGrid — consumers own the type. Set to
   * `null`/`undefined` to express "no value persisted yet".
   */
  gridLevelData?: unknown;

  /**
   * Fires once on mount after the storage adapter has resolved the
   * persisted grid-level-data value. Receives `null` when no value
   * has been written yet (or when the adapter doesn't implement
   * `loadGridLevelData`).
   *
   * Consumers typically `setState(loaded)` here to reconcile the
   * controlled `gridLevelData` prop with what's on disk.
   */
  onGridLevelDataLoad?: (data: unknown) => void;

  /**
   * Logical component name shown in the toolbar's grid-info popover
   * (the small ⓘ button next to the admin actions). Optional — when
   * omitted the popover still renders identity (path, instanceId,
   * appId, userId, gridId) without a heading. Set by hosting shells
   * that already know the route's display name (e.g. "MarketsGrid",
   * "FX Blotter").
   */
  componentName?: string;

  /**
   * Slot rendered in the grid's primary toolbar row, BEFORE the
   * filters/formatting toolbars. Used by `<MarketsGridContainer>` to
   * mount the data-provider toolbar (live/historical pickers, mode
   * toggle, refresh, edit) so it lives inside the grid's own chrome
   * rather than as a separate strip above it. Anything renderable;
   * `undefined` collapses the slot.
   *
   * The slot is hidden by default in v2 — the container only mounts
   * its toolbar when the user reveals it via the Alt+Shift+P chord
   * (a developer/support affordance, not surfaced to end users).
   */
  headerExtras?: import('react').ReactNode;

  /**
   * Optional caption rendered top-left, ABOVE the primary toolbar row,
   * but only when `tabsHidden` is also true. The intent: in the OpenFin
   * shell, when the user hides the view-tab strip the view loses its
   * built-in title affordance, so the host (`<HostedMarketsGrid>`)
   * passes its `componentName` (or an explicit `caption` override) down
   * here so the grid can re-surface the label inline.
   *
   * No new design-system primitive — rendered as a single styled span
   * using the existing token palette. When either prop is missing /
   * false, nothing renders and layout is byte-identical to today.
   */
  caption?: string;

  /**
   * Companion to `caption`. When true, the caption is rendered;
   * otherwise it is suppressed even if `caption` is set. Sourced from
   * `useTabsHidden()` upstream. Defaults to `false`.
   */
  tabsHidden?: boolean;
}

/**
 * Options passed into a `StorageAdapterFactory` at call time. MarketsGrid
 * populates `instanceId` from `instanceId ?? gridId`; `appId` and `userId`
 * come straight from the corresponding props.
 */
export interface StorageAdapterFactoryOpts {
  /** Resolved instance id — `instanceId ?? gridId`. Always present. */
  instanceId: string;
  /** Consumer-supplied app identity. Required for ConfigService-backed
   *  factories; factories that key only on instanceId (local storage,
   *  in-memory) can ignore. */
  appId?: string;
  /** Consumer-supplied user identity. Same story as `appId`. */
  userId?: string;
}

/**
 * Factory that returns a `StorageAdapter` scoped to the supplied opts.
 * Typically produced by helpers like `createConfigServiceStorage()`.
 *
 * MarketsGrid calls the factory ONCE when the effective opts change
 * (instanceId, appId, or userId swap). Same factory can produce many
 * independently-scoped adapters across the app's grid instances.
 */
export type StorageAdapterFactory = (opts: StorageAdapterFactoryOpts) => StorageAdapter;

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
