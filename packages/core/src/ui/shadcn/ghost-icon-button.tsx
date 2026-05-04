import { type ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from './utils';

export type GhostIconButtonVariant = 'default' | 'accent' | 'destructive';
export type GhostIconButtonSize = 'sm' | 'md';
export type GhostIconButtonReveal = 'always' | 'on-row-hover';

export interface GhostIconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Hover-tint accent. `default` and `accent` both use the info-blue
   *  token; `destructive` flips to the negative-red token. */
  variant?: GhostIconButtonVariant;
  /** `sm` = 22×22 (the row-action default), `md` = 28×28 (toolbar tier). */
  size?: GhostIconButtonSize;
  /** `on-row-hover` keeps the button at opacity 0 until any ancestor
   *  marked `data-row-hover-target` is hovered (or this button itself
   *  is focused). Pair with the parent's `data-row-hover-target` attr.
   *  Use `always` for toolbar buttons that should remain visible. */
  reveal?: GhostIconButtonReveal;
  /** Force-show while `reveal='on-row-hover'` is active — e.g., while
   *  a row's inline editor is open and other actions need to stay
   *  visible. Ignored for `reveal='always'`. */
  revealed?: boolean;
}

/**
 * Token-driven stylesheet for `GhostIconButton`.
 *
 * Authored as a string + injected once at module load (rather than as
 * a separate `.css` file imported from the TSX) because the core
 * package is published as a tsc-emitted `.js` library. tsc preserves
 * `import './x.css'` statements in the output, but the consuming
 * bundler may not be configured to resolve them — keeping the styles
 * inline keeps the package self-contained without forcing every
 * downstream app to wire up CSS bundling for our internal files.
 *
 * Resting color sits at the secondary text tier (--bn-t1). Variants
 * tint hover with the matching accent token via color-mix overlays so
 * theme switches update the highlight automatically. Sizes and the
 * reveal-on-row-hover affordance are driven by data-attributes so
 * variants compose cleanly without exploding the class list.
 */
const GHOST_ICON_BUTTON_CSS = `
.gc-gib {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--bn-t1);
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 120ms, color 120ms, opacity 120ms;
}
.gc-gib:focus-visible {
  outline: 2px solid var(--bn-focus-ring, var(--bn-blue));
  outline-offset: 1px;
}
.gc-gib:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}
.gc-gib[data-variant='default']:not(:disabled):hover,
.gc-gib[data-variant='accent']:not(:disabled):hover {
  background: color-mix(in srgb, var(--bn-blue) 14%, transparent);
  color: var(--bn-blue);
}
.gc-gib[data-variant='destructive']:not(:disabled):hover {
  background: color-mix(in srgb, var(--bn-red) 14%, transparent);
  color: var(--bn-red);
}
.gc-gib[data-size='md'] {
  width: 28px;
  height: 28px;
  border-radius: 6px;
}
.gc-gib[data-reveal='on-row-hover'] {
  opacity: 0;
}
[data-row-hover-target]:hover .gc-gib[data-reveal='on-row-hover'],
.gc-gib[data-reveal='on-row-hover']:focus-visible,
.gc-gib[data-reveal='on-row-hover'][data-revealed='true'] {
  opacity: 1;
}
`;

const STYLE_TAG_ID = 'gc-ghost-icon-button-styles';

/** Inject the stylesheet once per document. SSR-safe (no-op when
 *  `document` is undefined) and idempotent under React StrictMode's
 *  double-render. */
function ensureStylesInjected(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_TAG_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_TAG_ID;
  style.textContent = GHOST_ICON_BUTTON_CSS;
  document.head.appendChild(style);
}

ensureStylesInjected();

/**
 * Ghost-styled icon button for compact row / toolbar actions.
 *
 * Replaces the inline-styled hover/reveal pattern that was duplicated
 * across the profile selector, filter pills, and rule rows. Color and
 * sizing flow from `--bn-*` tokens, so dark/light themes adapt without
 * caller intervention.
 *
 * Usage:
 * ```tsx
 * <div data-row-hover-target>
 *   <GhostIconButton
 *     reveal="on-row-hover"
 *     variant="destructive"
 *     aria-label="Delete"
 *     onClick={…}
 *   >
 *     <Trash2 size={12} strokeWidth={2.25} />
 *   </GhostIconButton>
 * </div>
 * ```
 */
export const GhostIconButton = forwardRef<HTMLButtonElement, GhostIconButtonProps>(
  (
    {
      className,
      variant = 'default',
      size = 'sm',
      reveal = 'always',
      revealed,
      type,
      children,
      ...rest
    },
    ref,
  ) => (
    <button
      ref={ref}
      type={type ?? 'button'}
      className={cn('gc-gib', className)}
      data-variant={variant}
      data-size={size}
      data-reveal={reveal}
      data-revealed={revealed ? 'true' : undefined}
      {...rest}
    >
      {children}
    </button>
  ),
);
GhostIconButton.displayName = 'GhostIconButton';
