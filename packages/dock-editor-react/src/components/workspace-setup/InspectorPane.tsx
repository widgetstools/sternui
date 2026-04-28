"use client";

/**
 * Pane ③ of the WorkspaceSetup editor — context-sensitive Inspector.
 *
 * Three modes:
 *   - selection.kind === 'none'      → workspace summary card
 *   - selection.kind === 'component' → full edit form for the entry,
 *     plus Test Launch + (future) Edit Template + (future) "In dock at"
 *     reverse-link footer
 *   - selection.kind === 'dock-item' → placeholder until pane ② lands
 *
 * Form persistence: every field change dispatches an UPDATE_ENTRY action
 * via the parent — the entry in the registry hook's reducer is the
 * single source of truth. The parent's "Save All" button is what flushes
 * to ConfigService; until then changes accumulate as dirty state.
 */

import { useMemo, useState } from "react";
import { PlayCircle, AlertCircle, ArrowRight, ExternalLink, ImageIcon } from "lucide-react";
import type {
  RegistryEntry,
  DockButtonConfig,
  DockDropdownButtonConfig,
  DockMenuItemConfig,
} from "@marketsui/openfin-platform/config";
import {
  deriveTemplateConfigId,
  ACTION_LAUNCH_COMPONENT,
} from "@marketsui/openfin-platform/config";
import type { EditorSelection } from "./types";
import { IconPicker } from "../IconPicker";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { iconIdToSvgUrl } from "../dock-editor/icon-utils";

/**
 * Where in the dock a component is referenced. One DockPlacement per
 * appearance — a single component can show up in multiple places.
 *
 * `path` is a human-readable trail like "Reports → Risk Dashboard"
 * rendered in the "In your dock" footer.
 */
export interface DockPlacement {
  buttonId: string;
  path: string;
}

interface InspectorPaneProps {
  selection: EditorSelection;
  entries: RegistryEntry[];
  buttons: DockButtonConfig[];
  onChange: (id: string, patch: Partial<RegistryEntry>) => void;
  /**
   * Update label / icon / iconColor on a top-level dock button. The
   * dock-item inspector treats these as per-placement overrides
   * independent of the referenced component's defaults.
   */
  onEditButton: (buttonId: string, patch: Partial<DockButtonConfig>) => void;
  /**
   * Update a nested menu item inside a dropdown. `topButtonId` is the
   * top-level DropdownButton that owns the chain; `parentItemId` is
   * the direct parent menu item if the leaf lives in a sub-menu.
   */
  onEditMenuItem: (
    topButtonId: string,
    itemId: string,
    parentItemId: string | undefined,
    patch: Partial<DockMenuItemConfig>,
  ) => void;
  onTest: (entry: RegistryEntry) => void | Promise<void>;
  /** Add the selected component to the user's dock as a top-level button. */
  onAddToDock: (entry: RegistryEntry) => void;
  /** Move selection to a dock item (used by reverse-link "jump to placement"). */
  onSelect: (sel: EditorSelection) => void;
  inDockEntryIds: Set<string>;
  /** Counts for the "nothing selected" summary card. */
  summary: {
    totalComponents: number;
    inDock: number;
    singletons: number;
    dockButtons: number;
  };
}

export function InspectorPane({
  selection,
  entries,
  buttons,
  onChange,
  onEditButton,
  onEditMenuItem,
  onTest,
  onAddToDock,
  onSelect,
  inDockEntryIds,
  summary,
}: InspectorPaneProps) {
  // Derive the dock placement index — for each registry entry, where
  // does it appear in the dock? Used by both the "In your dock at"
  // footer (component selected) and the dock-item ↔ component pivot
  // (dock item selected → which component does it reference?).
  const placementsByEntry = useMemo(() => collectPlacements(buttons), [buttons]);

  if (selection.kind === "none") {
    return <SummaryCard summary={summary} />;
  }

  if (selection.kind === "dock-item") {
    return (
      <DockItemInspector
        itemId={selection.itemId}
        buttons={buttons}
        entries={entries}
        onEditButton={onEditButton}
        onEditMenuItem={onEditMenuItem}
        onSelect={onSelect}
      />
    );
  }

  const entry = entries.find((e) => e.id === selection.entryId);
  if (!entry) {
    return (
      <PaneShell title="COMPONENT">
        <div className="flex items-start gap-2 rounded-md p-2" style={{ background: "var(--bn-bg2)" }}>
          <AlertCircle className="w-4 h-4 mt-0.5" style={{ color: "var(--bn-warn, #f59e0b)" }} />
          <p className="text-xs" style={{ color: "var(--bn-t1)" }}>
            Selected component no longer exists. It may have been deleted.
          </p>
        </div>
      </PaneShell>
    );
  }

  return <ComponentForm
    entry={entry}
    entries={entries}
    onChange={(patch) => onChange(entry.id, patch)}
    onTest={onTest}
    onAddToDock={onAddToDock}
    onSelect={onSelect}
    isInDock={inDockEntryIds.has(entry.id)}
    placements={placementsByEntry.get(entry.id) ?? []}
  />;
}

