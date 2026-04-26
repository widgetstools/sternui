"use client";

/**
 * DockPopout — the small custom window opened when the user clicks a
 * top-level dropdown entry in the Dock3 content menu.
 *
 *   ┌──────────────────────────────┐
 *   │  Structured Products         │
 *   ├──────────────────────────────┤
 *   │  💼  Risk Dashboard          │   ← click to launch
 *   │  📈  Calculated Columns      │
 *   │  📂  Reports                 │   ← sub-folder header
 *   │       ↳ Audit                │     (children indented)
 *   │       ↳ Compliance           │
 *   └──────────────────────────────┘
 *
 * Mounted in a separate OpenFin window (created via Dock3's
 * `showPopupWindow`) at route `/dock-popout`. Reads scope +
 * `dropdownId` from `customData`, loads the dock config, finds the
 * matching top-level DropdownButton, renders its options[] tree,
 * delegates clicks back to `launchRegisteredComponent`, and dispatches
 * the popup result so OpenFin auto-closes the window.
 *
 * Why a custom window: Dock3's ContentMenuEntry folder branch carries
 * no `icon` field — the runtime ignores any folder-icon we pass. The
 * only way to surface user-picked icons next to grouped components is
 * to render the menu ourselves. See
 * `packages/openfin-platform/src/iab-topics.ts` ACTION_OPEN_DOCK_POPOUT.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
declare const fin: any;

import { useEffect, useMemo, useState } from "react";
import {
  loadDockConfig,
  setPlatformDefaultScope,
  type ConfigScope,
  type DockButtonConfig,
  type DockDropdownButtonConfig,
  type DockMenuItemConfig,
  ACTION_LAUNCH_COMPONENT,
} from "@marketsui/openfin-platform/config";
import { iconIdToSvgUrl } from "./components/dock-editor/icon-utils";
import { injectEditorStyles } from "./components/dock-editor/editor-styles";

interface PopoutCustomData {
  dropdownId?: string;
  appId?: string;
  userId?: string;
}

export function DockPopout() {
  useEffect(() => { injectEditorStyles(); }, []);

  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "missing"; reason: string }
    | { kind: "ready"; dropdown: DockDropdownButtonConfig }
  >({ kind: "loading" });

  // Mirror the parent window's data-theme onto our root so the
  // editor-styles tokens resolve under the right theme.
  useEffect(() => {
    try {
      if (typeof fin === "undefined") return;
      (async () => {
        const opts = await fin.me.getOptions();
        const theme = (opts?.customData as { theme?: string } | undefined)?.theme;
        if (theme === "dark" || theme === "light") {
          document.documentElement.setAttribute("data-theme", theme);
        }
      })();
    } catch { /* ignore */ }
  }, []);

  // Load the dock config under the forwarded scope, find the dropdown.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cd = await readCustomData();
        if (!cd.dropdownId) {
          if (!cancelled) setState({ kind: "missing", reason: "No dropdownId in popup customData." });
          return;
        }
        const scope: ConfigScope = {
          appId: cd.appId || undefined,
          userId: cd.userId || undefined,
        };
        // Defensive: prime the module-level scope too — helpers that
        // don't accept an explicit scope will then resolve it correctly.
        if (scope.appId || scope.userId) setPlatformDefaultScope(scope);

        const config = await loadDockConfig(scope);
        const dropdown = (config?.buttons ?? []).find(
          (b: DockButtonConfig): b is DockDropdownButtonConfig =>
            b.type === "DropdownButton" && b.id === cd.dropdownId,
        );
        if (!dropdown) {
          if (!cancelled) setState({
            kind: "missing",
            reason: `Dropdown ${cd.dropdownId} not found — it may have been removed.`,
          });
          return;
        }
        if (!cancelled) setState({ kind: "ready", dropdown });
      } catch (err) {
        console.error("[DockPopout] failed to load dock config:", err);
        if (!cancelled) setState({ kind: "missing", reason: "Failed to load dock config." });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleLaunch = async (item: DockMenuItemConfig) => {
    const refId = (item.customData as { registryEntryId?: string } | undefined)?.registryEntryId;
    if (item.actionId === ACTION_LAUNCH_COMPONENT && refId) {
      try {
        // Lazy import keeps this file safe to render outside OpenFin
        // (the module-top-level workspace-platform import in
        // openfin-platform's main barrel would crash a plain-browser
        // dev server otherwise).
        const { launchRegisteredComponent } = await import("@marketsui/openfin-platform");
        const asWindow = (item.customData as { asWindow?: boolean } | undefined)?.asWindow;
        await launchRegisteredComponent(refId, { asWindow });
      } catch (err) {
        console.error("[DockPopout] launch failed:", err);
      }
    } else if (typeof fin !== "undefined") {
      // Non-launch-component menu items: route through the dock's
      // dispatcher via IAB so the platform handler runs (matches the
      // existing dock click semantics).
      try {
        await fin.InterApplicationBus.publish("dock-popout-action", {
          actionId: item.actionId,
          customData: item.customData,
        });
      } catch (err) {
        console.warn("[DockPopout] IAB publish failed:", err);
      }
    }

    // Dispatch the popup result — Dock3's resultDispatchBehavior:'close'
    // will auto-close this window.
    try {
      if (typeof fin !== "undefined") {
        await fin.me.dispatchPopupResult({ launchedItemId: item.id });
      }
    } catch (err) {
      console.warn("[DockPopout] dispatchPopupResult failed:", err);
    }
  };

  return (
    <div
      data-dock-editor=""
      className="flex flex-col h-screen w-screen overflow-hidden"
      style={{ background: "var(--bn-bg)", color: "var(--bn-t0)", fontFamily: "var(--fi-sans)" }}
    >
      {state.kind === "loading" && <Loader />}
      {state.kind === "missing" && <MissingState reason={state.reason} />}
      {state.kind === "ready" && (
        <Ready dropdown={state.dropdown} onLaunch={handleLaunch} />
      )}
    </div>
  );
}

