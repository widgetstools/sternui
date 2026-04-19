/**
 * Conditional Styling panel — master-detail rule editor.
 *
 * Left pane: rule list with enable toggle + priority ordering.
 * Right pane: rule editor — name, scope (row / cell[columns]), expression,
 * style (via <StyleEditor />), flash config, indicator icon, per-rule
 * value formatter.
 *
 * The panel writes directly to module state (no per-card draft). This
 * matches v3's pragmatic default: each rule is small enough that the grid
 * re-render cost of a keystroke is negligible, and auto-save's 300ms
 * debounce absorbs the write-out.
 */
import { useCallback, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useGridApi } from '../../hooks/useGridApi';
import { useModuleState } from '../../hooks/useModuleState';
import {
  Band,
  Caps,
  IconInput,
  ItemCard,
  Row,
  SharpBtn,
} from '../../ui/settings';
import { StyleEditor } from '../../ui/StyleEditor';
import { Switch } from '../../ui/shadcn/switch';
import { Textarea } from '../../ui/shadcn/textarea';
import type { SettingsPanelProps } from '../../platform/types';
import type {
  ConditionalRule,
  ConditionalStylingState,
  FlashTarget,
} from './state';
import { INDICATOR_ICONS } from './indicatorIcons';
import { toStyleEditorValue, fromStyleEditorValue } from './styleBridge';

const MODULE_ID = 'conditional-styling';

// ─── Panel ─────────────────────────────────────────────────────────────────

