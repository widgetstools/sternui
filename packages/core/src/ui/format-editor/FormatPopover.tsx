import * as React from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { cn } from '../shadcn/utils';
import { usePortalContainer } from '../PortalContainer';
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
/**
 * `children` can be either a static React node OR a render function
 * that receives `{ close }`. The function form lets popover content
 * drive its own dismissal (e.g. an inline "apply" button on the
 * format-string input that needs to commit + close in one click).
 * Plain-node consumers stay unchanged — the type union is checked at
 * runtime so existing callsites compile and run as before.
 */
export type FormatPopoverChildren =
  | React.ReactNode
  | ((api: { close: () => void }) => React.ReactNode);

export function FormatPopover({
  trigger,
  children,
  width = 240,
  align = 'start',
}: {
  trigger: React.ReactElement<{ onClick?: (e: React.MouseEvent) => void }>;
  children: FormatPopoverChildren;
  width?: number;
  align?: 'start' | 'center' | 'end';
}) {
  const [open, setOpen] = React.useState(false);
  const contentRef = React.useRef<HTMLDivElement>(null);
  // Route the Radix portal via the PortalContainer context so this
  // popover lands in the popout window's body when the settings sheet
  // is popped out.
  const portalContainer = usePortalContainer();

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
      <PopoverPrimitive.Portal container={portalContainer ?? undefined}>
        <PopoverPrimitive.Content
          ref={contentRef}
          align={align}
          sideOffset={4}
          collisionPadding={8}
          data-gc-settings=""
          className={cn(
            'z-[2147483647] rounded-md',
            // Theme-aware: prefer the theme tokens (--popover / --popover-foreground
            // / --border from the host app). The `--gc-*` vars remain as an
            // intermediate override for consumers that explicitly want to pin
            // the popover chrome (e.g. inside the cockpit-dark preview).
            'bg-[var(--gc-surface,var(--bn-bg1,#161a1e))] text-[var(--gc-text,var(--bn-t0,#eaecef))]',
            'border border-[var(--gc-border,var(--bn-border,#313944))]',
            'shadow-[0_16px_40px_rgba(0,0,0,0.25),0_0_0_1px_rgba(0,0,0,0.04)_inset]',
            'font-[var(--gc-font,"Geist","Inter",-apple-system,sans-serif)] text-[11px]',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
            'data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95',
            'data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2',
          )}
          // Keep the popover inside the viewport. Radix exposes
          // `--radix-popover-content-available-height` = the max height
          // that fits before it would hit the viewport edge (given the
          // `collisionPadding` below). Cap there and let CHILDREN
          // manage their own internal scroll — flex-column + overflow-hidden
          // on this Content means the FormatterPicker's preset grid can
          // be the single scrollable region (flex: 1; min-height: 0;
          // overflow-y: auto) while the CURRENT chip + custom-Excel row
          // stay pinned. Without this the popover would also scroll,
          // producing the doubled scrollbars users complained about.
          style={{
            width,
            maxWidth: 'calc(100vw - 16px)',
            maxHeight: 'var(--radix-popover-content-available-height, 80vh)',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            overflow: 'hidden',
            padding: 10,
            // Token-backed background — inline so it wins over the
            // Tailwind arbitrary-value class above with the same
            // specificity outcome but guaranteed application.
            // `--gc-surface` inherits from `[data-gc-settings]` via
            // cockpit.ts, which maps through `--card` with a `#161a1e`
            // final fallback. Light theme flips automatically because
            // `--card` re-binds under `[data-theme='light']` via the
            // cascade (html → body → popover content).
            background: 'var(--gc-surface, var(--bn-bg1, #161a1e))',
            color: 'var(--gc-text, var(--bn-t0, #eaecef))',
            // Suppress the browser's default focus outline on the
            // Radix Content element — Radix focuses the content on
            // open, which paints a bright blue/white ring around the
            // popover that isn't part of our design system. The
            // in-popover controls keep their own focus-visible
            // styling.
            outline: 'none',
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
          {typeof children === 'function'
            ? children({ close: () => setOpen(false) })
            : children}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
