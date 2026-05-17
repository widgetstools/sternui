import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import {
  DockManagerCore,
  type DockManagerCoreHandle,
  type WidgetProps,
} from "@widgetstools/react-dock-manager";
import {
  type DockManagerState,
  type SerializedDockLayout,
  deserialize,
  serialize,
  slateDark,
  vsCodeLight,
} from "@widgetstools/dock-manager-core";
import { applyTheme, getTheme } from "@starui/design-system";
import { Button } from "@starui/ui";
import { Sun, Moon, Save, RotateCcw } from "lucide-react";
import { Brand } from "./components/Brand";
import { GridPanel } from "./panels/GridPanel";
import { HelpPanel } from "./panels/HelpPanel";

const LAYOUT_KEY = "{{name}}.layout.v1";

const WIDGETS: Record<string, React.ComponentType<WidgetProps>> = {
  grid: () => <GridPanel />,
  help: () => <HelpPanel />,
  // @starui:add-dock-panel-here
};

const DEFAULT_LAYOUT: SerializedDockLayout = {
  version: 1,
  layout: {
    type: "tabgroup",
    id: "root",
    panels: ["grid", "help"],
    activePanel: "grid",
  },
  panels: {
    grid: { id: "grid", title: "Bond Blotter", widgetType: "grid", closable: false },
    help: { id: "help", title: "Help", widgetType: "help", closable: true },
  },
  placements: {
    grid: { type: "docked", groupId: "root" },
    help: { type: "docked", groupId: "root" },
  },
  activePaneId: "grid",
  nextZIndex: 100,
};

function readSavedLayout(): SerializedDockLayout | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SerializedDockLayout;
  } catch {
    return null;
  }
}

function loadInitialState(): DockManagerState {
  const saved = readSavedLayout();
  return deserialize(saved ?? DEFAULT_LAYOUT).state;
}

export function App() {
  const [theme, setThemeState] = useState<"dark" | "light">(
    () => getTheme().theme as "dark" | "light",
  );
  const isDark = theme === "dark";
  const dockRef = useRef<DockManagerCoreHandle | null>(null);
  const [initialState] = useState<DockManagerState>(() => loadInitialState());

  const handleToggleTheme = useCallback(() => {
    const next: "dark" | "light" = isDark ? "light" : "dark";
    applyTheme({ theme: next });
    setThemeState(next);
  }, [isDark]);

  const handleSaveLayout = useCallback(() => {
    const handle = dockRef.current;
    if (!handle) return;
    const state = handle.getState();
    const serialized = serialize(state);
    try {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(serialized));
    } catch {
      /* ignore quota errors */
    }
  }, []);

  const handleResetLayout = useCallback(() => {
    try {
      localStorage.removeItem(LAYOUT_KEY);
    } catch {
      /* */
    }
    window.location.reload();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      const k = e.key.toLowerCase();
      if (k === ".") {
        e.preventDefault();
        handleToggleTheme();
      } else if (k === "s") {
        e.preventDefault();
        handleSaveLayout();
      } else if (e.shiftKey && k === "r") {
        e.preventDefault();
        handleResetLayout();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleToggleTheme, handleSaveLayout, handleResetLayout]);

  const dockTheme = useMemo(() => (isDark ? slateDark : vsCodeLight), [isDark]);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[color:var(--ds-surface-ground)] text-[color:var(--ds-text-primary)]">
      <header className="relative flex h-[52px] shrink-0 items-center gap-2 border-b border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] pl-4 pr-3">
        <Brand />
        <div className="ml-auto flex items-center gap-2">
          {/* @starui:add-menubar-item-here */}
          <Button
            variant="outline"
            size="icon"
            onClick={handleSaveLayout}
            aria-label="Save layout"
            className="h-7 w-7"
          >
            <Save size={13} strokeWidth={1.75} />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={handleResetLayout}
            aria-label="Reset layout"
            className="h-7 w-7"
          >
            <RotateCcw size={13} strokeWidth={1.75} />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={handleToggleTheme}
            aria-label={isDark ? "Switch to light" : "Switch to dark"}
            className="h-7 w-7"
          >
            {isDark ? <Sun size={13} strokeWidth={1.75} /> : <Moon size={13} strokeWidth={1.75} />}
          </Button>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col overflow-hidden p-3">
        <div className="flex min-h-0 flex-1 overflow-hidden rounded-md border border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] shadow-[var(--ds-elevation-card)]">
          <DockManagerCore
            ref={dockRef}
            initialState={initialState}
            widgets={WIDGETS}
            theme={dockTheme}
            className="h-full w-full"
          />
        </div>
      </main>
    </div>
  );
}
