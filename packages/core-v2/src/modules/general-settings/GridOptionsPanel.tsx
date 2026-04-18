import { memo, type ReactNode } from 'react';
import { RotateCcw, Save } from 'lucide-react';
import { Select, Switch } from '@grid-customizer/core';
import { useGridStore } from '../../ui/GridContext';
import { useDraftModuleItem } from '../../store/useDraftModuleItem';
import {
  Band,
  Caps,
  IconInput,
  MetaCell,
  Mono,
  ObjectTitleRow,
  SharpBtn,
  SubLabel,
} from '../../ui/SettingsPanel';
import { INITIAL_GENERAL_SETTINGS, type GeneralSettingsState } from './state';

/**
 * Grid Options editor — the single-card counterpart to the per-item
 * editors (calculated-columns, conditional-styling, column-groups). The
 * "item" here is the whole `GeneralSettingsState` object; the header
 * gives the user an explicit SAVE affordance with a dirty indicator,
 * matching the card header used across the other v2 editors.
 *
 * Flow mirrors `CalculatedColumnsEditor`:
 *   - `useDraftModuleItem` holds a local draft of every grid option.
 *   - Every input edits the draft, NOT module state — the grid doesn't
 *     re-render and auto-save doesn't fire on keystrokes.
 *   - `dirty` lights up the header LED; `save()` commits the draft into
 *     module state, which triggers `transformGridOptions` + the
 *     standard auto-save debounce that writes into the active profile.
 *   - `discard()` reverts the draft back to the committed snapshot —
 *     rendered as a secondary RESET affordance alongside SAVE.
 */

// ─── Row primitives ─────────────────────────────────────────────────────────
//
// Kept local — every consumer is in this file. Each row follows the same
// rhythm: caps label on the left, control on the right. The controls flex
// to fill the right column, so the panel breathes at every width.

interface RowProps {
  label: string;
  hint?: string;
  control: ReactNode;
  /** Optional test id applied to the row `<div>`. */
  'data-testid'?: string;
}

function Row({ label, hint, control, ...rest }: RowProps) {
  return (
    <div
      className="gc-option-row"
      data-testid={rest['data-testid']}
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

/**
 * Slim wrapper around the shadcn Switch with fixed sizing + cockpit colour
 * — the same visual used by every other v2 panel for boolean toggles.
 */
function BooleanControl({
  checked,
  onChange,
  testId,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  testId?: string;
}) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center' }}>
      <Switch
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        data-testid={testId}
      />
    </div>
  );
}

/**
 * Numeric control — reuses IconInput for visual consistency. Parses to a
 * number on commit; invalid input reverts to the last committed value.
 */
function NumberControl({
  value,
  onChange,
  min,
  suffix,
  testId,
  style,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  suffix?: string;
  testId?: string;
  style?: React.CSSProperties;
}) {
  return (
    <IconInput
      value={String(value)}
      numeric
      suffix={suffix}
      onCommit={(raw) => {
        const n = Number(raw);
        if (!Number.isFinite(n)) return;
        if (min != null && n < min) return onChange(min);
        onChange(n);
      }}
      data-testid={testId}
      style={{ maxWidth: 180, ...style }}
    />
  );
}

function TextControl({
  value,
  onChange,
  placeholder,
  testId,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  testId?: string;
}) {
  return (
    <IconInput
      value={value}
      onCommit={onChange}
      placeholder={placeholder}
      data-testid={testId}
      style={{ maxWidth: 280 }}
    />
  );
}

/**
 * Shadcn-Select dropdown enum control.
 *
 * The HTML `<select>` value space is strings, but we want callers to keep
 * working with the strongly-typed union (including `undefined` for "none"
 * / "default"). Internally we round-trip through a sentinel key so the
 * type safety stays intact:
 *   - external `undefined` → internal `"__none__"`
 *   - external `""`        → internal `"__empty__"` (e.g. TAB delimiter `'\t'`
 *     would render blank otherwise)
 *
 * Replaces the earlier `PillToggleGroup` implementation — pills worked for
 * 2-3 short-label options but collapsed badly at >3 options or with
 * multi-word labels ("WHEN GROUPING", "PIN TOP"). The settings sheet
 * already styles `select` to the cockpit chrome (see v2-sheet-styles.ts)
 * so no extra CSS is needed here.
 */
