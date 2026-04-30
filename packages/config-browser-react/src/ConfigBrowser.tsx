"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare const fin: any;

import { useEffect, useRef, useState } from "react";
import { DynamicIcon as Icon } from "@marketsui/icons-svg/react";
import { useConfigBrowser } from "./hooks/useConfigBrowser";
import { TableSidebar } from "./components/TableSidebar";
import { Toolbar } from "./components/Toolbar";
import { DataGrid } from "./components/DataGrid";
import { RowDrawer } from "./components/RowDrawer";
import { ImportPreviewDialog } from "./components/ImportPreviewDialog";
import { DeleteAllDialog } from "./components/DeleteAllDialog";
import { injectEditorStyles } from "./editor-styles";
import type { ImportMode, ImportPreview } from "./hooks/useConfigBrowser";

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
    previewImport,
    importRows,
    deleteAllRows,
  } = useConfigBrowser();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);

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

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    // Reset the input value immediately so picking the same file twice
    // in a row still fires onChange the second time.
    input.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) {
        alert(
          "Import failed: expected a JSON array of rows (the same shape produced by Export JSON). " +
            "Got " + (parsed === null ? "null" : typeof parsed) + ".",
        );
        return;
      }
      // Hand off to the preview dialog — the actual save happens in
      // handleConfirmImport when the user picks a mode.
      setImportPreview(previewImport(parsed));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      alert("Import failed: " + msg);
    }
  };

  const handleConfirmImport = async (mode: ImportMode) => {
    if (!importPreview) return;
    const rowsToImport = importPreview.rows;
    setImportPreview(null);
    const result = await importRows(rowsToImport, mode);
    const summary =
      `Imported ${result.imported} row${result.imported === 1 ? "" : "s"} into ${selected.label}.` +
      (result.skipped > 0 ? `\nSkipped ${result.skipped} existing.` : "") +
      (result.failed > 0 ? `\nFailed ${result.failed}:\n` + result.errors.slice(0, 10).join("\n") : "");
    alert(summary);
  };

  const handleConfirmDeleteAll = async () => {
    setDeleteAllOpen(false);
    const result = await deleteAllRows();
    const summary =
      `Deleted ${result.deleted} row${result.deleted === 1 ? "" : "s"} from ${selected.label}.` +
      (result.failed > 0 ? `\nFailed ${result.failed}:\n` + result.errors.slice(0, 10).join("\n") : "");
    alert(summary);
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
            onImport={handleImportClick}
            onDeleteAll={() => setDeleteAllOpen(true)}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleImportFile}
            style={{ display: "none" }}
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

      {importPreview && (
        <ImportPreviewDialog
          preview={importPreview}
          tableLabel={selected.label}
          primaryKey={selected.primaryKey}
          onCancel={() => setImportPreview(null)}
          onConfirm={handleConfirmImport}
        />
      )}

      {deleteAllOpen && (
        <DeleteAllDialog
          tableLabel={selected.label}
          rowCount={rows.length}
          scope={selected.scopable && hostEnv.appId ? `appId = ${hostEnv.appId}` : null}
          onCancel={() => setDeleteAllOpen(false)}
          onDownloadBackup={handleExport}
          onConfirm={handleConfirmDeleteAll}
        />
      )}

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
