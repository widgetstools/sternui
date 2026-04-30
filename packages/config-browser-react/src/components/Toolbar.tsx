import { DynamicIcon as Icon } from "@marketsui/icons-svg/react";
import { Input } from "@marketsui/ui";
import type { TableMeta } from "../types";

interface ToolbarProps {
  table: TableMeta;
  rowCount: number;
  quickFilter: string;
  onQuickFilterChange: (value: string) => void;
  onRefresh: () => void;
  onNew: () => void;
  onExport: () => void;
  onImport: () => void;
  onDeleteAll: () => void;
}

export function Toolbar({
  table,
  rowCount,
  quickFilter,
  onQuickFilterChange,
  onRefresh,
  onNew,
  onExport,
  onImport,
  onDeleteAll,
}: ToolbarProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 16px",
        borderBottom: "1px solid var(--de-border)",
        background: "var(--de-bg)",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--de-text)" }}>
          {table.label}
        </div>
        <div style={{ fontSize: 11, color: "var(--de-text-tertiary)" }}>
          {rowCount} {rowCount === 1 ? "row" : "rows"} · pk {table.primaryKey}
        </div>
      </div>

      <div style={{ flex: 1 }} />

      <div style={{ position: "relative", width: 240 }}>
        <Icon
          icon="lucide:search"
          style={{
            position: "absolute",
            left: 8,
            top: "50%",
            transform: "translateY(-50%)",
            width: 14,
            height: 14,
            color: "var(--de-text-tertiary)",
            pointerEvents: "none",
          }}
        />
        <Input
          value={quickFilter}
          onChange={(e) => onQuickFilterChange(e.target.value)}
          placeholder="Search rows…"
          style={{
            paddingLeft: 28,
            height: 30,
            fontSize: 12,
            background: "var(--de-bg-surface)",
            border: "1px solid var(--de-border)",
            color: "var(--de-text)",
          }}
        />
      </div>

      <ToolbarButton onClick={onRefresh} title="Refresh" icon="lucide:refresh-cw" />
      <ToolbarButton onClick={onImport} title="Import JSON (matches Export format)" icon="lucide:upload" />
      <ToolbarButton onClick={onExport} title="Export JSON" icon="lucide:download" />
      <ToolbarButton
        onClick={onDeleteAll}
        title="Delete all rows in this view (requires backup)"
        icon="lucide:trash-2"
        disabled={rowCount === 0}
        danger
      />
      <ToolbarButton onClick={onNew} title="New row" icon="lucide:plus" primary />
    </div>
  );
}

function ToolbarButton({
  onClick,
  title,
  icon,
  primary,
  danger,
  disabled,
}: {
  onClick: () => void;
  title: string;
  icon: string;
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        height: 30,
        padding: primary ? "0 12px" : "0 8px",
        border: primary
          ? "none"
          : danger
            ? "1px solid color-mix(in srgb, var(--de-danger, #f87171) 35%, var(--de-border))"
            : "1px solid var(--de-border)",
        borderRadius: "var(--de-radius-sm)",
        background: primary
          ? "var(--de-accent)"
          : danger
            ? "color-mix(in srgb, var(--de-danger, #f87171) 8%, var(--de-bg-surface))"
            : "var(--de-bg-surface)",
        color: primary
          ? "var(--bn-cta-text, #fff)"
          : danger
            ? "var(--de-danger, #f87171)"
            : "var(--de-text-secondary)",
        fontSize: 12,
        fontWeight: primary ? 600 : 500,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        fontFamily: "var(--de-font)",
      }}
    >
      <Icon icon={icon} style={{ width: 14, height: 14 }} />
      {primary && <span>New</span>}
    </button>
  );
}
