import { forwardRef, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  Poppable,
  SharpBtn,
  V2_SHEET_STYLE_ID,
  v2SheetCSS,
  isOpenFin,
  useDirtyCount,
  useGridPlatform,
  type AnyModule,
  type PoppableHandle,
} from '@marketsui/core';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@marketsui/core';
import {
  ChevronDown,
  GripHorizontal,
  HelpCircle,
  Maximize2,
  Minimize2,
  X,
} from 'lucide-react';
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
 * Back-compat aliases. The original flat panels exposed a top-level
 * testid per module (`cs-panel`, `cg-panel`, `cc-panel`). The
 * master-detail split removed those wrappers; this map lets the sheet
 * re-emit the same id on the editor-pane wrapper so existing e2e
 * tests keep working without having to relearn every selector.
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

/**
 * Imperative handle exposed via `ref` on `<SettingsSheet>`. Thin
 * alias over `PoppableHandle` — lets MarketsGrid's settings icon
 * raise a buried popout before falling back to inline toggle.
 */
export type SettingsSheetHandle = PoppableHandle;

function ensureStyles() {
  if (typeof document === 'undefined') return;
  // Inject the cockpit popout stylesheet. MarketsGrid's top-level
  // ensureCockpitStyles already covers the cockpit tokens; this
  // function stays because the sheet itself may mount before
  // MarketsGrid's effect runs on cold-mount edge cases.
  if (!document.getElementById(V2_SHEET_STYLE_ID)) {
    const v2style = document.createElement('style');
    v2style.id = V2_SHEET_STYLE_ID;
    v2style.textContent = v2SheetCSS;
    document.head.appendChild(v2style);
  }
}

