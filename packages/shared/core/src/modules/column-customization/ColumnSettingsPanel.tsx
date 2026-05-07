import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import type { EditorPaneProps, ListPaneProps } from '../../platform/types';
import { useModuleState } from '../../hooks/useModuleState';
import { useModuleDraft } from '../../hooks/useModuleDraft';
import { useGridPlatform } from '../../hooks/GridProvider';
import { useGridColumns, type GridColumnInfo } from '../../hooks/useGridColumns';
import { Caps, CockpitList, CockpitListItem, LedBar, Mono } from '../../ui/SettingsPanel';
import type { StyleEditorValue } from '../../ui/StyleEditor';
import type {
  ColumnAssignment,
  ColumnCustomizationState,
} from './state';
import type { ColumnTemplate, ColumnTemplatesState } from '../column-templates';
// Extracted sub-editors — see editors/* for the per-facet implementations
// that were lifted out of this file during the AUDIT M3 + Phase C-2 splits.
import { CellEditorEditor } from './editors/CellEditorEditor';
import { FilterEditor } from './editors/FilterEditor';
import { RowGroupingEditor } from './editors/RowGroupingEditor';
import { ColumnEditorHeader } from './editors/ColumnEditorHeader';
import { ColumnMetaStrip } from './editors/ColumnMetaStrip';
import { HeaderBand } from './editors/HeaderBand';
import { LayoutBand } from './editors/LayoutBand';
import { TemplatesBand } from './editors/TemplatesBand';
import { CellStyleBand } from './editors/CellStyleBand';
import { HeaderStyleBand } from './editors/HeaderStyleBand';
import { ValueFormatBand } from './editors/ValueFormatBand';
import {
  countOverrides,
  fromStyleEditorValue,
  isEmptyAssignment,
  toStyleEditorValue,
} from './editors/styleAdapter';

/**
 * Column Settings — master-detail editor for per-column overrides.
 *
 * Lists every column currently in the grid on the left (including virtual /
 * calculated columns), shows the selected column's `ColumnAssignment` on the
 * right. Bands cover:
 *
 *   01 HEADER        — headerName override, tooltip
 *   02 LAYOUT        — initial width, pinning, hide, sort/resize flags
 *   03 TEMPLATES     — chip list of applied column-templates with per-chip
 *                      remove affordance (the user's specific ask)
 *   04 CELL STYLE    — text / color / border sections of <StyleEditor>
 *   05 HEADER STYLE  — same, scoped to `headerStyleOverrides`
 *   06 VALUE FORMAT  — shared FormatterPicker in compact popover mode
 *   07 FILTER        — filter kind picker (text/number/date/set/multi),
 *                      floating-filter toggle, set-filter + multi-filter
 *                      sub-options, common filter buttons / debounce
 *   08 ROW GROUPING  — enableRowGroup / enableValue / enablePivot, initial
 *                      rowGroup + rowGroupIndex, pivot + pivotIndex, aggFunc
 *                      (sum/min/max/count/avg/first/last) + CUSTOM via the
 *                      core ExpressionEngine (`SUM([value]) * 1.1`)
 *
 * Uses the draft/save pattern every v2 editor uses — every control writes
 * into a local draft; the cockpit SAVE pill commits the draft into
 * `state.assignments[colId]` on click.
 */

// ─── Grid column index ─────────────────────────────────────────────────
//
// The panel needs the live list of user-editable columns (data + virtual/
// calculated, not AG-Grid internal columns like `ag-Grid-*`). v4 pulls
// this from the platform `useGridColumns()` hook — fingerprint-cached,
// ApiHub-wired, auto-disposed with the platform, and it already filters
// `ag-Grid-*` internals by default. We alias the shape locally so the
// rest of the panel reads against a stable `ColumnInfo` name.

type ColumnInfo = GridColumnInfo;

const MODULE_ID = 'column-customization';
const DIRTY_PREFIX = `${MODULE_ID}:`;

