/**
 * Calculated Columns panel — master-detail editor for virtual columns.
 *
 * Left pane lists every virtual column with a + button. Right pane edits
 * colId / headerName / expression / valueFormatterTemplate / dataType /
 * initialWidth / initialHide / initialPinned. Expression editor is a
 * CSP-safe Textarea (Monaco upgrade can land later behind an "Advanced…"
 * affordance).
 */
import { useCallback, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useModuleState } from '../../hooks/useModuleState';
import {
  Band,
  Caps,
  IconInput,
  ItemCard,
  Row,
  SharpBtn,
} from '../../ui/settings';
import { FormatterPicker, type FormatterPickerDataType } from '../../ui/FormatterPicker';
import { Switch } from '../../ui/shadcn/switch';
import { Textarea } from '../../ui/shadcn/textarea';
import type { SettingsPanelProps } from '../../platform/types';
import type { CalculatedColumnsState, VirtualColumnDef } from './state';

const MODULE_ID = 'calculated-columns';

export function CalculatedColumnsPanel(_props: SettingsPanelProps) {
  const [state, setState] = useModuleState<CalculatedColumnsState>(MODULE_ID);
  const [selectedId, setSelectedId] = useState<string | null>(
    () => state.virtualColumns[0]?.colId ?? null,
  );

  const selected = state.virtualColumns.find((v) => v.colId === selectedId) ?? null;

  const update = useCallback(
    (colId: string, patch: Partial<VirtualColumnDef>) => {
      setState((prev) => ({
        virtualColumns: prev.virtualColumns.map((v) =>
          v.colId === colId ? { ...v, ...patch, colId: patch.colId ?? v.colId } : v,
        ),
      }));
      if (patch.colId && patch.colId !== colId) setSelectedId(patch.colId);
    },
    [setState],
  );

  const add = useCallback(() => {
    const colId = `calc-${Date.now().toString(36)}`;
    const next: VirtualColumnDef = {
      colId,
      headerName: 'New calc column',
      expression: '[value] * 1',
      initialWidth: 120,
    };
    setState((prev) => ({ virtualColumns: [...prev.virtualColumns, next] }));
    setSelectedId(colId);
  }, [setState]);

  const remove = useCallback((colId: string) => {
    setState((prev) => ({
      virtualColumns: prev.virtualColumns.filter((v) => v.colId !== colId),
    }));
    setSelectedId((cur) => (cur === colId ? null : cur));
  }, [setState]);

  return (
    <div className="gc-sheet gc-panel-calculated-columns" style={{ display: 'flex', height: '100%' }}>
      <aside style={{
        width: 240,
        borderRight: '1px solid var(--ck-border)',
        overflowY: 'auto',
        display: 'flex', flexDirection: 'column',
      }}>
        <header style={{ display: 'flex', alignItems: 'center', padding: '10px 12px' }}>
          <Caps size={11} style={{ flex: 1 }}>Calc columns ({state.virtualColumns.length})</Caps>
          <SharpBtn variant="action" onClick={add} title="Add calculated column" testId="cc-new-calc">
            <Plus size={12} strokeWidth={2.25} />
          </SharpBtn>
        </header>
        {state.virtualColumns.map((v) => {
          const active = v.colId === selectedId;
          return (
            <button
              key={v.colId}
              type="button"
              onClick={() => setSelectedId(v.colId)}
              data-testid={`cc-list-${v.colId}`}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
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
              <div>{v.headerName}</div>
              <div style={{ fontSize: 9, color: 'var(--ck-t3)', fontFamily: 'var(--ck-font-mono)' }}>
                {v.colId}
              </div>
            </button>
          );
        })}
      </aside>

      <section style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {selected ? (
          <Editor
            column={selected}
            onChange={(patch) => update(selected.colId, patch)}
            onDelete={() => remove(selected.colId)}
          />
        ) : (
          <div style={{ padding: 24, color: 'var(--ck-t3)' }}>
            Select a calculated column on the left, or press <strong>+</strong> to create one.
          </div>
        )}
      </section>
    </div>
  );
}

