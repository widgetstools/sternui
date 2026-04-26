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

import { ChevronUp, ChevronDown, X } from "lucide-react";
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
  /** Remove a top-level dock button by its id. */
  onRemove: (buttonId: string) => void;
  /** Reorder the top-level dock buttons. fromIndex / toIndex are
   *  positions in the buttons[] array. Out-of-range moves are no-ops. */
  onReorder: (fromIndex: number, toIndex: number) => void;
}

export function DockPane({ dock, entries, selection, onSelect, onRemove, onReorder }: DockPaneProps) {
  const entriesById = new Map(entries.map((e) => [e.id, e]));
  const buttons = dock?.buttons ?? [];

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
        {buttons.length === 0 && (
          <div className="rounded-md border border-dashed p-4 text-center text-xs" style={{
            borderColor: "var(--bn-border)",
            color: "var(--bn-t2)",
          }}>
            Your dock has no buttons yet. Select a component on the left
            and click <strong>Add to your dock</strong> to surface it here.
          </div>
        )}
        {buttons.map((btn, idx) => (
          <DockButton
            key={btn.id}
            button={btn}
            entriesById={entriesById}
            selection={selection}
            onSelect={onSelect}
            onRemove={() => onRemove(btn.id)}
            onMoveUp={idx > 0 ? () => onReorder(idx, idx - 1) : undefined}
            onMoveDown={idx < buttons.length - 1 ? () => onReorder(idx, idx + 1) : undefined}
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
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  button: DockButtonConfig;
  entriesById: Map<string, RegistryEntry>;
  selection: EditorSelection;
  onSelect: (sel: EditorSelection) => void;
  onRemove: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const isDropdown = button.type === "DropdownButton";
  const dropdown = isDropdown ? (button as DockDropdownButtonConfig) : null;
  const isSelected = selection.kind === "dock-item" && selection.itemId === button.id;

  // For launch-component buttons, surface the referenced component name
  // and a broken-reference indicator next to the button label.
  const isLaunchComponent = (button as { actionId?: string }).actionId === ACTION_LAUNCH_COMPONENT;
  const refId = isLaunchComponent ? ((button as { customData?: unknown }).customData as { registryEntryId?: string } | undefined)?.registryEntryId : undefined;
  const broken = isLaunchComponent && refId && !entriesById.has(refId);

  return (
    <div className="mb-2 group">
      <div className="flex items-stretch gap-1">
        <button
          type="button"
          onClick={() => onSelect({ kind: "dock-item", itemId: button.id })}
          className="flex-1 text-left rounded-md px-2 py-1.5 text-xs"
          style={{
            background: isSelected ? "var(--bn-bg3)" : "var(--bn-bg2)",
            border: "1px solid var(--bn-border)",
            color: broken ? "var(--bn-warn, #f59e0b)" : "var(--bn-t0)",
            textDecoration: broken ? "line-through" : "none",
          }}
        >
          <span style={{ color: "var(--bn-t2)" }}>
            {isDropdown ? "▼ " : "• "}
          </span>
          <span className="font-medium">{button.tooltip}</span>
          {broken && (
            <span className="ml-2 text-[10px]" style={{ color: "var(--bn-warn, #f59e0b)" }}>
              ⚠ Component deleted
            </span>
          )}
        </button>
        <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <RowAction title="Move up" onClick={onMoveUp} disabled={!onMoveUp}>
            <ChevronUp className="w-3 h-3" />
          </RowAction>
          <RowAction title="Move down" onClick={onMoveDown} disabled={!onMoveDown}>
            <ChevronDown className="w-3 h-3" />
          </RowAction>
        </div>
        <RowAction
          title="Remove from dock"
          onClick={() => {
            if (confirm(`Remove "${button.tooltip}" from your dock?`)) onRemove();
          }}
        >
          <X className="w-3 h-3" />
        </RowAction>
      </div>
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

function RowAction({
  title,
  onClick,
  disabled,
  children,
}: {
  title: string;
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className="rounded p-1 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
      style={{ color: "var(--bn-t1)" }}
    >
      {children}
    </button>
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
