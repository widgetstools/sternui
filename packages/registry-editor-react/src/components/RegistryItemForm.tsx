import React, { useState, useEffect, useMemo } from "react";
import { DynamicIcon as Icon } from "@marketsui/icons-svg/react";
import { ICON_NAMES, ICON_META } from "@marketsui/icons-svg";
import {
  generateTemplateConfigId,
  deriveSingletonConfigId,
  validateEntry,
  validateSingletonUniqueness,
  type RegistryEntry,
  type HostEnv,
  type ValidationError,
} from "@marketsui/openfin-platform";

export interface RegistryFormData {
  displayName: string;
  hostUrl: string;
  iconId: string;
  componentType: string;
  componentSubType: string;
  configId: string;
  // v2 fields
  type: 'internal' | 'external';
  usesHostConfig: boolean;
  appId: string;
  configServiceUrl: string;
  singleton: boolean;
}

interface RegistryItemFormProps {
  open: boolean;
  title: string;
  initial?: Partial<RegistryFormData>;
  /** Host env — used to pre-fill and lock appId + configServiceUrl
   *  when usesHostConfig === true. Passed in from the parent which
   *  reads it once via `readHostEnv()` and caches it. */
  hostEnv: HostEnv;
  /** All registry entries (including the one being edited) — used
   *  for singleton-uniqueness validation. Parent is responsible for
   *  keeping this fresh; form itself is stateless w.r.t. the list. */
  allEntries: readonly RegistryEntry[];
  /** Id of the entry being edited, or null on Add. Excluded from
   *  the uniqueness check so editing an existing singleton doesn't
   *  collide with itself. */
  editingId: string | null;
  onSave: (data: RegistryFormData) => void;
  onCancel: () => void;
}

function buildInitial(initial: Partial<RegistryFormData> | undefined, hostEnv: HostEnv): RegistryFormData {
  return {
    displayName: initial?.displayName ?? "",
    hostUrl: initial?.hostUrl ?? "",
    iconId: initial?.iconId ?? "lucide:box",
    componentType: initial?.componentType ?? "",
    componentSubType: initial?.componentSubType ?? "",
    configId: initial?.configId ?? "",
    type: initial?.type ?? "internal",
    usesHostConfig: initial?.usesHostConfig ?? true,
    appId: initial?.appId ?? hostEnv.appId,
    configServiceUrl: initial?.configServiceUrl ?? hostEnv.configServiceUrl,
    singleton: initial?.singleton ?? false,
  };
}