function Editor({
  column,
  onChange,
  onDelete,
}: {
  column: VirtualColumnDef;
  onChange: (patch: Partial<VirtualColumnDef>) => void;
  onDelete: () => void;
}) {
  return (
    <ItemCard
      title={<span>{column.headerName} <span style={{ fontSize: 10, color: 'var(--ck-t3)', fontWeight: 400 }}>· {column.colId}</span></span>}
      onDelete={onDelete}
      testId={`cc-card-${column.colId}`}
    >
      <Band index="01" title="Identity">
        <Row
          label="colId"
          hint="Unique. Must not collide with a data field."
          control={<IconInput value={column.colId} onCommit={(v) => onChange({ colId: v || column.colId })} />}
        />
        <Row
          label="Header name"
          control={<IconInput value={column.headerName} onCommit={(v) => onChange({ headerName: v || column.headerName })} />}
        />
      </Band>

      <Band index="02" title="Expression">
        <Textarea
          value={column.expression}
          onChange={(e) => onChange({ expression: e.target.value })}
          rows={4}
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
          placeholder="[price] * [quantity]"
        />
      </Band>

      <Band index="03" title="Layout">
        <Row
          label="Initial width"
          control={
            <IconInput
              value={column.initialWidth === undefined ? '' : String(column.initialWidth)}
              numeric
              suffix="px"
              onCommit={(raw) => {
                if (!raw.trim()) { onChange({ initialWidth: undefined }); return; }
                const n = Number(raw);
                if (Number.isFinite(n) && n > 0) onChange({ initialWidth: n });
              }}
            />
          }
        />
        <Row
          label="Initial pinned"
          control={
            <select
              value={column.initialPinned ?? ''}
              onChange={(e) => onChange({ initialPinned: (e.target.value || undefined) as 'left' | 'right' | undefined })}
              style={{
                height: 26, padding: '0 8px', fontSize: 11,
                background: 'var(--ck-bg)', color: 'var(--ck-t0)',
                border: '1px solid var(--ck-border-hi)', borderRadius: 2,
              }}
            >
              <option value="">—</option>
              <option value="left">Left</option>
              <option value="right">Right</option>
            </select>
          }
        />
        <Row
          label="Initial hide"
          control={
            <Switch
              checked={!!column.initialHide}
              onChange={(e) => onChange({ initialHide: (e.target as HTMLInputElement).checked || undefined })}
            />
          }
        />
      </Band>

      <Band index="04" title="Format">
        <Row
          label="Data type"
          control={
            <select
              value={column.cellDataType ?? 'number'}
              onChange={(e) => onChange({ cellDataType: e.target.value as VirtualColumnDef['cellDataType'] })}
              style={{
                height: 26, padding: '0 8px', fontSize: 11,
                background: 'var(--ck-bg)', color: 'var(--ck-t0)',
                border: '1px solid var(--ck-border-hi)', borderRadius: 2,
              }}
            >
              <option value="number">Number</option>
              <option value="currency">Currency</option>
              <option value="percent">Percent</option>
              <option value="date">Date</option>
              <option value="datetime">Datetime</option>
              <option value="string">String</option>
              <option value="boolean">Boolean</option>
            </select>
          }
        />
        <div style={{ padding: '8px 0' }}>
          <FormatterPicker
            value={column.valueFormatterTemplate}
            onChange={(next) => onChange({ valueFormatterTemplate: next })}
            dataType={(column.cellDataType ?? 'number') as FormatterPickerDataType}
          />
        </div>
      </Band>

      <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
        <SharpBtn variant="danger" onClick={onDelete} testId="cc-delete">
          <Trash2 size={12} strokeWidth={2.25} /> Delete column
        </SharpBtn>
      </div>
    </ItemCard>
  );
}
