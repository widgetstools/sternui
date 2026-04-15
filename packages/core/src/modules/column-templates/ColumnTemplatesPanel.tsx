import React, { useState, useCallback, useMemo } from 'react';
import type { SettingsPanelProps } from '../../types/module';
import type { ColumnTemplatesState } from './state';
import type { ColumnTemplate, CellStyleProperties } from '../../types/common';
import { useModuleState } from '../../stores/useModuleState';
import { useGridCustomizerStore } from '../../ui/GridCustomizerContext';
import { Icons } from '../../ui/icons';
import { TextField, SelectField, SwitchField } from '../../ui/FormFields';
import { ColumnPickerMulti } from '../../ui/ColumnPicker';
import { Button } from '../../ui/shadcn/button';
import { Input } from '../../ui/shadcn/input';
import { Select } from '../../ui/shadcn/select';

function generateId(): string {
  return `tpl_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// ─── Shared styles ───────────────────────────────────────────────────────────

const S: Record<string, React.CSSProperties> = {
  panel: { background: 'var(--gc-surface)', borderRadius: 'var(--gc-radius)', border: '1px solid var(--gc-border)', overflow: 'hidden', marginTop: 8 },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', cursor: 'pointer', userSelect: 'none' as const, borderBottom: '1px solid var(--gc-border)' },
  headerLabel: { fontSize: 9, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em', color: 'var(--gc-text-muted)', display: 'flex', alignItems: 'center', gap: 6 },
  body: { padding: '8px 10px' },
  row: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 },
  label: { fontSize: 9, color: 'var(--gc-text-dim)', width: 28, flexShrink: 0, textAlign: 'right' as const },
  segmented: { display: 'flex', height: 28, borderRadius: 4, border: '1px solid var(--gc-border)', overflow: 'hidden' },
  segBtn: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gc-text-dim)', fontSize: 11, padding: '0 6px', transition: 'all 100ms', fontFamily: 'var(--gc-font)' },
  segBtnActive: { background: 'var(--gc-accent-muted)', color: 'var(--gc-accent)' },
  miniInput: { height: 28, flex: 1, minWidth: 0, padding: '6px 10px', background: 'var(--gc-bg)', border: '1px solid var(--gc-border)', borderRadius: 3, color: 'var(--gc-text)', fontSize: 11, fontFamily: 'var(--gc-font-mono)', outline: 'none' },
  colorRow: { display: 'flex', alignItems: 'center', gap: 6, height: 28 },
  colorWell: { width: 24, height: 24, borderRadius: 4, border: '1px solid var(--gc-border)', cursor: 'pointer', position: 'relative' as const, overflow: 'hidden', flexShrink: 0 },
  colorInput: { position: 'absolute' as const, inset: -4, width: 32, height: 32, cursor: 'pointer', opacity: 0 },
  divider: { height: 1, background: 'var(--gc-border)', margin: '6px 0' },
  sectionLabel: { fontSize: 9, fontWeight: 600, color: 'var(--gc-text-dim)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 6, marginTop: 2 },
  borderRow: { display: 'grid', gridTemplateColumns: '28px 24px 1fr 60px', gap: 4, alignItems: 'center', marginBottom: 4 },
};

// ─── Figma-Style StyleEditor ─────────────────────────────────────────────────

function InlineColor({ value, onChange, label }: { value: string | undefined; onChange: (v: string) => void; label: string }) {
  return (
    <div style={S.colorRow}>
      <span style={S.label}>{label}</span>
      <div style={{ ...S.colorWell, background: value || 'transparent' }}>
        <input type="color" style={S.colorInput} value={value || '#000000'} onChange={(e) => onChange(e.target.value)} />
      </div>
      <span style={{ fontSize: 9, fontFamily: 'var(--gc-font-mono)', color: 'var(--gc-text-dim)' }}>{value || '—'}</span>
    </div>
  );
}

function StyleEditor({ label, style, onChange }: { label: string; style: CellStyleProperties; onChange: (patch: Partial<CellStyleProperties>) => void }) {
  const [open, setOpen] = useState(false);
  const has = Object.values(style).some((v) => v !== undefined && v !== '');
  return (
    <div style={S.panel}>
      <div style={S.header} onClick={() => setOpen(!open)}>
        <div style={S.headerLabel}>
          <span style={{ fontSize: 9, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 120ms' }}>&#9654;</span>
          {label}
          {has && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--gc-accent)' }} />}
        </div>
        {has && <Button variant="link" size="xs" style={{ fontSize: 9, color: 'var(--gc-danger)' }}
          onClick={(e) => { e.stopPropagation(); onChange({ backgroundColor: undefined, color: undefined, fontWeight: undefined, fontStyle: undefined, fontSize: undefined, fontFamily: undefined, textAlign: undefined, textDecoration: undefined, borderTopColor: undefined, borderTopWidth: undefined, borderTopStyle: undefined, borderRightColor: undefined, borderRightWidth: undefined, borderRightStyle: undefined, borderBottomColor: undefined, borderBottomWidth: undefined, borderBottomStyle: undefined, borderLeftColor: undefined, borderLeftWidth: undefined, borderLeftStyle: undefined, paddingTop: undefined, paddingRight: undefined, paddingBottom: undefined, paddingLeft: undefined }); }}>Clear</Button>}
      </div>
      {open && (
        <div style={S.body}>
          <div style={S.sectionLabel}>Fill</div>
          <InlineColor label="BG" value={style.backgroundColor} onChange={(v) => onChange({ backgroundColor: v })} />
          <div style={S.divider} />
          <div style={S.sectionLabel}>Typography</div>
          <div style={S.row}><span style={S.label}>Sz</span>
            <Input style={{ height: 28, flex: 1, minWidth: 0 }} value={style.fontSize ?? ''} placeholder="11px" onChange={(e) => onChange({ fontSize: e.target.value || undefined })} />
            <Select style={{ maxWidth: 80 }} value={style.fontWeight ?? ''} onChange={(e) => onChange({ fontWeight: e.target.value || undefined })}>
              <option value="">—</option><option value="300">Light</option><option value="400">Regular</option><option value="500">Medium</option><option value="600">Semi</option><option value="700">Bold</option>
            </Select>
          </div>
          <InlineColor label="Fg" value={style.color} onChange={(v) => onChange({ color: v })} />
          <div style={{ ...S.row, marginTop: 4 }}><span style={S.label}></span>
            <div style={S.segmented}>
              {[{ v: 'italic', l: '𝐼' }, { v: 'underline', l: 'U̲' }, { v: 'line-through', l: 'S̶' }].map((o) => (
                <Button key={o.v} variant="ghost" style={{ ...S.segBtn, ...(style.fontStyle === o.v || style.textDecoration === o.v ? S.segBtnActive : {}) }}
                  onClick={() => { if (o.v === 'italic') onChange({ fontStyle: style.fontStyle === 'italic' ? undefined : 'italic' }); else onChange({ textDecoration: style.textDecoration === o.v ? undefined : o.v }); }}>{o.l}</Button>))}
            </div>
            <div style={S.segmented}>
              {[{ v: 'left', l: '≡' }, { v: 'center', l: '⩶' }, { v: 'right', l: '⫞' }].map((o) => (
                <Button key={o.v} variant="ghost" style={{ ...S.segBtn, ...(style.textAlign === o.v ? S.segBtnActive : {}) }}
                  onClick={() => onChange({ textAlign: style.textAlign === o.v ? undefined : o.v })}>{o.l}</Button>))}
            </div>
          </div>
          <div style={S.divider} />
          <div style={S.sectionLabel}>Stroke</div>
          {(['Top', 'Right', 'Bottom', 'Left'] as const).map((side) => {
            const wK = `border${side}Width` as keyof CellStyleProperties;
            const cK = `border${side}Color` as keyof CellStyleProperties;
            const sK = `border${side}Style` as keyof CellStyleProperties;
            const hasColor = !!(style[cK] as string);
            const hasWidth = !!(style[wK] as string);
            return (<div key={side} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span style={{ fontSize: 9, color: 'var(--gc-text-dim)', width: 14, textAlign: 'right', flexShrink: 0 }}>{side[0]}</span>
              {/* Color */}
              <label style={{
                width: 24, height: 24, borderRadius: 4, flexShrink: 0,
                border: '1px solid var(--gc-border)', cursor: 'pointer',
                background: (style[cK] as string) || '#313944',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                position: 'relative', overflow: 'hidden',
              }}>
                <input type="color"
                  value={(style[cK] as string) || '#313944'}
                  onChange={(e) => {
                    // Auto-set width to 1px if not already set, so border is visible
                    const patch: Record<string, string | undefined> = { [cK]: e.target.value };
                    if (!hasWidth) patch[wK] = '1px';
                    onChange(patch);
                  }}
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
                />
              </label>
              {/* Width */}
              <Select style={{ height: 28, fontSize: 9, flex: 1 }}
                value={(style[wK] as string) ?? ''}
                onChange={(e) => onChange({ [wK]: e.target.value || undefined })}>
                <option value="">None</option>
                <option value="1px">1px</option>
                <option value="2px">2px</option>
                <option value="3px">3px</option>
                <option value="4px">4px</option>
              </Select>
              {/* Style */}
              <Select style={{ height: 28, fontSize: 9, width: 60, flexShrink: 0 }}
                value={(style[sK] as string) ?? 'solid'}
                onChange={(e) => onChange({ [sK]: e.target.value || undefined })}>
                <option value="solid">Solid</option>
                <option value="dashed">Dash</option>
                <option value="dotted">Dot</option>
                <option value="double">Double</option>
              </Select>
            </div>);
          })}
        </div>
      )}
    </div>
  );
}

// ─── Predefined Value Formatters ─────────────────────────────────────────────

const VALUE_FORMATTER_PRESETS = [
  { value: '', label: 'None', desc: 'Raw value, no formatting' },
  // Number formats
  { value: 'NUMBER_INT', label: 'Integer', desc: '1,234', fmt: "new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(x)" },
  { value: 'NUMBER_1D', label: 'Number (1 dp)', desc: '1,234.5', fmt: "new Intl.NumberFormat('en-US',{minimumFractionDigits:1,maximumFractionDigits:1}).format(x)" },
  { value: 'NUMBER_2D', label: 'Number (2 dp)', desc: '1,234.56', fmt: "new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}).format(x)" },
  { value: 'NUMBER_3D', label: 'Number (3 dp)', desc: '1,234.567', fmt: "new Intl.NumberFormat('en-US',{minimumFractionDigits:3,maximumFractionDigits:3}).format(x)" },
  { value: 'NUMBER_4D', label: 'Number (4 dp)', desc: '1,234.5678', fmt: "new Intl.NumberFormat('en-US',{minimumFractionDigits:4,maximumFractionDigits:4}).format(x)" },
  // Currency
  { value: 'USD', label: 'USD Currency', desc: '$1,234.56', fmt: "new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(x)" },
  { value: 'EUR', label: 'EUR Currency', desc: '€1,234.56', fmt: "new Intl.NumberFormat('en-US',{style:'currency',currency:'EUR'}).format(x)" },
  { value: 'GBP', label: 'GBP Currency', desc: '£1,234.56', fmt: "new Intl.NumberFormat('en-US',{style:'currency',currency:'GBP'}).format(x)" },
  { value: 'JPY', label: 'JPY Currency', desc: '¥1,234', fmt: "new Intl.NumberFormat('en-US',{style:'currency',currency:'JPY'}).format(x)" },
  // Percentage
  { value: 'PERCENT', label: 'Percentage', desc: '12.34%', fmt: "new Intl.NumberFormat('en-US',{style:'percent',minimumFractionDigits:2}).format(x/100)" },
  { value: 'PERCENT_RAW', label: 'Percentage (raw)', desc: '0.1234 → 12.34%', fmt: "new Intl.NumberFormat('en-US',{style:'percent',minimumFractionDigits:2}).format(x)" },
  // Basis points
  { value: 'BPS', label: 'Basis Points', desc: '+12.5bp', fmt: "(x>=0?'+':'')+x.toFixed(1)+'bp'" },
  { value: 'BPS_INT', label: 'Basis Points (int)', desc: '+12bp', fmt: "(x>=0?'+':'')+Math.round(x)+'bp'" },
  // Date/Time
  { value: 'DATE', label: 'Date (MM/DD/YYYY)', desc: '04/10/2026', fmt: "new Date(x).toLocaleDateString('en-US')" },
  { value: 'DATE_ISO', label: 'Date (ISO)', desc: '2026-04-10', fmt: "new Date(x).toISOString().slice(0,10)" },
  { value: 'DATE_SHORT', label: 'Date (Short)', desc: 'Apr 10', fmt: "new Date(x).toLocaleDateString('en-US',{month:'short',day:'numeric'})" },
  { value: 'TIME', label: 'Time (HH:MM:SS)', desc: '14:30:00', fmt: "new Date(x).toLocaleTimeString('en-US',{hour12:false})" },
  { value: 'DATETIME', label: 'Date + Time', desc: '04/10 14:30', fmt: "new Date(x).toLocaleDateString('en-US',{month:'2-digit',day:'2-digit'})+' '+new Date(x).toLocaleTimeString('en-US',{hour12:false,hour:'2-digit',minute:'2-digit'})" },
  // Boolean
  { value: 'YES_NO', label: 'Yes / No', desc: 'true → Yes', fmt: "x?'Yes':'No'" },
  { value: 'CHECK', label: '✓ / ✗', desc: 'true → ✓', fmt: "x?'✓':'✗'" },
  // Custom
  { value: 'CUSTOM', label: 'Custom expression...', desc: 'Write your own' },
];

function ValueFormatterField({ value, onChange }: { value: string; onChange: (v: string | undefined) => void }) {
  // Determine which preset matches the current value
  const matchedPreset = VALUE_FORMATTER_PRESETS.find((p) => p.fmt === value);
  const isCustom = value && !matchedPreset;
  const [showCustom, setShowCustom] = useState(isCustom);

  const handlePresetChange = useCallback((presetValue: string) => {
    if (presetValue === '') {
      onChange(undefined);
      setShowCustom(false);
    } else if (presetValue === 'CUSTOM') {
      setShowCustom(true);
    } else {
      const preset = VALUE_FORMATTER_PRESETS.find((p) => p.value === presetValue);
      if (preset?.fmt) {
        onChange(preset.fmt);
        setShowCustom(false);
      }
    }
  }, [onChange]);

  const dropdownValue = matchedPreset?.value ?? (isCustom ? 'CUSTOM' : '');

  return (
    <div style={{ marginBottom: 6 }}>
      <div className="gc-field">
        <div className="gc-field-label">Value Formatter</div>
        <Select value={dropdownValue}
          onChange={(e) => handlePresetChange(e.target.value)}>
          {VALUE_FORMATTER_PRESETS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}{p.desc && p.value !== 'CUSTOM' ? ` — ${p.desc}` : ''}
            </option>
          ))}
        </Select>
      </div>
      {(showCustom || isCustom) && (
        <div style={{ marginTop: 4 }}>
          <TextField label="Expression" value={value} onChange={(v) => onChange(v || undefined)} mono placeholder="e.g. ROUND(x, 2)" />
          <div style={{ fontSize: 9, color: 'var(--gc-text-dim)', marginTop: 2, paddingLeft: 2 }}>
            <code style={{ fontFamily: 'var(--gc-font-mono)' }}>x</code> = cell value. Use JavaScript expressions or the expression engine.
          </div>
        </div>
      )}
      {matchedPreset && matchedPreset.value !== '' && matchedPreset.value !== 'CUSTOM' && (
        <div style={{ fontSize: 9, color: 'var(--gc-text-dim)', marginTop: 4, paddingLeft: 2 }}>
          Preview: <span style={{ fontFamily: 'var(--gc-font-mono)', color: 'var(--gc-accent)' }}>{matchedPreset.desc}</span>
        </div>
      )}
    </div>
  );
}

// ─── Template Editor ─────────────────────────────────────────────────────────

const TemplateEditor = React.memo(function TemplateEditor({
  template, columnCount, columnNames, onUpdate, onDelete, onBulkApply,
}: {
  template: ColumnTemplate; columnCount: number; columnNames: string[];
  onUpdate: (patch: Partial<ColumnTemplate>) => void;
  onDelete: () => void; onBulkApply: () => void;
}) {
  return (
    <div className="gc-section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div className="gc-section-title" style={{ margin: 0, border: 'none', paddingBottom: 0 }}>{template.name}</div>
        <div style={{ display: 'flex', gap: 4 }}>
          <Button variant="outline" size="sm" onClick={onBulkApply}>Apply to columns...</Button>
          <Button variant="ghost" size="icon-sm" style={{ color: 'var(--gc-danger)' }} onClick={onDelete}><Icons.Trash size={11} /></Button>
        </div>
      </div>
      <div style={{ fontSize: 9, color: 'var(--gc-text-dim)', marginBottom: columnNames.length > 0 ? 4 : 10 }}>
        Applied to {columnCount} column{columnCount !== 1 ? 's' : ''}
      </div>
      {columnNames.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
          {columnNames.map((n) => (
            <span key={n} style={{ padding: '1px 6px', borderRadius: 2, background: 'var(--gc-accent-muted)', color: 'var(--gc-accent)', fontSize: 9, fontWeight: 500 }}>{n}</span>
          ))}
        </div>
      )}

      {/* Identity */}
      <TextField label="Name" value={template.name} onChange={(v) => onUpdate({ name: v })} />
      <TextField label="Description" value={template.description ?? ''} onChange={(v) => onUpdate({ description: v || undefined })} placeholder="Optional" />

      <div style={{ height: 8 }} />

      {/* Behavior */}
      <div style={{ ...S.sectionLabel, marginTop: 8 }}>Behavior</div>
      <SelectField label="Cell Editor" value={template.cellEditorName ?? ''}
        onChange={(v) => onUpdate({ cellEditorName: v || undefined })}
        options={[{ value: '', label: 'Default' }, { value: 'agTextCellEditor', label: 'Text' }, { value: 'agSelectCellEditor', label: 'Select' }, { value: 'agRichSelectCellEditor', label: 'Rich Select' }, { value: 'agNumberCellEditor', label: 'Number' }, { value: 'agDateCellEditor', label: 'Date' }, { value: 'agCheckboxCellEditor', label: 'Checkbox' }]} />
      <TextField label="Cell Renderer" value={template.cellRendererName ?? ''} onChange={(v) => onUpdate({ cellRendererName: v || undefined })} placeholder="Custom renderer" />
      <ValueFormatterField value={template.valueFormatterTemplate ?? ''} onChange={(v) => onUpdate({ valueFormatterTemplate: v || undefined })} />
      <SwitchField label="Sortable" checked={template.sortable ?? true} onChange={(v) => onUpdate({ sortable: v })} />
      <SwitchField label="Filterable" checked={template.filterable ?? true} onChange={(v) => onUpdate({ filterable: v })} />
      <SwitchField label="Resizable" checked={template.resizable ?? true} onChange={(v) => onUpdate({ resizable: v })} />

      {/* Appearance */}
      <StyleEditor label="Header Style" style={template.headerStyle ?? {}} onChange={(patch) => onUpdate({ headerStyle: { ...template.headerStyle, ...patch } })} />
      <StyleEditor label="Cell Style" style={template.cellStyle ?? {}} onChange={(patch) => onUpdate({ cellStyle: { ...template.cellStyle, ...patch } })} />
    </div>
  );
});

// ─── Bulk Apply ──────────────────────────────────────────────────────────────

function BulkApply({ name, onApply, onClose }: { name: string; onApply: (ids: string[]) => void; onClose: () => void }) {
  const [cols, setCols] = useState<string[]>([]);
  return (
    <div className="gc-section">
      <div className="gc-section-title">Apply "{name}" to columns</div>
      <ColumnPickerMulti value={cols} onChange={setCols} placeholder="Select columns..." />
      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
        <Button variant="default" size="sm" disabled={cols.length === 0} onClick={() => { onApply(cols); onClose(); }}>
          Apply to {cols.length} column{cols.length !== 1 ? 's' : ''}
        </Button>
        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
      </div>
    </div>
  );
}

// ─── Main Panel ──────────────────────────────────────────────────────────────

export function ColumnTemplatesPanel({ gridId }: SettingsPanelProps) {
  const store = useGridCustomizerStore();
  const [state, setState] = useModuleState<ColumnTemplatesState>(store, 'column-templates');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [bulkId, setBulkId] = useState<string | null>(null);

  // Read column assignments to show usage counts and column names per template
  const colCustState = store.getState().modules['column-customization'] as any;
  const assignments: Record<string, { colId?: string; templateId?: string; templateIds?: string[]; headerName?: string }> = colCustState?.assignments ?? {};
  const { colCounts, colNames } = useMemo(() => {
    const counts: Record<string, number> = {};
    const names: Record<string, string[]> = {};
    for (const a of Object.values(assignments)) {
      const colName = a.headerName ?? a.colId ?? '?';
      // Check templateIds array (primary) and deprecated templateId
      const tplIds = a.templateIds ?? (a.templateId ? [a.templateId] : []);
      for (const tplId of tplIds) {
        counts[tplId] = (counts[tplId] ?? 0) + 1;
        if (!names[tplId]) names[tplId] = [];
        names[tplId].push(colName);
      }
    }
    return { colCounts: counts, colNames: names };
  }, [assignments]);

  const addTemplate = useCallback(() => {
    const id = generateId();
    setState((prev) => ({
      ...prev,
      templates: { ...prev.templates, [id]: { id, name: 'New Template', createdAt: Date.now(), updatedAt: Date.now() } },
    }));
    setEditingId(id);
  }, [setState]);

  const updateTemplate = useCallback((id: string, patch: Partial<ColumnTemplate>) => {
    setState((prev) => ({
      ...prev,
      templates: { ...prev.templates, [id]: { ...prev.templates[id], ...patch, updatedAt: Date.now() } },
    }));
  }, [setState]);

  const deleteTemplate = useCallback((id: string) => {
    setState((prev) => {
      const { [id]: _, ...rest } = prev.templates;
      return { ...prev, templates: rest };
    });
    // Also clear template references in column-customization module
    const colCustUpdate = store.getState().setModuleState;
    colCustUpdate('column-customization', (prev: any) => {
      const assignments = { ...prev.assignments };
      for (const [colId, a] of Object.entries(assignments) as [string, any][]) {
        if (a.templateId === id) assignments[colId] = { ...a, templateId: undefined };
      }
      return { ...prev, assignments };
    });
    if (editingId === id) setEditingId(null);
  }, [setState, store, editingId]);

  const bulkApply = useCallback((tplId: string, colIds: string[]) => {
    // Write to column-customization module's assignments
    store.getState().setModuleState('column-customization', (prev: any) => {
      const assignments = { ...prev.assignments };
      for (const colId of colIds) {
        assignments[colId] = { ...assignments[colId], colId, templateId: tplId };
      }
      return { ...prev, assignments };
    });
  }, [store]);

  const editingTpl = editingId ? state.templates[editingId] : null;
  const bulkTpl = bulkId ? state.templates[bulkId] : null;

  return (
    <div>
      <div className="gc-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <p style={{ fontSize: 9, color: 'var(--gc-text-dim)', margin: 0 }}>
            Reusable style templates. Create once, apply to many columns.
          </p>
          <Button variant="default" size="sm" onClick={addTemplate}>
            <Icons.Plus size={12} /> New
          </Button>
        </div>

        {Object.keys(state.templates).length === 0 ? (
          <div className="gc-empty">No templates. Create one to define reusable column styles.</div>
        ) : (
          Object.values(state.templates).map((tpl) => {
            const count = colCounts[tpl.id] ?? 0;
            const names = colNames[tpl.id] ?? [];
            return (
              <div key={tpl.id} className="gc-rule-card" style={{ cursor: 'pointer' }}
                onClick={() => setEditingId(editingId === tpl.id ? null : tpl.id)}>
                <div className="gc-rule-card-header">
                  <div className="gc-rule-card-title">{tpl.name}</div>
                  <span style={{ fontSize: 9, color: count > 0 ? 'var(--gc-accent)' : 'var(--gc-text-dim)', fontWeight: count > 0 ? 500 : 400 }}>
                    {count} column{count !== 1 ? 's' : ''}
                  </span>
                </div>
                {names.length > 0 && (
                  <div style={{ fontSize: 9, color: 'var(--gc-text-dim)', padding: '2px 10px 6px', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {names.map((n) => (
                      <span key={n} style={{ padding: '1px 6px', borderRadius: 2, background: 'var(--gc-accent-muted)', color: 'var(--gc-accent)', fontSize: 9 }}>{n}</span>
                    ))}
                  </div>
                )}
                {tpl.description && <div className="gc-rule-card-body">{tpl.description}</div>}
              </div>
            );
          })
        )}
      </div>

      {editingTpl && (
        <TemplateEditor key={editingId} template={editingTpl}
          columnCount={colCounts[editingTpl.id] ?? 0}
          columnNames={colNames[editingTpl.id] ?? []}
          onUpdate={(patch) => updateTemplate(editingTpl.id, patch)}
          onDelete={() => deleteTemplate(editingTpl.id)}
          onBulkApply={() => setBulkId(editingTpl.id)} />
      )}

      {bulkTpl && bulkId && (
        <BulkApply name={bulkTpl.name}
          onApply={(ids) => bulkApply(bulkId, ids)}
          onClose={() => setBulkId(null)} />
      )}
    </div>
  );
}
