/**
 * 01 · CONTEXT — column label + scope toggle + undo/redo + preview.
 *
 * Renders identical content in both surfaces. The shell's
 * `.fx-shell--horizontal` / `.fx-shell--vertical` parent class switches
 * the context strip between an inline row (toolbar) and a sticky
 * header (panel) via the stylesheet.
 */
import { useEffect, useRef, useState } from 'react';
import { Pencil, Lock, Undo2, Redo2 } from 'lucide-react';
import { Tooltip } from '@marketsui/core';
import {
  ColumnLabel,
  Pill,
  PreviewReadout,
  ScopeToggle,
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
    <div className="fx-ctx" data-module-index="01">
      <ScopeToggle
        target={state.target}
        onToggle={() => actions.setTarget(state.target === 'cell' ? 'header' : 'cell')}
        testId="formatting-target-toggle"
      />
      {/* Hidden siblings preserve the legacy testids that integration
          tests query (`formatting-target-cell`, `formatting-target-header`).
          They flip the scope to a specific value programmatically without
          having to multi-click the toggle. */}
      <button
        type="button"
        data-testid="formatting-target-cell"
        onClick={() => actions.setTarget('cell')}
        onMouseDown={(e) => e.preventDefault()}
        tabIndex={-1}
        aria-hidden
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          opacity: 0,
          pointerEvents: state.target === 'cell' ? 'none' : 'auto',
        }}
      />
      <button
        type="button"
        data-testid="formatting-target-header"
        onClick={() => actions.setTarget('header')}
        onMouseDown={(e) => e.preventDefault()}
        tabIndex={-1}
        aria-hidden
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          opacity: 0,
          pointerEvents: state.target === 'header' ? 'none' : 'auto',
        }}
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

      <div style={{ marginLeft: 'auto' }}>
        <PreviewReadout value={state.previewText} testId="fmt-preview-chip" />
      </div>
    </div>
  );
}
