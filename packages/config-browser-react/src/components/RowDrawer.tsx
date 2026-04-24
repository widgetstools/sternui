/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useRef, useState } from "react";
import { DynamicIcon as Icon } from "@marketsui/icons-svg/react";

type Mode = "edit" | "create";

interface RowDrawerProps {
  open: boolean;
  mode: Mode;
  initialRow: any | null;
  primaryKey: string;
  onClose: () => void;
  onSave: (row: any) => Promise<void>;
  onDelete: (id: string | number) => Promise<void>;
}

/**
 * Inline right-docked drawer for row edit / create.
 *
 * Implemented as a positioned sibling of the grid (not a portal), so:
 *   • `--de-*` tokens resolve correctly — it inherits from its parent's
 *     [data-dock-editor] scope.
 *   • There is no tailwind dependency — the child window's stylesheet
 *     doesn't process shadcn classes, which is what broke the previous
 *     Sheet-based implementation.
 *   • The drawer slides in from the right edge of the main pane; it
 *     doesn't darken the grid behind it (no modal overlay) — power
 *     users can still reference cell values while editing.
 *
 * The parent must position itself `relative` (or similar) so this
 * component's `position: absolute` anchors to it.
 */
export function RowDrawer({
  open,
  mode,
  initialRow,
  primaryKey,
  onClose,
  onSave,
  onDelete,
}: RowDrawerProps) {
  const initialJson = useMemo(() => {
    return initialRow ? JSON.stringify(initialRow, null, 2) : "{\n  \n}";
  }, [initialRow]);

  const [jsonText, setJsonText] = useState(initialJson);
  const [parseError, setParseError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setJsonText(initialJson);
    setParseError(null);
    setConfirmDelete(false);
  }, [initialJson, open]);

  // ESC closes the drawer.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const parsedOk = (() => {
    try {
      JSON.parse(jsonText);
      return true;
    } catch {
      return false;
    }
  })();

  async function handleSave() {
    setSaving(true);
    setParseError(null);
    try {
      const parsed = JSON.parse(jsonText);
      await onSave(parsed);
      onClose();
    } catch (err: any) {
      setParseError(err?.message ?? "Invalid JSON or save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    if (!initialRow) return;
    setSaving(true);
    try {
      await onDelete(initialRow[primaryKey]);
      onClose();
    } catch (err: any) {
      setParseError(err?.message ?? "Delete failed");
    } finally {
      setSaving(false);
      setConfirmDelete(false);
    }
  }

  const title =
    mode === "create"
      ? "new"
      : initialRow
        ? String(initialRow[primaryKey] ?? "(unknown)")
        : "";

  // Render even when closed so the slide-out animation can play.
  return (
    <div
      aria-hidden={!open}
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        width: "min(520px, 100%)",
        background: "var(--de-bg)",
        borderLeft: "1px solid var(--de-border)",
        boxShadow: open ? "var(--de-shadow-lg)" : "none",
        display: "flex",
        flexDirection: "column",
        transform: open ? "translateX(0)" : "translateX(100%)",
        transition: "transform 220ms cubic-bezier(0.22, 0.61, 0.36, 1)",
        pointerEvents: open ? "auto" : "none",
        zIndex: 20,
        color: "var(--de-text)",
        fontFamily: "var(--de-font)",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "12px 16px",
          borderBottom: "1px solid var(--de-border)",
          background: "var(--de-bg)",
        }}
      >
        <Icon
          icon={mode === "create" ? "lucide:plus-circle" : "lucide:file-json"}
          style={{ width: 16, height: 16, color: "var(--de-accent)" }}
        />
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--de-text)" }}>
          {mode === "create" ? "New row" : "Edit row"}
        </span>
        <span
          style={{
            fontFamily: "var(--de-mono)",
            fontSize: 11,
            fontWeight: 500,
            color: "var(--de-text-tertiary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {title}
        </span>
        <div style={{ flex: 1 }} />
        <button
          onClick={onClose}
          title="Close"
          style={{
            background: "transparent",
            border: "1px solid var(--de-border)",
            borderRadius: "var(--de-radius-sm)",
            padding: 4,
            cursor: "pointer",
            color: "var(--de-text-secondary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon icon="lucide:x" style={{ width: 14, height: 14 }} />
        </button>
      </div>

      {/* Body */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          padding: 14,
          gap: 8,
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 0.8,
            textTransform: "uppercase",
            color: "var(--de-text-tertiary)",
          }}
        >
          JSON payload
        </div>
        <textarea
          ref={textareaRef}
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
          spellCheck={false}
          style={{
            flex: 1,
            minHeight: 240,
            width: "100%",
            padding: 10,
            fontFamily: "var(--de-mono)",
            fontSize: 12,
            lineHeight: 1.5,
            background: "var(--de-bg-surface)",
            border: `1px solid ${parsedOk ? "var(--de-border)" : "var(--de-danger)"}`,
            borderRadius: "var(--de-radius-sm)",
            color: "var(--de-text)",
            resize: "none",
            outline: "none",
            boxSizing: "border-box",
          }}
        />
        {!parsedOk && (
          <div
            style={{
              fontSize: 11,
              color: "var(--de-danger)",
              fontFamily: "var(--de-mono)",
            }}
          >
            Invalid JSON — save disabled
          </div>
        )}
        {parseError && (
          <div
            style={{
              fontSize: 11,
              color: "var(--de-danger)",
              fontFamily: "var(--de-mono)",
            }}
          >
            {parseError}
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 14px",
          borderTop: "1px solid var(--de-border)",
          background: "var(--de-bg)",
        }}
      >
        {mode === "edit" && (
          <button
            onClick={handleDelete}
            disabled={saving}
            style={{
              height: 30,
              padding: "0 12px",
              borderRadius: "var(--de-radius-sm)",
              border: `1px solid ${confirmDelete ? "var(--de-danger)" : "var(--de-border)"}`,
              background: confirmDelete ? "var(--de-danger)" : "var(--de-bg-surface)",
              color: confirmDelete ? "#fff" : "var(--de-danger)",
              fontSize: 12,
              fontWeight: 600,
              cursor: saving ? "not-allowed" : "pointer",
              fontFamily: "var(--de-font)",
            }}
          >
            {confirmDelete ? "Click to confirm" : "Delete"}
          </button>
        )}
        <div style={{ flex: 1 }} />
        <button
          onClick={onClose}
          disabled={saving}
          style={{
            height: 30,
            padding: "0 12px",
            borderRadius: "var(--de-radius-sm)",
            border: "1px solid var(--de-border)",
            background: "var(--de-bg-surface)",
            color: "var(--de-text-secondary)",
            fontSize: 12,
            fontWeight: 500,
            cursor: saving ? "not-allowed" : "pointer",
            fontFamily: "var(--de-font)",
          }}
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!parsedOk || saving}
          style={{
            height: 30,
            padding: "0 16px",
            borderRadius: "var(--de-radius-sm)",
            border: "none",
            background: parsedOk ? "var(--de-accent)" : "var(--de-bg-surface)",
            color: parsedOk ? "var(--bn-cta-text, #fff)" : "var(--de-text-tertiary)",
            fontSize: 12,
            fontWeight: 600,
            cursor: parsedOk && !saving ? "pointer" : "not-allowed",
            opacity: saving ? 0.7 : 1,
            fontFamily: "var(--de-font)",
          }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
