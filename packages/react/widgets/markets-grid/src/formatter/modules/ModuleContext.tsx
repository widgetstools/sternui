/**
 * 01 · CONTEXT — column label + scope toggle + undo/redo.
 *
 * Renders identical content in both surfaces. The shell's
 * `.fx-shell--horizontal` / `.fx-shell--vertical` parent class switches
 * the context strip between an inline row (toolbar) and a sticky
 * header (panel) via the stylesheet.
 */
import { useEffect, useRef, useState } from 'react';
import {
  CaseUpper,
  Grid2x2,
  Lock,
  MessageSquareText,
  MousePointer2,
  PanelTop,
  Pencil,
  Redo2,
  Table2,
  Undo2,
} from 'lucide-react';
import { Tooltip } from '@starui/grid-react';
import {
  ColumnLabel,
  Hair,
  Pill,
  SegmentedToggle,
} from '../primitives';
import type { FormatterActions, FormatterState } from '../state';

interface Props {
  state: FormatterState;
  actions: FormatterActions;
}

function InlineColumnLabel({
  colLabel,
  disabled,
  onCommit,
}: {
  colLabel: string;
  disabled?: boolean;
  onCommit: (next: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(colLabel);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(colLabel);
  }, [colLabel, editing]);

  useEffect(() => {
    if (editing) {
      // Defer focus until after Radix popovers / portals settle so the
      // input keeps the caret instead of having focus stolen back to
      // whatever previously had it.
      const id = window.setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 0);
      return () => window.clearTimeout(id);
    }
  }, [editing]);

  if (editing) {
    const commit = () => {
      const trimmed = draft.trim();
      // Only fire onCommit when the value actually changed — avoids a
      // no-op undo entry when the user opens then dismisses the editor.
      if (trimmed && trimmed !== colLabel) onCommit(trimmed);
      else if (!trimmed) onCommit('');
      setEditing(false);
    };
    return (
      <input
        ref={inputRef}
        className="fx-col-input"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
          else if (e.key === 'Escape') { e.preventDefault(); setDraft(colLabel); setEditing(false); }
        }}
        onBlur={commit}
        data-testid="formatting-col-label-input"
        aria-label="Rename column"
      />
    );
  }

  return (
    <Tooltip content={disabled ? 'Select a single column to rename' : 'Click to rename column'}>
      <button
        type="button"
        className="fx-col fx-col--editable"
        data-disabled={disabled ? 'true' : undefined}
        data-testid="formatting-col-label"
        disabled={disabled}
        onClick={() => { if (!disabled) setEditing(true); }}
        onMouseDown={(e) => e.preventDefault()}
      >
        <span className="fx-col__dot" aria-hidden />
        <span className="fx-col__name">{colLabel}</span>
        <Pencil size={10} strokeWidth={1.75} className="fx-col__edit" aria-hidden />
      </button>
    </Tooltip>
  );
}

export function ModuleContext({ state, actions }: Props) {
  return (
    <div className="fx-ctx" data-module-index="01" data-target={state.target} data-scope={state.scope}>
      {/* Two compact icon-only toggles — first thing the eye lands on.
          Together they answer "what am I editing?" (cells vs headers)
          and "for which columns?" (selected vs every column). Each
          option carries a tooltip so the meaning is one hover away. */}
      <SegmentedToggle
        value={state.target}
        options={[
          {
            value: 'cell',
            icon: <Table2 size={14} strokeWidth={1.75} aria-hidden />,
            tooltip: 'Edit cell styling',
            testId: 'formatting-target-cell',
          },
          {
            value: 'header',
            icon: <PanelTop size={14} strokeWidth={1.75} aria-hidden />,
            tooltip: 'Edit header styling',
            testId: 'formatting-target-header',
          },
        ]}
        onChange={(next) => actions.setTarget(next)}
        ariaLabel="Edit target — cells or headers"
        variant="target"
        testId="formatting-target-toggle"
      />
      <SegmentedToggle
        value={state.scope}
        options={[
          {
            value: 'selected',
            icon: <MousePointer2 size={14} strokeWidth={1.75} aria-hidden />,
            tooltip: 'Apply to selected column(s)',
            testId: 'formatting-scope-selected',
          },
          {
            value: 'all',
            icon: <Grid2x2 size={14} strokeWidth={1.75} aria-hidden />,
            tooltip: 'Apply to every column (global baseline)',
            testId: 'formatting-scope-all',
          },
        ]}
        onChange={(next) => actions.setScope(next)}
        ariaLabel="Edit scope — selected columns or all columns"
        variant="scope"
        testId="formatting-scope-toggle"
      />

      {state.singleColumnSelected ? (
        <InlineColumnLabel
          colLabel={state.colLabel}
          disabled={state.disabled}
          onCommit={actions.setHeaderName}
        />
      ) : (
        <Tooltip content={state.colIds.length > 0 ? state.colIds.join(', ') : 'Click a cell or header to pick a column'}>
          <div>
            <ColumnLabel
              colLabel={state.colLabel}
              disabled={state.disabled}
              testId="formatting-col-label"
            />
          </div>
        </Tooltip>
      )}

      <Pill
        tooltip={state.cellsEditable ? 'Cells editable — click to lock' : 'Cells locked — click to allow editing'}
        disabled={state.disabled}
        active={state.cellsEditable}
        onClick={actions.toggleEditable}
        data-testid="formatting-toggle-editable"
        aria-label="Toggle cell editing"
      >
        {state.cellsEditable ? (
          <Pencil size={12} strokeWidth={1.75} />
        ) : (
          <Lock size={12} strokeWidth={1.75} />
        )}
      </Pill>

      <Hair />
      <Pill
        tooltip={
          state.headerCaseUppercase
            ? 'Headers UPPERCASE — click to restore original case'
            : 'Make all column headers UPPERCASE'
        }
        active={state.headerCaseUppercase}
        onClick={actions.toggleHeaderCaseUppercase}
        data-testid="formatting-toggle-header-case"
        aria-label="Toggle header case (uppercase / original)"
      >
        <CaseUpper size={13} strokeWidth={2} />
      </Pill>

      <Pill
        tooltip={
          state.showCellTooltips
            ? 'Cell tooltips ON — hover shows each cell\'s value. Click to turn off.'
            : 'Show cell value as a hover tooltip across every column'
        }
        active={state.showCellTooltips}
        onClick={actions.toggleCellTooltips}
        data-testid="formatting-toggle-cell-tooltips"
        aria-label="Toggle cell tooltips"
      >
        <MessageSquareText size={12} strokeWidth={1.75} />
      </Pill>

      <div style={{ display: 'inline-flex', gap: 4 }}>
        <Pill
          tooltip="Undo"
          disabled={!state.canUndo}
          onClick={actions.undo}
          data-testid="formatting-undo"
        >
          <Undo2 size={12} strokeWidth={1.75} />
        </Pill>
        <Pill
          tooltip="Redo"
          disabled={!state.canRedo}
          onClick={actions.redo}
          data-testid="formatting-redo"
        >
          <Redo2 size={12} strokeWidth={1.75} />
        </Pill>
      </div>
    </div>
  );
}
