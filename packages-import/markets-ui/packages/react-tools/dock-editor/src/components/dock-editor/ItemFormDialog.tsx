import { useState, useEffect } from "react";
import { DynamicIcon as Icon } from "@markets/icons-svg/react";
import { IconSelect } from "./IconSelect";
import { DEFAULT_ICON } from "./icons";

export interface ItemFormData {
  label: string;
  iconName: string;
  iconId: string;
  actionId: string;
  hasChildren: boolean;
  /**
   * Optional fixed icon color (hex, e.g. "#0A76D3").
   * When set, the icon keeps this color in both dark and light themes.
   * When undefined, the icon recolors automatically with the theme.
   */
  iconColor?: string;
}

// ─── Predefined colors ──────────────────────────────────────────────
// Vivid colors that stand out clearly on both dark (#1E1F23) and
// light (#FAFBFE) backgrounds. Kept at high saturation so they
// remain legible at small icon sizes.
const PREDEFINED_COLORS = [
  { name: "Electric Blue",  hex: "#2196F3" },
  { name: "Cyan",           hex: "#00BCD4" },
  { name: "Mint",           hex: "#00E5A0" },
  { name: "Lime",           hex: "#76FF03" },
  { name: "Yellow",         hex: "#FFD600" },
  { name: "Amber",          hex: "#FF9800" },
  { name: "Coral",          hex: "#FF5252" },
  { name: "Pink",           hex: "#FF4081" },
  { name: "Lavender",       hex: "#B388FF" },
  { name: "White",          hex: "#FFFFFF" },
];

/**
 * Returns true if the given color is a custom (user-typed) color —
 * i.e. it is not one of the predefined swatches and is not undefined.
 *
 * Used to highlight the custom color picker button when a custom color
 * is active, and to avoid marking a predefined color as "custom".
 */
function isCustomColor(color: string | undefined): boolean {
  if (!color) return false;
  return !PREDEFINED_COLORS.some((c) => c.hex === color);
}

interface ItemFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  initial?: Partial<ItemFormData>;
  onSave: (data: ItemFormData) => void;
}

