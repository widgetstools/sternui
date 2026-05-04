/**
 * TemplateManager — unified "saved templates" surface used by both
 * the in-grid FormattingToolbar's template popover AND the popped-out
 * FormattingPropertiesPanel's Templates section.
 *
 * UX (redesigned 2026-05-03):
 *   ┌────────────────────────────────────────┐
 *   │  Bold              [✏] [⟳] [🗑]        │ ← rows; click body = apply,
 *   │ ✓ Currency         [✏] [⟳] [🗑]        │   actions hover-revealed
 *   │  …                                      │
 *   ├────────────────────────────────────────┤
 *   │  Save current as: [name…]      [+]     │
 *   ├────────────────────────────────────────┤
 *   │  Will save: Styles · Formatter · Filter │ ← "what's in the snapshot" hint
 *   └────────────────────────────────────────┘
 *
 * The per-row UPDATE button lets users re-snapshot the active column
 * INTO an existing template — the user-requested "save additional
 * settings to an existing template" affordance. RENAME swaps the row
 * label into an inline input. DELETE uses a two-step confirm
 * (mousedown-to-arm, click-to-commit) to defeat single-misclick
 * destruction.
 *
 * One implementation powers both surfaces via `variant`:
 *   - `compact`  — toolbar popover (~320px, denser rows)
 *   - `panel`    — popped-out properties panel (full-width)
 */

import { useEffect, useRef, useState } from 'react';
import { Pencil, Plus, RotateCw, Trash2, Check, X } from 'lucide-react';
import { GhostIconButton } from '@marketsui/core';

// Inactive-row hover tint. Co-located here (instead of marketsGrid.css)
// so the row + its buttons stay self-contained — the row also serves
// as `data-row-hover-target` for the GhostIconButton reveal, so its
// hover feedback is part of the same primitive's behaviour. Idempotent
// + SSR-safe per the same pattern GhostIconButton uses.
const ROW_STYLE_ID = 'gc-tpl-row-styles';
if (typeof document !== 'undefined' && !document.getElementById(ROW_STYLE_ID)) {
  const style = document.createElement('style');
  style.id = ROW_STYLE_ID;
  style.textContent = `
    .gc-tpl-row:not([data-active='true']):hover {
      background: color-mix(in srgb, var(--bn-t0) 5%, transparent) !important;
    }
  `;
  document.head.appendChild(style);
}

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

  /** Re-snapshot the active column and overwrite an existing template.
   *  Omit to hide the per-row Update affordance. */
  onUpdate?: (id: string) => void;
  /** Rename an existing template inline. Omit to hide the per-row
   *  Rename affordance. Implementations should call the formatter's
   *  `renameTemplate(id, newName)` action. */
  onRename?: (id: string, name: string) => void;

  /**
   * Optional human-readable list of template categories the active
   * column can currently save (e.g. `['Styles', 'Formatter', 'Filter']`).
   * Renders as a small caption beneath the save row so users know
   * what the snapshot will capture BEFORE clicking save. Empty array
   * => the column has nothing template-eligible.
   */
  capturableFields?: ReadonlyArray<string>;

  /** Layout variant. `compact` = popover inside toolbar (320px,
   *  tighter spacing); `panel` = full-width Section inside the
   *  popped-out Properties panel. */
  variant?: 'compact' | 'panel';

  /** Optional test-id prefix applied to interactive elements so E2E
   *  can assert on the same primitive regardless of variant. */
  testIdPrefix?: string;
}

interface RowProps {
  id: string;
  name: string;
  isActive: boolean;
  isRenaming: boolean;
  renameDraft: string;
  pendingDeleteId: string | null;
  disabled: boolean;
  hasUpdate: boolean;
  hasRename: boolean;
  onApply: () => void;
  onUpdate: () => void;
  onStartRename: () => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onRenameDraftChange: (v: string) => void;
  onArmDelete: () => void;
  onConfirmDelete: () => void;
  testId: string;
}

