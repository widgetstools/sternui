/**
 * 01 · CONTEXT — column label + scope toggle + undo/redo + preview.
 *
 * Renders identical content in both surfaces. The shell's
 * `.fx-shell--horizontal` / `.fx-shell--vertical` parent class switches
 * the context strip between an inline row (toolbar) and a sticky
 * header (panel) via the stylesheet.
 */
import { Undo2, Redo2 } from 'lucide-react';
import { Tooltip } from '@grid-customizer/core';
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

      <Tooltip content={state.colIds.length > 0 ? state.colIds.join(', ') : 'Click a cell or header to pick a column'}>
        <div>
          <ColumnLabel
            colLabel={state.colLabel}
            disabled={state.disabled}
            testId="formatting-col-label"
          />
        </div>
      </Tooltip>

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
