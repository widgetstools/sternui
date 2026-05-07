import type { ReactNode } from 'react';
import { Trash2, Save, ChevronDown, ChevronRight } from 'lucide-react';
import { DirtyDot } from './DirtyDot';
import { GhostIcon } from './GhostIcon';
import { SharpBtn } from './Cockpit';

/**
 * Cockpit ItemCard — kept as a cohesive title + body wrapper for callers
 * that still render lists of cards (e.g. legacy flat panels). The visual
 * treatment is now aligned with the editor's identity strip: Plex Sans
 * title + LED dirty + sharp SAVE + trash, no rounded pill.
 *
 * New Cockpit surfaces prefer `ObjectTitleRow` + numbered `Band`s directly
 * rather than this card, but we keep ItemCard's API intact so nothing
 * breaks during the migration.
 */

export interface ItemCardProps {
  title: ReactNode;
  dirty?: boolean;
  onSave?: () => void;
  onDelete?: () => void;
  actions?: ReactNode;
  saveLabel?: string;
  style?: React.CSSProperties;
  children?: ReactNode;
  /** Hide the body and show only the header strip when true. */
  collapsed?: boolean;
  /** Chevron toggle — when omitted, no toggle is rendered. */
  onToggleCollapsed?: () => void;
  'data-testid'?: string;
  'data-testid-save'?: string;
}

export function ItemCard({
  title,
  dirty,
  onSave,
  onDelete,
  actions,
  saveLabel = 'SAVE',
  style,
  children,
  collapsed,
  onToggleCollapsed,
  ...rest
}: ItemCardProps) {
  const hasBody = children !== undefined && !collapsed;
  const canToggle = onToggleCollapsed !== undefined;

  return (
    <div
      data-testid={rest['data-testid']}
      data-dirty={dirty ? 'true' : 'false'}
      data-collapsed={collapsed ? 'true' : 'false'}
      style={{
        background: 'var(--ck-card, #22262b)',
        border: '1px solid var(--ck-border, #2d3339)',
        borderRadius: 2,
        marginBottom: 8,
        overflow: 'hidden',
        ...style,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          borderBottom: hasBody ? '1px solid var(--ck-border, #2d3339)' : 'none',
          background: 'var(--ck-card-hi, #2a2e34)',
        }}
      >
        {canToggle && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-expanded={!collapsed}
            title={collapsed ? 'Expand' : 'Collapse'}
            style={{
              width: 18,
              height: 18,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent',
              border: 'none',
              color: 'var(--ck-t2, #6b7480)',
              cursor: 'pointer',
              padding: 0,
              borderRadius: 2,
            }}
          >
            {collapsed ? <ChevronRight size={12} strokeWidth={2.25} /> : <ChevronDown size={12} strokeWidth={2.25} />}
          </button>
        )}
        {dirty && <DirtyDot />}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            fontFamily: 'var(--ck-font-sans, "IBM Plex Sans", sans-serif)',
            fontSize: 12,
            fontWeight: 500,
            color: 'var(--ck-t0, #e5e7ea)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            cursor: canToggle ? 'pointer' : 'default',
          }}
          onClick={canToggle ? onToggleCollapsed : undefined}
        >
          {title}
        </div>
        {actions}
        {onSave && (
          <SharpBtn
            variant={dirty ? 'action' : 'ghost'}
            disabled={!dirty}
            onClick={onSave}
            data-testid={rest['data-testid-save']}
          >
            <Save size={11} strokeWidth={2} />
            {saveLabel}
          </SharpBtn>
        )}
        {onDelete && (
          <GhostIcon onClick={onDelete} title="Delete">
            <Trash2 size={13} strokeWidth={1.75} />
          </GhostIcon>
        )}
      </div>
      {hasBody && <div>{children}</div>}
    </div>
  );
}
