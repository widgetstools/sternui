import type { CSSProperties, ReactNode } from 'react';

/**
 * Tracked-out small-caps sub-label used above controls inside an editor band.
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
      className="flex items-baseline justify-between gap-2 font-semibold uppercase text-muted-foreground mb-1.5 text-[length:var(--ds-font-size-sm)] tracking-[0.1em]"
      style={style}
    >
      <span>{children}</span>
      {action && <span className="text-muted-foreground/60">{action}</span>}
    </div>
  );
}
