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
 * busted. Using `bg-[var(--card)]` sidesteps the whole theme-config
 * question — it always resolves to the CSS variable at runtime.
 *
 * `disabled:bg-[var(--card)]` is belt-and-suspenders: browser UA
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
          'border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)]',
          'focus:outline-none focus:ring-1 focus:ring-[var(--ring)] focus:border-[var(--ring)]',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'disabled:bg-[var(--card)] disabled:text-[var(--foreground)]',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 size-3"
        style={{ color: 'var(--muted-foreground)' }}
      />
    </div>
  ),
);
Select.displayName = 'Select';
