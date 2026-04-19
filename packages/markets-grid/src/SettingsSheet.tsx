import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  SharpBtn,
  V2_SHEET_STYLE_ID,
  v2SheetCSS,
  useDirtyCount,
  useGridPlatform,
  type AnyModule,
} from '@grid-customizer/core';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@grid-customizer/core';
import { ChevronDown, GripHorizontal, HelpCircle, Maximize2, Minimize2, X } from 'lucide-react';
import { HelpPanel } from './HelpPanel';

/**
 * Cockpit Terminal popout — the v2 settings sheet.
 *
 * Chrome:
 *   - Title bar: terminal ticker with grip + green dot + "GRID CUSTOMIZER v2.3.0"
 *     + profile status + dirty count + maximise + close.
 *   - Body: 3-col grid (module rail, items list, editor).
 *   - Footer: save-per-rule keyboard hints + Done CTA.
 */

/**
 * Back-compat aliases. The original v1/v2 flat panels exposed a top-level
 * testid per module (`cs-panel`, `cg-panel`, `cc-panel`). The master-detail
 * split removed those wrappers; this map lets the sheet re-emit the same
 * id on the editor-pane wrapper so existing e2e tests keep working without
 * having to relearn every selector.
 */
const PANEL_TESTID_BY_MODULE_ID: Record<string, string> = {
  'conditional-styling': 'cs-panel',
  'column-groups': 'cg-panel',
  'calculated-columns': 'cc-panel',
  // column-customization renders master-detail via ListPane/EditorPane
  // (no legacy flat panel), so the wrapper here carries the back-compat
  // `cols-panel` testid the e2e helpers + docs consistently target.
  'column-customization': 'cols-panel',
};

export interface SettingsSheetProps {
  modules: AnyModule[];
  open: boolean;
  onClose: () => void;
  initialModuleId?: string;
}

function ensureStyles() {
  if (typeof document === 'undefined') return;
  // Inject the cockpit popout stylesheet. The v1-era settingsCSS
  // (which set `.gc-sheet { position: fixed; top: 0; ... }`) has been
  // removed — MarketsGrid's top-level ensureCockpitStyles already
  // covers the cockpit tokens; this function stays because the sheet
  // itself may mount before MarketsGrid's effect runs on cold-mount
  // edge cases.
  if (!document.getElementById(V2_SHEET_STYLE_ID)) {
    const v2style = document.createElement('style');
    v2style.id = V2_SHEET_STYLE_ID;
    v2style.textContent = v2SheetCSS;
    document.head.appendChild(v2style);
  }
}

