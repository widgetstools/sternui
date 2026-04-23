import { useState, useRef, useEffect } from "react";
import { DynamicIcon as Icon } from "@markets/icons-svg/react";
import { ICON_OPTIONS, DEFAULT_ICON, findIconByName } from "./icons";

interface IconSelectProps {
  value: string;
  onChange: (iconName: string, iconId: string) => void;
}

export function IconSelect({ value, onChange }: IconSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const selected = findIconByName(value) ?? DEFAULT_ICON;

  const filtered = search
    ? ICON_OPTIONS.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()))
    : ICON_OPTIONS;

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      {/* Trigger */}
      <button type="button" onClick={() => { setOpen(!open); setSearch(""); }} style={{
        display: "flex", alignItems: "center", gap: 10, width: "100%", height: 38,
        padding: "0 12px", border: `1px solid ${open ? "var(--de-accent)" : "var(--de-border-strong)"}`,
        borderRadius: "var(--de-radius-sm)", background: "var(--de-bg-raised)",
        color: "var(--de-text)", fontSize: 13, fontFamily: "var(--de-font)", fontWeight: 500,
        cursor: "pointer", transition: "border-color 0.15s",
        boxShadow: open ? "0 0 0 2px var(--de-accent-dim)" : "none",
      }}>
        <span style={{
          width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center",
          borderRadius: "var(--de-radius-sm)", background: "var(--de-bg-surface)", border: "1px solid var(--de-border-subtle)", flexShrink: 0,
        }}>
          <Icon icon={selected.icon} style={{ width: 14, height: 14, color: "var(--de-text-secondary)" }} />
        </span>
        <span style={{ flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {selected.name}
        </span>
        <Icon icon="lucide:chevron-down" style={{
          width: 13, height: 13, color: "var(--de-text-tertiary)", flexShrink: 0,
          transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s",
        }} />
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 200,
          maxHeight: 280, display: "flex", flexDirection: "column", overflow: "hidden",
          borderRadius: "var(--de-radius-md)", border: "1px solid var(--de-border-strong)",
          background: "var(--de-bg-raised)", boxShadow: "var(--de-shadow-lg)",
          animation: "de-slide-up 0.15s ease-out",
        }}>
          {/* Search */}
          <div style={{
            display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
            borderBottom: "1px solid var(--de-border)",
          }}>
            <Icon icon="lucide:search" style={{ width: 13, height: 13, color: "var(--de-text-ghost)", flexShrink: 0 }} />
            <input
              value={search} onChange={(e) => setSearch(e.target.value)} autoFocus
              placeholder="Search icons…"
              style={{
                flex: 1, background: "none", border: "none", outline: "none",
                color: "var(--de-text)", fontSize: 12, fontFamily: "var(--de-font)",
              }}
            />
            {search && (
              <button type="button" onClick={() => setSearch("")} style={{
                border: "none", background: "none", cursor: "pointer", color: "var(--de-text-ghost)", padding: 0, display: "flex",
              }}>
                <Icon icon="lucide:x" style={{ width: 12, height: 12 }} />
              </button>
            )}
          </div>

          {/* Count */}
          <div style={{ padding: "4px 12px", fontSize: 10, color: "var(--de-text-ghost)", borderBottom: "1px solid var(--de-border-subtle)" }}>
            {filtered.length} icon{filtered.length !== 1 ? "s" : ""}
          </div>

          {/* Grid */}
          <div style={{
            flex: 1, overflowY: "auto", padding: 8,
            display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(34px, 1fr))", gap: 2,
          }}>
            {filtered.map((item) => {
              const isSelected = value === item.name;
              return (
                <button key={item.name} type="button" title={item.name} onClick={() => { onChange(item.name, item.icon); setOpen(false); }} style={{
                  width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center",
                  border: "none", borderRadius: "var(--de-radius-sm)", cursor: "pointer", padding: 0, transition: "all 0.1s",
                  background: isSelected ? "var(--de-accent-dim)" : "transparent",
                  color: isSelected ? "var(--de-accent)" : "var(--de-text-secondary)",
                  outline: isSelected ? "1px solid var(--de-accent)" : "none", outlineOffset: -1,
                }} onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = "var(--de-bg-active)"; }}
                   onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}>
                  <Icon icon={item.icon} style={{ width: 15, height: 15 }} />
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", alignItems: "center", padding: "20px 0", color: "var(--de-text-ghost)" }}>
                <Icon icon="lucide:search-x" style={{ width: 18, height: 18, marginBottom: 6, opacity: 0.4 }} />
                <span style={{ fontSize: 11 }}>No matches</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