export const SettingsSheet = forwardRef<SettingsSheetHandle, SettingsSheetProps>(function SettingsSheet({
  modules,
  open,
  onClose,
  initialModuleId,
}: SettingsSheetProps, ref) {
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

  // Build the sheet JSX. Takes `popped` + `PopoutButton` from the
  // enclosing <Poppable/> so it can:
  //   - swap chrome (strip grip/title/close when popped — OS window
  //     owns those)
  //   - hide the maximize button when popped (OS window owns it)
  //   - drop in the pop-out trigger button in the header icon cluster
  // See Poppable's render-prop API for the contract.
  const buildSheet = ({ popped, PopoutButton, close }: {
    popped: boolean;
    PopoutButton: React.ComponentType<{ className?: string; title?: string; 'data-testid'?: string }>;
    close: () => void;
  }) => {
    // Only apply drag-region chrome when the popout is hosted by
    // OpenFin (which supports `-webkit-app-region` + `frame: false`).
    // Browsers ignore those and always render full OS chrome, so our
    // custom titlebar would just duplicate it there.
    const frameless = popped && isOpenFin();
    const sheetClasses = [
      'gc-sheet',
      'gc-sheet-v2',
      'gc-popout',
      maximized && !popped ? 'is-maximized' : '',
      popped ? 'is-popped' : '',
      frameless ? 'is-frameless' : '',
    ]
      .filter(Boolean)
      .join(' ');
    return (
    <div
      className={sheetClasses}
      role="dialog"
      aria-label="Grid settings"
    >
          {/* ── Title bar (terminal chrome) ───────────────────────
               In OpenFin popped mode the OS frame is dropped
               (`frame: false` below), so the header strip IS the
               window's drag handle — we reassert the original brand
               cluster (grip + dot + caption) so users can still see
               what window they're in AND the strip has content to
               drag. Browsers keep OS chrome so the brand cluster is
               redundant there and stays hidden (inline mode keeps
               its original behavior). */}
          <header
            className="gc-popout-title"
            style={frameless ? ({ WebkitAppRegion: 'drag' } as CSSProperties) : undefined}
          >
            {/* Brand cluster shown inline AND in frameless popped
                mode (where our strip is the only title bar). Hidden
                in browser popped mode, because the OS title bar
                already labels the window. */}
            {(!popped || frameless) && (
              <>
                <GripHorizontal size={14} color="var(--ck-t3)" />
                <span style={{ color: 'var(--ck-green)', fontSize: 11 }}>●</span>
                <span className="gc-popout-title-text">Grid Customizer</span>
                <span className="gc-popout-title-sub">v2.3.0</span>
              </>
            )}

            {/* Module dropdown — shadcn Popover.
                `no-drag` inline style is only meaningful when the
                header sits inside an OpenFin frameless window; in
                every other mode it's a harmless no-op. Applying it
                here (rather than on every button) keeps the
                responsibility at each interactive node. */}
            {panelModules.length > 0 && activeModule && (
              <Popover open={moduleMenuOpen} onOpenChange={setModuleMenuOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="gc-popout-module-btn"
                    aria-expanded={moduleMenuOpen}
                    data-testid="v2-settings-module-dropdown"
                    style={frameless ? ({ WebkitAppRegion: 'no-drag' } as CSSProperties) : undefined}
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
            {/* Right-side control cluster. Entire container opts
                out of the frameless drag region so every button
                inside registers clicks instead of moving the
                OpenFin window. */}
            <div
              style={{
                display: 'inline-flex',
                gap: 2,
                marginLeft: 8,
                ...(frameless ? ({ WebkitAppRegion: 'no-drag' } as CSSProperties) : {}),
              }}
            >
              <button
                type="button"
                className="gc-popout-title-btn"
                onClick={() => setHelpOpen((v) => !v)}
                title={helpOpen ? 'Back to settings' : 'Formats & expressions help'}
                aria-label={helpOpen ? 'Back to settings' : 'Open formats and expressions help'}
                aria-pressed={helpOpen}
                data-testid="v2-settings-help-btn"
                style={helpOpen ? { color: 'var(--ck-green)' } : undefined}
              >
                <HelpCircle size={12} strokeWidth={2} />
              </button>
              {/* Maximize collapses into a no-op when popped — the
                  OS window chrome owns maximize in that mode. */}
              {!popped && (
                <button
                  type="button"
                  className="gc-popout-title-btn"
                  onClick={() => setMaximized((v) => !v)}
                  title={maximized ? 'Restore window size' : 'Maximize'}
                  aria-label={maximized ? 'Restore window size' : 'Maximize'}
                >
                  {maximized ? <Minimize2 size={12} strokeWidth={2} /> : <Maximize2 size={12} strokeWidth={2} />}
                </button>
              )}
              {/* Pop-out button from <Poppable> — rendered only when
                  inline; hides itself when popped (the OS window
                  chrome takes over). */}
              <PopoutButton
                className="gc-popout-title-btn"
                title="Open in a separate window"
                data-testid="v2-settings-popout-btn"
              />
              {/* Close X shown inline (browser can't reach OS close)
                  AND in frameless-popped mode (OS chrome is gone,
                  so our own X is the only close affordance). In
                  framed-popped mode (browser popout with OS chrome)
                  the OS window close handles it. */}
              {(!popped || frameless) && (
                <button
                  type="button"
                  className="gc-popout-title-btn"
                  onClick={() => {
                    if (frameless) {
                      // Popped + OpenFin: user clicked our custom X.
                      // Tear down the window via Poppable's close,
                      // then fully dismiss the sheet so reopening
                      // starts clean (rather than re-mounting inline).
                      close();
                      onClose();
                    } else {
                      onClose();
                    }
                  }}
                  title="Close"
                  aria-label="Close"
                  data-testid="v2-settings-close-btn"
                >
                  <X size={14} strokeWidth={2} />
                </button>
              )}
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
            {/* Keyboard shortcut hints — the per-card Save pills on
                every editor already signal "save each rule
                individually", so the redundant copy line was dropped
                when the popout narrowed to 820px (it was pushing the
                Done button off-screen). */}
            <span style={{ whiteSpace: 'nowrap' }}>
              ⌘ S = SAVE CARD · ⌘ ⏎ = SAVE ALL · ⌫ = DELETE · ESC = CLOSE
            </span>
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
    );
  };

  // ── Final render: Poppable owns the inline-vs-OS-window branching
  // plus the `focusIfPopped` imperative handle we forward to the
  // hosting grid via our own `ref`.
  return (
    <Poppable
      ref={ref}
      name={`gc-popout-${gridId}`}
      // Suffix the OS window title with gridId so users with
      // multiple grids (two-grid dashboard) can tell popout windows
      // apart in the OS taskbar / window menu.
      title={`Grid Customizer — ${gridId}`}
      width={960}
      height={700}
      // Frameless popout: OpenFin honors `frame: false` by dropping
      // the OS chrome; our header strip (with `-webkit-app-region:
      // drag`) becomes the draggable title bar. Browsers ignore
      // this flag and always render full chrome, so our custom
      // strip there lives under the native title bar (harmless —
      // users just see two title bars if they squint). Matches the
      // FormattingPropertiesPanel frameless pattern.
      frame={false}
    >
      {({ popped, PopoutButton, close }) => (
        <div
          data-gc-settings=""
          data-testid="v2-settings-sheet"
          data-popped={popped ? 'true' : undefined}
        >
          {/* Backdrop only in inline mode — the OS window IS the
              overlay when popped. */}
          {!popped && (
            <div
              className="gc-popout-backdrop"
              onClick={onClose}
              data-testid="v2-settings-overlay"
            />
          )}
          {buildSheet({ popped, PopoutButton, close })}
        </div>
      )}
    </Poppable>
  );
});