export function ItemFormDialog({ open, onOpenChange, title, initial, onSave }: ItemFormDialogProps) {
  const [label, setLabel] = useState("");
  const [iconName, setIconName] = useState<string>(DEFAULT_ICON.name);
  const [iconId, setIconId] = useState<string>(DEFAULT_ICON.icon);
  const [actionId, setActionId] = useState("");
  const [hasChildren, setHasChildren] = useState(false);
  const [iconColor, setIconColor] = useState<string | undefined>(undefined);
  const [errors, setErrors] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (open) {
      setLabel(initial?.label ?? "");
      setIconName(initial?.iconName ?? DEFAULT_ICON.name);
      setIconId(initial?.iconId ?? DEFAULT_ICON.icon);
      setActionId(initial?.actionId ?? "");
      setHasChildren(initial?.hasChildren ?? false);
      setIconColor(initial?.iconColor);
      setErrors({});
    }
  }, [open, initial]);

  const handleSave = () => {
    const e: Record<string, boolean> = {};
    if (!label.trim()) e.label = true;
    if (!actionId.trim()) e.actionId = true;
    if (Object.keys(e).length) { setErrors(e); return; }
    onSave({ label: label.trim(), iconName, iconId, actionId: actionId.trim(), hasChildren, iconColor });
    onOpenChange(false);
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div onClick={() => onOpenChange(false)} style={{
        position: "fixed", inset: 0, zIndex: 9998,
        background: "rgba(0, 0, 0, 0.6)", backdropFilter: "blur(4px)",
      }} />

      {/* Dialog */}
      <div style={{
        position: "fixed", left: "50%", top: "50%", transform: "translate(-50%, -50%)", zIndex: 9999,
        width: "100%", maxWidth: 420, borderRadius: "var(--de-radius-lg)",
        background: "var(--de-bg-raised)", border: "1px solid var(--de-border-strong)",
        boxShadow: "var(--de-shadow-lg)", fontFamily: "var(--de-font)",
        animation: "de-scale-in 0.18s ease-out", overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{ padding: "18px 22px 14px", borderBottom: "1px solid var(--de-border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 30, height: 30, borderRadius: "var(--de-radius-sm)",
              background: "var(--de-accent-dim)", display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Icon icon={title.includes("Edit") ? "lucide:pencil" : "lucide:plus"} style={{ width: 14, height: 14, color: "var(--de-accent)" }} />
            </div>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 600, color: "var(--de-text)", margin: 0 }}>{title}</h2>
              <p style={{ fontSize: 11, color: "var(--de-text-tertiary)", margin: 0, marginTop: 2 }}>
                Configure the item properties
              </p>
            </div>
          </div>
        </div>

        {/* Fields */}
        <div style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Label */}
          <Field label="Label" required error={errors.label ? "Label is required" : undefined}>
            <input value={label} onChange={(e) => { setLabel(e.target.value); if (e.target.value.trim()) setErrors(p => ({ ...p, label: false })); }}
              placeholder="e.g., New File"
              style={{
                width: "100%", height: 36, padding: "0 12px", fontSize: 13, fontFamily: "var(--de-font)",
                border: `1px solid ${errors.label ? "var(--de-danger)" : "var(--de-border-strong)"}`,
                borderRadius: "var(--de-radius-sm)", background: "var(--de-bg-surface)",
                color: "var(--de-text)", outline: "none", transition: "border-color 0.15s",
                boxShadow: errors.label ? "0 0 0 2px var(--de-danger-dim)" : "none",
              }}
              onFocus={e => { if (!errors.label) e.currentTarget.style.borderColor = "var(--de-accent)"; e.currentTarget.style.boxShadow = errors.label ? "" : "0 0 0 2px var(--de-accent-dim)"; }}
              onBlur={e => { e.currentTarget.style.borderColor = errors.label ? "var(--de-danger)" : "var(--de-border-strong)"; e.currentTarget.style.boxShadow = errors.label ? "0 0 0 2px var(--de-danger-dim)" : "none"; }}
            />
          </Field>

          {/* Icon */}
          <Field label="Icon" required>
            <IconSelect value={iconName} onChange={(n, id) => { setIconName(n); setIconId(id); }} />
          </Field>

          {/* Icon Color */}
          <Field label="Icon Color" hint={iconColor ? `Fixed color: ${iconColor}` : "Auto — changes with theme"}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {/* Swatches row: Auto + predefined colors + custom color picker */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>

                {/* Auto — no fixed color, recolors with theme */}
                <button
                  onClick={() => setIconColor(undefined)}
                  title="Auto — follows theme"
                  style={{
                    width: 28, height: 28, borderRadius: "var(--de-radius-sm)", cursor: "pointer",
                    border: iconColor === undefined ? "2px solid var(--de-accent)" : "1px solid var(--de-border-strong)",
                    background: "var(--de-bg-surface)", display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "all 0.12s", padding: 0, flexShrink: 0,
                  }}
                >
                  <Icon icon="lucide:sun-moon" style={{ width: 14, height: 14, color: "var(--de-text-secondary)" }} />
                </button>

                {/* Predefined color swatches */}
                {PREDEFINED_COLORS.map((c) => (
                  <button
                    key={c.hex}
                    onClick={() => setIconColor(c.hex)}
                    title={c.name}
                    style={{
                      width: 28, height: 28, borderRadius: "var(--de-radius-sm)", cursor: "pointer",
                      border: iconColor === c.hex ? "2px solid var(--de-accent)" : "1px solid var(--de-border)",
                      background: c.hex, padding: 0, transition: "all 0.12s", flexShrink: 0,
                      boxShadow: iconColor === c.hex ? "0 0 0 2px var(--de-accent-dim)" : "none",
                    }}
                  />
                ))}

                {/* Custom color picker — opens the native browser color chooser */}
                <label
                  title="Custom color"
                  style={{
                    width: 28, height: 28, borderRadius: "var(--de-radius-sm)", cursor: "pointer",
                    border: iconColor && isCustomColor(iconColor)
                      ? "2px solid var(--de-accent)"
                      : "1px solid var(--de-border-strong)",
                    background: iconColor && isCustomColor(iconColor)
                      ? iconColor
                      : "var(--de-bg-surface)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "all 0.12s", flexShrink: 0, overflow: "hidden",
                    boxShadow: iconColor && isCustomColor(iconColor)
                      ? "0 0 0 2px var(--de-accent-dim)"
                      : "none",
                  }}
                >
                  {/* Show a palette icon when no custom color is active */}
                  {(!iconColor || !isCustomColor(iconColor)) && (
                    <Icon icon="lucide:pipette" style={{ width: 14, height: 14, color: "var(--de-text-secondary)", pointerEvents: "none" }} />
                  )}
                  <input
                    type="color"
                    value={iconColor && iconColor !== "" ? iconColor : "#ffffff"}
                    onChange={(e) => setIconColor(e.target.value.toUpperCase())}
                    style={{
                      position: "absolute", opacity: 0, width: 28, height: 28,
                      cursor: "pointer", padding: 0, border: "none",
                    }}
                  />
                </label>

              </div>
            </div>
          </Field>

          {/* Action ID */}
          <Field label="Action ID" required error={errors.actionId ? "Action ID is required" : undefined}
            hint={!errors.actionId ? "Unique identifier for this action" : undefined}>
            <input value={actionId} onChange={(e) => { setActionId(e.target.value); if (e.target.value.trim()) setErrors(p => ({ ...p, actionId: false })); }}
              placeholder="e.g., file.new"
              style={{
                width: "100%", height: 36, padding: "0 12px", fontSize: 13, fontFamily: "var(--de-mono)",
                border: `1px solid ${errors.actionId ? "var(--de-danger)" : "var(--de-border-strong)"}`,
                borderRadius: "var(--de-radius-sm)", background: "var(--de-bg-surface)",
                color: "var(--de-text)", outline: "none", transition: "border-color 0.15s",
                boxShadow: errors.actionId ? "0 0 0 2px var(--de-danger-dim)" : "none",
                letterSpacing: "0.01em",
              }}
              onFocus={e => { if (!errors.actionId) e.currentTarget.style.borderColor = "var(--de-accent)"; e.currentTarget.style.boxShadow = errors.actionId ? "" : "0 0 0 2px var(--de-accent-dim)"; }}
              onBlur={e => { e.currentTarget.style.borderColor = errors.actionId ? "var(--de-danger)" : "var(--de-border-strong)"; e.currentTarget.style.boxShadow = errors.actionId ? "0 0 0 2px var(--de-danger-dim)" : "none"; }}
            />
          </Field>

          {/* Has Children — when checked, this item becomes a dropdown
               button (or sub-menu) that can contain other items.
               When unchecked, clicking the button fires a single action. */}
          <div onClick={() => setHasChildren(!hasChildren)} style={{
            display: "flex", alignItems: "center", gap: 12, padding: "10px 12px",
            borderRadius: "var(--de-radius-sm)", cursor: "pointer",
            border: "1px solid var(--de-border)", background: hasChildren ? "var(--de-accent-subtle)" : "transparent",
            transition: "all 0.15s",
          }}>
            <div style={{
              width: 18, height: 18, borderRadius: "var(--de-radius-sm)", display: "flex", alignItems: "center", justifyContent: "center",
              background: hasChildren ? "var(--de-accent)" : "transparent",
              border: hasChildren ? "none" : "1.5px solid var(--de-border-strong)",
              transition: "all 0.15s", flexShrink: 0,
            }}>
              {hasChildren && <Icon icon="lucide:check" style={{ width: 12, height: 12, color: "var(--de-bg-deep)" }} />}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--de-text)" }}>Has Children</div>
              <div style={{ fontSize: 11, color: "var(--de-text-tertiary)", marginTop: 1 }}>Creates a dropdown or submenu container</div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          display: "flex", justifyContent: "flex-end", gap: 8,
          padding: "14px 22px", borderTop: "1px solid var(--de-border)",
          background: "var(--de-bg-surface)",
        }}>
          <button onClick={() => onOpenChange(false)} style={{
            padding: "7px 16px", fontSize: 12, fontWeight: 500, fontFamily: "var(--de-font)",
            border: "1px solid var(--de-border)", borderRadius: "var(--de-radius-sm)",
            background: "transparent", color: "var(--de-text-secondary)", cursor: "pointer",
            transition: "all 0.12s",
          }} onMouseEnter={e => { e.currentTarget.style.background = "var(--de-bg-hover)"; }}
             onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
            Cancel
          </button>
          <button onClick={handleSave} style={{
            display: "flex", alignItems: "center", gap: 6, padding: "7px 18px",
            fontSize: 12, fontWeight: 600, fontFamily: "var(--de-font)",
            border: "none", borderRadius: "var(--de-radius-sm)",
            background: "var(--de-accent)", color: "var(--de-bg-deep)", cursor: "pointer",
            transition: "all 0.12s", boxShadow: "var(--de-shadow-glow)",
          }} onMouseEnter={e => { e.currentTarget.style.filter = "brightness(1.1)"; }}
             onMouseLeave={e => { e.currentTarget.style.filter = "none"; }}>
            <Icon icon="lucide:check" style={{ width: 13, height: 13 }} />
            Save
          </button>
        </div>
      </div>
    </>
  );
}

// ── Field wrapper ────────────────────────────────────────────────────

function Field({ label, required, error, hint, children }: {
  label: string; required?: boolean; error?: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label style={{ fontSize: 12, fontWeight: 500, color: "var(--de-text-secondary)", fontFamily: "var(--de-font)" }}>
        {label}
        {required && <span style={{ color: "var(--de-danger)", marginLeft: 3 }}>*</span>}
      </label>
      {children}
      {error && <span style={{ fontSize: 11, color: "var(--de-danger)" }}>{error}</span>}
      {hint && !error && <span style={{ fontSize: 11, color: "var(--de-text-ghost)" }}>{hint}</span>}
    </div>
  );
}
