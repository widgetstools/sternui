import { TABLES, type TableKey } from "../types";

interface Counts {
  appConfig: number;
  appRegistry: number;
  userProfile: number;
  roles: number;
  permissions: number;
  pendingSync: number;
}

interface TableSidebarProps {
  selected: TableKey;
  counts: Counts;
  onSelect: (key: TableKey) => void;
}

export function TableSidebar({ selected, counts, onSelect }: TableSidebarProps) {
  return (
    <aside
      style={{
        width: 220,
        borderRight: "1px solid var(--de-border)",
        background: "var(--de-bg)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "12px 16px 8px 16px",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 0.8,
          textTransform: "uppercase",
          color: "var(--de-text-tertiary)",
        }}
      >
        Tables
      </div>

      <nav style={{ flex: 1, overflowY: "auto", padding: "0 8px 8px 8px" }}>
        {TABLES.map((t) => {
          const isActive = t.key === selected;
          const count = counts[t.key];
          return (
            <button
              key={t.key}
              onClick={() => onSelect(t.key)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                padding: "8px 10px",
                marginBottom: 2,
                border: "none",
                borderRadius: "var(--de-radius-sm)",
                background: isActive ? "var(--de-accent-dim)" : "transparent",
                color: isActive ? "var(--de-accent)" : "var(--de-text-secondary)",
                fontSize: 12,
                fontWeight: isActive ? 600 : 500,
                cursor: "pointer",
                textAlign: "left",
                fontFamily: "var(--de-font)",
                transition: "background 120ms ease",
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.background = "var(--de-bg-hover)";
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.background = "transparent";
              }}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {t.label}
              </span>
              <span
                style={{
                  fontSize: 10,
                  fontFamily: "var(--de-mono)",
                  padding: "1px 6px",
                  borderRadius: 4,
                  background: isActive ? "var(--de-accent)" : "var(--de-bg-surface)",
                  color: isActive ? "var(--de-bg)" : "var(--de-text-tertiary)",
                  minWidth: 22,
                  textAlign: "center",
                }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
