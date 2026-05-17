import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import {
  DockManagerCore,
  type DockManagerCoreHandle,
  type WidgetProps,
} from '@widgetstools/react-dock-manager';
import {
  type DockManagerState,
  type SerializedDockLayout,
  clearLocalStorage,
  deserialize,
  loadFromLocalStorage,
  saveToLocalStorage,
  slateDark,
  vsCodeLight,
} from '@widgetstools/dock-manager-core';
import { applyTheme, getTheme } from '@starui/design-system';
import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@starui/ui';
import { Sun, Moon, CircleHelp, LayoutTemplate, Save } from 'lucide-react';
import { Brand } from './components/Brand';
import { HelpSheet } from './components/HelpSheet';
import { ProviderEditorPanel } from './panels/ProviderEditorPanel';
import { ConfigBrowserPanel } from './panels/ConfigBrowserPanel';
import { HostedGridPanel } from './panels/HostedGridPanel';
import { StatsPanel } from './panels/StatsPanel';

const SERIALIZED_LAYOUT: SerializedDockLayout = {
  version: 1,
  layout: {
    type: 'split',
    id: 'root',
    direction: 'vertical',
    sizes: [82, 18],
    children: [
      {
        type: 'split',
        id: 'top',
        direction: 'horizontal',
        sizes: [38, 62],
        children: [
          {
            type: 'tabgroup',
            id: 'tg-left',
            panels: ['providerEditor', 'configBrowser'],
            activePanel: 'providerEditor',
          },
          {
            type: 'split',
            id: 'right',
            direction: 'vertical',
            sizes: [50, 50],
            children: [
              { type: 'tabgroup', id: 'tg-grid-a', panels: ['gridA'], activePanel: 'gridA' },
              { type: 'tabgroup', id: 'tg-grid-b', panels: ['gridB'], activePanel: 'gridB' },
            ],
          },
        ],
      },
      { type: 'tabgroup', id: 'tg-stats', panels: ['stats'], activePanel: 'stats' },
    ],
  },
  panels: {
    providerEditor: { id: 'providerEditor', title: 'Provider Editor', widgetType: 'providerEditor', closable: false },
    configBrowser:  { id: 'configBrowser',  title: 'Config Browser',  widgetType: 'configBrowser',  closable: false },
    gridA:          { id: 'gridA',          title: 'Grid A',          widgetType: 'gridA',          closable: false },
    gridB:          { id: 'gridB',          title: 'Grid B',          widgetType: 'gridB',          closable: false },
    stats:          { id: 'stats',          title: 'Live stats',      widgetType: 'stats',          closable: false },
  },
  placements: {
    providerEditor: { type: 'docked', groupId: 'tg-left' },
    configBrowser:  { type: 'docked', groupId: 'tg-left' },
    gridA:          { type: 'docked', groupId: 'tg-grid-a' },
    gridB:          { type: 'docked', groupId: 'tg-grid-b' },
    stats:          { type: 'docked', groupId: 'tg-stats' },
  },
  activePaneId: 'gridA',
  nextZIndex: 100,
};

const DEFAULT_LAYOUT: DockManagerState = deserialize(SERIALIZED_LAYOUT).state;

// Stable key for dock-manager-core's localStorage helpers. Distinct
// from MarketsGrid's per-grid profile bundles so it can coexist with
// them in the same browser without collision. Bump the `v` suffix
// whenever the panel set changes so stale blobs get abandoned.
const DOCK_STORAGE_KEY = 'dataprovider-editor-starui-app:dock-layout:v2';

const REQUIRED_PANELS = ['providerEditor', 'configBrowser', 'gridA', 'gridB', 'stats'] as const;

/**
 * Load the persisted dock layout if any. Falls back to DEFAULT_LAYOUT
 * on first run or when the saved blob can't be deserialized (e.g. we
 * changed the panel set in code and the persisted ids no longer
 * match).
 */
function loadInitialLayout(): DockManagerState {
  try {
    const result = loadFromLocalStorage(DOCK_STORAGE_KEY);
    if (!result) return DEFAULT_LAYOUT;
    if (result.warnings.length > 0) {
      // eslint-disable-next-line no-console
      console.warn('[dock-layout] restore warnings:', result.warnings);
    }
    // Bidirectional guard. The persisted state must include exactly
    // the panels we know how to render — no more (an unknown id would
    // crash the widget renderer) and no less (a missing id means the
    // panel won't appear at all, like the user just hit with stats).
    const persistedIds = new Set(result.state.panels.keys());
    const requiredIds = new Set<string>(REQUIRED_PANELS);
    const extra = [...persistedIds].filter((id) => !requiredIds.has(id));
    const missing = [...requiredIds].filter((id) => !persistedIds.has(id));
    if (extra.length > 0 || missing.length > 0) {
      // eslint-disable-next-line no-console
      console.warn(
        '[dock-layout] panel set drift — using default layout.',
        { extra, missing },
      );
      return DEFAULT_LAYOUT;
    }
    return result.state;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[dock-layout] failed to load persisted layout', err);
    return DEFAULT_LAYOUT;
  }
}

