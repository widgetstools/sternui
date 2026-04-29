import { Brush, Check, Save, Settings as SettingsIcon } from 'lucide-react';
import { DirtyDot, type UseProfileManagerResult } from '@marketsui/core';
import type { AdminAction } from '../types';
import { FiltersToolbar } from '../FiltersToolbar';
import { AdminActionButtons } from './AdminActionButtons';
import { ProfileSelectorBlock } from './ProfileSelectorBlock';

/**
 * The primary toolbar row that sits above the AG-Grid frame:
 *   LEFT: filters carousel (collapsible)
 *   RIGHT: action cluster — formatting brush, profile selector,
 *          save button, settings button, admin actions.
 *
 * Extracted verbatim from `MarketsGrid.Host` during Phase C-3 to keep
 * the orchestrator's render tree focused on layout structure.
 */
export function MarketsGridToolbar({
  showFiltersToolbar,
  showFormattingToolbar,
  styleToolbarOpen,
  onToggleStyleToolbar,
  showProfileSelector,
  profiles,
  isDirty,
  requestLoadProfile,
  showSaveButton,
  saveFlash,
  onSaveAll,
  showSettingsButton,
  onOpenSettings,
  adminActions,
}: {
  showFiltersToolbar: boolean;
  showFormattingToolbar: boolean;
  styleToolbarOpen: boolean;
  onToggleStyleToolbar: () => void;
  showProfileSelector: boolean;
  profiles: UseProfileManagerResult;
  isDirty: boolean;
  requestLoadProfile: (id: string) => void;
  showSaveButton: boolean;
  saveFlash: boolean;
  onSaveAll: () => void | Promise<void>;
  showSettingsButton: boolean;
  onOpenSettings: () => void;
  adminActions: AdminAction[] | undefined;
}) {
  return (
    <div className="gc-toolbar-primary gc-primary-row">
      {/* LEFT — filters carousel (flex:1, collapses/expands via its
           own chevron; formatter-toolbar toggle no longer lives
           inside it). */}
      <div className="gc-primary-filters">
        {showFiltersToolbar ? (
          <FiltersToolbar />
        ) : (
          <div className="gc-primary-filters-empty" />
        )}
      </div>

      {/* RIGHT — action cluster. A single thin divider leads the
           group (instead of a full-height border on every button),
           then evenly-spaced icon buttons with matching chrome. */}
      <div className="gc-primary-actions">
        {showFormattingToolbar && (
          <button
            type="button"
            className="gc-primary-action"
            onClick={onToggleStyleToolbar}
            title={styleToolbarOpen ? 'Hide formatting toolbar' : 'Show formatting toolbar'}
            data-testid="style-toolbar-toggle"
            data-active={styleToolbarOpen ? 'true' : 'false'}
            aria-pressed={styleToolbarOpen}
          >
            <Brush size={14} strokeWidth={2} />
          </button>
        )}

        {showProfileSelector && (
          <>
            {showFormattingToolbar && <span className="gc-primary-divider" aria-hidden />}
            <ProfileSelectorBlock
              profiles={profiles}
              isDirty={isDirty}
              requestLoadProfile={requestLoadProfile}
            />
          </>
        )}

        {showSaveButton && (
          <>
            <span className="gc-primary-divider" aria-hidden />
            <button
              type="button"
              className="gc-primary-action gc-primary-save"
              onClick={() => {
                void onSaveAll();
              }}
              title={isDirty ? 'Save all settings (unsaved changes)' : 'Save all settings'}
              data-testid="save-all-btn"
              data-state={saveFlash ? 'saved' : isDirty ? 'dirty' : 'idle'}
            >
              {saveFlash ? <Check size={14} strokeWidth={2.5} /> : <Save size={14} strokeWidth={2} />}
              {/* Dirty indicator — small pulsed teal dot top-right of
                  the icon. Shown only when unsaved and NOT actively
                  flashing (to avoid stacking indicators during the
                  600ms post-save flash). */}
              {isDirty && !saveFlash && (
                <span className="gc-primary-save-dirty" data-testid="save-all-dirty">
                  <DirtyDot title="Unsaved changes" />
                </span>
              )}
            </button>
          </>
        )}

        {showSettingsButton && (
          <>
            <span className="gc-primary-divider" aria-hidden />
            <button
              type="button"
              className="gc-primary-action"
              onClick={onOpenSettings}
              title="Open settings"
              data-testid="v2-settings-open-btn"
            >
              <SettingsIcon size={14} strokeWidth={2} />
            </button>
          </>
        )}

        {/* Admin actions — rendered at the far right edge of the
            primary row. Each visible action becomes a single icon
            button with tooltip = label + description. The leading
            divider only renders when there's something to show; end-
            user grids (no adminActions) see zero extra chrome. */}
        <AdminActionButtons actions={adminActions} />
      </div>
    </div>
  );
}
