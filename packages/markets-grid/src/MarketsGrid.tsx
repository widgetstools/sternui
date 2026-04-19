import { useCallback, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { AllEnterpriseModule, ModuleRegistry } from 'ag-grid-enterprise';
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
import { Save, Check, Settings, HelpCircle } from 'lucide-react';
import type { MarketsGridProps } from './types';
import { useGridHost } from './useGridHost';
import { SettingsSheet } from './SettingsSheet';
import { HelpPanel } from './HelpPanel';
import { ProfileSelector } from './ProfileSelector';

let _agRegistered = false;
function ensureAgGridRegistered() {
  if (_agRegistered) return;
  ModuleRegistry.registerModules([AllEnterpriseModule]);
  _agRegistered = true;
}

/**
 * Compact icon button used by the primary toolbar (Help / Settings).
 */
function ToolbarIconButton({
  children, onClick, title, testId, active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  testId?: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      data-testid={testId}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 26,
        height: 26,
        background: active ? 'var(--ck-surface, #1a1d21)' : 'transparent',
        color: active ? 'var(--ck-green, #22c55e)' : 'var(--ck-t1, #c4c9d0)',
        border: '1px solid var(--ck-border, #2d3339)',
        borderRadius: 2,
        cursor: 'pointer',
      }}
    >{children}</button>
  );
}

/**
 * Inject the cockpit design-system stylesheet once per document. Idempotent —
 * subsequent grids reuse the single `<style id="gc-cockpit-styles">` node.
 * Safe on SSR (no-ops when `document` is undefined).
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
 * Modules the grid ships with by default. Consumers can pass `modules={...}`
 * to override — the list is a pure value, not a singleton, so tests can
 * construct a minimal subset without import-order surprises.
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
    showSaveButton = true,
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
    (event: Parameters<NonNullable<typeof onGridReadyProp>>[0]) => {
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
        showSaveButton={showSaveButton}
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
 * Inner shell — runs INSIDE the GridProvider so it can call
 * `useProfileManager`. Split from the outer `MarketsGrid` for the same
 * reason panels are (hooks need the provider).
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
  showSaveButton,
  className,
  rootStyle,
  gridRef,
  storageAdapter,
  autoSaveDebounceMs,
}: {
  rowData: TData[];
  columnDefs: unknown[];
  gridOptions: Record<string, unknown>;
  handleGridReady: (event: Parameters<NonNullable<MarketsGridProps<TData>['onGridReady']>>[0]) => void;
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
  showSaveButton: boolean;
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

  const [saveFlash, setSaveFlash] = useState(false);
  const saveFlashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const platform = useGridPlatform();
  const api = useGridApi();

  // Settings sheet + help drawer.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const handleSaveAll = useCallback(async () => {
    // Capture the live grid state (columns / sort / filter / viewport) into
    // the grid-state module slice BEFORE persisting — saveActiveProfile
    // then serializes every module, so the fresh capture lands in the
    // profile snapshot on the same save.
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

  return (
    <div className={className} style={rootStyle} data-grid-id={gridId}>
      {showToolbar && (
        <div
          className="gc-toolbar-primary"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 12px',
            borderBottom: '1px solid var(--border, #313944)',
            background: 'var(--card, #161a1e)',
            flexShrink: 0,
          }}
        >
          <ProfileSelector profiles={profiles} />
          <div style={{ flex: 1 }} />
          <ToolbarIconButton
            title="Help"
            testId="help-btn"
            onClick={() => setHelpOpen((v) => !v)}
            active={helpOpen}
          >
            <HelpCircle size={13} strokeWidth={1.75} />
          </ToolbarIconButton>
          <ToolbarIconButton
            title="Settings"
            testId="settings-btn"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings size={13} strokeWidth={1.75} />
          </ToolbarIconButton>
          {showSaveButton && (
            <button
              type="button"
              onClick={handleSaveAll}
              title="Save profile"
              data-testid="save-all-btn"
              style={{
                height: 26,
                padding: '0 10px',
                background: 'var(--ck-green, #22c55e)',
                color: '#0b0e11',
                border: 'none',
                borderRadius: 2,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: 0.08,
                textTransform: 'uppercase',
                transition: 'background 150ms',
              }}
            >
              {saveFlash ? <Check size={12} strokeWidth={2.5} /> : <Save size={12} strokeWidth={2.25} />}
              <span>Save</span>
            </button>
          )}
        </div>
      )}

      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      {helpOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0, right: 0, bottom: 0,
            width: 'min(520px, 85vw)',
            background: 'var(--ck-bg)',
            borderLeft: '1px solid var(--ck-border)',
            zIndex: 60,
          }}
        >
          <HelpPanel onClose={() => setHelpOpen(false)} />
        </div>
      )}

      <div style={{ flex: 1 }}>
        <AgGridReact
          ref={gridRef}
          {...(gridOptions as Record<string, unknown>)}
          theme={theme}
          rowData={rowData}
          columnDefs={columnDefs as never}
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
    </div>
  );
}
