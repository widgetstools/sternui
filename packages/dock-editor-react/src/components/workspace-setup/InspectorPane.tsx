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

import { useMemo } from "react";
import { PlayCircle, AlertCircle } from "lucide-react";
import type { RegistryEntry } from "@marketsui/openfin-platform/config";
import { deriveSingletonConfigId, generateTemplateConfigId } from "@marketsui/openfin-platform/config";
import type { EditorSelection } from "./types";

interface InspectorPaneProps {
  selection: EditorSelection;
  entries: RegistryEntry[];
  onChange: (id: string, patch: Partial<RegistryEntry>) => void;
  onTest: (entry: RegistryEntry) => void | Promise<void>;
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
  onChange,
  onTest,
  inDockEntryIds,
  summary,
}: InspectorPaneProps) {
  if (selection.kind === "none") {
    return <SummaryCard summary={summary} />;
  }

  if (selection.kind === "dock-item") {
    return (
      <PaneShell title="DOCK ITEM">
        <p className="text-xs" style={{ color: "var(--bn-t2)" }}>
          Per-dock-item edits land in a follow-up commit. For now use the
          existing Dock Editor for label/icon overrides.
        </p>
      </PaneShell>
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
    isInDock={inDockEntryIds.has(entry.id)}
  />;
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
  isInDock,
}: {
  entry: RegistryEntry;
  entries: RegistryEntry[];
  onChange: (patch: Partial<RegistryEntry>) => void;
  onTest: (entry: RegistryEntry) => void | Promise<void>;
  isInDock: boolean;
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

  // When singleton flag flips on, re-derive configId. When subtype/type
  // change AND singleton is on, also re-derive. Forms-of-defaults pattern.
  const handleSingletonToggle = (next: boolean) => {
    onChange({
      singleton: next,
      configId: next
        ? deriveSingletonConfigId(entry.componentType, entry.componentSubType)
        : entry.configId || generateTemplateConfigId(entry.componentType, entry.componentSubType),
    });
  };

  const handleTypeChange = (field: "componentType" | "componentSubType", value: string) => {
    const patch: Partial<RegistryEntry> = { [field]: value } as Partial<RegistryEntry>;
    if (entry.singleton) {
      const t = field === "componentType" ? value : entry.componentType;
      const s = field === "componentSubType" ? value : entry.componentSubType;
      patch.configId = deriveSingletonConfigId(t, s);
    }
    onChange(patch);
  };

  return (
    <PaneShell title="COMPONENT">
      <div className="flex flex-col gap-3">
        {/* Name */}
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
            {entry.configId || generateTemplateConfigId(entry.componentType, entry.componentSubType) || "—"}
          </div>
        </Field>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2 border-t" style={{ borderColor: "var(--bn-border)" }}>
          <button
            type="button"
            onClick={() => void onTest(entry)}
            disabled={!entry.hostUrl}
            className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-50"
            style={{ background: "var(--bn-accent, #14b8a6)", color: "var(--bn-bg)" }}
          >
            <PlayCircle className="w-3 h-3" /> Test Launch
          </button>
          <span className="text-[10px]" style={{ color: "var(--bn-t2)" }}>
            {isInDock ? "Currently in your dock" : "Not in your dock yet"}
          </span>
        </div>
      </div>
    </PaneShell>
  );
}

// ─── Layout primitives ───────────────────────────────────────────────

function PaneShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b" style={{ borderColor: "var(--bn-border)" }}>
        <span className="text-xs font-semibold tracking-wide" style={{ color: "var(--bn-t1)" }}>
          ③ {title}
        </span>
      </div>
      <div className="flex-1 overflow-auto p-3">{children}</div>
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
