import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ExpressionEngine,
  PropertySection,
  PropRow,
  PropSelect,
  PropNumber,
  PropText,
  PropColor,
  Button,
  Input,
  Switch,
} from '@grid-customizer/core';
import { Plus, Trash2 } from 'lucide-react';
import type { SettingsPanelProps } from '../../core/types';
import { useGridStore, useGridCore } from '../../ui/GridContext';
import { useModuleState } from '../../store/useModuleState';
import type { ConditionalRule, ConditionalStylingState } from './state';

/**
 * v2 SettingsPanel for the conditional-styling module.
 *
 * Adapted from the v1 panel (packages/core/src/modules/conditional-styling/
 * ConditionalStylingPanel.tsx) — same shape, same UX, but rewired against:
 *   - v2's `useModuleState(store, id)` (takes a store handle, not a context)
 *   - v2's `useGridStore` / `useGridCore` (the v2 GridProvider)
 *   - v2's column enumeration (live from `core.getGridApi()` directly,
 *     replacing v1's ColumnPickerMulti which couples to the v1 core context)
 *
 * No drafts. v2 has no draft layer — every edit lands in the live store and
 * the auto-save subscriber persists it on a 300ms debounce. This is a
 * deliberate simplification of v1's apply/discard flow.
 */

const engine = new ExpressionEngine();

function generateId(): string {
  return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// ─── Live column list (replaces v1's useGridColumns) ────────────────────────

interface GridColumnInfo {
  colId: string;
  headerName: string;
}

function useGridColumns(): GridColumnInfo[] {
  const core = useGridCore();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const api = core.getGridApi();
    if (!api) return;
    const handler = () => setTick((n) => n + 1);
    const events = ['displayedColumnsChanged', 'columnEverythingChanged'] as const;
    for (const evt of events) {
      try { api.addEventListener(evt, handler); } catch { /* */ }
    }
    return () => {
      for (const evt of events) {
        try { api.removeEventListener(evt, handler); } catch { /* */ }
      }
    };
  }, [core, tick]);

  return useMemo(() => {
    const api = core.getGridApi();
    if (!api) return [];
    try {
      const cols = api.getColumns?.() ?? [];
      return cols.map((c) => ({
        colId: c.getColId(),
        headerName: c.getColDef().headerName ?? c.getColId(),
      }));
    } catch {
      return [];
    }
    // tick is a render-trigger; deps are intentional
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [core, tick]);
}

// ─── Multi-select column picker (minimal, chip-style) ───────────────────────

const ColumnPickerMulti = memo(function ColumnPickerMulti({
  value,
  onChange,
  placeholder = 'Add columns…',
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const cols = useGridColumns();
  const remaining = cols.filter((c) => !value.includes(c.colId));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, minHeight: 22 }}>
        {value.length === 0 ? (
          <span style={{ fontSize: 10, color: 'var(--gc-text-dim)' }}>No columns selected</span>
        ) : (
          value.map((colId) => {
            const col = cols.find((c) => c.colId === colId);
            return (
              <span
                key={colId}
                className="gc-cs-col-chip"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '2px 6px',
                  borderRadius: 3,
                  border: '1px solid var(--gc-border)',
                  background: 'var(--gc-surface-hover)',
                  fontSize: 10,
                  fontFamily: 'var(--gc-font-mono)',
                  color: 'var(--gc-text)',
                }}
              >
                {col?.headerName ?? colId}
                <button
                  type="button"
                  onClick={() => onChange(value.filter((v) => v !== colId))}
                  style={{
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    color: 'var(--gc-text-dim)', padding: 0, lineHeight: 1, fontSize: 12,
                  }}
                  title="Remove"
                  aria-label={`Remove ${col?.headerName ?? colId}`}
                >
                  ×
                </button>
              </span>
            );
          })
        )}
      </div>
      {remaining.length > 0 && (
        <select
          className="gc-cs-col-add"
          value=""
          onChange={(e) => {
            const id = e.target.value;
            if (id) onChange([...value, id]);
          }}
          style={{
            width: '100%',
            background: 'var(--gc-surface)',
            color: 'var(--gc-text)',
            border: '1px solid var(--gc-border)',
            borderRadius: 3,
            padding: '4px 6px',
            fontSize: 11,
          }}
          aria-label={placeholder}
        >
          <option value="">{placeholder}</option>
          {remaining.map((c) => (
            <option key={c.colId} value={c.colId}>{c.headerName}</option>
          ))}
        </select>
      )}
    </div>
  );
});

