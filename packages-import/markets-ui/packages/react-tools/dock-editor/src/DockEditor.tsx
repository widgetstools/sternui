"use client";

import { useState, useEffect, useCallback } from "react";
import { DynamicIcon as Icon } from "@markets/icons-svg/react";
import { useDockEditor } from "./hooks/useDockEditor";
import { TreeItem, type TreeItemData } from "./components/dock-editor/TreeItem";
import { ItemFormDialog, type ItemFormData } from "./components/dock-editor/ItemFormDialog";
import { iconIdToSvgUrl, parseIconUrl } from "./components/dock-editor/icon-utils";
import { injectEditorStyles } from "./components/dock-editor/editor-styles";
import type {
  DockButtonConfig,
  DockDropdownButtonConfig,
  DockMenuItemConfig,
} from "@markets/openfin-workspace";

// ─── Converters ──────────────────────────────────────────────────────

function menuItemToTree(item: DockMenuItemConfig): TreeItemData {
  const parsed = parseIconUrl(item.iconUrl);
  // An item is a container if it has an options array (even empty)
  const isContainer = Array.isArray(item.options);
  return {
    id: item.id,
    label: item.tooltip,
    iconId: parsed.iconId,
    iconName: parsed.iconName,
    actionId: item.actionId,
    childCount: item.options?.length ?? 0,
    children: item.options?.map(menuItemToTree),
    isContainer,
  };
}

function buttonToTree(btn: DockButtonConfig): TreeItemData {
  const isDropdown = btn.type === "DropdownButton";
  const dropdown = isDropdown ? (btn as DockDropdownButtonConfig) : null;
  const parsed = parseIconUrl(btn.iconUrl);
  return {
    id: btn.id,
    label: btn.tooltip,
    iconId: parsed.iconId,
    iconName: parsed.iconName,
    actionId: isDropdown ? undefined : (btn as { actionId: string }).actionId,
    childCount: dropdown?.options?.length ?? 0,
    children: dropdown?.options?.map(menuItemToTree),
    isContainer: isDropdown,
  };
}

function findMenuItemById(items: DockMenuItemConfig[], id: string): DockMenuItemConfig | undefined {
  for (const item of items) {
    if (item.id === id) return item;
    if (item.options) {
      const found = findMenuItemById(item.options, id);
      if (found) return found;
    }
  }
  return undefined;
}

// ─── Component ───────────────────────────────────────────────────────

