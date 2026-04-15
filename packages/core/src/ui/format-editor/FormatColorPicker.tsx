import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Self-contained HSV color picker — saturation/value square, hue slider,
 * alpha slider, hex entry, preset palette.
 *
 * Drag interactions use pointer events so mouse + touch + pen work with one
 * handler. No external dependencies. Internal HSV↔RGB↔hex conversions only.
 */

const PRESETS = [
  '#000000', '#FFFFFF', '#F87171', '#FB923C', '#FBBF24', '#A3E635',
  '#34D399', '#14B8A6', '#60A5FA', '#818CF8', '#C084FC', '#F472B6',
];

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.replace(/^#/, '');
  if (clean.length !== 6 && clean.length !== 3) return null;
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const n = parseInt(full, 16);
  if (isNaN(n)) return null;
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}
function rgbToHex(r: number, g: number, b: number): string {
  const to2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return ('#' + to2(r) + to2(g) + to2(b)).toUpperCase();
}
function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  const s = max === 0 ? 0 : d / max;
  return { h, s, v: max };
}
function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let rr = 0, gg = 0, bb = 0;
  if (h < 60) { rr = c; gg = x; bb = 0; }
  else if (h < 120) { rr = x; gg = c; bb = 0; }
  else if (h < 180) { rr = 0; gg = c; bb = x; }
  else if (h < 240) { rr = 0; gg = x; bb = c; }
  else if (h < 300) { rr = x; gg = 0; bb = c; }
  else { rr = c; gg = 0; bb = x; }
  return { r: (rr + m) * 255, g: (gg + m) * 255, b: (bb + m) * 255 };
}

