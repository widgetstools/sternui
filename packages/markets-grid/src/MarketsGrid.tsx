import { useCallback, useMemo, useRef, useState } from 'react';
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
} from '@grid-customizer/core';
import { Save, Check, Settings as SettingsIcon } from 'lucide-react';
import type { MarketsGridProps } from './types';
import { useGridHost } from './useGridHost';
import { FiltersToolbar } from './FiltersToolbar';
import { FormattingToolbar } from './FormattingToolbar';
import { DraggableFloat } from './DraggableFloat';
import { SettingsSheet } from './SettingsSheet';
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

export function MarketsGrid<TData = unknown>(props: MarketsGridProps<TData>) {
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
        storageAdapter={storageAdapter as StorageAdapter | undefined}
        autoSaveDebounceMs={autoSaveDebounceMs}
      />
    </GridProvider>
  );
}

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
}) {
  // Construct a fallback adapter ONCE when the host doesn't provide one.
  // MemoryAdapter means changes don't persist across reloads — fine for
  // demos, tests, and consumers that want ephemeral state. Production
  // apps should pass `new DexieAdapter()`.
  const adapterRef = useRef<StorageAdapter | null>(null);
  if (!adapterRef.current) adapterRef.current = storageAdapter ?? new MemoryAdapter();

  const profiles = useProfileManager({
    adapter: adapterRef.current,
    autoSaveDebounceMs,
  });

  const platform = useGridPlatform();
  const api = useGridApi();

  const [saveFlash, setSaveFlash] = useState(false);
  const saveFlashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Settings sheet — the Cockpit popout drawer.
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Formatting toolbar — always starts hidden. The Brush button on the
  // FiltersToolbar toggles it. The `showFormattingToolbar` prop only
  // controls whether the feature is available (i.e. whether the Brush
  // pill + floating panel exist); it doesn't pre-open the toolbar.
  const [styleToolbarOpen, setStyleToolbarOpen] = useState(false);

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

  // Active profile dirty hint — not wired yet (auto-save makes it subtle).
  // Exposed as a constant false so the save button's colour is stable.
  const isDirty = false;

  // v2 compat core shim — ProfileSelector / SettingsSheet accept it.
  const coreShim = useMemo(
    () => ({
      gridId: platform.gridId,
      getGridApi: () => platform.api.api,
    }),
    [platform],
  );

  return (
    <div
      className={className}
      style={rootStyle}
      data-grid-id={gridId}
    >
      {showToolbar && (
        <div
          className="gc-toolbar-primary"
          style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}
        >
          <div style={{ flex: '1 1 0px', minWidth: 0, overflowX: 'clip' }}>
            {showFiltersToolbar ? (
              <FiltersToolbar
                styleToolbarOpen={showFormattingToolbar ? styleToolbarOpen : undefined}
                onToggleStyleToolbar={
                  showFormattingToolbar ? () => setStyleToolbarOpen((p) => !p) : undefined
                }
              />
            ) : (
              <div
                style={{
                  height: 44,
                  borderBottom: '1px solid var(--border, #313944)',
                  background: 'var(--card, #161a1e)',
                }}
              />
            )}
          </div>

          {showProfileSelector && (
            <div
              className="gc-profile-badge"
              style={{
                height: 44,
                padding: '0 10px',
                background: 'var(--card, #161a1e)',
                borderBottom: '1px solid var(--border, #313944)',
                borderLeft: '1px solid var(--border, #313944)',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <ProfileSelector
                profiles={profiles.profiles}
                activeProfileId={profiles.activeProfileId ?? ''}
                isDirty={isDirty}
                onCreate={(name) => profiles.createProfile(name)}
                onLoad={(id) => profiles.loadProfile(id)}
                onDelete={(id) => profiles.deleteProfile(id)}
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
            </div>
          )}

          {showSaveButton && (
            <button
              type="button"
              onClick={handleSaveAll}
              title={isDirty ? 'Save all settings (unsaved changes)' : 'Save all settings'}
              data-testid="save-all-btn"
              style={{
                height: 44,
                padding: '0 10px',
                background: 'var(--card, #161a1e)',
                borderBottom: '1px solid var(--border, #313944)',
                border: 'none',
                borderLeft: '1px solid var(--border, #313944)',
                color: saveFlash
                  ? 'var(--bn-green, #2dd4bf)'
                  : isDirty
                    ? 'var(--bn-yellow, #f0b90b)'
                    : 'var(--muted-foreground, #a0a8b4)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 11,
                fontWeight: 500,
                transition: 'color 150ms',
              }}
            >
              {saveFlash ? <Check size={13} strokeWidth={2.5} /> : <Save size={13} strokeWidth={1.75} />}
              <span>Save</span>
            </button>
          )}

          {showSettingsButton && (
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              title="Open settings"
              data-testid="v2-settings-open-btn"
              style={{
                height: 44,
                padding: '0 10px',
                background: 'var(--card, #161a1e)',
                borderBottom: '1px solid var(--border, #313944)',
                border: 'none',
                borderLeft: '1px solid var(--border, #313944)',
                color: 'var(--muted-foreground, #a0a8b4)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 11,
                fontWeight: 500,
                transition: 'color 150ms',
              }}
            >
              <SettingsIcon size={13} strokeWidth={1.75} />
              <span>Settings</span>
            </button>
          )}
        </div>
      )}

      {showFormattingToolbar && (
        <DraggableFloat
          open={styleToolbarOpen}
          onClose={() => setStyleToolbarOpen(false)}
          headless
          data-testid="formatting-toolbar-float"
        >
          {/* Inline row: drag handle | formatter toolbar | close button.
              Panel sizes to the toolbar's natural content width; when that
              exceeds the viewport, the toolbar's own `overflow-x-auto`
              kicks in while the handle + close remain pinned. */}
          <div
            style={{
              display: 'flex',
              alignItems: 'stretch',
              maxWidth: 'calc(100vw - 32px)',
              borderRadius: 6,
              overflow: 'hidden',
            }}
          >
            <DraggableFloat.DragHandle
              data-testid="formatting-toolbar-float-handle"
              style={{
                width: 22,
                flexShrink: 0,
                borderRight: '1px solid var(--border, #313944)',
                background: 'var(--card, #161a1e)',
              }}
            />
            <FormattingToolbar core={coreShim} store={platform.store} />
            <DraggableFloat.CloseButton
              data-testid="formatting-toolbar-float-close"
              size={14}
              style={{
                width: 36,
                height: 'auto',
                borderRadius: 0,
                borderLeft: '1px solid var(--border, #313944)',
                background: 'var(--card, #161a1e)',
                flexShrink: 0,
              }}
            />
          </div>
        </DraggableFloat>
      )}

      <div style={{ flex: 1 }}>
        <AgGridReact
          ref={gridRef}
          // Spread the module-pipeline options FIRST so explicit host props
          // (rowHeight / headerHeight / animateRows / etc.) win on conflict —
          // preserves v1 ergonomics where the consumer's prop is authoritative
          // unless a module deliberately wants to override it.
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
        core={coreShim}
        store={platform.store}
        modules={modules}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        initialModuleId="conditional-styling"
      />
    </div>
  );
}
