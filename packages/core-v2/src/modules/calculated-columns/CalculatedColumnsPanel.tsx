import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';
import { ExpressionEditor } from '@grid-customizer/core';
import type { EditorPaneProps, ListPaneProps } from '../../core/types';
import { useGridCore, useGridStore } from '../../ui/GridContext';
import { useDraftModuleItem } from '../../store/useDraftModuleItem';
import { useModuleState } from '../../store/useModuleState';
import {
  Band,
  Caps,
  IconInput,
  LedBar,
  MetaCell,
  Mono,
  ObjectTitleRow,
  SharpBtn,
  TitleInput,
} from '../../ui/SettingsPanel';
import type { CalculatedColumnsState, VirtualColumnDef } from './state';

/**
 * Calculated Columns — Cockpit master-detail panel.
 *
 * Splits into:
 *   - `CalculatedColumnsList`  (items rail of virtual columns)
 *   - `CalculatedColumnsEditor` (selected column editor)
 *
 * Legacy `CalculatedColumnsPanel` remains as a fallback composition.
 */

function generateId(): string {
  return `vcol_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

interface BaseGridColumnInfo {
  colId: string;
  headerName: string;
}

function useBaseGridColumns(): BaseGridColumnInfo[] {
  const core = useGridCore();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const api = core.getGridApi();
    if (!api) return;
    const handler = () => setTick((n) => n + 1);
    const events = ['displayedColumnsChanged', 'columnEverythingChanged'] as const;
    for (const evt of events) {
      try {
        api.addEventListener(evt, handler);
      } catch {
        /* */
      }
    }
    return () => {
      for (const evt of events) {
        try {
          api.removeEventListener(evt, handler);
        } catch {
          /* */
        }
      }
    };
  }, [core]);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [core, tick]);
}

// ─── Dirty broadcast (module-local) ──────────────────────────────────────────

const dirtyRegistry = new Set<string>();
function setDirty(moduleId: string, itemId: string, value: boolean) {
  const key = `${moduleId}:${itemId}`;
  const before = dirtyRegistry.has(key);
  if (value) dirtyRegistry.add(key);
  else dirtyRegistry.delete(key);
  if (before !== value) window.dispatchEvent(new CustomEvent('gc-dirty-change'));
}
function isDirty(moduleId: string, itemId: string): boolean {
  return dirtyRegistry.has(`${moduleId}:${itemId}`);
}

function DirtyListLed({ itemId }: { itemId: string }) {
  const [dirty, setDirtyState] = useState<boolean>(() => isDirty('calculated-columns', itemId));
  useEffect(() => {
    const handler = () => setDirtyState(isDirty('calculated-columns', itemId));
    window.addEventListener('gc-dirty-change', handler);
    return () => window.removeEventListener('gc-dirty-change', handler);
  }, [itemId]);
  if (!dirty) return null;
  return <LedBar amber on title="Unsaved changes" />;
}

// ─── List pane ───────────────────────────────────────────────────────────────

export function CalculatedColumnsList({ selectedId, onSelect }: ListPaneProps) {
  const store = useGridStore();
  const [state, setState] = useModuleState<CalculatedColumnsState>(store, 'calculated-columns');

  const addVirtualColumn = useCallback(() => {
    const id = generateId();
    setState((prev) => ({
      ...prev,
      virtualColumns: [
        ...prev.virtualColumns,
        {
          colId: id,
          headerName: 'New Column',
          expression: '',
          position: prev.virtualColumns.length,
        },
      ],
    }));
    onSelect(id);
  }, [setState, onSelect]);

  useEffect(() => {
    if (!selectedId && state.virtualColumns.length > 0) {
      onSelect(state.virtualColumns[0].colId);
    }
  }, [selectedId, state.virtualColumns, onSelect]);

  return (
    <>
      <div className="gc-popout-list-header">
        <Caps size={11}>Columns</Caps>
        <Mono color="var(--ck-t3)" size={11}>
          {String(state.virtualColumns.length).padStart(2, '0')}
        </Mono>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          onClick={addVirtualColumn}
          title="Add virtual column"
          data-testid="cc-add-virtual-btn"
          style={{
            width: 22,
            height: 22,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--ck-green-bg)',
            color: 'var(--ck-green)',
            border: '1px solid var(--ck-green-dim)',
            borderRadius: 2,
            cursor: 'pointer',
            padding: 0,
          }}
        >
          <Plus size={11} strokeWidth={2.5} />
        </button>
      </div>
      <ul className="gc-popout-list-items">
        {state.virtualColumns.map((v) => {
          const active = v.colId === selectedId;
          return (
            <li key={v.colId}>
              <button
                type="button"
                className="gc-popout-list-item"
                aria-selected={active}
                onClick={() => onSelect(v.colId)}
                data-testid={`cc-virtual-${v.colId}`}
              >
                <span style={{ width: 2, display: 'inline-flex' }}>
                  <DirtyListLed itemId={v.colId} />
                </span>
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {v.headerName || '(unnamed)'}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

// ─── Editor pane ─────────────────────────────────────────────────────────────

export function CalculatedColumnsEditor({ selectedId }: EditorPaneProps) {
  const store = useGridStore();
  const [state, setState] = useModuleState<CalculatedColumnsState>(store, 'calculated-columns');

  if (!selectedId) {
    return (
      <div style={{ padding: '32px 24px' }}>
        <Caps size={10} style={{ marginBottom: 8, display: 'block' }}>
          No column selected
        </Caps>
        <div style={{ fontSize: 12, color: 'var(--ck-t2)' }}>
          Select a virtual column from the list, or press <Mono size={11}>+</Mono> to add one.
        </div>
      </div>
    );
  }

  if (!state.virtualColumns.some((v) => v.colId === selectedId)) return null;

  const removeVirtualColumn = (colId: string) => {
    setState((prev) => ({
      ...prev,
      virtualColumns: prev.virtualColumns.filter((c) => c.colId !== colId),
    }));
    setDirty('calculated-columns', colId, false);
  };

  return <VirtualColumnEditor colId={selectedId} onDelete={() => removeVirtualColumn(selectedId)} />;
}

const VirtualColumnEditor = memo(function VirtualColumnEditor({
  colId,
  onDelete,
}: {
  colId: string;
  onDelete: () => void;
}) {
  const store = useGridStore();
  const baseCols = useBaseGridColumns();
  const columnsProvider = useCallback(
    () => baseCols.map((c) => ({ colId: c.colId, headerName: c.headerName })),
    [baseCols],
  );

  const { draft, setDraft, dirty, save, missing } = useDraftModuleItem<
    CalculatedColumnsState,
    VirtualColumnDef
  >({
    store,
    moduleId: 'calculated-columns',
    selectItem: (state) => state.virtualColumns.find((c) => c.colId === colId),
    commitItem: (next) => (state) => ({
      ...state,
      virtualColumns: state.virtualColumns.map((c) => (c.colId === colId ? next : c)),
    }),
  });

  useEffect(() => {
    setDirty('calculated-columns', colId, dirty);
    return () => setDirty('calculated-columns', colId, false);
  }, [colId, dirty]);

  if (missing || !draft) return null;

  return (
    <div
      data-testid={`cc-virtual-editor-${colId}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      <div className="gc-editor-header">
      <ObjectTitleRow
        title={
          <TitleInput
            value={draft.headerName}
            onChange={(e) => setDraft({ headerName: e.target.value })}
            placeholder="Column header"
            data-testid={`cc-virtual-header-${colId}`}
          />
        }
        actions={
          <>
            <SharpBtn
              variant={dirty ? 'action' : 'ghost'}
              disabled={!dirty}
              onClick={save}
              data-testid={`cc-virtual-save-${colId}`}
            >
              <Save size={13} strokeWidth={2} /> SAVE
            </SharpBtn>
            <SharpBtn variant="danger" onClick={onDelete}>
              <Trash2 size={13} strokeWidth={2} /> DELETE
            </SharpBtn>
          </>
        }
      />
      </div>

      <div className="gc-editor-scroll">
      <div className="gc-meta-grid">
        <MetaCell
          label="COLUMN ID"
          value={
            <IconInput
              value={draft.colId}
              onCommit={(v) => setDraft({ colId: v })}
              monospace
              data-testid={`cc-virtual-colid-${colId}`}
            />
          }
        />
        <MetaCell label="REFS" value={<Mono color="var(--ck-t0)">{baseCols.length} cols</Mono>} />
        <MetaCell
          label="FORMATTER"
          value={
            <Mono color={draft.valueFormatterTemplate ? 'var(--ck-amber)' : 'var(--ck-t3)'}>
              {draft.valueFormatterTemplate ? 'SET' : '—'}
            </Mono>
          }
        />
        <MetaCell
          label="WIDTH"
          value={<Mono>{draft.initialWidth ? `${draft.initialWidth}px` : 'AUTO'}</Mono>}
        />
      </div>

      <Band index="01" title="EXPRESSION">
        <div
          style={{
            border: '1px solid var(--ck-border)',
            borderRadius: 2,
            background: 'var(--ck-bg)',
            overflow: 'hidden',
          }}
        >
          <ExpressionEditor
            value={draft.expression}
            onCommit={(v) => setDraft({ expression: v })}
            multiline
            lines={3}
            fontSize={12}
            placeholder="[price] * [quantity]"
            columnsProvider={columnsProvider}
            data-testid={`cc-virtual-expr-${colId}`}
          />
        </div>
      </Band>

      <Band index="02" title="VALUE FORMATTER">
        <div
          style={{
            border: '1px solid var(--ck-border)',
            borderRadius: 2,
            background: 'var(--ck-bg)',
            overflow: 'hidden',
          }}
        >
          <ExpressionEditor
            value={draft.valueFormatterTemplate ?? ''}
            onCommit={(v) => setDraft({ valueFormatterTemplate: v || undefined })}
            multiline
            lines={2}
            fontSize={12}
            placeholder="CONCAT('$', ROUND(x, 2))"
            columnsProvider={columnsProvider}
            data-testid={`cc-virtual-fmt-${colId}`}
          />
        </div>
        <div style={{ marginTop: 8, fontSize: 10, color: 'var(--ck-t3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          OPTIONAL · RECEIVES COMPUTED VALUE AS <code style={{ fontFamily: 'var(--ck-font-mono)', color: 'var(--ck-t1)', textTransform: 'none' }}>x</code>
        </div>
      </Band>

      <div style={{ height: 20 }} />
      </div>
    </div>
  );
});

// Legacy flat panel fallback
export function CalculatedColumnsPanel() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  return (
    <div data-testid="cc-panel" style={{ display: 'grid', gridTemplateColumns: '220px 1fr', height: '100%' }}>
      <aside style={{ borderRight: '1px solid var(--ck-border)', overflowY: 'auto', background: 'var(--ck-surface)' }}>
        <CalculatedColumnsList gridId="" selectedId={selectedId} onSelect={setSelectedId} />
      </aside>
      <section style={{ overflowY: 'auto' }}>
        <CalculatedColumnsEditor gridId="" selectedId={selectedId} />
      </section>
    </div>
  );
}
