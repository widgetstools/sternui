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
  gridStateModule,
  captureGridStateInto,
  type AnyModule,
} from '@grid-customizer/core-v2';
import { Save, Check, Settings as SettingsIcon } from 'lucide-react';
import type { MarketsGridV2Props } from './types';
import { useMarketsGridV2 } from './useMarketsGridV2';
import { FiltersToolbar } from './FiltersToolbar';
import { FormattingToolbar } from './FormattingToolbar';
import { ProfileSelector } from './ProfileSelector';
import { SettingsSheet } from './SettingsSheet';
import { DraggableFloat } from './DraggableFloat';

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
  // grid-state runs last — captures the native AG-Grid state (column order,
  // sort, filters, widths, pagination, selection, …) only on explicit Save,
  // and replays it on profile load.
  gridStateModule,
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
      // Capture native AG-Grid state (column order/widths/sort/filters/etc.)
      // into the grid-state module BEFORE we persist. The subsequent
      // `saveActiveProfile` flushes through `core.serializeAll`, which then
      // reads the freshly-captured slice out of the store alongside every
      // other module's state. Auto-save intentionally never runs this path —
      // grid state is explicit-save-only.
      const api = gridRef.current?.api;
      if (api) {
        try {
          captureGridStateInto(store, api);
        } catch (err) {
          console.warn('[markets-grid-v2] captureGridStateInto failed:', err);
        }
      }
      await profiles.saveActiveProfile();
    } catch (err) {
      console.warn('[markets-grid-v2] saveActiveProfile failed:', err);
      return;
    }
    setSaveFlash(true);
    if (saveFlashTimer.current) clearTimeout(saveFlashTimer.current);
    saveFlashTimer.current = setTimeout(() => setSaveFlash(false), 600);
  }, [profiles, store]);

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
              <FiltersToolbar
                core={core}
                store={store}
                styleToolbarOpen={showFormattingToolbar !== undefined ? styleToolbarOpen : undefined}
                onToggleStyleToolbar={
                  showFormattingToolbar !== undefined
                    ? () => setStyleToolbarOpen((p) => !p)
                    : undefined
                }
              />
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
                    // Release the object-url on the next tick so the browser
                    // has a frame to initiate the download before we revoke.
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                  } catch (err) {
                    console.warn('[markets-grid-v2] profile export failed:', err);
                    window.alert(`Could not export profile: ${err instanceof Error ? err.message : String(err)}`);
                  }
                }}
                onImport={async (file) => {
                  try {
                    const text = await file.text();
                    const payload = JSON.parse(text);
                    await profiles.importProfile(payload);
                  } catch (err) {
                    console.warn('[markets-grid-v2] profile import failed:', err);
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
          {/* FormattingToolbar's own className already wires
              `flex-1 min-w-0 overflow-x-auto` — it's a direct flex child of
              this row, so it grows to fill available space and scrolls
              horizontally when content exceeds the viewport cap. */}
          <FormattingToolbar core={core} store={store} />
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
          // `maintainColumnOrder: true` preserves the user's drag-reordered
          // column positions when `columnDefs` re-derives (which happens
          // on every module-state change — applying a toolbar format
          // otherwise reset the ordering to the base columnDefs order
          // because AG-Grid's default behaviour is to match the current
          // columnDefs order on every update).
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
