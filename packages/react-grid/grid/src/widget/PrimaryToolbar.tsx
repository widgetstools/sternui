/**
 * PrimaryToolbar — the top action row of the grid frame. Renders the
 * editable caption (when tabsHidden), the FiltersToolbar slot, the
 * formatting-toolbar toggle, the ProfileSelector with its full
 * clone/rename/export/import action set, the save + settings buttons,
 * the host-supplied admin actions cluster, and the grid-info popover.
 *
 * View-only. Receives the controller hook's outputs and the host props
 * via plain props; never calls `useProfileManager`, never touches the
 * AG-Grid API, never touches storage. The clone/rename/export/import
 * lambdas remain colocated here (rather than the controller hook)
 * because they're presentation-side glue around `profiles.*` —
 * naming a clone "(copy 2)", composing the export filename, parsing
 * the import file. The controller exposes `profiles` directly so this
 * stays consistent with the pre-extraction contract.
 */

import type { ReactElement } from 'react';
import {
  Save,
  Check,
  SlidersHorizontal,
  PencilLine,
} from 'lucide-react';
import { Button } from '@starui/ui';
import type { UseProfileManagerResult } from '@starui/grid/customizer';
import type { AdminAction } from './types';
import { FiltersToolbar } from './FiltersToolbar';
import { ProfileSelector } from './ProfileSelector';
import { EditableCaption } from './EditableCaption';
import { AlertsBadge } from '../customizer/modules/alerts';
import { ToolbarDatePicker } from './ToolbarDatePicker';
import {
  PrimaryToolbarInlineActions,
  PrimaryToolbarOverflowMenu,
} from './PrimaryToolbarOverflowMenu';

export type { ToolbarActionsLayout } from './PrimaryToolbarOverflowMenu';

export interface PrimaryToolbarProps {
  // Caption
  readonly tabsHidden: boolean | undefined;
  readonly caption: string | undefined;
  readonly onCaptionChange: ((next: string) => void) | undefined;

  // Filters slot
  readonly showFiltersToolbar: boolean;

  // Formatting toolbar toggle
  readonly showFormattingToolbar: boolean;
  readonly styleToolbarOpen: boolean;
  readonly onToggleStyleToolbar: () => void;

  // Editing toolbar toggle
  readonly showEditingToolbar: boolean;
  readonly editingToolbarOpen: boolean;
  readonly onToggleEditingToolbar: () => void;

  // Profile selector
  readonly showProfileSelector: boolean;
  readonly profiles: UseProfileManagerResult;
  readonly isDirty: boolean;
  readonly onRequestLoadProfile: (id: string) => void;

  // Save button
  readonly showSaveButton: boolean;
  readonly saveFlash: boolean;
  readonly onSaveAll: () => void | Promise<void>;

  // Settings button
  readonly showSettingsButton: boolean;
  readonly onOpenSettings: () => void;

  // Visual Excel export
  readonly showVisualExcelExport: boolean;
  readonly visualExcelExportEnabled: boolean;
  readonly onExportVisualExcel: () => void;

  // Admin actions
  readonly adminActions: AdminAction[] | undefined;

  // Grid info popover
  readonly componentName: string | undefined;
  readonly gridId: string;
  readonly instanceId: string | undefined;
  readonly appId: string | undefined;
  readonly userId: string | undefined;

  // Toolbar date picker (right edge, before overflow menu)
  readonly showToolbarDatePicker: boolean;
  readonly toolbarDate: string;
  readonly onToolbarDateChange: (next: string) => void;
  readonly toolbarDateHistoryEnabled: boolean | undefined;
  readonly toolbarActionsLayout: 'inline' | 'overflow';
}

