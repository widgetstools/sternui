import { useState } from "react";
import { DynamicIcon as Icon } from "@markets/icons-svg/react";

export interface TreeItemData {
  id: string;
  label: string;
  iconId: string;
  iconName: string;
  actionId?: string;
  childCount?: number;
  children?: TreeItemData[];
  /** True if this item is a container (dropdown/submenu) even when children is empty */
  isContainer?: boolean;
}

interface TreeItemProps {
  item: TreeItemData;
  index: number;
  total: number;
  depth: number;
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  onAddChild: (parentId: string) => void;
  children?: React.ReactNode;
}

// Pixels of horizontal indentation per nesting level.
// Update this one constant to change indentation for the entire tree.
const INDENT_STEP = 22;

export function TreeItem({ item, index, total, depth, onEdit, onRemove, onMoveUp, onMoveDown, onAddChild, children: childNodes }: TreeItemProps) {
  const [expanded, setExpanded] = useState(true);
  const [hovered, setHovered] = useState(false);

  // An item "has children" if it is a container type (dropdown/submenu)
  // OR if child data was provided. Both cases show the expand toggle.
  const hasChildren = item.isContainer || (item.childCount ?? 0) > 0 || (item.children && item.children.length > 0);

  return (
    <div style={{ position: "relative" }}>
      {/* Indent guide */}
      {depth > 0 && (
        <div style={{
          position: "absolute", left: depth * INDENT_STEP + 6, top: 0, bottom: 0,
          width: 1, background: "var(--de-border)",
        }} />
      )}

      {/* Row */}
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: "flex", alignItems: "center", gap: 4,
          paddingLeft: depth * INDENT_STEP + 8, paddingRight: 6, height: 32,
          borderRadius: "var(--de-radius-sm)", marginBottom: 1,
          background: hovered ? "var(--de-bg-hover)" : "transparent",
          transition: "background 0.12s ease",
        }}
      >
        {/* Expand toggle */}
        {hasChildren ? (
          <button onClick={() => setExpanded(!expanded)} style={{
            width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center",
            border: "none", background: "none", cursor: "pointer", color: "var(--de-text-tertiary)",
            borderRadius: "var(--de-radius-sm)", padding: 0, flexShrink: 0, transition: "color 0.1s",
          }} onMouseEnter={e => { e.currentTarget.style.color = "var(--de-text)"; }}
             onMouseLeave={e => { e.currentTarget.style.color = "var(--de-text-tertiary)"; }}>
            <Icon icon={expanded ? "lucide:chevron-down" : "lucide:chevron-right"} style={{ width: 13, height: 13 }} />
          </button>
        ) : <span style={{ width: 20, flexShrink: 0 }} />}

        {/* Drag handle */}
        <span style={{ width: 12, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--de-text-ghost)", cursor: "grab", flexShrink: 0 }}>
          <Icon icon="lucide:grip-vertical" style={{ width: 12, height: 12 }} />
        </span>

        {/* Icon chip */}
        <span style={{
          width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center",
          borderRadius: "var(--de-radius-sm)", background: "var(--de-bg-surface)", flexShrink: 0,
          border: "1px solid var(--de-border-subtle)",
        }}>
          <Icon icon={item.iconId} style={{ width: 13, height: 13, color: "var(--de-text-secondary)" }} />
        </span>

        {/* Label */}
        <span style={{
          flex: 1, fontSize: 13, fontWeight: 500, color: "var(--de-text)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          paddingLeft: 4, fontFamily: "var(--de-font)",
        }}>
          {item.label}
        </span>

        {/* Child count */}
        {hasChildren && (
          <span style={{
            minWidth: 20, height: 18, display: "flex", alignItems: "center", justifyContent: "center",
            borderRadius: "var(--de-radius-md)", background: "var(--de-bg-surface)", border: "1px solid var(--de-border-subtle)",
            fontSize: 10, fontWeight: 600, color: "var(--de-text-tertiary)",
            paddingLeft: 5, paddingRight: 5, flexShrink: 0,
          }}>
            {item.childCount ?? item.children?.length ?? 0}
          </span>
        )}

        {/* Actions */}
        <div style={{
          display: "flex", alignItems: "center", gap: 1, flexShrink: 0,
          opacity: hovered ? 1 : 0, transition: "opacity 0.12s ease",
        }}>
          <ActionBtn icon="lucide:chevron-up" onClick={() => onMoveUp(item.id)} disabled={index === 0} title="Move up" />
          <ActionBtn icon="lucide:chevron-down" onClick={() => onMoveDown(item.id)} disabled={index === total - 1} title="Move down" />
          <ActionBtn icon="lucide:pencil" onClick={() => onEdit(item.id)} title="Edit" />
          <ActionBtn icon="lucide:trash-2" onClick={() => onRemove(item.id)} title="Delete" danger />
        </div>
      </div>

      {/* Children */}
      {hasChildren && expanded && childNodes}

      {/* Add child */}
      {hasChildren && expanded && (
        <button onClick={() => onAddChild(item.id)} style={{
          display: "flex", alignItems: "center", gap: 5,
          paddingLeft: (depth + 1) * INDENT_STEP + 32, paddingRight: 8, height: 26,
          border: "none", background: "none", color: "var(--de-text-ghost)",
          fontSize: 11, fontFamily: "var(--de-font)", fontWeight: 500,
          cursor: "pointer", borderRadius: "var(--de-radius-sm)", transition: "all 0.12s",
        }} onMouseEnter={e => { e.currentTarget.style.color = "var(--de-accent)"; e.currentTarget.style.background = "var(--de-accent-subtle)"; }}
           onMouseLeave={e => { e.currentTarget.style.color = "var(--de-text-ghost)"; e.currentTarget.style.background = "none"; }}>
          <Icon icon="lucide:plus" style={{ width: 11, height: 11 }} />
          Add child
        </button>
      )}
    </div>
  );
}

// ── Tiny action button ───────────────────────────────────────────────

function ActionBtn({ icon, onClick, disabled, title, danger }: {
  icon: string; onClick: () => void; disabled?: boolean; title: string; danger?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={disabled} title={title} style={{
      width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center",
      border: "none", borderRadius: "var(--de-radius-sm)", cursor: disabled ? "default" : "pointer",
      background: "none", padding: 0, transition: "all 0.1s",
      color: disabled ? "var(--de-text-ghost)" : danger ? "var(--de-danger)" : "var(--de-text-secondary)",
      opacity: disabled ? 0.35 : 1,
    }} onMouseEnter={e => {
      if (!disabled) {
        e.currentTarget.style.background = danger ? "var(--de-danger-dim)" : "var(--de-bg-active)";
        e.currentTarget.style.color = danger ? "var(--de-danger)" : "var(--de-text)";
      }
    }}
       onMouseLeave={e => {
         e.currentTarget.style.background = "none";
         e.currentTarget.style.color = disabled ? "var(--de-text-ghost)" : danger ? "var(--de-danger)" : "var(--de-text-secondary)";
       }}>
      <Icon icon={icon} style={{ width: 14, height: 14 }} />
    </button>
  );
}