export function App() {
  const [theme, setThemeState] = useState<'dark' | 'light'>(
    () => getTheme().theme as 'dark' | 'light',
  );
  const isDark = theme === 'dark';
  const [helpOpen, setHelpOpen] = useState(false);
  const [pendingEditorProviderId, setPendingEditorProviderId] = useState<string | null>(null);
  const dockRef = useRef<DockManagerCoreHandle | null>(null);

  // Resolve initial dock layout once, at mount. Reading from
  // localStorage on every render would re-mount DockManagerCore with
  // a stale state and lose any unsaved drag-in-progress.
  const [initialLayout] = useState<DockManagerState>(() => loadInitialLayout());

  // Explicit save — user-triggered via the header button. Pulls the
  // current state from the dock-manager API and writes it.
  const handleSaveLayout = useCallback(() => {
    const state = dockRef.current?.getState();
    if (!state) return;
    try {
      saveToLocalStorage(state, DOCK_STORAGE_KEY);
      // eslint-disable-next-line no-console
      console.log('[dock-layout] saved');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[dock-layout] save failed', err);
    }
  }, []);

  const handleResetLayout = useCallback(() => {
    if (!window.confirm('Reset dock layout to defaults? This will clear the saved arrangement for this app.')) {
      return;
    }
    try {
      clearLocalStorage(DOCK_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    window.location.reload();
  }, []);

  const handleToggleTheme = useCallback(() => {
    const next: 'dark' | 'light' = isDark ? 'light' : 'dark';
    applyTheme({ theme: next });
    setThemeState(next);
  }, [isDark]);

  // Bring the editor tab to the front when a grid asks to edit its
  // active provider. dock-manager-core's DockviewApi can move/focus
  // panels; the simplest reliable hook is the `setActivePanel` action
  // on the editor's tab-group. We just nudge React state and rely on
  // the editor panel re-rendering with the new initialProviderId.
  const handleEditProvider = useCallback((providerId: string) => {
    setPendingEditorProviderId(providerId);
    const api = dockRef.current?.getApi();
    // tg-left is the tabgroup holding the editor + browser tabs;
    // setActivePanel flips the active tab to the editor.
    api?.setActivePanel?.('tg-left', 'providerEditor');
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      const k = e.key.toLowerCase();
      if (k === '/') {
        e.preventDefault();
        setHelpOpen((o) => !o);
      } else if (k === '.') {
        e.preventDefault();
        handleToggleTheme();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleToggleTheme]);

  const dockTheme = useMemo(() => (isDark ? slateDark : vsCodeLight), [isDark]);
  const tooltipLabel = isDark ? 'Switch to light mode' : 'Switch to dark mode';

  const widgets = useMemo<Record<string, React.ComponentType<WidgetProps>>>(
    () => ({
      providerEditor: () => (
        <ProviderEditorPanel
          initialProviderId={pendingEditorProviderId}
          onClose={() => setPendingEditorProviderId(null)}
        />
      ),
      configBrowser: () => <ConfigBrowserPanel />,
      gridA: () => (
        <HostedGridPanel
          instanceId="dataprovider-editor-demo-a"
          componentName="Grid A"
          onEditProvider={handleEditProvider}
        />
      ),
      gridB: () => (
        <HostedGridPanel
          instanceId="dataprovider-editor-demo-b"
          componentName="Grid B"
          onEditProvider={handleEditProvider}
        />
      ),
      stats: () => <StatsPanel />,
    }),
    [pendingEditorProviderId, handleEditProvider],
  );

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[color:var(--ds-surface-ground)] text-[color:var(--ds-text-primary)]">
      <header className="relative flex h-[52px] shrink-0 items-center gap-2 border-b border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] pl-4 pr-3">
        <Brand />
        <div className="ml-auto flex items-center gap-2">
          <TooltipProvider delayDuration={250}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleSaveLayout}
                  aria-label="Save dock layout"
                  className="h-7 w-7 border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] text-[color:var(--ds-text-secondary)] hover:bg-[color:var(--ds-surface-raised)] hover:text-[color:var(--ds-text-primary)]"
                  data-testid="save-layout"
                >
                  <Save size={13} strokeWidth={1.75} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Save dock layout</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleResetLayout}
                  aria-label="Reset dock layout to defaults"
                  className="h-7 w-7 border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] text-[color:var(--ds-text-secondary)] hover:bg-[color:var(--ds-surface-raised)] hover:text-[color:var(--ds-text-primary)]"
                  data-testid="reset-layout"
                >
                  <LayoutTemplate size={13} strokeWidth={1.75} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Reset dock layout</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setHelpOpen(true)}
                  aria-label="Open help"
                  className="h-7 w-7 border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] text-[color:var(--ds-text-secondary)] hover:bg-[color:var(--ds-surface-raised)] hover:text-[color:var(--ds-text-primary)]"
                  data-testid="help-toggle"
                >
                  <CircleHelp size={13} strokeWidth={1.75} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Help (Ctrl + /)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleToggleTheme}
                  aria-label={tooltipLabel}
                  className="h-7 w-7 border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] text-[color:var(--ds-text-secondary)] hover:bg-[color:var(--ds-surface-raised)] hover:text-[color:var(--ds-text-primary)]"
                  data-testid="theme-toggle"
                >
                  {isDark ? <Sun size={13} strokeWidth={1.75} /> : <Moon size={13} strokeWidth={1.75} />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{tooltipLabel}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <HelpSheet open={helpOpen} onOpenChange={setHelpOpen} />
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col overflow-hidden p-3">
        <div className="flex min-h-0 flex-1 overflow-hidden rounded-md border border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] shadow-[var(--ds-elevation-card)]">
          <DockManagerCore
            ref={dockRef}
            initialState={initialLayout}
            widgets={widgets}
            theme={dockTheme}
            className="h-full w-full"
          />
        </div>
      </main>
    </div>
  );
}
