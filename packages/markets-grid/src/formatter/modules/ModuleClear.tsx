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
import { Check, Eraser, Trash2 } from 'lucide-react';
import { Tooltip } from '@marketsui/core';
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
  const selectedTitle = state.disabled
    ? 'Select a cell or column to clear its styles'
    : state.colIds.length === 1
      ? `Clear styling, value formatter, borders, filter, and template references for "${state.colLabel}"`
      : `Clear styling, value formatter, borders, filter, and template references for ${state.colIds.length} selected columns`;

  const SelBtn = (
    <button
      type="button"
      onClick={actions.requestClearSelected}
      disabled={state.disabled}
      data-testid={orientation === 'horizontal' ? 'formatting-clear-selected' : 'fmt-panel-clear-selected'}
      className="fx-destruct"
      data-confirmed={state.clearSelectedConfirmed ? 'true' : undefined}
      title={selectedTitle}
      aria-label="Clear styles for selected column(s)"
    >
      {state.clearSelectedConfirmed
        ? <Check size={13} strokeWidth={2.5} />
        : <Eraser size={13} strokeWidth={1.75} />}
      <span className="fx-destruct__lbl">Clear selected</span>
    </button>
  );

  const AllBtn = (
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
    return (
      <>
        <Tooltip content={selectedTitle}>{SelBtn}</Tooltip>
        <Tooltip content="Clear all styles in this profile">{AllBtn}</Tooltip>
      </>
    );
  }
  return (
    <>
      {SelBtn}
      {AllBtn}
    </>
  );
}