export function PrimaryToolbar(props: PrimaryToolbarProps): ReactElement {
  const {
    tabsHidden,
    caption,
    onCaptionChange,
    showFiltersToolbar,
    showFormattingToolbar,
    styleToolbarOpen,
    onToggleStyleToolbar,
    showEditingToolbar,
    editingToolbarOpen,
    onToggleEditingToolbar,
    showProfileSelector,
    profiles,
    isDirty,
    onRequestLoadProfile,
    showSaveButton,
    saveFlash,
    onSaveAll,
    showSettingsButton,
    onOpenSettings,
    showVisualExcelExport,
    visualExcelExportEnabled,
    onExportVisualExcel,
    adminActions,
    componentName,
    gridId,
    instanceId,
    appId,
    userId,
    showToolbarDatePicker,
    toolbarDate,
    onToolbarDateChange,
    toolbarDateHistoryEnabled,
    toolbarActionsLayout,
  } = props;

  const secondaryActionsProps = {
    showVisualExcelExport,
    visualExcelExportEnabled,
    onExportVisualExcel,
    showSettingsButton,
    onOpenSettings,
    adminActions,
    componentName,
    gridId,
    instanceId,
    appId,
    userId,
    showLeadingDivider: !showToolbarDatePicker,
  };

  return (
    <div className="ds-toolbar-primary ds-primary-row">
      {/* LEFT-MOST — editable caption surfaced when the host's
           OpenFin tab strip is hidden. Click reveals an inline edit
           icon; clicking the icon swaps the label for an input.
           The control persists committed edits via
           `onCaptionChange` when supplied. */}
      {tabsHidden ? (
        <EditableCaption
          caption={caption && caption.trim() ? caption : 'MarketsGrid'}
          onCaptionChange={onCaptionChange}
        />
      ) : null}
      {/* LEFT — filters carousel (flex:1, collapses/expands via its
           own chevron; formatter-toolbar toggle no longer lives
           inside it). */}
      <div className="ds-primary-filters">
        {showFiltersToolbar ? (
          <FiltersToolbar />
        ) : (
          <div className="ds-primary-filters-empty" />
        )}
      </div>

      {/* RIGHT — action cluster. A single thin divider leads the
           group (instead of a full-height border on every button),
           then evenly-spaced icon buttons with matching chrome. */}
      <div className="ds-primary-actions">
        {showFormattingToolbar && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="ds-primary-action"
            onClick={onToggleStyleToolbar}
            title={styleToolbarOpen ? 'Hide formatting toolbar' : 'Show formatting toolbar'}
            data-testid="style-toolbar-toggle"
            data-active={styleToolbarOpen ? 'true' : 'false'}
            aria-pressed={styleToolbarOpen}
          >
            <SlidersHorizontal size={14} strokeWidth={2} />
          </Button>
        )}

        {showEditingToolbar && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="ds-primary-action"
            onClick={onToggleEditingToolbar}
            title={editingToolbarOpen ? 'Hide editing toolbar' : 'Show editing toolbar'}
            data-testid="editing-toolbar-toggle"
            data-active={editingToolbarOpen ? 'true' : 'false'}
            aria-pressed={editingToolbarOpen}
          >
            <PencilLine size={14} strokeWidth={2} />
          </Button>
        )}

        {(showFormattingToolbar || showEditingToolbar) && (
          <span className="ds-primary-divider" aria-hidden />
        )}

        {/* Alerts bell — auto-renders nothing if the alerts module isn't
            registered on the active platform. Always safe to mount. */}
        <AlertsBadge />

        {(showProfileSelector || showSaveButton || showToolbarDatePicker) && (
          <div className="ds-primary-profile-cluster">
            {showProfileSelector && (
              <ProfileSelector
                profiles={profiles.profiles}
                activeProfileId={profiles.activeProfileId ?? ''}
                isDirty={isDirty}
                onCreate={(name) => profiles.createProfile(name)}
                onLoad={(id) => onRequestLoadProfile(id)}
                onDelete={(id) => profiles.deleteProfile(id)}
                onClone={async (id) => {
                  try {
                    const src = profiles.profiles.find((p) => p.id === id);
                    if (!src) return;
                    const existingNames = new Set(profiles.profiles.map((p) => p.name));
                    let candidate = `${src.name} (copy)`;
                    let n = 2;
                    while (existingNames.has(candidate)) {
                      candidate = `${src.name} (copy ${n})`;
                      n++;
                    }
                    return await profiles.cloneProfile(id, candidate);
                  } catch (err) {
                    console.warn('[markets-grid] profile clone failed:', err);
                    window.alert(`Could not clone profile: ${err instanceof Error ? err.message : String(err)}`);
                  }
                }}
                onRename={async (id, name) => {
                  try {
                    await profiles.renameProfile(id, name);
                  } catch (err) {
                    console.warn('[markets-grid] profile rename failed:', err);
                    window.alert(`Could not rename profile: ${err instanceof Error ? err.message : String(err)}`);
                  }
                }}
                onExport={async (id) => {
                  try {
                    const payload = await profiles.exportProfile(id);
                    const fileStem = (payload.profile.name || id)
                      .toLowerCase()
                      .replace(/[^a-z0-9-]+/g, '-')
                      .replace(/^-+|-+$/g, '')
                      .slice(0, 60) || 'profile';
                    const json = JSON.stringify(payload, null, 2);
                    const blob = new Blob([json], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `ds-profile-${fileStem}.json`;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                  } catch (err) {
                    console.warn('[markets-grid] profile export failed:', err);
                    window.alert(`Could not export profile: ${err instanceof Error ? err.message : String(err)}`);
                  }
                }}
                onImport={async (file) => {
                  try {
                    const text = await file.text();
                    const payload = JSON.parse(text);
                    await profiles.importProfile(payload);
                  } catch (err) {
                    console.warn('[markets-grid] profile import failed:', err);
                    window.alert(`Could not import profile: ${err instanceof Error ? err.message : String(err)}`);
                  }
                }}
              />
            )}

            {showSaveButton && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="ds-primary-action ds-primary-save"
                onClick={() => { void onSaveAll(); }}
                title={isDirty ? 'Save all settings (unsaved changes)' : 'Save all settings'}
                data-testid="save-all-btn"
                data-state={saveFlash ? 'saved' : isDirty ? 'dirty' : 'idle'}
              >
                {saveFlash ? <Check size={14} strokeWidth={2.5} /> : <Save size={14} strokeWidth={2} />}
              </Button>
            )}

            {showToolbarDatePicker && (
              <ToolbarDatePicker
                value={toolbarDate}
                onChange={onToolbarDateChange}
                historyEnabled={toolbarDateHistoryEnabled ?? true}
              />
            )}
          </div>
        )}

        <div className="ds-primary-actions-trailing">
          {toolbarActionsLayout === 'inline' ? (
            <PrimaryToolbarInlineActions {...secondaryActionsProps} />
          ) : (
            <PrimaryToolbarOverflowMenu {...secondaryActionsProps} />
          )}
        </div>
      </div>
    </div>
  );
}
