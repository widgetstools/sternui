import * as React from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { cn } from '../shadcn/utils';
import { clickIsInsideAnyOpenPopover, registerPopoverRoot } from './popoverStack';

/**
 * FormatPopover — thin wrapper around the Radix Popover for use in the
 * format-editor primitive set. Preserves the cloneElement trigger API
 * that existing consumers (PropColor, ColorPickerPopover, FormatSwatch,
 * BorderSidesEditor, ConditionalStylingPanel) expect.
 *
 * Radix handles:
 *   - Portal rendering (escapes overflow:hidden)
 *   - Collision detection (flip + shift to stay in viewport)
 *   - Focus management + keyboard dismiss (Escape)
 *   - Accessibility (aria-expanded, role, etc.)
 *
 * We add:
 *   - --gc-* theming with dark fallbacks
 *   - data-gc-settings attr for CSS variable scoping
 *   - Popover stack registration for nested-popover awareness
 *   - stopPropagation on mousedown inside content
 *   - max z-index (2147483647)
 */
export function FormatPopover({
  trigger,
  children,
  width = 240,
  align = 'start',
}: {
  trigger: React.ReactElement<{ onClick?: (e: React.MouseEvent) => void }>;
  children: React.ReactNode;
  width?: number;
  align?: 'start' | 'center' | 'end';
}) {
  const [open, setOpen] = React.useState(false);
  const contentRef = React.useRef<HTMLDivElement>(null);

  // Register in the shared popover stack for nested-popover close logic.
  React.useEffect(() => {
    if (!open || !contentRef.current) return;
    return registerPopoverRoot(contentRef.current);
  }, [open]);

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        {trigger}
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          ref={contentRef}
          align={align}
          sideOffset={4}
          collisionPadding={8}
          data-gc-settings=""
          className={cn(
            'z-[2147483647] rounded-md',
            'bg-[var(--gc-surface,#161a1e)] text-[var(--gc-text,#eaecef)]',
            'border border-[var(--gc-border,#313944)]',
            'shadow-[0_16px_40px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.02)_inset]',
            'font-[var(--gc-font,"Geist","Inter",-apple-system,sans-serif)] text-[11px]',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
            'data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95',
            'data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2',
          )}
          // Keep the popover inside the viewport. Radix exposes
          // `--radix-popover-content-available-height` = the max height
          // that fits before it would hit the viewport edge (given the
          // `collisionPadding` below). Cap there and scroll internally
          // so tall content (FormatterPicker's preset grid + currency
          // row + custom Excel input) stays reachable on short
          // viewports instead of clipping off the top or bottom.
          style={{
            width,
            maxWidth: 'calc(100vw - 16px)',
            maxHeight: 'var(--radix-popover-content-available-height, 80vh)',
            overflowY: 'auto',
            padding: 10,
          }}
          onMouseDown={(e) => {
            e.stopPropagation();
            const tag = (e.target as HTMLElement).tagName;
            if (tag !== 'SELECT' && tag !== 'INPUT' && tag !== 'OPTION') e.preventDefault();
          }}
          // Prevent Radix from auto-closing when clicking inside nested
          // popovers (e.g., the thickness dropdown inside the border editor).
          onInteractOutside={(e) => {
            if (clickIsInsideAnyOpenPopover(e.target as Node)) {
              e.preventDefault();
            }
          }}
        >
          {children}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