export function DockEditorPanel() {
  const { buttons, isDirty, isLoading, dispatch, save, reset } = useDockEditor();
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addChildDialogOpen, setAddChildDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<{ id: string; data: Partial<ItemFormData> } | null>(null);
  const [addChildParent, setAddChildParent] = useState<{ buttonId: string; parentItemId?: string } | null>(null);

  // Inject design system styles
  useEffect(() => {
    injectEditorStyles();
  }, []);

  // ── Sync theme with OpenFin platform ──
  // The dock editor runs in a child window, so it can't call provider
  // functions directly. Instead, it:
  //   1. Reads the initial theme from the OpenFin Theme API on mount
  //   2. Listens for "theme-changed" messages via InterApplicationBus
  //      (published by the toggle-theme action in workspace.ts)
  //
  // When running outside OpenFin (e.g. during development), this
  // effect is skipped entirely and the default "dark" theme is used.
  useEffect(() => {
    // Check if we're running inside OpenFin
    const openFinApi = (window as any).fin;
    if (typeof openFinApi === "undefined") {
      return; // Not in OpenFin — keep default theme
    }

    // Read the current platform theme on mount
    async function detectInitialTheme() {
      try {
        const platform = openFinApi.Platform.getCurrentSync();
        const scheme = await platform.Theme.getSelectedScheme();
        // OpenFin returns "dark" or "light" as a string
        setTheme(scheme === "dark" ? "dark" : "light");
      } catch {
        // If the Theme API is unavailable, keep the default theme
      }
    }
    detectInitialTheme();

    // Listen for theme changes broadcast by the provider window
    function onThemeChanged(data: { isDark: boolean }) {
      setTheme(data.isDark ? "dark" : "light");
    }

    try {
      openFinApi.InterApplicationBus.subscribe(
        { uuid: openFinApi.me.identity.uuid },
        "theme-changed",
        onThemeChanged,
      );
    } catch {
      // IAB subscription may fail if the bus isn't ready yet
    }

    // Cleanup: unsubscribe when the component unmounts
    return () => {
      try {
        openFinApi.InterApplicationBus.unsubscribe(
          { uuid: openFinApi.me.identity.uuid },
          "theme-changed",
          onThemeChanged,
        );
      } catch {
        // Ignore cleanup errors — window may already be closing
      }
    };
  }, []);

  // Apply dark class for shadcn compatibility
  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [theme]);

  const treeData: TreeItemData[] = buttons.map(buttonToTree);

  // ── Handlers (unchanged logic) ────────────────────────────────────

  const handleAddToolbarButton = useCallback((data: ItemFormData) => {
    const id = `btn-${Date.now()}`;
    const color = data.iconColor;
    const iconUrl = iconIdToSvgUrl(data.iconId, color);
    if (data.hasChildren) {
      dispatch({ type: "ADD_BUTTON", button: { type: "DropdownButton", id, tooltip: data.label, iconUrl, iconId: data.iconId, iconColor: color, options: [] } });
    } else {
      dispatch({ type: "ADD_BUTTON", button: { type: "ActionButton", id, tooltip: data.label, iconUrl, iconId: data.iconId, iconColor: color, actionId: data.actionId } });
    }
  }, [dispatch]);

  const handleAddChild = useCallback((data: ItemFormData) => {
    if (!addChildParent) return;
    const color = data.iconColor;
    const item: DockMenuItemConfig = {
      id: `menu-${Date.now()}`,
      tooltip: data.label,
      iconUrl: iconIdToSvgUrl(data.iconId, color),
      iconId: data.iconId,
      iconColor: color,
      actionId: data.actionId,
      options: data.hasChildren ? [] : undefined,
    };
    dispatch({ type: "ADD_MENU_ITEM", buttonId: addChildParent.buttonId, item, parentItemId: addChildParent.parentItemId });
    setAddChildParent(null);
  }, [dispatch, addChildParent]);

  const handleEdit = useCallback((id: string) => {
    for (const btn of buttons) {
      if (btn.id === id) {
        const parsed = btn.iconId ? { iconName: parseIconUrl(btn.iconUrl).iconName, iconId: btn.iconId } : parseIconUrl(btn.iconUrl);
        setEditTarget({ id, data: { label: btn.tooltip, actionId: btn.type === "ActionButton" ? (btn as { actionId: string }).actionId : "", hasChildren: btn.type === "DropdownButton", iconName: parsed.iconName, iconId: parsed.iconId, iconColor: btn.iconColor } });
        setEditDialogOpen(true);
        return;
      }
      if (btn.type === "DropdownButton") {
        const found = findMenuItemById((btn as DockDropdownButtonConfig).options, id);
        if (found) {
          const parsed = found.iconId ? { iconName: parseIconUrl(found.iconUrl).iconName, iconId: found.iconId } : parseIconUrl(found.iconUrl);
          setEditTarget({ id, data: { label: found.tooltip, actionId: found.actionId ?? "", hasChildren: !!(found.options?.length), iconName: parsed.iconName, iconId: parsed.iconId, iconColor: found.iconColor } });
          setEditDialogOpen(true);
          return;
        }
      }
    }
  }, [buttons]);

  const handleSaveEdit = useCallback((data: ItemFormData) => {
    if (!editTarget) return;
    const { id } = editTarget;
    const color = data.iconColor;
    const newIconUrl = iconIdToSvgUrl(data.iconId, color);
    const btnIndex = buttons.findIndex((b) => b.id === id);
    if (btnIndex !== -1) {
      const btn = buttons[btnIndex];
      dispatch({ type: "UPDATE_BUTTON", id, button: { ...btn, tooltip: data.label, iconUrl: newIconUrl, iconId: data.iconId, iconColor: color, ...(btn.type === "ActionButton" ? { actionId: data.actionId } : {}) } as DockButtonConfig });
    } else {
      for (const btn of buttons) {
        if (btn.type === "DropdownButton") {
          const found = findMenuItemById((btn as DockDropdownButtonConfig).options, id);
          if (found) {
            dispatch({ type: "UPDATE_MENU_ITEM", buttonId: btn.id, itemId: id, item: { ...found, tooltip: data.label, iconUrl: newIconUrl, iconId: data.iconId, iconColor: color, actionId: data.actionId } });
            break;
          }
        }
      }
    }
    setEditTarget(null);
  }, [editTarget, buttons, dispatch]);

  const handleRemove = useCallback((id: string) => {
    if (!window.confirm("Delete this item?")) return;
    if (buttons.some((b) => b.id === id)) { dispatch({ type: "REMOVE_BUTTON", id }); return; }
    for (const btn of buttons) {
      if (btn.type === "DropdownButton" && findMenuItemById((btn as DockDropdownButtonConfig).options, id)) {
        dispatch({ type: "REMOVE_MENU_ITEM", buttonId: btn.id, itemId: id }); return;
      }
    }
  }, [buttons, dispatch]);

  const handleMoveUp = useCallback((id: string) => {
    const idx = buttons.findIndex((b) => b.id === id);
    if (idx > 0) dispatch({ type: "REORDER_BUTTONS", fromIndex: idx, toIndex: idx - 1 });
  }, [buttons, dispatch]);

  const handleMoveDown = useCallback((id: string) => {
    const idx = buttons.findIndex((b) => b.id === id);
    if (idx >= 0 && idx < buttons.length - 1) dispatch({ type: "REORDER_BUTTONS", fromIndex: idx, toIndex: idx + 1 });
  }, [buttons, dispatch]);

  const handleAddChildClick = useCallback((parentId: string) => {
    for (const btn of buttons) {
      if (btn.id === parentId) { setAddChildParent({ buttonId: btn.id }); setAddChildDialogOpen(true); return; }
      if (btn.type === "DropdownButton" && findMenuItemById((btn as DockDropdownButtonConfig).options, parentId)) {
        setAddChildParent({ buttonId: btn.id, parentItemId: parentId }); setAddChildDialogOpen(true); return;
      }
    }
  }, [buttons]);

  const handleExport = useCallback(() => {
    const blob = new Blob([JSON.stringify(buttons, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "dock-config.json"; a.click();
    URL.revokeObjectURL(url);
  }, [buttons]);

  const handleImport = useCallback(() => {
    const input = document.createElement("input"); input.type = "file"; input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try { const data = JSON.parse(await file.text()); if (Array.isArray(data)) dispatch({ type: "SET_BUTTONS", buttons: data }); } catch { /* ignore */ }
    };
    input.click();
  }, [dispatch]);

  // Recursive tree renderer
  function renderChildren(items: TreeItemData[], depth: number, buttonId: string) {
    return items.map((item, idx) => (
      <TreeItem key={item.id} item={item} index={idx} total={items.length} depth={depth}
        onEdit={handleEdit} onRemove={handleRemove} onMoveUp={handleMoveUp} onMoveDown={handleMoveDown} onAddChild={handleAddChildClick}>
        {item.children && item.children.length > 0 && renderChildren(item.children, depth + 1, buttonId)}
      </TreeItem>
    ));
  }

  // ── Loading ───────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div data-dock-editor data-theme={theme} style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--de-bg)" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <div style={{ width: 28, height: 28, border: "2px solid var(--de-accent)", borderTopColor: "transparent", borderRadius: "50%", animation: "de-spin 0.8s linear infinite" }} />
          <span style={{ fontSize: 13, color: "var(--de-text-secondary)", letterSpacing: "0.02em" }}>Loading configuration…</span>
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div data-dock-editor data-theme={theme} style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column", background: "var(--de-bg-deep)", overflow: "hidden" }}>

      {/* ── Header ──────────────────────────────────────────────── */}
      <header style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "16px 24px", borderBottom: "1px solid var(--de-border)",
        background: "var(--de-bg)", flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{
            width: 36, height: 36, borderRadius: "var(--de-radius-md)",
            background: "var(--de-accent-dim)", display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Icon icon="lucide:layout-grid" style={{ width: 18, height: 18, color: "var(--de-accent)" }} />
          </div>
          <div>
            <h1 style={{ fontSize: 16, fontWeight: 600, color: "var(--de-text)", lineHeight: 1.3, letterSpacing: "-0.01em", margin: 0 }}>
              Menu Editor
            </h1>
            <p style={{ fontSize: 12, color: "var(--de-text-tertiary)", margin: 0, marginTop: 1 }}>
              Configure toolbar buttons and menu hierarchy
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {isDirty && (
            <button onClick={save} style={{
              display: "flex", alignItems: "center", gap: 6, padding: "7px 14px",
              background: "var(--de-accent)", color: "var(--de-bg-deep)", border: "none",
              borderRadius: "var(--de-radius-sm)", fontSize: 12, fontWeight: 600,
              fontFamily: "var(--de-font)", cursor: "pointer", letterSpacing: "0.01em",
              boxShadow: "var(--de-shadow-glow)",
            }}>
              <Icon icon="lucide:save" style={{ width: 13, height: 13 }} />
              Save Changes
            </button>
          )}
          <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")} title="Toggle theme" style={{
            width: 34, height: 34, borderRadius: "50%", border: "1px solid var(--de-border)",
            background: "var(--de-bg-raised)", display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", color: "var(--de-text-secondary)", transition: "all 0.2s",
          }}>
            <Icon icon={theme === "dark" ? "lucide:sun" : "lucide:moon"} style={{ width: 15, height: 15 }} />
          </button>
        </div>
      </header>

      {/* ── Body ────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", gap: 1, minHeight: 0, background: "var(--de-border-subtle)" }}>

        {/* ── Left: Structure ─────────────────────────────────── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "var(--de-bg)", minWidth: 0, overflow: "hidden" }}>

          {/* Section header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "14px 20px", borderBottom: "1px solid var(--de-border)", flexShrink: 0,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Icon icon="lucide:list-tree" style={{ width: 14, height: 14, color: "var(--de-text-tertiary)" }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: "var(--de-text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Structure
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <SmallButton icon="lucide:upload" label="Import" onClick={handleImport} />
              <SmallButton icon="lucide:download" label="Export" onClick={handleExport} />
            </div>
          </div>

          {/* Add button */}
          <div style={{ padding: "12px 16px 0" }}>
            <button onClick={() => setAddDialogOpen(true)} style={{
              width: "100%", height: 38, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              border: "1px dashed var(--de-border-strong)", borderRadius: "var(--de-radius-sm)",
              background: "transparent", color: "var(--de-text-secondary)", fontSize: 12,
              fontFamily: "var(--de-font)", fontWeight: 500, cursor: "pointer", transition: "all 0.15s",
            }} onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--de-accent)"; e.currentTarget.style.color = "var(--de-accent)"; e.currentTarget.style.background = "var(--de-accent-subtle)"; }}
               onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--de-border-strong)"; e.currentTarget.style.color = "var(--de-text-secondary)"; e.currentTarget.style.background = "transparent"; }}>
              <Icon icon="lucide:plus" style={{ width: 14, height: 14 }} />
              Add Toolbar Button
            </button>
          </div>

          {/* Tree */}
          <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px 16px" }}>
            {treeData.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingTop: 64, paddingBottom: 64 }}>
                <div style={{ width: 52, height: 52, borderRadius: "var(--de-radius-lg)", background: "var(--de-bg-surface)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
                  <Icon icon="lucide:layout-grid" style={{ width: 22, height: 22, color: "var(--de-text-ghost)" }} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 500, color: "var(--de-text-secondary)" }}>No toolbar buttons</span>
                <span style={{ fontSize: 12, color: "var(--de-text-tertiary)", marginTop: 4 }}>Click above to create your first button</span>
              </div>
            ) : (
              treeData.map((item, idx) => (
                <TreeItem key={item.id} item={item} index={idx} total={treeData.length} depth={0}
                  onEdit={handleEdit} onRemove={handleRemove} onMoveUp={handleMoveUp} onMoveDown={handleMoveDown} onAddChild={handleAddChildClick}>
                  {item.children && item.children.length > 0 && renderChildren(item.children, 1, item.id)}
                </TreeItem>
              ))
            )}
          </div>
        </div>

        {/* ── Right: Preview ──────────────────────────────────── */}
        <div style={{ width: 340, flexShrink: 0, display: "flex", flexDirection: "column", background: "var(--de-bg)", overflow: "hidden" }}>

          <div style={{
            padding: "14px 20px", borderBottom: "1px solid var(--de-border)", flexShrink: 0,
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <Icon icon="lucide:eye" style={{ width: 14, height: 14, color: "var(--de-text-tertiary)" }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--de-text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Preview
            </span>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
            {/* Toolbar preview */}
            <div style={{ marginBottom: 24 }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: "var(--de-text-ghost)", textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 8 }}>
                Toolbar
              </span>
              <div style={{
                display: "flex", flexWrap: "wrap", gap: 6, padding: 10,
                borderRadius: "var(--de-radius-md)", border: "1px solid var(--de-border)",
                background: "var(--de-bg-raised)", minHeight: 44,
              }}>
                {treeData.length === 0 && (
                  <span style={{ fontSize: 11, color: "var(--de-text-ghost)", padding: "4px 0" }}>No buttons configured</span>
                )}
                {treeData.map((item) => (
                  <div key={item.id} style={{
                    display: "flex", alignItems: "center", gap: 6, padding: "5px 10px",
                    borderRadius: "var(--de-radius-sm)", border: "1px solid var(--de-border)",
                    background: "var(--de-bg-surface)", fontSize: 12, color: "var(--de-text)",
                  }}>
                    <Icon icon={item.iconId} style={{ width: 13, height: 13, color: "var(--de-text-secondary)" }} />
                    <span style={{ fontWeight: 500 }}>{item.label}</span>
                    {(item.childCount ?? 0) > 0 && (
                      <Icon icon="lucide:chevron-down" style={{ width: 11, height: 11, color: "var(--de-text-tertiary)" }} />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Tree structure */}
            <div>
              <span style={{ fontSize: 10, fontWeight: 600, color: "var(--de-text-ghost)", textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 8 }}>
                Hierarchy
              </span>
              <div style={{
                borderRadius: "var(--de-radius-md)", border: "1px solid var(--de-border)",
                background: "var(--de-bg-raised)", padding: "8px 4px",
              }}>
                {treeData.length === 0 ? (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "20px 0" }}>
                    <span style={{ fontSize: 11, color: "var(--de-text-ghost)" }}>Empty</span>
                  </div>
                ) : treeData.map((item) => (
                  <PreviewNode key={item.id} item={item} depth={0} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Dialogs ─────────────────────────────────────────────── */}
      <ItemFormDialog open={addDialogOpen} onOpenChange={setAddDialogOpen} title="Add Toolbar Button" onSave={handleAddToolbarButton} />
      <ItemFormDialog open={addChildDialogOpen} onOpenChange={(o) => { setAddChildDialogOpen(o); if (!o) setAddChildParent(null); }} title="Add Child Item" onSave={handleAddChild} />
      {editTarget && (
        <ItemFormDialog open={editDialogOpen} onOpenChange={(o) => { setEditDialogOpen(o); if (!o) setEditTarget(null); }} title="Edit Item" initial={editTarget.data} onSave={handleSaveEdit} />
      )}
    </div>
  );
}

// ── Small utility button ─────────────────────────────────────────────

function SmallButton({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 5, padding: "4px 10px",
      border: "1px solid var(--de-border)", borderRadius: "var(--de-radius-sm)",
      background: "transparent", color: "var(--de-text-secondary)", fontSize: 11,
      fontFamily: "var(--de-font)", fontWeight: 500, cursor: "pointer", transition: "all 0.15s",
    }} onMouseEnter={e => { e.currentTarget.style.background = "var(--de-bg-hover)"; e.currentTarget.style.color = "var(--de-text)"; }}
       onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--de-text-secondary)"; }}>
      <Icon icon={icon} style={{ width: 12, height: 12 }} />
      {label}
    </button>
  );
}

// ── Preview tree node ────────────────────────────────────────────────

function PreviewNode({ item, depth }: { item: TreeItemData; depth: number }) {
  const [open, setOpen] = useState(depth === 0);
  const hasKids = item.children && item.children.length > 0;

  return (
    <div>
      <div
        onClick={() => hasKids && setOpen(!open)}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          paddingLeft: depth * 16 + 10, paddingRight: 10, paddingTop: 5, paddingBottom: 5,
          fontSize: 12, cursor: hasKids ? "pointer" : "default",
          borderRadius: "var(--de-radius-sm)", transition: "background 0.12s",
          color: "var(--de-text)",
        }}
        onMouseEnter={e => { e.currentTarget.style.background = "var(--de-bg-hover)"; }}
        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
      >
        {hasKids ? (
          <Icon icon={open ? "lucide:chevron-down" : "lucide:chevron-right"} style={{ width: 12, height: 12, color: "var(--de-text-tertiary)", flexShrink: 0 }} />
        ) : (
          <span style={{ width: 12, flexShrink: 0 }} />
        )}
        <Icon icon={item.iconId} style={{ width: 13, height: 13, color: "var(--de-text-secondary)", flexShrink: 0 }} />
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.label}</span>
        {hasKids && (
          <span style={{ fontSize: 10, color: "var(--de-text-ghost)", fontWeight: 500 }}>{item.children!.length}</span>
        )}
      </div>
      {hasKids && open && item.children!.map(c => <PreviewNode key={c.id} item={c} depth={depth + 1} />)}
    </div>
  );
}
