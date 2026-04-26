"use client";

/**
 * Pane ② of the WorkspaceSetup editor — the visual dock layout.
 *
 * COMMIT-1 SCOPE (this file): renders a flat read-only list of the
 * dock's current top-level buttons, each labeled with the registry
 * entry name it launches (or a "broken reference" pill if its
 * registryEntryId no longer resolves). No drag-drop yet, no nesting
 * editor — those land in commit 2.
 *
 * Drag-drop, reorder, nest-as-dropdown, and the right-click context
 * menu come in the follow-up commit so this commit ships an end-to-end
 * working editor (Components + Inspector are fully functional now).
 */

import type {
  DockEditorConfig,
  DockButtonConfig,
  DockDropdownButtonConfig,
  DockMenuItemConfig,
  RegistryEntry,
} from "@marketsui/openfin-platform/config";
import { ACTION_LAUNCH_COMPONENT } from "@marketsui/openfin-platform/config";
import type { EditorSelection } from "./types";

interface DockPaneProps {
  dock: DockEditorConfig | null;
  entries: RegistryEntry[];
  selection: EditorSelection;
  onSelect: (sel: EditorSelection) => void;
}

export function DockPane({ dock, entries, selection, onSelect }: DockPaneProps) {
  const entriesById = new Map(entries.map((e) => [e.id, e]));

  return (
    <div className="flex flex-col h-full border-r" style={{ borderColor: "var(--bn-border)" }}>
      <div className="px-3 py-2 border-b" style={{ borderColor: "var(--bn-border)" }}>
        <div className="flex flex-col">
          <span className="text-xs font-semibold tracking-wide" style={{ color: "var(--bn-t1)" }}>
            ② DOCK LAYOUT  →
          </span>
          <span className="text-[10px]" style={{ color: "var(--bn-t2)" }}>
            personal · per user
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3">
        {(!dock || dock.buttons.length === 0) && (
          <div className="rounded-md border border-dashed p-4 text-center text-xs" style={{
            borderColor: "var(--bn-border)",
            color: "var(--bn-t2)",
          }}>
            Your dock has no buttons yet. (In a follow-up commit you'll
            be able to drag a component here from pane ①. For now use
            the existing Dock Editor to add buttons.)
          </div>
        )}
        {dock?.buttons.map((btn) => (
          <DockButton
            key={btn.id}
            button={btn}
            entriesById={entriesById}
            selection={selection}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}

function DockButton({
  button,
  entriesById,
  selection,
  onSelect,
}: {
  button: DockButtonConfig;
  entriesById: Map<string, RegistryEntry>;
  selection: EditorSelection;
  onSelect: (sel: EditorSelection) => void;
}) {
  const isDropdown = button.type === "DropdownButton";
  const dropdown = isDropdown ? (button as DockDropdownButtonConfig) : null;
  const isSelected = selection.kind === "dock-item" && selection.itemId === button.id;
  return (
    <div className="mb-2">
      <button
        type="button"
        onClick={() => onSelect({ kind: "dock-item", itemId: button.id })}
        className="w-full text-left rounded-md px-2 py-1.5 text-xs"
        style={{
          background: isSelected ? "var(--bn-bg3)" : "var(--bn-bg2)",
          border: "1px solid var(--bn-border)",
          color: "var(--bn-t0)",
        }}
      >
        <span style={{ color: "var(--bn-t2)" }}>
          {isDropdown ? "▼ " : "• "}
        </span>
        <span className="font-medium">{button.tooltip}</span>
      </button>
      {dropdown && dropdown.options.length > 0 && (
        <div className="ml-4 mt-1 border-l pl-2" style={{ borderColor: "var(--bn-border)" }}>
          {dropdown.options.map((it) => (
            <DockMenuItem key={it.id} item={it} entriesById={entriesById} selection={selection} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

function DockMenuItem({
  item,
  entriesById,
  selection,
  onSelect,
}: {
  item: DockMenuItemConfig;
  entriesById: Map<string, RegistryEntry>;
  selection: EditorSelection;
  onSelect: (sel: EditorSelection) => void;
}) {
  const isLaunchComponent = item.actionId === ACTION_LAUNCH_COMPONENT;
  const refId = isLaunchComponent ? (item.customData as { registryEntryId?: string })?.registryEntryId : undefined;
  const broken = isLaunchComponent && refId && !entriesById.has(refId);
  const isSelected = selection.kind === "dock-item" && selection.itemId === item.id;

  return (
    <div>
      <button
        type="button"
        onClick={() => onSelect({ kind: "dock-item", itemId: item.id })}
        className="w-full text-left rounded-md px-2 py-1 text-xs my-1"
        style={{
          background: isSelected ? "var(--bn-bg3)" : "transparent",
          color: broken ? "var(--bn-warn, #f59e0b)" : "var(--bn-t1)",
          textDecoration: broken ? "line-through" : "none",
        }}
      >
        <span style={{ color: "var(--bn-t2)" }}>↳ </span>
        {item.tooltip}
        {broken && (
          <span className="ml-1 text-[10px]" style={{ color: "var(--bn-warn, #f59e0b)" }}>
            ⚠ Component deleted
          </span>
        )}
      </button>
      {item.options && item.options.length > 0 && (
        <div className="ml-3 border-l pl-2" style={{ borderColor: "var(--bn-border)" }}>
          {item.options.map((sub) => (
            <DockMenuItem key={sub.id} item={sub} entriesById={entriesById} selection={selection} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}
