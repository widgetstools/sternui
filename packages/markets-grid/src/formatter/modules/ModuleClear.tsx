/**
 * ⊘ DESTRUCT — clear all column-customization styles in this profile.
 *
 * Always last in the module sequence. The actual confirm AlertDialog
 * is mounted once at the orchestrator level so both surfaces share a
 * single dialog instance — this module just renders the trigger.
 *
 * Renders as an icon-only pill in horizontal mode (saves space) and
 * as a full destructive button in vertical mode (matches the panel's
 * footer affordance).
 */
import { Check, Trash2 } from 'lucide-react';
import { Tooltip } from '@grid-customizer/core';
import type { Orientation } from '../primitives';
import type { FormatterActions, FormatterState } from '../state';

export function ModuleClear({
  state,
  actions,
  orientation,
}: {
  state: FormatterState;
  actions: FormatterActions;
  orientation: Orientation;
}) {
  const Btn = (
    <button
      type="button"
      onClick={actions.requestClearAll}
      data-testid={orientation === 'horizontal' ? 'formatting-clear-all' : 'fmt-panel-clear-all'}
      className="fx-destruct"
      data-confirmed={state.clearConfirmed ? 'true' : undefined}
      title="Clear every column's styling, value formatter, borders, filter config, and template references from this profile"
      aria-label="Clear all styles in this profile"
    >
      {state.clearConfirmed
        ? <Check size={13} strokeWidth={2.5} />
        : <Trash2 size={13} strokeWidth={1.75} />}
      <span className="fx-destruct__lbl">Clear all styles</span>
    </button>
  );

  if (orientation === 'horizontal') {
    return <Tooltip content="Clear all styles in this profile">{Btn}</Tooltip>;
  }
  return Btn;
}