// ─── Inline rule editor ─────────────────────────────────────────────────────

const RuleEditor = memo(function RuleEditor({
  rule,
  onUpdate,
}: {
  rule: ConditionalRule;
  onUpdate: (patch: Partial<ConditionalRule>) => void;
}) {
  const [expression, setExpression] = useState(rule.expression);
  const exprRef = useRef(rule.expression);

  // Keep local state in sync if the underlying rule changes from elsewhere
  // (e.g., another panel edits the same rule).
  useEffect(() => {
    if (rule.expression !== exprRef.current) {
      setExpression(rule.expression);
      exprRef.current = rule.expression;
    }
  }, [rule.expression]);

  const commitExpression = useCallback(() => {
    if (expression !== exprRef.current) {
      exprRef.current = expression;
      onUpdate({ expression });
    }
  }, [expression, onUpdate]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') commitExpression();
  };

  return (
    <div data-testid="cs-rule-editor">
      <PropertySection title="Rule Configuration" defaultOpen>
        <PropRow label="Name">
          <PropText value={rule.name} onChange={(v) => onUpdate({ name: v })} width={200} />
        </PropRow>
        <PropRow label="Scope">
          <PropSelect
            value={rule.scope.type}
            onChange={(v) => {
              const scopeType = v as 'cell' | 'row';
              onUpdate({
                scope: scopeType === 'row' ? { type: 'row' } : { type: 'cell', columns: [] },
              });
            }}
            options={[
              { value: 'cell', label: 'Cell (specific columns)' },
              { value: 'row', label: 'Entire Row' },
            ]}
          />
        </PropRow>
        {rule.scope.type === 'cell' && (
          <PropRow label="Target Columns" vertical>
            <ColumnPickerMulti
              value={rule.scope.columns ?? []}
              onChange={(cols) => onUpdate({ scope: { type: 'cell', columns: cols } })}
            />
          </PropRow>
        )}
        <PropRow label="Expression" vertical>
          <Input
            className="font-mono text-[10px]"
            value={expression}
            onChange={(e) => setExpression(e.target.value)}
            onBlur={commitExpression}
            onKeyDown={handleKeyDown}
            placeholder="x >= 1000"
            error={!engine.validate(expression).valid}
            style={{ width: '100%' }}
            data-testid="cs-rule-expression-input"
          />
          <div style={{ fontSize: 10, color: 'var(--gc-text-dim)', marginTop: 4 }}>
            Use <code style={{ fontFamily: 'var(--gc-font-mono)' }}>x</code> for cell value,{' '}
            <code style={{ fontFamily: 'var(--gc-font-mono)' }}>{'data.field'}</code> for row data
          </div>
        </PropRow>
        <PropRow label="Priority">
          <PropNumber
            value={rule.priority}
            onChange={(n) => onUpdate({ priority: Math.max(0, Math.min(100, n)) })}
            min={0}
            max={100}
          />
        </PropRow>
      </PropertySection>

      <PropertySection title="Appearance" defaultOpen>
        <PropRow label="Light Theme BG">
          <PropColor
            value={rule.style.light.backgroundColor}
            onChange={(v) =>
              onUpdate({ style: { ...rule.style, light: { ...rule.style.light, backgroundColor: v } } })
            }
          />
        </PropRow>
        <PropRow label="Dark Theme BG">
          <PropColor
            value={rule.style.dark.backgroundColor}
            onChange={(v) =>
              onUpdate({ style: { ...rule.style, dark: { ...rule.style.dark, backgroundColor: v } } })
            }
          />
        </PropRow>
        <PropRow label="Text Color">
          <PropColor
            value={rule.style.light.color}
            onChange={(v) =>
              onUpdate({
                style: {
                  light: { ...rule.style.light, color: v },
                  dark: { ...rule.style.dark, color: v },
                },
              })
            }
          />
        </PropRow>
        <PropRow label="Font Weight">
          <PropSelect
            value={rule.style.light.fontWeight ?? 'normal'}
            onChange={(v) => {
              const fw = v === 'normal' ? undefined : v;
              onUpdate({
                style: {
                  light: { ...rule.style.light, fontWeight: fw },
                  dark: { ...rule.style.dark, fontWeight: fw },
                },
              });
            }}
            options={[
              { value: 'normal', label: 'Normal' },
              { value: '500', label: 'Medium' },
              { value: '600', label: 'Semibold' },
              { value: '700', label: 'Bold' },
            ]}
          />
        </PropRow>
      </PropertySection>
    </div>
  );
});

