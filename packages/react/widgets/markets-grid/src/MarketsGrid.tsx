import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ForwardedRef,
  type ReactElement,
  type RefAttributes,
} from 'react';
import './grid-chrome.css';
import { AgGridReact } from 'ag-grid-react';
import { AllEnterpriseModule, ModuleRegistry } from 'ag-grid-enterprise';
import type { GridReadyEvent } from 'ag-grid-community';
import { StreamSafeTextFloatingFilter } from './streamSafeFloatingFilter';
import { StreamSafeNumberFloatingFilter } from './streamSafeNumberFloatingFilter';
import { useGridTheme } from './theme/useGridTheme.js';
import {
  type AnyModule,
  type StorageAdapter,
} from '@starui/core';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  GridProvider,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  calculatedColumnsModule,
  columnCustomizationModule,
  columnGroupsModule,
  columnTemplatesModule,
  conditionalStylingModule,
  generalSettingsModule,
  gridStateModule,
  savedFiltersModule,
  toolbarVisibilityModule,
} from '@starui/grid-react';
import {
  Save, Check, Settings as SettingsIcon, SlidersHorizontal,
  Wrench,
  Database,
  FileText,
  ListChecks,
  Activity,
  BarChart3,
  ShieldCheck,
  Users,
  Terminal,
  Eye,
  RefreshCw,
  Info,
  Pencil,
  type LucideIcon,
} from 'lucide-react';
import type {
  AdminAction,
  MarketsGridHandle,
  MarketsGridProps,
} from './types';
import { isMarketsGridLocalStorageStorageFactory } from './createMarketsGridLocalStorageStorage';
import { useGridHost } from './useGridHost';
import { FiltersToolbar } from './FiltersToolbar';
import { FormattingToolbar } from './FormattingToolbar';
import { SettingsSheet } from './SettingsSheet';
import { ProfileSelector } from './ProfileSelector';
import { useMarketsGridController } from './useMarketsGridController';

let _agRegistered = false;
function ensureAgGridRegistered() {
  if (_agRegistered) return;
  ModuleRegistry.registerModules([AllEnterpriseModule]);
  installAgGridSetFilterValidateGuard();
  _agRegistered = true;
}

/**
 * AG-Grid 35.1 bug — `SetFilterHandler.validateModel` iterates
 * `model.values` after a `model == null` early-return; an internal model
 * shape like `{ filterType: 'set' }` (no `values` key) slips past that
 * null-check and crashes with `model.values is not iterable`. The crash
 * lands inside an `AgPromise.then` callback, so it surfaces in React as
 * an "Uncaught" error and unmounts the `<AgGridReactUi>` subtree via the
 * error boundary.
 *
 * We can't reach `SetFilterHandler` directly (not in the public API), so
 * we install a window-level `error` listener that recognises this exact
 * AG-Grid bug and prevents it from propagating. The grid stays usable
 * and our own sanitisation paths continue to scrub stored models. Other
 * errors flow through unchanged.
 */
