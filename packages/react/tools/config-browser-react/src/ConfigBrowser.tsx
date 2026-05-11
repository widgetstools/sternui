"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare const fin: any;

import { useEffect, useRef, useState } from "react";
import { DynamicIcon as Icon } from "@starui/icons-svg/react";
import { useConfigBrowser } from "./hooks/useConfigBrowser";
import { TableSidebar } from "./components/TableSidebar";
import { Toolbar } from "./components/Toolbar";
import { DataGrid } from "./components/DataGrid";
import { RowDrawer } from "./components/RowDrawer";
import { ImportPreviewDialog } from "./components/ImportPreviewDialog";
import { DeleteAllDialog } from "./components/DeleteAllDialog";
import { injectEditorStyles } from "./editorStyles";
import type { ImportMode, ImportPreview } from "./hooks/useConfigBrowser";

// ─── Main Component ──────────────────────────────────────────────────

export function ConfigBrowserPanel() {
  const {
    hostEnv,
    restUrl,
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
    exportAll,
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

  const handleExportAll = async () => {
    const bundle = await exportAll();
    const json = JSON.stringify(bundle, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `config-bundle-${hostEnv.appId || "all"}.json`;
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
      className="fixed inset-0 flex flex-col bg-[var(--de-bg-deep)] overflow-hidden font-[var(--de-font)]"
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-[var(--de-border)] bg-[var(--de-bg)]">
        <Icon
          icon="lucide:database"
          className="w-[18px] h-[18px] text-[var(--de-accent)]"
        />
        <span className="text-[14px] font-semibold text-[var(--de-text)]">
          Config Browser
        </span>

        <span className="text-[10px] font-[var(--de-mono)] px-2 py-[3px] rounded-[var(--de-radius-sm)] bg-[var(--de-bg-surface)] text-[var(--de-text-tertiary)] border border-[var(--de-border)]">
          appId: {hostEnv.appId || "—"}
        </span>

        {restUrl ? (
          <span
            title={`Writes mirror to ${restUrl}. Reads still come from local Dexie.`}
            className="inline-flex items-center gap-1.5 text-[10px] font-[var(--de-mono)] px-2 py-[3px] rounded-[var(--de-radius-sm)] bg-[color-mix(in_srgb,var(--de-success,var(--ds-accent-positive))_12%,var(--de-bg-surface))] text-[var(--de-success,var(--ds-accent-positive))] border border-[color-mix(in_srgb,var(--de-success,var(--ds-accent-positive))_35%,var(--de-border))]"
          >
            <Icon icon="lucide:cloud" className="w-3 h-3" />
            <span>connected · {restUrl}</span>
          </span>
        ) : (
          <span
            title="ConfigManager is in local-only mode (no restUrl) — Dexie only."
            className="inline-flex items-center gap-1.5 text-[10px] font-[var(--de-mono)] px-2 py-[3px] rounded-[var(--de-radius-sm)] bg-[var(--de-bg-surface)] text-[var(--de-text-tertiary)] border border-[var(--de-border)]"
          >
            <Icon icon="lucide:cloud-off" className="w-3 h-3" />
            <span>local only</span>
          </span>
        )}

        <div className="flex-1" />

        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          title="Toggle theme"
          className="bg-[var(--de-bg-surface)] border border-[var(--de-border)] rounded-[var(--de-radius-sm)] p-1.5 cursor-pointer text-[var(--de-text-secondary)] flex"
        >
          <Icon
            icon={theme === "dark" ? "lucide:sun" : "lucide:moon"}
            className="w-[15px] h-[15px]"
          />
        </button>
      </div>

      {/* Body: sidebar + main */}
      <div className="flex-1 min-h-0 flex">
        <TableSidebar
          selected={selected.key}
          counts={counts}
          onSelect={setSelected}
        />

        <div className="flex-1 min-w-0 flex flex-col bg-[var(--de-bg-deep)] relative">
          <Toolbar
            table={selected}
            rowCount={rows.length}
            quickFilter={quickFilter}
            onQuickFilterChange={setQuickFilter}
            onRefresh={refresh}
            onNew={openCreate}
            onExport={handleExport}
            onExportAll={handleExportAll}
            onImport={handleImportClick}
            onDeleteAll={() => setDeleteAllOpen(true)}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleImportFile}
            className="hidden"
          />

          <div className="flex-1 min-h-0 flex flex-col pt-2 px-3 pb-3">
            {isLoading ? (
              <div className="flex-1 flex items-center justify-center text-[13px] text-[var(--de-text-tertiary)]">
                Loading…
              </div>
            ) : rows.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3">
                <Icon
                  icon="lucide:inbox"
                  className="w-10 h-10 text-[var(--de-text-ghost)]"
                />
                <div className="text-[13px] text-[var(--de-text-tertiary)]">
                  No rows in {selected.label}
                  {selected.scopable && hostEnv.appId ? ` for ${hostEnv.appId}` : ""}
                </div>
                <button
                  onClick={openCreate}
                  className="bg-primary text-primary-foreground border-none rounded-[var(--de-radius-sm)] px-4 py-2 text-xs font-semibold cursor-pointer hover:bg-primary/90"
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
      <div className="px-5 py-2 border-t border-[var(--de-border)] bg-[var(--de-bg)] flex items-center gap-3 text-[10px] text-[var(--de-text-tertiary)] font-[var(--de-mono)]">
        <span>{rows.length} rows</span>
        <span>·</span>
        <span>dexie · marketsui-config</span>
        <span>·</span>
        <span>{restUrl ? `REST → ${restUrl}` : "local only"}</span>
        <div className="flex-1" />
        <span>{selected.description}</span>
      </div>

    </div>
  );
}