function TemplateRow({
  id,
  name,
  isActive,
  isRenaming,
  renameDraft,
  pendingDeleteId,
  disabled,
  hasUpdate,
  hasRename,
  onApply,
  onUpdate,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onRenameDraftChange,
  onArmDelete,
  onConfirmDelete,
  testId,
}: RowProps) {
  const isPendingDelete = pendingDeleteId === id;

  return (
    <div
      data-testid={testId}
      data-row-hover-target=""
      data-active={isActive ? 'true' : undefined}
      className="gc-tpl-row"
      role="button"
      tabIndex={isRenaming ? -1 : 0}
      onClick={() => { if (!isRenaming && !isPendingDelete && !disabled) onApply(); }}
      onKeyDown={(e) => {
        if (isRenaming) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (!disabled) onApply();
        }
      }}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        height: 30,
        padding: '0 6px 0 10px',
        borderRadius: 4,
        cursor: disabled ? 'not-allowed' : 'pointer',
        background: isActive
          ? 'color-mix(in srgb, var(--bn-blue) 10%, transparent)'
          : 'transparent',
        opacity: disabled ? 0.5 : 1,
        transition: 'background 120ms',
        outline: 'none',
      }}
    >
      {/* Active accent bar */}
      <span
        aria-hidden
        style={{
          position: 'absolute', left: 2, top: 6, bottom: 6,
          width: 2, borderRadius: 2,
          background: isActive ? 'var(--bn-blue)' : 'transparent',
        }}
      />

      {/* Leading check / dot */}
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 12, height: 12, flexShrink: 0,
      }}>
        {isActive ? (
          <Check size={11} strokeWidth={2.5} style={{ color: 'var(--bn-blue)' }} />
        ) : (
          <span style={{
            width: 5, height: 5, borderRadius: '50%',
            background: 'color-mix(in srgb, var(--bn-t2) 50%, transparent)',
          }} />
        )}
      </span>

      {/* Name — switches to input while renaming */}
      {isRenaming ? (
        <input
          type="text"
          value={renameDraft}
          autoFocus
          data-testid={`${testId}-rename-input`}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onRenameDraftChange(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') { e.preventDefault(); onCommitRename(); }
            else if (e.key === 'Escape') { e.preventDefault(); onCancelRename(); }
          }}
          onBlur={onCommitRename}
          style={{
            flex: 1, minWidth: 0, height: 22, padding: '0 6px',
            background: 'var(--bn-bg)',
            border: '1px solid color-mix(in srgb, var(--bn-blue) 55%, var(--bn-border))',
            borderRadius: 3,
            color: 'var(--bn-t0)',
            fontSize: 11,
            fontWeight: isActive ? 600 : 450,
            outline: 'none',
          }}
        />
      ) : (
        <span style={{
          flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          fontSize: 11,
          fontWeight: isActive ? 600 : 450,
          color: 'var(--bn-t0)',
          letterSpacing: 0.1,
        }}>
          {name}
        </span>
      )}

      {/* Action buttons — hover-revealed via GhostIconButton's
          `reveal="on-row-hover"` (the row sets `data-row-hover-target`).
          The pending-delete + renaming branches force `revealed` so
          actions stay visible while a multi-step flow is in progress. */}
      {!isRenaming && (
        <>
          {hasUpdate && (
            <GhostIconButton
              reveal="on-row-hover"
              revealed={isPendingDelete}
              variant="accent"
              onClick={(e) => { e.stopPropagation(); onUpdate(); }}
              onMouseDown={(e) => e.preventDefault()}
              title={`Update "${name}" with the current column's settings`}
              aria-label={`Update template ${name}`}
              data-testid={`${testId}-update`}
            >
              <RotateCw size={11} strokeWidth={2} />
            </GhostIconButton>
          )}
          {hasRename && (
            <GhostIconButton
              reveal="on-row-hover"
              revealed={isPendingDelete}
              variant="accent"
              onClick={(e) => { e.stopPropagation(); onStartRename(); }}
              onMouseDown={(e) => e.preventDefault()}
              title={`Rename "${name}"`}
              aria-label={`Rename template ${name}`}
              data-testid={`${testId}-rename`}
            >
              <Pencil size={11} strokeWidth={2} />
            </GhostIconButton>
          )}
          {isPendingDelete ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onConfirmDelete(); }}
              onMouseDown={(e) => e.preventDefault()}
              data-testid={`${testId}-delete-confirm`}
              title="Click to confirm delete"
              aria-label="Confirm delete template"
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                height: 22, padding: '0 8px',
                border: '1px solid var(--bn-red)',
                borderRadius: 3,
                background: 'color-mix(in srgb, var(--bn-red) 18%, transparent)',
                color: 'var(--bn-red)',
                fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              <Trash2 size={10} strokeWidth={2.25} />
              <span>Delete</span>
            </button>
          ) : (
            <GhostIconButton
              reveal="on-row-hover"
              variant="destructive"
              onClick={(e) => { e.stopPropagation(); onArmDelete(); }}
              onMouseDown={(e) => e.preventDefault()}
              title={`Delete "${name}"`}
              aria-label={`Delete template ${name}`}
              data-testid={`${testId}-delete`}
            >
              <Trash2 size={11} strokeWidth={2} />
            </GhostIconButton>
          )}
        </>
      )}

      {/* Cancel-rename — mousedown so it fires before the input's
          blur-commits handler. Always-visible (the input owns the
          row's left edge; this button needs to stay reachable). */}
      {isRenaming && (
        <GhostIconButton
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onCancelRename();
          }}
          data-testid={`${testId}-rename-cancel`}
          title="Cancel rename"
          aria-label="Cancel rename"
        >
          <X size={11} strokeWidth={2} />
        </GhostIconButton>
      )}
    </div>
  );
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
  onUpdate,
  onRename,
  capturableFields,
  variant = 'panel',
  testIdPrefix = 'tpl',
}: TemplateManagerProps) {
  const isCompact = variant === 'compact';
  const isEmpty = templates.length === 0;

  // Inline rename state — at most one row in edit mode at a time.
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  // Two-step delete state — armed-row id, auto-disarmed after 3s OR
  // when the template list changes.
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const armTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const disarmDelete = () => {
    setPendingDeleteId(null);
    if (armTimerRef.current) clearTimeout(armTimerRef.current);
  };
  const armDelete = (id: string) => {
    setPendingDeleteId(id);
    if (armTimerRef.current) clearTimeout(armTimerRef.current);
    armTimerRef.current = setTimeout(() => setPendingDeleteId(null), 3000);
  };
  useEffect(() => () => { if (armTimerRef.current) clearTimeout(armTimerRef.current); }, []);

  // Disarm delete + cancel any in-flight rename whenever the template
  // list shape changes — otherwise stale state can target a row that
  // no longer exists.
  useEffect(() => {
    disarmDelete();
    if (renamingId && !templates.some((t) => t.id === renamingId)) {
      setRenamingId(null);
      setRenameDraft('');
    }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [templates.length]);

  const startRename = (id: string, currentName: string) => {
    disarmDelete();
    setRenamingId(id);
    setRenameDraft(currentName);
  };
  const commitRename = () => {
    const id = renamingId;
    if (!id) return;
    const trimmed = renameDraft.trim();
    const tpl = templates.find((t) => t.id === id);
    setRenamingId(null);
    setRenameDraft('');
    if (!trimmed || !tpl || tpl.name === trimmed) return;
    onRename?.(id, trimmed);
  };
  const cancelRename = () => {
    setRenamingId(null);
    setRenameDraft('');
  };

  const confirmDelete = (id: string) => {
    disarmDelete();
    onDelete(id);
  };

  return (
    <div
      data-testid={`${testIdPrefix}-manager`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        minWidth: isCompact ? 320 : undefined,
        width: isCompact ? undefined : '100%',
      }}
    >
      {/* List of templates */}
      {!isEmpty && (
        <div
          data-testid={`${testIdPrefix}-list`}
          style={{
            display: 'flex', flexDirection: 'column', gap: 1,
            maxHeight: 240, overflowY: 'auto',
            paddingRight: 2,
          }}
        >
          {templates.map((tpl) => (
            <TemplateRow
              key={tpl.id}
              id={tpl.id}
              name={tpl.name}
              isActive={tpl.id === activeTemplateId}
              isRenaming={renamingId === tpl.id}
              renameDraft={renameDraft}
              pendingDeleteId={pendingDeleteId}
              disabled={!!disabled}
              hasUpdate={!!onUpdate}
              hasRename={!!onRename}
              onApply={() => onApply(tpl.id)}
              onUpdate={() => onUpdate?.(tpl.id)}
              onStartRename={() => startRename(tpl.id, tpl.name)}
              onCommitRename={commitRename}
              onCancelRename={cancelRename}
              onRenameDraftChange={setRenameDraft}
              onArmDelete={() => armDelete(tpl.id)}
              onConfirmDelete={() => confirmDelete(tpl.id)}
              testId={`${testIdPrefix}-row-${tpl.id}`}
            />
          ))}
        </div>
      )}

      {/* Separator — only when both list and footer have content. */}
      {!isEmpty && (
        <div style={{
          height: 1,
          background: 'color-mix(in srgb, var(--bn-border) 60%, transparent)',
          margin: '2px 0',
        }} />
      )}

      {/* Save-as footer */}
      <div>
        <div style={{
          fontSize: 9, fontWeight: 600, letterSpacing: 0.6,
          textTransform: 'uppercase',
          color: 'var(--bn-t2)',
          marginBottom: 4,
        }}>
          Save current as new
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            type="text"
            value={saveName}
            onChange={(e) => onSaveNameChange(e.target.value)}
            placeholder={isEmpty ? 'Save your first template…' : 'Template name…'}
            disabled={disabled}
            data-testid={`${testIdPrefix}-save-input`}
            aria-label="New template name"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && saveName.trim()) onSave();
            }}
            style={{
              flex: 1, minWidth: 0, height: 28, padding: '0 10px',
              border: '1px solid var(--bn-border)',
              borderRadius: 3,
              background: 'var(--bn-bg)',
              color: 'var(--bn-t0)',
              fontSize: 11,
              outline: 'none',
            }}
          />
          <button
            type="button"
            disabled={disabled || !saveName.trim()}
            onClick={onSave}
            onMouseDown={(e) => e.preventDefault()}
            data-testid={`${testIdPrefix}-save-btn`}
            title="Save current state as new template"
            aria-label="Save current state as new template"
            style={{
              width: 28, height: 28,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              border: `1px solid ${saveConfirmed
                ? 'color-mix(in srgb, var(--bn-blue) 40%, transparent)'
                : 'var(--bn-border)'}`,
              borderRadius: 3,
              background: saveConfirmed
                ? 'color-mix(in srgb, var(--bn-blue) 14%, transparent)'
                : 'transparent',
              color: saveConfirmed ? 'var(--bn-blue)' : 'var(--bn-t1)',
              cursor: disabled || !saveName.trim() ? 'not-allowed' : 'pointer',
              opacity: disabled || !saveName.trim() ? 0.3 : 1,
              transition: 'all 120ms',
              padding: 0,
              flexShrink: 0,
            }}
          >
            {saveConfirmed ? <Check size={13} strokeWidth={2.5} /> : <Plus size={13} strokeWidth={2} />}
          </button>
        </div>
      </div>

      {/* "What will be saved" hint — surfaces the captured-fields
          summary so the user knows what the snapshot includes BEFORE
          clicking save. Hidden when nothing is capturable (empty
          column) or the host didn't pass the prop. */}
      {capturableFields && capturableFields.length > 0 && (
        <div
          data-testid={`${testIdPrefix}-capture-hint`}
          style={{
            fontSize: 10,
            color: 'var(--bn-t2)',
            lineHeight: 1.4,
            paddingTop: 2,
          }}
        >
          Will save: <span style={{ color: 'var(--bn-t1)', fontWeight: 500 }}>
            {capturableFields.join(' · ')}
          </span>
        </div>
      )}

      {/* Empty-state hint — shown when no templates exist yet. */}
      {isEmpty && (
        <div
          data-testid={`${testIdPrefix}-empty-hint`}
          style={{
            fontSize: 10,
            color: 'var(--bn-t2)',
            lineHeight: 1.4,
            paddingTop: 2,
          }}
        >
          Name a style, then click <span style={{ fontWeight: 600, color: 'var(--bn-t1)' }}>+</span> to save your first template.
        </div>
      )}
    </div>
  );
}
