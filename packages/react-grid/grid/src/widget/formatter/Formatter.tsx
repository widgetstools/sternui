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

import { cn } from '@starui/ui';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@starui/grid/customizer';
import { ModuleClear } from './modules/ModuleClear';
import { ModuleContext } from './modules/ModuleContext';
import { ModuleEditorFilter } from './modules/ModuleEditorFilter';
import { ModuleFormat } from './modules/ModuleFormat';
import { ModuleLibrary } from './modules/ModuleLibrary';
import { ModulePaint } from './modules/ModulePaint';
import { ModuleType } from './modules/ModuleType';
import { PanelGroup, TitleBar, ToolbarGroup } from './primitives';
import './formatter.css';

const shellBase =
  'fx-shell relative isolate font-sans text-foreground bg-[var(--ds-surface-ground)]';
const shellHorizontal = [
  'fx-shell--horizontal flex flex-row items-start gap-0 py-2 pl-3 pr-12 min-h-7',
  'w-full max-w-full box-border bg-[var(--ds-surface-sunken)] border-b border-[color:var(--ds-border-primary)]',
].join(' ');
const shellVertical =
  'fx-shell--vertical flex flex-col h-full w-full min-h-0 min-w-0 overflow-hidden';
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
            references from the active layout. Saved templates are not
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
            from {scopeLabel} in the active layout. Saved templates
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
      className={cn(shellBase, shellHorizontal)}
      data-testid="formatting-toolbar"
      onMouseDown={(e) => {
        const tag = (e.target as HTMLElement).tagName;
        if (tag !== 'SELECT' && tag !== 'INPUT' && tag !== 'OPTION') e.preventDefault();
      }}
    >
      <div className="flex flex-1 flex-wrap items-center content-center min-w-0 gap-x-0 gap-y-2.5">
        <ToolbarGroup label="Scope" testId="fmt-group-scope">
          <ModuleContext state={state} actions={actions} />
        </ToolbarGroup>
        <ToolbarGroup label="Type" testId="fmt-group-type">
          <ModuleType state={state} actions={actions} />
        </ToolbarGroup>
        <ToolbarGroup label="Paint" testId="fmt-group-paint">
          <ModulePaint state={state} actions={actions} />
        </ToolbarGroup>
        <ToolbarGroup label="Format" testId="fmt-group-format">
          <ModuleFormat state={state} actions={actions} />
        </ToolbarGroup>
        <ToolbarGroup label="Edit" testId="fmt-group-edit">
          <ModuleEditorFilter state={state} actions={actions} />
        </ToolbarGroup>
        <ToolbarGroup label="Templates" testId="fmt-group-templates">
          <ModuleLibrary
            state={state}
            actions={actions}
            orientation="horizontal"
            colLabel={state.colLabel}
          />
        </ToolbarGroup>
        <ToolbarGroup
          label="Clear"
          variant="destruct"
          testId="fmt-group-clear"
          trail
        >
          <ModuleClear state={state} actions={actions} orientation="horizontal" />
        </ToolbarGroup>
      </div>

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
      className={cn(shellBase, shellVertical)}
      data-testid="formatting-properties-panel"
    >
      {frameless && titleText && onClose && (
        <TitleBar text={titleText} onClose={onClose} testId="fmt-panel-titlebar" />
      )}

      <header
        data-testid="fmt-panel-header"
        className="sticky top-0 z-[2] shrink-0 px-3 pt-2 pb-2.5 border-b border-[color:var(--ds-border-primary)] bg-[var(--ds-surface-ground)]"
      >
        <PanelGroup label="Scope" testId="fmt-panel-group-scope" inHeader>
          <ModuleContext
            state={state}
            actions={actions}
            surface="panel"
            inPanelHeader
          />
        </PanelGroup>
      </header>

      <div
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden [scrollbar-width:thin] [scrollbar-color:var(--ds-border-secondary)_transparent]"
        data-testid="fmt-panel-body"
      >
        <div className="fx-panel-sections flex flex-col gap-2.5 px-3.5 py-3 pb-4">
          <PanelGroup label="Type" sectionIndex="02" testId="fmt-panel-group-type">
            <ModuleType state={state} actions={actions} />
          </PanelGroup>
          <PanelGroup label="Paint" sectionIndex="03" testId="fmt-panel-group-paint">
            <ModulePaint state={state} actions={actions} />
          </PanelGroup>
          <PanelGroup label="Format" sectionIndex="04" testId="fmt-panel-group-format">
            <ModuleFormat state={state} actions={actions} />
          </PanelGroup>
          <PanelGroup label="Edit" sectionIndex="05" testId="fmt-panel-group-edit">
            <ModuleEditorFilter state={state} actions={actions} />
          </PanelGroup>
          <PanelGroup label="Templates" sectionIndex="06" testId="fmt-panel-group-templates">
            <ModuleLibrary
              state={state}
              actions={actions}
              orientation="vertical"
              colLabel={state.colLabel}
            />
          </PanelGroup>
        </div>
      </div>

      <footer className="h-12 px-[18px] border-t border-[color:var(--ds-border-primary)] bg-[var(--ds-surface-ground)] shrink-0 flex items-center gap-2">
        <PanelGroup label="Clear" variant="destruct" testId="fmt-panel-group-clear" inFooter>
          <ModuleClear state={state} actions={actions} orientation="vertical" />
        </PanelGroup>
      </footer>
    </div>
  );
}
