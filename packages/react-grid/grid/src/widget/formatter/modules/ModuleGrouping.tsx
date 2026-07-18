/**
 * 06 · GROUP — row-grouping for the selected column(s) PLUS a popover of
 * grid-wide grouping / total settings.
 *
 *   Per-column (inline, selection-scoped):
 *     • Enable Row Group — toggles `enableRowGroup` (capability flag only).
 *     • Agg Function — sets `aggFunc` (+ `enableValue`); "None" clears both.
 *
 *   Grid-wide (popover, always enabled — these apply to the whole grid):
 *     • Hide Agg in Header   → suppressAggFuncInHeader
 *     • Group Sub-Total Row  → groupTotalRow   (Off / Top / Bottom)
 *     • Grand Total Row      → grandTotalRow   (Off / Top / Bottom / Pinned …)
 *     • Group Display        → groupDisplayType
 *     • Row Group Panel      → rowGroupPanelShow
 *
 * Grid-wide settings write to `general-settings` (persisted with the active
 * profile, applied live by `transformGridOptions`).
 */
import type { ReactNode } from 'react';
import { EyeOff, Group, SlidersHorizontal } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@wellsfargo-starui/ui';
import type { AggFuncName } from '@wellsfargo-starui/grid/customizer';
import { Hair, Module, Pill, PillButton, ToolbarSelect } from '../primitives';
import type { FormatterActions, FormatterState } from '../state';

const AGG_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'None' },
  { value: 'sum', label: 'Sum' },
  { value: 'min', label: 'Min' },
  { value: 'max', label: 'Max' },
  { value: 'count', label: 'Count' },
  { value: 'avg', label: 'Avg' },
  { value: 'first', label: 'First' },
  { value: 'last', label: 'Last' },
];

const GROUP_TOTAL_OPTIONS = [
  { value: '', label: 'Off' },
  { value: 'top', label: 'Top' },
  { value: 'bottom', label: 'Bottom' },
];

const GRAND_TOTAL_OPTIONS = [
  { value: '', label: 'Off' },
  { value: 'top', label: 'Top' },
  { value: 'bottom', label: 'Bottom' },
  { value: 'pinnedTop', label: 'Pinned Top' },
  { value: 'pinnedBottom', label: 'Pinned Bottom' },
];

const GROUP_DISPLAY_OPTIONS = [
  { value: 'singleColumn', label: 'Single Column' },
  { value: 'multipleColumns', label: 'Multiple Columns' },
  { value: 'groupRows', label: 'Group Rows' },
  { value: 'custom', label: 'Custom' },
];

const ROW_GROUP_PANEL_OPTIONS = [
  { value: 'never', label: 'Never' },
  { value: 'onlyWhenGrouping', label: 'Only When Grouping' },
  { value: 'always', label: 'Always' },
];

/** One labeled row in the grid-wide grouping popover. */
function OptionRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function GridGroupingOptions({
  state,
  actions,
}: {
  state: FormatterState;
  actions: FormatterActions;
}) {
  const g = state.grouping;
  return (
    <div className="flex flex-col gap-2.5" data-testid="fmt-grouping-options-body">
      <OptionRow label="Hide Agg in Header">
        <Pill
          tooltip="Hide aggregation function name in column headers"
          active={g.suppressAggFuncInHeader}
          onClick={actions.toggleHideAggInHeader}
          data-testid="fmt-hide-agg-in-header"
          aria-label="Hide agg in header"
        >
          <EyeOff size={13} strokeWidth={2} />
        </Pill>
      </OptionRow>
      <OptionRow label="Group Sub-Total Row">
        <ToolbarSelect
          value={g.groupTotalRow}
          options={GROUP_TOTAL_OPTIONS}
          aria-label="Group sub-total row"
          data-testid="fmt-group-total-row"
          onValueChange={(v) => actions.setGroupTotalRow(v as 'top' | 'bottom' | undefined)}
        />
      </OptionRow>
      <OptionRow label="Grand Total Row">
        <ToolbarSelect
          value={g.grandTotalRow}
          options={GRAND_TOTAL_OPTIONS}
          aria-label="Grand total row"
          data-testid="fmt-grand-total-row"
          onValueChange={(v) =>
            actions.setGrandTotalRow(v as 'top' | 'bottom' | 'pinnedTop' | 'pinnedBottom' | undefined)
          }
        />
      </OptionRow>
      <OptionRow label="Group Display">
        <ToolbarSelect
          value={g.groupDisplayType ?? 'singleColumn'}
          options={GROUP_DISPLAY_OPTIONS}
          aria-label="Group display"
          data-testid="fmt-group-display"
          onValueChange={(v) =>
            actions.setGroupDisplayType(
              (v as 'singleColumn' | 'multipleColumns' | 'groupRows' | 'custom' | undefined) ??
                'singleColumn',
            )
          }
        />
      </OptionRow>
      <OptionRow label="Row Group Panel">
        <ToolbarSelect
          value={g.rowGroupPanelShow}
          options={ROW_GROUP_PANEL_OPTIONS}
          aria-label="Row group panel"
          data-testid="fmt-row-group-panel"
          onValueChange={(v) =>
            actions.setRowGroupPanelShow(
              (v as 'never' | 'onlyWhenGrouping' | 'always' | undefined) ?? 'always',
            )
          }
        />
      </OptionRow>
    </div>
  );
}

export function ModuleGrouping({
  state,
  actions,
}: {
  state: FormatterState;
  actions: FormatterActions;
}) {
  const { fmt, disabled } = state;

  return (
    <Module index="06" label="Group" testId="fmt-module-grouping">
      <Pill
        disabled={disabled}
        tooltip="Enable row group — make column groupable"
        active={!!fmt.enableRowGroup}
        onClick={actions.toggleEnableRowGroup}
        data-testid="fmt-enable-row-group"
        aria-label="Enable row group"
      >
        <Group size={13} strokeWidth={2} />
      </Pill>
      <Hair />
      <ToolbarSelect
        disabled={disabled}
        value={fmt.aggFunc}
        options={AGG_OPTIONS}
        tooltip="Aggregation function"
        aria-label="Aggregation function"
        data-testid="fmt-agg-func"
        onValueChange={(next) => actions.setAggFunc((next as AggFuncName | undefined) ?? null)}
      />
      <Hair />
      <Popover>
        <PopoverTrigger asChild>
          <PillButton
            aria-label="Grouping options"
            title="Grouping options"
            data-testid="fmt-grouping-options"
          >
            <SlidersHorizontal size={13} strokeWidth={2} />
          </PillButton>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-3">
          <GridGroupingOptions state={state} actions={actions} />
        </PopoverContent>
      </Popover>
    </Module>
  );
}
