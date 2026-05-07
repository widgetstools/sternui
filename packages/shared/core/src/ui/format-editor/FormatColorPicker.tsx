import { useCallback, useEffect, useRef, useState } from 'react';
import { Pipette, X } from 'lucide-react';

/**
 * Unified color picker used across the entire app.
 *
 * Layout (~240px wide, ~250px tall):
 *   ┌─────────────────────────┐
 *   │     SV pad (90px)       │  drag crosshair
 *   ├─────────────────────────┤
 *   │   Hue strip (10px)     │  drag thumb
 *   ├─────────────────────────┤
 *   │ ⬛⬛⬛⬛⬛⬛⬛⬛ (×2)  │  16 preset swatches
 *   ├─────────────────────────┤
 *   │ Recent: ⬛⬛⬛⬛⬛…    │  last 10 (localStorage)
 *   ├─────────────────────────┤
 *   │ [🎨][■] #hex     [×]   │  pipette + chip + hex + clear
 *   └─────────────────────────┘
 *
 * Commits immediately on every interaction (no confirm button).
 * Used by: PropColor, ColorPickerPopover, FormatSwatch, BorderSidesEditor.
 */

// ─── Presets ─────────────────────────────────────────────────────────────────

const PRESETS = [
  '#0f172a', '#1e293b', '#334155', '#475569',
  '#0d9488', '#0ea5e9', '#6366f1', '#a855f7',
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#94a3b8', '#cbd5e1', '#e2e8f0', '#ffffff',
];

// ─── Recent colors (localStorage) ────────────────────────────────────────────

const LS_KEY = 'gc-recent-colors';
const MAX_RECENT = 10;

function getRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '[]').slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

function addRecent(color: string): void {
  try {
    const list = getRecent().filter((c) => c.toLowerCase() !== color.toLowerCase());
    list.unshift(color);
    localStorage.setItem(LS_KEY, JSON.stringify(list.slice(0, MAX_RECENT)));
  } catch {
    /* noop */
  }
}

// ─── HSV math ────────────────────────────────────────────────────────────────

export function hexToHsv(hex: string): { h: number; s: number; v: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h, s: max ? d / max : 0, v: max };
}

