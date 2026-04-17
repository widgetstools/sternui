import { useEffect, useRef, useState } from 'react';
import { Input } from '../shadcn/input';
import { cn } from '../shadcn/utils';
import type { ExpressionEditorProps, ExpressionEditorHandle } from './types';

/**
 * Fallback expression input — shown in three situations:
 *   1. While Monaco is lazy-loading on first use (< 1s on a warm cache).
 *   2. If Monaco fails to load (bad network, extension blocking, bundler bug).
 *   3. When Monaco is intentionally not used (e.g. a host app that wants the
 *      smallest possible bundle).
 *
 * Preserves the existing commit-on-blur + commit-on-Enter UX that every
 * current call site relies on so the editor is functional before Monaco
 * arrives — no dead fields, ever, which matters for a trading terminal.
 */
export function FallbackInput({
  value,
  onCommit,
  onChange,
  placeholder,
  multiline,
  lines = 4,
  fontSize = 11,
  readOnly,
  validate: _validate,
  warnDeprecated: _warnDeprecated,
  columnsProvider: _columnsProvider,
  functionsProvider: _functionsProvider,
  'data-testid': dataTestId,
  handleRef,
}: ExpressionEditorProps & { handleRef?: React.Ref<ExpressionEditorHandle> }) {
  const [text, setText] = useState(value);
  const ref = useRef(value);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  // Keep in sync when the caller swaps `value` from outside (switching rules).
  useEffect(() => {
    if (value !== ref.current) {
      setText(value);
      ref.current = value;
    }
  }, [value]);

  const commit = () => {
    if (text !== ref.current) {
      ref.current = text;
      onCommit(text);
    }
  };

  // Expose the imperative handle even in fallback mode — the formula bar
  // shouldn't care whether Monaco is up yet.
  useEffect(() => {
    if (!handleRef) return;
    const h: ExpressionEditorHandle = {
      focus: () => inputRef.current?.focus(),
      getValue: () => text,
    };
    if (typeof handleRef === 'function') handleRef(h);
    else (handleRef as { current: ExpressionEditorHandle | null }).current = h;
    return () => {
      if (typeof handleRef === 'function') handleRef(null as unknown as ExpressionEditorHandle);
      else (handleRef as { current: ExpressionEditorHandle | null }).current = null;
    };
  }, [handleRef, text]);

  const commonProps = {
    value: text,
    placeholder,
    readOnly,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setText(e.target.value);
      onChange?.(e.target.value);
    },
    onBlur: commit,
    style: { fontSize },
    'data-testid': dataTestId,
  };

  if (multiline) {
    return (
      <textarea
        ref={(el) => { inputRef.current = el; }}
        {...commonProps}
        rows={lines}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            commit();
          }
        }}
        className={cn(
          'w-full rounded border bg-card px-2 py-1 text-foreground font-mono',
          'placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring',
          'border-border',
        )}
      />
    );
  }

  return (
    <Input
      ref={(el) => { inputRef.current = el; }}
      {...commonProps}
      onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
      className={cn('font-mono')}
    />
  );
}
