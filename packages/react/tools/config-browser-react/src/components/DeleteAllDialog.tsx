/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * DeleteAllDialog — destructive confirmation modal for nuking every
 * row in the visible table. Three guard rails before the delete button
 * unlocks:
 *   1. The user MUST download a backup first (the same JSON the Export
 *      button produces — round-trips with Import).
 *   2. The user MUST type the table label exactly to acknowledge the
 *      target.
 *   3. Click + hold semantics are *not* used; we lean on points 1 + 2
 *      so the click itself is intentional.
 */

import { useState } from "react";
import { DynamicIcon as Icon } from "@starui/icons-svg/react";
import { Input } from "@starui/ui";

interface DeleteAllDialogProps {
  tableLabel: string;
  rowCount: number;
  scope: string | null;
  onCancel: () => void;
  onDownloadBackup: () => void;
  onConfirm: () => void;
}

export function DeleteAllDialog({
  tableLabel,
  rowCount,
  scope,
  onCancel,
  onDownloadBackup,
  onConfirm,
}: DeleteAllDialogProps) {
  const [backedUp, setBackedUp] = useState(false);
  const [typed, setTyped] = useState("");

  const typedMatches = typed.trim().toLowerCase() === tableLabel.toLowerCase();
  const canDelete = backedUp && typedMatches && rowCount > 0;

  const handleBackup = () => {
    onDownloadBackup();
    setBackedUp(true);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-all-title"
      className="fixed inset-0 bg-black/55 flex items-center justify-center z-[1000] font-[var(--de-font)]"
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[520px] max-w-[90vw] flex flex-col bg-[var(--de-bg)] border border-[var(--de-danger,var(--ds-accent-negative))] rounded-[var(--de-radius-md,8px)] shadow-[0_20px_60px_rgba(0,0,0,0.45)] overflow-hidden"
      >
        {/* Header */}
        <div
          className="flex items-center gap-2.5 px-[18px] py-[14px] border-b border-[var(--de-border)] bg-[color-mix(in_srgb,var(--de-danger,var(--ds-accent-negative))_8%,var(--de-bg))]"
        >
          <Icon
            icon="lucide:alert-triangle"
            style={{ width: 16, height: 16 }}
            className="text-[var(--de-danger,var(--ds-accent-negative))]"
          />
          <span
            id="delete-all-title"
            className="text-[13px] font-semibold text-[var(--de-text)]"
          >
            Delete all rows in {tableLabel}
          </span>
        </div>

        {/* Body */}
        <div className="px-[18px] py-4 flex flex-col gap-[14px]">
          <div className="text-[12px] text-[var(--de-text-secondary)] leading-[1.55]">
            This will permanently delete{" "}
            <strong className="text-[var(--de-text)]">{rowCount}</strong> row
            {rowCount === 1 ? "" : "s"}
            {scope ? (
              <>
                {" "}scoped to{" "}
                <code className="font-[var(--de-mono)] text-[var(--de-text)]">{scope}</code>
              </>
            ) : null}
            . The rows are removed from the local Dexie database and (if configured) from the
            REST backend on the next sync. This cannot be undone.
          </div>

          {/* Step 1: backup */}
          <Step
            number={1}
            title="Download a backup"
            description="Saves the same JSON that Export JSON produces — Import will round-trip it."
            done={backedUp}
          >
            <button
              onClick={handleBackup}
              disabled={rowCount === 0}
              style={stepButton(backedUp)}
            >
              <Icon
                icon={backedUp ? "lucide:check" : "lucide:download"}
                style={{ width: 14, height: 14 }}
              />
              {backedUp ? "Backup downloaded" : "Download backup"}
            </button>
          </Step>

          {/* Step 2: type-to-confirm */}
          <Step
            number={2}
            title={`Type the table name to confirm`}
            description={
              <>
                Type{" "}
                <code className="font-[var(--de-mono)] text-[var(--de-text)]">
                  {tableLabel}
                </code>{" "}
                exactly (case-insensitive).
              </>
            }
            done={typedMatches}
          >
            <Input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={tableLabel}
              disabled={!backedUp}
              style={{
                height: 30,
                fontSize: 12,
                fontFamily: "var(--de-mono)",
                background: "var(--de-bg-surface)",
                border: `1px solid ${typedMatches ? "var(--de-success, var(--ds-accent-positive))" : "var(--de-border)"}`,
                color: "var(--de-text)",
              }}
            />
          </Step>
        </div>

        {/* Footer */}
        <div
          className="flex items-center gap-2 px-[18px] py-3 border-t border-[var(--de-border)] bg-[var(--de-bg-surface)]"
        >
          <span
            style={{
              fontSize: 11,
              color: canDelete ? "var(--de-danger, var(--ds-accent-negative))" : "var(--de-text-tertiary)",
              fontFamily: "var(--de-mono)",
            }}
          >
            {canDelete
              ? `Ready to delete ${rowCount} row${rowCount === 1 ? "" : "s"}`
              : !backedUp
                ? "Backup required"
                : !typedMatches
                  ? "Confirmation required"
                  : "—"}
          </span>
          <div className="flex-1" />
          <button onClick={onCancel} style={cancelButton()}>
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!canDelete}
            style={dangerButton(canDelete)}
          >
            <Icon icon="lucide:trash-2" style={{ width: 14, height: 14 }} />
            Delete all {rowCount > 0 ? rowCount : ""}
          </button>
        </div>
      </div>
    </div>
  );
}

