import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { cn } from './utils';

interface TooltipProps extends Omit<ComponentPropsWithoutRef<'div'>, 'content'> {
  content: ReactNode;
  children: ReactNode;
}

// Tooltip surface follows the design-system `--popover` / `--popover-foreground`
// tokens so it inherits the active theme: dark surface + light text under
// `[data-theme="dark"]`, light surface + dark text under `[data-theme="light"]`.
// Tailwind colour utilities aren't used here because grid-react ships without
// a Tailwind config — referencing the HSL variables directly is the only way
// to guarantee correct theming regardless of the consuming app's tokens.
//
// forwardRef + spread of unknown props is required so the wrapper can sit
// inside a Radix `<PopoverTrigger asChild>` (or `DropdownMenuTrigger`, etc.) —
// Radix clones the immediate child to attach a ref and merge event handlers,
// and a plain function component would swallow both silently.
export const Tooltip = forwardRef<HTMLDivElement, TooltipProps>(function Tooltip(
  { content, children, className, ...rest },
  ref,
) {
  return (
    <div ref={ref} className={cn('group relative inline-flex', className)} {...rest}>
      {children}
      <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-50 opacity-0 group-hover:opacity-100 transition-opacity">
        <div
          className="whitespace-nowrap"
          style={{
            background: 'hsl(var(--popover))',
            color: 'hsl(var(--popover-foreground))',
            border: '1px solid hsl(var(--border))',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.25)',
            borderRadius: 2,
            padding: '3px 6px',
            fontSize: 10,
            lineHeight: 1.3,
            fontFamily: 'var(--ds-font-sans, inherit)',
          }}
        >
          {content}
        </div>
      </div>
    </div>
  );
});
