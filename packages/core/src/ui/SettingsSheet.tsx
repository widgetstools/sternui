import React, { useCallback, useEffect, useRef } from 'react';
import type { GridCustomizerCore } from '../core/GridCustomizerCore';
import type { GridStore, GridCustomizerStore } from '../stores/createGridStore';
import { ModuleNav } from './ModuleNav';
import { Icons } from './icons';
import { settingsCSS, STYLE_ID } from './styles';
import { DraftStoreProvider, useDraftActions } from './DraftStoreProvider';
import { Button } from './shadcn/button';

interface SettingsSheetProps {
  core: GridCustomizerCore;
  store: GridStore;
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = settingsCSS;
  document.head.appendChild(style);
}

export const SettingsSheet = React.memo(function SettingsSheet({ core, store }: SettingsSheetProps) {
  const open = store((s: GridCustomizerStore) => s.settingsOpen);

  useEffect(() => {
    ensureStyles();
  }, []);

  if (!open) return null;

  // Mount the draft store fresh each time the sheet opens (key forces remount)
  return (
    <DraftStoreProvider realStore={store} core={core}>
      <SettingsSheetInner core={core} realStore={store} />
    </DraftStoreProvider>
  );
});

// ─── Inner component (has access to draft context) ───────────────────────────

function SettingsSheetInner({
  core,
  realStore,
}: {
  core: GridCustomizerCore;
  realStore: GridStore;
}) {
  const { apply, reset, discard, isDirty } = useDraftActions();
  const activeModuleId = realStore((s: GridCustomizerStore) => s.activeSettingsModule);
  const sheetRef = useRef<HTMLDivElement>(null);

  const handleClose = useCallback(() => {
    discard();
    realStore.getState().setSettingsOpen(false);
  }, [discard, realStore]);

  // ESC to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [handleClose]);

  const handleApply = useCallback(() => {
    apply();
  }, [apply]);

  const handleApplyAndClose = useCallback(() => {
    apply();
    realStore.getState().setSettingsOpen(false);
  }, [apply, realStore]);

  const handleReset = useCallback(() => {
    reset();
  }, [reset]);

  const handleSelectModule = useCallback(
    (moduleId: string) => {
      realStore.getState().setActiveSettingsModule(moduleId);
    },
    [realStore],
  );

  const modules = core.getModules();
  const activeModule = modules.find((m) => m.id === activeModuleId);
  const SettingsPanel = activeModule?.SettingsPanel;

  return (
    <div data-gc-settings="">
      {/* Overlay */}
      <div className="gc-overlay" onClick={handleClose} />

      {/* Sheet */}
      <div className="gc-sheet" ref={sheetRef}>
        {/* Header */}
        <div className="gc-header">
          <div className="gc-header-title">
            <Icons.Settings size={14} />
            <span>Grid Customizer</span>
            <span className="gc-header-badge">{core.gridId}</span>
            {isDirty && (
              <span
                style={{
                  width: 6, height: 6,
                  borderRadius: '50%',
                  background: 'var(--gc-warning)',
                  marginLeft: 4,
                }}
                title="Unsaved changes"
              />
            )}
          </div>
          <Button variant="ghost" size="icon-sm" onClick={handleClose} title="Close (discard changes)">
            <Icons.X size={14} />
          </Button>
        </div>

        {/* Body */}
        <div className="gc-body">
          <ModuleNav
            modules={modules}
            activeModuleId={activeModuleId}
            onSelect={handleSelectModule}
          />

          <div className="gc-content">
            {SettingsPanel ? (
              <SettingsPanel gridId={core.gridId} />
            ) : (
              <div className="gc-empty">
                <p style={{ fontSize: 13, marginBottom: 4, fontWeight: 600 }}>{activeModule?.name ?? 'Module'}</p>
                <p style={{ fontSize: 11 }}>Settings panel coming soon</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="gc-footer">
          <div style={{ display: 'flex', gap: 6 }}>
            <Button variant="ghost" size="sm" onClick={handleReset}>
              Reset
            </Button>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {isDirty && (
              <span style={{ fontSize: 9, color: 'var(--gc-text-dim)', marginRight: 4 }}>
                Unsaved changes
              </span>
            )}
            <Button variant="outline" size="sm" onClick={handleApply} disabled={!isDirty}>
              Apply
            </Button>
            <Button variant="default" size="sm" onClick={handleApplyAndClose}>
              Apply &amp; Close
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
