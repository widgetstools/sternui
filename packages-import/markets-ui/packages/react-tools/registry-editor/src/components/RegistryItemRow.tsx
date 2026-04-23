import { useState } from "react";
import { DynamicIcon as Icon } from "@markets/icons-svg/react";
import type { RegistryEntry } from "@markets/openfin-workspace";

interface RegistryItemRowProps {
  entry: RegistryEntry;
  onEdit: () => void;
  onTest: () => void;
  onDelete: () => void;
}

export function RegistryItemRow({ entry, onEdit, onTest, onDelete }: RegistryItemRowProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 14px",
        borderRadius: "var(--de-radius-sm)",
        background: hovered ? "var(--de-bg-hover)" : "transparent",
        transition: "background 0.15s ease",
        cursor: "default",
      }}
    >
      {/* Icon */}
      <div style={{
        width: 28, height: 28, borderRadius: "var(--de-radius-sm)",
        background: "var(--de-bg-surface)", display: "flex",
        alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        <Icon icon={entry.iconId} style={{ width: 14, height: 14, color: "var(--de-accent)" }} />
      </div>

      {/* Name + URL + Config ID */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--de-text)", lineHeight: 1.3 }}>
          {entry.displayName}
        </div>
        <div style={{
          fontSize: 11, color: "var(--de-text-tertiary)",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {entry.hostUrl}
        </div>
        {entry.configId && (
          <div style={{
            fontSize: 10, fontFamily: "var(--de-mono)", color: "var(--de-text-tertiary)",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            marginTop: 1,
          }}>
            {entry.configId}
          </div>
        )}
      </div>

      {/* Type tags */}
      <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
        <span style={{
          padding: "2px 6px", borderRadius: "var(--de-radius-sm)", fontSize: 10, fontWeight: 500,
          background: "var(--de-accent-dim)", color: "var(--de-accent)",
          textTransform: "uppercase", letterSpacing: "0.04em",
        }}>
          {entry.componentType}
        </span>
        <span style={{
          padding: "2px 6px", borderRadius: "var(--de-radius-sm)", fontSize: 10, fontWeight: 500,
          background: "var(--de-bg-surface)", color: "var(--de-text-secondary)",
          textTransform: "uppercase", letterSpacing: "0.04em",
        }}>
          {entry.componentSubType}
        </span>
      </div>

      {/* Actions (visible on hover) */}
      <div style={{
        display: "flex", gap: 4, opacity: hovered ? 1 : 0,
        transition: "opacity 0.15s ease", flexShrink: 0,
      }}>
        <button onClick={onEdit} title="Edit" style={actionBtnStyle}>
          <Icon icon="lucide:pencil" style={actionIconStyle} />
        </button>
        <button onClick={onTest} title="Test in OpenFin" style={actionBtnStyle}>
          <Icon icon="lucide:rocket" style={actionIconStyle} />
        </button>
        <button onClick={onDelete} title="Delete" style={{ ...actionBtnStyle, color: "var(--de-danger)" }}>
          <Icon icon="lucide:trash-2" style={actionIconStyle} />
        </button>
      </div>
    </div>
  );
}

const actionBtnStyle: React.CSSProperties = {
  background: "var(--de-bg-surface)", border: "1px solid var(--de-border)",
  borderRadius: "var(--de-radius-sm)", padding: 4, cursor: "pointer",
  color: "var(--de-text-secondary)", display: "flex", alignItems: "center",
  justifyContent: "center", transition: "all 0.15s ease",
};

const actionIconStyle: React.CSSProperties = { width: 13, height: 13 };
