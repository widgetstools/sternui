import type { CSSProperties, ReactNode } from 'react';

/**
 * Cockpit ghost button — 22×22px sharp-corner, transparent, phosphor hover.
 *
 * Slightly smaller than the previous 26px so it sits flush inside the
 * tighter v2 headers and chip rails. No border until hover, rendering as
 * pure affordance without adding chrome weight to the row it belongs to.
 */

export interface GhostIconProps {
  onClick?: () => void;
  title?: string;
  'aria-label'?: string;
  disabled?: boolean;
  children: ReactNode;
  /** Escape hatch for size/color overrides. Use sparingly. */
  style?: CSSProperties;
  'data-testid'?: string;
}

export function GhostIcon({
  onClick,
  title,
  disabled,
  children,
  style,
  ...rest
}: GhostIconProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseDown={(e) => e.preventDefault()}
      title={title}
      aria-label={rest['aria-label'] ?? title}
      disabled={disabled}
      data-testid={rest['data-testid']}
      style={{
        width: 22,
        height: 22,
        borderRadius: 2,
        padding: 0,
        background: 'transparent',
        border: 'none',
        color: disabled ? 'var(--ck-t3, #4a5360)' : 'var(--ck-t1, #9ba3ad)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        transition: 'color 120ms, background 120ms',
        ...style,
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.color = 'var(--ck-t0, #e5e7ea)';
          e.currentTarget.style.background = 'var(--ck-card, #22262b)';
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = disabled
          ? 'var(--ck-t3, #4a5360)'
          : 'var(--ck-t1, #9ba3ad)';
      }}
    >
      {children}
    </button>
  );
}