export function hsvToHex(h: number, s: number, v: number): string {
  const c = v * s,
    x = c * (1 - Math.abs(((h / 60) % 2) - 1)),
    m = v - c;
  let rr = 0,
    gg = 0,
    bb = 0;
  if (h < 60) { rr = c; gg = x; }
  else if (h < 120) { rr = x; gg = c; }
  else if (h < 180) { gg = c; bb = x; }
  else if (h < 240) { gg = x; bb = c; }
  else if (h < 300) { rr = x; bb = c; }
  else { rr = c; bb = x; }
  const toH = (n: number) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toH(rr)}${toH(gg)}${toH(bb)}`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export interface FormatColorPickerProps {
  value: string;
  onChange: (hex: string) => void;
  /** Show a "clear" (×) button that calls onChange with empty string. */
  allowClear?: boolean;
  /** Height of the SV pad. Default 90. */
  svHeight?: number;
}

export function FormatColorPicker({
  value,
  onChange,
  allowClear = false,
  svHeight = 90,
}: FormatColorPickerProps) {
  const hsv = hexToHsv(value || '#000000');
  const [h, setH] = useState(hsv.h);
  const [s, setS] = useState(hsv.s);
  const [v, setV] = useState(hsv.v);
  const [hex, setHex] = useState(value || '#000000');
  const [recent, setRecent] = useState<string[]>(getRecent);
  const padRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<'pad' | 'hue' | null>(null);

  useEffect(() => {
    const val = value || '#000000';
    const next = hexToHsv(val);
    setH(next.h);
    setS(next.s);
    setV(next.v);
    setHex(val);
  }, [value]);

  const emit = useCallback(
    (hh: number, ss: number, vv: number) => {
      const c = hsvToHex(hh, ss, vv);
      setHex(c);
      addRecent(c);
      setRecent(getRecent());
      onChange(c);
    },
    [onChange],
  );

  const handlePad = useCallback(
    (e: MouseEvent | React.MouseEvent) => {
      const rect = padRef.current!.getBoundingClientRect();
      const ns = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const nv = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));
      setS(ns);
      setV(nv);
      emit(h, ns, nv);
    },
    [h, emit],
  );

  const handleHue = useCallback(
    (e: MouseEvent | React.MouseEvent) => {
      const rect = hueRef.current!.getBoundingClientRect();
      const nh = Math.max(0, Math.min(360, ((e.clientX - rect.left) / rect.width) * 360));
      setH(nh);
      emit(nh, s, v);
    },
    [s, v, emit],
  );

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      e.preventDefault();
      if (dragging.current === 'pad') handlePad(e);
      else if (dragging.current === 'hue') handleHue(e);
    };
    const onUp = () => {
      dragging.current = null;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [handlePad, handleHue]);

  const selectPreset = (c: string) => {
    const next = hexToHsv(c);
    setH(next.h);
    setS(next.s);
    setV(next.v);
    setHex(c);
    addRecent(c);
    setRecent(getRecent());
    onChange(c);
  };

  const handleHexInput = (val: string) => {
    setHex(val);
    if (/^#[0-9a-fA-F]{6}$/.test(val)) {
      const next = hexToHsv(val);
      setH(next.h);
      setS(next.s);
      setV(next.v);
      addRecent(val);
      setRecent(getRecent());
      onChange(val);
    }
  };

  const swatchStyle = (c: string, selected: boolean): React.CSSProperties => ({
    width: '100%',
    aspectRatio: '1',
    borderRadius: 4,
    padding: 0,
    cursor: 'pointer',
    border: selected ? '2px solid var(--gc-positive, #2dd4bf)' : '1px solid var(--gc-border, rgba(255,255,255,0.08))',
    background: c,
    boxShadow: selected
      ? '0 0 0 2px rgba(45,212,191,0.20)'
      : c === '#ffffff' || c === '#e2e8f0'
        ? 'inset 0 0 0 1px rgba(0,0,0,0.08)'
        : 'none',
  });

  return (
    <div onClick={(e) => e.stopPropagation()} style={{ width: '100%' }}>
      {/* SV Pad */}
      <div
        ref={padRef}
        onMouseDown={(e) => {
          dragging.current = 'pad';
          handlePad(e);
        }}
        style={{
          width: '100%',
          height: svHeight,
          borderRadius: 6,
          cursor: 'crosshair',
          position: 'relative',
          overflow: 'hidden',
          marginBottom: 6,
          background: `hsl(${h}, 100%, 50%)`,
        }}
      >
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, #fff, transparent)' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, #000, transparent)' }} />
        <div
          style={{
            position: 'absolute',
            left: `${s * 100}%`,
            top: `${(1 - v) * 100}%`,
            width: 12,
            height: 12,
            borderRadius: '50%',
            border: '2px solid #fff',
            boxShadow: '0 0 0 1px rgba(0,0,0,0.3), 0 2px 6px rgba(0,0,0,0.3)',
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
          }}
        />
      </div>

      {/* Hue strip */}
      <div
        ref={hueRef}
        onMouseDown={(e) => {
          dragging.current = 'hue';
          handleHue(e);
        }}
        style={{
          width: '100%',
          height: 10,
          borderRadius: 5,
          cursor: 'pointer',
          position: 'relative',
          marginBottom: 8,
          background: 'linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: `${(h / 360) * 100}%`,
            top: '50%',
            width: 12,
            height: 12,
            borderRadius: '50%',
            border: '2px solid #fff',
            boxShadow: '0 0 0 1px rgba(0,0,0,0.2), 0 1px 4px rgba(0,0,0,0.3)',
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
            background: `hsl(${h}, 100%, 50%)`,
          }}
        />
      </div>

      {/* Preset swatches (8×2) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 3, marginBottom: 6 }}>
        {PRESETS.map((c) => (
          <button key={c} onClick={() => selectPreset(c)} onMouseDown={(e) => e.preventDefault()} style={swatchStyle(c, hex.toLowerCase() === c.toLowerCase())} />
        ))}
      </div>

      {/* Recent colors */}
      {recent.length > 0 && (
        <div style={{ marginBottom: 6 }}>
          <div
            style={{
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--gc-text-dim, #64748b)',
              marginBottom: 3,
            }}
          >
            Recent
          </div>
          <div style={{ display: 'flex', gap: 3 }}>
            {recent.slice(0, 8).map((c) => (
              <button
                key={c}
                onClick={() => selectPreset(c)}
                onMouseDown={(e) => e.preventDefault()}
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 4,
                  padding: 0,
                  cursor: 'pointer',
                  border: hex.toLowerCase() === c.toLowerCase() ? '2px solid var(--gc-positive, #2dd4bf)' : '1px solid var(--gc-border, rgba(255,255,255,0.08))',
                  background: c,
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Bottom bar: pipette + chip + hex input + clear */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        {/* Native color picker (pipette) */}
        <label
          style={{
            width: 24,
            height: 22,
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            position: 'relative',
            overflow: 'hidden',
            background: hex,
            border: '1px solid var(--gc-border, rgba(255,255,255,0.12))',
            flexShrink: 0,
          }}
          title="Pick any color"
        >
          <Pipette size={10} strokeWidth={1.5} style={{ color: '#fff', opacity: 0.8 }} />
          <input
            type="color"
            value={hex}
            onChange={(e) => selectPreset(e.target.value)}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
          />
        </label>

        {/* Hex input */}
        <input
          type="text"
          value={hex}
          onChange={(e) => handleHexInput(e.target.value)}
          style={{
            flex: 1,
            height: 22,
            border: '1px solid var(--gc-border, rgba(255,255,255,0.08))',
            borderRadius: 4,
            background: 'var(--gc-bg, #0c1018)',
            color: 'var(--gc-text, #e2e8f0)',
            fontSize: 11,
            fontWeight: 500,
            fontFamily: 'var(--gc-font-mono)',
            padding: '0 8px',
            outline: 'none',
            minWidth: 0,
          }}
        />

        {/* Clear */}
        {allowClear && (
          <button
            onClick={() => {
              setHex('');
              onChange('');
            }}
            onMouseDown={(e) => e.preventDefault()}
            title="Clear color"
            style={{
              width: 22,
              height: 22,
              borderRadius: 4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              background: 'rgba(248,113,113,0.08)',
              border: 'none',
              color: 'var(--gc-negative, #f87171)',
              flexShrink: 0,
            }}
          >
            <X size={10} strokeWidth={2} />
          </button>
        )}
      </div>
    </div>
  );
}
