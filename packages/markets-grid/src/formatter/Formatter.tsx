/**
 * Orchestrator — composes the modules at both orientations and hosts
 * the shared AlertDialog for the destructive Clear-all action.
 *
 * Two top-level renderers:
 *   - `<FormatterToolbar />`  — horizontal strip, in-grid usage
 *   - `<FormatterPanel />`    — vertical inspector, popped-out usage
 *
 * Both consume `useFormatter()` for state + actions; they differ only
 * in CSS class on the shell + how the modules are sequenced.
 *
 * Pop-out lifecycle (browser window.open / OpenFin) is handled by the
 * `<Poppable />` host above this layer in `FormattingToolbar.tsx`;
 * these components are pure render functions that take props.
 */

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@marketsui/core';
import { ModuleClear } from './modules/ModuleClear';
import { ModuleContext } from './modules/ModuleContext';
import { ModuleFormat } from './modules/ModuleFormat';
import { ModuleLibrary } from './modules/ModuleLibrary';
import { ModulePaint } from './modules/ModulePaint';
import { ModuleType } from './modules/ModuleType';
import { ModuleDivider, TitleBar } from './primitives';
import './formatter.css';
import type { FormatterActions, FormatterState } from './state';

// ─── Shared confirm dialog ────────────────────────────────────────

export function ClearAllDialog({
  state,
  actions,
}: {
  state: FormatterState;
  actions: FormatterActions;
}) {
  return (
    <AlertDialog open={state.clearDialogOpen} onOpenChange={actions.setClearDialogOpen}>
      <AlertDialogContent data-testid="formatting-clear-all-confirm">
        <AlertDialogHeader>
          <AlertDialogTitle>Clear all styles?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes every column's cell + header styling, value
            formatters, border overrides, filter config, and template
            references from the active profile. Saved templates are not
            affected. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={actions.confirmClearAll}
            data-testid="formatting-clear-all-confirm-btn"
          >
            Clear all styles
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function ClearSelectedDialog({
  state,
  actions,
}: {
  state: FormatterState;
  actions: FormatterActions;
}) {
  const count = state.colIds.length;
  const scopeLabel = count === 0
    ? 'no columns'
    : count === 1
      ? `column "${state.colLabel}"`
      : `${count} columns`;
  return (
    <AlertDialog
      open={state.clearSelectedDialogOpen}
      onOpenChange={actions.setClearSelectedDialogOpen}
    >
      <AlertDialogContent data-testid="formatting-clear-selected-confirm">
        <AlertDialogHeader>
          <AlertDialogTitle>Clear styles for {scopeLabel}?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes the cell + header styling, value formatter,
            border overrides, filter config, and template references
            from {scopeLabel} in the active profile. Saved templates
            and other columns are not affected. This action cannot be
            undone (use Undo if you change your mind).
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={actions.confirmClearSelected}
            data-testid="formatting-clear-selected-confirm-btn"
          >
            Clear styles
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ─── Horizontal — in-grid toolbar ─────────────────────────────────

export function FormatterToolbar({
  state,
  actions,
  popoutSlot,
}: {
  state: FormatterState;
  actions: FormatterActions;
  /** Optional pop-out trigger button. Hosted here (top-right corner)
   *  so the layout doesn't have to leave room for it inside the row. */
  popoutSlot?: React.ReactNode;
}) {
  return (
    <div
      className="fx-shell fx-shell--horizontal"
      data-testid="formatting-toolbar"
      onMouseDown={(e) => {
        const tag = (e.target as HTMLElement).tagName;
        if (tag !== 'SELECT' && tag !== 'INPUT' && tag !== 'OPTION') e.preventDefault();
      }}
    >
      <ModuleContext state={state} actions={actions} />
      <ModuleDivider />
      <ModuleType state={state} actions={actions} />
      <ModuleDivider />
      <ModulePaint state={state} actions={actions} />
      <ModuleDivider />
      <ModuleFormat state={state} actions={actions} />
      <ModuleDivider />
      <ModuleLibrary state={state} actions={actions} orientation="horizontal" colLabel={state.colLabel} />
      <ModuleDivider />
      <ModuleClear state={state} actions={actions} orientation="horizontal" />

      {popoutSlot}
    </div>
  );
}

// ─── Vertical — popped panel ──────────────────────────────────────

export function FormatterPanel({
  state,
  actions,
  frameless,
  onClose,
  titleText,
}: {
  state: FormatterState;
  actions: FormatterActions;
  frameless?: boolean;
  onClose?: () => void;
  titleText?: string;
}) {
  return (
    <div
      className="fx-shell fx-shell--vertical"
      data-testid="formatting-properties-panel"
    >
      {frameless && titleText && onClose && (
        <TitleBar text={titleText} onClose={onClose} testId="fmt-panel-titlebar" />
      )}

      <header data-testid="fmt-panel-header" className="fx-ctx" style={{ position: 'relative' }}>
        <ModuleContext state={state} actions={actions} />
      </header>

      <div className="fx-body" data-testid="fmt-panel-body">
        <ModuleType state={state} actions={actions} />
        <ModulePaint state={state} actions={actions} />
        <ModuleFormat state={state} actions={actions} />
        <ModuleLibrary state={state} actions={actions} orientation="vertical" colLabel={state.colLabel} />
      </div>

      <footer className="fx-footer">
        <ModuleClear state={state} actions={actions} orientation="vertical" />
      </footer>
    </div>
  );
}
