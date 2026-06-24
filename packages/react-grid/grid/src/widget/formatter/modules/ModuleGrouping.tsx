/**
 * 06 · GROUP — row-grouping capability + aggregation for the selected
 * column(s). Writes to the column-customization assignment's `rowGrouping`
 * slot (persisted with the active profile / templates like every other
 * formatter action).
 *
 *   • Enable Row Group — toggles `enableRowGroup` (capability flag only:
 *     the column becomes draggable into the row-group panel; the grid is
 *     NOT grouped until the user drags it).
 *   • Agg Function — sets `aggFunc` (+ `enableValue`); "None" clears both.
 */
import { Group } from 'lucide-react';
import type { AggFuncName } from '@starui/grid/customizer';
import { Hair, Module, Pill, ToolbarSelect } from '../primitives';
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
    </Module>
  );
}
