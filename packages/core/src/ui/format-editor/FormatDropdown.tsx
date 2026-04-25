import * as React from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { Check } from 'lucide-react';
import { cn } from '../shadcn/utils';
import { usePortalContainer } from '../PortalContainer';
import { clickIsInsideAnyOpenPopover, registerPopoverRoot } from './popoverStack';

/**
 * Portal dropdown with Figma-style checkmark rail, built on Radix Popover.
 * Used for select-style choices (thickness, style, preset, font-size, etc.)
 */
export function FormatDropdown<V extends string | number>({
  trigger,
  options,
  value,
  onChange,
  footer,
  width,
}: {
  trigger: React.ReactElement<{ onClick?: (e: React.MouseEvent) => void }>;
  options: Array<{ value: V; label: string; icon?: React.ReactNode }>;
  value: V;
  onChange: (v: V) => void;
  footer?: React.ReactNode;
  width?: number;
}) {
  const [open, setOpen] = React.useState(false);
  const contentRef = React.useRef<HTMLDivElement>(null);
  // Route through PortalContainer so the dropdown lands in the popout
  // window when the sheet is popped out.
  const portalContainer = usePortalContainer();

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
          align="start"
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
          )}
          style={{
            minWidth: width ?? 180,
            padding: 4,
            // Token-backed opaque background. Mirrors FormatPopover;
            // auto-flips for light theme via the --card re-binding
            // under [data-theme='light'].
            background: 'var(--gc-surface, var(--bn-bg1, #161a1e))',
            color: 'var(--gc-text, var(--bn-t0, #eaecef))',
            // Suppress the browser's default focus outline on the
            // Radix-focused Content element.
            outline: 'none',
          }}
          onMouseDown={(e) => {
            e.stopPropagation();
            const tag = (e.target as HTMLElement).tagName;
            if (tag !== 'SELECT' && tag !== 'INPUT' && tag !== 'OPTION') e.preventDefault();
          }}
          onInteractOutside={(e) => {
            if (clickIsInsideAnyOpenPopover(e.target as Node)) {
              e.preventDefault();
            }
          }}
        >
          {options.map((o) => {
            const selected = o.value === value;
            return (
              <button
                key={String(o.value)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  padding: '6px 8px 6px 4px',
                  background: 'transparent',
                  color: 'var(--gc-text, #eaecef)',
                  border: 'none',
                  borderRadius: 'var(--gc-radius-sm, 4px)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontFamily: 'var(--gc-font)',
                  fontSize: 'var(--gc-font-sm, 11px)',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--gc-surface-hover, #1e2329)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <span
                  style={{
                    width: 14,
                    display: 'inline-flex',
                    justifyContent: 'center',
                    color: selected ? 'var(--gc-positive, #2dd4bf)' : 'transparent',
                  }}
                >
                  <Check size={11} strokeWidth={2} />
                </span>
                {o.icon && (
                  <span style={{ color: selected ? 'var(--gc-positive)' : 'var(--gc-text-muted)', display: 'inline-flex' }}>
                    {o.icon}
                  </span>
                )}
                <span style={{ flex: 1 }}>{o.label}</span>
              </button>
            );
          })}
          {footer && (
            <>
              <div style={{ height: 1, background: 'var(--gc-border)', margin: '4px 0' }} />
              {footer}
            </>
          )}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
