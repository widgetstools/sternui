import { forwardRef, type InputHTMLAttributes } from 'react';

/**
 * Editable title input used in the editor identity row.
 *
 * Renders as a proper bordered field (not a naked inline-editable span) so
 * it reads unambiguously as an input. Semibold keeps the title weight; the
 * border + subtle background give the "this is editable" affordance without
 * shrinking the type.
 *
 * Focus ring matches every other design-system input (border-primary on focus).
 */

export type TitleInputProps = InputHTMLAttributes<HTMLInputElement>;

export const TitleInput = forwardRef<HTMLInputElement, TitleInputProps>(function TitleInput(
  { className, style, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={[
        'flex-1 min-w-0 h-8 px-2.5 border border-border rounded-sm bg-background text-foreground font-sans font-semibold outline-none transition-colors duration-[120ms] focus:border-primary placeholder:text-muted-foreground placeholder:font-medium',
        className ?? '',
      ].join(' ')}
      style={{
        fontSize: 15,
        letterSpacing: '-0.01em',
        ...style,
      }}
      {...rest}
    />
  );
});
