/**
 * Popover — built on @radix-ui/react-popover.
 *
 * Radix handles portal rendering, collision detection (flip + shift),
 * focus management, and accessibility out of the box. This wrapper adds
 * the project's visual styling (--gc-* tokens with dark fallbacks) and
 * re-exports the Radix primitives with the names consumers already use.
 *
 * Usage:
 *   <Popover>
 *     <PopoverTrigger asChild>
 *       <button>Open</button>
 *     </PopoverTrigger>
 *     <PopoverContent>
 *       …picker / editor / menu…
 *     </PopoverContent>
 *   </Popover>
 *
 * For backward compatibility with the old `<Popover trigger={…}>…</Popover>`
 * API used by FormattingToolbar, see `PopoverCompat` at the bottom.
 */

import * as React from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { cn } from './utils';

const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;
const PopoverAnchor = PopoverPrimitive.Anchor;
const PopoverClose = PopoverPrimitive.Close;

const PopoverContent = React.forwardRef<
  React.ComponentRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = 'start', sideOffset = 4, children, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      collisionPadding={8}
      data-gc-settings=""
      className={cn(
        // Base layout
        'z-[2147483647] w-72 rounded-md p-2.5',
        // Theme — use gc-* vars with dark fallbacks for portal context
        'bg-[var(--gc-surface,#161a1e)] text-[var(--gc-text,#eaecef)]',
        'border border-[var(--gc-border,#313944)]',
        'shadow-[0_16px_40px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.02)_inset]',
        // Font
        'font-[var(--gc-font,"Geist","Inter",-apple-system,sans-serif)] text-[11px]',
        // Animations
        'data-[state=open]:animate-in data-[state=closed]:animate-out',
        'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
        'data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95',
        'data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2',
        'data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2',
        className,
      )}
      onMouseDown={(e) => {
        // Prevent focus-steal from inputs; stop propagation so parent
        // click handlers don't close anything.
        e.stopPropagation();
        const tag = (e.target as HTMLElement).tagName;
        if (tag !== 'SELECT' && tag !== 'INPUT' && tag !== 'OPTION') e.preventDefault();
      }}
      {...props}
    >
      {children}
    </PopoverPrimitive.Content>
  </PopoverPrimitive.Portal>
));
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

/**
 * Backward-compatible wrapper matching the old `<Popover trigger={…}>…</Popover>`
 * API. Used by FormattingToolbar's font-size, save-as, and number-format popovers.
 * New code should use `<Popover>/<PopoverTrigger>/<PopoverContent>` directly.
 */
function PopoverCompat({
  trigger,
  children,
  align = 'start',
  className,
  open: controlledOpen,
  onOpenChange,
}: {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: 'start' | 'center' | 'end';
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <Popover open={controlledOpen} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <span className="inline-flex cursor-pointer">{trigger}</span>
      </PopoverTrigger>
      <PopoverContent align={align} className={cn('w-auto', className)}>
        {children}
      </PopoverContent>
    </Popover>
  );
}

export {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverAnchor,
  PopoverClose,
  PopoverCompat,
};

// Default export is the compat wrapper so existing `import { Popover }` works.
export { PopoverCompat as default };
