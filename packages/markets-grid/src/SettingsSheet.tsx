/**
 * SettingsSheet — opens as a drawer from the right edge. Lists every
 * module that exposes a `SettingsPanel`, shows the active module's panel
 * in the body, and closes on Escape / backdrop click.
 *
 * Deliberately minimal for the v3 clean cut — the v2 version carried
 * maximise/minimise, dirty-count hint, help cheatsheet, and a module
 * dropdown. v3 reduces to a left sidebar of module tabs + a right pane;
 * adds for the dropdown/help can layer on top without touching this.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import {
  useGridPlatform,
  type AnyModule,
  type SettingsPanelProps,
} from '@grid-customizer/core';

export interface SettingsSheetProps {
  open: boolean;
  onClose: () => void;
  /** Module to preselect. Defaults to the first module exposing a panel. */
  initialModuleId?: string;
  /** Override the module list used to populate the sidebar. Defaults to
   *  every module registered on the platform that has a `SettingsPanel`. */
  modules?: AnyModule[];
}

export function SettingsSheet({
  open,
  onClose,
  initialModuleId,
  modules: modulesOverride,
}: SettingsSheetProps) {
  const platform = useGridPlatform();

  const panelModules = useMemo(() => {
    const source = modulesOverride ?? platform.getModules();
    return source.filter((m) => !!m.SettingsPanel);
  }, [modulesOverride, platform]);

  const [activeId, setActiveId] = useState<string>(
    () => initialModuleId ?? panelModules[0]?.id ?? '',
  );

  useEffect(() => {
    if (panelModules.length === 0) return;
    if (!panelModules.some((m) => m.id === activeId)) {
      setActiveId(initialModuleId ?? panelModules[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialModuleId, panelModules.length]);

  // ESC + Cmd/Ctrl+Enter to close.
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || ((e.metaKey || e.ctrlKey) && e.key === 'Enter')) {
        onClose();
      }
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [open, onClose]);

  const handleClose = useCallback(() => onClose(), [onClose]);

  if (!open) return null;

  const activeModule = panelModules.find((m) => m.id === activeId);
  const Panel = activeModule?.SettingsPanel;

  return (
    <div data-testid="settings-sheet">
      {/* Backdrop */}
      <div
        onClick={handleClose}
        data-testid="settings-overlay"
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.45)',
          zIndex: 50,
        }}
      />

      {/* Sheet */}
      <div
        className="gc-sheet"
        role="dialog"
        aria-label="Grid settings"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 'min(1100px, 90vw)',
          background: 'var(--ck-bg)',
          borderLeft: '1px solid var(--ck-border)',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 51,
          color: 'var(--ck-t0)',
          fontFamily: 'var(--ck-font-sans)',
        }}
      >
        {/* Title bar */}
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 14px',
            borderBottom: '1px solid var(--ck-border)',
            background: 'var(--ck-surface)',
          }}
        >
          <span style={{ color: 'var(--ck-green)', fontSize: 11 }}>●</span>
          <span style={{ fontSize: 12, fontWeight: 600 }}>Grid Customizer</span>
          <span style={{ color: 'var(--ck-t3)', fontSize: 10, letterSpacing: 0.1 }}>v3</span>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            onClick={handleClose}
            title="Close (Esc)"
            data-testid="settings-close"
            style={{
              border: 'none',
              background: 'transparent',
              color: 'var(--ck-t1)',
              cursor: 'pointer',
              padding: 4,
              borderRadius: 2,
            }}
          >
            <X size={14} />
          </button>
        </header>

        {/* Body — sidebar + panel */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          <nav
            style={{
              width: 200,
              borderRight: '1px solid var(--ck-border)',
              background: 'var(--ck-surface)',
              overflowY: 'auto',
              padding: '8px 0',
            }}
          >
            {panelModules.map((m) => {
              const active = m.id === activeId;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setActiveId(m.id)}
                  data-testid={`settings-nav-${m.id}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                    textAlign: 'left',
                    padding: '8px 14px',
                    background: active ? 'var(--ck-card)' : 'transparent',
                    color: active ? 'var(--ck-t0)' : 'var(--ck-t1)',
                    border: 'none',
                    borderLeft: active ? '2px solid var(--ck-green)' : '2px solid transparent',
                    cursor: 'pointer',
                    fontSize: 11,
                    fontWeight: active ? 600 : 500,
                  }}
                >
                  {m.code && (
                    <span style={{
                      fontFamily: 'var(--ck-font-mono)',
                      color: 'var(--ck-t3)',
                      fontSize: 10,
                    }}>{m.code}</span>
                  )}
                  <span>{m.name}</span>
                </button>
              );
            })}
          </nav>

          <section style={{ flex: 1, overflow: 'hidden' }}>
            {Panel
              ? renderPanel(Panel, { gridId: platform.gridId })
              : (
                <div style={{ padding: 24, color: 'var(--ck-t3)' }}>
                  Pick a module from the sidebar.
                </div>
              )}
          </section>
        </div>
      </div>
    </div>
  );
}

/**
 * Render a module's SettingsPanel. Factored out to isolate the `any`
 * cast needed because `AnyModule`'s `SettingsPanel` is erased to
 * `ComponentType<SettingsPanelProps>` at the module boundary.
 */
function renderPanel(
  Panel: React.ComponentType<SettingsPanelProps>,
  props: SettingsPanelProps,
) {
  return <Panel {...props} />;
}
