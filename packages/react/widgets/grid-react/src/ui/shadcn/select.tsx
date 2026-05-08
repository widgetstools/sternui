import { type SelectHTMLAttributes, forwardRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from './utils';

/**
 * Select — native <select> wrapped so it tracks the design-system
 * tokens directly via `var(--...)` arbitrary values rather than via
 * Tailwind theme-extension classes like `bg-card`.
 *
 * Why arbitrary-value syntax instead of `bg-card` / `text-foreground`:
 * consumer apps ship on Tailwind 3.4 AND 4 and the two versions
 * configure shadcn tokens differently (v3 via `theme.extend.colors`
 * in tailwind.config.js; v4 via the `@theme inline { ... }` CSS
 * block). If a consumer is on Tailwind 3 without the extend config
 * (e.g. the ConfigService demo) then `bg-card` resolves to nothing,
 * the select paints browser-default white, and disabled states look
 * busted. Using `bg-[var(--bn-bg1)]` sidesteps the whole theme-config
 * question — it always resolves to the CSS variable at runtime.
 *
 * `disabled:bg-[var(--bn-bg1)]` is belt-and-suspenders: browser UA
 * stylesheets (Chrome / Safari on macOS) force disabled selects to
 * white on some configs, and `appearance-none` doesn't always fully
 * suppress that. An explicit disabled-state background wins.
 */
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          'flex h-7 w-full appearance-none rounded px-2 pr-7 text-[11px]',
          'border border-[var(--bn-border)] bg-[var(--bn-bg1)] text-[var(--bn-t0)]',
          'focus:outline-none focus:ring-1 focus:ring-[var(--bn-focus-ring)] focus:border-[var(--bn-focus-ring)]',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'disabled:bg-[var(--bn-bg1)] disabled:text-[var(--bn-t0)]',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 size-3"
        style={{ color: 'var(--bn-t2)' }}
      />
    </div>
  ),
);
Select.displayName = 'Select';
