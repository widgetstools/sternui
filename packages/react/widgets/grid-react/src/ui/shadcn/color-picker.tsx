import type { ReactNode } from 'react';
import { cn } from './utils';
import { FormatColorPicker } from '../format-editor/FormatColorPicker';
import { FormatPopover } from '../format-editor/FormatPopover';

// ─── ColorPicker ────────────────────────────────────────────────────────────

export interface ColorPickerProps {
  value?: string;
  onChange: (color: string | undefined) => void;
  allowClear?: boolean;
  compact?: boolean;
}

/**
 * Color picker — delegates to the unified FormatColorPicker primitive so
 * every color picker in the app uses the same component (SV pad + hue
 * slider + presets + recent colors + native pipette + hex input).
 */
export function ColorPicker({ value, onChange, allowClear = true }: ColorPickerProps) {
  return (
    <div style={{ padding: 8 }} onMouseDown={(e) => {
      if ((e.target as HTMLElement).tagName !== 'INPUT') e.preventDefault();
    }}>
      <FormatColorPicker
        value={value || '#000000'}
        onChange={(c) => onChange(c || undefined)}
        allowClear={allowClear}
      />
    </div>
  );
}

// ─── ColorPickerPopover ─────────────────────────────────────────────────────

export interface ColorPickerPopoverProps {
  value?: string;
  onChange: (color: string | undefined) => void;
  icon: ReactNode;
  disabled?: boolean;
  allowClear?: boolean;
  compact?: boolean;
  /** Native tooltip + a11y label for the trigger. Defaults to a
   *  generic "Pick a color" — callers should pass a specific label
   *  (e.g. "Text color", "Fill color") for disambiguation. */
  title?: string;
  /** Override the trigger's className. When provided, REPLACES the
   *  default `ds-tbtn` chrome so callers can opt into their own
   *  toolbar button styling (e.g. the formatter's `.fx-pill`). The
   *  size + disabled-opacity utilities are preserved either way. */
  triggerClassName?: string;
}

/**
 * ColorPickerPopover — toolbar icon button that opens the unified color
 * picker in a portal-based FormatPopover. Used by FormattingToolbar for
 * text color and background color buttons.
 *
 * The picker stays open while the user interacts (SV pad dragging, preset
 * clicks, hue slider, hex typing) — it only closes when the user clicks
 * outside every open popover.
 */
export function ColorPickerPopover({ value, onChange, icon, disabled, allowClear = true, title = 'Pick a color', triggerClassName }: ColorPickerPopoverProps) {
  return (
    <FormatPopover
      trigger={
        <button
          disabled={disabled}
          title={title}
          aria-label={title}
          className={cn(
            triggerClassName ?? 'shrink-0 rounded-[4px] ds-tbtn transition-all duration-150 inline-flex items-center justify-center w-7 h-7',
            disabled && 'opacity-25 pointer-events-none',
          )}
        >
          <span className="flex flex-col items-center gap-[1px]">
            {icon}
            <span
              className="w-3.5 h-[2px] rounded-full transition-colors"
              style={{ background: value || 'var(--ds-text-muted)' }}
            />
          </span>
        </button>
      }
      width={240}
    >
      <FormatColorPicker
        value={value || '#000000'}
        onChange={(c) => onChange(c || undefined)}
        allowClear={allowClear}
      />
    </FormatPopover>
  );
}
