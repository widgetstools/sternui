import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';
import {
  ExpressionEditor,
  ExpressionEngine,
  FormatColorPicker,
  FormatPopover,
  Select,
  Switch,
} from '@grid-customizer/core';
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
  PillToggleBtn,
  PillToggleGroup,
  SharpBtn,
  SubLabel,
  TitleInput,
} from '../../ui/SettingsPanel';
import { StyleEditor } from '../../ui/StyleEditor';
import { FormatterPicker, inferPickerDataType, type FormatterPickerDataType } from '../../ui/FormatterPicker';
import type {
  ConditionalRule,
  ConditionalStylingState,
  FlashTarget,
  IndicatorPosition,
  IndicatorTarget,
  RuleIndicator,
} from './state';
import { INDICATOR_ICONS, findIndicatorIcon } from './indicatorIcons';
import { fromStyleEditorValue, toStyleEditorValue } from './styleBridge';

/**
 * Conditional Styling — Cockpit Terminal master-detail panel.
 *
 * Export shape:
 *   - `ConditionalStylingList`  → rendered in the popout's items rail.
 *   - `ConditionalStylingEditor` → rendered in the popout's editor column.
 *
 * The sheet owns selection. Each card uses `useDraftModuleItem` for a
 * local draft + explicit Save; the list rail shows an amber LED on any
 * dirty rule.
 *
 * `ConditionalStylingPanel` (legacy flat composition) is kept so host
 * apps that still mount the old shell don't break.
 */

const engine = new ExpressionEngine();

function generateId(): string {
  return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// ─── Grid column enumeration ─────────────────────────────────────────────────

interface GridColumnInfo {
  colId: string;
  headerName: string;
  /** AG-Grid cellDataType when known — used by FormatterPicker to pick
   *  the right preset bucket for single-cell rules. */
  cellDataType?: string;
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
      return cols.map((c) => {
        const def = c.getColDef();
        const rawType = (def as { cellDataType?: unknown }).cellDataType;
        return {
          colId: c.getColId(),
          headerName: def.headerName ?? c.getColId(),
          cellDataType: typeof rawType === 'string' ? rawType : undefined,
        };
      });
    } catch {
      return [];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [core, tick]);
}

// ─── Column chip picker ──────────────────────────────────────────────────────

const ColumnPickerMulti = memo(function ColumnPickerMulti({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const cols = useGridColumns();
  const remaining = cols.filter((c) => !value.includes(c.colId));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, minHeight: 24 }}>
        {value.length === 0 ? (
          <span
            role="alert"
            data-testid="cs-no-columns-warning"
            style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--ck-amber)',
              background: 'var(--ck-amber-bg)',
              border: '1px solid var(--ck-amber)',
              borderRadius: 2,
              padding: '4px 8px',
              fontFamily: 'var(--ck-font-sans)',
            }}
          >
            NO COLUMNS · RULE WON'T APPLY
          </span>
        ) : (
          value.map((colId) => {
            const col = cols.find((c) => c.colId === colId);
            return (
              <span
                key={colId}
                data-v2-chip=""
                className="gc-cs-col-chip"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '3px 6px',
                  borderRadius: 2,
                  background: 'var(--ck-card)',
                  border: '1px solid var(--ck-border)',
                  fontFamily: 'var(--ck-font-mono)',
                  fontSize: 11,
                  color: 'var(--ck-t0)',
                }}
              >
                {col?.headerName ?? colId}
                <button
                  type="button"
                  onClick={() => onChange(value.filter((v) => v !== colId))}
                  title="Remove"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--ck-t2)',
                    padding: 0,
                    lineHeight: 1,
                    fontSize: 12,
                  }}
                >
                  ×
                </button>
              </span>
            );
          })
        )}
      </div>
      {remaining.length > 0 && (
        <Select
          className="gc-cs-col-add"
          value=""
          onChange={(e) => {
            const v = e.target.value;
            if (v) onChange([...value, v]);
          }}
        >
          <option value="">ADD COLUMN…</option>
          {remaining.map((c) => (
            <option key={c.colId} value={c.colId}>
              {c.headerName}
            </option>
          ))}
        </Select>
      )}
    </div>
  );
});

// ─── List pane ──────────────────────────────────────────────────────────────

