/**
 * Grid Options editor — declarative schema, one Band per tier.
 *
 * The v2 version of this file was ~1400 LOC of hand-rolled rows. Here we
 * express every option as a `Field` in `FIELDS` and let one renderer walk
 * the list. Adding a new option = one line in `FIELDS`, not a new Row.
 *
 * State lives in module state directly — the panel writes on every change.
 * (Per-card draft/dirty behaviour lands in the larger editor panels
 * where keystroke commits would cause visible grid churn. Here the
 * actions are discrete enough that auto-commit is the right default.)
 */
import { useCallback } from 'react';
import { Switch } from '../../ui/shadcn/switch';
import { Select } from '../../ui/shadcn/select';
import {
  Band,
  Caps,
  IconInput,
  Row,
  Stepper,
} from '../../ui/settings';
import { useModuleState } from '../../hooks/useModuleState';
import type { GeneralSettingsState } from './state';
import type { SettingsPanelProps } from '../../platform/types';

const GENERAL_SETTINGS_MODULE_ID = 'general-settings';

// ─── Schema ─────────────────────────────────────────────────────────────────

type K = keyof GeneralSettingsState;

type BoolField   = { kind: 'bool'; key: K; label: string; hint?: string };
type NumField    = { kind: 'num'; key: K; label: string; hint?: string; min?: number; max?: number; step?: number };
type TextField   = { kind: 'text'; key: K; label: string; hint?: string; placeholder?: string };
type SelectField = { kind: 'select'; key: K; label: string; hint?: string; options: { value: string; label: string }[]; nullable?: boolean };
type OptNumField = { kind: 'optNum'; key: K; label: string; hint?: string; min?: number; max?: number };
type Field = BoolField | NumField | TextField | SelectField | OptNumField;

interface Tier {
  index: string;
  title: string;
  fields: Field[];
}

const b = (key: K, label: string, hint?: string): BoolField => ({ kind: 'bool', key, label, hint });
const n = (key: K, label: string, opts?: Omit<NumField, 'kind' | 'key' | 'label'>): NumField =>
  ({ kind: 'num', key, label, ...opts });
const txt = (key: K, label: string, opts?: Omit<TextField, 'kind' | 'key' | 'label'>): TextField =>
  ({ kind: 'text', key, label, ...opts });
const sel = (
  key: K,
  label: string,
  options: { value: string; label: string }[],
  opts?: { hint?: string; nullable?: boolean },
): SelectField => ({ kind: 'select', key, label, options, ...opts });
const on = (key: K, label: string, opts?: { hint?: string; min?: number; max?: number }): OptNumField =>
  ({ kind: 'optNum', key, label, ...opts });

