import { Input } from '@starui/ui';
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
    <Input
      ref={ref}
      className={[
        'flex-1 min-w-0 h-8 px-2.5 rounded-sm font-sans font-semibold transition-duration-[120ms] placeholder:font-medium text-[length:var(--ds-font-size-sm)] tracking-tight shadow-none focus-visible:ring-0',
        className ?? '',
      ].join(' ')}
      style={style}
      {...rest}
    />
  );
});
