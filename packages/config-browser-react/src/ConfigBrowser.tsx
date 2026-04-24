"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare const fin: any;

import { useEffect, useState } from "react";
import { DynamicIcon as Icon } from "@marketsui/icons-svg/react";
import { useConfigBrowser } from "./hooks/useConfigBrowser";
import { TableSidebar } from "./components/TableSidebar";
import { Toolbar } from "./components/Toolbar";
import { DataGrid } from "./components/DataGrid";
import { RowDrawer } from "./components/RowDrawer";
import { injectEditorStyles } from "./editor-styles";

// ─── Main Component ──────────────────────────────────────────────────

export function ConfigBrowserPanel() {
  const {
    hostEnv,
    selected,
    setSelected,
    rows,
    counts,
    isLoading,
    refresh,
    saveRow,
    deleteRow,
  } = useConfigBrowser();

  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [quickFilter, setQuickFilter] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<"edit" | "create">("edit");
  const [drawerRow, setDrawerRow] = useState<any | null>(null);

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

  // Apply [data-theme] so fi-dark / fi-light CSS vars re-resolve.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [theme]);

  const openEdit = (row: any) => {
    setDrawerMode("edit");
    setDrawerRow(row);
    setDrawerOpen(true);
  };

  const openCreate = () => {
    // Pre-fill appId for scopable tables so the new row lands in-scope
    const templateRow: Record<string, any> = rows[0] ? { ...rows[0] } : {};
    for (const k of Object.keys(templateRow)) templateRow[k] = "";
    if (selected.scopable && hostEnv.appId) templateRow["appId"] = hostEnv.appId;
    const now = new Date().toISOString();
    if ("creationTime" in templateRow) templateRow["creationTime"] = now;
    if ("updatedTime" in templateRow) templateRow["updatedTime"] = now;
    setDrawerMode("create");
    setDrawerRow(templateRow);
    setDrawerOpen(true);
  };

  const handleExport = () => {
    const json = JSON.stringify(rows, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selected.key}-${hostEnv.appId || "all"}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      data-dock-editor
      data-theme={theme}
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        background: "var(--de-bg-deep)",
        overflow: "hidden",
        fontFamily: "var(--de-font)",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "12px 20px",
          borderBottom: "1px solid var(--de-border)",
          background: "var(--de-bg)",
        }}
      >
        <Icon
          icon="lucide:database"
          style={{ width: 18, height: 18, color: "var(--de-accent)" }}
        />
        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--de-text)" }}>
          Config Browser
        </span>

        <span
          style={{
            fontSize: 10,
            fontFamily: "var(--de-mono)",
            padding: "3px 8px",
            borderRadius: "var(--de-radius-sm)",
            background: "var(--de-bg-surface)",
            color: "var(--de-text-tertiary)",
            border: "1px solid var(--de-border)",
          }}
        >
          appId: {hostEnv.appId || "—"}
        </span>

        <div style={{ flex: 1 }} />

        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          title="Toggle theme"
          style={{
            background: "var(--de-bg-surface)",
            border: "1px solid var(--de-border)",
            borderRadius: "var(--de-radius-sm)",
            padding: 6,
            cursor: "pointer",
            color: "var(--de-text-secondary)",
            display: "flex",
          }}
        >
          <Icon
            icon={theme === "dark" ? "lucide:sun" : "lucide:moon"}
            style={{ width: 15, height: 15 }}
          />
        </button>
      </div>

      {/* Body: sidebar + main */}
      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
        <TableSidebar
          selected={selected.key}
          counts={counts}
          onSelect={setSelected}
        />

        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            background: "var(--de-bg-deep)",
            position: "relative",
          }}
        >
          <Toolbar
            table={selected}
            rowCount={rows.length}
            quickFilter={quickFilter}
            onQuickFilterChange={setQuickFilter}
            onRefresh={refresh}
            onNew={openCreate}
            onExport={handleExport}
          />

          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
              padding: "8px 12px 12px 12px",
            }}
          >
            {isLoading ? (
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 13,
                  color: "var(--de-text-tertiary)",
                }}
              >
                Loading…
              </div>
            ) : rows.length === 0 ? (
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 12,
                }}
              >
                <Icon
                  icon="lucide:inbox"
                  style={{ width: 40, height: 40, color: "var(--de-text-ghost)" }}
                />
                <div style={{ fontSize: 13, color: "var(--de-text-tertiary)" }}>
                  No rows in {selected.label}
                  {selected.scopable && hostEnv.appId ? ` for ${hostEnv.appId}` : ""}
                </div>
                <button
                  onClick={openCreate}
                  style={{
                    background: "var(--de-accent)",
                    color: "var(--bn-cta-text, #fff)",
                    border: "none",
                    borderRadius: "var(--de-radius-sm)",
                    padding: "8px 16px",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Add first row
                </button>
              </div>
            ) : (
              <DataGrid
                rows={rows}
                theme={theme}
                quickFilter={quickFilter}
                primaryKey={selected.primaryKey}
                onRowClick={openEdit}
              />
            )}
          </div>

          {/* Right-docked JSON editor — anchors to the main pane so it
              doesn't cover the header, footer, or table sidebar. */}
          <RowDrawer
            open={drawerOpen}
            mode={drawerMode}
            initialRow={drawerRow}
            primaryKey={selected.primaryKey}
            onClose={() => setDrawerOpen(false)}
            onSave={saveRow}
            onDelete={deleteRow}
          />
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          padding: "8px 20px",
          borderTop: "1px solid var(--de-border)",
          background: "var(--de-bg)",
          display: "flex",
          alignItems: "center",
          gap: 12,
          fontSize: 10,
          color: "var(--de-text-tertiary)",
          fontFamily: "var(--de-mono)",
        }}
      >
        <span>{rows.length} rows</span>
        <span>·</span>
        <span>dexie</span>
        <span>·</span>
        <span>marketsui-config</span>
        <div style={{ flex: 1 }} />
        <span>{selected.description}</span>
      </div>

    </div>
  );
}
