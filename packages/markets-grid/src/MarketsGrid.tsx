import React, { useCallback, useRef, useMemo, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { AllEnterpriseModule, ModuleRegistry } from 'ag-grid-enterprise';
import type { GridReadyEvent, GetRowIdParams } from 'ag-grid-community';
import {
  useGridCustomizer,
  allModules as defaultModules,
  SettingsSheet,
  useModuleState,
  type ToolbarVisibilityState,
} from '@grid-customizer/core';
import type { MarketsGridProps, SavedFilter, ToolbarSlotConfig } from './types';
import { Save, Check, X, Brush } from 'lucide-react';
import { FormattingToolbar } from './FormattingToolbar';
import { FiltersToolbar } from './FiltersToolbar';
import { ProfileSelector } from './ProfileSelector';

// Register AG-Grid Enterprise once
ModuleRegistry.registerModules([AllEnterpriseModule]);

// Stable getRowId — defined outside component for referential stability
function createGetRowId(field: string) {
  return (params: GetRowIdParams) => String(params.data[field]);
}

// Built-in Style toolbar slot — surfaced as a togglable pill alongside
// any consumer-provided extra toolbars.
const STYLE_TOOLBAR_ID = 'style';

export function MarketsGrid<TData = any>({
  // Required
  rowData,
  columnDefs: baseColumnDefs,
  theme,
  // Identity
  gridId = 'default',
  rowIdField = 'id',
  // Features
  modules,
  showToolbar = true,
  showSettingsButton = true,
  persistState = true,
  extraToolbars,
  showFiltersToolbar = false,
  storageAdapter,
  // AG-Grid passthrough
  rowHeight = 36,
  headerHeight = 32,
  animateRows = true,
  sideBar,
  statusBar,
  defaultColDef,
  onGridReady: onGridReadyProp,
  // Style
  className,
  style,
}: MarketsGridProps<TData>) {
  const gridRef = useRef<AgGridReact>(null);
  const getRowId = useMemo(() => createGetRowId(rowIdField), [rowIdField]);

  // External filter ref for OR-combining multiple saved filters
  const activeFiltersRef = useRef<SavedFilter[]>([]);

  // Transient "just saved" flash for the global Save All button
  const [saveFlash, setSaveFlash] = useState(false);
  const saveFlashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const {
    columnDefs,
    onGridReady: gcOnGridReady,
    onGridPreDestroyed,
    core,
    store,
    openSettings,
    activeProfileName,
    activeProfileId,
    profiles,
    hasProfileStorage,
    saveProfile,
    loadProfile,
    deleteProfile,
    saveActiveProfile,
    isDirty,
  } = useGridCustomizer({
    gridId,
    baseColumnDefs,
    modules: modules ?? defaultModules,
    rowIdField,
    persistState,
    storageAdapter,
  });

  // Toolbar visibility — persisted in the active profile via the hidden
  // `toolbar-visibility` module. Default-collapsed: nothing shown until the
  // user explicitly toggles a pill.
  const [visibilityState, setVisibilityState] = useModuleState<ToolbarVisibilityState>(
    store,
    'toolbar-visibility',
  );
  const visibility = visibilityState?.visible ?? {};

  const setToolbarVisible = useCallback(
    (id: string, next: boolean) => {
      setVisibilityState((prev) => ({
        ...prev,
        visible: { ...(prev?.visible ?? {}), [id]: next },
      }));
    },
    [setVisibilityState],
  );

  const toggleToolbar = useCallback(
    (id: string) => setToolbarVisible(id, !visibility[id]),
    [setToolbarVisible, visibility],
  );

  const handleGridReady = useCallback(
    (event: GridReadyEvent) => {
      gcOnGridReady(event);
      event.api.sizeColumnsToFit();
      onGridReadyProp?.(event);
    },
    [gcOnGridReady, onGridReadyProp],
  );

  return (
    <div
      className={className}
      style={{ display: 'flex', flexDirection: 'column', height: '100%', ...style }}
    >
      {/* Toolbar stack — Filters is always visible; Style + extraToolbars
          appear stacked below when the user clicks their pill. */}
      {showToolbar && (() => {
        const handleSaveAll = async () => {
          // 1. If a profile is active, push live edits into that profile's snapshot
          //    so reloading the profile restores them. Without this, edits live only
          //    in the local cache and get overwritten on the next profile load.
          try { await saveActiveProfile(); } catch { /* swallow — fall through to local cache */ }

          // 2. Always update the local fast-path cache so a refresh without any
          //    active profile still restores the latest state.
          try {
            const serialized = core.serializeAll();
            localStorage.setItem(`gc-state:${gridId}`, JSON.stringify(serialized));
            store.getState().setDirty(false);
            store.setState({ undoStack: [], redoStack: [] });
          } catch { /* localStorage quota / disabled */ }

          // 3. Signal other toolbars (e.g. FiltersToolbar) to persist their own local state
          try { window.dispatchEvent(new CustomEvent('gc:save-all', { detail: { gridId } })); } catch { /* */ }

          setSaveFlash(true);
          if (saveFlashTimer.current) clearTimeout(saveFlashTimer.current);
          saveFlashTimer.current = setTimeout(() => setSaveFlash(false), 600);
        };

        const profileBadge = hasProfileStorage ? (
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
              profiles={profiles}
              activeProfileId={activeProfileId}
              activeProfileName={activeProfileName}
              isDirty={isDirty}
              onSave={saveProfile}
              onLoad={loadProfile}
              onDelete={deleteProfile}
            />
          </div>
        ) : null;

        const saveAllBtn = (
          <button
            onClick={handleSaveAll}
            title={isDirty ? 'Save all settings (unsaved changes)' : 'Save all settings'}
            style={{
              height: 44, padding: '0 10px',
              background: 'var(--card, #161a1e)', borderBottom: '1px solid var(--border, #313944)',
              border: 'none', borderLeft: '1px solid var(--border, #313944)',
              color: saveFlash ? 'var(--bn-green, #2dd4bf)' : (isDirty ? 'var(--bn-yellow, #f0b90b)' : 'var(--muted-foreground, #a0a8b4)'),
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
              fontFamily: "var(--fi-sans, 'Geist', sans-serif)",
              fontSize: 11, fontWeight: 500,
              transition: 'color 150ms',
            }}
          >
            {saveFlash
              ? <Check size={13} strokeWidth={2.5} />
              : <Save size={13} strokeWidth={1.75} />}
            <span>Save</span>
          </button>
        );

        const settingsBtn = showSettingsButton ? (
          <button onClick={openSettings} style={{
            height: 44, padding: '0 12px',
            background: 'var(--card, #161a1e)', borderBottom: '1px solid var(--border, #313944)',
            border: 'none', borderLeft: '1px solid var(--border, #313944)',
            color: 'var(--primary, #14b8a6)', fontSize: 11, fontWeight: 500,
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
            fontFamily: "var(--fi-sans, 'Geist', sans-serif)",
          }}>
            ⚙ Settings
          </button>
        ) : null;

        // ─── Pills ─────────────────────────────────────────────────────────
        // One pill per togglable toolbar (Style + each extraToolbar).
        // Pills live on the right edge of the Filters row. They are visually
        // muted by default and surface their accent color on hover; clicking
        // toggles the toolbar's visibility (persisted in the active profile).

        const pills: Array<{ id: string; label: string; color: string; icon?: React.ReactNode }> = [
          { id: STYLE_TOOLBAR_ID, label: 'Style', color: 'var(--primary, #14b8a6)', icon: <Brush size={11} strokeWidth={1.75} /> },
          ...(extraToolbars ?? []).map((t) => ({
            id: t.id,
            label: t.label,
            color: t.color ?? 'var(--bn-blue, #3da0ff)',
            icon: t.icon,
          })),
        ];

        // Floating dock — small pills centered at the top of the Filters row.
        // Hidden by default, fade in on hover of `.gc-toolbar-primary`.
        const pillsDock = (
          <div className="gc-toolbar-pills-dock" aria-label="Toolbar visibility">
            {pills.map((p) => {
              const active = !!visibility[p.id];
              return (
                <button
                  key={p.id}
                  onClick={() => toggleToolbar(p.id)}
                  title={active ? `Hide ${p.label} toolbar` : `Show ${p.label} toolbar`}
                  className="gc-pill"
                  data-active={active}
                  style={{ ['--gc-pill-color' as any]: p.color }}
                >
                  {p.icon}
                  <span>{p.label}</span>
                </button>
              );
            })}
          </div>
        );

        // The right-side control cluster lives on the primary row
        const rightCluster = (
          <>
            {profileBadge}
            {saveAllBtn}
            {settingsBtn}
          </>
        );

        // Primary row content: Filters if enabled, otherwise a flexible spacer
        const primaryContent = showFiltersToolbar ? (
          <FiltersToolbar
            core={core}
            store={store}
            gridId={gridId}
            rowData={rowData}
            activeFiltersRef={activeFiltersRef}
          />
        ) : (
          <div style={{ height: 44, borderBottom: '1px solid var(--border, #313944)', background: 'var(--card, #161a1e)' }} />
        );

        // Helper: render a stacked toolbar row with hover-revealed X close button.
        const StackedToolbar = ({
          id,
          children,
          zIndex,
        }: { id: string; children: React.ReactNode; zIndex: number }) => (
          <div
            key={id}
            className="gc-stacked-toolbar"
            style={{
              display: 'flex',
              alignItems: 'center',
              flexShrink: 0,
              position: 'relative',
              zIndex,
              animation: 'gc-slide-down 120ms ease-out',
            }}
          >
            <div style={{ flex: '1 1 0px', minWidth: 0, overflowX: 'clip', overflowY: 'visible' }}>
              {children}
            </div>
            <button
              className="gc-stacked-close"
              onClick={() => setToolbarVisible(id, false)}
              title="Hide toolbar"
              style={{
                height: 44,
                width: 32,
                background: 'var(--card, #161a1e)',
                borderBottom: '1px solid var(--border, #313944)',
                borderLeft: '1px solid var(--border, #313944)',
                border: 'none',
                color: 'var(--muted-foreground, #a0a8b4)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'color 120ms, background 120ms',
              }}
            >
              <X size={13} strokeWidth={1.75} />
            </button>
          </div>
        );

        return (
          <>
            {/* Primary row — Filters (always visible) + right control cluster.
                Pills dock floats centered at the top edge, revealed on hover. */}
            <div
              className="gc-toolbar-primary"
              style={{ display: 'flex', alignItems: 'center', flexShrink: 0, position: 'relative', zIndex: 10 }}
            >
              <div style={{ flex: '1 1 0px', minWidth: 0, overflowX: 'clip', overflowY: 'visible' }}>{primaryContent}</div>
              {rightCluster}
              {pillsDock}
            </div>

            {/* Style toolbar (toggled via pill) */}
            {visibility[STYLE_TOOLBAR_ID] && (
              <StackedToolbar id={STYLE_TOOLBAR_ID} zIndex={9}>
                <FormattingToolbar core={core} store={store} />
              </StackedToolbar>
            )}

            {/* Consumer-provided extra toolbars (toggled via pills) */}
            {extraToolbars?.filter((t) => visibility[t.id]).map((t: ToolbarSlotConfig, i) => (
              <StackedToolbar key={t.id} id={t.id} zIndex={8 - i}>
                {t.content}
              </StackedToolbar>
            ))}
          </>
        );
      })()}

      {/* Grid */}
      <div style={{ flex: 1 }}>
        <AgGridReact
          ref={gridRef}
          theme={theme}
          rowData={rowData}
          columnDefs={columnDefs}
          getRowId={getRowId}
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

      {/* Settings Sheet */}
      <SettingsSheet core={core} store={store} />
    </div>
  );
}