const TIERS: Tier[] = [
  {
    index: '01',
    title: 'Essential',
    fields: [
      n('rowHeight', 'Row height', { min: 16, max: 200 }),
      n('headerHeight', 'Header height', { min: 16, max: 200 }),
      b('pagination', 'Pagination'),
      n('paginationPageSize', 'Page size', { min: 1 }),
      b('paginationAutoPageSize', 'Auto page size'),
      b('suppressPaginationPanel', 'Hide pagination panel'),
      sel('rowSelection', 'Row selection', [
        { value: 'singleRow', label: 'Single row' },
        { value: 'multiRow',  label: 'Multi row' },
      ], { nullable: true }),
      b('checkboxSelection', 'Checkbox selection'),
      b('cellSelection', 'Cell selection'),
      b('rowDragging', 'Row dragging'),
      b('animateRows', 'Animate rows'),
      n('cellFlashDuration', 'Cell flash ms', { min: 0 }),
      n('cellFadeDuration', 'Cell fade ms', { min: 0 }),
      txt('quickFilterText', 'Quick filter'),
    ],
  },
  {
    index: '02',
    title: 'Grouping, Pivoting, Aggregation',
    fields: [
      sel('groupDisplayType', 'Group display type', [
        { value: 'singleColumn',    label: 'Single column' },
        { value: 'multipleColumns', label: 'Multiple columns' },
        { value: 'groupRows',       label: 'Group rows' },
        { value: 'custom',          label: 'Custom' },
      ], { nullable: true }),
      n('groupDefaultExpanded', 'Group default expanded', { hint: '0 none · -1 all · N levels' }),
      sel('rowGroupPanelShow', 'Row-group panel', [
        { value: 'always',            label: 'Always' },
        { value: 'onlyWhenGrouping',  label: 'Only when grouping' },
        { value: 'never',             label: 'Never' },
      ]),
      b('pivotMode', 'Pivot mode'),
      sel('pivotPanelShow', 'Pivot panel', [
        { value: 'always',            label: 'Always' },
        { value: 'onlyWhenPivoting',  label: 'Only when pivoting' },
        { value: 'never',             label: 'Never' },
      ]),
      sel('grandTotalRow', 'Grand total row', [
        { value: 'top',          label: 'Top' },
        { value: 'bottom',       label: 'Bottom' },
        { value: 'pinnedTop',    label: 'Pinned top' },
        { value: 'pinnedBottom', label: 'Pinned bottom' },
      ], { nullable: true }),
      sel('groupTotalRow', 'Group total row', [
        { value: 'top',    label: 'Top' },
        { value: 'bottom', label: 'Bottom' },
      ], { nullable: true }),
      b('groupHideOpenParents', 'Hide open parents'),
      b('suppressAggFuncInHeader', 'Suppress aggFunc in header'),
      b('showOpenedGroup', 'Show opened group'),
      b('groupHideColumnsUntilExpanded', 'Hide columns until expanded'),
      b('groupAllowUnbalanced', 'Allow unbalanced groups'),
      b('groupMaintainOrder', 'Maintain group order on sort'),
      b('suppressGroupRowsSticky', 'Disable sticky group rows'),
      b('rowGroupPanelSuppressSort', 'Suppress sort on group pills'),
      n('groupLockGroupColumns', 'Lock group columns', { hint: '0 none · -1 all · N cols' }),
      b('ssrmExpandAllAffectsAllRows', 'SSRM expandAll covers all rows'),
      b('refreshAfterGroupEdit', 'Refresh after group edit'),
    ],
  },
  {
    index: '03',
    title: 'Filter, Sort, Clipboard',
    fields: [
      b('enableAdvancedFilter', 'Advanced filter'),
      b('includeHiddenColumnsInQuickFilter', 'Include hidden cols in quick filter'),
      sel('multiSortMode', 'Multi-sort', [
        { value: 'replace', label: 'Replace' },
        { value: 'shift',   label: 'Shift (default)' },
        { value: 'ctrl',    label: 'Ctrl' },
        { value: 'always',  label: 'Always' },
      ]),
      b('accentedSort', 'Accented sort'),
      b('copyHeadersToClipboard', 'Copy headers to clipboard'),
      txt('clipboardDelimiter', 'Clipboard delimiter'),
    ],
  },
  {
    index: '04',
    title: 'Editing & Interaction',
    fields: [
      b('singleClickEdit', 'Single-click edit'),
      b('stopEditingWhenCellsLoseFocus', 'Stop editing on blur'),
      sel('enterNavigation', 'Enter navigation', [
        { value: 'default',   label: 'Default' },
        { value: 'always',    label: 'Always down' },
        { value: 'afterEdit', label: 'After edit' },
        { value: 'both',      label: 'Both' },
      ]),
      b('undoRedoCellEditing', 'Undo / redo'),
      n('undoRedoCellEditingLimit', 'Undo limit', { min: 0 }),
      n('tooltipShowDelay', 'Tooltip delay ms', { min: 0 }),
      sel('tooltipShowMode', 'Tooltip mode', [
        { value: 'standard',      label: 'Standard' },
        { value: 'whenTruncated', label: 'When truncated' },
      ]),
    ],
  },
  {
    index: '05',
    title: 'Styling',
    fields: [
      b('suppressRowHoverHighlight', 'No row hover highlight'),
      b('columnHoverHighlight', 'Column hover highlight'),
    ],
  },
  {
    index: '06',
    title: 'Default Column',
    fields: [
      b('defaultResizable', 'Resizable'),
      n('defaultMinWidth', 'Min width', { min: 0 }),
      on('defaultMaxWidth', 'Max width (px)', { min: 0 }),
      on('defaultWidth', 'Width (px)', { min: 0 }),
      on('defaultFlex', 'Flex'),
      b('suppressSizeToFit', 'Suppress size-to-fit'),
      b('suppressAutoSize', 'Suppress auto-size'),
      b('defaultSortable', 'Sortable'),
      b('defaultFilterable', 'Filterable'),
      b('unSortIcon', 'Un-sort icon'),
      b('floatingFilter', 'Floating filter'),
      b('defaultEditable', 'Editable'),
      b('suppressPaste', 'Suppress paste'),
      b('suppressNavigable', 'Skip keyboard nav'),
      b('wrapHeaderText', 'Wrap header text'),
      b('autoHeaderHeight', 'Auto header height'),
      b('suppressHeaderMenuButton', 'Hide header menu button'),
      b('suppressMovable', 'Suppress movable'),
      b('lockVisible', 'Lock visible'),
      b('lockPinned', 'Lock pinned'),
      b('wrapText', 'Wrap cell text'),
      b('autoHeight', 'Auto row height'),
      b('enableCellChangeFlash', 'Cell change flash'),
      b('enableRowGroup', 'Enable row group'),
      b('enablePivot', 'Enable pivot'),
      b('enableValue', 'Enable value'),
    ],
  },
  {
    index: '07',
    title: 'Performance',
    fields: [
      n('rowBuffer', 'Row buffer', { min: 0, hint: 'Live-editable' }),
      b('suppressScrollOnNewData', 'Suppress scroll on new data'),
      b('suppressColumnVirtualisation', 'Suppress column virtualisation'),
      b('suppressRowVirtualisation', 'Suppress row virtualisation'),
      b('suppressMaxRenderedRowRestriction', 'No max-rendered-row cap'),
      b('suppressAnimationFrame', 'Suppress animation frame'),
      b('debounceVerticalScrollbar', 'Debounce vertical scrollbar'),
      b('enableCellTextSelection', 'Enable cell text selection'),
      b('suppressDragLeaveHidesColumns', 'Drag-leave does not hide cols'),
      b('suppressColumnMoveAnimation', 'No column move animation'),
    ],
  },
];