export function FormatColorPicker({
  value,
  alpha,
  onChange,
  onAlpha,
  svHeight = 180,
}: {
  value: string;
  alpha: number;
  onChange: (hex: string) => void;
  onAlpha: (a: number) => void;
  /** Height of the saturation/value square in px. */
  svHeight?: number;
}) {
  const rgb = hexToRgb(value) ?? { r: 0, g: 0, b: 0 };
  const hsv = useMemo(() => rgbToHsv(rgb.r, rgb.g, rgb.b), [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const svRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);
  const alphaRef = useRef<HTMLDivElement>(null);

  const commit = useCallback(
    (h: number, s: number, v: number) => {
      const { r, g, b } = hsvToRgb(h, s, v);
      onChange(rgbToHex(r, g, b));
    },
    [onChange],
  );

  const makeDrag = useCallback(
    (ref: React.RefObject<HTMLDivElement | null>, onMove: (x: number, y: number) => void) =>
      (e: React.PointerEvent) => {
        const el = ref.current;
        if (!el) return;
        el.setPointerCapture(e.pointerId);
        const rect = el.getBoundingClientRect();
        const handle = (ev: PointerEvent) => {
          const x = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
          const y = Math.max(0, Math.min(1, (ev.clientY - rect.top) / rect.height));
          onMove(x, y);
        };
        handle(e.nativeEvent);
        const up = () => {
          window.removeEventListener('pointermove', handle);
          window.removeEventListener('pointerup', up);
        };
        window.addEventListener('pointermove', handle);
        window.addEventListener('pointerup', up);
      },
    [],
  );

  const onSvDown = makeDrag(svRef, (x, y) => commit(hsv.h, x, 1 - y));
  const onHueDown = makeDrag(hueRef, (x) => commit(x * 360, hsv.s, hsv.v));
  const onAlphaDown = makeDrag(alphaRef, (x) => onAlpha(Math.round(x * 100)));

  const hueColor = `hsl(${hsv.h}, 100%, 50%)`;
  const hexDisplay = value.replace(/^#/, '').toUpperCase();
  const [hexInput, setHexInput] = useState(hexDisplay);
  useEffect(() => {
    setHexInput(hexDisplay);
  }, [hexDisplay]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* SV square */}
      <div
        ref={svRef}
        onPointerDown={onSvDown}
        style={{
          position: 'relative',
          width: '100%',
          height: svHeight,
          borderRadius: 'var(--gc-radius-sm, 4px)',
          background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hueColor})`,
          cursor: 'crosshair',
          touchAction: 'none',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: `calc(${hsv.s * 100}% - 7px)`,
            top: `calc(${(1 - hsv.v) * 100}% - 7px)`,
            width: 14,
            height: 14,
            borderRadius: '50%',
            border: '2px solid #fff',
            boxShadow: '0 0 0 1px rgba(0,0,0,0.3), 0 1px 3px rgba(0,0,0,0.4)',
            pointerEvents: 'none',
          }}
        />
      </div>

      {/* Hue + alpha */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div
            ref={hueRef}
            onPointerDown={onHueDown}
            style={{
              position: 'relative',
              height: 10,
              borderRadius: 5,
              background:
                'linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)',
              cursor: 'pointer',
              touchAction: 'none',
            }}
          >
            <div
              style={{
                position: 'absolute',
                left: `calc(${(hsv.h / 360) * 100}% - 6px)`,
                top: -2,
                width: 14,
                height: 14,
                borderRadius: '50%',
                background: hueColor,
                border: '2px solid #fff',
                boxShadow: '0 0 0 1px rgba(0,0,0,0.3), 0 1px 3px rgba(0,0,0,0.4)',
                pointerEvents: 'none',
              }}
            />
          </div>
          <div
            ref={alphaRef}
            onPointerDown={onAlphaDown}
            style={{
              position: 'relative',
              height: 10,
              borderRadius: 5,
              background: `linear-gradient(to right, transparent, ${value}), repeating-conic-gradient(#555 0 90deg, #333 90deg 180deg) 0 0 / 8px 8px`,
              cursor: 'pointer',
              touchAction: 'none',
            }}
          >
            <div
              style={{
                position: 'absolute',
                left: `calc(${alpha}% - 6px)`,
                top: -2,
                width: 14,
                height: 14,
                borderRadius: '50%',
                background: value,
                border: '2px solid #fff',
                boxShadow: '0 0 0 1px rgba(0,0,0,0.3), 0 1px 3px rgba(0,0,0,0.4)',
                pointerEvents: 'none',
              }}
            />
          </div>
        </div>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 'var(--gc-radius-sm, 4px)',
            background: value,
            border: '1px solid var(--gc-border)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
          }}
        />
      </div>

      {/* Hex + alpha readout */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            background: 'var(--gc-surface-active)',
            borderRadius: 'var(--gc-radius-sm, 4px)',
            padding: '0 8px',
            height: 26,
            flex: 1,
          }}
        >
          <span style={{ color: 'var(--gc-text-dim)', fontFamily: 'var(--gc-font-mono)', fontSize: 10 }}>#</span>
          <input
            value={hexInput}
            onChange={(e) => setHexInput(e.target.value.toUpperCase().slice(0, 6))}
            onBlur={() => {
              if (hexInput.length === 6 && /^[0-9A-F]+$/.test(hexInput)) onChange('#' + hexInput);
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
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            background: 'var(--gc-surface-active)',
            borderRadius: 'var(--gc-radius-sm, 4px)',
            padding: '0 8px',
            height: 26,
            width: 64,
          }}
        >
          <input
            type="number"
            min={0}
            max={100}
            value={alpha}
            onChange={(e) => onAlpha(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
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
              textAlign: 'right',
            }}
          />
          <span style={{ color: 'var(--gc-text-dim)', fontSize: 10 }}>%</span>
        </div>
      </div>

      {/* Preset palette */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ color: 'var(--gc-text-muted)', fontSize: 10, letterSpacing: '0.02em' }}>Presets</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 4 }}>
          {PRESETS.map((p) => {
            const selected = p.toUpperCase() === value.toUpperCase();
            return (
              <button
                key={p}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onChange(p)}
                title={p}
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 3,
                  background: p,
                  border: selected ? '2px solid var(--gc-positive)' : '1px solid var(--gc-border)',
                  padding: 0,
                  cursor: 'pointer',
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
