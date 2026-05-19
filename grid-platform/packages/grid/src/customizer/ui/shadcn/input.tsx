import { type InputHTMLAttributes, forwardRef } from 'react';
import { cn } from './utils';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'flex h-7 w-full rounded border bg-card px-2 text-[11px] text-foreground',
        'placeholder:text-muted-foreground',
        'focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring',
        'disabled:cursor-not-allowed disabled:opacity-50',
        error ? 'border-destructive focus:ring-destructive' : 'border-border',
        className
      )}
      {...props}
    />
  )
);
Input.displayName = 'Input';
