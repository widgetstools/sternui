import { DynamicIcon as Icon } from "@stargrid/config-browser/icons";
import { Input } from "@stargrid/ui";
import type { TableMeta } from "../types";

interface ToolbarProps {
  table: TableMeta;
  rowCount: number;
  quickFilter: string;
  onQuickFilterChange: (value: string) => void;
  onRefresh: () => void;
  onNew: () => void;
  onExport: () => void;
  onExportAll: () => void;
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
  onExportAll,
  onImport,
  onDeleteAll,
}: ToolbarProps) {
  return (
    <div
      className="flex items-center gap-2 px-4 py-2.5 border-b bg-[var(--de-bg)] border-[var(--de-border)]"
    >
      <div className="flex flex-col gap-0.5">
        <div className="text-[13px] font-semibold text-[var(--de-text)]">
          {table.label}
        </div>
        <div className="text-[11px] text-[var(--de-text-tertiary)]">
          {rowCount} {rowCount === 1 ? "row" : "rows"} · pk {table.primaryKey}
        </div>
      </div>

      <div className="flex-1" />

      <div className="relative w-60">
        <Icon
          icon="lucide:search"
          style={{ width: 14, height: 14 }}
          className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--de-text-tertiary)] pointer-events-none"
        />
        <Input
          value={quickFilter}
          onChange={(e) => onQuickFilterChange(e.target.value)}
          placeholder="Search rows…"
          className="h-[30px] text-[12px] bg-[var(--de-bg-surface)] border-[var(--de-border)] text-[var(--de-text)]"
          style={{ paddingLeft: 28 }}
        />
      </div>

      <ToolbarButton onClick={onRefresh} title="Refresh" icon="lucide:refresh-cw" />
      <ToolbarButton onClick={onImport} title="Import JSON (matches Export format)" icon="lucide:upload" />
      <ToolbarButton onClick={onExport} title="Export JSON (this table only)" icon="lucide:download" />
      <ToolbarButton
        onClick={onExportAll}
        title="Export ALL tables as a single bundle (seed-config shape — feed straight into the admin importer)"
        icon="lucide:package"
      />
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
            ? "1px solid color-mix(in srgb, var(--de-danger, var(--ds-accent-negative)) 35%, var(--de-border))"
            : "1px solid var(--de-border)",
        borderRadius: "var(--de-radius-sm)",
        background: primary
          ? "var(--de-accent)"
          : danger
            ? "color-mix(in srgb, var(--de-danger, var(--ds-accent-negative)) 8%, var(--de-bg-surface))"
            : "var(--de-bg-surface)",
        color: primary
          ? "hsl(var(--primary-foreground))"
          : danger
            ? "var(--de-danger, var(--ds-accent-negative))"
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
