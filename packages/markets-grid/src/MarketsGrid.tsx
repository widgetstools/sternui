import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  DirtyDot,
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
import { Save, Check, Settings as SettingsIcon, Brush } from 'lucide-react';
import type {
  AdminAction,
  MarketsGridHandle,
  MarketsGridProps,
  StorageAdapterFactory,
} from './types';
import { useGridHost } from './useGridHost';
import { FiltersToolbar } from './FiltersToolbar';
import { FormattingToolbar, type FormattingToolbarHandle } from './FormattingToolbar';
import { SettingsSheet, type SettingsSheetHandle } from './SettingsSheet';
import { ProfileSelector } from './ProfileSelector';

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
    storage,
    onReady,
    adminActions,
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
      onGridReady(event);
      event.api.sizeColumnsToFit();
      onGridReadyProp?.(event);
    },
    [onGridReady, onGridReadyProp],
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

  // Storage precedence: factory > direct adapter > MemoryAdapter default.
  // Consumers typically use the factory (createConfigServiceStorage)
  // which closes over (appId, userId) at bootstrap and produces a
  // per-instance adapter here.
  const resolvedAdapter = useMemo<StorageAdapter | undefined>(() => {
    if (storage) return storage(effectiveInstanceId);
    return storageAdapter as StorageAdapter | undefined;
  }, [storage, storageAdapter, effectiveInstanceId]);

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
}) {
  // Construct a fallback adapter ONCE when the host doesn't provide one.
  // MemoryAdapter means changes don't persist across reloads — fine for
  // demos, tests, and consumers that want ephemeral state. Production
  // apps should pass `new DexieAdapter()`.
  const adapterRef = useRef<StorageAdapter | null>(null);
  if (!adapterRef.current) adapterRef.current = storageAdapter ?? new MemoryAdapter();

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

  // ── Imperative handle ─────────────────────────────────────────────
  // Populated once AG-Grid's onGridReady has fired (api becomes non-null)
  // which in turn has already let GridPlatform run the module pipeline,
  // including the active profile apply. Consumers reading `ref.current`
  // before this see `null` (React ref semantics); after this see the
  // stable handle. `onReady` fires exactly once per mount.
  const handleRef = useRef<MarketsGridHandle | null>(null);
  handleRef.current = api ? { gridApi: api, platform, profiles } : null;

  useImperativeHandle(
    forwardedRef,
    () => handleRef.current as MarketsGridHandle,
    [api, platform, profiles],
  );

  const readyFiredRef = useRef(false);
  useEffect(() => {
    if (!readyFiredRef.current && handleRef.current) {
      readyFiredRef.current = true;
      onReady?.(handleRef.current);
    }
  }, [api, onReady]);

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
  // Imperative handle into the SettingsSheet so the settings-icon
  // click handler can raise a buried popout window to front instead
  // of no-op-opening an already-open sheet. See handleOpenSettings
  // below for the full policy.
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
  // Imperative handle into the FormattingToolbar — same pattern as
  // sheetRef. The brush button uses `focusIfPopped()` to raise a
  // buried popout window before falling through to toggle.
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

  // Warn the user if they try to close / reload the tab while their
  // active profile has unsaved edits. The `returnValue` string is
  // ignored by every modern browser (they show a generic message) but
  // it's required for the prompt to appear at all.
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // Profile-switch unsaved-changes prompt state. When the user picks a
  // different profile from the switcher AND there are unsaved edits,
  // we stash the target id here and open an AlertDialog offering
  // Save / Discard / Cancel. The Dialog's action handlers finalise the
  // switch; with no dirty edits the switch goes through directly.
  const [pendingSwitch, setPendingSwitch] = useState<null | { id: string }>(null);

  const requestLoadProfile = useCallback(
    (id: string) => {
      if (id === profiles.activeProfileId) return;
      if (profiles.isDirty) {
        setPendingSwitch({ id });
        return;
      }
      void profiles.loadProfile(id);
    },
    [profiles],
  );

  const confirmSwitchSave = useCallback(async () => {
    if (!pendingSwitch) return;
    const targetId = pendingSwitch.id;
    setPendingSwitch(null);
    try {
      // Route through the same Save-button path so AG-Grid native state
      // (column widths / sort / filters / pagination) is captured before
      // the snapshot lands — otherwise a Save-then-Switch would persist
      // stale grid-state.
      await handleSaveAll();
      await profiles.loadProfile(targetId);
    } catch (err) {
      console.warn('[markets-grid] save-and-switch failed:', err);
    }
  }, [pendingSwitch, handleSaveAll, profiles]);

  const confirmSwitchDiscard = useCallback(async () => {
    if (!pendingSwitch) return;
    const targetId = pendingSwitch.id;
    setPendingSwitch(null);
    try {
      // Discard in-memory edits (reverts to the last-saved snapshot of
      // the outgoing profile) BEFORE loading the new one. The discard
      // is technically optional since load() also replaces state, but
      // it keeps semantics clean: dirty=false is observable in between.
      await profiles.discardActiveProfile();
      await profiles.loadProfile(targetId);
    } catch (err) {
      console.warn('[markets-grid] discard-and-switch failed:', err);
    }
  }, [pendingSwitch, profiles]);

  // NOTE: the `coreShim` (minimal `{ gridId, getGridApi }` handle) is
  // gone as of the toolbar refactor's step 7. FormattingToolbar + its
  // hooks now read everything they need directly from the platform
  // context, so there's nothing for this host to thread through.

  return (
    <div
      className={className}
      style={rootStyle}
      data-grid-id={gridId}
    >
      {showToolbar && (
        <div className="gc-toolbar-primary gc-primary-row">
          {/* LEFT — filters carousel (flex:1, collapses/expands via its
               own chevron; formatter-toolbar toggle no longer lives
               inside it). */}
          <div className="gc-primary-filters">
            {showFiltersToolbar ? (
              <FiltersToolbar />
            ) : (
              <div className="gc-primary-filters-empty" />
            )}
          </div>

          {/* RIGHT — action cluster. A single thin divider leads the
               group (instead of a full-height border on every button),
               then evenly-spaced icon buttons with matching chrome. */}
          <div className="gc-primary-actions">
            {showFormattingToolbar && (
              <button
                type="button"
                className="gc-primary-action"
                onClick={handleToggleStyleToolbar}
                title={styleToolbarOpen ? 'Hide formatting toolbar' : 'Show formatting toolbar'}
                data-testid="style-toolbar-toggle"
                data-active={styleToolbarOpen ? 'true' : 'false'}
                aria-pressed={styleToolbarOpen}
              >
                <Brush size={14} strokeWidth={2} />
              </button>
            )}

            {showProfileSelector && (
              <>
                {showFormattingToolbar && <span className="gc-primary-divider" aria-hidden />}
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
                      a.download = `gc-profile-${fileStem}.json`;
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
                <span className="gc-primary-divider" aria-hidden />
                <button
                  type="button"
                  className="gc-primary-action gc-primary-save"
                  onClick={handleSaveAll}
                  title={isDirty ? 'Save all settings (unsaved changes)' : 'Save all settings'}
                  data-testid="save-all-btn"
                  data-state={saveFlash ? 'saved' : isDirty ? 'dirty' : 'idle'}
                >
                  {saveFlash ? <Check size={14} strokeWidth={2.5} /> : <Save size={14} strokeWidth={2} />}
                  {/* Dirty indicator — small pulsed teal dot top-right of
                      the icon. Shown only when unsaved and NOT actively
                      flashing (to avoid stacking indicators during the
                      600ms post-save flash). */}
                  {isDirty && !saveFlash && (
                    <span className="gc-primary-save-dirty" data-testid="save-all-dirty">
                      <DirtyDot title="Unsaved changes" />
                    </span>
                  )}
                </button>
              </>
            )}

            {showSettingsButton && (
              <>
                <span className="gc-primary-divider" aria-hidden />
                <button
                  type="button"
                  className="gc-primary-action"
                  onClick={handleOpenSettings}
                  title="Open settings"
                  data-testid="v2-settings-open-btn"
                >
                  <SettingsIcon size={14} strokeWidth={2} />
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* FormattingToolbar — pinned as a second toolbar row directly
           beneath the FiltersToolbar. Visibility is bound to the
           existing Brush toggle in the FiltersToolbar
           (`styleToolbarOpen`). When the viewport is narrow the
           toolbar's flex-wrap kicks in and the row grows vertically
           (1 row → 2 rows) so no content is clipped.

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
        adminActions={adminActions}
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
