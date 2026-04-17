import { useCallback, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { AllEnterpriseModule, ModuleRegistry } from 'ag-grid-enterprise';
import type { GridReadyEvent } from 'ag-grid-community';
import {
  generalSettingsModule,
  columnTemplatesModule,
  columnCustomizationModule,
  conditionalStylingModule,
  calculatedColumnsModule,
  columnGroupsModule,
  savedFiltersModule,
  toolbarVisibilityModule,
  type AnyModule,
} from '@grid-customizer/core-v2';
import { Save, Check, Settings as SettingsIcon, Brush, X as XIcon } from 'lucide-react';
import type { MarketsGridV2Props } from './types';
import { useMarketsGridV2 } from './useMarketsGridV2';
import { FiltersToolbar } from './FiltersToolbar';
import { FormattingToolbar } from './FormattingToolbar';
import { ProfileSelector } from './ProfileSelector';
import { SettingsSheet } from './SettingsSheet';

// AG-Grid Enterprise registration is global and idempotent — calling it on
// every mount is fine, but we guard with a one-shot flag to keep the console
// clean across React 18 strict-mode double-invocations.
let _agRegistered = false;
function ensureAgGridRegistered() {
  if (_agRegistered) return;
  ModuleRegistry.registerModules([AllEnterpriseModule]);
  _agRegistered = true;
}

/**
 * Default module list — the 5 in-scope v2.0 modules. Hosts can pass their own
 * `modules` prop to override (e.g. a subset, or extra custom modules).
 */
export const DEFAULT_V2_MODULES: AnyModule[] = [
  generalSettingsModule,
  columnTemplatesModule,
  columnCustomizationModule,
  calculatedColumnsModule,
  columnGroupsModule,
  conditionalStylingModule,
  savedFiltersModule,
  toolbarVisibilityModule,
];

export function MarketsGrid<TData = unknown>(props: MarketsGridV2Props<TData>) {
  const {
    rowData,
    columnDefs: baseColumnDefs,
    theme,
    storageAdapter,
    gridId = 'default',
    rowIdField = 'id',
    modules = DEFAULT_V2_MODULES,
    showToolbar = true,
    showFiltersToolbar = false,
    showFormattingToolbar = false,
    showSaveButton = true,
    showSettingsButton = true,
    showProfileSelector = true,
    autoSaveDebounceMs,
    rowHeight = 36,
    headerHeight = 32,
    animateRows = true,
    sideBar,
    statusBar,
    defaultColDef,
    onGridReady: onGridReadyProp,
    className,
    style,
    toolbarExtras,
  } = props;

  ensureAgGridRegistered();

  const gridRef = useRef<AgGridReact<TData>>(null);

  const { core, store, columnDefs, gridOptions, onGridReady, onGridPreDestroyed, profiles } = useMarketsGridV2({
    gridId,
    rowIdField,
    modules,
    baseColumnDefs: baseColumnDefs as unknown as unknown[],
    adapter: storageAdapter,
    autoSaveDebounceMs,
  });

  // Save-flash for the explicit Save button — shows a green checkmark for
  // 600ms after a successful flush so users get a visible confirmation that
  // their click actually persisted (auto-save is silent by design).
  const [saveFlash, setSaveFlash] = useState(false);
  const saveFlashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Settings sheet visibility — local UI state, not persisted in the store
  // (the sheet itself is ephemeral chrome; everything inside it auto-saves).
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Formatting toolbar visibility — toggled via the Style pill on the
  // filter bar. v1 used a ToolbarSwitcher for this; v2 uses a simple
  // pill + X-button on the toolbar itself.
  const [styleToolbarOpen, setStyleToolbarOpen] = useState(showFormattingToolbar);

  const handleSaveAll = useCallback(async () => {
    try {
      await profiles.saveActiveProfile();
    } catch (err) {
      console.warn('[markets-grid-v2] saveActiveProfile failed:', err);
      return;
    }
    setSaveFlash(true);
    if (saveFlashTimer.current) clearTimeout(saveFlashTimer.current);
    saveFlashTimer.current = setTimeout(() => setSaveFlash(false), 600);
  }, [profiles]);

  // ─── onGridReady chain — caller's hook fires after ours ────────────────

  const handleGridReady = useCallback(
    (event: GridReadyEvent) => {
      onGridReady(event);
      event.api.sizeColumnsToFit();
      onGridReadyProp?.(event);
    },
    [onGridReady, onGridReadyProp],
  );

  // Active profile dirty hint — we don't track per-keystroke dirty state in
  // v2 (auto-save means there's nothing to "save"), but we expose the flag
  // for consumers that want to wire it later. For now: always false.
  const isDirty = false;

  const profileMetas = useMemo(() => profiles.profiles, [profiles.profiles]);

  return (
    <div
      className={className}
      style={{ display: 'flex', flexDirection: 'column', height: '100%', ...style }}
      data-grid-id={gridId}
    >
      {showToolbar && (
        <div
          className="gc-toolbar-primary"
          style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}
        >
          <div style={{ flex: '1 1 0px', minWidth: 0, overflowX: 'clip' }}>
            {showFiltersToolbar ? (
              <FiltersToolbar core={core} store={store} />
            ) : (
              <div style={{ height: 44, borderBottom: '1px solid var(--border, #313944)', background: 'var(--card, #161a1e)' }} />
            )}
          </div>

          {toolbarExtras}

          {showProfileSelector && (
            <div
              className="gc-profile-badge"
              style={{
                height: 44, padding: '0 10px',
                background: 'var(--card, #161a1e)',
                borderBottom: '1px solid var(--border, #313944)',
                borderLeft: '1px solid var(--border, #313944)',
                display: 'flex', alignItems: 'center',
              }}
            >
              <ProfileSelector
                profiles={profileMetas}
                activeProfileId={profiles.activeProfileId}
                isDirty={isDirty}
                onCreate={(name) => profiles.createProfile(name)}
                onLoad={(id) => profiles.loadProfile(id)}
                onDelete={(id) => profiles.deleteProfile(id)}
              />
            </div>
          )}

          {/* Style pill — toggles the formatting toolbar */}
          {showFormattingToolbar !== undefined && (
            <button
              type="button"
              onClick={() => setStyleToolbarOpen((p) => !p)}
              title={styleToolbarOpen ? 'Hide formatting toolbar' : 'Show formatting toolbar'}
              style={{
                height: 44, padding: '0 10px',
                background: styleToolbarOpen
                  ? 'rgba(45, 212, 191, 0.08)'
                  : 'var(--card, #161a1e)',
                borderBottom: '1px solid var(--border, #313944)',
                border: 'none', borderLeft: '1px solid var(--border, #313944)',
                color: styleToolbarOpen
                  ? 'var(--bn-green, #2dd4bf)'
                  : 'var(--muted-foreground, #a0a8b4)',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 5,
                fontSize: 11, fontWeight: styleToolbarOpen ? 600 : 500,
                transition: 'all 150ms',
              }}
            >
              <Brush size={13} strokeWidth={1.75} />
              <span>Style</span>
            </button>
          )}

          {showSaveButton && (
            <button
              type="button"
              onClick={handleSaveAll}
              title={isDirty ? 'Save all settings (unsaved changes)' : 'Save all settings'}
              data-testid="save-all-btn"
              style={{
                height: 44, padding: '0 10px',
                background: 'var(--card, #161a1e)',
                borderBottom: '1px solid var(--border, #313944)',
                border: 'none', borderLeft: '1px solid var(--border, #313944)',
                color: saveFlash
                  ? 'var(--bn-green, #2dd4bf)'
                  : isDirty
                    ? 'var(--bn-yellow, #f0b90b)'
                    : 'var(--muted-foreground, #a0a8b4)',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 5,
                fontSize: 11, fontWeight: 500,
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
                height: 44, padding: '0 10px',
                background: 'var(--card, #161a1e)',
                borderBottom: '1px solid var(--border, #313944)',
                border: 'none', borderLeft: '1px solid var(--border, #313944)',
                color: 'var(--muted-foreground, #a0a8b4)',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 5,
                fontSize: 11, fontWeight: 500,
                transition: 'color 150ms',
              }}
            >
              <SettingsIcon size={13} strokeWidth={1.75} />
              <span>Settings</span>
            </button>
          )}
        </div>
      )}

      {styleToolbarOpen && (
        <div style={{ position: 'relative' }}>
          <FormattingToolbar core={core} store={store} />
          {/* X button to hide the toolbar — mirrors v1's close behavior */}
          <button
            type="button"
            onClick={() => setStyleToolbarOpen(false)}
            title="Hide formatting toolbar"
            style={{
              position: 'absolute',
              top: 4, right: 6,
              width: 22, height: 22,
              borderRadius: 4,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent',
              border: 'none',
              color: 'var(--muted-foreground, #a0a8b4)',
              cursor: 'pointer',
              opacity: 0.6,
              transition: 'opacity 150ms',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.6')}
          >
            <XIcon size={14} strokeWidth={2} />
          </button>
        </div>
      )}

      <div style={{ flex: 1 }}>
        <AgGridReact
          ref={gridRef}
          // Spread the module-pipeline options FIRST so explicit host props
          // (rowHeight / headerHeight / animateRows / etc.) win on conflict —
          // preserves v1 ergonomics where the consumer's prop is authoritative
          // unless a module deliberately wants to override it. Module outputs
          // that have no host-prop counterpart (rowClassRules, pagination
          // toggles, rowSelection) flow through unchanged.
          {...(gridOptions as Record<string, unknown>)}
          theme={theme}
          rowData={rowData}
          columnDefs={columnDefs as never}
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
        core={core}
        store={store}
        modules={modules}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        initialModuleId="conditional-styling"
      />
    </div>
  );
}