// ─── Dock placement collector ────────────────────────────────────────

function collectPlacements(buttons: DockButtonConfig[]): Map<string, DockPlacement[]> {
  const result = new Map<string, DockPlacement[]>();
  for (const btn of buttons) {
    visitButton(btn, btn.tooltip, result);
  }
  return result;
}

function visitButton(btn: DockButtonConfig, prefix: string, acc: Map<string, DockPlacement[]>): void {
  // ActionButton itself can launch a component
  if ((btn as { actionId?: string }).actionId === ACTION_LAUNCH_COMPONENT) {
    const refId = ((btn as { customData?: unknown }).customData as { registryEntryId?: string } | undefined)?.registryEntryId;
    if (refId) {
      const existing = acc.get(refId) ?? [];
      existing.push({ buttonId: btn.id, path: prefix });
      acc.set(refId, existing);
    }
  }
  if (btn.type === "DropdownButton") {
    const dropdown = btn as DockDropdownButtonConfig;
    for (const opt of (dropdown.options ?? [])) {
      visitMenuItem(opt, btn.id, `${prefix} → ${opt.tooltip}`, acc);
    }
  }
}

function visitMenuItem(
  item: { id: string; tooltip: string; actionId?: string; customData?: unknown; options?: unknown[] },
  topButtonId: string,
  pathSoFar: string,
  acc: Map<string, DockPlacement[]>,
): void {
  if (item.actionId === ACTION_LAUNCH_COMPONENT) {
    const refId = (item.customData as { registryEntryId?: string } | undefined)?.registryEntryId;
    if (refId) {
      const existing = acc.get(refId) ?? [];
      existing.push({ buttonId: topButtonId, path: pathSoFar });
      acc.set(refId, existing);
    }
  }
  for (const sub of ((item.options ?? []) as Array<typeof item>)) {
    visitMenuItem(sub, topButtonId, `${pathSoFar} → ${sub.tooltip}`, acc);
  }
}

// ─── Summary card (shown when nothing selected) ──────────────────────

function SummaryCard({ summary }: { summary: InspectorPaneProps["summary"] }) {
  return (
    <PaneShell title="WORKSPACE SETUP">
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Components" value={summary.totalComponents} />
        <Stat label="In your dock" value={summary.inDock} />
        <Stat label="Singletons" value={summary.singletons} />
        <Stat label="Dock buttons" value={summary.dockButtons} />
      </div>
      <div className="mt-3 rounded-md p-2 text-[11px]" style={{ background: "var(--bn-bg2)", color: "var(--bn-t2)" }}>
        Select a component on the left to edit it, or click <strong>+ New</strong> to define a new one.
      </div>
    </PaneShell>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md p-2" style={{ background: "var(--bn-bg2)", border: "1px solid var(--bn-border)" }}>
      <div className="text-lg font-semibold" style={{ color: "var(--bn-t0)" }}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--bn-t2)" }}>{label}</div>
    </div>
  );
}

// ─── Component edit form ─────────────────────────────────────────────

