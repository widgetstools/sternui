import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Self-contained HSV color picker matching the border-editor-v4 reference.
 *
 * Layout:
 *   ┌──────────────────────┐
 *   │    SV pad (100px)    │  ← drag crosshair
 *   ├──────────────────────┤
 *   │    Hue strip (12px)  │  ← drag thumb
 *   ├──────────────────────┤
 *   │ ⬛⬛⬛⬛⬛⬛⬛⬛  │  ← 16 preset swatches (8×2)
 *   ├──────────────────────┤
 *   │ [■] #hex input       │
 *   └──────────────────────┘
 *
 * No alpha slider — matches the reference design. Mouse + touch drag via
 * window event listeners (same approach as the reference).
 */

const PRESETS = [
  '#0f172a', '#1e293b', '#334155', '#475569',
  '#0d9488', '#0ea5e9', '#6366f1', '#a855f7',
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#94a3b8', '#cbd5e1', '#e2e8f0', '#ffffff',
];

function hexToHsv(hex: string): { h: number; s: number; v: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h, s: max ? d / max : 0, v: max };
}

function hsvToHex(h: number, s: number, v: number): string {
  const c = v * s,
    x = c * (1 - Math.abs(((h / 60) % 2) - 1)),
    m = v - c;
  let rr = 0, gg = 0, bb = 0;
  if (h < 60) { rr = c; gg = x; }
  else if (h < 120) { rr = x; gg = c; }
  else if (h < 180) { gg = c; bb = x; }
  else if (h < 240) { gg = x; bb = c; }
  else if (h < 300) { rr = x; bb = c; }
  else { rr = c; bb = x; }
  const toH = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
  return `#${toH(rr)}${toH(gg)}${toH(bb)}`;
}

export function FormatColorPicker({
  value,
  onChange,
  svHeight = 100,
}: {
  value: string;
  onChange: (hex: string) => void;
  /** Height of the SV pad in px. Default 100 (matching the reference). */
  svHeight?: number;
}) {
  const hsv = hexToHsv(value);
  const [h, setH] = useState(hsv.h);
  const [s, setS] = useState(hsv.s);
  const [v, setV] = useState(hsv.v);
  const [hex, setHex] = useState(value);
  const padRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<'pad' | 'hue' | null>(null);

  useEffect(() => {
    const next = hexToHsv(value);
    setH(next.h);
    setS(next.s);
    setV(next.v);
    setHex(value);
  }, [value]);

  const emit = (hh: number, ss: number, vv: number) => {
    const c = hsvToHex(hh, ss, vv);
    setHex(c);
    onChange(c);
  };

  const handlePad = useCallback(
    (e: MouseEvent | React.MouseEvent) => {
      const rect = padRef.current!.getBoundingClientRect();
      const ns = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const nv = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));
      setS(ns);
      setV(nv);
      emit(h, ns, nv);
    },
    [h], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const handleHue = useCallback(
    (e: MouseEvent | React.MouseEvent) => {
      const rect = hueRef.current!.getBoundingClientRect();
      const nh = Math.max(0, Math.min(360, ((e.clientX - rect.left) / rect.width) * 360));
      setH(nh);
      emit(nh, s, v);
    },
    [s, v], // eslint-disable-line react-hooks/exhaustive-deps
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

  const handleHexInput = (val: string) => {
    setHex(val);
    if (/^#[0-9a-fA-F]{6}$/.test(val)) {
      const next = hexToHsv(val);
      setH(next.h);
      setS(next.s);
      setV(next.v);
      onChange(val);
    }
  };

  return (
    <div onClick={(e) => e.stopPropagation()}>
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
          borderRadius: 'var(--gc-radius-xl, 6px)',
          cursor: 'crosshair',
          position: 'relative',
          overflow: 'hidden',
          marginBottom: 8,
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
          height: 12,
          borderRadius: 6,
          cursor: 'pointer',
          position: 'relative',
          marginBottom: 8,
          background:
            'linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: `${(h / 360) * 100}%`,
            top: '50%',
            width: 14,
            height: 14,
            borderRadius: '50%',
            border: '2px solid #fff',
            boxShadow: '0 0 0 1px rgba(0,0,0,0.2), 0 1px 4px rgba(0,0,0,0.3)',
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
            background: `hsl(${h}, 100%, 50%)`,
          }}
        />
      </div>

      {/* Preset swatches */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(8, 1fr)',
          gap: 4,
          marginBottom: 8,
        }}
      >
        {PRESETS.map((c) => (
          <button
            key={c}
            onClick={() => {
              onChange(c);
              const next = hexToHsv(c);
              setH(next.h);
              setS(next.s);
              setV(next.v);
              setHex(c);
            }}
            style={{
              width: '100%',
              aspectRatio: '1',
              borderRadius: 'var(--gc-radius-sm, 4px)',
              padding: 0,
              cursor: 'pointer',
              border:
                value.toLowerCase() === c.toLowerCase()
                  ? '2px solid var(--gc-positive, #2dd4bf)'
                  : '1px solid var(--gc-border)',
              background: c,
              boxShadow:
                value.toLowerCase() === c.toLowerCase()
                  ? '0 0 0 2px rgba(45,212,191,0.20)'
                  : c === '#ffffff' || c === '#e2e8f0'
                    ? 'inset 0 0 0 1px rgba(0,0,0,0.08)'
                    : 'none',
            }}
          />
        ))}
      </div>

      {/* Hex input */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <div
          style={{
            width: 26,
            height: 22,
            borderRadius: 'var(--gc-radius-sm, 4px)',
            background: value,
            border: '1px solid rgba(255,255,255,0.12)',
            flexShrink: 0,
          }}
        />
        <input
          type="text"
          value={hex}
          onChange={(e) => handleHexInput(e.target.value)}
          style={{
            flex: 1,
            height: 24,
            border: '1px solid var(--gc-border)',
            borderRadius: 'var(--gc-radius, 5px)',
            background: 'var(--gc-bg)',
            color: 'var(--gc-text)',
            fontSize: 11,
            fontWeight: 500,
            fontFamily: 'var(--gc-font-mono)',
            padding: '0 8px',
            outline: 'none',
          }}
        />
      </div>
    </div>
  );
}

// Re-export the color conversion utilities so consumers (like the border
// editor) can do their own conversions if they need to.
export { hexToHsv, hsvToHex };
