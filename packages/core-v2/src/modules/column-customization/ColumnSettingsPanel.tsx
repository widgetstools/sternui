import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { RotateCcw, Save, X } from 'lucide-react';
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
import { Select, Switch } from '@grid-customizer/core';
import { FormatterPicker, type FormatterPickerDataType } from '../../ui/FormatterPicker';
import { StyleEditor, type StyleEditorValue } from '../../ui/StyleEditor';
import type {
  BorderSpec,
  CellStyleOverrides,
  ColumnAssignment,
  ColumnCustomizationState,
  ValueFormatterTemplate,
} from './state';
import type { ColumnTemplate, ColumnTemplatesState } from '../column-templates';

/**
 * Column Settings — master-detail editor for per-column overrides.
 *
 * Lists every column currently in the grid on the left (including virtual /
 * calculated columns), shows the selected column's `ColumnAssignment` on the
 * right. Bands cover:
 *
 *   01 HEADER        — headerName override, tooltip
 *   02 LAYOUT        — initial width, pinning, hide, sort/filter/resize flags
 *   03 TEMPLATES     — chip list of applied column-templates with per-chip
 *                      remove affordance (the user's specific ask)
 *   04 CELL STYLE    — text / color / border sections of <StyleEditor>
 *   05 HEADER STYLE  — same, scoped to `headerStyleOverrides`
 *   06 VALUE FORMAT  — shared FormatterPicker in compact popover mode
 *
 * Uses the draft/save pattern every v2 editor uses — every control writes
 * into a local draft; the cockpit SAVE pill commits the draft into
 * `state.assignments[colId]` on click.
 */

// ─── Grid column index ──────────────────────────────────────────────────────
//
// Reads the live list of columns from the grid api AND the module state's
// `assignments` keys. Returns a merged unique-by-colId ordered list so the
// left rail always has a row for every column the grid knows about, even
// before the user has touched it. Re-renders on AG-Grid's column-structure
// events so adding / removing a calculated column (or hiding one via the
// sidebar) updates the list immediately.

interface ColumnInfo {
  colId: string;
  headerName: string;
  cellDataType: string | undefined;
  pinned: 'left' | 'right' | null;
  width: number | undefined;
  hide: boolean;
}