function ComponentForm({
  entry,
  entries,
  onChange,
  onTest,
  onAddToDock,
  onSelect,
  isInDock,
  placements,
}: {
  entry: RegistryEntry;
  entries: RegistryEntry[];
  onChange: (patch: Partial<RegistryEntry>) => void;
  onTest: (entry: RegistryEntry) => void | Promise<void>;
  onAddToDock: (entry: RegistryEntry) => void;
  onSelect: (sel: EditorSelection) => void;
  isInDock: boolean;
  placements: DockPlacement[];
}) {
  // Uniqueness check: another entry with the same (componentType, subType)?
  const dupKey = useMemo(() => {
    if (!entry.componentType) return null;
    const others = entries.filter((e) => e.id !== entry.id);
    const clash = others.find(
      (e) =>
        e.componentType === entry.componentType &&
        e.componentSubType === entry.componentSubType,
    );
    return clash ? clash.displayName : null;
  }, [entry.id, entry.componentType, entry.componentSubType, entries]);

  // Singleton-toggle is now a pure flag flip — `id` and `configId`
  // are both bound to `${componentType}-${componentSubType}` whether
  // singleton is on or off, so toggling no longer changes the id.
  const handleSingletonToggle = (next: boolean) => {
    onChange({ singleton: next });
  };

  // Type / subtype edits are pure field writes — we deliberately do
  // NOT re-derive `id` on every keystroke, because the parent tracks
  // the inspector selection by `entryId`. Rewriting `entry.id` from
  // a half-typed type ("b" while the user is typing "blotter") would
  // immediately invalidate the selection, unmount the input, and
  // make typing impossible.
  //
  // The canonical id derivation lives at SAVE time:
  //   • The Components-pane Save handler (and the Workspace Setup
  //     reducer's UPSERT_ENTRY action) re-derives `id` and `configId`
  //     from the final componentType + componentSubType right before
  //     persisting.
  //   • The "id" preview field below shows the live derivation so
  //     the user sees what id their entry will land with.
  const handleTypeChange = (field: "componentType" | "componentSubType", value: string) => {
    onChange({ [field]: value } as Partial<RegistryEntry>);
  };

  return (
    <PaneShell title="COMPONENT">
      <div className="flex flex-col gap-3">
        {/* Icon + Name row — icon picker is the visual anchor */}
        <div className="flex gap-2 items-end">
          <IconField
            iconId={entry.iconId}
            onChange={(iconId) => onChange({ iconId })}
          />
          <div className="flex-1">
            <Field label="Name">
              <input
                value={entry.displayName}
                onChange={(e) => onChange({ displayName: e.target.value })}
                placeholder="e.g. Risk Dashboard"
                className="w-full rounded-md px-2 py-1 text-xs outline-none"
                style={{
                  background: "var(--bn-bg2)",
                  border: "1px solid var(--bn-border)",
                  color: "var(--bn-t0)",
                }}
              />
            </Field>
          </div>
        </div>

        {/* Type / SubType */}
        <div className="grid grid-cols-2 gap-2">
          <Field label="Type">
            <input
              value={entry.componentType}
              onChange={(e) => handleTypeChange("componentType", e.target.value)}
              placeholder="GRID"
              className="w-full rounded-md px-2 py-1 text-xs outline-none"
              style={{
                background: "var(--bn-bg2)",
                border: "1px solid var(--bn-border)",
                color: "var(--bn-t0)",
              }}
            />
          </Field>
          <Field label="SubType">
            <input
              value={entry.componentSubType}
              onChange={(e) => handleTypeChange("componentSubType", e.target.value)}
              placeholder="CREDIT"
              className="w-full rounded-md px-2 py-1 text-xs outline-none"
              style={{
                background: "var(--bn-bg2)",
                border: "1px solid var(--bn-border)",
                color: "var(--bn-t0)",
              }}
            />
          </Field>
        </div>

        {dupKey && (
          <div className="flex items-start gap-2 rounded-md p-2 text-[11px]" style={{
            background: "var(--bn-bg2)",
            border: "1px solid var(--bn-warn, #f59e0b)",
            color: "var(--bn-warn, #f59e0b)",
          }}>
            <AlertCircle className="w-3 h-3 mt-0.5" />
            <span>
              Another component <strong>"{dupKey}"</strong> uses this same Type/SubType pair. Singletons require a unique pair within an app.
            </span>
          </div>
        )}

        {/* Host URL */}
        <Field label="Host URL">
          <input
            value={entry.hostUrl}
            onChange={(e) => onChange({ hostUrl: e.target.value })}
            placeholder="https://..."
            className="w-full rounded-md px-2 py-1 text-xs outline-none font-mono"
            style={{
              background: "var(--bn-bg2)",
              border: "1px solid var(--bn-border)",
              color: "var(--bn-t0)",
            }}
          />
        </Field>

        {/* Flags */}
        <div className="flex flex-col gap-2 rounded-md p-2" style={{ background: "var(--bn-bg2)", border: "1px solid var(--bn-border)" }}>
          <Toggle
            label="Singleton — only one instance, focus existing on next click"
            checked={entry.singleton}
            onChange={handleSingletonToggle}
          />
          <Toggle
            label="External — component lives outside this app"
            checked={entry.type === "external"}
            onChange={(next) => onChange({ type: next ? "external" : "internal", usesHostConfig: !next })}
          />
        </div>

        {/* External-only fields */}
        {entry.type === "external" && (
          <div className="flex flex-col gap-2 rounded-md p-2" style={{ background: "var(--bn-bg2)", border: "1px solid var(--bn-border)" }}>
            <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--bn-t2)" }}>
              External component hints (optional)
            </div>
            <Field label="App ID">
              <input
                value={entry.appId}
                onChange={(e) => onChange({ appId: e.target.value })}
                className="w-full rounded-md px-2 py-1 text-xs outline-none font-mono"
                style={{ background: "var(--bn-bg)", border: "1px solid var(--bn-border)", color: "var(--bn-t0)" }}
              />
            </Field>
            <Field label="ConfigService URL">
              <input
                value={entry.configServiceUrl}
                onChange={(e) => onChange({ configServiceUrl: e.target.value })}
                className="w-full rounded-md px-2 py-1 text-xs outline-none font-mono"
                style={{ background: "var(--bn-bg)", border: "1px solid var(--bn-border)", color: "var(--bn-t0)" }}
              />
            </Field>
          </div>
        )}

        {/* configId (read-only display) */}
        <Field label="Config ID">
          <div className="rounded-md px-2 py-1 text-xs font-mono" style={{
            background: "var(--bn-bg2)",
            border: "1px solid var(--bn-border)",
            color: "var(--bn-t1)",
          }}>
            {entry.configId || deriveTemplateConfigId(entry.componentType, entry.componentSubType) || "—"}
          </div>
        </Field>

        {/* Actions */}
        <div className="flex flex-col gap-2 pt-2 border-t" style={{ borderColor: "var(--bn-border)" }}>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void onTest(entry)}
              disabled={!entry.hostUrl}
              className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-50"
              style={{ background: "var(--bn-accent, #14b8a6)", color: "var(--bn-bg)" }}
            >
              <PlayCircle className="w-3 h-3" /> Test Launch
            </button>
            {!isInDock && (
              <button
                type="button"
                onClick={() => onAddToDock(entry)}
                disabled={!entry.hostUrl}
                className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                style={{
                  background: "var(--bn-bg2)",
                  border: "1px solid var(--bn-border)",
                  color: "var(--bn-t0)",
                }}
              >
                <ArrowRight className="w-3 h-3" /> Add to your dock
              </button>
            )}
          </div>
          <span className="text-[10px]" style={{ color: "var(--bn-t2)" }}>
            {isInDock
              ? "✓ Currently in your dock"
              : "Not in your dock yet — click \"Add to your dock\" to surface it"}
          </span>
        </div>

        {/* "In your dock at" reverse-link footer — every dock placement
            shows as a click-to-jump pill so users can navigate directly
            from a component to where it appears in the dock. */}
        {placements.length > 0 && (
          <div className="flex flex-col gap-1 pt-2 border-t" style={{ borderColor: "var(--bn-border)" }}>
            <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--bn-t2)" }}>
              📍 In your dock at:
            </div>
            <div className="flex flex-col gap-1">
              {placements.map((p) => (
                <button
                  key={`${p.buttonId}-${p.path}`}
                  type="button"
                  onClick={() => onSelect({ kind: "dock-item", itemId: p.buttonId })}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-left"
                  style={{
                    background: "var(--bn-bg2)",
                    border: "1px solid var(--bn-border)",
                    color: "var(--bn-t1)",
                  }}
                >
                  <ExternalLink className="w-3 h-3" />
                  <span className="truncate">{p.path}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </PaneShell>
  );
}

// ─── Dock item inspector ─────────────────────────────────────────────

/**
 * Resolve the selected dock-item id to either a top-level button or a
 * nested menu item. Returning a discriminated union lets the inspector
 * route its edits to the correct dispatcher (UPDATE_BUTTON vs.
 * UPDATE_MENU_ITEM) and surface the right "type" label.
 */
type ResolvedDockEntity =
  | { kind: "button"; button: DockButtonConfig }
  | {
      kind: "menuItem";
      topButtonId: string;
      parentItemId: string | undefined;
      item: DockMenuItemConfig;
    };

function resolveDockEntity(
  buttons: DockButtonConfig[],
  itemId: string,
): ResolvedDockEntity | null {
  for (const b of buttons) {
    if (b.id === itemId) return { kind: "button", button: b };
    if (b.type === "DropdownButton") {
      const found = findInOptions((b as DockDropdownButtonConfig).options ?? [], itemId, undefined);
      if (found) {
        return { kind: "menuItem", topButtonId: b.id, parentItemId: found.parentItemId, item: found.item };
      }
    }
  }
  return null;
}

function findInOptions(
  items: DockMenuItemConfig[],
  itemId: string,
  parentItemId: string | undefined,
): { item: DockMenuItemConfig; parentItemId: string | undefined } | null {
  for (const it of items) {
    if (it.id === itemId) return { item: it, parentItemId };
    if (it.options?.length) {
      const nested = findInOptions(it.options, itemId, it.id);
      if (nested) return nested;
    }
  }
  return null;
}

function DockItemInspector({
  itemId,
  buttons,
  entries,
  onEditButton,
  onEditMenuItem,
  onSelect,
}: {
  itemId: string;
  buttons: DockButtonConfig[];
  entries: RegistryEntry[];
  onEditButton: (buttonId: string, patch: Partial<DockButtonConfig>) => void;
  onEditMenuItem: (
    topButtonId: string,
    itemId: string,
    parentItemId: string | undefined,
    patch: Partial<DockMenuItemConfig>,
  ) => void;
  onSelect: (sel: EditorSelection) => void;
}) {
  const resolved = resolveDockEntity(buttons, itemId);
  if (!resolved) {
    return (
      <PaneShell title="DOCK ITEM">
        <div className="flex items-start gap-2 rounded-md p-2" style={{ background: "var(--bn-bg2)" }}>
          <AlertCircle className="w-4 h-4 mt-0.5" style={{ color: "var(--bn-warn, #f59e0b)" }} />
          <p className="text-xs" style={{ color: "var(--bn-t1)" }}>
            Selected dock item no longer exists. It may have been removed.
          </p>
        </div>
      </PaneShell>
    );
  }

  // Surface common fields uniformly across button / menuItem.
  const label = resolved.kind === "button" ? resolved.button.tooltip : resolved.item.tooltip;
  const iconId =
    resolved.kind === "button" ? resolved.button.iconId ?? "" : resolved.item.iconId ?? "";
  const actionId =
    resolved.kind === "button"
      ? (resolved.button as { actionId?: string }).actionId
      : resolved.item.actionId;
  const customData =
    resolved.kind === "button"
      ? (resolved.button as { customData?: unknown }).customData
      : resolved.item.customData;

  const isLaunchComponent = actionId === ACTION_LAUNCH_COMPONENT;
  const refId = isLaunchComponent
    ? (customData as { registryEntryId?: string } | undefined)?.registryEntryId
    : undefined;
  const referenced = refId ? entries.find((e) => e.id === refId) : null;
  const broken = isLaunchComponent && refId && !referenced;

  // Single edit dispatcher — both forms use the same fields, only the
  // routing differs.
  const setLabel = (next: string) => {
    if (resolved.kind === "button") {
      onEditButton(resolved.button.id, { tooltip: next } as Partial<DockButtonConfig>);
    } else {
      onEditMenuItem(resolved.topButtonId, resolved.item.id, resolved.parentItemId, { tooltip: next });
    }
  };
  const setIconId = (next: string) => {
    if (resolved.kind === "button") {
      onEditButton(resolved.button.id, { iconId: next } as Partial<DockButtonConfig>);
    } else {
      onEditMenuItem(resolved.topButtonId, resolved.item.id, resolved.parentItemId, { iconId: next });
    }
  };

  const typeLine =
    resolved.kind === "button"
      ? `${resolved.button.type === "DropdownButton" ? "Dropdown (with menu items)" : "Action button"}${isLaunchComponent ? " · launches a component" : ""}`
      : `Menu item${(resolved.item.options?.length ?? 0) > 0 ? " (sub-menu)" : ""}${isLaunchComponent ? " · launches a component" : ""}`;

  return (
    <PaneShell title="DOCK ITEM">
      <div className="flex flex-col gap-3">
        {/* Icon + Label — per-placement overrides */}
        <div className="flex gap-2 items-end">
          <IconField iconId={iconId} onChange={setIconId} />
          <div className="flex-1">
            <Field label="Label">
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="w-full rounded-md px-2 py-1 text-xs outline-none"
                style={{
                  background: "var(--bn-bg2)",
                  border: "1px solid var(--bn-border)",
                  color: "var(--bn-t0)",
                }}
              />
            </Field>
          </div>
        </div>
        {referenced && (
          <div className="text-[10px] -mt-2" style={{ color: "var(--bn-t2)" }}>
            Component default: <span style={{ color: "var(--bn-t1)" }}>{referenced.iconId || "—"}</span>{" "}
            · per-placement overrides win.
          </div>
        )}

        <div>
          <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--bn-t2)" }}>
            Type
          </div>
          <div
            className="rounded-md px-2 py-1 text-xs"
            style={{
              background: "var(--bn-bg2)",
              border: "1px solid var(--bn-border)",
              color: "var(--bn-t1)",
            }}
          >
            {typeLine}
          </div>
        </div>

        {isLaunchComponent && (
          <div>
            <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--bn-t2)" }}>
              Launches component
            </div>
            {broken && (
              <div className="flex items-start gap-2 rounded-md p-2 mt-1 text-[11px]" style={{
                background: "var(--bn-bg2)",
                border: "1px solid var(--bn-warn, #f59e0b)",
                color: "var(--bn-warn, #f59e0b)",
              }}>
                <AlertCircle className="w-3 h-3 mt-0.5" />
                <span>
                  Component <code>{refId}</code> was deleted. Remove this
                  dock item or restore the component.
                </span>
              </div>
            )}
            {referenced && (
              <button
                type="button"
                onClick={() => onSelect({ kind: "component", entryId: referenced.id })}
                className="w-full mt-1 flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-left"
                style={{
                  background: "var(--bn-bg2)",
                  border: "1px solid var(--bn-border)",
                  color: "var(--bn-t1)",
                }}
              >
                <ExternalLink className="w-3 h-3" />
                <span className="truncate">
                  {referenced.displayName} <span style={{ color: "var(--bn-t2)" }}>({referenced.componentType}/{referenced.componentSubType})</span>
                </span>
              </button>
            )}
          </div>
        )}
      </div>
    </PaneShell>
  );
}

