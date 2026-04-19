import React from 'react';
import { cn, Tooltip } from '@grid-customizer/core';

/**
 * Low-level primitives for the FormattingToolbar — pure visual wrappers
 * around native buttons + flex groups. Extracted from the toolbar during
 * the AUDIT i1 split.
 *
 * Each component's chrome lives entirely in `FormattingToolbar.css`; the
 * primitive just applies the corresponding `.gc-tb-*` class and forwards
 * ARIA + data attributes so the toolbar's tests (which query by
 * testid + aria-pressed) keep working.
 */

/**
 * Toolbar icon button. Chrome comes from `.gc-tb-btn` in
 * FormattingToolbar.css — square, sharp 2px corners, flat outlined
 * active state. The stylesheet's `[data-on]` + `[aria-pressed]`
 * selectors both light up, so existing tests that read
 * `aria-pressed` keep working.
 *
 * We use a native <button> instead of the shadcn `Button` wrapper —
 * the tokenised class owns all sizing + chrome and adding shadcn's
 * own Tailwind noise on top would fight specificity. Native gives
 * us the same focus / disabled / accessible-name surface with
 * zero style overhead.
 */
export function TBtn({
  children,
  active,
  disabled,
  tooltip,
  onClick,
  className,
  ...rest
}: {
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  tooltip?: string;
  onClick?: () => void;
  className?: string;
  'data-testid'?: string;
}) {
  const btn = (
    <button
      type="button"
      disabled={disabled}
      data-testid={rest['data-testid']}
      aria-label={tooltip}
      aria-pressed={typeof active === 'boolean' ? active : undefined}
      data-on={active ? 'true' : undefined}
      className={cn('gc-tb-btn', className)}
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!disabled && onClick) onClick();
      }}
    >
      {children}
    </button>
  );
  if (tooltip) return <Tooltip content={tooltip}>{btn}</Tooltip>;
  return btn;
}

/**
 * Group wrapper — a flex row that shrinks to content. No background /
 * padding; the terminal design lets the toolbar body's padding breathe
 * around groups. Matches the sample's `.tb-g`.
 */
export function TGroup({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn('gc-tb-g', className)}>{children}</div>;
}

/** Vertical 1px hairline between groups — `.gc-tb-div` from the stylesheet. */
export function ToolbarSep() {
  return <span aria-hidden className="gc-tb-div" />;
}