function useAllColumns(): ColumnInfo[] {
  const core = useGridCore();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const api = core.getGridApi();
    if (!api) return;
    const bump = () => setTick((n) => n + 1);
    const events = ['columnEverythingChanged', 'displayedColumnsChanged', 'columnVisible', 'columnPinned', 'columnResized'] as const;
    for (const evt of events) {
      try {
        api.addEventListener(evt, bump);
      } catch {
        /* noop */
      }
    }
    return () => {
      for (const evt of events) {
        try {
          api.removeEventListener(evt, bump);
        } catch {
          /* noop */
        }
      }
    };
  }, [core]);

  return useMemo(() => {
    const api = core.getGridApi() as unknown as {
      getColumns?: () => Array<{
        getColId: () => string;
        getColDef: () => { headerName?: string; cellDataType?: string };
        getPinned: () => 'left' | 'right' | null;
        getActualWidth: () => number;
        isVisible: () => boolean;
      }>;
    } | null;
    if (!api?.getColumns) return [];
    const out: ColumnInfo[] = [];
    try {
      for (const c of api.getColumns() ?? []) {
        const colId = c.getColId();
        // Skip AG-Grid internal columns — they have non-user-facing ids
        // like `ag-Grid-SelectionColumn`. The Column Settings editor is
        // about USER columns (data + calculated). The selection column
        // is configured globally via Grid Options, not per-column.
        if (colId.startsWith('ag-Grid-')) continue;
        const def = c.getColDef();
        out.push({
          colId,
          headerName: def.headerName ?? colId,
          cellDataType: typeof def.cellDataType === 'string' ? def.cellDataType : undefined,
          pinned: c.getPinned() ?? null,
          width: c.getActualWidth() ?? undefined,
          hide: !c.isVisible(),
        });
      }
    } catch {
      /* api shape drift — return what we have */
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [core, tick]);
}

// ─── Dirty broadcast (module-local) ──────────────────────────────────────────
//
// Each editor instance subscribes to the shared `gc-dirty-change` custom
// event so the LED beside every list row reflects its card's dirty state
// without re-subscribing to the store per row.

const dirtyRegistry = new Set<string>();
function setDirty(itemId: string, value: boolean) {
  const key = `column-customization:${itemId}`;
  const before = dirtyRegistry.has(key);
  if (value) dirtyRegistry.add(key);
  else dirtyRegistry.delete(key);
  if (before !== value) window.dispatchEvent(new CustomEvent('gc-dirty-change'));
}
function isDirty(itemId: string): boolean {
  return dirtyRegistry.has(`column-customization:${itemId}`);
}

function DirtyListLed({ itemId }: { itemId: string }) {
  const [dirty, setDirtyState] = useState<boolean>(() => isDirty(itemId));
  useEffect(() => {
    const handler = () => setDirtyState(isDirty(itemId));
    window.addEventListener('gc-dirty-change', handler);
    return () => window.removeEventListener('gc-dirty-change', handler);
  }, [itemId]);
  if (!dirty) return null;
  return <LedBar amber on title="Unsaved changes" />;
}

// ─── List pane ───────────────────────────────────────────────────────────────

export function ColumnSettingsList({ selectedId, onSelect }: ListPaneProps) {
  const columns = useAllColumns();
  const store = useGridStore();
  const [state] = useModuleState<ColumnCustomizationState>(store, 'column-customization');

  // Auto-select the first column when the panel opens and nothing is
  // selected yet.
  useEffect(() => {
    if (!selectedId && columns.length > 0) {
      onSelect(columns[0].colId);
    }
  }, [selectedId, columns, onSelect]);

  const hasOverride = useCallback(
    (colId: string) => {
      const a = state.assignments[colId];
      if (!a) return false;
      // A bare `{ colId }` doesn't count as an override.
      return Object.keys(a).some((k) => k !== 'colId' && a[k as keyof ColumnAssignment] !== undefined);
    },
    [state.assignments],
  );

  return (
    <>
      <div className="gc-popout-list-header">
        <Caps size={11}>Columns</Caps>
        <Mono color="var(--ck-t3)" size={11}>
          {String(columns.length).padStart(2, '0')}
        </Mono>
      </div>
      <ul className="gc-popout-list-items">
        {columns.map((c) => {
          const active = c.colId === selectedId;
          return (
            <li key={c.colId}>
              <button
                type="button"
                className="gc-popout-list-item"
                aria-selected={active}
                onClick={() => onSelect(c.colId)}
                data-testid={`cols-item-${c.colId}`}
              >
                <span style={{ width: 2, display: 'inline-flex' }}>
                  <DirtyListLed itemId={c.colId} />
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
                  {c.headerName || c.colId}
                </span>
                {hasOverride(c.colId) && (
                  <span
                    title="Has overrides"
                    style={{
                      fontSize: 9,
                      color: 'var(--ck-green)',
                      letterSpacing: '0.08em',
                      fontFamily: 'var(--ck-font-mono)',
                    }}
                  >
                    •
                  </span>
                )}
              </button>
            </li>
          );
        })}
        {columns.length === 0 && (
          <li style={{ padding: '16px 12px', fontSize: 11, color: 'var(--ck-t3)' }}>
            No columns available yet.
          </li>
        )}
      </ul>
    </>
  );
}

// ─── Editor pane ─────────────────────────────────────────────────────────────

export function ColumnSettingsEditor({ selectedId }: EditorPaneProps) {
  const columns = useAllColumns();

  if (!selectedId) {
    return (
      <div style={{ padding: '32px 24px' }}>
        <Caps size={10} style={{ marginBottom: 8, display: 'block' }}>
          No column selected
        </Caps>
        <div style={{ fontSize: 12, color: 'var(--ck-t2)' }}>
          Pick a column from the list to edit its settings.
        </div>
      </div>
    );
  }

  const col = columns.find((c) => c.colId === selectedId);
  if (!col) return null;

  return <ColumnSettingsEditorInner col={col} />;
}

// ─── Inner editor — draft + bands ────────────────────────────────────────────

const ColumnSettingsEditorInner = memo(function ColumnSettingsEditorInner({
  col,
}: {
  col: ColumnInfo;
}) {
  const store = useGridStore();
  const [templatesState] = useModuleState<ColumnTemplatesState>(store, 'column-templates');

  const { draft, setDraft, dirty, save, discard } = useDraftModuleItem<
    ColumnCustomizationState,
    ColumnAssignment
  >({
    store,
    moduleId: 'column-customization',
    // Auto-seed a fresh `{ colId }` item when the user opens a column that
    // has never been customised yet. The commit path below strips empty
    // fields so saving an untouched assignment doesn't pollute state.
    selectItem: (state) => state.assignments[col.colId] ?? { colId: col.colId },
    commitItem: (next) => (state) => {
      const assignments = { ...state.assignments };
      // Drop the assignment entirely when the user has cleared every
      // override — avoids stale `{ colId }`-only entries accumulating.
      if (isEmptyAssignment(next)) {
        delete assignments[col.colId];
      } else {
        assignments[col.colId] = next;
      }
      return { ...state, assignments };
    },
  });

  useEffect(() => {
    setDirty(col.colId, dirty);
    return () => setDirty(col.colId, false);
  }, [col.colId, dirty]);

  const templates = useMemo(() => {
    return (draft.templateIds ?? [])
      .map((id) => templatesState?.templates?.[id])
      .filter((t): t is ColumnTemplate => !!t);
  }, [draft.templateIds, templatesState]);

  const removeTemplate = useCallback(
    (id: string) => {
      setDraft({
        templateIds: (draft.templateIds ?? []).filter((t) => t !== id),
      });
    },
    [draft.templateIds, setDraft],
  );

  // Bridge the flat `CellStyleOverrides` ↔ `StyleEditorValue`. Local to
  // this module so column-customization doesn't have to leak `borders` /
  // `fontSize` shape decisions into the editor.
  const cellStyleValue = toStyleEditorValue(draft.cellStyleOverrides);
  const setCellStyle = useCallback(
    (patch: Partial<StyleEditorValue>) => {
      const merged = { ...cellStyleValue, ...patch };
      setDraft({ cellStyleOverrides: fromStyleEditorValue(merged) });
    },
    [cellStyleValue, setDraft],
  );

  const headerStyleValue = toStyleEditorValue(draft.headerStyleOverrides);
  const setHeaderStyle = useCallback(
    (patch: Partial<StyleEditorValue>) => {
      const merged = { ...headerStyleValue, ...patch };
      setDraft({ headerStyleOverrides: fromStyleEditorValue(merged) });
    },
    [headerStyleValue, setDraft],
  );

  const overrideCount = countOverrides(draft);

  return (
    <div
      data-testid={`cols-editor-${col.colId}`}
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
              value={draft.headerName ?? col.headerName}
              onChange={(e) => setDraft({ headerName: e.target.value })}
              placeholder={col.headerName}
              data-testid={`cols-header-name-${col.colId}`}
            />
          }
          actions={
            <>
              <SharpBtn
                variant="ghost"
                disabled={!dirty}
                onClick={discard}
                data-testid={`cols-discard-${col.colId}`}
                title="Revert unsaved changes"
              >
                <RotateCcw size={13} strokeWidth={2} /> RESET
              </SharpBtn>
              <SharpBtn
                variant={dirty ? 'action' : 'ghost'}
                disabled={!dirty}
                onClick={save}
                data-testid={`cols-save-${col.colId}`}
                title="Save column settings"
              >
                <Save size={13} strokeWidth={2} /> SAVE
              </SharpBtn>
            </>
          }
        />
      </div>

      <div className="gc-editor-scroll">
        <div className="gc-meta-grid">
          <MetaCell label="COL ID" value={<Mono color="var(--ck-t0)">{col.colId}</Mono>} />
          <MetaCell
            label="TYPE"
            value={<Mono color="var(--ck-t0)">{col.cellDataType ?? '—'}</Mono>}
          />
          <MetaCell
            label="OVERRIDES"
            value={<Mono color={overrideCount > 0 ? 'var(--ck-amber)' : 'var(--ck-t3)'}>{overrideCount}</Mono>}
          />
          <MetaCell
            label="TEMPLATES"
            value={
              <Mono color={templates.length > 0 ? 'var(--ck-green)' : 'var(--ck-t3)'}>
                {templates.length}
              </Mono>
            }
          />
        </div>

        {/* ── 01 HEADER ──────────────────────────────────────────────────── */}
        <Band index="01" title="HEADER">
          <Row
            label="HEADER NAME"
            hint="Blank = use the host-supplied header"
            control={
              <IconInput
                value={draft.headerName ?? ''}
                onCommit={(v) => setDraft({ headerName: v.trim() ? v : undefined })}
                placeholder={col.headerName}
                data-testid={`cols-${col.colId}-header-name`}
                style={{ maxWidth: 260 }}
              />
            }
          />
          <Row
            label="TOOLTIP"
            control={
              <IconInput
                value={draft.headerTooltip ?? ''}
                onCommit={(v) => setDraft({ headerTooltip: v.trim() ? v : undefined })}
                data-testid={`cols-${col.colId}-header-tooltip`}
                style={{ maxWidth: 320 }}
              />
            }
          />
        </Band>

        {/* ── 02 LAYOUT ──────────────────────────────────────────────────── */}
        <Band index="02" title="LAYOUT">
          <Row
            label="INITIAL WIDTH"
            hint="Pixels · blank = host default"
            control={
              <IconInput
                value={draft.initialWidth != null ? String(draft.initialWidth) : ''}
                numeric
                suffix="PX"
                onCommit={(raw) => {
                  if (!raw.trim()) return setDraft({ initialWidth: undefined });
                  const n = Number(raw);
                  if (Number.isFinite(n) && n > 0) setDraft({ initialWidth: n });
                }}
                data-testid={`cols-${col.colId}-width`}
                style={{ maxWidth: 160 }}
              />
            }
          />
          <Row
            label="PINNED"
            control={
              <Select
                value={
                  draft.initialPinned === 'left'
                    ? 'left'
                    : draft.initialPinned === 'right'
                      ? 'right'
                      : 'off'
                }
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === 'left') return setDraft({ initialPinned: 'left' });
                  if (v === 'right') return setDraft({ initialPinned: 'right' });
                  setDraft({ initialPinned: undefined });
                }}
                data-testid={`cols-${col.colId}-pinned`}
                style={{ maxWidth: 180 }}
              >
                <option value="off">Off</option>
                <option value="left">Pinned left</option>
                <option value="right">Pinned right</option>
              </Select>
            }
          />
          <Row
            label="INITIAL HIDE"
            hint="Hide the column on first render"
            control={
              <Switch
                checked={draft.initialHide ?? false}
                onChange={(e) => setDraft({ initialHide: e.target.checked || undefined })}
                data-testid={`cols-${col.colId}-hide`}
              />
            }
          />
          <Row
            label="SORTABLE"
            control={
              <TriStateToggle
                value={draft.sortable}
                onChange={(v) => setDraft({ sortable: v })}
                testId={`cols-${col.colId}-sortable`}
              />
            }
          />
          <Row
            label="FILTERABLE"
            control={
              <TriStateToggle
                value={draft.filterable}
                onChange={(v) => setDraft({ filterable: v })}
                testId={`cols-${col.colId}-filterable`}
              />
            }
          />
          <Row
            label="RESIZABLE"
            control={
              <TriStateToggle
                value={draft.resizable}
                onChange={(v) => setDraft({ resizable: v })}
                testId={`cols-${col.colId}-resizable`}
              />
            }
          />
        </Band>

        {/* ── 03 TEMPLATES ───────────────────────────────────────────────── */}
        <Band index="03" title="TEMPLATES">
          {/* Applied-templates line item — mirrors the Row rhythm used by
              every other band so the user scans "APPLIED | <chips>" at a
              glance. Chips carry a per-row × to remove the template from
              the draft. */}
          <Row
            label="APPLIED"
            hint={
              templates.length > 0
                ? `${templates.length} template${templates.length === 1 ? '' : 's'} · later templates layer over earlier`
                : 'No style templates on this column yet'
            }
            control={
              templates.length === 0 ? (
                <Caps size={10} color="var(--ck-t3)">
                  —
                </Caps>
              ) : (
                <div
                  data-testid={`cols-${col.colId}-templates`}
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 6,
                  }}
                >
                  {templates.map((t) => (
                    <span
                      key={t.id}
                      className="gc-chip"
                      data-testid={`cols-${col.colId}-template-${t.id}`}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '0 4px 0 10px',
                        height: 24,
                        background: 'var(--ck-card-hi)',
                        border: '1px solid var(--ck-border-hi)',
                        borderRadius: 2,
                        fontSize: 11,
                        fontFamily: 'var(--ck-font-sans)',
                        color: 'var(--ck-t0)',
                      }}
                    >
                      {t.name}
                      <button
                        type="button"
                        aria-label={`Remove template ${t.name}`}
                        title={`Remove ${t.name}`}
                        onClick={() => removeTemplate(t.id)}
                        data-testid={`cols-${col.colId}-template-remove-${t.id}`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 18,
                          height: 18,
                          padding: 0,
                          margin: 0,
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--ck-t2)',
                          cursor: 'pointer',
                          borderRadius: 2,
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = 'var(--ck-red)';
                          e.currentTarget.style.background = 'var(--ck-red-bg)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = 'var(--ck-t2)';
                          e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <X size={12} strokeWidth={2} />
                      </button>
                    </span>
                  ))}
                </div>
              )
            }
          />
          <Row
            label="ADD TEMPLATE"
            hint="Pick a saved template to layer onto this column"
            control={
              <TemplatePicker
                allTemplates={templatesState?.templates ?? {}}
                appliedIds={draft.templateIds ?? []}
                onAdd={(id) => setDraft({ templateIds: [...(draft.templateIds ?? []), id] })}
                colId={col.colId}
              />
            }
          />
        </Band>

        {/* ── 04 CELL STYLE ──────────────────────────────────────────────── */}
        <Band index="04" title="CELL STYLE">
          <StyleEditor
            value={cellStyleValue}
            onChange={setCellStyle}
            sections={['text', 'color', 'border']}
            data-testid={`cols-${col.colId}-cell-style`}
          />
        </Band>

        {/* ── 05 HEADER STYLE ────────────────────────────────────────────── */}
        <Band index="05" title="HEADER STYLE">
          <Caps size={10} color="var(--ck-t3)" style={{ marginBottom: 6, display: 'block' }}>
            Blank alignment = follow the cell. Explicit value overrides.
          </Caps>
          <StyleEditor
            value={headerStyleValue}
            onChange={setHeaderStyle}
            sections={['text', 'color', 'border']}
            data-testid={`cols-${col.colId}-header-style`}
          />
        </Band>

        {/* ── 06 VALUE FORMAT ────────────────────────────────────────────── */}
        <Band index="06" title="VALUE FORMAT">
          <FormatterPicker
            compact
            dataType={(col.cellDataType as FormatterPickerDataType) ?? 'number'}
            value={draft.valueFormatterTemplate}
            onChange={(next) =>
              setDraft({ valueFormatterTemplate: next as ValueFormatterTemplate | undefined })
            }
            data-testid={`cols-${col.colId}-fmt`}
          />
        </Band>

        <div style={{ height: 20 }} />
      </div>
    </div>
  );
});