const SEL_NONE = '__none__';
const SEL_EMPTY = '__empty__';

function encodeValue(v: unknown): string {
  if (v === undefined) return SEL_NONE;
  if (v === '') return SEL_EMPTY;
  return String(v);
}
function decodeValue<T>(encoded: string, options: ReadonlyArray<{ value: T }>): T {
  if (encoded === SEL_NONE) return undefined as unknown as T;
  if (encoded === SEL_EMPTY) return '' as unknown as T;
  // Walk options so the decoded value carries the exact reference from the
  // allowed set — critical for non-string unions (though we only use strings
  // + undefined today).
  const hit = options.find((o) => encodeValue(o.value) === encoded);
  return hit ? hit.value : (encoded as unknown as T);
}

function SelectControl<T extends string | undefined>({
  value,
  onChange,
  options,
  testId,
}: {
  value: T;
  onChange: (v: T) => void;
  options: ReadonlyArray<{ value: T; label: string }>;
  testId?: string;
}) {
  return (
    <Select
      value={encodeValue(value)}
      onChange={(e) => onChange(decodeValue<T>(e.target.value, options))}
      data-testid={testId}
      style={{ maxWidth: 240, flex: '1 1 auto' }}
    >
      {options.map((opt) => (
        <option key={encodeValue(opt.value)} value={encodeValue(opt.value)}>
          {opt.label}
        </option>
      ))}
    </Select>
  );
}

// ─── The panel ──────────────────────────────────────────────────────────────

