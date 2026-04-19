/**
 * CompactColorField — the 30px pill shown in settings rows.
 *
 *   ┌───────────────────────────────────────┐
 *   │  ▊  #3b82f6          100%  👁  ✕     │
 *   └───────────────────────────────────────┘
 *
 * Clicking the whole field opens the shadcn `ColorPickerPopover` — which
 * handles the actual picking (palette, hue, alpha, hex). The eye icon
 * is shown only when `onClear` is supplied; clicking clears the value
 * without opening the picker.
 *
 * The field's width is `100%` so the settings-row grid can size it — the
 * caller controls the horizontal footprint.
 */
import { useState, type ReactNode } from 'react';
import { Eye, X } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../shadcn/popover';
import { ColorPicker } from '../shadcn/color-picker';
import { Mono } from '../settings';

export interface CompactColorFieldProps {
  value?: string;
  onChange?: (value: string) => void;
  /** When supplied, an Eye icon shows — clicking clears the value. */
  onClear?: () => void;
  /** Shown in the field when `value` is empty. */
  placeholder?: string;
  disabled?: boolean;
  'data-testid'?: string;
}

export function CompactColorField({
  value,
  onChange,
  onClear,
  placeholder = 'auto',
  disabled,
  'data-testid': testId,
}: CompactColorFieldProps) {
  const [open, setOpen] = useState(false);
  const display = value ?? '';

  return (
    <Popover open={open} onOpenChange={(next) => { if (!disabled) setOpen(next); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          data-testid={testId}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            height: 30,
            width: '100%',
            padding: '0 8px',
            background: 'var(--ck-bg)',
            border: '1px solid var(--ck-border-hi)',
            borderRadius: 3,
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.5 : 1,
          }}
        >
          <Swatch color={value} />
          <Mono size={11} color={value ? 'var(--ck-t0)' : 'var(--ck-t3)'} style={{ flex: 1, textAlign: 'left' }}>
            {display || placeholder}
          </Mono>
          {onClear && value && (
            <IconButton
              title="Clear"
              onClick={(e) => { e.stopPropagation(); onClear(); }}
            >
              <Eye size={12} strokeWidth={1.75} />
            </IconButton>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={4} style={{ padding: 0, width: 280 }}>
        <ColorPicker
          value={value ?? '#ffffff'}
          onChange={(next) => {
            if (next === undefined) onClear?.();
            else onChange?.(next);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

function Swatch({ color }: { color?: string }) {
  return (
    <span style={{
      display: 'inline-block',
      width: 14,
      height: 14,
      borderRadius: 2,
      background: color ?? 'repeating-linear-gradient(45deg, var(--ck-t3) 0 2px, transparent 2px 5px)',
      border: '1px solid var(--ck-border-hi)',
      flexShrink: 0,
    }} />
  );
}

function IconButton({
  children,
  title,
  onClick,
}: {
  children: ReactNode;
  title: string;
  onClick: (e: React.MouseEvent<HTMLSpanElement>) => void;
}) {
  return (
    <span
      role="button"
      title={title}
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 20,
        height: 20,
        color: 'var(--ck-t2)',
        cursor: 'pointer',
      }}
    >{children}</span>
  );
}

// Re-export the X icon path used in legacy consumers.
export { X };
