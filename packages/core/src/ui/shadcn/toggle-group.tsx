import { type ReactNode, type ButtonHTMLAttributes, forwardRef, createContext, useContext } from 'react';
import { cn } from './utils';

/**
 * ToggleGroup — shadcn-style single-selection toggle group.
 * Matches the official shadcn/ui ToggleGroup API pattern:
 *   <ToggleGroup value={v} onValueChange={set}>
 *     <ToggleGroupItem value="a">A</ToggleGroupItem>
 *   </ToggleGroup>
 */

// ─── Context ────────────────────────────────────────────────────────────────

interface ToggleGroupContextValue {
  value: string;
  onValueChange: (value: string) => void;
  size?: 'sm' | 'md';
  variant?: 'default' | 'outline';
}

const ToggleGroupContext = createContext<ToggleGroupContextValue>({
  value: '',
  onValueChange: () => {},
});

// ─── ToggleGroup ────────────────────────────────────────────────────────────

interface ToggleGroupProps {
  value: string;
  onValueChange: (value: string) => void;
  children: ReactNode;
  size?: 'sm' | 'md';
  variant?: 'default' | 'outline';
  className?: string;
}

export function ToggleGroup({ value, onValueChange, children, size = 'sm', variant = 'default', className }: ToggleGroupProps) {
  return (
    <ToggleGroupContext.Provider value={{ value, onValueChange, size, variant }}>
      <div
        role="tablist"
        className={cn(
          'inline-flex items-center rounded-lg border border-border bg-muted/50 p-[3px] gap-[2px]',
          className,
        )}
      >
        {children}
      </div>
    </ToggleGroupContext.Provider>
  );
}

// ─── ToggleGroupItem ────────────────────────────────────────────────────────

interface ToggleGroupItemProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'value'> {
  value: string;
  children: ReactNode;
}

export const ToggleGroupItem = forwardRef<HTMLButtonElement, ToggleGroupItemProps>(
  ({ value, children, className, ...props }, ref) => {
    const ctx = useContext(ToggleGroupContext);
    const active = ctx.value === value;

    return (
      <button
        ref={ref}
        type="button"
        role="tab"
        aria-selected={active}
        data-state={active ? 'active' : 'inactive'}
        className={cn(
          'inline-flex items-center justify-center whitespace-nowrap rounded-md font-semibold transition-all duration-150 cursor-pointer',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
          ctx.size === 'sm' ? 'h-[22px] px-3 text-[11px]' : 'h-6 px-3.5 text-[11px]',
          active
            ? 'bg-background text-primary shadow-[0_1px_3px_rgba(0,0,0,0.12)]'
            : 'text-muted-foreground hover:text-foreground hover:bg-background/50',
          className,
        )}
        onClick={() => ctx.onValueChange(value)}
        {...props}
      >
        {children}
      </button>
    );
  }
);
ToggleGroupItem.displayName = 'ToggleGroupItem';
