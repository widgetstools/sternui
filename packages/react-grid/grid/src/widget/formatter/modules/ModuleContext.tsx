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
import { Tooltip } from '@starui/grid/customizer';
import { cn, Input } from '@starui/ui';
import {
  ColumnLabel,
  Hair,
  Pill,
  SegmentedToggle,
  formatterColEditIconClass,
  formatterColEditablePanelClass,
  formatterColEditableToolbarClass,
  formatterColPanelClass,
  formatterColToolbarClass,
  type FormatterSurface,
} from '../primitives';
import type { FormatterActions, FormatterState } from '../state';

interface Props {
  state: FormatterState;
  actions: FormatterActions;
  surface?: FormatterSurface;
  inPanelHeader?: boolean;
}

function InlineColumnLabel({
  colLabel,
  disabled,
  onCommit,
  surface = 'toolbar',
}: {
  colLabel: string;
  disabled?: boolean;
  onCommit: (next: string) => void;
  surface?: FormatterSurface;
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
    // Inline rename editor — shadcn Input styled to fit the toolbar
    // rhythm (28px height, mono font, brand-ring on focus). All visual
    // properties resolve through `@starui/design-system` tokens; no
    // `.fx-col-input` CSS class needed.
    return (
      <Input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
          else if (e.key === 'Escape') { e.preventDefault(); setDraft(colLabel); setEditing(false); }
        }}
        onBlur={commit}
        data-testid="formatting-col-label-input"
        aria-label="Rename column"
        className="h-7 min-w-[160px] max-w-[200px] px-2.5 py-0 font-mono text-[11px] border-[color:var(--ds-primary)] shadow-none focus-visible:ring-2 focus-visible:ring-[color:var(--ds-primary-ring)]"
      />
    );
  }

  return (
    <Tooltip content={disabled ? 'Select a single column to rename' : 'Click to rename column'}>
      <button
        type="button"
        className={cn(
          'group',
          surface === 'panel' ? formatterColPanelClass : formatterColToolbarClass,
          surface === 'panel' ? formatterColEditablePanelClass : formatterColEditableToolbarClass,
        )}
        data-disabled={disabled ? 'true' : undefined}
        data-testid="formatting-col-label"
        disabled={disabled}
        onClick={() => { if (!disabled) setEditing(true); }}
        onMouseDown={(e) => e.preventDefault()}
      >
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0 bg-[color:var(--ds-primary)] shadow-[0_0_6px_var(--ds-primary)] animate-[fxLivePulse_1.6s_ease-in-out_infinite]"
          aria-hidden
        />
        <span className="truncate">{colLabel}</span>
        <Pencil size={10} strokeWidth={1.75} className={formatterColEditIconClass} aria-hidden />
      </button>
    </Tooltip>
  );
}

export function ModuleContext({
  state,
  actions,
  surface = 'toolbar',
  inPanelHeader,
}: Props) {
  return (
    <div
      className={cn(
        'fx-ctx flex items-center flex-wrap shrink-0 min-w-0',
        surface === 'toolbar' ? 'gap-2 max-w-full' : 'gap-2.5 row-gap-2',
        inPanelHeader && 'h-auto min-h-0 p-0 overflow-visible static border-0 bg-transparent',
      )}
      data-module-index="01"
      data-target={state.target}
      data-scope={state.scope}
    >
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
          surface={surface}
        />
      ) : (
        <Tooltip content={state.colIds.length > 0 ? state.colIds.join(', ') : 'Click a cell or header to pick a column'}>
          <div>
            <ColumnLabel
              colLabel={state.colLabel}
              disabled={state.disabled}
              testId="formatting-col-label"
              surface={surface}
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

      <Hair toolbar={surface === 'toolbar'} />
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

      <div className="inline-flex items-center gap-1.5 ml-auto shrink-0">
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
