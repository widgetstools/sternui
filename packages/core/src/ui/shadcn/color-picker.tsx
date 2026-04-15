import { useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { X, Check, Pipette } from 'lucide-react';
import { cn } from './utils';

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
        outline: selected ? '2px solid var(--primary)' : 'none',
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

export function ColorPicker({ value, onChange, allowClear = true }: ColorPickerProps) {
  const [draft, setDraft] = useState(value || '');
  const [hexInput, setHexInput] = useState(value || '');
  const [recentColors, setRecentColors] = useState<string[]>(getRecentColors);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(value || '');
    setHexInput(value || '');
  }, [value]);

  const selectColor = useCallback((c: string) => {
    setDraft(c);
    setHexInput(c);
  }, []);

  const confirm = useCallback(() => {
    if (draft) {
      addRecentColor(draft);
      setRecentColors(getRecentColors());
    }
    onChange(draft || undefined);
  }, [draft, onChange]);

  const clear = useCallback(() => {
    setDraft('');
    setHexInput('');
    onChange(undefined);
  }, [onChange]);

  const commitHex = useCallback(() => {
    const hex = hexInput.trim();
    if (/^#?[0-9a-fA-F]{3,8}$/.test(hex)) {
      const normalized = hex.startsWith('#') ? hex : `#${hex}`;
      selectColor(normalized);
    }
  }, [hexInput, selectColor]);

  const gridStyle = { display: 'flex', gap: SWATCH_GAP, marginBottom: SWATCH_GAP };

  return (
    <div style={{ padding: 8 }} onMouseDown={(e) => {
      if ((e.target as HTMLElement).tagName !== 'INPUT') e.preventDefault();
    }}>
      {/* ── Grayscale row ── */}
      <div style={gridStyle}>
        {GRAYSCALE.map((c) => (
          <Swatch key={c} color={c} selected={draft === c} onClick={() => selectColor(c)} />
        ))}
      </div>

      {/* ── Hue grid ── */}
      {HUE_GRID.map((row, ri) => (
        <div key={ri} style={gridStyle}>
          {row.map((c) => (
            <Swatch key={c} color={c} selected={draft === c} onClick={() => selectColor(c)} />
          ))}
        </div>
      ))}

      {/* ── Recent colors ── */}
      {recentColors.length > 0 && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' as const, color: 'var(--muted-foreground)', marginBottom: 4 }}>
            Recent
          </div>
          <div style={{ display: 'flex', gap: SWATCH_GAP }}>
            {recentColors.map((c) => (
              <Swatch key={c} color={c} selected={draft === c} onClick={() => selectColor(c)} />
            ))}
          </div>
        </div>
      )}

      {/* ── Bottom bar: pipette + hex input + clear + confirm ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
        {/* Pipette / native color picker */}
        <label
          style={{
            width: 20, height: 20, borderRadius: SWATCH_RADIUS,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', position: 'relative', overflow: 'hidden',
            background: draft || 'var(--accent)',
            border: '1px solid var(--border)',
          }}
          title="Pick custom color"
        >
          <Pipette size={10} strokeWidth={1.5} style={{ color: 'var(--foreground)', opacity: 0.7 }} />
          <input
            type="color"
            value={draft || '#000000'}
            onChange={(e) => selectColor(e.target.value)}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
          />
        </label>

        {/* Hex input */}
        <input
          ref={inputRef}
          type="text"
          value={hexInput}
          onChange={(e) => setHexInput(e.target.value)}
          onBlur={commitHex}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { commitHex(); confirm(); }
          }}
          placeholder="#000000"
          style={{
            flex: 1, height: 20, padding: '0 8px',
            borderRadius: SWATCH_RADIUS,
            fontSize: 9, fontFamily: "var(--fi-mono, 'JetBrains Mono', monospace)",
            background: 'var(--background)', color: 'var(--foreground)',
            border: '1px solid var(--border)', outline: 'none',
            minWidth: 0,
          }}
        />

        {/* Clear (×) */}
        {allowClear && (
          <button
            onClick={clear}
            onMouseDown={(e) => e.preventDefault()}
            title="No color"
            style={{
              width: 20, height: 20, borderRadius: SWATCH_RADIUS,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', transition: 'all 150ms',
              background: 'var(--accent)',
              border: '1px solid var(--border)',
              color: 'var(--foreground)',
            }}
          >
            <X size={10} strokeWidth={2} />
          </button>
        )}

        {/* Confirm (✓) */}
        <button
          onClick={confirm}
          onMouseDown={(e) => e.preventDefault()}
          title="Apply color"
          style={{
            width: 20, height: 20, borderRadius: SWATCH_RADIUS,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', transition: 'all 150ms',
            background: draft ? 'var(--foreground)' : 'var(--accent)',
            color: draft ? 'var(--background)' : 'var(--muted-foreground)',
            border: '1px solid var(--border)',
          }}
        >
          <Check size={10} strokeWidth={2.5} />
        </button>
      </div>
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
}

export function ColorPickerPopover({ value, onChange, icon, disabled, allowClear = true, compact }: ColorPickerPopoverProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT') return;
      if (ref.current && !ref.current.contains(target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleChange = useCallback((c: string | undefined) => {
    onChange(c);
    setOpen(false);
  }, [onChange]);

  return (
    <div ref={ref} className="relative inline-flex">
      <div
        className="cursor-pointer"
        onMouseDown={(e) => {
          const tag = (e.target as HTMLElement).tagName;
          if (tag !== 'INPUT') e.preventDefault();
        }}
        onClick={() => setOpen(!open)}
      >
        <button
          disabled={disabled}
          className={cn(
            'shrink-0 rounded-[4px] gc-tbtn transition-all duration-150 inline-flex items-center justify-center w-7 h-7',
            disabled && 'opacity-25 pointer-events-none',
          )}
        >
          <span className="flex flex-col items-center gap-[1px]">
            {icon}
            <span
              className="w-3.5 h-[2px] rounded-full transition-colors"
              style={{ background: value || 'var(--muted-foreground)' }}
            />
          </span>
        </button>
      </div>
      {open && (
        <div
          className="absolute z-50 top-full mt-1 left-0"
          style={{
            borderRadius: 6,
            border: '1px solid var(--border)',
            background: 'var(--card)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
          }}
        >
          <ColorPicker
            value={value}
            onChange={handleChange}
            allowClear={allowClear}
          />
        </div>
      )}
    </div>
  );
}