// ─── Layout primitives ───────────────────────────────────────────────

function PaneShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-3 py-2 border-b shrink-0" style={{ borderColor: "var(--bn-border)" }}>
        <span className="text-xs font-semibold tracking-wide" style={{ color: "var(--bn-t1)" }}>
          ③ {title}
        </span>
      </div>
      <div className="flex-1 overflow-auto bn-scrollbar p-3 min-h-0">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wide" style={{ color: "var(--bn-t2)" }}>{label}</span>
      {children}
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="rounded"
      />
      <span className="text-xs" style={{ color: "var(--bn-t1)" }}>{label}</span>
    </label>
  );
}

// ─── Icon field with picker popover ──────────────────────────────────
//
// Click the swatch to open a searchable grid (IconPicker). Selecting an
// icon writes the iconId back via onChange and closes the popover.
// Empty iconId → renders an "ImageIcon" placeholder, signalling "no
// icon set" (only meaningful for dock-item overrides where empty means
// "fall back to component default").

function IconField({ iconId, onChange }: { iconId: string; onChange: (iconId: string) => void }) {
  const [open, setOpen] = useState(false);
  const previewUrl = useMemo(() => (iconId ? iconIdToSvgUrl(iconId, "currentColor") : ""), [iconId]);

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wide" style={{ color: "var(--bn-t2)" }}>
        Icon
      </span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="w-9 h-9 flex items-center justify-center rounded-md"
            style={{
              background: "var(--bn-bg2)",
              border: "1px solid var(--bn-border)",
              color: "var(--bn-t1)",
            }}
            title={iconId ? `Icon: ${iconId} — click to change` : "Pick an icon"}
          >
            {previewUrl ? (
              <img
                src={previewUrl}
                alt=""
                width={20}
                height={20}
                style={{ display: "block" }}
              />
            ) : (
              <ImageIcon className="w-4 h-4" style={{ color: "var(--bn-t2)" }} />
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="p-2 w-[360px]"
          align="start"
          style={{
            background: "var(--bn-bg)",
            border: "1px solid var(--bn-border)",
            color: "var(--bn-t0)",
          }}
        >
          <IconPicker
            selectedIcon={iconId}
            color="currentColor"
            onSelect={(id) => {
              onChange(id);
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
