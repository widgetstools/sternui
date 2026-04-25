import { useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { X, Check, Pipette } from 'lucide-react';
import { cn } from './utils';
import { FormatColorPicker } from '../format-editor/FormatColorPicker';
import { FormatPopover } from '../format-editor/FormatPopover';

// ─── Color Palette ──────────────────────────────────────────────────────────

const GRAYSCALE = [
  '#ffffff', '#e5e5e5', '#c4c4c4', '#a0a0a0', '#7a7a7a',
  '#545454', '#333333', '#1f1f1f', '#141414', '#000000',
];

const HUE_GRID = [
  // Row 0: vivid saturated
  ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#a855f7', '#ec4899'],
  // Row 1: medium-dark
  ['#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0d9488', '#0891b2', '#2563eb', '#4f46e5', '#9333ea', '#db2777'],
  // Row 2: light tints
  ['#fca5a5', '#fdba74', '#fde047', '#86efac', '#5eead4', '#67e8f9', '#93c5fd', '#a5b4fc', '#d8b4fe', '#f9a8d4'],
  // Row 3: pastel
  ['#fecaca', '#fed7aa', '#fef08a', '#bbf7d0', '#99f6e4', '#a5f3fc', '#bfdbfe', '#c7d2fe', '#e9d5ff', '#fbcfe8'],
  // Row 4: very light
  ['#fee2e2', '#ffedd5', '#fef9c3', '#dcfce7', '#ccfbf1', '#cffafe', '#dbeafe', '#e0e7ff', '#f3e8ff', '#fce7f3'],
];

const LS_KEY = 'gc-recent-colors';
const MAX_RECENT = 10;

function getRecentColors(): string[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]').slice(0, MAX_RECENT); }
  catch { return []; }
}

function addRecentColor(color: string): void {
  try {
    const recent = getRecentColors().filter(c => c.toLowerCase() !== color.toLowerCase());
    recent.unshift(color);
    localStorage.setItem(LS_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)));
  } catch { /* */ }
}

// ─── Swatch ─────────────────────────────────────────────────────────────────

const SWATCH_SIZE = 20;   // spacing[5]
const SWATCH_GAP = 2;     // spacing[0.5]
const SWATCH_RADIUS = 3;  // radius.md

function Swatch({ color, selected, onClick }: {
  color: string; selected: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      onMouseDown={(e) => e.preventDefault()}
      title={color}
      className="cursor-pointer transition-all duration-100 shrink-0"
      style={{
        width: SWATCH_SIZE, height: SWATCH_SIZE,
        borderRadius: SWATCH_RADIUS,
        background: color,
        outline: selected ? '2px solid var(--bn-blue)' : 'none',
        outlineOffset: selected ? 1 : 0,
        transform: selected ? 'scale(1.08)' : undefined,
        zIndex: selected ? 10 : undefined,
        position: selected ? 'relative' as const : undefined,
      }}
    />
  );
}

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
export function ColorPickerPopover({ value, onChange, icon, disabled, allowClear = true, title = 'Pick a color' }: ColorPickerPopoverProps) {
  return (
    <FormatPopover
      trigger={
        <button
          disabled={disabled}
          title={title}
          aria-label={title}
          className={cn(
            'shrink-0 rounded-[4px] gc-tbtn transition-all duration-150 inline-flex items-center justify-center w-7 h-7',
            disabled && 'opacity-25 pointer-events-none',
          )}
        >
          <span className="flex flex-col items-center gap-[1px]">
            {icon}
            <span
              className="w-3.5 h-[2px] rounded-full transition-colors"
              style={{ background: value || 'var(--bn-t2)' }}
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