export function ConditionalStylingList({ selectedId, onSelect }: ListPaneProps) {
  const store = useGridStore();
  const [state, setState] = useModuleState<ConditionalStylingState>(store, 'conditional-styling');

  const addRule = useCallback(() => {
    const newRule: ConditionalRule = {
      id: generateId(),
      name: 'New Rule',
      enabled: true,
      priority: state.rules.length,
      scope: { type: 'row' },
      expression: 'true',
      style: { light: {}, dark: {} },
    };
    setState((prev) => ({ ...prev, rules: [...prev.rules, newRule] }));
    onSelect(newRule.id);
  }, [state.rules.length, setState, onSelect]);

  // Auto-select the first rule when nothing is selected and the list is
  // non-empty — keeps the editor pane populated instead of an empty state.
  useEffect(() => {
    if (!selectedId && state.rules.length > 0) {
      onSelect(state.rules[0].id);
    }
  }, [selectedId, state.rules, onSelect]);

  return (
    <>
      <div className="gc-popout-list-header">
        <Caps size={11}>Rules</Caps>
        <Mono color="var(--ck-t3)" size={11}>
          {String(state.rules.length).padStart(2, '0')}
        </Mono>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          onClick={addRule}
          title="Add rule"
          data-testid="cs-add-rule-btn"
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
      <ul className="gc-popout-list-items" data-testid="cs-rules-list">
        {state.rules.map((r) => (
          <RuleRow
            key={r.id}
            rule={r}
            active={r.id === selectedId}
            onSelect={() => onSelect(r.id)}
          />
        ))}
      </ul>
    </>
  );
}

const RuleRow = memo(function RuleRow({
  rule,
  active,
  onSelect,
}: {
  rule: ConditionalRule;
  active: boolean;
  onSelect: () => void;
}) {
  const store = useGridStore();
  // Check dirty state without subscribing to every keystroke; peek the
  // store-level committed value only. Dirty-LED reactivity is good-enough
  // even if slightly delayed vs per-row subscription.
  const [state] = useModuleState<ConditionalStylingState>(store, 'conditional-styling');
  const committed = state.rules.find((r) => r.id === rule.id);
  const dirty = false; // committed === rule's on-store snapshot; dirty only
  //              shows while the EDITOR has a pending draft — and that
  //              signal lives in the editor pane, not the list. Keep the
  //              LED slot here so the layout doesn't reflow; the editor
  //              will light it via a shared listener (added below).
  void committed;
  void dirty;

  return (
    <li>
      <button
        type="button"
        className="gc-popout-list-item"
        aria-selected={active}
        data-muted={rule.enabled ? 'false' : 'true'}
        onClick={onSelect}
        data-testid={`cs-rule-card-${rule.id}`}
      >
        <span style={{ width: 2, display: 'inline-flex' }}>
          <DirtyListLed moduleId="conditional-styling" itemId={rule.id} />
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
          {rule.name}
        </span>
      </button>
    </li>
  );
});

/** Dirty-LED probe for the items list. Reads a dirty-map broadcast the
 *  editor pane publishes through a lightweight event. */
function DirtyListLed({ moduleId, itemId }: { moduleId: string; itemId: string }) {
  const [dirty, setDirty] = useState<boolean>(() => isDirty(moduleId, itemId));
  useEffect(() => {
    const handler = () => setDirty(isDirty(moduleId, itemId));
    window.addEventListener('gc-dirty-change', handler);
    return () => window.removeEventListener('gc-dirty-change', handler);
  }, [moduleId, itemId]);
  if (!dirty) return null;
  return <LedBar amber on title="Unsaved changes" />;
}

// ─── Dirty broadcaster (panel-global) ────────────────────────────────────────
//
// Tiny global registry: maps `${moduleId}:${itemId}` to a boolean. The
// editor pane writes into it on every draft change; the list pane reads
// via the `gc-dirty-change` event. Kept lightweight (no zustand store,
// no context) because the set is always small.

const dirtyRegistry = new Set<string>();
function setDirty(moduleId: string, itemId: string, value: boolean) {
  const key = `${moduleId}:${itemId}`;
  const before = dirtyRegistry.has(key);
  if (value) dirtyRegistry.add(key);
  else dirtyRegistry.delete(key);
  if (before !== value) {
    window.dispatchEvent(new CustomEvent('gc-dirty-change'));
  }
}
function isDirty(moduleId: string, itemId: string): boolean {
  return dirtyRegistry.has(`${moduleId}:${itemId}`);
}

// ─── Editor pane ────────────────────────────────────────────────────────────

