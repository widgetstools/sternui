import type { CSSProperties, ReactNode } from 'react';

/**
 * Tracked-out small-caps sub-label used above controls inside an
 * editor band. 10px uppercase +0.1em.
 */

export interface SubLabelProps {
  children: ReactNode;
  style?: CSSProperties;
  /** Optional right-side slot (e.g., a "Recommended" badge). */
  action?: ReactNode;
}

export function SubLabel({ children, style, action }: SubLabelProps) {
  return (
    <div
      className="gc-caps"
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: 8,
        fontSize: 10,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: 'var(--ck-t2)',
        margin: '0 0 6px',
        fontWeight: 600,
        ...style,
      }}
    >
      <span>{children}</span>
      {action && <span style={{ color: 'var(--ck-t3)' }}>{action}</span>}
    </div>
  );
}