// ─── Tri-state dropdown (default / on / off) ────────────────────────────────
//
// `sortable` / `filterable` / `resizable` are `boolean | undefined` on the
// assignment — undefined means "inherit host default", true / false are
// explicit overrides. Previously rendered as a PillToggleGroup, but the 28px
// fixed pill width truncated / overlapped labels like "DEFAULT". Switched
// to a shadcn Select for consistency with the Grid Options panel and to
// keep the three states readable.
function TriStateToggle({
  value,
  onChange,
  testId,
}: {
  value: boolean | undefined;
  onChange: (v: boolean | undefined) => void;
  testId?: string;
}) {
  return (
    <Select
      value={value === true ? 'on' : value === false ? 'off' : 'default'}
      onChange={(e) => {
        const v = e.target.value;
        if (v === 'on') return onChange(true);
        if (v === 'off') return onChange(false);
        onChange(undefined);
      }}
      data-testid={testId}
      style={{ maxWidth: 180 }}
    >
      <option value="default">Host default</option>
      <option value="on">On</option>
      <option value="off">Off</option>
    </Select>
  );
}

// ─── Template picker ────────────────────────────────────────────────────────

function TemplatePicker({
  allTemplates,
  appliedIds,
  onAdd,
  colId,
}: {
  allTemplates: Record<string, ColumnTemplate>;
  appliedIds: string[];
  onAdd: (id: string) => void;
  colId: string;
}) {
  const applied = new Set(appliedIds);
  const available = Object.values(allTemplates).filter((t) => !applied.has(t.id));
  if (available.length === 0) {
    return (
      <Caps size={9} color="var(--ck-t3)">
        {Object.keys(allTemplates).length === 0
          ? 'No templates exist yet — save one from the Formatting Toolbar.'
          : 'All templates already applied.'}
      </Caps>
    );
  }
  return (
    <Select
      value=""
      onChange={(e) => {
        const v = e.target.value;
        if (v) onAdd(v);
      }}
      data-testid={`cols-${colId}-template-picker`}
      style={{ maxWidth: 280 }}
    >
      <option value="">Add template…</option>
      {available.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </Select>
  );
}

// ─── Row primitive (reused layout) ──────────────────────────────────────────

interface RowProps {
  label: string;
  hint?: string;
  control: React.ReactNode;
}
function Row({ label, hint, control }: RowProps) {
  return (
    <div
      className="gc-option-row"
      style={{
        display: 'grid',
        gridTemplateColumns: '180px 1fr',
        alignItems: 'center',
        columnGap: 20,
        rowGap: 4,
        padding: '8px 0',
        borderBottom: '1px solid color-mix(in srgb, var(--ck-border) 50%, transparent)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Caps size={10}>{label}</Caps>
        {hint && (
          <span style={{ fontSize: 10, color: 'var(--ck-t3)', lineHeight: 1.35 }}>{hint}</span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>{control}</div>
    </div>
  );
}

// ─── Bridge: CellStyleOverrides ↔ StyleEditorValue ──────────────────────────

function toStyleEditorValue(o: CellStyleOverrides | undefined): StyleEditorValue {
  if (!o) return {};
  const borders: StyleEditorValue['borders'] = {};
  let hasAnyBorder = false;
  if (o.borders) {
    for (const side of ['top', 'right', 'bottom', 'left'] as const) {
      const spec = o.borders[side];
      if (spec) {
        borders[side] = spec;
        hasAnyBorder = true;
      }
    }
  }
  return {
    bold: o.typography?.bold,
    italic: o.typography?.italic,
    underline: o.typography?.underline,
    fontSize: o.typography?.fontSize,
    align: o.alignment?.horizontal as StyleEditorValue['align'],
    color: o.colors?.text,
    backgroundColor: o.colors?.background,
    borders: hasAnyBorder ? borders : undefined,
  };
}

function fromStyleEditorValue(v: StyleEditorValue): CellStyleOverrides | undefined {
  const typography = pruneUndefined({
    bold: v.bold,
    italic: v.italic,
    underline: v.underline,
    fontSize: v.fontSize,
  });
  const colors = pruneUndefined({ text: v.color, background: v.backgroundColor });
  const alignment = pruneUndefined({ horizontal: v.align });
  const borders = pickBorders(v.borders);
  const out: CellStyleOverrides = {};
  if (typography) out.typography = typography as CellStyleOverrides['typography'];
  if (colors) out.colors = colors as CellStyleOverrides['colors'];
  if (alignment) out.alignment = alignment as CellStyleOverrides['alignment'];
  if (borders) out.borders = borders;
  return Object.keys(out).length > 0 ? out : undefined;
}

function pruneUndefined<T extends Record<string, unknown>>(obj: T): T | undefined {
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(obj)) {
    if (val !== undefined) out[k] = val;
  }
  return Object.keys(out).length > 0 ? (out as T) : undefined;
}

function pickBorders(
  b: StyleEditorValue['borders'],
): CellStyleOverrides['borders'] | undefined {
  if (!b) return undefined;
  const out: Record<string, BorderSpec> = {};
  for (const side of ['top', 'right', 'bottom', 'left'] as const) {
    const spec = b[side];
    if (spec && spec.width > 0) out[side] = spec;
  }
  return Object.keys(out).length > 0 ? (out as CellStyleOverrides['borders']) : undefined;
}

// ─── Utilities ──────────────────────────────────────────────────────────────

function isEmptyAssignment(a: ColumnAssignment): boolean {
  // Every field aside from `colId` is optional — an assignment is empty
  // when no optional field is populated.
  return Object.keys(a).every((k) => k === 'colId' || a[k as keyof ColumnAssignment] === undefined);
}

function countOverrides(a: ColumnAssignment): number {
  let n = 0;
  for (const k of Object.keys(a)) {
    if (k === 'colId') continue;
    if (a[k as keyof ColumnAssignment] !== undefined) n++;
  }
  return n;
}

// ─── Legacy flat panel (settings sheet host renders List+Editor side-by-side
// via the master-detail contract when both are present; this component is
// the fallback when the host only knows about `SettingsPanel`).

export function ColumnSettingsPanel() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  return (
    <div
      data-testid="cols-panel"
      style={{ display: 'grid', gridTemplateColumns: '220px 1fr', height: '100%' }}
    >
      <aside
        style={{
          borderRight: '1px solid var(--ck-border)',
          overflowY: 'auto',
          background: 'var(--ck-surface)',
        }}
      >
        <ColumnSettingsList gridId="" selectedId={selectedId} onSelect={setSelectedId} />
      </aside>
      <section style={{ overflowY: 'auto' }}>
        <ColumnSettingsEditor gridId="" selectedId={selectedId} />
      </section>
    </div>
  );
}
