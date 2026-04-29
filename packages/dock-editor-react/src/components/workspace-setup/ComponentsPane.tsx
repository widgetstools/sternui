"use client";

/**
 * Pane ① of the WorkspaceSetup editor — the Components catalog.
 *
 * Reads the registry via the shared useRegistryEditor hook (so any
 * other window subscribed to IAB_REGISTRY_CONFIG_UPDATE sees the
 * same entries). Surfaces:
 *
 *   - Search box + filter chips (all / in-dock / not-in-dock / singleton)
 *   - "+ New" button to draft an empty entry — appears at the top of
 *     the list immediately so the user can edit it in pane ③ before
 *     committing
 *   - Per-row Test Launch button (delegates to the same testComponent
 *     used by the standalone registry editor)
 *   - Per-row Delete button
 *   - Click a row -> selection changes -> pane ③ inspector swaps
 */

import { useMemo, useState } from "react";
import { Plus, PlayCircle, Trash2, Search, Box } from "lucide-react";
import type { RegistryEntry } from "@marketsui/openfin-platform/config";
import { iconIdToSvgUrl } from "../dock-editor/icon-utils";
import type { EditorSelection, ComponentFilter } from "./types";

interface ComponentsPaneProps {
  entries: RegistryEntry[];
  /** Set of registry-entry ids referenced by the current dock layout. */
  inDockEntryIds: Set<string>;
  selection: EditorSelection;
  onSelect: (sel: EditorSelection) => void;
  onAddDraft: () => void;
  onDelete: (entryId: string) => void;
  onTest: (entry: RegistryEntry) => void | Promise<void>;
}

