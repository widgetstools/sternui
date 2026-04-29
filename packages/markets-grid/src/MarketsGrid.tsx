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
import { AgGridReact } from 'ag-grid-react';
import { AllEnterpriseModule, ModuleRegistry } from 'ag-grid-enterprise';
import type { GridReadyEvent } from 'ag-grid-community';
import {
  GridProvider,
  MemoryAdapter,
  calculatedColumnsModule,
  captureGridStateInto,
  columnCustomizationModule,
  columnGroupsModule,
  columnTemplatesModule,
  conditionalStylingModule,
  generalSettingsModule,
  gridStateModule,
  savedFiltersModule,
  toolbarVisibilityModule,
  useGridApi,
  useGridPlatform,
  useProfileManager,
  cockpitCSS,
  COCKPIT_STYLE_ID,
  type AnyModule,
  type StorageAdapter,
} from '@marketsui/core';
import type {
  AdminAction,
  MarketsGridHandle,
  MarketsGridProps,
} from './types';
import { useGridHost } from './useGridHost';
import { FormattingToolbar, type FormattingToolbarHandle } from './FormattingToolbar';
import { SettingsSheet, type SettingsSheetHandle } from './SettingsSheet';
import { useGridLevelDataPersistence } from './hooks/useGridLevelDataPersistence';
import { useUnsavedChangesGuard } from './hooks/useUnsavedChangesGuard';
import { useImperativeMarketsGridHandle } from './hooks/useImperativeMarketsGridHandle';
import { useProfileSwitchGuard } from './hooks/useProfileSwitchGuard';
import { MarketsGridToolbar } from './internal/MarketsGridToolbar';
import { ProfileSwitchDialog } from './internal/ProfileSwitchDialog';

let _agRegistered = false;
function ensureAgGridRegistered() {
  if (_agRegistered) return;
  ModuleRegistry.registerModules([AllEnterpriseModule]);
  _agRegistered = true;
}

/**
 * Inject the cockpit design-system stylesheet once per document. Idempotent —
 * subsequent grids reuse the single `<style id="gc-cockpit-styles">` node.
 * SSR-safe: no-ops when `document` is undefined.
 */
function ensureCockpitStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(COCKPIT_STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = COCKPIT_STYLE_ID;
  el.textContent = cockpitCSS;
  document.head.appendChild(el);
}

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
    theme,
    gridId,
    rowIdField = 'id',
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
  } = props;

  ensureAgGridRegistered();
  ensureCockpitStyles();

  const gridRef = useRef<AgGridReact<TData>>(null);

  const { platform, columnDefs, gridOptions, onGridReady, onGridPreDestroyed } = useGridHost({
    gridId,
    rowIdField,
    modules,
    baseColumnDefs: baseColumnDefs as never,
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
  if (storage && (!appId || !userId)) {
    throw new Error(
      '<MarketsGrid storage={...}> requires `appId` and `userId` props. ' +
      'ConfigService-backed factories scope rows by (appId, userId, instanceId); ' +
      'without both identities the factory cannot produce a correctly-scoped adapter. ' +
      `Received: appId=${JSON.stringify(appId)}, userId=${JSON.stringify(userId)}.`,
    );
  }

  // Storage precedence: factory > direct adapter > MemoryAdapter default.
  // Factory receives an opts object carrying the resolved identity
  // triple; factories can ignore `appId`/`userId` if they only key on
  // instanceId (local-storage, in-memory), or honor them (ConfigService).
  const resolvedAdapter = useMemo<StorageAdapter | undefined>(() => {
    if (storage) return storage({ instanceId: effectiveInstanceId, appId, userId });
    return storageAdapter as StorageAdapter | undefined;
  }, [storage, storageAdapter, effectiveInstanceId, appId, userId]);

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
}) {
  // Construct a fallback adapter ONCE when the host doesn't provide one.
  // MemoryAdapter means changes don't persist across reloads — fine for
  // demos, tests, and consumers that want ephemeral state. Production
  // apps should pass `new DexieAdapter()`.
  const adapterRef = useRef<StorageAdapter | null>(null);
  if (!adapterRef.current) adapterRef.current = storageAdapter ?? new MemoryAdapter();

  // Grid-level data persistence (load on mount; save on prop change).
  useGridLevelDataPersistence({
    gridId,
    gridLevelData,
    onGridLevelDataLoad,
    adapter: adapterRef.current,
  });

  // Profiles are explicit-save-only. Auto-save used to debounce every
  // keystroke into the active profile; that was confusing in practice —
  // users lost the mental model of "my profile = my saved state". With
  // `disableAutoSave`, the ProfileManager instead tracks a dirty flag
  // the Save button consumes (and the profile-switch / beforeunload
  // guards below consult).
  const profiles = useProfileManager({
    adapter: adapterRef.current,
    autoSaveDebounceMs,
    disableAutoSave: true,
  });

  const platform = useGridPlatform();
  const api = useGridApi();

  // Imperative handle exposed via forwardRef + onReady (one-shot).
  useImperativeMarketsGridHandle({ forwardedRef, api, platform, profiles, onReady });

  const [saveFlash, setSaveFlash] = useState(false);
  const saveFlashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Clear the save-flash timer on unmount so we don't setState on a gone
  // component if the grid is torn down mid-flash (e.g. navigating away just
  // after clicking Save).
  useEffect(() => {
    return () => {
      if (saveFlashTimer.current) clearTimeout(saveFlashTimer.current);
    };
  }, []);

  // Settings sheet — the Cockpit popout drawer.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const sheetRef = useRef<SettingsSheetHandle>(null);

  const handleOpenSettings = useCallback(() => {
    // If the sheet is already popped out into an OS window that's
    // alive, raise it to front (it may be buried behind other
    // windows) and bail. Otherwise fall through to the normal
    // "open inline" path.
    if (sheetRef.current?.focusIfPopped()) return;
    setSettingsOpen(true);
  }, []);

  // Formatting toolbar — always starts hidden. The Brush button on the
  // FiltersToolbar toggles it. The `showFormattingToolbar` prop only
  // controls whether the feature is available (i.e. whether the Brush
  // pill + floating panel exist); it doesn't pre-open the toolbar.
  const [styleToolbarOpen, setStyleToolbarOpen] = useState(false);
  const toolbarRef = useRef<FormattingToolbarHandle>(null);

  const handleToggleStyleToolbar = useCallback(() => {
    // If the toolbar is popped into an OS window, a buried popout
    // should come to front on brush-click. Otherwise (or if focus
    // fails because the popout is gone), fall through to toggle.
    if (styleToolbarOpen && toolbarRef.current?.focusIfPopped()) return;
    setStyleToolbarOpen((p) => !p);
  }, [styleToolbarOpen]);

  const handleSaveAll = useCallback(async () => {
    // Capture native AG-Grid state (column order / widths / sort / filters /
    // pagination / selection / viewport) into the grid-state module slice
    // BEFORE persisting — the subsequent saveActiveProfile flush then picks
    // up this fresh capture alongside every other module's state. Auto-save
    // deliberately never runs this path; grid state is explicit-save-only.
    if (api) {
      try { captureGridStateInto(platform.store, api); }
      catch (err) { console.warn('[markets-grid] captureGridStateInto failed:', err); }
    }
    try {
      await profiles.saveActiveProfile();
    } catch (err) {
      console.warn('[markets-grid] saveActiveProfile failed:', err);
      return;
    }
    setSaveFlash(true);
    if (saveFlashTimer.current) clearTimeout(saveFlashTimer.current);
    saveFlashTimer.current = setTimeout(() => setSaveFlash(false), 600);
  }, [profiles, api, platform]);

  // Active profile dirty state — wired to the Save button indicator,
  // the profile-switch AlertDialog, and the beforeunload warning.
  const isDirty = profiles.isDirty;

  // Browser tab-close warning when the active profile is dirty.
  useUnsavedChangesGuard(isDirty);

  // Profile-switch unsaved-changes guard. Routes the dialog through
  // handleSaveAll so AG-Grid native state lands before the snapshot.
  const switchGuard = useProfileSwitchGuard(profiles, handleSaveAll);

  return (
    <div
      className={className}
      style={rootStyle}
      data-grid-id={gridId}
    >
      {/* Header extras — slot for consumer-supplied chrome that needs
           to live INSIDE the grid's frame but ABOVE the filters/format
           toolbars. The v2 data-plane container uses this for the
           data-provider picker (live + historical, mode toggle, refresh,
           edit). Hidden by default in v2; revealed only via Alt+Shift+P
           — a developer/support affordance, not surfaced to end users. */}
      {headerExtras ? (
        <div
          className="gc-toolbar-primary gc-primary-row"
          data-grid-header-extras
        >
          {headerExtras}
        </div>
      ) : null}
      {showToolbar && (
        <MarketsGridToolbar
          showFiltersToolbar={showFiltersToolbar}
          showFormattingToolbar={showFormattingToolbar}
          styleToolbarOpen={styleToolbarOpen}
          onToggleStyleToolbar={handleToggleStyleToolbar}
          showProfileSelector={showProfileSelector}
          profiles={profiles}
          isDirty={isDirty}
          requestLoadProfile={switchGuard.requestLoadProfile}
          showSaveButton={showSaveButton}
          saveFlash={saveFlash}
          onSaveAll={handleSaveAll}
          showSettingsButton={showSettingsButton}
          onOpenSettings={handleOpenSettings}
          adminActions={adminActions}
        />
      )}

      {/* FormattingToolbar — pinned as a second toolbar row directly
           beneath the FiltersToolbar. Visibility is bound to the
           Brush toggle in the toolbar above. When the viewport is
           narrow the toolbar's flex-wrap kicks in and the row grows
           vertically (1 row → 2 rows) so no content is clipped.

           DraggableFloat was replaced in favour of this pinned row —
           the float-style drag-to-reposition UX made the toolbar
           overlap narrow grid columns in multi-grid dashboards. */}
      {showFormattingToolbar && styleToolbarOpen && (
        <div
          className="gc-tb-pinned"
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

      <ProfileSwitchDialog
        open={switchGuard.pendingSwitch !== null}
        onCancel={switchGuard.cancelSwitch}
        onDiscard={() => void switchGuard.confirmSwitchDiscard()}
        onSave={() => void switchGuard.confirmSwitchSave()}
      />
    </div>
  );
}

// AdminActionButtons + ADMIN_ACTION_ICONS were extracted into
// ./internal/AdminActionButtons.tsx during Phase C-3.
// MarketsGridToolbar / ProfileSwitchDialog / ProfileSelectorBlock live
// under ./internal/ and the lifecycle hooks under ./hooks/.
