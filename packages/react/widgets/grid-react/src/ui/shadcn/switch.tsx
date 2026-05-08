import { type InputHTMLAttributes, forwardRef } from 'react';
import { cn } from './utils';

export const Switch = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    // Padding on the label enlarges the click target far beyond the tiny
    // 28×16 track — critical for the settings-panel Rows where users kept
    // missing the switch. `-my-2` keeps the overall row height unchanged.
    <label
      className={cn(
        'relative inline-flex cursor-pointer items-center',
        'p-2 -m-2',
        className,
      )}
    >
      <input ref={ref} type="checkbox" className="sr-only peer" {...props} />
      <div className={cn(
        'h-4 w-7 rounded-full border-2 border-transparent transition-colors',
        'bg-muted peer-checked:bg-primary',
        'peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-1',
        'peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
        'after:absolute after:top-[calc(0.5rem+2px)] after:left-[calc(0.5rem+2px)] after:h-3 after:w-3',
        'after:rounded-full after:bg-white after:shadow-sm after:transition-transform',
        'peer-checked:after:translate-x-3',
      )} />
    </label>
  )
);
Switch.displayName = 'Switch';
