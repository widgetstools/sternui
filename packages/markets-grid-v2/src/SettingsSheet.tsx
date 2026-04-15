import { useCallback, useEffect, useState } from 'react';
import {
  GridProvider,
  type AnyModule,
  type GridStore,
} from '@grid-customizer/core-v2';
import type { GridCore } from '@grid-customizer/core-v2';
import { settingsCSS, STYLE_ID } from '@grid-customizer/core';
import { X } from 'lucide-react';

/**
 * Settings drawer host for markets-grid-v2.
 *
 * Renders any module's `SettingsPanel` slot inside a slide-in drawer.
 *
 * Differs from v1's SettingsSheet:
 *   - No DraftStoreProvider — v2 has no draft layer; edits land in the live
 *     store and are auto-persisted on a 300ms debounce. Apply / Apply&Close /
 *     Reset buttons collapse to a single "Done" button.
 *   - Modules without a `SettingsPanel` are simply not listed in the nav.
 *   - Reuses v1's `gc-settings-styles` CSS string so the visual treatment
 *     (overlay, sheet chrome, sections, rule cards) matches v1 1:1 for
 *     muscle-memory continuity. We deliberately don't re-implement that CSS.
 */

interface SettingsSheetProps {
  core: GridCore;
  store: GridStore;
  modules: AnyModule[];
  open: boolean;
  onClose: () => void;
  /** Optional initial active module id; defaults to first module with a panel. */
  initialModuleId?: string;
}

function ensureStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = settingsCSS;
  document.head.appendChild(style);
}

export function SettingsSheet({
  core,
  store,
  modules,
  open,
  onClose,
  initialModuleId,
}: SettingsSheetProps) {
  const panelModules = modules.filter((m) => m.SettingsPanel);

  const [activeId, setActiveId] = useState<string>(
    () => initialModuleId ?? panelModules[0]?.id ?? '',
  );

  // Keep a sensible active id if `initialModuleId` (or the panel list) changes.
  useEffect(() => {
    if (panelModules.length === 0) return;
    if (!panelModules.some((m) => m.id === activeId)) {
      setActiveId(initialModuleId ?? panelModules[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialModuleId, panelModules.length]);

  useEffect(() => {
    if (open) ensureStyles();
  }, [open]);

  // ESC closes — only registered while open so we don't intercept keys when
  // the sheet isn't shown.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const activeModule = panelModules.find((m) => m.id === activeId);
  const Panel = activeModule?.SettingsPanel;

  return (
    <GridProvider store={store} core={core}>
      <div data-gc-settings="" data-testid="v2-settings-sheet">
        <div
          className="gc-overlay"
          onClick={onClose}
          data-testid="v2-settings-overlay"
        />

        <div className="gc-sheet" role="dialog" aria-label="Grid settings">
          <div className="gc-header">
            <div className="gc-header-title">
              <span>Grid Customizer</span>
              <span className="gc-header-badge">{core.gridId}</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              title="Close"
              data-testid="v2-settings-close-btn"
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--gc-text-muted)',
                padding: 4,
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              <X size={14} strokeWidth={1.75} />
            </button>
          </div>

          <div className="gc-body">
            {/* Module nav — small text-only sidebar; full v1-style icon nav is
                deferred to v2.2 when the icon catalogue is ported. */}
            <nav
              className="gc-nav"
              data-testid="v2-settings-nav"
              style={{
                width: 140,
                borderRight: '1px solid var(--gc-border)',
                padding: '6px 0',
                background: 'var(--gc-surface)',
                overflowY: 'auto',
              }}
            >
              {panelModules.length === 0 && (
                <div style={{ padding: 12, fontSize: 11, color: 'var(--gc-text-dim)' }}>
                  No settings available.
                </div>
              )}
              {panelModules.map((m) => {
                const active = m.id === activeId;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setActiveId(m.id)}
                    data-testid={`v2-settings-nav-${m.id}`}
                    aria-current={active ? 'true' : 'false'}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: '7px 12px',
                      fontSize: 11,
                      background: active ? 'var(--gc-accent-muted)' : 'transparent',
                      color: active ? 'var(--gc-accent)' : 'var(--gc-text)',
                      border: 'none',
                      borderLeft: active
                        ? '2px solid var(--gc-accent)'
                        : '2px solid transparent',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    {m.name}
                  </button>
                );
              })}
            </nav>

            <div
              className="gc-content"
              data-testid="v2-settings-content"
              style={{ flex: 1, padding: 12, overflowY: 'auto' }}
            >
              {Panel ? (
                <Panel gridId={core.gridId} />
              ) : (
                <div className="gc-empty">
                  <p style={{ fontSize: 13, marginBottom: 4, fontWeight: 600 }}>
                    {activeModule?.name ?? 'Module'}
                  </p>
                  <p style={{ fontSize: 11 }}>
                    No settings panel registered for this module.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div
            className="gc-footer"
            style={{
              padding: '8px 12px',
              borderTop: '1px solid var(--gc-border)',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 6,
            }}
          >
            <span
              style={{
                fontSize: 10,
                color: 'var(--gc-text-dim)',
                marginRight: 'auto',
                alignSelf: 'center',
              }}
            >
              Changes auto-save.
            </span>
            <button
              type="button"
              onClick={onClose}
              data-testid="v2-settings-done-btn"
              style={{
                padding: '5px 14px',
                fontSize: 11,
                background: 'var(--gc-accent)',
                color: 'var(--gc-accent-text)',
                border: 'none',
                borderRadius: 'var(--gc-radius-sm)',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontWeight: 500,
              }}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </GridProvider>
  );
}
