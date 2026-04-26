"use client";

/**
 * WorkspaceSetup — the unified 3-pane editor that supersedes the
 * separate Dock Editor and Registry Editor windows.
 *
 *   ① COMPONENTS  →  ② DOCK LAYOUT  →  ③ INSPECTOR
 *   (catalog —      (where they         (form for whatever
 *    global)         appear — per-       is selected)
 *                    user)
 *
 * Logical flow reads left → right:
 *   1. Define what's available  (pane ①, +New)
 *   2. Place it in the dock     (pane ②, drag from ① — drag lands
 *                                in commit 2; for now use the existing
 *                                Dock Editor for placement)
 *   3. Configure / test         (pane ③, edit form + Test Launch)
 *
 * Builds on the existing useRegistryEditor + useDockEditor hooks, so
 * IAB updates flow naturally — saving here propagates to other windows
 * exactly as the standalone editors do.
 */

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRegistryEditor } from "@marketsui/registry-editor";
import type { RegistryEntry } from "@marketsui/openfin-platform/config";
import { ACTION_LAUNCH_COMPONENT } from "@marketsui/openfin-platform/config";
import { useDockEditor } from "./hooks/useDockEditor";
import { ComponentsPane } from "./components/workspace-setup/ComponentsPane";
import { InspectorPane } from "./components/workspace-setup/InspectorPane";
import { DockPane } from "./components/workspace-setup/DockPane";
import { newDraftEntry } from "./components/workspace-setup/types";
import type { EditorSelection } from "./components/workspace-setup/types";
import { injectEditorStyles } from "./components/dock-editor/editor-styles";

export function WorkspaceSetup() {
  // Inject global font + scrollbar styles (shared with the standalone editors)
  useEffect(() => { injectEditorStyles(); }, []);

  // Registry hook — global scope. We don't pass scope; it defaults to
  // the platform default which db.ts maps to (appId, 'system') for
  // registry CRUD per Phase 4.
  const registry = useRegistryEditor();
  // Dock hook — per-user scope (default).
  const dock = useDockEditor();

  const [selection, setSelection] = useState<EditorSelection>({ kind: "none" });

  // ─── Cross-pane indexes ─────────────────────────────────────────
  // For pane ①'s "in dock" badge + filter chips, and for the Inspector's
  // "currently in your dock" footer.
  const inDockEntryIds = useMemo(() => {
    const ids = new Set<string>();
    const visit = (item: { actionId?: string; customData?: unknown; options?: unknown[] }): void => {
      if (item.actionId === ACTION_LAUNCH_COMPONENT) {
        const cd = (item.customData ?? {}) as { registryEntryId?: string };
        if (cd.registryEntryId) ids.add(cd.registryEntryId);
      }
      const opts = (item.options ?? []) as Array<{ actionId?: string; customData?: unknown; options?: unknown[] }>;
      for (const sub of opts) visit(sub);
    };
    for (const btn of dock.buttons) visit(btn as never);
    return ids;
  }, [dock.buttons]);

  // Counts for the empty-selection summary card.
  const summary = useMemo(() => ({
    totalComponents: registry.entries.length,
    inDock: inDockEntryIds.size,
    singletons: registry.entries.filter((e) => e.singleton).length,
    dockButtons: dock.buttons.length,
  }), [registry.entries, inDockEntryIds, dock.buttons]);

  // ─── Component CRUD bridges ─────────────────────────────────────
  const handleAddDraft = useCallback(() => {
    const entry = newDraftEntry(registry.hostEnv);
    registry.dispatch({ type: "ADD_ENTRY", entry });
    setSelection({ kind: "component", entryId: entry.id });
  }, [registry]);

  const handleDelete = useCallback((entryId: string) => {
    registry.dispatch({ type: "REMOVE_ENTRY", id: entryId });
    if (selection.kind === "component" && selection.entryId === entryId) {
      setSelection({ kind: "none" });
    }
  }, [registry, selection]);

  const handleEntryChange = useCallback((id: string, patch: Partial<RegistryEntry>) => {
    const current = registry.entries.find((e) => e.id === id);
    if (!current) return;
    registry.dispatch({ type: "UPDATE_ENTRY", id, entry: { ...current, ...patch } });
  }, [registry]);

  // Save — writes BOTH registry and dock if dirty.
  const handleSaveAll = useCallback(async () => {
    if (registry.isDirty) await registry.save();
    if (dock.isDirty) await dock.save();
  }, [registry, dock]);

  const isDirty = registry.isDirty || dock.isDirty;

  return (
    <div
      className="flex flex-col h-screen w-screen"
      style={{ background: "var(--bn-bg)", color: "var(--bn-t0)" }}
    >
      {/* Top bar */}
      <div
        className="flex items-center justify-between px-4 py-2 border-b"
        style={{ borderColor: "var(--bn-border)" }}
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold">Workspace Setup</span>
          {isDirty && (
            <span className="text-[10px] flex items-center gap-1" style={{ color: "var(--bn-warn, #f59e0b)" }}>
              <span style={{ color: "var(--bn-warn, #f59e0b)" }}>●</span> Unsaved
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => { void registry.reset(); void dock.reset(); setSelection({ kind: "none" }); }}
            disabled={!isDirty}
            className="rounded-md px-3 py-1 text-xs font-medium disabled:opacity-50"
            style={{
              background: "var(--bn-bg2)",
              color: "var(--bn-t1)",
              border: "1px solid var(--bn-border)",
            }}
          >
            Discard
          </button>
          <button
            type="button"
            onClick={() => { void handleSaveAll(); }}
            disabled={!isDirty}
            className="rounded-md px-3 py-1 text-xs font-medium disabled:opacity-50"
            style={{ background: "var(--bn-accent, #14b8a6)", color: "var(--bn-bg)" }}
          >
            Save
          </button>
        </div>
      </div>

      {/* 3-pane body */}
      <div className="flex-1 grid grid-cols-[320px_1fr_360px] min-h-0">
        <ComponentsPane
          entries={registry.entries}
          inDockEntryIds={inDockEntryIds}
          selection={selection}
          onSelect={setSelection}
          onAddDraft={handleAddDraft}
          onDelete={handleDelete}
          onTest={registry.testComponent}
        />
        <DockPane
          dock={{ version: 1, buttons: dock.buttons, updatedAt: "" }}
          entries={registry.entries}
          selection={selection}
          onSelect={setSelection}
        />
        <InspectorPane
          selection={selection}
          entries={registry.entries}
          onChange={handleEntryChange}
          onTest={registry.testComponent}
          inDockEntryIds={inDockEntryIds}
          summary={summary}
        />
      </div>
    </div>
  );
}

export default WorkspaceSetup;