function installAgGridSetFilterValidateGuard(): void {
  if (typeof window === 'undefined') return;
  if ((window as Window & { __agSetFilterValidateGuard?: boolean }).__agSetFilterValidateGuard) {
    return;
  }
  (window as Window & { __agSetFilterValidateGuard?: boolean }).__agSetFilterValidateGuard = true;

  const matchesAgBug = (err: unknown): boolean => {
    if (!err) return false;
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes('model.values is not iterable')) return false;
    const stack = err instanceof Error ? err.stack ?? '' : '';
    return (
      stack.includes('SetFilterHandler') ||
      stack.includes('ag-grid-enterprise') ||
      stack.includes('validateModel')
    );
  };

  window.addEventListener(
    'error',
    (event) => {
      if (matchesAgBug(event.error ?? event.message)) {
        // eslint-disable-next-line no-console
        console.warn(
          '[MarketsGrid] Swallowed AG-Grid SetFilterHandler.validateModel bug — `model.values is not iterable`. The grid stays usable; this is a known AG-Grid 35.1 issue triggered by internal multi-filter slot validation.',
        );
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true,
  );

  window.addEventListener('unhandledrejection', (event) => {
    if (matchesAgBug(event.reason)) {
      // eslint-disable-next-line no-console
      console.warn(
        '[MarketsGrid] Swallowed AG-Grid SetFilterHandler.validateModel unhandled rejection.',
      );
      event.preventDefault();
    }
  });
}

// One-shot dev-only warning when the host forgets to pass `storage`
// (or the legacy `storageAdapter`). Module-scoped so the message fires
// at most once per page session even across many grid mounts. Reset
// only if the module is reloaded (HMR / a fresh page).
let _memoryAdapterWarned = false;

/**
 * Default module list — every shipped module, ordered the way the user's
 * profile round-trips expect. Hosts can pass `modules` to override.
 *
 * grid-state MUST run last (priority 200) so replay sees the finalized
 * column set from every structure module.
 */
export const DEFAULT_MODULES: AnyModule[] = [
  generalSettingsModule,
  columnTemplatesModule,
  columnCustomizationModule,
  calculatedColumnsModule,
  columnGroupsModule,
  conditionalStylingModule,
  savedFiltersModule,
  toolbarVisibilityModule,
  gridStateModule,
];

function MarketsGridInner<TData = unknown>(
  props: MarketsGridProps<TData>,
  ref: ForwardedRef<MarketsGridHandle>,
) {
  const {
    rowData,
    columnDefs: baseColumnDefs,
    theme: themeProp,
    gridId,
    rowIdField = 'id',
    appData,
    modules = DEFAULT_MODULES,
    rowHeight = 36,
    headerHeight = 32,
    animateRows = true,
    sideBar,
    statusBar,
    defaultColDef,
    showToolbar = true,
    showFiltersToolbar = false,
    showFormattingToolbar = false,
    showSaveButton = true,
    showSettingsButton = true,
    showProfileSelector = true,
    storageAdapter,
    autoSaveDebounceMs,
    onGridReady: onGridReadyProp,
    className,
    style,
    // v2 additions
    instanceId,
    appId,
    userId,
    storage,
    onReady,
    adminActions,
    gridLevelData,
    onGridLevelDataLoad,
    headerExtras,
    componentName,
    caption,
    tabsHidden,
    onCaptionChange,
    onSavingChange,
  } = props;

  ensureAgGridRegistered();

  // Canonical stern theme (dark/light follows `[data-theme]` on <html>).
  // Apps can still pass `theme` for one-off overrides, but the default
  // keeps every grid in lockstep with the host's theme attribute.
  const internalTheme = useGridTheme();
  const theme = themeProp ?? internalTheme;

  const gridRef = useRef<AgGridReact<TData>>(null);

  const { platform, columnDefs, gridOptions, onGridReady, onGridPreDestroyed } = useGridHost({
    gridId,
    rowIdField,
    modules,
    baseColumnDefs: baseColumnDefs as never,
    appData,
  });

  const handleGridReady = useCallback(
    (event: GridReadyEvent) => {
      // eslint-disable-next-line no-console
      console.log(`[v2/markets-grid] AG-Grid onGridReady gridId=%s rowIdField=%s columns=%d`,
        gridId, rowIdField, Array.isArray(columnDefs) ? columnDefs.length : 0);
      onGridReady(event);
      event.api.sizeColumnsToFit();
      onGridReadyProp?.(event);
    },
    [onGridReady, onGridReadyProp, gridId, rowIdField, columnDefs],
  );

  const rootStyle = useMemo(
    () => ({ display: 'flex', flexDirection: 'column' as const, height: '100%', ...style }),
    [style],
  );

  // Resolve effective instance id — framework-hosted widgets pass
  // `instanceId` explicitly (from customData / launch env). Standalone
  // consumers omit it; we fall back to `gridId` so the key is still
  // stable per-grid.
  const effectiveInstanceId = instanceId ?? gridId;

  // Required-companion assertion: a storage factory combined with an
  // empty identity is almost always a bug (rows land in whatever
  // scope the factory defaults to — usually "dev-host" — and get
  // mixed across users). Surface it loudly so the developer catches
  // the misconfiguration on first mount rather than shipping to
  // users who then wonder why profiles vanish.
  if (
    storage &&
    (!appId || !userId) &&
    !isMarketsGridLocalStorageStorageFactory(storage)
  ) {
    throw new Error(
      '<MarketsGrid storage={...}> requires `appId` and `userId` props unless `storage` is ' +
        '`createMarketsGridLocalStorageStorage()`. ConfigService-backed factories scope rows by ' +
        '(appId, userId, instanceId); without both identities the factory cannot produce a correctly-scoped adapter. ' +
        `Received: appId=${JSON.stringify(appId)}, userId=${JSON.stringify(userId)}.`,
    );
  }

  // Storage precedence: factory > direct adapter > MemoryAdapter default.
  // Factory receives an opts object carrying the resolved identity
  // triple; factories can ignore `appId`/`userId` if they only key on
  // instanceId (local-storage, in-memory), or honor them (ConfigService).
  const resolvedAdapter = useMemo<StorageAdapter | undefined>(() => {
    if (storage) return storage({ instanceId: effectiveInstanceId, appId, userId, gridId });
    return storageAdapter as StorageAdapter | undefined;
  }, [storage, storageAdapter, effectiveInstanceId, appId, userId, gridId]);

  // Dev-only nudge — when neither a `storage` factory nor a direct
  // `storageAdapter` is wired, the inner Host falls through to a
  // `MemoryAdapter` and every profile / layout / grid-level-data
  // change vanishes on reload. This is the half-day gotcha every new
  // framework consumer hits exactly once. Fire a single warn per
  // page session, only outside production builds.
  if (
    !storage &&
    !storageAdapter &&
    !_memoryAdapterWarned &&
    typeof process !== 'undefined' &&
    process.env?.NODE_ENV !== 'production'
  ) {
    _memoryAdapterWarned = true;
    // eslint-disable-next-line no-console
    console.warn(
      '[MarketsGrid] No storage prop provided. Using in-memory storage — ' +
      'profiles, layouts and grid-level-data WILL be lost on reload. ' +
      'Wire @starui/config-service via createConfigServiceStorage(...) to persist.',
    );
  }

  return (
    <GridProvider platform={platform}>
      <Host
        rowData={rowData}
        columnDefs={columnDefs}
        gridOptions={gridOptions}
        handleGridReady={handleGridReady}
        onGridPreDestroyed={onGridPreDestroyed}
        theme={theme}
        gridId={gridId}
        rowHeight={rowHeight}
        headerHeight={headerHeight}
        animateRows={animateRows}
        sideBar={sideBar}
        statusBar={statusBar}
        defaultColDef={defaultColDef}
        showToolbar={showToolbar}
        showFiltersToolbar={showFiltersToolbar}
        showFormattingToolbar={showFormattingToolbar}
        showSaveButton={showSaveButton}
        showSettingsButton={showSettingsButton}
        showProfileSelector={showProfileSelector}
        modules={modules}
        className={className}
        rootStyle={rootStyle}
        gridRef={gridRef}
        storageAdapter={resolvedAdapter}
        autoSaveDebounceMs={autoSaveDebounceMs}
        forwardedRef={ref}
        onReady={onReady}
        adminActions={adminActions}
        gridLevelData={gridLevelData}
        onGridLevelDataLoad={onGridLevelDataLoad}
        headerExtras={headerExtras}
        componentName={componentName}
        instanceId={instanceId}
        appId={appId}
        userId={userId}
        caption={caption}
        tabsHidden={tabsHidden}
        onCaptionChange={onCaptionChange}
        onSavingChange={onSavingChange}
      />
    </GridProvider>
  );
}

// Generic forwardRef cast — canonical TS workaround for typed generic handles.
// Consumers get correct inference on TData AND ref access to MarketsGridHandle.
export const MarketsGrid = forwardRef(MarketsGridInner) as <TData = unknown>(
  props: MarketsGridProps<TData> & RefAttributes<MarketsGridHandle>,
) => ReactElement;

/**
 * Inner shell — runs INSIDE the GridProvider so it can call hooks
 * (`useProfileManager`, `useGridApi`, `useGridPlatform`). Split from the
 * outer MarketsGrid because those hooks need the provider context.
 */
function Host<TData>({
  rowData,
  columnDefs,
  gridOptions,
  handleGridReady,
  onGridPreDestroyed,
  theme,
  gridId,
  rowHeight,
  headerHeight,
  animateRows,
  sideBar,
  statusBar,
  defaultColDef,
  showToolbar,
  showFiltersToolbar,
  showFormattingToolbar,
  showSaveButton,
  showSettingsButton,
  showProfileSelector,
  modules,
  className,
  rootStyle,
  gridRef,
  storageAdapter,
  autoSaveDebounceMs,
  forwardedRef,
  onReady,
  adminActions,
  gridLevelData,
  onGridLevelDataLoad,
  headerExtras,
  componentName,
  instanceId,
  appId,
  userId,
  caption,
  tabsHidden,
  onCaptionChange,
  onSavingChange,
}: {
  rowData: TData[];
  columnDefs: unknown[];
  gridOptions: Record<string, unknown>;
  handleGridReady: (event: GridReadyEvent) => void;
  onGridPreDestroyed: () => void;
  theme: MarketsGridProps<TData>['theme'];
  gridId: string;
  rowHeight: number;
  headerHeight: number;
  animateRows: boolean;
  sideBar: MarketsGridProps<TData>['sideBar'];
  statusBar: MarketsGridProps<TData>['statusBar'];
  defaultColDef: MarketsGridProps<TData>['defaultColDef'];
  showToolbar: boolean;
  showFiltersToolbar: boolean;
  showFormattingToolbar: boolean;
  showSaveButton: boolean;
  showSettingsButton: boolean;
  showProfileSelector: boolean;
  modules: AnyModule[];
  className: string | undefined;
  rootStyle: React.CSSProperties;
  gridRef: React.RefObject<AgGridReact<TData> | null>;
  storageAdapter: StorageAdapter | undefined;
  autoSaveDebounceMs: number | undefined;
  forwardedRef: ForwardedRef<MarketsGridHandle>;
  onReady: ((handle: MarketsGridHandle) => void) | undefined;
  adminActions: AdminAction[] | undefined;
  gridLevelData: unknown;
  onGridLevelDataLoad: ((data: unknown) => void) | undefined;
  headerExtras: import('react').ReactNode;
  componentName: string | undefined;
  instanceId: string | undefined;
  appId: string | undefined;
  userId: string | undefined;
  caption: string | undefined;
  tabsHidden: boolean | undefined;
  onCaptionChange: ((next: string) => void) | undefined;
  onSavingChange: ((saving: boolean) => void) | undefined;
}) {
  // All state, effects, refs, and side-effect callbacks live in the
  // controller hook (`./useMarketsGridController`). This component is
  // intentionally JSX-only: prop forwarding + the hook call. See the
  // hook for the full lifecycle (gridLevelData persistence,
  // ProfileManager wiring, imperative handle, save-flash, pending-
  // switch dialog state, etc.).
  const {
    profiles,
    api: _api,
    headerCaseAttr,
    sheetRef,
    toolbarRef,
    isDirty,
    saveFlash,
    settingsOpen,
    setSettingsOpen,
    styleToolbarOpen,
    pendingSwitch,
    setPendingSwitch,
    handleOpenSettings,
    handleToggleStyleToolbar,
    handleSaveAll,
    requestLoadProfile,
    confirmSwitchSave,
    confirmSwitchDiscard,
  } = useMarketsGridController({
    gridId,
    storageAdapter,
    autoSaveDebounceMs,
    forwardedRef,
    onReady,
    gridLevelData,
    onGridLevelDataLoad,
    onSavingChange,
  });
  // `api` is forwarded through the imperative handle from the hook —
  // the view doesn't consume it directly, but the destructure makes
  // it explicit that the hook owns this signal.
  void _api;

  return (
    <div
      className={className}
      style={rootStyle}
      data-grid-id={gridId}
      data-header-case={headerCaseAttr}
    >
      {/* Header extras — slot for consumer-supplied chrome that needs
           to live INSIDE the grid's frame but ABOVE the filters/format
           toolbars. The data-services container uses this for the
           data-provider picker (live + historical, mode toggle, refresh,
           edit). Hidden by default in v2; revealed only via Alt+Shift+P
           — a developer/support affordance, not surfaced to end users. */}
      {headerExtras ? (
        <div
          className="ds-toolbar-primary ds-primary-row"
          data-grid-header-extras
        >
          {headerExtras}
        </div>
      ) : null}
      {showToolbar && (
        <div className="ds-toolbar-primary ds-primary-row">
          {/* LEFT-MOST — editable caption surfaced when the host's
               OpenFin tab strip is hidden. Click reveals an inline edit
               icon; clicking the icon swaps the label for an input.
               The control persists committed edits via
               `onCaptionChange` when supplied. */}
          {tabsHidden ? (
            <EditableCaption
              caption={caption && caption.trim() ? caption : 'MarketsGrid'}
              onCaptionChange={onCaptionChange}
            />
          ) : null}
          {/* LEFT — filters carousel (flex:1, collapses/expands via its
               own chevron; formatter-toolbar toggle no longer lives
               inside it). */}
          <div className="ds-primary-filters">
            {showFiltersToolbar ? (
              <FiltersToolbar />
            ) : (
              <div className="ds-primary-filters-empty" />
            )}
          </div>

          {/* RIGHT — action cluster. A single thin divider leads the
               group (instead of a full-height border on every button),
               then evenly-spaced icon buttons with matching chrome. */}
          <div className="ds-primary-actions">
            {showFormattingToolbar && (
              <button
                type="button"
                className="ds-primary-action"
                onClick={handleToggleStyleToolbar}
                title={styleToolbarOpen ? 'Hide formatting toolbar' : 'Show formatting toolbar'}
                data-testid="style-toolbar-toggle"
                data-active={styleToolbarOpen ? 'true' : 'false'}
                aria-pressed={styleToolbarOpen}
              >
                <SlidersHorizontal size={14} strokeWidth={2} />
              </button>
            )}

            {showProfileSelector && (
              <>
                {showFormattingToolbar && <span className="ds-primary-divider" aria-hidden />}
                <ProfileSelector
                  profiles={profiles.profiles}
                  activeProfileId={profiles.activeProfileId ?? ''}
                  isDirty={isDirty}
                  onCreate={(name) => profiles.createProfile(name)}
                  onLoad={(id) => requestLoadProfile(id)}
                  onDelete={(id) => profiles.deleteProfile(id)}
                  onClone={async (id) => {
                    // Compose a unique " (copy)" name, de-duping against
                    // existing profiles so consecutive clones produce
                    // "…(copy)", "…(copy 2)", "…(copy 3)". The manager
                    // throws on id collision, so we also suffix the id
                    // deterministically via the default slug; if it
                    // still collides (edge case: user already made a
                    // "<foo>-copy"), bump the suffix until it's free.
                    try {
                      const src = profiles.profiles.find((p) => p.id === id);
                      if (!src) return;
                      const existingNames = new Set(profiles.profiles.map((p) => p.name));
                      let candidate = `${src.name} (copy)`;
                      let n = 2;
                      while (existingNames.has(candidate)) {
                        candidate = `${src.name} (copy ${n})`;
                        n++;
                      }
                      await profiles.cloneProfile(id, candidate);
                    } catch (err) {
                      console.warn('[markets-grid] profile clone failed:', err);
                      window.alert(`Could not clone profile: ${err instanceof Error ? err.message : String(err)}`);
                    }
                  }}
                  onRename={async (id, name) => {
                    try {
                      await profiles.renameProfile(id, name);
                    } catch (err) {
                      console.warn('[markets-grid] profile rename failed:', err);
                      window.alert(`Could not rename profile: ${err instanceof Error ? err.message : String(err)}`);
                    }
                  }}
                  onExport={async (id) => {
                    try {
                      const payload = await profiles.exportProfile(id);
                      const fileStem = (payload.profile.name || id)
                        .toLowerCase()
                        .replace(/[^a-z0-9-]+/g, '-')
                        .replace(/^-+|-+$/g, '')
                        .slice(0, 60) || 'profile';
                      const json = JSON.stringify(payload, null, 2);
                      const blob = new Blob([json], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `ds-profile-${fileStem}.json`;
                      document.body.appendChild(a);
                      a.click();
                      a.remove();
                      // Release the object-url on the next tick so the
                      // browser has a frame to initiate the download.
                      setTimeout(() => URL.revokeObjectURL(url), 1000);
                    } catch (err) {
                      console.warn('[markets-grid] profile export failed:', err);
                      window.alert(`Could not export profile: ${err instanceof Error ? err.message : String(err)}`);
                    }
                  }}
                  onImport={async (file) => {
                    try {
                      const text = await file.text();
                      const payload = JSON.parse(text);
                      await profiles.importProfile(payload);
                    } catch (err) {
                      console.warn('[markets-grid] profile import failed:', err);
                      window.alert(`Could not import profile: ${err instanceof Error ? err.message : String(err)}`);
                    }
                  }}
                />
              </>
            )}

            {showSaveButton && (
              <>
                <span className="ds-primary-divider" aria-hidden />
                <button
                  type="button"
                  className="ds-primary-action ds-primary-save"
                  onClick={handleSaveAll}
                  title={isDirty ? 'Save all settings (unsaved changes)' : 'Save all settings'}
                  data-testid="save-all-btn"
                  data-state={saveFlash ? 'saved' : isDirty ? 'dirty' : 'idle'}
                >
                  {saveFlash ? <Check size={14} strokeWidth={2.5} /> : <Save size={14} strokeWidth={2} />}
                </button>
              </>
            )}

            {showSettingsButton && (
              <>
                <span className="ds-primary-divider" aria-hidden />
                <button
                  type="button"
                  className="ds-primary-action"
                  onClick={handleOpenSettings}
                  title="Open settings"
                  data-testid="v2-settings-open-btn"
                >
                  <SettingsIcon size={14} strokeWidth={2} />
                </button>
              </>
            )}

            {/* Admin actions — rendered at the far right edge of the
                primary row. Each visible action becomes a single icon
                button with tooltip = label + description. The leading
                divider only renders when there's something to show; end-
                user grids (no adminActions) see zero extra chrome. */}
            <AdminActionButtons actions={adminActions} />

            {/* Grid-info popover — small ⓘ button that surfaces
                identity (path, instanceId, appId, userId, gridId) for
                support / debugging. Replaces the legacy hover-to-
                reveal overlay that used to live in the host shell. */}
            <GridInfoButton
              componentName={componentName}
              gridId={gridId}
              instanceId={instanceId}
              appId={appId}
              userId={userId}
            />
          </div>
        </div>
      )}

      {/* FormattingToolbar — pinned as a second toolbar row directly
           beneath the FiltersToolbar. Visibility is bound to the
           existing formatter toggle in the FiltersToolbar
           (`styleToolbarOpen`). When the viewport is narrow the
           toolbar's flex-wrap kicks in and the row grows vertically
           (1 row → 2 rows) so no content is clipped.

           DraggableFloat was replaced in favour of this pinned row —
           the float-style drag-to-reposition UX made the toolbar
           overlap narrow grid columns in multi-grid dashboards. */}
      {showFormattingToolbar && styleToolbarOpen && (
        <div
          className="ds-tb-pinned"
          data-testid="formatting-toolbar-pinned"
          style={{ flexShrink: 0 }}
        >
          <FormattingToolbar ref={toolbarRef} />
        </div>
      )}

      <div style={{ flex: 1 }}>
        <AgGridReact
          ref={gridRef}
          // Spread the module-pipeline options FIRST so explicit host props
          // (rowHeight / headerHeight / animateRows / etc.) win on conflict —
          // the consumer's prop is authoritative unless a module deliberately
          // wants to override it.
          {...(gridOptions as Record<string, unknown>)}
          theme={theme}
          rowData={rowData}
          columnDefs={columnDefs as never}
          // `maintainColumnOrder: true` preserves the user's drag-reordered
          // column positions when `columnDefs` re-derives (every module-state
          // change). AG-Grid's default would match the current columnDefs
          // order on every update, resetting the user's drag reorders.
          maintainColumnOrder
          rowHeight={rowHeight}
          headerHeight={headerHeight}
          animateRows={animateRows}
          cellSelection={true}
          sideBar={sideBar}
          statusBar={statusBar}
          defaultColDef={defaultColDef}
          // Suppress AG-Grid's built-in "No Rows To Show" overlay —
          // the container's own loading overlay covers the empty
          // state during snapshot fetch, and consumers handle the
          // truly-empty case themselves.
          suppressNoRowsOverlay={true}
          // Belt-and-suspenders: blank the template too in case the
          // option name is renamed in a future AG-Grid version.
          overlayNoRowsTemplate=" "
          // Coalesce live-update transactions every 100ms instead of
          // AG-Grid's 60ms default. Higher value → fewer main-thread
          // tasks under fast feeds (each task processes more rows but
          // they fire less often), reducing the rate of >50ms
          // "message handler" violations. 100ms is comfortably under
          // human-perceivable lag (~150ms threshold).
          asyncTransactionWaitMillis={100}
          // Register custom AG-Grid component types referenced by name
          // from colDef. `streamSafeText` is our focus-aware floating
          // filter that ignores onParentModelChanged while the input
          // has focus — defends against the multi-filter set-sub-filter
          // mid-typing input clobber on streaming-data grids.
          components={{
            streamSafeText: StreamSafeTextFloatingFilter,
            streamSafeNumber: StreamSafeNumberFloatingFilter,
          }}
          onGridReady={handleGridReady}
          onGridPreDestroyed={onGridPreDestroyed}
        />
      </div>

      <SettingsSheet
        ref={sheetRef}
        modules={modules}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        initialModuleId="conditional-styling"
      />

      {/* Unsaved-changes prompt fired by the profile switcher when the
          user picks a different profile while the active one is dirty.
          Three explicit actions — we never silently drop edits. */}
      <AlertDialog
        open={pendingSwitch !== null}
        onOpenChange={(open) => {
          if (!open) setPendingSwitch(null);
        }}
      >
        <AlertDialogContent data-testid="profile-switch-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes in the current profile. What do you want to
              do before switching?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="profile-switch-cancel">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              data-testid="profile-switch-discard"
              onClick={(e) => {
                e.preventDefault();
                void confirmSwitchDiscard();
              }}
            >
              Discard changes
            </AlertDialogAction>
            <AlertDialogAction
              data-testid="profile-switch-save"
              onClick={(e) => {
                e.preventDefault();
                void confirmSwitchSave();
              }}
            >
              Save &amp; switch
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Admin action rendering ────────────────────────────────────────
//
// `adminActions` on <MarketsGrid> is surfaced as one icon button per
// action on the right edge of the primary toolbar row. Consumers get
// immediate, one-click access without opening the settings sheet.
// When no visible actions are passed, the divider + buttons are all
// omitted so end-user grids carry zero extra chrome.

/** Map of `"lucide:<name>"` to the concrete lucide-react icon component.
 *  Kept inline (rather than dynamic `lucide-react/dist/esm/icons`) to
 *  avoid bundling all 1500+ lucide icons. New entries land here as
 *  needed — `icon: "lucide:<unknown>"` falls back to Wrench. */
const ADMIN_ACTION_ICONS: Record<string, LucideIcon> = {
  'lucide:database':     Database,
  'lucide:file-text':    FileText,
  'lucide:list-checks':  ListChecks,
  'lucide:activity':     Activity,
  'lucide:bar-chart-3':  BarChart3,
  'lucide:shield-check': ShieldCheck,
  'lucide:users':        Users,
  'lucide:terminal':     Terminal,
  'lucide:eye':          Eye,
  'lucide:wrench':       Wrench,
  'lucide:refresh-cw':   RefreshCw,
};

function resolveAdminActionIcon(ref: string | undefined): LucideIcon {
  if (!ref) return Wrench;
  return ADMIN_ACTION_ICONS[ref] ?? Wrench;
}

// ─── Grid-info popover ──────────────────────────────────────────────
//
// Small ⓘ button rendered immediately after the admin-action cluster.
// Click reveals a popover with the identity tuple — replaces the older
// auto-hide hover overlay that lived on the host shell. shadcn Popover
// from @starui/core, all colors via design-system CSS variables so
// dark/light theme switching is automatic.

function GridInfoButton({
  componentName,
  gridId,
  instanceId,
  appId,
  userId,
}: {
  componentName: string | undefined;
  gridId: string;
  instanceId: string | undefined;
  appId: string | undefined;
  userId: string | undefined;
}) {
  const path = typeof window !== 'undefined' ? window.location.pathname : '';
  const resolvedInstanceId = instanceId ?? gridId;
  return (
    <>
      <span className="ds-primary-divider" aria-hidden />
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="ds-primary-action"
            title="Grid info"
            aria-label="Grid info"
            data-testid="grid-info-btn"
          >
            <Info size={14} strokeWidth={2} />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={6}
          className="w-[360px] p-0 text-xs"
          data-ds-settings
        >
          {componentName && (
            <div
              className="px-3 py-2 border-b text-[13px] font-semibold"
              style={{
                color: 'var(--ds-text-primary)',
                borderColor: 'var(--ds-border-primary)',
              }}
            >
              {componentName}
            </div>
          )}
          <div className="px-3 py-2 flex flex-col gap-1.5">
            <InfoRow label="path"        value={path}                mono />
            <InfoRow label="instanceId"  value={resolvedInstanceId}  mono />
            <InfoRow label="gridId"      value={gridId}              mono />
            <InfoRow label="appId"       value={appId ?? '—'} />
            <InfoRow label="userId"      value={userId ?? '—'} />
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
}

function InfoRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-2 min-w-0">
      <span
        className="shrink-0"
        style={{
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: 0.6,
          textTransform: 'uppercase',
          color: 'var(--ds-text-faint)',
          width: 80,
        }}
      >
        {label}
      </span>
      <span
        className="min-w-0 truncate"
        title={value}
        style={{
          color: 'var(--ds-text-primary)',
          fontFamily: mono
            ? "'JetBrains Mono', 'IBM Plex Mono', ui-monospace, monospace"
            : 'inherit',
          fontSize: 12,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function AdminActionButtons({ actions }: { actions: AdminAction[] | undefined }) {
  const visible = (actions ?? []).filter((a) => a.visible !== false);
  if (visible.length === 0) return null;

  return (
    <>
      <span className="ds-primary-divider" aria-hidden />
      {visible.map((action) => {
        const Icon = resolveAdminActionIcon(action.icon);
        // Tooltip shows label and description stacked. Native `title`
        // keeps it accessible without portaling a shadcn Tooltip in.
        const title = action.description
          ? `${action.label}\n${action.description}`
          : action.label;
        return (
          <button
            key={action.id}
            type="button"
            className="ds-primary-action"
            onClick={() => { void action.onClick(); }}
            title={title}
            aria-label={action.label}
            data-testid={`admin-action-${action.id}`}
          >
            <Icon size={14} strokeWidth={2} />
          </button>
        );
      })}
    </>
  );
}

// ─── Editable caption ──────────────────────────────────────────────
//
// Inline label rendered at the left edge of the primary toolbar row
// when the host OpenFin window has hidden its tab strip. The default
// value comes from the `caption` prop (typically the host component
// name); clicking the pencil icon — only visible on hover — swaps the
// label for an input. Enter or blur commits; Escape cancels. Edits
// are held as local state and propagated upward via `onCaptionChange`
// so the host can persist them (e.g. as `gridLevelData`).

function EditableCaption({
  caption,
  onCaptionChange,
}: {
  caption: string;
  onCaptionChange: ((next: string) => void) | undefined;
}) {
  // `value` seeds from the prop on mount and every time the prop
  // changes (e.g. host swaps `componentName`). User edits update the
  // local state and fire `onCaptionChange` on commit; if the host
  // doesn't echo the new value back via the prop, the local state
  // still wins on subsequent renders thanks to the second-arg gate.
  const [value, setValue] = useState(caption);
  const lastPropRef = useRef(caption);
  useEffect(() => {
    if (lastPropRef.current !== caption) {
      lastPropRef.current = caption;
      setValue(caption);
    }
  }, [caption]);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(caption);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const startEdit = useCallback(() => {
    setDraft(value);
    setEditing(true);
  }, [value]);

  const commit = useCallback(() => {
    const next = draft.trim();
    setEditing(false);
    if (!next || next === value) return;
    setValue(next);
    onCaptionChange?.(next);
  }, [draft, value, onCaptionChange]);

  const cancel = useCallback(() => {
    setDraft(value);
    setEditing(false);
  }, [value]);

  // Auto-focus + select-all when entering edit mode so the user can
  // either overwrite immediately or click to position the caret.
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  if (editing) {
    return (
      <div
        data-grid-caption
        data-editing="true"
        style={{
          display: 'flex',
          alignItems: 'center',
          marginLeft: 8,
          marginRight: 8,
        }}
      >
        <Input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              cancel();
            }
          }}
          style={{ width: 160, height: 22, fontSize: 12, fontWeight: 600 }}
          data-testid="grid-caption-input"
        />
      </div>
    );
  }

  return (
    <div
      data-grid-caption
      className="group"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        marginLeft: 8,
        marginRight: 8,
        fontSize: 12,
        fontWeight: 600,
        color: 'var(--ds-text-primary)',
      }}
    >
      <span data-testid="grid-caption-text">{value}</span>
      <button
        type="button"
        onClick={startEdit}
        title="Rename"
        aria-label="Rename caption"
        data-testid="grid-caption-edit-btn"
        // The pencil only appears on hover of the caption cluster;
        // tab-key focus also reveals it for keyboard users.
        className="opacity-0 group-hover:opacity-100 focus:opacity-100"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 18,
          height: 18,
          padding: 0,
          background: 'transparent',
          border: 'none',
          color: 'var(--ds-text-muted)',
          cursor: 'pointer',
        }}
      >
        <Pencil size={12} strokeWidth={2} />
      </button>
    </div>
  );
}