// Row height matches `.gc-popout-list-item` (9px + 13px line + 9px ≈ 36).
// Used for windowed layout math when the column count crosses the threshold.
const ROW_HEIGHT = 36;
// Below this column count, every row renders — windowing is pure overhead.
// Above it, we slice the visible range based on the scroll-parent's scrollTop.
const VIRTUAL_THRESHOLD = 60;
const OVERSCAN = 8;

// ─── Bulk dirty-keys subscription ──────────────────────────────────────
//
// Replaces N `useDirty(key)` calls (one per row) with a single
// subscription that maintains a `Set<string>` of dirty column ids. The
// list rail then reads from the set per row — O(1) lookup, no per-row
// store hooks, and no unwanted work for clean rows when an unrelated
// dirty key flips.
function useDirtyColIds(): Set<string> {
  const platform = useGridPlatform();
  const bus = platform.resources.dirty();
  const compute = useCallback((): Set<string> => {
    const out = new Set<string>();
    for (const k of bus.keys()) {
      if (k.startsWith(DIRTY_PREFIX)) out.add(k.slice(DIRTY_PREFIX.length));
    }
    return out;
  }, [bus]);
  const [ids, setIds] = useState<Set<string>>(compute);
  useEffect(() => {
    setIds(compute());
    return bus.subscribe(() => {
      const next = compute();
      setIds((prev) => {
        if (prev.size !== next.size) return next;
        for (const k of next) if (!prev.has(k)) return next;
        return prev;
      });
    });
  }, [bus, compute]);
  return ids;
}

// ─── Scroll-parent windowing ───────────────────────────────────────────
//
// The list rail does not own its scroll container — `.gc-popout-list`
// (and the legacy panel's `<aside>`) own it. We walk up to find the
// first scrolling ancestor and observe its scrollTop / clientHeight to
// compute which rows to render. If no scroll parent is found (e.g.
// during jsdom tests where computed overflow isn't honored), we fall
// back to rendering everything — preserves test determinism.
function findScrollParent(node: HTMLElement | null): HTMLElement | null {
  let cur: HTMLElement | null = node?.parentElement ?? null;
  while (cur && cur !== document.body) {
    const oy = getComputedStyle(cur).overflowY;
    if (oy === 'auto' || oy === 'scroll') return cur;
    cur = cur.parentElement;
  }
  return null;
}

interface Range { start: number; end: number; }