// ─── Field controls ─────────────────────────────────────────────────────────

function BoolControl({ v, set }: { v: boolean; set: (next: boolean) => void }) {
  return (
    <Switch
      checked={!!v}
      onChange={(e) => set((e.target as HTMLInputElement).checked)}
    />
  );
}

function NumControl({
  v, set, min, max, step,
}: { v: number; set: (n: number) => void; min?: number; max?: number; step?: number }) {
  return <Stepper value={v} onChange={set} min={min} max={max} step={step} />;
}

function TextControl({
  v, set, placeholder,
}: { v: string; set: (s: string) => void; placeholder?: string }) {
  return <IconInput value={v ?? ''} onCommit={set} placeholder={placeholder} />;
}

function OptNumControl({
  v, set, min, max,
}: { v: number | undefined; set: (n: number | undefined) => void; min?: number; max?: number }) {
  return (
    <IconInput
      value={v === undefined ? '' : String(v)}
      numeric
      onCommit={(raw) => {
        if (raw.trim() === '') { set(undefined); return; }
        const n = Number(raw);
        if (!Number.isFinite(n)) return;
        if (min !== undefined && n < min) return;
        if (max !== undefined && n > max) return;
        set(n);
      }}
      placeholder="auto"
    />
  );
}

function SelectControl({
  v, set, options, nullable,
}: {
  v: string | undefined;
  set: (val: string | undefined) => void;
  options: { value: string; label: string }[];
  nullable?: boolean;
}) {
  const opts = nullable ? [{ value: '', label: '—' }, ...options] : options;
  return (
    <Select
      value={v ?? ''}
      onChange={(e) => {
        const next = e.target.value;
        set(nullable && next === '' ? undefined : next);
      }}
    >
      {opts.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </Select>
  );
}

// ─── Panel ──────────────────────────────────────────────────────────────────

export function GridOptionsPanel(_props: SettingsPanelProps) {
  const [state, setState] = useModuleState<GeneralSettingsState>(GENERAL_SETTINGS_MODULE_ID);
  const update = useCallback(
    <F extends K>(key: F, value: GeneralSettingsState[F]) => {
      setState((prev) => ({ ...prev, [key]: value }));
    },
    [setState],
  );

  return (
    <div className="gc-sheet gc-panel-general-settings" style={{ padding: '0 16px 24px' }}>
      <header style={{
        padding: '12px 0 4px',
        borderBottom: '1px solid var(--ck-border)',
        marginBottom: 4,
      }}>
        <Caps size={11}>Grid Options</Caps>
      </header>

      {TIERS.map((tier) => (
        <Band key={tier.index} index={tier.index} title={tier.title}>
          {tier.fields.map((f) => (
            <Row
              key={f.key as string}
              label={f.label}
              hint={f.hint}
              testId={`gs-${String(f.key)}`}
              control={renderControl(f, state, update)}
            />
          ))}
        </Band>
      ))}
    </div>
  );
}

function renderControl(
  f: Field,
  state: GeneralSettingsState,
  update: <FK extends K>(k: FK, v: GeneralSettingsState[FK]) => void,
) {
  const v = state[f.key];
  switch (f.kind) {
    case 'bool':
      return <BoolControl v={v as boolean} set={(n) => update(f.key, n as never)} />;
    case 'num':
      return <NumControl v={(v as number) ?? 0} set={(n) => update(f.key, n as never)} min={f.min} max={f.max} step={f.step} />;
    case 'text':
      return <TextControl v={(v as string) ?? ''} set={(s) => update(f.key, s as never)} placeholder={f.placeholder} />;
    case 'optNum':
      return <OptNumControl v={v as number | undefined} set={(n) => update(f.key, n as never)} min={f.min} max={f.max} />;
    case 'select':
      return (
        <SelectControl
          v={v === undefined || v === null ? undefined : String(v)}
          set={(next) => update(f.key, next as never)}
          options={f.options}
          nullable={f.nullable}
        />
      );
  }
}
