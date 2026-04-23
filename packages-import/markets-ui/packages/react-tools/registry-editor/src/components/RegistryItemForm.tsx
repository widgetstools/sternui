import React, { useState, useEffect, useMemo } from "react";
import { DynamicIcon as Icon } from "@markets/icons-svg/react";
import { ICON_NAMES, ICON_META } from "@markets/icons-svg";
import { generateTemplateConfigId } from "@markets/openfin-workspace";

export interface RegistryFormData {
  displayName: string;
  hostUrl: string;
  iconId: string;
  componentType: string;
  componentSubType: string;
  configId: string;
}

interface RegistryItemFormProps {
  open: boolean;
  title: string;
  initial?: Partial<RegistryFormData>;
  onSave: (data: RegistryFormData) => void;
  onCancel: () => void;
}

export function RegistryItemForm({ open, title, initial, onSave, onCancel }: RegistryItemFormProps) {
  const [displayName, setDisplayName] = useState(initial?.displayName ?? "");
  const [hostUrl, setHostUrl] = useState(initial?.hostUrl ?? "");
  const [iconId, setIconId] = useState(initial?.iconId ?? "lucide:box");
  const [componentType, setComponentType] = useState(initial?.componentType ?? "");
  const [componentSubType, setComponentSubType] = useState(initial?.componentSubType ?? "");
  const [configId, setConfigId] = useState(initial?.configId ?? "");
  const [configIdEdited, setConfigIdEdited] = useState(false);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [iconSearch, setIconSearch] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setDisplayName(initial?.displayName ?? "");
      setHostUrl(initial?.hostUrl ?? "");
      setIconId(initial?.iconId ?? "lucide:box");
      setComponentType(initial?.componentType ?? "");
      setComponentSubType(initial?.componentSubType ?? "");
      setConfigId(initial?.configId ?? "");
      setConfigIdEdited(!!initial?.configId);
      setErrors({});
      setIconPickerOpen(false);
      setIconSearch("");
    }
  }, [open, initial]);

  // Auto-populate configId when type/subtype change and user hasn't manually edited
  useEffect(() => {
    if (!configIdEdited && componentType.trim() && componentSubType.trim()) {
      setConfigId(generateTemplateConfigId(componentType.toUpperCase(), componentSubType.toUpperCase()));
    }
  }, [componentType, componentSubType, configIdEdited]);

  // Memoize icon filtering — only recalculates when search term changes
  const filteredIcons = useMemo(() =>
    ICON_NAMES.filter((name) => {
      if (!iconSearch) return true;
      const q = iconSearch.toLowerCase();
      const meta = ICON_META[name];
      return name.includes(q) || meta?.category.includes(q);
    }),
    [iconSearch],
  );

  if (!open) return null;

  function validate(): boolean {
    const newErrors: Record<string, string> = {};
    if (!displayName.trim()) newErrors.displayName = "Required";
    if (!hostUrl.trim()) newErrors.hostUrl = "Required";
    if (!componentType.trim()) newErrors.componentType = "Required";
    if (!componentSubType.trim()) newErrors.componentSubType = "Required";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function handleSave() {
    if (!validate()) return;
    const finalConfigId = configId || generateTemplateConfigId(componentType.toUpperCase(), componentSubType.toUpperCase());
    onSave({ displayName, hostUrl, iconId, componentType: componentType.toUpperCase(), componentSubType: componentSubType.toUpperCase(), configId: finalConfigId });
  }

  return (
    <>
      {/* Backdrop */}
      <div onClick={onCancel} style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
        zIndex: 1000, animation: "de-fade-in 0.15s ease",
      }} />

      {/* Dialog — fixed height, scrollable body, pinned footer */}
      <div style={{
        position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
        width: 480, maxHeight: "85vh",
        background: "var(--de-bg-raised)", border: "1px solid var(--de-border)",
        borderRadius: "var(--de-radius-lg)", boxShadow: "var(--de-shadow-lg)",
        zIndex: 1001, animation: "de-scale-in 0.2s ease",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        {/* Header — pinned */}
        <div style={{ padding: "20px 24px 0", flexShrink: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--de-text)" }}>{title}</div>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflow: "auto", padding: "16px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Display Name */}
          <FieldGroup label="Display Name" error={errors.displayName}>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g., Credit Blotter" style={inputStyle} />
          </FieldGroup>

          {/* Host URL */}
          <FieldGroup label="Host URL" error={errors.hostUrl}>
            <input value={hostUrl} onChange={(e) => setHostUrl(e.target.value)}
              placeholder="e.g., http://localhost:5174/views/credit-blotter" style={inputStyle} />
          </FieldGroup>

          {/* Icon */}
          <FieldGroup label="Icon">
            <button onClick={() => setIconPickerOpen(!iconPickerOpen)} style={{
              ...inputStyle, display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
            }}>
              <Icon icon={iconId} style={{ width: 16, height: 16, color: "var(--de-accent)" }} />
              <span style={{ fontSize: 12, color: "var(--de-text-secondary)" }}>{iconId}</span>
            </button>
            {iconPickerOpen && (
              <div style={{
                marginTop: 6, padding: 8, background: "var(--de-bg-surface)",
                border: "1px solid var(--de-border)", borderRadius: "var(--de-radius-sm)",
                height: 160, overflow: "auto",
              }}>
                <input value={iconSearch} onChange={(e) => setIconSearch(e.target.value)}
                  placeholder="Search icons..." style={{ ...inputStyle, marginBottom: 8, fontSize: 11 }} />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, 32px)", gap: 4 }}>
                  {filteredIcons.slice(0, 80).map((name) => (
                    <button key={name} title={name}
                      onClick={() => { setIconId(`mkt:${name}`); setIconPickerOpen(false); }}
                      style={{
                        width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center",
                        background: iconId === `mkt:${name}` ? "var(--de-accent-dim)" : "transparent",
                        border: "1px solid transparent", borderRadius: "var(--de-radius-sm)", cursor: "pointer",
                        color: "var(--de-text-secondary)",
                      }}>
                      <Icon icon={`mkt:${name}`} style={{ width: 16, height: 16 }} />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </FieldGroup>

          {/* Component Type + SubType */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <FieldGroup label="Component Type" error={errors.componentType}>
              <input value={componentType} onChange={(e) => setComponentType(e.target.value)}
                placeholder="e.g., GRID" style={inputStyle} />
            </FieldGroup>
            <FieldGroup label="Component SubType" error={errors.componentSubType}>
              <input value={componentSubType} onChange={(e) => setComponentSubType(e.target.value)}
                placeholder="e.g., CREDIT" style={inputStyle} />
            </FieldGroup>
          </div>

          {/* Config ID */}
          <FieldGroup label="Config ID">
            <input
              value={configId}
              onChange={(e) => { setConfigId(e.target.value); setConfigIdEdited(true); }}
              placeholder="Auto-generated from type/subtype"
              style={{ ...inputStyle, fontFamily: "var(--de-mono)" }}
            />
          </FieldGroup>
        </div>

        {/* Footer — pinned at bottom */}
        <div style={{
          display: "flex", justifyContent: "flex-end", gap: 8,
          padding: "12px 24px", borderTop: "1px solid var(--de-border)",
          flexShrink: 0,
        }}>
          <button onClick={onCancel} style={cancelBtnStyle}>Cancel</button>
          <button onClick={handleSave} style={saveBtnStyle}>Save</button>
        </div>
      </div>
    </>
  );
}

function FieldGroup({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 500, color: "var(--de-text-secondary)", marginBottom: 4 }}>
        {label} {error && <span style={{ color: "var(--de-danger)", marginLeft: 4 }}>{error}</span>}
      </div>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 10px", fontSize: 13,
  background: "var(--de-bg-surface)", color: "var(--de-text)",
  border: "1px solid var(--de-border)", borderRadius: "var(--de-radius-sm)",
  outline: "none", fontFamily: "inherit", boxSizing: "border-box",
};

const cancelBtnStyle: React.CSSProperties = {
  padding: "8px 16px", borderRadius: "var(--de-radius-sm)",
  fontSize: 12, fontWeight: 500, cursor: "pointer",
  border: "1px solid var(--de-border)", background: "var(--de-bg-surface)",
  color: "var(--de-text-secondary)",
};

const saveBtnStyle: React.CSSProperties = {
  padding: "8px 20px", borderRadius: "var(--de-radius-sm)",
  fontSize: 12, fontWeight: 600, cursor: "pointer",
  border: "none", background: "var(--de-accent)",
  color: "var(--de-bg-deep)",
};