export function ComponentsPane({
  entries,
  inDockEntryIds,
  selection,
  onSelect,
  onAddDraft,
  onDelete,
  onTest,
}: ComponentsPaneProps) {
  const [filter, setFilter] = useState<ComponentFilter>("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (filter === "in-dock" && !inDockEntryIds.has(e.id)) return false;
      if (filter === "not-in-dock" && inDockEntryIds.has(e.id)) return false;
      if (filter === "singleton" && !e.singleton) return false;
      if (term) {
        const hay = `${e.displayName} ${e.componentType} ${e.componentSubType}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [entries, filter, search, inDockEntryIds]);

  const counts = useMemo(() => ({
    all: entries.length,
    inDock: entries.filter((e) => inDockEntryIds.has(e.id)).length,
    notInDock: entries.filter((e) => !inDockEntryIds.has(e.id)).length,
    singleton: entries.filter((e) => e.singleton).length,
  }), [entries, inDockEntryIds]);

  return (
    <div className="flex flex-col h-full border-r" style={{ borderColor: "var(--bn-border)" }}>
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b" style={{ borderColor: "var(--bn-border)" }}>
        <div className="flex flex-col">
          <span className="text-xs font-semibold tracking-wide" style={{ color: "var(--bn-t1)" }}>
            ① COMPONENTS
          </span>
          <span className="text-[10px]" style={{ color: "var(--bn-t2)" }}>
            global · all users
          </span>
        </div>
        <button
          type="button"
          onClick={onAddDraft}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium"
          style={{ background: "var(--bn-bg2)", color: "var(--bn-t0)", border: "1px solid var(--bn-border)" }}
        >
          <Plus className="w-3 h-3" /> New
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b" style={{ borderColor: "var(--bn-border)" }}>
        <div
          className="flex items-center gap-2 rounded-md px-2 py-1"
          style={{ background: "var(--bn-bg2)", border: "1px solid var(--bn-border)" }}
        >
          <Search className="w-3 h-3" style={{ color: "var(--bn-t2)" }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search components"
            className="flex-1 bg-transparent text-xs outline-none"
            style={{ color: "var(--bn-t0)" }}
          />
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-1 px-3 py-2 border-b" style={{ borderColor: "var(--bn-border)" }}>
        <FilterChip current={filter} value="all" label={`All (${counts.all})`} onChange={setFilter} />
        <FilterChip current={filter} value="in-dock" label={`In dock (${counts.inDock})`} onChange={setFilter} />
        <FilterChip current={filter} value="not-in-dock" label={`Not in dock (${counts.notInDock})`} onChange={setFilter} />
        <FilterChip current={filter} value="singleton" label={`Singleton (${counts.singleton})`} onChange={setFilter} />
      </div>

      {/* List */}
      <div className="flex-1 overflow-auto bn-scrollbar min-h-0">
        {filtered.length === 0 && (
          <div className="px-3 py-6 text-center text-xs" style={{ color: "var(--bn-t2)" }}>
            {entries.length === 0
              ? 'No components yet. Click "+ New" to define your first one.'
              : "No components match the current filter."}
          </div>
        )}
        {filtered.map((entry) => {
          const isSelected = selection.kind === "component" && selection.entryId === entry.id;
          const isInDock = inDockEntryIds.has(entry.id);
          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => onSelect({ kind: "component", entryId: entry.id })}
              className="w-full text-left flex items-start gap-2 px-3 py-2 border-b group"
              style={{
                background: isSelected ? "var(--bn-bg3)" : "transparent",
                borderColor: "var(--bn-border)",
                borderLeft: isSelected ? "2px solid var(--bn-accent, #14b8a6)" : "2px solid transparent",
              }}
            >
              <ComponentIcon iconId={entry.iconId} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 text-xs font-medium truncate" style={{ color: "var(--bn-t0)" }}>
                  {entry.singleton && <span title="Singleton">⭐</span>}
                  {entry.type === "external" && <span title="External component">🌐</span>}
                  <span className="truncate">{entry.displayName || "(unnamed)"}</span>
                </div>
                <div className="text-[10px] mt-0.5 truncate" style={{ color: "var(--bn-t2)" }}>
                  {entry.componentType || "—"} / {entry.componentSubType || "—"}
                </div>
                <div className="text-[10px] mt-0.5" style={{ color: isInDock ? "var(--bn-success, #14b8a6)" : "var(--bn-warn, #f59e0b)" }}>
                  {isInDock ? "✓ in dock" : "⚠ not in dock"}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <RowAction
                  title="Configure component"
                  onClick={(e) => { e.stopPropagation(); void onTest(entry); }}
                >
                  <PlayCircle className="w-3 h-3" />
                </RowAction>
                <RowAction
                  title="Delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`Delete "${entry.displayName}"?`)) onDelete(entry.id);
                  }}
                >
                  <Trash2 className="w-3 h-3" />
                </RowAction>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Visual preview of the registry entry's iconId. Falls back to a
// generic Box glyph when no icon is set yet.
function ComponentIcon({ iconId }: { iconId: string | undefined }) {
  const url = iconId ? iconIdToSvgUrl(iconId, "currentColor") : "";
  if (url) {
    return (
      <img
        src={url}
        alt=""
        width={20}
        height={20}
        style={{ width: 20, height: 20, flexShrink: 0, color: "var(--bn-t1)" }}
      />
    );
  }
  return <Box className="w-5 h-5 shrink-0" style={{ color: "var(--bn-t2)" }} />;
}

function FilterChip({
  current,
  value,
  label,
  onChange,
}: {
  current: ComponentFilter;
  value: ComponentFilter;
  label: string;
  onChange: (v: ComponentFilter) => void;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      onClick={() => onChange(value)}
      className="rounded-md px-2 py-0.5 text-[10px] font-medium"
      style={{
        background: active ? "var(--bn-accent, #14b8a6)" : "var(--bn-bg2)",
        color: active ? "var(--bn-bg)" : "var(--bn-t1)",
        border: "1px solid var(--bn-border)",
      }}
    >
      {label}
    </button>
  );
}

function RowAction({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="rounded p-1 hover:bg-white/10"
      style={{ color: "var(--bn-t1)" }}
    >
      {children}
    </button>
  );
}
