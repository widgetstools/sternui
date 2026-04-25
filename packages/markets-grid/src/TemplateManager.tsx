/**
 * TemplateManager — unified "saved templates" surface used by both
 * the in-grid FormattingToolbar's template popover AND the popped-out
 * FormattingPropertiesPanel's Templates section.
 *
 * Shape (per user request — kept simple):
 *   Row 1: <Select> dropdown listing templates. Picking one applies.
 *   Row 2: save-as name input + [+] save button + [🗑] delete button.
 *
 * Delete uses a two-step confirm (pill swap) so a single misclick can't
 * nuke a template. Delete targets the currently-selected template
 * (`activeTemplateId`); disabled when nothing is selected.
 *
 * Single implementation powers both surfaces via a `variant` prop that
 * only tweaks width (compact popover vs panel section). Behavior,
 * test-ids, and chrome are otherwise identical.
 */

import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2, Check } from 'lucide-react';
import { Select } from '@marketsui/core';

export interface TemplateManagerProps {
  templates: ReadonlyArray<{ id: string; name: string }>;
  activeTemplateId?: string;
  disabled?: boolean;

  // Save-as — controlled input (owner decides where the draft lives).
  saveName: string;
  saveConfirmed: boolean;
  onSaveNameChange: (value: string) => void;
  onSave: () => void;

  onApply: (id: string) => void;
  onDelete: (id: string) => void;

  /** Layout variant. "compact" = popover inside toolbar
   *  (220px, tighter spacing); "panel" = full-width Section inside
   *  the popped-out Properties panel. */
  variant?: 'compact' | 'panel';

  /** Optional test-id prefix applied to interactive elements so E2E
   *  can assert on the same primitive regardless of variant. */
  testIdPrefix?: string;
}