export function RegistryItemForm({
  open, title, initial, hostEnv, allEntries, editingId, onSave, onCancel,
}: RegistryItemFormProps) {
  const [form, setForm] = useState<RegistryFormData>(() => buildInitial(initial, hostEnv));
  const [configIdEdited, setConfigIdEdited] = useState(false);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [iconSearch, setIconSearch] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setForm(buildInitial(initial, hostEnv));
      setConfigIdEdited(!!initial?.configId);
      setFieldErrors({});
      setIconPickerOpen(false);
      setIconSearch("");
    }
  }, [open, initial, hostEnv]);

  // ── Derived form behaviors ────────────────────────────────────

  // Auto-populate configId when type/subtype/singleton change.
  useEffect(() => {
    const { componentType, componentSubType, singleton } = form;
    if (!componentType.trim() || !componentSubType.trim()) return;

    if (singleton) {
      // Singleton: configId is ALWAYS derived. Ignore manual edits.
      const derived = deriveSingletonConfigId(componentType, componentSubType);
      if (form.configId !== derived) setForm(prev => ({ ...prev, configId: derived }));
    } else if (!configIdEdited) {
      // Non-singleton: auto-generate unless user manually edited.
      const generated = generateTemplateConfigId(componentType.toUpperCase(), componentSubType.toUpperCase());
      if (form.configId !== generated) setForm(prev => ({ ...prev, configId: generated }));
    }
  }, [form.componentType, form.componentSubType, form.singleton, configIdEdited, form.configId]);

  // When usesHostConfig toggles on, reset appId + configServiceUrl to host values.
  useEffect(() => {
    if (form.usesHostConfig) {
      if (form.appId !== hostEnv.appId || form.configServiceUrl !== hostEnv.configServiceUrl) {
        setForm(prev => ({
          ...prev,
          appId: hostEnv.appId,
          configServiceUrl: hostEnv.configServiceUrl,
        }));
      }
    }
  }, [form.usesHostConfig, hostEnv.appId, hostEnv.configServiceUrl, form.appId, form.configServiceUrl]);

  // Memoize icon filtering
  const filteredIcons = useMemo(() =>
    ICON_NAMES.filter((name) => {
      if (!iconSearch) return true;
      const q = iconSearch.toLowerCase();
      const meta = ICON_META[name];
      return name.includes(q) || meta?.category.includes(q);
    }),
    [iconSearch],
  );

  // ── Live singleton-uniqueness check ──────────────────────────
  const singletonUniquenessError = useMemo<string | null>(() => {
    if (!form.singleton || !form.componentType.trim() || !form.componentSubType.trim()) return null;

    // Build a hypothetical entries list reflecting the in-progress edit.
    const hypothetical: RegistryEntry[] = allEntries.map(e =>
      e.id === editingId
        ? { ...e, ...form, componentType: form.componentType.toUpperCase(), componentSubType: form.componentSubType.toUpperCase() }
        : e,
    );
    // If adding new, append a synthetic entry with a placeholder id.
    if (!editingId) {
      hypothetical.push({
        ...form,
        componentType: form.componentType.toUpperCase(),
        componentSubType: form.componentSubType.toUpperCase(),
        id: '__new__',
        createdAt: new Date().toISOString(),
        configId: deriveSingletonConfigId(form.componentType, form.componentSubType),
      });
    }

    const errs = validateSingletonUniqueness(hypothetical, form.appId);
    // Only surface errors that reference our edit (not collisions between
    // other existing entries, which aren't this user's problem right now).
    return errs.length > 0 ? errs[0].message : null;
  }, [form, allEntries, editingId]);

  if (!open) return null;

  // ── Helpers ──────────────────────────────────────────────────
  function update<K extends keyof RegistryFormData>(key: K, value: RegistryFormData[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  function handleSave() {
    const normalized: RegistryFormData = {
      ...form,
      componentType: form.componentType.toUpperCase(),
      componentSubType: form.componentSubType.toUpperCase(),
      configId: form.singleton
        ? deriveSingletonConfigId(form.componentType, form.componentSubType)
        : form.configId || generateTemplateConfigId(form.componentType.toUpperCase(), form.componentSubType.toUpperCase()),
    };

    // Full entry-level validation.
    const errs = validateEntry(normalized, hostEnv);
    if (singletonUniquenessError) {
      errs.push({ field: 'componentSubType', message: singletonUniquenessError });
    }
    if (errs.length > 0) {
      setFieldErrors(toErrorMap(errs));
      return;
    }

    onSave(normalized);
  }

  const appIdLocked = form.usesHostConfig;
  const configUrlLocked = form.usesHostConfig;

  return (
    <>
      <div onClick={onCancel} style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
        zIndex: 1000, animation: "de-fade-in 0.15s ease",
      }} />

      <div style={{
        position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
        width: 520, maxHeight: "85vh",
        background: "var(--de-bg-raised)", border: "1px solid var(--de-border)",
        borderRadius: "var(--de-radius-lg)", boxShadow: "var(--de-shadow-lg)",
        zIndex: 1001, animation: "de-scale-in 0.2s ease",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{ padding: "20px 24px 0", flexShrink: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--de-text)" }}>{title}</div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: "auto", padding: "16px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
          <FieldGroup label="Display Name" error={fieldErrors.displayName}>
            <input value={form.displayName} onChange={(e) => update('displayName', e.target.value)}
              placeholder="e.g., Credit Blotter" style={inputStyle} />
          </FieldGroup>

          <FieldGroup label="Host URL" error={fieldErrors.hostUrl}>
            <input value={form.hostUrl} onChange={(e) => update('hostUrl', e.target.value)}
              placeholder="e.g., http://localhost:5174/views/credit-blotter" style={inputStyle} />
          </FieldGroup>

          {/* Icon */}
          <FieldGroup label="Icon">
            <button onClick={() => setIconPickerOpen(!iconPickerOpen)} style={{
              ...inputStyle, display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
            }}>
              <Icon icon={form.iconId} style={{ width: 16, height: 16, color: "var(--de-accent)" }} />
              <span style={{ fontSize: 12, color: "var(--de-text-secondary)" }}>{form.iconId}</span>
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
                      onClick={() => { update('iconId', `mkt:${name}`); setIconPickerOpen(false); }}
                      style={{
                        width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center",
                        background: form.iconId === `mkt:${name}` ? "var(--de-accent-dim)" : "transparent",
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

          {/* Type + SubType */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <FieldGroup label="Component Type" error={fieldErrors.componentType}>
              <input value={form.componentType} onChange={(e) => update('componentType', e.target.value)}
                placeholder="e.g., GRID" style={inputStyle} />
            </FieldGroup>
            <FieldGroup
              label="Component SubType"
              error={fieldErrors.componentSubType ?? singletonUniquenessError ?? undefined}
            >
              <input value={form.componentSubType} onChange={(e) => update('componentSubType', e.target.value)}
                placeholder="e.g., CREDIT" style={inputStyle} />
            </FieldGroup>
          </div>

          {/* ── v2: Hosting + Config ─────────────────────────── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <FieldGroup label="Hosting">
              <select value={form.type}
                onChange={(e) => update('type', e.target.value as 'internal' | 'external')}
                style={inputStyle}>
                <option value="internal">internal</option>
                <option value="external">external</option>
              </select>
            </FieldGroup>
            <FieldGroup label="Singleton">
              <select value={form.singleton ? 'yes' : 'no'}
                onChange={(e) => update('singleton', e.target.value === 'yes')}
                style={inputStyle}>
                <option value="no">no (spawn new)</option>
                <option value="yes">yes (focus existing)</option>
              </select>
            </FieldGroup>
          </div>

          <FieldGroup label="Uses host config service">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '8px 0' }}>
              <input type="checkbox" checked={form.usesHostConfig}
                onChange={(e) => update('usesHostConfig', e.target.checked)} />
              <span style={{ fontSize: 12, color: 'var(--de-text-secondary)' }}>
                Inherit appId + configServiceUrl from the host app
              </span>
            </label>
          </FieldGroup>

          <FieldGroup label="App ID" error={fieldErrors.appId}>
            <input value={form.appId}
              onChange={(e) => update('appId', e.target.value)}
              disabled={appIdLocked}
              placeholder="e.g., tradingApp1"
              style={{ ...inputStyle, opacity: appIdLocked ? 0.6 : 1 }} />
            {appIdLocked && (
              <div style={{ fontSize: 10, color: 'var(--de-text-tertiary)', marginTop: 4 }}>
                Inherited from host manifest
              </div>
            )}
          </FieldGroup>

          <FieldGroup label="Config Service URL" error={fieldErrors.configServiceUrl}>
            <input value={form.configServiceUrl}
              onChange={(e) => update('configServiceUrl', e.target.value)}
              disabled={configUrlLocked}
              placeholder={form.usesHostConfig ? '' : 'https://… (optional for self-contained externals)'}
              style={{ ...inputStyle, opacity: configUrlLocked ? 0.6 : 1 }} />
            {configUrlLocked && (
              <div style={{ fontSize: 10, color: 'var(--de-text-tertiary)', marginTop: 4 }}>
                Inherited from host manifest
              </div>
            )}
          </FieldGroup>

          {/* Config ID */}
          <FieldGroup label="Config ID" error={fieldErrors.configId}>
            <input
              value={form.configId}
              onChange={(e) => { update('configId', e.target.value); setConfigIdEdited(true); }}
              disabled={form.singleton}
              placeholder={form.singleton ? 'Derived from component type + subtype' : 'Auto-generated from type/subtype'}
              style={{ ...inputStyle, fontFamily: "var(--de-mono)", opacity: form.singleton ? 0.6 : 1 }}
            />
            {form.singleton && (
              <div style={{ fontSize: 10, color: 'var(--de-text-tertiary)', marginTop: 4 }}>
                Singleton configId is auto-derived and must be unique per appId
              </div>
            )}
          </FieldGroup>
        </div>

        {/* Footer */}
        <div style={{
          display: "flex", justifyContent: "flex-end", gap: 8,
          padding: "12px 24px", borderTop: "1px solid var(--de-border)",
          flexShrink: 0,
        }}>
          <button onClick={onCancel} style={cancelBtnStyle}>Cancel</button>
          <button onClick={handleSave} style={saveBtnStyle}
            disabled={!!singletonUniquenessError}>Save</button>
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

function toErrorMap(errors: ValidationError[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const e of errors) {
    if (!map[e.field]) map[e.field] = e.message;
  }
  return map;
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