export default DockPopout;

// ─── Sub-views ───────────────────────────────────────────────────────

function Ready({
  dropdown,
  onLaunch,
}: {
  dropdown: DockDropdownButtonConfig;
  onLaunch: (item: DockMenuItemConfig) => void;
}) {
  return (
    <>
      <header
        className="px-3 py-2 text-xs font-semibold border-b shrink-0 truncate"
        style={{
          color: "var(--bn-t1)",
          borderColor: "var(--bn-border)",
          background: "var(--bn-bg)",
        }}
        title={dropdown.tooltip}
      >
        {dropdown.tooltip}
      </header>
      <div className="flex-1 overflow-auto bn-scrollbar py-1 min-h-0">
        {dropdown.options.length === 0 && (
          <div
            className="px-3 py-6 text-center text-xs"
            style={{ color: "var(--bn-t2)" }}
          >
            This menu has no items yet.
          </div>
        )}
        {dropdown.options.map((item) => (
          <MenuItemRow key={item.id} item={item} depth={0} onLaunch={onLaunch} />
        ))}
      </div>
    </>
  );
}

function MenuItemRow({
  item,
  depth,
  onLaunch,
}: {
  item: DockMenuItemConfig;
  depth: number;
  onLaunch: (item: DockMenuItemConfig) => void;
}) {
  const hasChildren = (item.options?.length ?? 0) > 0;
  const indent = 8 + depth * 12;

  if (hasChildren) {
    return (
      <SubMenu
        item={item}
        depth={depth}
        indent={indent}
        onLaunch={onLaunch}
      />
    );
  }

  // Leaf — clickable launch row.
  return (
    <button
      type="button"
      onClick={() => onLaunch(item)}
      className="w-full text-left flex items-center gap-2 px-3 py-1.5 text-xs"
      style={{
        paddingLeft: indent,
        color: "var(--bn-t0)",
        background: "transparent",
        border: "none",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bn-bg2)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <RowIcon iconId={item.iconId} />
      <span className="truncate">{item.tooltip}</span>
    </button>
  );
}

function SubMenu({
  item,
  depth,
  indent,
  onLaunch,
}: {
  item: DockMenuItemConfig;
  depth: number;
  indent: number;
  onLaunch: (item: DockMenuItemConfig) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left flex items-center gap-2 px-3 py-1.5 text-xs font-medium"
        style={{
          paddingLeft: indent,
          color: "var(--bn-t1)",
          background: "transparent",
          border: "none",
          cursor: "pointer",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bn-bg2)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        <RowIcon iconId={item.iconId} folder />
        <span className="flex-1 truncate">{item.tooltip}</span>
        <span className="text-[10px]" style={{ color: "var(--bn-t2)" }}>
          {open ? "▾" : "▸"}
        </span>
      </button>
      {open &&
        (item.options ?? []).map((child) => (
          <MenuItemRow key={child.id} item={child} depth={depth + 1} onLaunch={onLaunch} />
        ))}
    </>
  );
}

function RowIcon({ iconId, folder = false }: { iconId?: string; folder?: boolean }) {
  const url = useMemo(
    () => (iconId ? iconIdToSvgUrl(iconId, "currentColor") : ""),
    [iconId],
  );
  if (url) {
    return (
      <img
        src={url}
        alt=""
        width={16}
        height={16}
        style={{ width: 16, height: 16, flexShrink: 0 }}
      />
    );
  }
  return (
    <span
      className="text-xs"
      style={{ width: 16, display: "inline-flex", justifyContent: "center", color: "var(--bn-t2)" }}
    >
      {folder ? "▾" : "•"}
    </span>
  );
}

function Loader() {
  return (
    <div
      className="flex-1 flex items-center justify-center text-xs"
      style={{ color: "var(--bn-t2)" }}
    >
      Loading…
    </div>
  );
}

function MissingState({ reason }: { reason: string }) {
  return (
    <div
      className="flex-1 flex flex-col items-center justify-center text-xs gap-2 px-4 text-center"
      style={{ color: "var(--bn-t2)" }}
    >
      <span style={{ color: "var(--bn-warn, #f59e0b)" }}>⚠ {reason}</span>
      <span>Re-open the menu from the dock to refresh.</span>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────

async function readCustomData(): Promise<PopoutCustomData> {
  if (typeof fin === "undefined") return {};
  try {
    const opts = await fin.me.getOptions();
    return (opts?.customData as PopoutCustomData) ?? {};
  } catch {
    return {};
  }
}