export function TemplateManager({
  templates,
  activeTemplateId,
  disabled,
  saveName,
  saveConfirmed,
  onSaveNameChange,
  onSave,
  onApply,
  onDelete,
  variant = 'panel',
  testIdPrefix = 'tpl',
}: TemplateManagerProps) {
  // Two-step delete confirm — arms the trash button for 3s.
  const [confirmArmed, setConfirmArmed] = useState(false);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const disarm = () => {
    setConfirmArmed(false);
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
  };
  const armDelete = () => {
    setConfirmArmed(true);
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    confirmTimerRef.current = setTimeout(() => setConfirmArmed(false), 3000);
  };
  useEffect(() => () => { if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current); }, []);

  // Disarm the delete confirm whenever the active template changes —
  // otherwise switching templates mid-arm leaves a stale confirm state
  // pointing at a different row than the one the user was looking at.
  useEffect(() => { disarm(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [activeTemplateId]);

  const isCompact = variant === 'compact';
  const rowHeight = 28;

  const isEmpty = templates.length === 0;
  const deleteDisabled = disabled || !activeTemplateId;

  return (
    <div
      data-testid={`${testIdPrefix}-manager`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        minWidth: isCompact ? 220 : undefined,
        width: isCompact ? undefined : '100%',
      }}
    >
      {/* Select — the "apply" surface. Only rendered when we actually
          have templates to choose from. When empty, we skip the select
          entirely and show an inline hint below the save row (see
          the helper caption further down) — this avoids a disabled
          greyed-out control + a native title tooltip that was
          obscuring the save/delete action row right below it.

          First empty option is a placeholder; the `value=""` path is
          a no-op (no reducer dispatched) to avoid an accidental "clear
          template" when the user re-opens the select and taps it. */}
      {!isEmpty && (
        <Select
          value={activeTemplateId ?? ''}
          disabled={disabled}
          data-testid={`${testIdPrefix}-select`}
          aria-label="Apply saved template"
          onChange={(e) => {
            const v = e.target.value;
            if (v) onApply(v);
          }}
          className="h-7"
        >
          <option value="" disabled>Choose a template…</option>
          {templates.map((tpl) => (
            <option key={tpl.id} value={tpl.id}>
              {tpl.name}
            </option>
          ))}
        </Select>
      )}

      {/* Save-as input + [+] save + [🗑] delete active.
          Delete only renders when there's a template to delete —
          cleaner empty state, fewer disabled controls. */}
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          type="text"
          value={saveName}
          onChange={(e) => onSaveNameChange(e.target.value)}
          placeholder={isEmpty ? 'Save your first template…' : 'Save current style as…'}
          disabled={disabled}
          data-testid={`${testIdPrefix}-save-input`}
          aria-label="New template name"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && saveName.trim()) onSave();
          }}
          style={{
            flex: 1,
            height: rowHeight,
            padding: '0 10px',
            border: '1px solid var(--bn-border)',
            borderRadius: 3,
            background: 'var(--bn-bg, var(--bn-bg))',
            color: 'var(--bn-t0)',
            fontFamily: "'Geist', 'IBM Plex Sans', -apple-system, sans-serif",
            fontSize: 11,
            outline: 'none',
            minWidth: 0,
          }}
        />

        {/* Save new */}
        <button
          type="button"
          disabled={disabled || !saveName.trim()}
          onClick={onSave}
          onMouseDown={(e) => e.preventDefault()}
          data-testid={`${testIdPrefix}-save-btn`}
          title="Save current style as template"
          aria-label="Save current style as template"
          style={{
            width: rowHeight,
            height: rowHeight,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: `1px solid ${saveConfirmed
              ? 'color-mix(in srgb, var(--bn-blue) 40%, transparent)'
              : 'var(--bn-border)'}`,
            borderRadius: 3,
            background: saveConfirmed
              ? 'color-mix(in srgb, var(--bn-blue) 14%, transparent)'
              : 'transparent',
            color: saveConfirmed ? 'var(--bn-blue)' : 'var(--bn-t2)',
            cursor: disabled || !saveName.trim() ? 'not-allowed' : 'pointer',
            opacity: disabled || !saveName.trim() ? 0.3 : 1,
            transition: 'all 120ms',
            padding: 0,
            flexShrink: 0,
          }}
        >
          {saveConfirmed ? <Check size={14} strokeWidth={2.5} /> : <Plus size={14} strokeWidth={2} />}
        </button>

        {/* Delete currently-selected template — two-step confirm.
            First click arms (button widens, turns destructive red);
            second click commits. Auto-disarms after 3s OR when the
            active selection changes.

            Hidden entirely when the library is empty (nothing to
            delete → don't render a permanently-disabled trash can). */}
        {!isEmpty && (
          <button
            type="button"
            disabled={deleteDisabled}
            onClick={(e) => {
              e.stopPropagation();
              if (!activeTemplateId) return;
              if (confirmArmed) {
                onDelete(activeTemplateId);
                disarm();
              } else {
                armDelete();
              }
            }}
            onMouseDown={(e) => e.preventDefault()}
            data-testid={`${testIdPrefix}-delete-btn`}
            title={
              deleteDisabled
                ? 'Pick a template to delete'
                : confirmArmed
                  ? 'Click again to delete'
                  : 'Delete selected template'
            }
            aria-label={confirmArmed ? 'Confirm delete template' : 'Delete selected template'}
            style={{
              width: confirmArmed ? 70 : rowHeight,
              height: rowHeight,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              padding: 0,
              border: `1px solid ${confirmArmed
                ? 'var(--bn-red)'
                : 'var(--bn-border)'}`,
              borderRadius: 3,
              background: confirmArmed
                ? 'color-mix(in srgb, var(--bn-red) 18%, transparent)'
                : 'transparent',
              color: confirmArmed ? 'var(--bn-red)' : 'var(--bn-t2)',
              fontFamily: "'Geist', 'IBM Plex Sans', -apple-system, sans-serif",
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              cursor: deleteDisabled ? 'not-allowed' : 'pointer',
              opacity: deleteDisabled ? 0.3 : 1,
              transition: 'width 120ms, background 120ms, color 120ms, border-color 120ms',
              flexShrink: 0,
            }}
          >
            {confirmArmed ? (
              <>
                <Trash2 size={11} strokeWidth={2} />
                <span>DELETE</span>
              </>
            ) : (
              <Trash2 size={13} strokeWidth={1.75} />
            )}
          </button>
        )}
      </div>

      {/* Empty-state hint — only shown when there are no templates yet.
          Inline caption (not a tooltip) so it can't obscure anything. */}
      {isEmpty && (
        <div
          data-testid={`${testIdPrefix}-empty-hint`}
          style={{
            fontSize: 10,
            color: 'var(--bn-t2)',
            fontFamily: "'Geist', 'IBM Plex Sans', -apple-system, sans-serif",
            lineHeight: 1.4,
            paddingTop: 2,
          }}
        >
          Name a style, then click <span style={{ fontWeight: 600 }}>+</span> to save your
          first template. Applied templates will appear as a dropdown here.
        </div>
      )}
    </div>
  );
}
