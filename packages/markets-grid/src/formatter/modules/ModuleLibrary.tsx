/**
 * 05 · LIBRARY — column templates (apply / save / delete).
 *
 * In horizontal mode renders as a popover-trigger pill + dropdown
 * surface. In vertical mode it expands inline as a list. Both
 * surfaces consume the shared `<TemplateManager />` component for the
 * actual interaction so behaviour is identical.
 */
import { useState } from 'react';
import { ChevronDown, LayoutTemplate } from 'lucide-react';
import { PopoverCompat as Popover } from '@marketsui/core';
import { TemplateManager } from '../../TemplateManager';
import { Module, type Orientation } from '../primitives';
import type { FormatterActions, FormatterState } from '../state';

export function ModuleLibrary({
  state,
  actions,
  orientation,
  colLabel,
}: {
  state: FormatterState;
  actions: FormatterActions;
  orientation: Orientation;
  /** Used as the default save-as name when the user leaves the input
   *  empty — `${colLabel} Style`. */
  colLabel: string;
}) {
  const [open, setOpen] = useState(false);

  const manager = (
    <TemplateManager
      templates={state.templates}
      activeTemplateId={state.activeTemplateId}
      disabled={state.disabled}
      saveName={state.saveAsTplName}
      saveConfirmed={state.saveAsTplConfirmed}
      onSaveNameChange={actions.setSaveAsTplName}
      onSave={() => {
        const name = state.saveAsTplName.trim() || `${colLabel} Style`;
        const id = actions.saveAsTemplate(name);
        if (id) {
          // Auto-apply the freshly saved template to the active column(s).
          // Without this, the Select closed-state keeps showing "Choose a
          // template…" because `activeTemplateId` is still undefined —
          // the save succeeded but the UI gives the user no visible
          // signal. Applying immediately makes the Select reflect the
          // new template by name and enables the delete button.
          actions.applyTemplate(id);
          actions.setSaveAsTplName('');
          actions.flashSaveAsTpl();
        }
      }}
      onApply={actions.applyTemplate}
      onDelete={actions.deleteTemplate}
      variant={orientation === 'horizontal' ? 'compact' : 'panel'}
      testIdPrefix={orientation === 'horizontal' ? 'tb-tpl' : 'fmt-panel-tpl'}
    />
  );

  // Horizontal — popover trigger that opens the manager.
  if (orientation === 'horizontal') {
    return (
      <Module index="05" label="Library">
        <Popover
          open={open}
          onOpenChange={setOpen}
          trigger={
            <button
              type="button"
              className="fx-pill"
              aria-label="Templates"
              title="Templates"
              data-testid="templates-menu-trigger"
              disabled={state.disabled}
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
            >
              <LayoutTemplate size={13} strokeWidth={1.75} />
              <ChevronDown size={9} strokeWidth={2} />
            </button>
          }
        >
          <div
            data-testid="templates-menu"
            style={{
              padding: 8,
              minWidth: 240,
              fontFamily: 'var(--fx-font-sans)',
            }}
            onMouseDown={(e) => {
              if ((e.target as HTMLElement).tagName !== 'INPUT') e.preventDefault();
            }}
          >
            {manager}
          </div>
        </Popover>
      </Module>
    );
  }

  // Vertical — inline list.
  return (
    <Module index="05" label="Library">
      <div style={{ width: '100%', display: 'block' }}>{manager}</div>
    </Module>
  );
}