export function ConditionalStylingEditor({ selectedId }: EditorPaneProps) {
  const store = useGridStore();
  const [state, setState] = useModuleState<ConditionalStylingState>(store, 'conditional-styling');

  if (!selectedId) {
    return (
      <div style={{ padding: '32px 24px' }}>
        <Caps size={10} style={{ marginBottom: 8, display: 'block' }}>
          No rule selected
        </Caps>
        <div style={{ fontSize: 12, color: 'var(--ck-t2)' }}>
          Select a rule from the list, or press <Mono size={11}>+</Mono> to add one.
        </div>
      </div>
    );
  }

  // Guard against the selection pointing at a deleted rule.
  if (!state.rules.some((r) => r.id === selectedId)) {
    return null;
  }

  const removeRule = (ruleId: string) => {
    setState((prev) => ({ ...prev, rules: prev.rules.filter((r) => r.id !== ruleId) }));
    setDirty('conditional-styling', ruleId, false);
  };

  return <RuleEditor ruleId={selectedId} onDelete={() => removeRule(selectedId)} />;
}

const RuleEditor = memo(function RuleEditor({
  ruleId,
  onDelete,
}: {
  ruleId: string;
  onDelete: () => void;
}) {
  const store = useGridStore();
  const columns = useGridColumns();
  // Stable ref so Monaco's completion provider isn't re-registered on
  // every render. The editor re-reads via the latest-value ref pattern.
  const columnsProvider = useCallback(
    () => columns.map((c) => ({ colId: c.colId, headerName: c.headerName })),
    [columns],
  );
  const { draft, setDraft, dirty, save, missing } = useDraftModuleItem<
    ConditionalStylingState,
    ConditionalRule
  >({
    store,
    moduleId: 'conditional-styling',
    selectItem: (state) => state.rules.find((r) => r.id === ruleId),
    commitItem: (next) => (state) => ({
      ...state,
      rules: state.rules.map((r) => (r.id === ruleId ? next : r)),
    }),
  });

  // Publish dirty state so the list LED updates.
  useEffect(() => {
    setDirty('conditional-styling', ruleId, dirty);
    return () => setDirty('conditional-styling', ruleId, false);
  }, [ruleId, dirty]);

  if (missing || !draft) return null;

  const validation = engine.validate(draft.expression);
  const appliedCount = draft.enabled ? 132 : 0; // placeholder — grid hook can supply real count

  return (
    <div
      data-testid="cs-rule-editor"
      data-rule-testid={`cs-rule-editor-${ruleId}`}
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
            value={draft.name}
            onChange={(e) => setDraft({ name: e.target.value })}
            placeholder="Rule name"
            data-testid={`cs-rule-name-${ruleId}`}
          />
        }
        actions={
          <>
            <SharpBtn
              variant={dirty ? 'action' : 'ghost'}
              disabled={!dirty}
              onClick={save}
              data-testid={`cs-rule-save-${ruleId}`}
            >
              <Save size={13} strokeWidth={2} /> SAVE
            </SharpBtn>
            <SharpBtn
              variant="danger"
              onClick={onDelete}
              data-testid={`cs-rule-delete-${ruleId}`}
            >
              <Trash2 size={13} strokeWidth={2} /> DELETE
            </SharpBtn>
          </>
        }
      />
      </div>

      <div className="gc-editor-scroll">
      {/* Meta strip */}
      <div className="gc-meta-grid">
        <MetaCell
          label="STATUS"
          value={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <LedBar on={draft.enabled} />
              <Switch
                checked={draft.enabled}
                onChange={(e) => setDraft({ enabled: e.target.checked })}
              />
              <Mono color={draft.enabled ? 'var(--ck-green)' : 'var(--ck-t2)'}>
                {draft.enabled ? 'ACTIVE' : 'MUTED'}
              </Mono>
            </span>
          }
        />
        <MetaCell
          label="SCOPE"
          value={
            <Select
              value={draft.scope.type}
              onChange={(e) => {
                const v = e.target.value;
                const next = v === 'row' ? { type: 'row' as const } : { type: 'cell' as const, columns: [] };
                // Flash target is scope-constrained: row-scope → 'row',
                // cell-scope → 'cells' | 'headers' | 'cells+headers'.
                // Flip the target when the scope flips so the stored config
                // never becomes invalid.
                const nextFlash = draft.flash
                  ? {
                      ...draft.flash,
                      target:
                        v === 'row'
                          ? ('row' as FlashTarget)
                          : draft.flash.target === 'row'
                            ? ('cells' as FlashTarget)
                            : draft.flash.target,
                    }
                  : undefined;
                setDraft({ scope: next, flash: nextFlash });
              }}
              style={{ width: '100%', height: 28, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase' }}
            >
              <option value="cell">CELL</option>
              <option value="row">ROW</option>
            </Select>
          }
        />
        <MetaCell
          label="PRIORITY"
          value={
            <IconInput
              numeric
              value={String(draft.priority)}
              onCommit={(v) => {
                const n = Number(v);
                if (Number.isFinite(n)) setDraft({ priority: Math.max(0, Math.min(100, Math.round(n))) });
              }}
              data-testid={`cs-rule-priority-${ruleId}`}
            />
          }
        />
        <MetaCell
          label="APPLIED"
          value={<Mono color="var(--ck-amber)">{appliedCount} rows</Mono>}
        />
      </div>

      {/* 01 — EXPRESSION */}
      <Band index="01" title="EXPRESSION">
        <div
          style={{
            border: `1px solid var(${!validation.valid ? '--ck-red' : '--ck-border'})`,
            borderRadius: 2,
            background: 'var(--ck-bg)',
            overflow: 'hidden',
          }}
        >
          <ExpressionEditor
            value={draft.expression}
            // Live: mirror every keystroke into the draft so the card's
            // SAVE pill lights up as soon as the text diverges from the
            // committed value. Previously only blur / Ctrl+Enter fed
            // the draft — typing a new predicate in the multiline
            // editor left SAVE looking dead until the user explicitly
            // committed. Wiring `onChange` closes the gap.
            onChange={(v) => setDraft({ expression: v })}
            onCommit={(v) => setDraft({ expression: v })}
            multiline
            lines={3}
            fontSize={12}
            placeholder="[price] > 110"
            columnsProvider={columnsProvider}
            data-testid={`cs-rule-expression-${ruleId}`}
          />
        </div>
        <div
          style={{
            marginTop: 8,
            fontSize: 10,
            color: 'var(--ck-t3)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}
        >
          TYPE <code style={{ fontFamily: 'var(--ck-font-mono)', color: 'var(--ck-t1)', textTransform: 'none' }}>[</code> FOR COLUMNS · <code style={{ fontFamily: 'var(--ck-font-mono)', color: 'var(--ck-t1)', textTransform: 'none' }}>⌘↵</code> TO SAVE · USE <code style={{ fontFamily: 'var(--ck-font-mono)', color: 'var(--ck-t1)', textTransform: 'none' }}>data.field</code> FOR RAW
        </div>
        {!validation.valid && validation.errors[0]?.message && (
          <div
            style={{
              marginTop: 8,
              fontSize: 11,
              color: 'var(--ck-red)',
              background: 'var(--ck-red-bg)',
              border: '1px solid var(--ck-red)',
              borderRadius: 2,
              padding: '6px 8px',
              fontFamily: 'var(--ck-font-mono)',
            }}
          >
            {validation.errors[0].message}
          </div>
        )}
      </Band>

      {/* Target columns (only for cell scope) */}
      {draft.scope.type === 'cell' && (
        <Band index="02" title="TARGET COLUMNS">
          <ColumnPickerMulti
            value={draft.scope.columns ?? []}
            onChange={(cols) => setDraft({ scope: { type: 'cell', columns: cols } })}
          />
        </Band>
      )}

      {/* 03… — shared StyleEditor (automatically continues numbering).
          `format` dropped: the value-formatter for a rule now lives in
          its own Band below (`draft.valueFormatter`) which the
          resolver wires through `transformColumnDefs`. The StyleEditor's
          legacy FormatSection never persisted a formatter into
          conditional-styling's state shape (styleBridge ignored it),
          so removing it is a strict behaviour fix, not a regression. */}
      <StyleEditor
        value={toStyleEditorValue(draft.style)}
        onChange={(patch) => {
          const merged = { ...toStyleEditorValue(draft.style), ...patch };
          setDraft({ style: fromStyleEditorValue(draft.style, merged) });
        }}
        sections={['text', 'color', 'border']}
        dataType="number"
        data-testid={`cs-rule-style-editor-${ruleId}`}
      />

      {/* FLASH — fires AG-Grid's flashCells API on matching cell-value
          changes. Row-scope rules can only flash the row; cell-scope
          rules can flash cells, headers, or both. */}
      <Band index="07" title="FLASH ON MATCH">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Switch
            checked={Boolean(draft.flash?.enabled)}
            onChange={(e) => {
              const enabled = e.target.checked;
              if (!enabled) {
                // Disable — keep the rest of the flash config so re-enabling
                // restores the previous target.
                setDraft({
                  flash: draft.flash ? { ...draft.flash, enabled: false } : undefined,
                });
                return;
              }
              const defaultTarget: FlashTarget = draft.scope.type === 'row' ? 'row' : 'cells';
              setDraft({
                flash: {
                  enabled: true,
                  target: draft.flash?.target ?? defaultTarget,
                  flashDuration: draft.flash?.flashDuration,
                  fadeDuration: draft.flash?.fadeDuration,
                },
              });
            }}
            data-testid={`cs-rule-flash-enabled-${ruleId}`}
          />
          <Mono color={draft.flash?.enabled ? 'var(--ck-green)' : 'var(--ck-t2)'} size={11}>
            {draft.flash?.enabled ? 'ON' : 'OFF'}
          </Mono>

          {/* Target picker */}
          {draft.flash?.enabled && draft.scope.type === 'cell' && (
            <>
              <SubLabel>TARGET</SubLabel>
              <PillToggleGroup>
                {(
                  [
                    ['cells', 'CELLS'],
                    ['headers', 'HEADERS'],
                    ['cells+headers', 'BOTH'],
                  ] as ReadonlyArray<[FlashTarget, string]>
                ).map(([value, label]) => (
                  <PillToggleBtn
                    key={value}
                    active={draft.flash?.target === value}
                    onClick={() =>
                      setDraft({
                        flash: {
                          enabled: true,
                          target: value,
                          flashDuration: draft.flash?.flashDuration,
                          fadeDuration: draft.flash?.fadeDuration,
                        },
                      })
                    }
                    style={{
                      height: 24,
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: '0.06em',
                      padding: '0 10px',
                      minWidth: 56,
                    }}
                    data-testid={`cs-rule-flash-target-${value}-${ruleId}`}
                  >
                    {label}
                  </PillToggleBtn>
                ))}
              </PillToggleGroup>
            </>
          )}
          {draft.flash?.enabled && draft.scope.type === 'row' && (
            <Caps size={10} color="var(--ck-t2)">
              TARGETS ENTIRE ROW
            </Caps>
          )}
        </div>
        <div style={{ marginTop: 8 }}>
          <Caps size={9} color="var(--ck-t3)">
            Flashes AG-Grid's built-in highlight when a cell value change causes this rule to match.
          </Caps>
        </div>
      </Band>

      {/* INDICATOR — small top-right badge drawn on every matching cell
          (and matching headers) as a `::before` SVG. Opt-in per rule:
          an off selection clears `indicator` entirely so the persisted
          state stays lean. */}
      <Band index="08" title="INDICATOR">
        <IndicatorPicker
          value={draft.indicator}
          onChange={(next) => setDraft({ indicator: next })}
          ruleId={ruleId}
        />
      </Band>

      {/* VALUE FORMATTER — available ONLY when the rule targets exactly
          one cell (single cell-scope column). The picker's dataType is
          inferred from the target column's cellDataType so preset
          filtering makes sense for number / currency / date columns. */}
      {draft.scope.type === 'cell' && draft.scope.columns.length === 1 ? (
        <Band index="09" title="VALUE FORMATTER">
          <FormatterPicker
            dataType={inferPickerDataType(
              columns.find(
                (c) =>
                  c.colId === (draft.scope.type === 'cell' ? draft.scope.columns[0] : ''),
              )?.cellDataType,
            ) as FormatterPickerDataType}
            value={draft.valueFormatter}
            onChange={(next) => setDraft({ valueFormatter: next })}
            data-testid={`cs-rule-value-formatter-${ruleId}`}
          />
          <div style={{ marginTop: 8 }}>
            <Caps size={9} color="var(--ck-t3)">
              Applied to cells where this rule matches — overrides the column's own formatter.
            </Caps>
          </div>
        </Band>
      ) : draft.scope.type === 'cell' ? (
        <Band index="09" title="VALUE FORMATTER">
          <Caps size={10} color="var(--ck-t2)">
            Select exactly ONE target column above to set a per-rule value formatter.
          </Caps>
        </Band>
      ) : null}

      <div style={{ height: 20 }} />
      </div>
    </div>
  );
});

// ─── IndicatorPicker ───────────────────────────────────────────────────────
//
// Curated icon grid (clickable preview swatches) + a colour-picker
// trigger + a "no indicator" clear pill. Renders the live lucide icon
// at button size so the user can see exactly what's about to paint on
// every matching cell.

const INDICATOR_GROUP_LABELS: Record<string, string> = {
  direction: 'Direction',
  alert: 'Alert',
  status: 'Status',
  lifecycle: 'Lifecycle',
  favorite: 'Favorite',
  classification: 'Classification',
};

/**
 * Render the inline SVG for an indicator icon def directly. Avoids
 * pulling every possible lucide-react component into the bundle just
 * to preview the curated list — we already own the icon bodies.
 */
function IndicatorIconPreview({
  iconKey,
  color = 'currentColor',
  size = 14,
}: {
  iconKey: string;
  color?: string;
  size?: number;
}) {
  const def = findIndicatorIcon(iconKey);
  if (!def) return null;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke={color}
      strokeWidth={2.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: def.body.replaceAll('currentColor', color) }}
    />
  );
}

function IndicatorPicker({
  value,
  onChange,
  ruleId,
}: {
  value: RuleIndicator | undefined;
  onChange: (next: RuleIndicator | undefined) => void;
  ruleId: string;
}) {
  const groups = useMemo(() => {
    const grouped: Record<string, Array<(typeof INDICATOR_ICONS)[number]>> = {};
    for (const i of INDICATOR_ICONS) {
      (grouped[i.group] ??= []).push(i);
    }
    return grouped;
  }, []);

  const color = value?.color || '#f59e0b';
  const currentTarget: IndicatorTarget = value?.target ?? 'cells+headers';
  const currentPosition: IndicatorPosition = value?.position ?? 'top-right';

  /** Tiny helper so every pill updates the indicator without nuking the
   *  other fields — we only ever patch one dimension at a time. */
  const patch = (next: Partial<RuleIndicator>) => {
    if (!value?.icon) return;
    onChange({ ...value, ...next });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Top bar: current selection + clear */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span
          aria-label="Current indicator"
          style={{
            width: 28,
            height: 28,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid var(--ck-border-hi)',
            borderRadius: 2,
            background: 'var(--ck-bg)',
          }}
        >
          {value?.icon ? (
            <IndicatorIconPreview iconKey={value.icon} color={color} size={14} />
          ) : (
            <Caps size={9} color="var(--ck-t3)">
              NONE
            </Caps>
          )}
        </span>
        <Caps size={10} color="var(--ck-t2)">
          {value?.icon ? findIndicatorIcon(value.icon)?.label ?? value.icon : 'No indicator'}
        </Caps>

        <span style={{ flex: 1 }} />

        {/* Colour swatch — shared FormatColorPicker via popover. Same
            trigger pattern as the BorderStyleEditor so the app stays
            on a single colour-picking surface everywhere. */}
        {value?.icon && (
          <FormatPopover
            width={240}
            trigger={
              <button
                type="button"
                title="Indicator colour"
                data-testid={`cs-rule-indicator-color-${ruleId}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '2px 8px 2px 2px',
                  background: 'var(--ck-bg, var(--background))',
                  border: '1px solid var(--ck-border-hi, var(--border))',
                  borderRadius: 2,
                  height: 28,
                  cursor: 'pointer',
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 18,
                    height: 18,
                    background: color,
                    border: '1px solid var(--ck-border-hi, var(--border))',
                    borderRadius: 2,
                    display: 'inline-block',
                  }}
                />
                <Caps size={9} color="var(--ck-t2)">
                  {color.startsWith('#') ? color.toUpperCase() : 'COLOR'}
                </Caps>
              </button>
            }
          >
            <FormatColorPicker
              value={color}
              onChange={(c) => {
                if (c) onChange({ ...(value as RuleIndicator), color: c });
              }}
              allowClear={false}
            />
          </FormatPopover>
        )}

        <button
          type="button"
          onClick={() => onChange(undefined)}
          disabled={!value?.icon}
          style={{
            height: 28,
            padding: '0 10px',
            background: 'transparent',
            border: '1px solid var(--ck-border-hi)',
            borderRadius: 2,
            color: value?.icon ? 'var(--ck-red, var(--destructive))' : 'var(--ck-t3)',
            cursor: value?.icon ? 'pointer' : 'default',
            fontFamily: 'var(--ck-font-sans)',
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            opacity: value?.icon ? 1 : 0.5,
          }}
          data-testid={`cs-rule-indicator-clear-${ruleId}`}
        >
          CLEAR
        </button>
      </div>

      {/* Target + Position — only meaningful when an icon is picked */}
      {value?.icon && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <SubLabel>TARGET</SubLabel>
            <PillToggleGroup>
              {(
                [
                  ['cells', 'CELLS'],
                  ['headers', 'HEADERS'],
                  ['cells+headers', 'BOTH'],
                ] as ReadonlyArray<[IndicatorTarget, string]>
              ).map(([v, label]) => (
                <PillToggleBtn
                  key={v}
                  active={currentTarget === v}
                  onClick={() => patch({ target: v })}
                  style={{
                    height: 24,
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: '0.06em',
                    padding: '0 10px',
                    minWidth: 56,
                  }}
                  data-testid={`cs-rule-indicator-target-${v}-${ruleId}`}
                >
                  {label}
                </PillToggleBtn>
              ))}
            </PillToggleGroup>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <SubLabel>POSITION</SubLabel>
            <PillToggleGroup>
              {(
                [
                  ['top-left', 'TL'],
                  ['top-right', 'TR'],
                ] as ReadonlyArray<[IndicatorPosition, string]>
              ).map(([v, label]) => (
                <PillToggleBtn
                  key={v}
                  active={currentPosition === v}
                  onClick={() => patch({ position: v })}
                  title={v === 'top-left' ? 'Top left' : 'Top right'}
                  style={{
                    height: 24,
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: '0.06em',
                    padding: '0 10px',
                    minWidth: 36,
                  }}
                  data-testid={`cs-rule-indicator-position-${v}-${ruleId}`}
                >
                  {label}
                </PillToggleBtn>
              ))}
            </PillToggleGroup>
          </div>
        </div>
      )}

      {/* Grouped icon grid */}
      {Object.entries(groups).map(([group, icons]) => (
        <div key={group}>
          <SubLabel>{INDICATOR_GROUP_LABELS[group] ?? group}</SubLabel>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(28px, 1fr))',
              gap: 4,
              marginTop: 4,
            }}
          >
            {icons.map((i) => {
              const active = value?.icon === i.key;
              return (
                <button
                  key={i.key}
                  type="button"
                  title={i.label}
                  aria-label={i.label}
                  onClick={() =>
                    onChange({
                      icon: i.key,
                      target: value?.target ?? 'cells+headers',
                      position: value?.position ?? 'top-right',
                      ...(value?.color ? { color: value.color } : {}),
                    })
                  }
                  style={{
                    width: '100%',
                    height: 28,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: active ? 'var(--ck-green-bg)' : 'var(--ck-bg)',
                    border: `1px solid ${active ? 'var(--ck-green)' : 'var(--ck-border-hi)'}`,
                    borderRadius: 2,
                    cursor: 'pointer',
                    color: active ? 'var(--ck-green)' : 'var(--ck-t1)',
                    padding: 0,
                    transition: 'background 120ms, border-color 120ms',
                  }}
                  data-testid={`cs-rule-indicator-icon-${i.key}-${ruleId}`}
                >
                  <IndicatorIconPreview
                    iconKey={i.key}
                    color={active ? color : 'currentColor'}
                    size={14}
                  />
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <Caps size={9} color="var(--ck-t3)">
        Shown as a 12×12 badge on the top-right of every cell (and column header) currently matching this rule.
      </Caps>
    </div>
  );
}

// ─── Legacy flat panel (fallback for hosts that don't use master-detail) ────

export function ConditionalStylingPanel() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  return (
    <div data-testid="cs-panel" style={{ display: 'grid', gridTemplateColumns: '220px 1fr', height: '100%' }}>
      <aside
        style={{
          borderRight: '1px solid var(--ck-border)',
          overflowY: 'auto',
          background: 'var(--ck-surface)',
        }}
      >
        <ConditionalStylingList gridId="" selectedId={selectedId} onSelect={setSelectedId} />
      </aside>
      <section style={{ overflowY: 'auto' }}>
        <ConditionalStylingEditor gridId="" selectedId={selectedId} />
      </section>
    </div>
  );
}