export const GridOptionsPanel = memo(function GridOptionsPanel() {
  const store = useGridStore();

  // Treat the entire state as the "item" — grid options is a singleton,
  // not a list. selectItem is identity; commitItem replaces state wholesale.
  // Draft-mode means typing into any field just updates the draft; the
  // user commits via the SAVE button in the header.
  const { draft, setDraft, dirty, save, discard, missing } = useDraftModuleItem<
    GeneralSettingsState,
    GeneralSettingsState
  >({
    store,
    moduleId: 'general-settings',
    selectItem: (state) => state ?? INITIAL_GENERAL_SETTINGS,
    commitItem: (next) => () => next,
  });

  // Shortcut: patch one key on the draft. Typed so IDEs narrow the value
  // based on the key, identical ergonomics to the original `update()`.
  const update = <K extends keyof GeneralSettingsState>(
    key: K,
    value: GeneralSettingsState[K],
  ): void => {
    setDraft({ [key]: value } as Partial<GeneralSettingsState>);
  };

  // Empty-state guard — matches the pattern in CalculatedColumnsEditor
  // when a selected item disappears. In practice `missing` is never true
  // here (the module always has a state slice), but keep the guard so a
  // misconfigured store doesn't crash the settings sheet.
  if (missing) return null;

  const s = draft;
  const defaultsSet = countNonDefault(s);

  return (
    <div
      data-testid="go-panel"
      style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}
    >
      <div className="gc-editor-header">
        <ObjectTitleRow
          title={<span style={{ fontWeight: 600, fontSize: 13 }}>Grid Options</span>}
          actions={
            <>
              <SharpBtn
                variant={dirty ? 'ghost' : 'ghost'}
                disabled={!dirty}
                onClick={discard}
                data-testid="go-discard-btn"
                title="Revert unsaved changes"
              >
                <RotateCcw size={13} strokeWidth={2} /> RESET
              </SharpBtn>
              <SharpBtn
                variant={dirty ? 'action' : 'ghost'}
                disabled={!dirty}
                onClick={save}
                data-testid="go-save-btn"
                title="Save grid options"
              >
                <Save size={13} strokeWidth={2} /> SAVE
              </SharpBtn>
            </>
          }
        />
      </div>

      <div className="gc-editor-scroll">
        {/* Meta strip — matches calculated-columns / conditional-styling */}
        <div className="gc-meta-grid">
          <MetaCell label="SCHEMA" value={<Mono color="var(--ck-t0)">v2</Mono>} />
          <MetaCell label="OVERRIDES" value={<Mono color="var(--ck-t0)">{defaultsSet}</Mono>} />
          <MetaCell
            label="DIRTY"
            value={<Mono color={dirty ? 'var(--ck-amber)' : 'var(--ck-t3)'}>{dirty ? 'YES' : '—'}</Mono>}
          />
          <MetaCell
            label="QUICK FILTER"
            value={
              <Mono color={s.quickFilterText ? 'var(--ck-amber)' : 'var(--ck-t3)'}>
                {s.quickFilterText ? 'SET' : '—'}
              </Mono>
            }
          />
        </div>

        {/* ── TIER 1 — ESSENTIAL ──────────────────────────────────────────── */}
        <Band index="01" title="ESSENTIALS">
          <Row
            label="ROW HEIGHT"
            control={
              <NumberControl
                value={s.rowHeight}
                onChange={(v) => update('rowHeight', v)}
                min={14}
                suffix="PX"
                testId="go-row-height"
              />
            }
          />
          <Row
            label="HEADER HEIGHT"
            control={
              <NumberControl
                value={s.headerHeight}
                onChange={(v) => update('headerHeight', v)}
                min={14}
                suffix="PX"
                testId="go-header-height"
              />
            }
          />
          <Row
            label="ANIMATE ROWS"
            hint="Disable for high-frequency tick feeds"
            control={
              <BooleanControl
                checked={s.animateRows}
                onChange={(v) => update('animateRows', v)}
                testId="go-animate-rows"
              />
            }
          />
          <Row
            label="ROW SELECTION"
            control={
              <SelectControl
                value={s.rowSelection}
                onChange={(v) => update('rowSelection', v)}
                options={[
                  { value: undefined, label: 'Off' },
                  { value: 'singleRow', label: 'Single row' },
                  { value: 'multiRow', label: 'Multiple rows' },
                ]}
                testId="go-row-selection"
              />
            }
          />
          <Row
            label="CHECKBOX SELECT"
            hint="Show a checkbox column when selection is enabled"
            control={
              <BooleanControl
                checked={s.checkboxSelection}
                onChange={(v) => update('checkboxSelection', v)}
                testId="go-checkbox-select"
              />
            }
          />
          <Row
            label="CELL SELECTION"
            hint="Enterprise · range selection for copy / fill"
            control={
              <BooleanControl
                checked={s.cellSelection}
                onChange={(v) => update('cellSelection', v)}
                testId="go-cell-selection"
              />
            }
          />
          <Row
            label="FLASH DURATION"
            hint="ms · 0 disables cell-value-change flashing"
            control={
              <NumberControl
                value={s.cellFlashDuration}
                onChange={(v) => update('cellFlashDuration', v)}
                min={0}
                suffix="MS"
                testId="go-flash-duration"
              />
            }
          />
          <Row
            label="FADE DURATION"
            hint="ms · fade-out after the flash hold window"
            control={
              <NumberControl
                value={s.cellFadeDuration}
                onChange={(v) => update('cellFadeDuration', v)}
                min={0}
                suffix="MS"
                testId="go-fade-duration"
              />
            }
          />
          <Row
            label="PAGINATION"
            control={
              <BooleanControl
                checked={s.pagination}
                onChange={(v) => update('pagination', v)}
                testId="go-pagination"
              />
            }
          />
          {s.pagination && (
            <>
              <Row
                label="PAGE SIZE"
                control={
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                    <NumberControl
                      value={s.paginationPageSize}
                      onChange={(v) => update('paginationPageSize', v)}
                      min={1}
                      testId="go-page-size"
                      style={{ maxWidth: 100 }}
                    />
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--ck-t2)' }}>
                      <BooleanControl
                        checked={s.paginationAutoPageSize}
                        onChange={(v) => update('paginationAutoPageSize', v)}
                        testId="go-page-size-auto"
                      />
                      <SubLabel>AUTO</SubLabel>
                    </label>
                  </div>
                }
              />
              <Row
                label="HIDE PANEL"
                hint="Hide the built-in pagination footer"
                control={
                  <BooleanControl
                    checked={s.suppressPaginationPanel}
                    onChange={(v) => update('suppressPaginationPanel', v)}
                    testId="go-suppress-pagination-panel"
                  />
                }
              />
            </>
          )}
          <Row
            label="QUICK FILTER"
            hint="Live full-text filter across all columns"
            control={
              <TextControl
                value={s.quickFilterText}
                onChange={(v) => update('quickFilterText', v)}
                placeholder="type to filter…"
                testId="go-quick-filter"
              />
            }
          />
        </Band>

        {/* ── TIER 2 — GROUPING / PIVOT / AGGREGATION ─────────────────────── */}
        <Band index="02" title="GROUPING · PIVOT · AGGREGATION">
          <Row
            label="GROUP DISPLAY"
            control={
              <SelectControl
                value={s.groupDisplayType}
                onChange={(v) => update('groupDisplayType', v)}
                options={[
                  { value: undefined, label: 'Default' },
                  { value: 'singleColumn', label: 'Single column' },
                  { value: 'multipleColumns', label: 'Multiple columns' },
                  { value: 'groupRows', label: 'Group rows' },
                  { value: 'custom', label: 'Custom' },
                ]}
                testId="go-group-display"
              />
            }
          />
          <Row
            label="DEFAULT EXPAND"
            hint="0 = none · N = level count · -1 = expand all"
            control={
              <NumberControl
                value={s.groupDefaultExpanded}
                onChange={(v) => update('groupDefaultExpanded', v)}
                testId="go-group-default-expanded"
                style={{ maxWidth: 100 }}
              />
            }
          />
          <Row
            label="ROW GROUP PANEL"
            control={
              <SelectControl
                value={s.rowGroupPanelShow}
                onChange={(v) => update('rowGroupPanelShow', v)}
                options={[
                  { value: 'never', label: 'Never' },
                  { value: 'onlyWhenGrouping', label: 'Only when grouping' },
                  { value: 'always', label: 'Always' },
                ]}
                testId="go-row-group-panel"
              />
            }
          />
          <Row
            label="PIVOT MODE"
            control={
              <BooleanControl
                checked={s.pivotMode}
                onChange={(v) => update('pivotMode', v)}
                testId="go-pivot-mode"
              />
            }
          />
          <Row
            label="PIVOT PANEL"
            control={
              <SelectControl
                value={s.pivotPanelShow}
                onChange={(v) => update('pivotPanelShow', v)}
                options={[
                  { value: 'never', label: 'Never' },
                  { value: 'onlyWhenPivoting', label: 'Only when pivoting' },
                  { value: 'always', label: 'Always' },
                ]}
                testId="go-pivot-panel"
              />
            }
          />
          <Row
            label="GRAND TOTAL"
            control={
              <SelectControl
                value={s.grandTotalRow}
                onChange={(v) => update('grandTotalRow', v)}
                options={[
                  { value: undefined, label: 'None' },
                  { value: 'top', label: 'Top' },
                  { value: 'bottom', label: 'Bottom' },
                  { value: 'pinnedTop', label: 'Pinned top' },
                  { value: 'pinnedBottom', label: 'Pinned bottom' },
                ]}
                testId="go-grand-total"
              />
            }
          />
          <Row
            label="GROUP TOTAL"
            control={
              <SelectControl
                value={s.groupTotalRow}
                onChange={(v) => update('groupTotalRow', v)}
                options={[
                  { value: undefined, label: 'None' },
                  { value: 'top', label: 'Top' },
                  { value: 'bottom', label: 'Bottom' },
                ]}
                testId="go-group-total"
              />
            }
          />
          <Row
            label="HIDE OPEN PARENTS"
            control={
              <BooleanControl
                checked={s.groupHideOpenParents}
                onChange={(v) => update('groupHideOpenParents', v)}
                testId="go-group-hide-open-parents"
              />
            }
          />
          <Row
            label="SUPPRESS AGG"
            hint="Strip aggregation function names from group headers"
            control={
              <BooleanControl
                checked={s.suppressAggFuncInHeader}
                onChange={(v) => update('suppressAggFuncInHeader', v)}
                testId="go-suppress-agg-in-header"
              />
            }
          />
        </Band>

        {/* ── TIER 3 — FILTER, SORT, CLIPBOARD ────────────────────────────── */}
        <Band index="03" title="FILTER · SORT · CLIPBOARD">
          <Row
            label="ADVANCED FILTER"
            control={
              <BooleanControl
                checked={s.enableAdvancedFilter}
                onChange={(v) => update('enableAdvancedFilter', v)}
                testId="go-advanced-filter"
              />
            }
          />
          <Row
            label="HIDDEN COL QF"
            hint="Include hidden columns in quick-filter matches"
            control={
              <BooleanControl
                checked={s.includeHiddenColumnsInQuickFilter}
                onChange={(v) => update('includeHiddenColumnsInQuickFilter', v)}
                testId="go-hidden-cols-in-qf"
              />
            }
          />
          <Row
            label="MULTI SORT"
            hint="How clicking a header extends the sort set"
            control={
              <SelectControl
                value={s.multiSortMode}
                onChange={(v) => update('multiSortMode', v)}
                options={[
                  { value: 'replace', label: 'Click replaces sort' },
                  { value: 'shift', label: 'Shift-click to add' },
                  { value: 'ctrl', label: 'Ctrl-click to add' },
                  { value: 'always', label: 'Click always adds' },
                ]}
                testId="go-multi-sort"
              />
            }
          />
          <Row
            label="ACCENTED SORT"
            hint="Locale-aware comparisons (slower)"
            control={
              <BooleanControl
                checked={s.accentedSort}
                onChange={(v) => update('accentedSort', v)}
                testId="go-accented-sort"
              />
            }
          />
          <Row
            label="COPY HEADERS"
            control={
              <BooleanControl
                checked={s.copyHeadersToClipboard}
                onChange={(v) => update('copyHeadersToClipboard', v)}
                testId="go-copy-headers"
              />
            }
          />
          <Row
            label="CLIP DELIMITER"
            control={
              <SelectControl
                value={s.clipboardDelimiter}
                onChange={(v) => update('clipboardDelimiter', v)}
                options={[
                  { value: '\t', label: 'Tab' },
                  { value: ',', label: 'Comma' },
                  { value: ';', label: 'Semicolon' },
                  { value: '|', label: 'Pipe' },
                ]}
                testId="go-clipboard-delimiter"
              />
            }
          />
        </Band>

        {/* ── TIER 4 — EDITING & INTERACTION ──────────────────────────────── */}
        <Band index="04" title="EDITING · INTERACTION">
          <Row
            label="SINGLE CLICK EDIT"
            control={
              <BooleanControl
                checked={s.singleClickEdit}
                onChange={(v) => update('singleClickEdit', v)}
                testId="go-single-click-edit"
              />
            }
          />
          <Row
            label="STOP ON BLUR"
            hint="Commit the edit when the cell loses focus"
            control={
              <BooleanControl
                checked={s.stopEditingWhenCellsLoseFocus}
                onChange={(v) => update('stopEditingWhenCellsLoseFocus', v)}
                testId="go-stop-on-blur"
              />
            }
          />
          <Row
            label="ENTER NAVIGATES"
            hint="What Enter does in / after an edit"
            control={
              <SelectControl
                value={s.enterNavigation}
                onChange={(v) => update('enterNavigation', v)}
                options={[
                  { value: 'default', label: 'Default (commit only)' },
                  { value: 'always', label: 'Always move down' },
                  { value: 'afterEdit', label: 'Move down after edit' },
                  { value: 'both', label: 'Move down always + after edit' },
                ]}
                testId="go-enter-navigation"
              />
            }
          />
          <Row
            label="UNDO / REDO"
            control={
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                <BooleanControl
                  checked={s.undoRedoCellEditing}
                  onChange={(v) => update('undoRedoCellEditing', v)}
                  testId="go-undo-redo"
                />
                {s.undoRedoCellEditing && (
                  <>
                    <SubLabel>LIMIT</SubLabel>
                    <NumberControl
                      value={s.undoRedoCellEditingLimit}
                      onChange={(v) => update('undoRedoCellEditingLimit', v)}
                      min={1}
                      testId="go-undo-redo-limit"
                      style={{ maxWidth: 80 }}
                    />
                  </>
                )}
              </div>
            }
          />
          <Row
            label="TOOLTIP DELAY"
            hint="ms before tooltips appear on hover"
            control={
              <NumberControl
                value={s.tooltipShowDelay}
                onChange={(v) => update('tooltipShowDelay', v)}
                min={0}
                suffix="MS"
                testId="go-tooltip-delay"
              />
            }
          />
          <Row
            label="TOOLTIP MODE"
            control={
              <SelectControl
                value={s.tooltipShowMode}
                onChange={(v) => update('tooltipShowMode', v)}
                options={[
                  { value: 'standard', label: 'Always show' },
                  { value: 'whenTruncated', label: 'Only when truncated' },
                ]}
                testId="go-tooltip-mode"
              />
            }
          />
        </Band>

        {/* ── TIER 5 — STYLING & DEFAULT COLDEF ───────────────────────────── */}
        <Band index="05" title="STYLING · DEFAULT COLDEF">
          <Row
            label="ROW HOVER"
            hint="Suppress the hover highlight on rows"
            control={
              <BooleanControl
                checked={s.suppressRowHoverHighlight}
                onChange={(v) => update('suppressRowHoverHighlight', v)}
                testId="go-suppress-row-hover"
              />
            }
          />
          <Row
            label="COLUMN HOVER"
            hint="Highlight the whole column on header hover"
            control={
              <BooleanControl
                checked={s.columnHoverHighlight}
                onChange={(v) => update('columnHoverHighlight', v)}
                testId="go-column-hover"
              />
            }
          />
          <Row
            label="RESIZABLE"
            hint="Default ColDef — every column"
            control={
              <BooleanControl
                checked={s.defaultResizable}
                onChange={(v) => update('defaultResizable', v)}
                testId="go-default-resizable"
              />
            }
          />
          <Row
            label="SORTABLE"
            control={
              <BooleanControl
                checked={s.defaultSortable}
                onChange={(v) => update('defaultSortable', v)}
                testId="go-default-sortable"
              />
            }
          />
          <Row
            label="FILTERABLE"
            control={
              <BooleanControl
                checked={s.defaultFilterable}
                onChange={(v) => update('defaultFilterable', v)}
                testId="go-default-filterable"
              />
            }
          />
          <Row
            label="EDITABLE"
            control={
              <BooleanControl
                checked={s.defaultEditable}
                onChange={(v) => update('defaultEditable', v)}
                testId="go-default-editable"
              />
            }
          />
          <Row
            label="WRAP HEADER"
            control={
              <BooleanControl
                checked={s.wrapHeaderText}
                onChange={(v) => update('wrapHeaderText', v)}
                testId="go-wrap-header"
              />
            }
          />
          <Row
            label="SUPPRESS MOVE"
            hint="Lock columns against drag-to-reorder"
            control={
              <BooleanControl
                checked={s.suppressMovable}
                onChange={(v) => update('suppressMovable', v)}
                testId="go-suppress-movable"
              />
            }
          />
          <Row
            label="MIN WIDTH"
            control={
              <NumberControl
                value={s.defaultMinWidth}
                onChange={(v) => update('defaultMinWidth', v)}
                min={0}
                suffix="PX"
                testId="go-default-min-width"
              />
            }
          />
          <Row
            label="MAX WIDTH"
            hint="Blank = no cap"
            control={
              <IconInput
                value={s.defaultMaxWidth != null ? String(s.defaultMaxWidth) : ''}
                numeric
                suffix="PX"
                onCommit={(raw) => {
                  if (!raw.trim()) return update('defaultMaxWidth', undefined);
                  const n = Number(raw);
                  if (Number.isFinite(n) && n > 0) update('defaultMaxWidth', n);
                }}
                data-testid="go-default-max-width"
                style={{ maxWidth: 180 }}
              />
            }
          />
        </Band>

        {/* ── TIER 6 — PERFORMANCE OVERRIDES ──────────────────────────────── */}
        <Band index="06" title="PERFORMANCE (ADVANCED)">
          <Row
            label="ROW BUFFER"
            hint="Rows rendered outside viewport · 5-50 practical"
            control={
              <NumberControl
                value={s.rowBuffer}
                onChange={(v) => update('rowBuffer', v)}
                min={0}
                testId="go-row-buffer"
                style={{ maxWidth: 100 }}
              />
            }
          />
          <Row
            label="NO SCROLL RESET"
            hint="Keep scroll position when new rowData arrives"
            control={
              <BooleanControl
                checked={s.suppressScrollOnNewData}
                onChange={(v) => update('suppressScrollOnNewData', v)}
                testId="go-suppress-scroll-on-new-data"
              />
            }
          />
          <Row
            label="NO COL VIRT"
            hint="Initial · remount required · 200+ col grids"
            control={
              <BooleanControl
                checked={s.suppressColumnVirtualisation}
                onChange={(v) => update('suppressColumnVirtualisation', v)}
                testId="go-suppress-col-virt"
              />
            }
          />
          <Row
            label="NO ROW VIRT"
            hint="Initial · remount required"
            control={
              <BooleanControl
                checked={s.suppressRowVirtualisation}
                onChange={(v) => update('suppressRowVirtualisation', v)}
                testId="go-suppress-row-virt"
              />
            }
          />
          <Row
            label="NO RENDER CAP"
            hint="Initial · remount required · only meaningful if row virt off"
            control={
              <BooleanControl
                checked={s.suppressMaxRenderedRowRestriction}
                onChange={(v) => update('suppressMaxRenderedRowRestriction', v)}
                testId="go-suppress-render-cap"
              />
            }
          />
          <Row
            label="NO RAF"
            hint="Initial · remount required · expert-only"
            control={
              <BooleanControl
                checked={s.suppressAnimationFrame}
                onChange={(v) => update('suppressAnimationFrame', v)}
                testId="go-suppress-raf"
              />
            }
          />
          <Row
            label="DEBOUNCE VSCROLL"
            hint="Initial · remount required"
            control={
              <BooleanControl
                checked={s.debounceVerticalScrollbar}
                onChange={(v) => update('debounceVerticalScrollbar', v)}
                testId="go-debounce-vscroll"
              />
            }
          />
        </Band>

        <div style={{ height: 20 }} />
      </div>
    </div>
  );
});

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Count how many user-visible options have been moved off their initial
 * values — displayed in the meta strip as "OVERRIDES". Gives the user a
 * quick sense of how much they've customised.
 */
function countNonDefault(s: GeneralSettingsState): number {
  let n = 0;
  for (const key of Object.keys(INITIAL_GENERAL_SETTINGS) as Array<keyof GeneralSettingsState>) {
    if (s[key] !== INITIAL_GENERAL_SETTINGS[key]) n++;
  }
  return n;
}
