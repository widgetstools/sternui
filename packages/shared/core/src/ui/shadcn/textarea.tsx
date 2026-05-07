import { type TextareaHTMLAttributes, forwardRef } from 'react';
import { cn } from './utils';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Red border + focus ring to indicate a validation error. Matches Input. */
  error?: boolean;
}

/**
 * Shadcn-style textarea. Mirrors `Input`'s shape (forwardRef, className
 * composition via `cn()`, `error` prop wiring `border-destructive`), with
 * a sensible default `min-height` for multi-line content.
 *
 * Use cases in v2 settings panels:
 *   - Expression fields (replaces both raw `<textarea>` and inline Monaco).
 *   - Long-form text fields like rule descriptions.
 */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, rows = 3, ...props }, ref) => (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(
        'flex w-full rounded border bg-card px-2 py-1.5 text-[12px] text-foreground',
        'placeholder:text-muted-foreground',
        'focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'resize-y min-h-[60px]',
        error ? 'border-destructive focus:ring-destructive' : 'border-border',
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';
