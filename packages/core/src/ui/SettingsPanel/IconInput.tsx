import { forwardRef, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

/**
 * Cockpit input pill — sharp 2px corners, `--ck-bg` inset, phosphor focus
 * ring, Plex Sans body / Plex Mono monospace option.
 *
 * Commit model: local draft + commit on blur / Enter. Consumers hook
 * the commit to their `useModuleDraft().setDraft` so keystroke thrash
 * is bounded to this field.
 *
 * Not wrapping the shadcn `<Input>` any more — the extra forwardRef layer
 * didn't buy anything once the sheet's scoped CSS unified input sizing,
 * and keeping this component self-contained makes the cockpit rules
 * (height 28, inner font 12, color tokens) the single source of truth.
 */

export interface IconInputProps {
  value?: string;
  /** Fires on blur OR when the user presses Enter. */
  onCommit?: (value: string) => void;
  /** Live text stream — wire only when the caller needs real-time reactions. */
  onChange?: (value: string) => void;
  icon?: ReactNode;
  /** Small right-side unit label — e.g. "PX", "%", "°". Rendered as tracked caps. */
  suffix?: string;
  placeholder?: string;
  monospace?: boolean;
  disabled?: boolean;
  error?: boolean;
  /** Marks the input inputMode="decimal" — still a normal text input. */
  numeric?: boolean;
  style?: CSSProperties;
  'data-testid'?: string;
  'aria-label'?: string;
}

export const IconInput = forwardRef<HTMLInputElement, IconInputProps>(function IconInput(
  {
    value = '',
    onCommit,
    onChange,
    icon,
    suffix,
    placeholder,
    monospace,
    disabled,
    error,
    numeric,
    style,
    ...rest
  },
  ref,
) {
  const [draft, setDraft] = useState(value);
  const lastExternal = useRef(value);
  useEffect(() => {
    if (value !== lastExternal.current) {
      setDraft(value);
      lastExternal.current = value;
    }
  }, [value]);

  const commit = () => {
    if (draft !== lastExternal.current) {
      lastExternal.current = draft;
      onCommit?.(draft);
    }
  };

  return (
    <div
      className="gc-icon-pill"
      data-error={error ? 'true' : 'false'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        flex: 1,
        minWidth: 0,
        height: 28,
        borderRadius: 2,
        background: 'var(--ck-bg, #111417)',
        border: `1px solid ${error ? 'var(--ck-red, #f87171)' : 'var(--ck-border, #2d3339)'}`,
        padding: '0 8px',
        gap: 6,
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'text',
        transition: 'border-color 120ms',
        ...style,
      }}
    >
      {icon && (
        <span
          style={{
            color: 'var(--ck-t3, #4a5360)',
            display: 'inline-flex',
            flexShrink: 0,
            fontSize: 11,
          }}
        >
          {icon}
        </span>
      )}
      <input
        ref={ref}
        value={draft}
        disabled={disabled}
        placeholder={placeholder}
        inputMode={numeric ? 'decimal' : undefined}
        onChange={(e) => {
          setDraft(e.target.value);
          onChange?.(e.target.value);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commit();
            e.currentTarget.blur();
          }
        }}
        data-testid={rest['data-testid']}
        aria-label={rest['aria-label']}
        style={{
          flex: 1,
          minWidth: 0,
          background: 'transparent',
          border: 'none',
          outline: 'none',
          height: 'auto',
          padding: 0,
          color: 'var(--ck-t0, #e5e7ea)',
          fontFamily: monospace
            ? 'var(--ck-font-mono, "IBM Plex Mono", monospace)'
            : 'var(--ck-font-sans, "IBM Plex Sans", sans-serif)',
          fontSize: 12,
          fontVariantNumeric: monospace || numeric ? 'tabular-nums' : undefined,
        }}
      />
      {suffix && (
        <span
          className="gc-caps"
          style={{
            color: 'var(--ck-t3, #4a5360)',
            fontSize: 9,
            letterSpacing: '0.08em',
            flexShrink: 0,
          }}
        >
          {suffix}
        </span>
      )}
    </div>
  );
});
