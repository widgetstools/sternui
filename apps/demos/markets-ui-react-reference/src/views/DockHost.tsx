/**
 * DockHost — the custom dock window's React host, mounted at `/dock`.
 *
 * `registerDockCustom` (in `@starui/openfin-platform`) launches a frameless,
 * always-on-top OpenFin window pointed at this route, edge-placed across the
 * top of the primary monitor, and opens the provider↔dock action-dispatch
 * channel. This host renders `<DockBar>` from `@starui/dock-react`, wired to
 * an {@link OpenFinDockController} that round-trips every click to the
 * provider's `dockActionHandlers` over that channel and tracks the live theme
 * via `IAB_THEME_CHANGED`.
 *
 * Config (the user's launcher buttons) is owned by the provider, which holds
 * persistence + scope; the host pulls the initial `DockEditorConfig` over the
 * channel (`controller.getConfig()`) and live-rebuilds on every provider push
 * (`onConfigChanged`) after the existing dock editor saves or a config import
 * (Phase 2 / Session 9). When config is `null` the bar still renders its
 * system controls (Tools menu + theme toggle).
 *
 * `position: fixed; inset: 0` fills the frameless window edge-to-edge,
 * sidestepping the global `body { padding: 10px }` (fixed positioning is
 * viewport-relative, not body-box-relative).
 */
import { useEffect, useState } from "react";
import { DockBar } from "@starui/dock-react";
import type { DockEditorConfig } from "@starui/openfin-platform/config";
import { OpenFinDockController } from "./OpenFinDockController";

/**
 * Last-seen config cache (S16 perf). The provider owns config + scope, but
 * fetching it over the channel after the window boots leaves the bar empty for a
 * beat. Seeding from this localStorage cache renders the user's launcher buttons
 * immediately on relaunch; the channel fetch then refreshes + re-caches.
 */
const CONFIG_CACHE_KEY = "starui:dock-config-cache";

function readCachedConfig(): DockEditorConfig | null {
  try {
    const raw = localStorage.getItem(CONFIG_CACHE_KEY);
    return raw ? (JSON.parse(raw) as DockEditorConfig) : null;
  } catch {
    return null;
  }
}

function writeCachedConfig(config: DockEditorConfig | null): void {
  try {
    if (config) localStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify(config));
    else localStorage.removeItem(CONFIG_CACHE_KEY);
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}

export default function DockHost() {
  const [controller] = useState(() => new OpenFinDockController());
  const [config, setConfig] = useState<DockEditorConfig | null>(() => readCachedConfig());

  useEffect(() => {
    controller.attach();
    let alive = true;
    void controller.getConfig().then((c) => {
      if (alive && c) {
        setConfig(c);
        writeCachedConfig(c);
      }
    });
    const offConfig = controller.onConfigChanged((c) => {
      if (alive) {
        setConfig(c);
        writeCachedConfig(c);
      }
    });
    return () => {
      alive = false;
      offConfig();
      controller.detach();
    };
  }, [controller]);

  // Anchored at the window's top-left (not `inset-0`): the bar is content-sized
  // and drives the frameless window's size via `controller.resizeToContent`
  // (S14), so the host must shrink-wrap rather than stretch to fill.
  return (
    <div className="fixed left-0 top-0">
      <DockBar
        config={config}
        controller={controller}
        workspaceController={controller}
        notificationController={controller}
        appSwitcherController={controller}
      />
    </div>
  );
}
