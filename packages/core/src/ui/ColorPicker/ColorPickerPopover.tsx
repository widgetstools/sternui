import { useEffect, useState } from 'react';
import { FormatColorPicker } from '../format-editor';
import { Popover, PopoverContent, PopoverTrigger } from '../shadcn/popover';

/**
 * ColorPickerPopover — v2 Figma-authentic popover shell.
 *
 * Visual goals (from the Pattern D reference):
 *   - Narrow 228px popover, compact but legible.
 *   - Reuses the battle-tested FormatColorPicker internals (SV pad, hue
 *     strip, presets, recents, pipette, hex) so no color-logic
 *     duplication.
 *   - Adds an alpha slider + (optional) recents prop so callers can pipe
 *     module-specific recent swatches in without touching localStorage.
 *
 * Keeps FormatColorPicker unchanged — we're a thin shell, not a rewrite.
 */

export interface ColorPickerPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: React.ReactNode;
  value?: string;
  alpha?: number;
  onChange: (value: string, alpha?: number) => void;
  onClear?: () => void;
  /** Additional recent-colors strip appended above the default palette. */
  recents?: string[];
  'data-testid'?: string;
}

export function ColorPickerPopover({
  open,
  onOpenChange,
  trigger,
  value,
  alpha = 100,
  onChange,
  onClear,
  recents,
  ...rest
}: ColorPickerPopoverProps) {
  const [localAlpha, setLocalAlpha] = useState(alpha);

  useEffect(() => {
    setLocalAlpha(alpha);
  }, [alpha]);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-[228px] p-3"
        data-testid={rest['data-testid']}
      >
        <FormatColorPicker
          value={value || '#000000'}
          onChange={(hex) => {
            if (!hex) onClear?.();
            else onChange(hex, localAlpha);
          }}
          allowClear={Boolean(onClear)}
          svHeight={100}
        />

        {/* Alpha slider */}
        <div style={{ marginTop: 10 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 4,
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--bn-t2, #7a8494)',
              }}
            >
              Alpha
            </span>
            <span
              style={{
                fontSize: 11,
                fontFamily: 'var(--gc-font-mono, ui-monospace, SFMono-Regular, monospace)',
                color: 'var(--bn-t1, #9a9a9a)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {localAlpha}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={localAlpha}
            onChange={(e) => {
              const next = Number(e.target.value);
              setLocalAlpha(next);
              if (value) onChange(value, next);
            }}
            style={{
              width: '100%',
              accentColor: 'var(--bn-green, #2dd4bf)',
              cursor: 'pointer',
            }}
          />
        </div>

        {/* Optional recents strip */}
        {recents && recents.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--bn-t2, #7a8494)',
                marginBottom: 4,
              }}
            >
              From this panel
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {recents.slice(0, 10).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => onChange(c, localAlpha)}
                  title={c}
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 4,
                    padding: 0,
                    cursor: 'pointer',
                    border:
                      value?.toLowerCase() === c.toLowerCase()
                        ? '2px solid var(--bn-green, #2dd4bf)'
                        : '1px solid var(--bn-border-soft, rgba(255,255,255,0.08))',
                    background: c,
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