function Step({
  number,
  title,
  description,
  done,
  children,
}: {
  number: number;
  title: string;
  description: React.ReactNode;
  done: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        padding: "12px 14px",
        background: "var(--de-bg-surface)",
        border: `1px solid ${done ? "var(--de-success, var(--ds-accent-positive))" : "var(--de-border)"}`,
        borderRadius: "var(--de-radius-sm)",
        transition: "border-color 100ms",
      }}
    >
      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: "50%",
          background: done ? "var(--de-success, var(--ds-accent-positive))" : "var(--de-bg)",
          color: done ? "var(--ds-text-primary)" : "var(--de-text-secondary)",
          fontSize: 11,
          fontWeight: 700,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          fontFamily: "var(--de-mono)",
        }}
      >
        {done ? <Icon icon="lucide:check" style={{ width: 12, height: 12 }} /> : number}
      </div>
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <div>
          <div className="text-[12px] font-semibold text-[var(--de-text)]">{title}</div>
          <div className="text-[11px] text-[var(--de-text-tertiary)] mt-0.5">
            {description}
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

function stepButton(done: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    height: 30,
    padding: "0 12px",
    border: "1px solid var(--de-border)",
    borderRadius: "var(--de-radius-sm)",
    background: done ? "color-mix(in srgb, var(--de-success, var(--ds-accent-positive)) 12%, var(--de-bg))" : "var(--de-bg)",
    color: done ? "var(--de-success, var(--ds-accent-positive))" : "var(--de-text-secondary)",
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer",
    alignSelf: "flex-start",
    fontFamily: "var(--de-font)",
  };
}

function cancelButton(): React.CSSProperties {
  return {
    height: 30,
    padding: "0 14px",
    border: "1px solid var(--de-border)",
    borderRadius: "var(--de-radius-sm)",
    background: "var(--de-bg)",
    color: "var(--de-text-secondary)",
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer",
    fontFamily: "var(--de-font)",
  };
}

function dangerButton(enabled: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    height: 30,
    padding: "0 14px",
    border: "none",
    borderRadius: "var(--de-radius-sm)",
    background: enabled ? "var(--de-danger, var(--ds-accent-negative))" : "color-mix(in srgb, var(--de-danger, var(--ds-accent-negative)) 30%, transparent)",
    color: "var(--ds-text-primary)",
    fontSize: 12,
    fontWeight: 600,
    cursor: enabled ? "pointer" : "not-allowed",
    opacity: enabled ? 1 : 0.6,
    fontFamily: "var(--de-font)",
  };
}