// ─── Top-level panel ────────────────────────────────────────────────────────

export function ConditionalStylingPanel(_props: SettingsPanelProps) {
  const store = useGridStore();
  const [state, setState] = useModuleState<ConditionalStylingState>(store, 'conditional-styling');
  const [editingId, setEditingId] = useState<string | null>(null);

  const addRule = useCallback(() => {
    const newRule: ConditionalRule = {
      id: generateId(),
      name: 'New Rule',
      enabled: true,
      priority: state.rules.length,
      scope: { type: 'cell', columns: [] },
      expression: 'x > 0',
      style: {
        light: { backgroundColor: 'rgba(16,185,129,0.12)' },
        dark: { backgroundColor: 'rgba(33,184,164,0.15)' },
      },
    };
    setState((prev) => ({ ...prev, rules: [...prev.rules, newRule] }));
    setEditingId(newRule.id);
  }, [state.rules.length, setState]);

  const updateRule = useCallback(
    (ruleId: string, patch: Partial<ConditionalRule>) => {
      setState((prev) => ({
        ...prev,
        rules: prev.rules.map((r) => (r.id === ruleId ? { ...r, ...patch } : r)),
      }));
    },
    [setState],
  );

  const removeRule = useCallback(
    (ruleId: string) => {
      setState((prev) => ({
        ...prev,
        rules: prev.rules.filter((r) => r.id !== ruleId),
      }));
      setEditingId((cur) => (cur === ruleId ? null : cur));
    },
    [setState],
  );

  const editingRule = editingId ? state.rules.find((r) => r.id === editingId) ?? null : null;

  return (
    <div data-testid="cs-panel">
      <div className="gc-section">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 12,
          }}
        >
          <div
            className="gc-section-title"
            style={{ margin: 0, border: 'none', paddingBottom: 0 }}
          >
            Styling Rules ({state.rules.length})
          </div>
          <Button
            variant="default"
            size="sm"
            onClick={addRule}
            data-testid="cs-add-rule-btn"
          >
            <Plus size={12} strokeWidth={1.75} /> Add Rule
          </Button>
        </div>

        {state.rules.length === 0 ? (
          <div className="gc-empty">
            No conditional styling rules configured.
            <br />
            Add a rule to apply dynamic styles based on cell values.
          </div>
        ) : (
          state.rules.map((rule) => {
            const validation = engine.validate(rule.expression);
            return (
              <div
                key={rule.id}
                className="gc-rule-card"
                style={{ cursor: 'pointer' }}
                data-testid={`cs-rule-card-${rule.id}`}
                onClick={() => setEditingId(editingId === rule.id ? null : rule.id)}
              >
                <div className="gc-rule-card-header">
                  <Switch
                    checked={rule.enabled}
                    onChange={(e) => {
                      e.stopPropagation();
                      updateRule(rule.id, { enabled: !rule.enabled });
                    }}
                    onClick={(e) => e.stopPropagation()}
                    style={{ transform: 'scale(0.85)' }}
                  />
                  <div className="gc-rule-card-title">{rule.name}</div>
                  <div
                    className="gc-color-swatch"
                    style={{
                      background:
                        rule.style.dark.backgroundColor ??
                        rule.style.light.backgroundColor ??
                        '#666',
                    }}
                  />
                  {!validation.valid && (
                    <span style={{ fontSize: 10, color: 'var(--gc-danger)' }}>Error</span>
                  )}
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeRule(rule.id);
                    }}
                    data-testid={`cs-rule-delete-${rule.id}`}
                    title="Delete rule"
                  >
                    <Trash2 size={12} strokeWidth={1.75} />
                  </Button>
                </div>
                <div className="gc-rule-card-body">
                  <code style={{ fontFamily: 'var(--gc-font-mono)', fontSize: 11 }}>
                    {rule.expression}
                  </code>
                  <span
                    style={{ marginLeft: 8, fontSize: 10, color: 'var(--gc-text-dim)' }}
                  >
                    {rule.scope.type === 'row'
                      ? 'Row'
                      : `${rule.scope.columns?.length ?? 0} columns`}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {editingRule && (
        <RuleEditor
          key={editingId}
          rule={editingRule}
          onUpdate={(patch) => updateRule(editingRule.id, patch)}
        />
      )}
    </div>
  );
}
