import type { CSSProperties, ReactNode } from 'react';

/**
 * Cockpit sharp-toggle group — 28×26 butt-joined buttons inside a hairline
 * TGroup shell. Replaces the previous pill-rounded look with the trading
 * terminal's square-edged aesthetic.
 *
 * API kept identical (`PillToggleGroup` + `PillToggleBtn`, same props) so
 * every existing consumer (StyleEditor's TextSection, conditional-styling,
 * etc.) doesn't need a change. Only the painted chrome differs.
 */

export interface PillToggleGroupProps {
  children: ReactNode;
  style?: CSSProperties;
}

export function PillToggleGroup({ children, style }: PillToggleGroupProps) {
  return (
    <div
      role="group"
      className="gc-tgroup"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 1,
        padding: '2px 4px',
        background: 'var(--ck-bg, #111417)',
        border: '1px solid var(--ck-border, #2d3339)',
        borderRadius: 2,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export interface PillToggleBtnProps {
  active?: boolean;
  onClick?: () => void;
  title?: string;
  disabled?: boolean;
  children: ReactNode;
  style?: CSSProperties;
  'data-testid'?: string;
  'aria-label'?: string;
}

export function PillToggleBtn({
  active,
  onClick,
  title,
  disabled,
  children,
  style,
  ...rest
}: PillToggleBtnProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseDown={(e) => e.preventDefault()}
      aria-pressed={active ? 'true' : 'false'}
      aria-label={rest['aria-label'] ?? title}
      title={title}
      disabled={disabled}
      data-testid={rest['data-testid']}
      className="gc-tbtn"
      style={{
        width: 28,
        height: 26,
        minWidth: 28,
        ...style,
      }}
    >
      {children}
    </button>
  );
}