function useWindowedRange(
  innerRef: RefObject<HTMLElement | null>,
  count: number,
  rowHeight: number,
  enabled: boolean,
): Range {
  const [range, setRange] = useState<Range>({ start: 0, end: count });
  useLayoutEffect(() => {
    if (!enabled) {
      setRange({ start: 0, end: count });
      return;
    }
    const inner = innerRef.current;
    if (!inner) return;
    const scroller = findScrollParent(inner);
    if (!scroller) {
      setRange({ start: 0, end: count });
      return;
    }
    const recompute = () => {
      const innerTop = inner.getBoundingClientRect().top;
      const scrollerTop = scroller.getBoundingClientRect().top;
      const offset = innerTop - scrollerTop + scroller.scrollTop;
      const viewportTop = Math.max(0, scroller.scrollTop - offset);
      const viewportH = scroller.clientHeight || 0;
      if (viewportH === 0) {
        setRange({ start: 0, end: count });
        return;
      }
      const start = Math.max(0, Math.floor(viewportTop / rowHeight) - OVERSCAN);
      const visible = Math.ceil(viewportH / rowHeight) + OVERSCAN * 2;
      const end = Math.min(count, start + visible);
      setRange((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
    };
    recompute();
    scroller.addEventListener('scroll', recompute, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(recompute) : null;
    ro?.observe(scroller);
    return () => {
      scroller.removeEventListener('scroll', recompute);
      ro?.disconnect();
    };
  }, [innerRef, count, rowHeight, enabled]);
  return range;
}

// ─── List pane ───────────────────────────────────────────────────────────────

export function ColumnSettingsList({ selectedId, onSelect }: ListPaneProps) {
  const columns = useGridColumns();
  const [state] = useModuleState<ColumnCustomizationState>(MODULE_ID);
  const dirtyIds = useDirtyColIds();

  // Auto-select the first column when the panel opens and nothing is
  // selected yet.
  useEffect(() => {
    if (!selectedId && columns.length > 0) {
      onSelect(columns[0].colId);
    }
  }, [selectedId, columns, onSelect]);

  // Precompute the override set once per assignments change. Replaces
  // an `Object.keys(...).some(...)` walk that ran for every list row on
  // every render.
  const overriddenIds = useMemo(() => {
    const set = new Set<string>();
    for (const [colId, a] of Object.entries(state.assignments)) {
      if (!a) continue;
      for (const k of Object.keys(a)) {
        if (k !== 'colId' && a[k as keyof ColumnAssignment] !== undefined) {
          set.add(colId);
          break;
        }
      }
    }
    return set;
  }, [state.assignments]);

  // CockpitList renders a cmdk Command (a `<div>`); the windowing hook
  // walks up from this ref to find the scrolling ancestor.
  const listRef = useRef<HTMLDivElement | null>(null);
  const virtualize = columns.length > VIRTUAL_THRESHOLD;
  const range = useWindowedRange(listRef, columns.length, ROW_HEIGHT, virtualize);
  const visible = virtualize ? columns.slice(range.start, range.end) : columns;
  const padTop = virtualize ? range.start * ROW_HEIGHT : 0;
  const padBottom = virtualize
    ? Math.max(0, (columns.length - range.end) * ROW_HEIGHT)
    : 0;

  return (
    <>
      <div className="gc-popout-list-header">
        <Caps size={11}>Columns</Caps>
        <Mono color="var(--ck-t3)" size={11}>
          {String(columns.length).padStart(2, '0')}
        </Mono>
      </div>
      <CockpitList ref={listRef}>
        {padTop > 0 && <div aria-hidden style={{ height: padTop }} />}
        {visible.map((c) => {
          const active = c.colId === selectedId;
          const isDirty = dirtyIds.has(c.colId);
          const overridden = overriddenIds.has(c.colId);
          return (
            <CockpitListItem
              key={c.colId}
              value={c.colId}
              active={active}
              onSelect={() => onSelect(c.colId)}
              data-testid={`cols-item-${c.colId}`}
              style={virtualize ? { height: ROW_HEIGHT } : undefined}
            >
              <span style={{ width: 2, display: 'inline-flex' }}>
                {isDirty && <LedBar amber on title="Unsaved changes" />}
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
              {overridden && (
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
            </CockpitListItem>
          );
        })}
        {padBottom > 0 && <div aria-hidden style={{ height: padBottom }} />}
        {columns.length === 0 && (
          <div style={{ padding: '16px 12px', fontSize: 11, color: 'var(--ck-t3)' }}>
            No columns available yet.
          </div>
        )}
      </CockpitList>
    </>
  );
}

// ─── Editor pane ─────────────────────────────────────────────────────────────

export function ColumnSettingsEditor({ selectedId }: EditorPaneProps) {
  const columns = useGridColumns();

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
  const [templatesState] = useModuleState<ColumnTemplatesState>('column-templates');

  const { draft, setDraft, dirty, save, discard } = useModuleDraft<
    ColumnCustomizationState,
    ColumnAssignment
  >({
    moduleId: MODULE_ID,
    itemId: col.colId,
    // Auto-seed a fresh `{ colId }` item when the user opens a column
    // that has never been customised yet. The commit path below strips
    // empty fields so saving an untouched assignment doesn't pollute
    // state.
    selectItem: (state) => state.assignments[col.colId] ?? { colId: col.colId },
    commitItem: (next) => (state) => {
      const assignments = { ...state.assignments };
      // Drop the assignment entirely when every override has been
      // cleared — avoids stale `{ colId }`-only entries accumulating.
      if (isEmptyAssignment(next)) {
        delete assignments[col.colId];
      } else {
        assignments[col.colId] = next;
      }
      return { ...state, assignments };
    },
  });
  // DirtyBus registration is handled inside useModuleDraft — the key is
  // `column-customization:<colId>`, which the list rail's LED reads via
  // `useDirty(key)`. No manual publish is required.

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
      <ColumnEditorHeader
        colId={col.colId}
        headerName={draft.headerName}
        hostHeaderName={col.headerName}
        dirty={dirty}
        onHeaderNameChange={(name) => setDraft({ headerName: name })}
        onSave={save}
        onDiscard={discard}
      />

      <div className="gc-editor-scroll">
        <ColumnMetaStrip
          colId={col.colId}
          cellDataType={col.cellDataType}
          overrideCount={overrideCount}
          templateCount={templates.length}
        />

        <HeaderBand
          colId={col.colId}
          hostHeaderName={col.headerName}
          headerName={draft.headerName}
          headerTooltip={draft.headerTooltip}
          setDraft={setDraft}
        />

        <LayoutBand
          colId={col.colId}
          initialWidth={draft.initialWidth}
          initialPinned={draft.initialPinned}
          initialHide={draft.initialHide}
          sortable={draft.sortable}
          resizable={draft.resizable}
          setDraft={setDraft}
        />

        <TemplatesBand
          colId={col.colId}
          templates={templates}
          allTemplates={templatesState?.templates ?? {}}
          appliedIds={draft.templateIds ?? []}
          onAdd={(id) => setDraft({ templateIds: [...(draft.templateIds ?? []), id] })}
          onRemove={removeTemplate}
        />

        <CellStyleBand
          colId={col.colId}
          value={cellStyleValue}
          onChange={setCellStyle}
        />

        <HeaderStyleBand
          colId={col.colId}
          value={headerStyleValue}
          onChange={setHeaderStyle}
        />

        <ValueFormatBand
          colId={col.colId}
          cellDataType={col.cellDataType}
          value={draft.valueFormatterTemplate}
          onChange={(next) => setDraft({ valueFormatterTemplate: next })}
        />

        {/* ── 07 FILTER ──────────────────────────────────────────────────── */}
        <FilterBandWrapper colId={col.colId} value={draft.filter} onChange={(next) => setDraft({ filter: next })} />

        {/* ── 08 ROW GROUPING ────────────────────────────────────────────── */}
        <RowGroupingBandWrapper
          colId={col.colId}
          value={draft.rowGrouping}
          onChange={(next) => setDraft({ rowGrouping: next })}
        />

        {/* ── 09 CELL EDITOR ─────────────────────────────────────────────── */}
        <CellEditorBandWrapper
          colId={col.colId}
          value={draft.cellEditor}
          onChange={(next) => setDraft({ cellEditor: next })}
        />

        <div style={{ height: 20 }} />
      </div>
    </div>
  );
});

// Filter / RowGrouping editors keep their existing un-Banded shape; wrap
// them in Bands inline so the orchestrator's render tree reads cleanly.
import { Band } from '../../ui/SettingsPanel';
import type { ColumnAssignment as _ColumnAssignment } from './state';

function FilterBandWrapper({
  colId,
  value,
  onChange,
}: {
  colId: string;
  value: _ColumnAssignment['filter'];
  onChange: (next: _ColumnAssignment['filter']) => void;
}) {
  return (
    <Band index="07" title="FILTER">
      <FilterEditor colId={colId} value={value} onChange={onChange} />
    </Band>
  );
}

function CellEditorBandWrapper({
  colId,
  value,
  onChange,
}: {
  colId: string;
  value: _ColumnAssignment['cellEditor'];
  onChange: (next: _ColumnAssignment['cellEditor']) => void;
}) {
  return (
    <Band index="09" title="CELL EDITOR">
      <CellEditorEditor colId={colId} value={value} onChange={onChange} />
    </Band>
  );
}

function RowGroupingBandWrapper({
  colId,
  value,
  onChange,
}: {
  colId: string;
  value: _ColumnAssignment['rowGrouping'];
  onChange: (next: _ColumnAssignment['rowGrouping']) => void;
}) {
  return (
    <Band index="08" title="ROW GROUPING">
      <RowGroupingEditor colId={colId} value={value} onChange={onChange} />
    </Band>
  );
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
