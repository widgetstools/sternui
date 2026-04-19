import { useMemo, useState } from 'react';
import { Eye, EyeOff, Minus, Pipette } from 'lucide-react';
import { ColorPickerPopover } from './ColorPickerPopover';

/**
 * Cockpit compact colour field — 28px tall pill with checkerboard preview
 * when empty, monospace hex readout, alpha percentage, and optional
 * visibility toggle + clear. Matches IconInput's height so fields in a
 * PairRow align.
 */

export interface CompactColorFieldProps {
  value?: string;
  alpha?: number;
  onChange: (value: string, alpha?: number) => void;
  onClear?: () => void;
  visible?: boolean;
  onToggleVisible?: (next: boolean) => void;
  recents?: string[];
  disabled?: boolean;
  placeholder?: string;
  'data-testid'?: string;
}

const CHECKERBOARD =
  'conic-gradient(var(--ck-t3, #4a5360) 0 25%, var(--ck-border, #2d3339) 0 50%, var(--ck-t3, #4a5360) 0 75%, var(--ck-border, #2d3339) 0) 0 0 / 6px 6px';

export function CompactColorField({
  value,
  alpha = 100,
  onChange,
  onClear,
  visible = true,
  onToggleVisible,
  recents,
  disabled,
  placeholder = 'NONE',
  ...rest
}: CompactColorFieldProps) {
  const [open, setOpen] = useState(false);
  const [hexDraft, setHexDraft] = useState(value ?? '');

  if (value !== undefined && value !== hexDraft && !open) {
    queueMicrotask(() => setHexDraft(value));
  }

  const hasValue = Boolean(value);

  // Resolve CSS-var / named / rgba values to a clean 6-char hex for both
  // the swatch paint and the text readout.
  const resolvedHex = useMemo(() => {
    if (!value) return '';
    if (/^#[0-9a-fA-F]{6}$/.test(value)) return value.toUpperCase();
    if (typeof document === 'undefined') return value;
    try {
      const probe = document.createElement('span');
      probe.style.color = value;
      probe.style.display = 'none';
      document.body.appendChild(probe);
      const computed = getComputedStyle(probe).color;
      document.body.removeChild(probe);
      const m = computed.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (m) {
        const toHex = (n: string) => Number(n).toString(16).padStart(2, '0');
        return `#${toHex(m[1])}${toHex(m[2])}${toHex(m[3])}`.toUpperCase();
      }
      return value;
    } catch {
      return value;
    }
  }, [value]);

  const displayHex = hasValue ? resolvedHex : '';

  return (
    <div
      data-testid={rest['data-testid']}
      aria-disabled={disabled ? 'true' : 'false'}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        height: 28,
        padding: '0 8px',
        borderRadius: 2,
        background: 'var(--ck-bg, #111417)',
        border: '1px solid var(--ck-border, #2d3339)',
        transition: 'border-color 120ms',
        cursor: disabled ? 'not-allowed' : 'text',
        opacity: disabled ? 0.55 : 1,
      }}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (disabled) return;
        if (
          target.closest('[data-action="toggle-visible"]') ||
          target.closest('[data-action="clear"]')
        )
          return;
        setOpen(true);
      }}
    >
      <ColorPickerPopover
        open={open && !disabled}
        onOpenChange={setOpen}
        value={value}
        alpha={alpha}
        onChange={onChange}
        onClear={onClear}
        recents={recents}
        trigger={
          <button
            type="button"
            disabled={disabled}
            aria-label="Pick color"
            style={{
              width: 14,
              height: 14,
              minWidth: 14,
              borderRadius: 0,
              padding: 0,
              cursor: disabled ? 'not-allowed' : 'pointer',
              border: '1px solid var(--ck-border-hi, #3a4149)',
              background: hasValue ? resolvedHex || (value as string) : CHECKERBOARD,
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {!hasValue && (
              <Pipette
                size={8}
                color="var(--ck-t2, #6b7480)"
                style={{ position: 'absolute', top: 2, left: 2 }}
              />
            )}
          </button>
        }
      />

      <input
        type="text"
        disabled={disabled}
        placeholder={placeholder}
        value={open ? hexDraft : displayHex}
        onChange={(e) => setHexDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.currentTarget.blur();
          } else if (e.key === 'Escape') {
            setHexDraft(value ?? '');
            e.currentTarget.blur();
          }
        }}
        onBlur={() => {
          const next = hexDraft.trim();
          if (!next) {
            if (hasValue && onClear) onClear();
            return;
          }
          const normalized = next.startsWith('#') ? next : `#${next}`;
          if (/^#[0-9a-fA-F]{6}$/.test(normalized)) {
            onChange(normalized.toUpperCase(), alpha);
          } else {
            setHexDraft(value ?? '');
          }
        }}
        style={{
          flex: 1,
          minWidth: 0,
          height: 26,
          border: 'none',
          background: 'transparent',
          color: hasValue ? 'var(--ck-t0, #e5e7ea)' : 'var(--ck-t3, #4a5360)',
          fontFamily: 'var(--ck-font-mono, "IBM Plex Mono", monospace)',
          fontSize: 11,
          fontWeight: 500,
          outline: 'none',
          padding: 0,
          textTransform: 'uppercase',
          letterSpacing: '0.02em',
        }}
      />

      <span
        style={{
          fontFamily: 'var(--ck-font-mono, "IBM Plex Mono", monospace)',
          fontSize: 11,
          color: 'var(--ck-t1, #9ba3ad)',
          fontVariantNumeric: 'tabular-nums',
          minWidth: 28,
          textAlign: 'right',
          flexShrink: 0,
        }}
      >
        {hasValue ? `${alpha}%` : ''}
      </span>

      {onToggleVisible && (
        <button
          type="button"
          data-action="toggle-visible"
          disabled={disabled}
          onClick={() => onToggleVisible(!visible)}
          title={visible ? 'Hide' : 'Show'}
          style={{
            width: 20,
            height: 20,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: 'none',
            background: 'transparent',
            color: 'var(--ck-t2, #6b7480)',
            cursor: disabled ? 'not-allowed' : 'pointer',
            borderRadius: 2,
            flexShrink: 0,
          }}
        >
          {visible ? <Eye size={12} strokeWidth={1.75} /> : <EyeOff size={12} strokeWidth={1.75} />}
        </button>
      )}

      {onClear && hasValue && (
        <button
          type="button"
          data-action="clear"
          disabled={disabled}
          onClick={onClear}
          title="Clear color"
          style={{
            width: 20,
            height: 20,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: 'none',
            background: 'transparent',
            color: 'var(--ck-t2, #6b7480)',
            cursor: disabled ? 'not-allowed' : 'pointer',
            borderRadius: 2,
            flexShrink: 0,
          }}
        >
          <Minus size={12} strokeWidth={2} />
        </button>
      )}
    </div>
  );
}
