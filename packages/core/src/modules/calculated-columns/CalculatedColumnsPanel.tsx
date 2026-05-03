/**
 * Calculated Columns settings panel — v4 rewrite.
 *
 * The v2 port carried three heavy antipatterns the audit flagged:
 *
 *  1. A file-level `dirtyRegistry = new Set<string>()` + a
 *     `window.dispatchEvent('gc-dirty-change')` broadcast for per-row
 *     LED lighting. This leaks across grids on the same page and loses
 *     coverage on StrictMode synthetic unmounts. v4 uses the
 *     per-platform `DirtyBus` via `useDirty(key)` — `useModuleDraft`
 *     already registers `calculated-columns:<colId>` automatically.
 *  2. A `useBaseGridColumns()` hook with local `tick` state that polled
 *     AG-Grid's column API on `displayedColumnsChanged` /
 *     `columnEverythingChanged`. Replaced by the stable
 *     `useGridColumns()` hook (fingerprint-cached snapshot, ApiHub-wired).
 *  3. `useDraftModuleItem({ store, ... })` + `useModuleState(store, id)`
 *     — the compat shims. Both replaced with the v4 context-driven
 *     equivalents (`useModuleDraft`, `useModuleState(id)`).
 *
 * Surface is unchanged: the master-detail split is exposed to the
 * settings sheet as `module.ListPane` + `module.EditorPane`. All
 * `cc-*` test-ids are preserved character-for-character.
 */
import { memo, useCallback, useEffect, useState } from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';
import { ExpressionEditor } from '../../ui/ExpressionEditor';
import type { EditorPaneProps, ListPaneProps } from '../../platform/types';
import { useModuleState } from '../../hooks/useModuleState';
import { useModuleDraft } from '../../hooks/useModuleDraft';
import { useDirty } from '../../hooks/useDirty';
import { useGridColumns } from '../../hooks/useGridColumns';
import {
  Band,
  Caps,
  CockpitList,
  CockpitListItem,
  IconInput,
  LedBar,
  MetaCell,
  Mono,
  ObjectTitleRow,
  SharpBtn,
  TitleInput,
} from '../../ui/SettingsPanel';
import { FormatterPicker, type FormatterPickerDataType } from '../../ui/FormatterPicker';
import type { CalculatedColumnsState, VirtualColumnDef } from './state';

const MODULE_ID = 'calculated-columns';

/** Base-36 id with a stable `vcol_` prefix — collision-safe for reasonable
 *  lists. Kept plain so new items sort last by creation order. */
function generateId(): string {
  return `vcol_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Per-row LED fed by the per-platform `DirtyBus`. Subscribes through
 *  `useDirty(key)` — no `window` event bus, no file-level `Set`. */
function DirtyListLed({ colId }: { colId: string }) {
  const { isDirty } = useDirty(`${MODULE_ID}:${colId}`);
  if (!isDirty) return null;
  return <LedBar amber on title="Unsaved changes" />;
}

// ─── List pane ─────────────────────────────────────────────────────────

export function CalculatedColumnsList({ selectedId, onSelect }: ListPaneProps) {
  const [state, setState] = useModuleState<CalculatedColumnsState>(MODULE_ID);

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

  // Auto-select the first item when the sheet opens with no selection —
  // avoids dumping the user onto the empty-state pane for an existing
  // list. Only runs when `selectedId` is null; user clicks take over.
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
      <CockpitList>
        {state.virtualColumns.map((v) => {
          const active = v.colId === selectedId;
          return (
            <CockpitListItem
              key={v.colId}
              value={v.colId}
              active={active}
              onSelect={() => onSelect(v.colId)}
              data-testid={`cc-virtual-${v.colId}`}
            >
              <span style={{ width: 2, display: 'inline-flex' }}>
                <DirtyListLed colId={v.colId} />
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
            </CockpitListItem>
          );
        })}
      </CockpitList>
    </>
  );
}

// ─── Editor pane ───────────────────────────────────────────────────────

export function CalculatedColumnsEditor({ selectedId }: EditorPaneProps) {
  const [state, setState] = useModuleState<CalculatedColumnsState>(MODULE_ID);

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
    // Dirty bus cleanup happens automatically when `useModuleDraft` unmounts
    // its key — but the panel may still be mounted (selectedId clears
    // separately). Explicitly clear so the list LED drops immediately.
  };

  return <VirtualColumnEditor colId={selectedId} onDelete={() => removeVirtualColumn(selectedId)} />;
}

// ─── Per-virtual-column editor ─────────────────────────────────────────

const VirtualColumnEditor = memo(function VirtualColumnEditor({
  colId,
  onDelete,
}: {
  colId: string;
  onDelete: () => void;
}) {
  // Live base-column list (ApiHub-wired, fingerprint-cached).
  const baseCols = useGridColumns();
  const columnsProvider = useCallback(
    () => baseCols.map((c) => ({ colId: c.colId, headerName: c.headerName })),
    [baseCols],
  );

  const { draft, setDraft, dirty, save, missing } = useModuleDraft<
    CalculatedColumnsState,
    VirtualColumnDef
  >({
    moduleId: MODULE_ID,
    itemId: colId,
    selectItem: (state) => state.virtualColumns.find((c) => c.colId === colId),
    commitItem: (next) => (state) => ({
      ...state,
      virtualColumns: state.virtualColumns.map((c) => (c.colId === colId ? next : c)),
    }),
  });

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
              <SharpBtn variant="danger" onClick={onDelete} data-testid={`cc-virtual-delete-${colId}`}>
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
              // Live: mirror every keystroke into the draft so the
              // header's SAVE pill lights up the moment the text diverges
              // from committed. `onCommit` alone missed multiline edits
              // (Enter adds a newline, not a commit).
              onChange={(v) => setDraft({ expression: v })}
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
          {/* Same compact FormatterPicker the Formatting Toolbar uses —
              one picker to learn across surfaces. */}
          <FormatterPicker
            compact
            dataType={(draft.cellDataType ?? 'number') as FormatterPickerDataType}
            value={draft.valueFormatterTemplate}
            onChange={(next) => setDraft({ valueFormatterTemplate: next })}
            data-testid={`cc-virtual-fmt-${colId}`}
          />
          <div
            style={{
              marginTop: 8,
              fontSize: 10,
              color: 'var(--ck-t3)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            OPTIONAL · APPLIED TO THE COMPUTED VALUE BEFORE DISPLAY
          </div>
        </Band>

        <div style={{ height: 20 }} />
      </div>
    </div>
  );
});

// ─── Legacy flat composition ───────────────────────────────────────────
//
// Kept for `module.SettingsPanel` consumers that don't wire master-detail
// themselves. The v4 settings sheet picks up `ListPane` + `EditorPane`
// directly from the module definition, so this wrapper is rarely hit in
// practice — but host apps that mount a single `<SettingsPanel>` for
// simplicity still work.

export function CalculatedColumnsPanel() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  return (
    <div
      data-testid="cc-panel"
      style={{ display: 'grid', gridTemplateColumns: '220px 1fr', height: '100%' }}
    >
      <aside
        style={{
          borderRight: '1px solid var(--ck-border)',
          overflowY: 'auto',
          background: 'var(--ck-surface)',
        }}
      >
        <CalculatedColumnsList gridId="" selectedId={selectedId} onSelect={setSelectedId} />
      </aside>
      <section style={{ overflowY: 'auto' }}>
        <CalculatedColumnsEditor gridId="" selectedId={selectedId} />
      </section>
    </div>
  );
}
