/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ImportPreviewDialog — confirms the user's intent before mutating the
 * database. Shown after parsing a JSON import file and computing a
 * preview (fresh vs. conflicting vs. invalid).
 *
 * The user picks a mode:
 *   - `skip-existing` (default) — only insert rows whose PK is new
 *   - `overwrite`               — upsert every valid row (overwrites collisions)
 *
 * Cancel closes the dialog without touching the database.
 */

import { useState } from "react";
import { DynamicIcon as Icon } from "@marketsui/icons-svg/react";
import type { ImportPreview, ImportMode } from "../hooks/useConfigBrowser";

interface ImportPreviewDialogProps {
  preview: ImportPreview;
  tableLabel: string;
  primaryKey: string;
  onCancel: () => void;
  onConfirm: (mode: ImportMode) => void;
}

export function ImportPreviewDialog({
  preview,
  tableLabel,
  primaryKey,
  onCancel,
  onConfirm,
}: ImportPreviewDialogProps) {
  const [mode, setMode] = useState<ImportMode>("skip-existing");

  const validCount = preview.fresh.length + preview.conflicts.length;
  const willImport =
    mode === "overwrite"
      ? validCount
      : preview.fresh.length;
  const willSkip = mode === "skip-existing" ? preview.conflicts.length : 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-preview-title"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        fontFamily: "var(--de-font)",
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 520,
          maxWidth: "90vw",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          background: "var(--de-bg)",
          border: "1px solid var(--de-border)",
          borderRadius: "var(--de-radius-md, 8px)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.45)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "14px 18px",
            borderBottom: "1px solid var(--de-border)",
          }}
        >
          <Icon icon="lucide:upload" style={{ width: 16, height: 16, color: "var(--de-accent)" }} />
          <span id="import-preview-title" style={{ fontSize: 13, fontWeight: 600, color: "var(--de-text)" }}>
            Import preview · {tableLabel}
          </span>
        </div>

        {/* Body */}
        <div style={{ padding: "16px 18px", overflow: "auto", flex: 1 }}>
          <SummaryGrid
            total={preview.rows.length}
            fresh={preview.fresh.length}
            conflicts={preview.conflicts.length}
            invalid={preview.invalid.length}
            primaryKey={primaryKey}
          />

          {/* Mode selector */}
          <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 8 }}>
            <ModeRadio
              checked={mode === "skip-existing"}
              onChange={() => setMode("skip-existing")}
              title="Skip existing rows"
              description={`Only insert ${preview.fresh.length} new row${preview.fresh.length === 1 ? "" : "s"}. Existing rows in the table are left untouched.`}
              disabled={preview.fresh.length === 0}
            />
            <ModeRadio
              checked={mode === "overwrite"}
              onChange={() => setMode("overwrite")}
              title="Overwrite existing rows"
              description={`Upsert all ${validCount} valid row${validCount === 1 ? "" : "s"}. ${preview.conflicts.length} existing row${preview.conflicts.length === 1 ? "" : "s"} will be replaced.`}
              disabled={validCount === 0}
              warning={preview.conflicts.length > 0}
            />
          </div>

          {preview.invalid.length > 0 && (
            <div
              style={{
                marginTop: 14,
                padding: "10px 12px",
                background: "var(--de-bg-surface)",
                border: "1px solid var(--de-border)",
                borderRadius: "var(--de-radius-sm)",
                fontSize: 11,
                color: "var(--de-text-secondary)",
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 4, color: "var(--de-text)" }}>
                {preview.invalid.length} invalid row{preview.invalid.length === 1 ? "" : "s"} (will be ignored)
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, fontFamily: "var(--de-mono)" }}>
                {preview.invalid.slice(0, 5).map((inv, i) => (
                  <li key={i}>{inv.reason}</li>
                ))}
                {preview.invalid.length > 5 && <li>… and {preview.invalid.length - 5} more</li>}
              </ul>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "12px 18px",
            borderTop: "1px solid var(--de-border)",
            background: "var(--de-bg-surface)",
          }}
        >
          <span style={{ fontSize: 11, color: "var(--de-text-tertiary)", fontFamily: "var(--de-mono)" }}>
            {willImport} import · {willSkip} skip · {preview.invalid.length} invalid
          </span>
          <div style={{ flex: 1 }} />
          <DialogButton onClick={onCancel} title="Cancel">Cancel</DialogButton>
          <DialogButton
            onClick={() => onConfirm(mode)}
            title="Import"
            disabled={willImport === 0}
            primary
          >
            Import {willImport > 0 ? willImport : ""}
          </DialogButton>
        </div>
      </div>
    </div>
  );
}