export function ConditionalStylingPanel(_props: SettingsPanelProps) {
  const [state, setState] = useModuleState<ConditionalStylingState>(MODULE_ID);
  const [selectedId, setSelectedId] = useState<string | null>(() => state.rules[0]?.id ?? null);

  const selected = state.rules.find((r) => r.id === selectedId) ?? null;

  const update = useCallback(
    (ruleId: string, patch: Partial<ConditionalRule>) => {
      setState((prev) => ({
        rules: prev.rules.map((r) => (r.id === ruleId ? { ...r, ...patch } : r)),
      }));
    },
    [setState],
  );

  const addRule = useCallback(() => {
    const id = `rule-${Date.now().toString(36)}`;
    const next: ConditionalRule = {
      id,
      name: 'New rule',
      enabled: true,
      priority: state.rules.length,
      scope: { type: 'cell', columns: [] },
      expression: 'x > 0',
      style: { light: {}, dark: {} },
    };
    setState((prev) => ({ rules: [...prev.rules, next] }));
    setSelectedId(id);
  }, [setState, state.rules.length]);

  const removeRule = useCallback((ruleId: string) => {
    setState((prev) => ({ rules: prev.rules.filter((r) => r.id !== ruleId) }));
    setSelectedId((cur) => (cur === ruleId ? null : cur));
  }, [setState]);

  return (
    <div className="gc-sheet gc-panel-conditional-styling" style={{ display: 'flex', height: '100%' }}>
      {/* Rule list */}
      <aside style={{
        width: 240,
        borderRight: '1px solid var(--ck-border)',
        overflowY: 'auto',
        display: 'flex', flexDirection: 'column',
      }}>
        <header style={{ display: 'flex', alignItems: 'center', padding: '10px 12px' }}>
          <Caps size={11} style={{ flex: 1 }}>Rules ({state.rules.length})</Caps>
          <SharpBtn variant="action" onClick={addRule} title="New rule" testId="cs-new-rule">
            <Plus size={12} strokeWidth={2.25} />
          </SharpBtn>
        </header>
        {state.rules.map((r) => {
          const active = r.id === selectedId;
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => setSelectedId(r.id)}
              data-testid={`cs-list-${r.id}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                width: '100%', textAlign: 'left',
                padding: '6px 12px',
                background: active ? 'var(--ck-card)' : 'transparent',
                color: active ? 'var(--ck-t0)' : 'var(--ck-t1)',
                border: 'none',
                borderLeft: active ? '2px solid var(--ck-green)' : '2px solid transparent',
                cursor: 'pointer',
                fontSize: 11,
                fontFamily: 'var(--ck-font-sans)',
              }}
            >
              <span style={{
                display: 'inline-block', width: 6, height: 6, borderRadius: 3,
                background: r.enabled ? 'var(--ck-green)' : 'var(--ck-t3)',
              }} />
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
              <span style={{ color: 'var(--ck-t3)', fontSize: 9 }}>
                {r.scope.type}
              </span>
            </button>
          );
        })}
      </aside>

      {/* Rule editor */}
      <section style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {selected ? (
          <RuleEditor
            rule={selected}
            onChange={(patch) => update(selected.id, patch)}
            onDelete={() => removeRule(selected.id)}
          />
        ) : (
          <div style={{ padding: 24, color: 'var(--ck-t3)' }}>
            Select a rule on the left, or press <strong>+</strong> to create one.
          </div>
        )}
      </section>
    </div>
  );
}

// ─── Rule editor ───────────────────────────────────────────────────────────

function RuleEditor({
  rule,
  onChange,
  onDelete,
}: {
  rule: ConditionalRule;
  onChange: (patch: Partial<ConditionalRule>) => void;
  onDelete: () => void;
}) {
  const columns = useColumnCatalog();
  const styleValue = useMemo(() => toStyleEditorValue(rule.style), [rule.style]);

  return (
    <ItemCard
      title={
        <span>
          {rule.name}
          <span style={{ fontSize: 10, color: 'var(--ck-t3)', fontWeight: 400, marginLeft: 8 }}>
            · {rule.scope.type}
          </span>
        </span>
      }
      onDelete={onDelete}
      testId={`cs-card-${rule.id}`}
    >
      <Band index="01" title="Identity">
        <Row label="Name" control={<IconInput value={rule.name} onCommit={(v) => onChange({ name: v || rule.name })} />} />
        <Row
          label="Enabled"
          control={<Switch checked={rule.enabled} onChange={(e) => onChange({ enabled: (e.target as HTMLInputElement).checked })} />}
        />
        <Row
          label="Priority"
          hint="Lower runs first"
          control={
            <IconInput
              value={String(rule.priority)}
              numeric
              onCommit={(v) => {
                const n = Number(v);
                if (Number.isFinite(n)) onChange({ priority: n });
              }}
            />
          }
        />
      </Band>

      <Band index="02" title="Scope">
        <Row
          label="Applies to"
          control={
            <div style={{ display: 'flex', gap: 6 }}>
              <SharpBtn
                variant={rule.scope.type === 'cell' ? 'action' : 'default'}
                onClick={() => onChange({ scope: rule.scope.type === 'cell' ? rule.scope : { type: 'cell', columns: [] } })}
              >Cells</SharpBtn>
              <SharpBtn
                variant={rule.scope.type === 'row' ? 'action' : 'default'}
                onClick={() => onChange({ scope: { type: 'row' } })}
              >Rows</SharpBtn>
            </div>
          }
        />
        {rule.scope.type === 'cell' && (
          <Row
            label="Columns"
            hint="Comma-separated colId list"
            control={
              <IconInput
                value={rule.scope.columns.join(', ')}
                onCommit={(raw) => {
                  const cols = raw.split(',').map((s) => s.trim()).filter(Boolean);
                  onChange({ scope: { type: 'cell', columns: cols } });
                }}
                placeholder={columns.slice(0, 3).join(', ') || 'colId, colId'}
              />
            }
          />
        )}
      </Band>

      <Band index="03" title="Expression">
        <Textarea
          value={rule.expression}
          onChange={(e) => onChange({ expression: e.target.value })}
          rows={3}
          style={{
            width: '100%',
            fontFamily: 'var(--ck-font-mono)',
            fontSize: 11,
            background: 'var(--ck-bg)',
            color: 'var(--ck-t0)',
            border: '1px solid var(--ck-border-hi)',
            borderRadius: 3,
            padding: 8,
          }}
          placeholder="x > 100 AND data.status === 'active'"
        />
      </Band>

      <StyleEditor
        value={styleValue}
        onChange={(patch) => {
          const nextValue = { ...styleValue, ...patch };
          onChange({ style: fromStyleEditorValue(rule.style, nextValue) });
        }}
        sections={['text', 'color', 'border', 'format']}
        dataType="number"
        startIndex={4}
      />

      <Band index="08" title="Flash & Indicator">
        <Row
          label="Flash on match"
          control={
            <Switch
              checked={!!rule.flash?.enabled}
              onChange={(e) => {
                const enabled = (e.target as HTMLInputElement).checked;
                if (!enabled) { onChange({ flash: undefined }); return; }
                const scopeType = rule.scope.type;
                const target: FlashTarget = scopeType === 'row' ? 'row' : 'cells';
                onChange({ flash: { enabled: true, target } });
              }}
            />
          }
        />
        {rule.flash?.enabled && rule.scope.type === 'cell' && (
          <Row
            label="Flash target"
            control={
              <select
                value={rule.flash.target}
                onChange={(e) => onChange({ flash: { ...rule.flash!, target: e.target.value as FlashTarget } })}
                style={{
                  height: 26, padding: '0 8px', fontSize: 11,
                  background: 'var(--ck-bg)', color: 'var(--ck-t0)',
                  border: '1px solid var(--ck-border-hi)', borderRadius: 2,
                }}
              >
                <option value="cells">Cells</option>
                <option value="headers">Headers</option>
                <option value="cells+headers">Cells + headers</option>
              </select>
            }
          />
        )}
        <Row
          label="Indicator icon"
          control={
            <select
              value={rule.indicator?.icon ?? ''}
              onChange={(e) => {
                const icon = e.target.value;
                if (!icon) { onChange({ indicator: undefined }); return; }
                onChange({ indicator: { ...(rule.indicator ?? {}), icon } });
              }}
              style={{
                height: 26, padding: '0 8px', fontSize: 11,
                background: 'var(--ck-bg)', color: 'var(--ck-t0)',
                border: '1px solid var(--ck-border-hi)', borderRadius: 2,
              }}
            >
              <option value="">— none —</option>
              {INDICATOR_ICONS.map((icon) => (
                <option key={icon.key} value={icon.key}>{icon.label}</option>
              ))}
            </select>
          }
        />
      </Band>

      <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
        <SharpBtn variant="danger" onClick={onDelete} testId="cs-delete">
          <Trash2 size={12} strokeWidth={2.25} /> Delete rule
        </SharpBtn>
      </div>
    </ItemCard>
  );
}

function useColumnCatalog(): string[] {
  const api = useGridApi();
  return useMemo(() => {
    if (!api) return [];
    return (api.getColumns() ?? []).map((c) => c.getColId());
  }, [api]);
}
