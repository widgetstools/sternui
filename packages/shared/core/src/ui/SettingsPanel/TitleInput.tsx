import { forwardRef, type InputHTMLAttributes } from 'react';

/**
 * Editable title input used in the editor identity row.
 *
 * Renders as a proper bordered field (not a naked inline-editable span) so
 * it reads unambiguously as an input. 16px Plex Sans Semibold keeps the
 * title weight; the border + subtle background give the "this is editable"
 * affordance without shrinking the type.
 *
 * Phosphor-green focus ring matches every other v2 input.
 */

export type TitleInputProps = InputHTMLAttributes<HTMLInputElement>;

export const TitleInput = forwardRef<HTMLInputElement, TitleInputProps>(function TitleInput(
  { style, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className="gc-title-input"
      style={{
        flex: 1,
        minWidth: 0,
        height: 32,
        padding: '0 10px',
        border: '1px solid var(--ck-border-hi, #3a4149)',
        background: 'var(--ck-bg, #111417)',
        color: 'var(--ck-t0, #e5e7ea)',
        fontFamily: 'var(--ck-font-sans, "IBM Plex Sans", sans-serif)',
        fontSize: 15,
        fontWeight: 600,
        letterSpacing: '-0.01em',
        outline: 'none',
        borderRadius: 2,
        transition: 'border-color 120ms',
        ...style,
      }}
      {...rest}
    />
  );
});