function SummaryGrid({
  total,
  fresh,
  conflicts,
  invalid,
  primaryKey,
}: {
  total: number;
  fresh: number;
  conflicts: number;
  invalid: number;
  primaryKey: string;
}) {
  return (
    <div>
      <div style={{ fontSize: 12, color: "var(--de-text-secondary)", marginBottom: 10 }}>
        Parsed <strong style={{ color: "var(--de-text)" }}>{total}</strong> row
        {total === 1 ? "" : "s"}. Conflicts detected by primary key{" "}
        <code style={{ fontFamily: "var(--de-mono)", color: "var(--de-text)" }}>{primaryKey}</code>.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        <StatCell label="New" value={fresh} accent="var(--de-success, #4ade80)" />
        <StatCell label="Will overwrite" value={conflicts} accent="var(--de-warning, #fbbf24)" />
        <StatCell label="Invalid" value={invalid} accent="var(--de-danger, #f87171)" />
      </div>
    </div>
  );
}

function StatCell({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div
      style={{
        padding: "10px 12px",
        background: "var(--de-bg-surface)",
        border: "1px solid var(--de-border)",
        borderRadius: "var(--de-radius-sm)",
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 700, color: accent, fontFamily: "var(--de-mono)" }}>
        {value}
      </div>
      <div style={{ fontSize: 10, color: "var(--de-text-tertiary)", textTransform: "uppercase", letterSpacing: 0.4 }}>
        {label}
      </div>
    </div>
  );
}

function ModeRadio({
  checked,
  onChange,
  title,
  description,
  disabled,
  warning,
}: {
  checked: boolean;
  onChange: () => void;
  title: string;
  description: string;
  disabled?: boolean;
  warning?: boolean;
}) {
  return (
    <label
      style={{
        display: "flex",
        gap: 10,
        padding: "10px 12px",
        background: checked ? "var(--de-bg-surface)" : "transparent",
        border: `1px solid ${checked ? "var(--de-accent)" : "var(--de-border)"}`,
        borderRadius: "var(--de-radius-sm)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "border-color 100ms",
      }}
    >
      <input
        type="radio"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        style={{ marginTop: 2, accentColor: "var(--de-accent)" }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--de-text)" }}>{title}</span>
          {warning && (
            <Icon
              icon="lucide:alert-triangle"
              style={{ width: 12, height: 12, color: "var(--de-warning, #fbbf24)" }}
            />
          )}
        </div>
        <div style={{ fontSize: 11, color: "var(--de-text-tertiary)", marginTop: 2 }}>{description}</div>
      </div>
    </label>
  );
}

function DialogButton({
  onClick,
  title,
  children,
  disabled,
  primary,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      style={{
        height: 30,
        padding: "0 14px",
        border: primary ? "none" : "1px solid var(--de-border)",
        borderRadius: "var(--de-radius-sm)",
        background: primary ? "var(--de-accent)" : "var(--de-bg)",
        color: primary ? "var(--bn-cta-text, #fff)" : "var(--de-text-secondary)",
        fontSize: 12,
        fontWeight: primary ? 600 : 500,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        fontFamily: "var(--de-font)",
      }}
    >
      {children}
    </button>
  );
}