export function SettingsSheet({
  modules,
  open,
  onClose,
  initialModuleId,
}: SettingsSheetProps) {
  // Every module panel is already mounted inside MarketsGrid's
  // <GridProvider>, so `useGridPlatform()` is always valid here. Pull
  // `gridId` from the platform instead of threading a redundant `core`
  // prop (phase 4 removed the dead core/store props).
  const platform = useGridPlatform();
  const gridId = platform.gridId;

  // Live DIRTY=NN counter — reads the per-platform DirtyBus directly.
  // Every module panel registers `${moduleId}:${itemId}` through
  // `useModuleDraft` (phase 3), so the count reflects the real number
  // of unsaved card drafts across all panels. Declared UP HERE (before
  // the `if (!open)` bailout) so the Rules of Hooks hold across the
  // closed→open transition.
  const dirtyCount = useDirtyCount();

  const panelModules = useMemo(
    () => modules.filter((m) => m.SettingsPanel || (m.ListPane && m.EditorPane)),
    [modules],
  );

  const [activeId, setActiveId] = useState<string>(
    () => initialModuleId ?? panelModules[0]?.id ?? '',
  );
  const [maximized, setMaximized] = useState(false);
  const [moduleMenuOpen, setModuleMenuOpen] = useState(false);
  // When true, the body area renders the Help cheatsheet instead of the
  // active module's ListPane / EditorPane. Toggled by the ? icon in the
  // header — a temporary view, not persisted.
  const [helpOpen, setHelpOpen] = useState(false);

  const [selectedByModule, setSelectedByModule] = useState<Record<string, string | null>>({});

  const setSelectedForModule = useCallback((moduleId: string, id: string | null) => {
    setSelectedByModule((prev) => ({ ...prev, [moduleId]: id }));
  }, []);

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

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const activeModule = panelModules.find((m) => m.id === activeId);
  const hasMasterDetail = Boolean(activeModule?.ListPane && activeModule?.EditorPane);
  const ListPane = activeModule?.ListPane;
  const EditorPane = activeModule?.EditorPane;
  const LegacyPanel = activeModule?.SettingsPanel;
  const selectedId = activeModule ? selectedByModule[activeModule.id] ?? null : null;

  return (
    <>
      <div data-gc-settings="" data-testid="v2-settings-sheet">
        <div
          className="gc-popout-backdrop"
          onClick={onClose}
          data-testid="v2-settings-overlay"
        />

        <div
          className={`gc-sheet gc-sheet-v2 gc-popout${maximized ? ' is-maximized' : ''}`}
          role="dialog"
          aria-label="Grid settings"
        >
          {/* ── Title bar (terminal chrome) ─────────────────────── */}
          <header className="gc-popout-title">
            <GripHorizontal size={14} color="var(--ck-t3)" />
            <span style={{ color: 'var(--ck-green)', fontSize: 11 }}>●</span>
            <span className="gc-popout-title-text">Grid Customizer</span>
            <span className="gc-popout-title-sub">v2.3.0</span>

            {/* Module dropdown — shadcn Popover */}
            {panelModules.length > 0 && activeModule && (
              <Popover open={moduleMenuOpen} onOpenChange={setModuleMenuOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="gc-popout-module-btn"
                    aria-expanded={moduleMenuOpen}
                    data-testid="v2-settings-module-dropdown"
                  >
                    <span>{activeModule.name}</span>
                    <ChevronDown size={11} strokeWidth={2} color="var(--ck-t2)" />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  sideOffset={6}
                  className="gc-sheet-v2"
                  style={{
                    padding: 4,
                    width: 220,
                    background: 'var(--ck-card)',
                    border: '1px solid var(--ck-border-hi)',
                    borderRadius: 2,
                    boxShadow: 'var(--ck-popout-shadow)',
                  }}
                >
                  {panelModules.map((m) => {
                    const selected = m.id === activeId;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        className="gc-popout-module-menu-item"
                        aria-selected={selected}
                        data-testid={`v2-settings-nav-menu-${m.id}`}
                        onClick={() => {
                          setActiveId(m.id);
                          setModuleMenuOpen(false);
                        }}
                      >
                        <span>{m.name}</span>
                      </button>
                    );
                  })}
                </PopoverContent>
              </Popover>
            )}

            <span style={{ flex: 1 }} />
            <span className="gc-popout-title-status">
              DIRTY=<strong style={{ color: dirtyCount > 0 ? 'var(--ck-amber)' : 'var(--ck-t1)' }}>
                {String(dirtyCount).padStart(2, '0')}
              </strong>
            </span>
            <div style={{ display: 'inline-flex', gap: 2, marginLeft: 8 }}>
              <button
                type="button"
                className="gc-popout-title-btn"
                onClick={() => setHelpOpen((v) => !v)}
                title={helpOpen ? 'Back to settings' : 'Formats & expressions help'}
                aria-pressed={helpOpen}
                data-testid="v2-settings-help-btn"
                style={helpOpen ? { color: 'var(--ck-green)' } : undefined}
              >
                <HelpCircle size={12} strokeWidth={2} />
              </button>
              <button
                type="button"
                className="gc-popout-title-btn"
                onClick={() => setMaximized((v) => !v)}
                title={maximized ? 'Restore' : 'Maximize'}
              >
                {maximized ? <Minimize2 size={12} strokeWidth={2} /> : <Maximize2 size={12} strokeWidth={2} />}
              </button>
              <button
                type="button"
                className="gc-popout-title-btn"
                onClick={onClose}
                title="Close"
                data-testid="v2-settings-close-btn"
              >
                <X size={14} strokeWidth={2} />
              </button>
            </div>
          </header>

          {/*
            Accessible module-nav fallback + stable test hook.
            The visible module switcher lives inside the header Popover; when
            the Popover is closed its menu items aren't in the DOM. This
            permanent visually-hidden nav exposes each module as a discrete,
            always-mounted button carrying the public testid
            `v2-settings-nav-<id>`. Screen readers read it; e2e tests click
            through it without having to open the dropdown first.
           */}
          <nav
            aria-label="Modules (accessible navigation)"
            // Visually invisible but positioned inside the popout so
            // Playwright considers each item in-viewport and clickable.
            // `opacity: 0` keeps it out of sight; `pointer-events: auto` +
            // a non-zero hit area keep programmatic clicks working for
            // screen readers / e2e tests. The dropdown above remains the
            // visible UX for real users.
            style={{
              position: 'absolute',
              top: 4,
              left: 4,
              width: 1,
              height: 1,
              opacity: 0,
              overflow: 'hidden',
              pointerEvents: 'auto',
              whiteSpace: 'nowrap',
              zIndex: 0,
            }}
            data-testid="v2-settings-nav"
          >
            {panelModules.map((m) => (
              <button
                key={m.id}
                type="button"
                data-testid={`v2-settings-nav-${m.id}`}
                aria-selected={m.id === activeId}
                tabIndex={-1}
                onClick={() => setActiveId(m.id)}
                style={{ width: 1, height: 1, padding: 0, border: 'none', background: 'transparent' }}
              >
                {m.name}
              </button>
            ))}
          </nav>

          {/* ── Body ───────────────────────────────────────────── */}
          <main
            className="gc-popout-body"
            data-layout={helpOpen ? 'help' : hasMasterDetail ? 'master-detail' : 'editor-only'}
          >
            {helpOpen ? (
              <HelpPanel />
            ) : (
              <>
            {hasMasterDetail && ListPane && activeModule && (
              <aside className="gc-popout-list" data-testid="v2-settings-list">
                <ListPane
                  gridId={gridId}
                  selectedId={selectedId}
                  onSelect={(id) => setSelectedForModule(activeModule.id, id)}
                />
              </aside>
            )}

            <section
              className="gc-popout-editor"
              data-testid="v2-settings-content"
              data-active-module={activeModule?.id ?? ''}
            >
              {hasMasterDetail && EditorPane ? (
                // Module-specific testid wrapper — back-compat alias for the
                // legacy flat panel testids (`cs-panel` / `cg-panel` / `cc-panel`).
                // The wrapper is a flex column so the editor's `gc-editor-header`
                // + `gc-editor-scroll` children layout correctly (replaces the
                // previous `display: contents` hoist).
                <div
                  data-testid={PANEL_TESTID_BY_MODULE_ID[activeId] ?? ''}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    flex: 1,
                    minHeight: 0,
                    overflow: 'hidden',
                  }}
                >
                  <EditorPane gridId={gridId} selectedId={selectedId} />
                </div>
              ) : LegacyPanel ? (
                <LegacyPanel gridId={gridId} />
              ) : (
                <div style={{ padding: 24 }}>
                  <div className="gc-caps" style={{ fontSize: 10, marginBottom: 6 }}>
                    NO EDITOR
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ck-t2)' }}>
                    {activeModule?.name ?? 'This module'} has no settings UI registered.
                  </div>
                </div>
              )}
            </section>
              </>
            )}
          </main>

          {/* ── Footer ─────────────────────────────────────────── */}
          <footer className="gc-popout-footer">
            <span>SAVE EACH RULE INDIVIDUALLY</span>
            <span className="gc-popout-footer-shortcuts">·</span>
            <span>⌘ S = SAVE CARD · ⌘ ⏎ = SAVE ALL · ⌫ = DELETE · ESC = CLOSE</span>
            <span style={{ flex: 1 }} />
            <SharpBtn
              variant="ghost"
              onClick={onClose}
              style={{ height: 26 }}
            >
              Discard
            </SharpBtn>
            <SharpBtn
              variant="action"
              onClick={onClose}
              style={{ height: 26 }}
              data-testid="v2-settings-done-btn"
            >
              Done
            </SharpBtn>
          </footer>
        </div>
      </div>
    </>
  );
}
