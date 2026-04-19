import { useCallback, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { AllEnterpriseModule, ModuleRegistry } from 'ag-grid-enterprise';
import {
  GridProvider,
  MemoryAdapter,
  columnCustomizationModule,
  columnTemplatesModule,
  conditionalStylingModule,
  generalSettingsModule,
  useProfileManager,
  cockpitCSS,
  COCKPIT_STYLE_ID,
  type AnyModule,
  type StorageAdapter,
} from '@grid-customizer/core';
import { Save, Check } from 'lucide-react';
import type { MarketsGridProps } from './types';
import { useGridHost } from './useGridHost';

let _agRegistered = false;
function ensureAgGridRegistered() {
  if (_agRegistered) return;
  ModuleRegistry.registerModules([AllEnterpriseModule]);
  _agRegistered = true;
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
  conditionalStylingModule,
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

  const handleSaveAll = useCallback(async () => {
    try {
      await profiles.saveActiveProfile();
    } catch (err) {
      console.warn('[markets-grid] saveActiveProfile failed:', err);
      return;
    }
    setSaveFlash(true);
    if (saveFlashTimer.current) clearTimeout(saveFlashTimer.current);
    saveFlashTimer.current = setTimeout(() => setSaveFlash(false), 600);
  }, [profiles]);

  return (
    <div className={className} style={rootStyle} data-grid-id={gridId}>
      {showToolbar && (
        <div
          className="gc-toolbar-primary"
          style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}
        >
          <div style={{ flex: '1 1 0px', minWidth: 0 }} />
          {showSaveButton && (
            <button
              type="button"
              onClick={handleSaveAll}
              title="Save all settings"
              data-testid="save-all-btn"
              style={{
                height: 44,
                padding: '0 10px',
                background: 'var(--card, #161a1e)',
                borderBottom: '1px solid var(--border, #313944)',
                border: 'none',
                borderLeft: '1px solid var(--border, #313944)',
                color: saveFlash ? 'var(--primary, #14b8a6)' : 'var(--muted-foreground, #a0a8b4)',
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
