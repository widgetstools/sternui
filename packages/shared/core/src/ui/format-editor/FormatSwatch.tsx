import { useEffect, useState } from 'react';
import { Eye, EyeOff, Minus } from 'lucide-react';
import { FormatPopover } from './FormatPopover';
import { FormatColorPicker } from './FormatColorPicker';

/**
 * Figma-style Fill/Stroke row: color chip + hex entry + opacity + eye + minus.
 * Clicking the chip opens the FormatColorPicker in a portal popover.
 */
export function FormatSwatch({
  value,
  opacity = 100,
  visible = true,
  onChange,
  onOpacity,
  onVisibility,
  onRemove,
}: {
  value: string;
  opacity?: number;
  visible?: boolean;
  onChange?: (v: string) => void;
  onOpacity?: (n: number) => void;
  onVisibility?: (v: boolean) => void;
  onRemove?: () => void;
}) {
  const hexDisplay = value.replace(/^#/, '').toUpperCase();
  const [hexInput, setHexInput] = useState(hexDisplay);
  useEffect(() => setHexInput(hexDisplay), [hexDisplay]);

  const iconBtn: React.CSSProperties = {
    width: 18,
    height: 18,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    color: 'var(--gc-text-muted)',
    border: 'none',
    borderRadius: 2,
    cursor: 'pointer',
    padding: 0,
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        background: 'var(--gc-surface-hover)',
        borderRadius: 'var(--gc-radius-sm, 4px)',
        padding: '0 8px',
        height: 28,
      }}
    >
      <FormatPopover
        trigger={
          <button
            style={{
              width: 14,
              height: 14,
              borderRadius: 2,
              background: value,
              border: '1px solid var(--gc-border)',
              padding: 0,
              cursor: 'pointer',
              flexShrink: 0,
            }}
            title="Choose color"
          />
        }
        width={260}
      >
        <FormatColorPicker
          value={value}
          onChange={(hex) => onChange?.(hex)}
        />
      </FormatPopover>
      <input
        value={hexInput}
        onChange={(e) => setHexInput(e.target.value.toUpperCase().slice(0, 6))}
        onBlur={() => {
          if (hexInput.length === 6 && /^[0-9A-F]+$/.test(hexInput)) onChange?.('#' + hexInput);
          else setHexInput(hexDisplay);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        style={{
          flex: 1,
          minWidth: 0,
          background: 'transparent',
          border: 'none',
          outline: 'none',
          color: 'var(--gc-text)',
          fontFamily: 'var(--gc-font-mono)',
          fontSize: 'var(--gc-font-sm)',
          padding: 0,
          textTransform: 'uppercase',
        }}
      />
      <input
        value={opacity}
        onChange={(e) => onOpacity?.(Number(e.target.value) || 0)}
        style={{
          width: 34,
          textAlign: 'right',
          background: 'transparent',
          border: 'none',
          outline: 'none',
          color: 'var(--gc-text-muted)',
          fontFamily: 'var(--gc-font-mono)',
          fontSize: 10,
          padding: 0,
        }}
      />
      <span style={{ color: 'var(--gc-text-dim)', fontSize: 10 }}>%</span>
      <span style={{ width: 1, height: 14, background: 'var(--gc-border)', marginInline: 2 }} />
      {onVisibility && (
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onVisibility(!visible)}
          style={iconBtn}
          title={visible ? 'Hide' : 'Show'}
        >
          {visible ? <Eye size={12} strokeWidth={1.75} /> : <EyeOff size={12} strokeWidth={1.75} />}
        </button>
      )}
      {onRemove && (
        <button onMouseDown={(e) => e.preventDefault()} onClick={onRemove} style={iconBtn} title="Remove">
          <Minus size={12} strokeWidth={1.75} />
        </button>
      )}
    </div>
  );
}
