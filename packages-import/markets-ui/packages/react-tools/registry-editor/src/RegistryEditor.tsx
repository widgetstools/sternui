"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare const fin: any;

import { useState, useEffect } from "react";
import { DynamicIcon as Icon } from "@markets/icons-svg/react";
import { useRegistryEditor } from "./hooks/useRegistryEditor";
import { RegistryItemRow } from "./components/RegistryItemRow";
import { RegistryItemForm, type RegistryFormData } from "./components/RegistryItemForm";
import { injectEditorStyles } from "./editor-styles";
import type { RegistryEntry } from "@markets/openfin-workspace";

// ─── Main Component ──────────────────────────────────────────────────

export function RegistryEditorPanel() {
  const { entries, isDirty, isLoading, dispatch, save, testComponent } = useRegistryEditor();

  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogTitle, setDialogTitle] = useState("Add Component");
  const [editTarget, setEditTarget] = useState<{ id: string; data: Partial<RegistryFormData> } | null>(null);

  // Inject design system CSS
  useEffect(() => { injectEditorStyles(); }, []);

  // Sync theme with OpenFin
  useEffect(() => {
    const openFinApi = (window as any).fin;
    if (typeof openFinApi === "undefined") return;

    async function detectInitialTheme() {
      try {
        const platform = openFinApi.Platform.getCurrentSync();
        const scheme = await platform.Theme.getSelectedScheme();
        setTheme(scheme === "dark" ? "dark" : "light");
      } catch { /* keep default */ }
    }
    detectInitialTheme();

    function onThemeChanged(data: { isDark: boolean }) {
      setTheme(data.isDark ? "dark" : "light");
    }

    try {
      openFinApi.InterApplicationBus.subscribe(
        { uuid: openFinApi.me.identity.uuid },
        "theme-changed",
        onThemeChanged,
      );
    } catch { /* IAB not ready */ }

    return () => {
      try {
        openFinApi.InterApplicationBus.unsubscribe(
          { uuid: openFinApi.me.identity.uuid },
          "theme-changed",
          onThemeChanged,
        );
      } catch { /* cleanup */ }
    };
  }, []);

  // Apply dark class for compatibility
  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [theme]);

  // ── Handlers ──

  function handleAdd() {
    setEditTarget(null);
    setDialogTitle("Add Component");
    setDialogOpen(true);
  }

  function handleEdit(entry: RegistryEntry) {
    setEditTarget({
      id: entry.id,
      data: {
        displayName: entry.displayName,
        hostUrl: entry.hostUrl,
        iconId: entry.iconId,
        componentType: entry.componentType,
        componentSubType: entry.componentSubType,
        configId: entry.configId,
      },
    });
    setDialogTitle("Edit Component");
    setDialogOpen(true);
  }

  function handleFormSave(data: RegistryFormData) {
    if (editTarget) {
      dispatch({
        type: "UPDATE_ENTRY",
        id: editTarget.id,
        entry: {
          id: editTarget.id,
          ...data,
          createdAt: entries.find((e) => e.id === editTarget.id)?.createdAt ?? new Date().toISOString(),
        },
      });
    } else {
      dispatch({
        type: "ADD_ENTRY",
        entry: {
          id: crypto.randomUUID(),
          ...data,
          createdAt: new Date().toISOString(),
        },
      });
    }
    setDialogOpen(false);
  }

  function handleDelete(id: string) {
    dispatch({ type: "REMOVE_ENTRY", id });
  }

  // ── Loading state ──

  if (isLoading) {
    return (
      <div data-dock-editor data-theme={theme} style={{
        position: "fixed", inset: 0, display: "flex", alignItems: "center",
        justifyContent: "center", background: "var(--de-bg)",
      }}>
        <div style={{ fontSize: 13, color: "var(--de-text-secondary)" }}>Loading...</div>
      </div>
    );
  }

  // ── Main render ──

  return (
    <div data-dock-editor data-theme={theme} style={{
      position: "fixed", inset: 0, display: "flex", flexDirection: "column",
      background: "var(--de-bg-deep)", overflow: "hidden",
      fontFamily: "var(--de-font)",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "16px 20px", borderBottom: "1px solid var(--de-border)",
        background: "var(--de-bg)",
      }}>
        <Icon icon="lucide:layout-grid" style={{ width: 18, height: 18, color: "var(--de-accent)" }} />
        <span style={{ fontSize: 15, fontWeight: 600, color: "var(--de-text)" }}>
          Component Registry
        </span>
        <span style={{
          fontSize: 11, fontWeight: 500, padding: "2px 8px",
          borderRadius: "var(--de-radius-md)", background: "var(--de-accent-dim)",
          color: "var(--de-accent)",
        }}>
          {entries.length} {entries.length === 1 ? "component" : "components"}
        </span>

        <div style={{ flex: 1 }} />

        {/* Theme toggle */}
        <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")} title="Toggle theme"
          style={{
            background: "var(--de-bg-surface)", border: "1px solid var(--de-border)",
            borderRadius: "var(--de-radius-sm)", padding: 6, cursor: "pointer",
            color: "var(--de-text-secondary)", display: "flex",
          }}>
          <Icon icon={theme === "dark" ? "lucide:sun" : "lucide:moon"} style={{ width: 15, height: 15 }} />
        </button>

        {/* Save */}
        <button onClick={save} disabled={!isDirty} title="Save"
          style={{
            background: isDirty ? "var(--de-accent)" : "var(--de-bg-surface)",
            color: isDirty ? "#000" : "var(--de-text-tertiary)",
            border: isDirty ? "none" : "1px solid var(--de-border)",
            borderRadius: "var(--de-radius-sm)", padding: "6px 16px",
            fontSize: 12, fontWeight: 600, cursor: isDirty ? "pointer" : "default",
            opacity: isDirty ? 1 : 0.5,
          }}>
          Save
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: "auto", padding: "12px 16px" }}>
        {entries.length === 0 ? (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", height: "100%", gap: 12,
          }}>
            <Icon icon="lucide:package-open" style={{ width: 40, height: 40, color: "var(--de-text-ghost)" }} />
            <div style={{ fontSize: 13, color: "var(--de-text-tertiary)" }}>
              No components registered yet
            </div>
            <button onClick={handleAdd} style={{
              background: "var(--de-accent)", color: "var(--de-bg-deep)", border: "none",
              borderRadius: "var(--de-radius-sm)", padding: "8px 20px",
              fontSize: 12, fontWeight: 600, cursor: "pointer",
            }}>
              Add Component
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {entries.map((entry) => (
              <RegistryItemRow
                key={entry.id}
                entry={entry}
                onEdit={() => handleEdit(entry)}
                onTest={() => testComponent(entry)}
                onDelete={() => handleDelete(entry.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {entries.length > 0 && (
        <div style={{
          padding: "12px 20px", borderTop: "1px solid var(--de-border)",
          background: "var(--de-bg)", display: "flex", justifyContent: "center",
        }}>
          <button onClick={handleAdd} style={{
            background: "var(--de-bg-surface)", color: "var(--de-text-secondary)",
            border: "1px solid var(--de-border)", borderRadius: "var(--de-radius-sm)",
            padding: "8px 20px", fontSize: 12, fontWeight: 500, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <Icon icon="lucide:plus" style={{ width: 14, height: 14 }} />
            Add Component
          </button>
        </div>
      )}

      {/* Dialog */}
      <RegistryItemForm
        open={dialogOpen}
        title={dialogTitle}
        initial={editTarget?.data}
        onSave={handleFormSave}
        onCancel={() => setDialogOpen(false)}
      />
    </div>
  );
}
