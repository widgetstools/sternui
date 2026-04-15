/**
 * Format Editor Preview — Figma-inspired property panel proposal.
 *
 * Design direction (inspired by Figma's Design panel):
 *  - Dense, dark, pro-tool aesthetic; NOT a marketing UI.
 *  - Icon-first: every labeled field has a 10–12px stroke-1.5 icon.
 *  - Borderless fields; surface-color hover/focus instead of outlines.
 *  - 4px grid, 28px row height baseline.
 *  - Dropdowns portal-rendered so they escape any overflow-hidden ancestor.
 *  - Mono font for numeric values; sans for labels and options.
 *
 * Component library (proposed to promote into @grid-customizer/core):
 *   FormatPane         - outer scrollable container
 *   FormatSection      - collapsible titled section (Position, Layout, ...)
 *   FormatRow          - single labeled row; label left, value right
 *   FormatIconInput    - input with prefix icon + optional unit suffix
 *   FormatToggleGroup  - segmented icon buttons (align L/C/R, bold/italic/underline)
 *   FormatSwatch       - color swatch + hex entry + opacity + action icons
 *   FormatDropdown     - portal dropdown with checkmark-style selected state
 *   FormatPopover      - portal popover for composite editors
 *   BorderSidePicker   - Figma's All/Top/Bottom/Left/Right/Custom side dropdown
 *
 * This preview shows the same primitives in two presentations:
 *   1. SettingsPanel mode  (vertical, left side)   - ConditionalStylingPanel use case
 *   2. InlineToolbar mode  (horizontal, top strip) - FormattingToolbar use case
 * Both bind to the SAME state — editing one updates the other, proving the
 * primitives are shared.
 */

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PropsWithChildren,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import {
  AlignCenter, AlignLeft, AlignRight,
  Bold, Italic, Underline,
  ChevronDown, ChevronLeft, ChevronRight, Check,
  Eye, EyeOff, Minus, Plus,
  Square, PanelTop, PanelBottom, PanelLeft, PanelRight,
  Sliders, Type, PaintBucket, Grid3X3, Sun, Moon,
  CornerDownRight, Hash, CaseSensitive,
} from 'lucide-react';

// ─── Tokens ──────────────────────────────────────────────────────────────────

const T = {
  bg: '#0a0a0c',
  surface: '#141416',
  surfaceHover: '#1c1c20',
  surfaceActive: '#23232a',
  border: '#24242a',
  borderStrong: '#3a3a43',
  text: '#eaeaec',
  textMid: '#9a9aa0',
  textDim: '#5a5a62',
  accent: '#14b8a6',
  accentDim: 'rgba(20, 184, 166, 0.12)',
  accentRim: 'rgba(20, 184, 166, 0.35)',
  danger: '#ef4444',
  fontSans: '"Geist Sans", "Inter", -apple-system, sans-serif',
  fontMono: '"JetBrains Mono", "Geist Mono", ui-monospace, monospace',
  radius: 4,
  rowH: 28,
} as const;

// ─── Primitives ──────────────────────────────────────────────────────────────

function FormatPane({ children, style }: PropsWithChildren<{ style?: CSSProperties }>) {
  return (
    <div
      style={{
        width: 280,
        background: T.bg,
        color: T.text,
        fontFamily: T.fontSans,
        fontSize: 11,
        lineHeight: 1.4,
        borderLeft: `1px solid ${T.border}`,
        overflowY: 'auto',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function FormatSection({
  title,
  rightActions,
  defaultOpen = true,
  children,
}: PropsWithChildren<{ title: string; rightActions?: ReactNode; defaultOpen?: boolean }>) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderBottom: `1px solid ${T.border}` }}>
      <button
        onClick={() => setOpen((p) => !p)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          padding: '12px 12px 8px',
          background: 'transparent',
          border: 'none',
          color: T.text,
          cursor: 'pointer',
          fontFamily: T.fontSans,
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: '-0.01em',
          textAlign: 'left',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span
            style={{
              display: 'inline-flex',
              transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 140ms ease',
              color: T.textDim,
            }}
          >
            <ChevronRight size={10} strokeWidth={2} />
          </span>
          {title}
        </span>
        {rightActions && <span style={{ display: 'flex', gap: 2 }}>{rightActions}</span>}
      </button>
      {open && <div style={{ padding: '0 12px 12px' }}>{children}</div>}
    </div>
  );
}

function FormatRow({
  label,
  children,
  vertical,
}: PropsWithChildren<{ label?: string; vertical?: boolean }>) {
  if (vertical) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '4px 0' }}>
        {label && (
          <div style={{ color: T.textMid, fontSize: 10, letterSpacing: '0.02em' }}>{label}</div>
        )}
        {children}
      </div>
    );
  }
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        minHeight: T.rowH,
        padding: '2px 0',
      }}
    >
      {label && (
        <div
          style={{
            color: T.textMid,
            fontSize: 10,
            letterSpacing: '0.02em',
            flex: '0 0 64px',
          }}
        >
          {label}
        </div>
      )}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4 }}>{children}</div>
    </div>
  );
}

/** Dense numeric/text input with optional icon prefix and unit suffix. */
function FormatIconInput({
  icon,
  value,
  onChange,
  suffix,
  style,
  mono = true,
  align = 'left',
  width,
  placeholder,
}: {
  icon?: ReactNode;
  value: string | number;
  onChange?: (v: string) => void;
  suffix?: string;
  style?: CSSProperties;
  mono?: boolean;
  align?: 'left' | 'right';
  width?: number | string;
  placeholder?: string;
}) {
  const [focus, setFocus] = useState(false);
  return (
    <label
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        background: focus ? T.surfaceActive : T.surface,
        borderRadius: T.radius,
        padding: '0 8px',
        height: T.rowH,
        flex: width ? undefined : 1,
        width,
        transition: 'background 140ms ease',
        cursor: 'text',
        boxShadow: focus ? `inset 0 0 0 1px ${T.accentRim}` : 'none',
        ...style,
      }}
    >
      {icon && (
        <span style={{ color: T.textDim, display: 'flex', alignItems: 'center' }}>{icon}</span>
      )}
      <input
        value={String(value)}
        placeholder={placeholder}
        onChange={(e) => onChange?.(e.target.value)}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        style={{
          flex: 1,
          minWidth: 0,
          background: 'transparent',
          border: 'none',
          outline: 'none',
          color: T.text,
          fontFamily: mono ? T.fontMono : T.fontSans,
          fontSize: 11,
          textAlign: align,
          padding: 0,
        }}
      />
      {suffix && <span style={{ color: T.textDim, fontSize: 10 }}>{suffix}</span>}
    </label>
  );
}

/** Horizontal segmented toggle group. */
function FormatToggleGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; icon?: ReactNode; label?: string; tooltip?: string }>;
  value: T | null;
  onChange: (v: T | null) => void;
}) {
  return (
    <div
      style={{
        display: 'inline-flex',
        background: T.surface,
        borderRadius: T.radius,
        padding: 2,
        gap: 2,
      }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onChange(active ? null : o.value)}
            title={o.tooltip}
            style={{
              height: 22,
              minWidth: 22,
              padding: '0 6px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              background: active ? T.accentDim : 'transparent',
              color: active ? T.accent : T.text,
              border: 'none',
              borderRadius: 3,
              cursor: 'pointer',
              fontFamily: T.fontSans,
              fontSize: 10,
              fontWeight: 500,
              transition: 'background 140ms ease, color 140ms ease',
            }}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Color conversion utilities ──────────────────────────────────────────────

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

// ─── Color picker ────────────────────────────────────────────────────────────
//
// Self-contained HSV picker in the Figma style: saturation/value square,
// hue slider, alpha slider, hex entry, preset palette. All drag interactions
// use pointer events so touch + mouse + pen work with one handler. No
// external dependencies.

const PRESETS = [
  '#000000', '#FFFFFF', '#F87171', '#FB923C', '#FBBF24', '#A3E635',
  '#34D399', '#14B8A6', '#60A5FA', '#818CF8', '#C084FC', '#F472B6',
];

function FormatColorPicker({
  value,
  alpha,
  onChange,
  onAlpha,
}: {
  value: string;
  alpha: number;
  onChange: (hex: string) => void;
  onAlpha: (a: number) => void;
}) {
  const rgb = hexToRgb(value) ?? { r: 0, g: 0, b: 0 };
  const hsv = useMemo(() => rgbToHsv(rgb.r, rgb.g, rgb.b), [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const svRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);
  const alphaRef = useRef<HTMLDivElement>(null);

  const commit = useCallback((h: number, s: number, v: number) => {
    const { r, g, b } = hsvToRgb(h, s, v);
    onChange(rgbToHex(r, g, b));
  }, [onChange]);

  const makeDrag = useCallback(
    (ref: React.RefObject<HTMLDivElement | null>, onMove: (x: number, y: number, rect: DOMRect) => void) =>
      (e: React.PointerEvent) => {
        const el = ref.current;
        if (!el) return;
        el.setPointerCapture(e.pointerId);
        const rect = el.getBoundingClientRect();
        const handle = (ev: PointerEvent) => {
          const x = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
          const y = Math.max(0, Math.min(1, (ev.clientY - rect.top) / rect.height));
          onMove(x, y, rect);
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
  const svSize = 220;

  const hexDisplay = value.replace(/^#/, '').toUpperCase();
  const [hexInput, setHexInput] = useState(hexDisplay);
  useEffect(() => { setHexInput(hexDisplay); }, [hexDisplay]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: 240 }}>
      {/* SV square */}
      <div
        ref={svRef}
        onPointerDown={onSvDown}
        style={{
          position: 'relative',
          width: '100%',
          height: svSize,
          borderRadius: 4,
          background: `
            linear-gradient(to top, #000, transparent),
            linear-gradient(to right, #fff, ${hueColor})
          `,
          cursor: 'crosshair',
          touchAction: 'none',
        }}
      >
        {/* Thumb */}
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

      {/* Hue + alpha + eyedropper row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {/* Hue */}
          <div
            ref={hueRef}
            onPointerDown={onHueDown}
            style={{
              position: 'relative',
              height: 10,
              borderRadius: 5,
              background: 'linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)',
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
          {/* Alpha */}
          <div
            ref={alphaRef}
            onPointerDown={onAlphaDown}
            style={{
              position: 'relative',
              height: 10,
              borderRadius: 5,
              background: `
                linear-gradient(to right, transparent, ${value}),
                repeating-conic-gradient(#555 0 90deg, #333 90deg 180deg) 0 0 / 8px 8px
              `,
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
        {/* Current color preview chip */}
        <div
          style={{
            width: 28, height: 28, borderRadius: 4,
            background: `${value}`,
            border: `1px solid ${T.border}`,
            boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
          }}
        />
      </div>

      {/* Hex + RGB readout */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            background: T.surface, borderRadius: 4,
            padding: '0 8px', height: T.rowH, flex: 1,
          }}
        >
          <span style={{ color: T.textDim, fontFamily: T.fontMono, fontSize: 10 }}>#</span>
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
              flex: 1, minWidth: 0,
              background: 'transparent', border: 'none', outline: 'none',
              color: T.text, fontFamily: T.fontMono, fontSize: 11,
              padding: 0, textTransform: 'uppercase',
            }}
          />
        </div>
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            background: T.surface, borderRadius: 4,
            padding: '0 8px', height: T.rowH, width: 64,
          }}
        >
          <input
            type="number" min={0} max={100}
            value={alpha}
            onChange={(e) => onAlpha(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
            style={{
              flex: 1, minWidth: 0,
              background: 'transparent', border: 'none', outline: 'none',
              color: T.text, fontFamily: T.fontMono, fontSize: 11,
              padding: 0, textAlign: 'right',
            }}
          />
          <span style={{ color: T.textDim, fontSize: 10 }}>%</span>
        </div>
      </div>

      {/* Preset palette */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ color: T.textMid, fontSize: 10, letterSpacing: '0.02em' }}>Presets</div>
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
                  width: 16, height: 16, borderRadius: 3,
                  background: p,
                  border: selected ? `2px solid ${T.accent}` : `1px solid ${T.border}`,
                  padding: 0, cursor: 'pointer',
                  boxShadow: selected ? `0 0 0 1px ${T.bg}` : 'none',
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Swatch + hex + opacity + action icons (Figma's Fill/Stroke row).
 *  Clicking the color chip opens the portal-rendered FormatColorPicker. */
function FormatSwatch({
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
  const [hexInput, setHexInput] = useState(value.replace(/^#/, '').toUpperCase());
  useEffect(() => {
    setHexInput(value.replace(/^#/, '').toUpperCase());
  }, [value]);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        background: T.surface,
        borderRadius: T.radius,
        padding: '0 8px',
        height: T.rowH,
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
              border: `1px solid ${T.border}`,
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
          alpha={opacity}
          onChange={(hex) => onChange?.(hex)}
          onAlpha={(a) => onOpacity?.(a)}
        />
      </FormatPopover>
      <input
        value={hexInput}
        onChange={(e) => setHexInput(e.target.value.toUpperCase().slice(0, 6))}
        onBlur={() => {
          if (hexInput.length === 6 && /^[0-9A-F]+$/.test(hexInput)) onChange?.('#' + hexInput);
          else setHexInput(value.replace(/^#/, '').toUpperCase());
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
          color: T.text,
          fontFamily: T.fontMono,
          fontSize: 11,
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
          color: T.textMid,
          fontFamily: T.fontMono,
          fontSize: 10,
          padding: 0,
        }}
      />
      <span style={{ color: T.textDim, fontSize: 10 }}>%</span>
      <span style={{ width: 1, height: 14, background: T.border, marginInline: 2 }} />
      <button
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onVisibility?.(!visible)}
        style={iconBtnStyle}
        title={visible ? 'Hide' : 'Show'}
      >
        {visible ? <Eye size={12} strokeWidth={1.75} /> : <EyeOff size={12} strokeWidth={1.75} />}
      </button>
      <button
        onMouseDown={(e) => e.preventDefault()}
        onClick={onRemove}
        style={iconBtnStyle}
        title="Remove"
      >
        <Minus size={12} strokeWidth={1.75} />
      </button>
    </div>
  );
}

const iconBtnStyle: CSSProperties = {
  width: 18,
  height: 18,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'transparent',
  color: T.textMid,
  border: 'none',
  borderRadius: 2,
  cursor: 'pointer',
};

/** Portal dropdown — Figma-style with checkmark rail on the left. */
function FormatDropdown<V extends string | number>({
  trigger,
  options,
  value,
  onChange,
  footer,
}: {
  trigger: ReactElement<{ onClick?: (e: React.MouseEvent) => void }>;
  options: Array<{ value: V; label: string; icon?: ReactNode }>;
  value: V;
  onChange: (v: V) => void;
  footer?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPos({ top: rect.bottom + 4, left: rect.left });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || contentRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const clonedTrigger = React.cloneElement(
    trigger as ReactElement<Record<string, unknown>>,
    {
      ref: (el: HTMLElement | null) => { triggerRef.current = el; },
      onClick: (e: React.MouseEvent) => {
        trigger.props.onClick?.(e);
        setOpen((p) => !p);
      },
    } as Record<string, unknown>,
  );

  return (
    <>
      {clonedTrigger}
      {open && createPortal(
        <div
          ref={contentRef}
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            zIndex: 10100,
            background: '#18181b',
            border: `1px solid ${T.border}`,
            borderRadius: 6,
            padding: 4,
            minWidth: 180,
            boxShadow: '0 16px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.02) inset',
            fontFamily: T.fontSans,
            fontSize: 11,
            color: T.text,
          }}
        >
          {options.map((o) => {
            const selected = o.value === value;
            return (
              <button
                key={String(o.value)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onChange(o.value); setOpen(false); }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  padding: '6px 8px 6px 4px',
                  background: 'transparent',
                  color: T.text,
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontFamily: T.fontSans,
                  fontSize: 11,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = T.surfaceActive)}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <span style={{ width: 14, display: 'inline-flex', justifyContent: 'center', color: selected ? T.accent : 'transparent' }}>
                  <Check size={11} strokeWidth={2} />
                </span>
                {o.icon && (
                  <span style={{ color: selected ? T.accent : T.textMid, display: 'inline-flex' }}>
                    {o.icon}
                  </span>
                )}
                <span>{o.label}</span>
              </button>
            );
          })}
          {footer && (
            <>
              <div style={{ height: 1, background: T.border, margin: '4px 0' }} />
              {footer}
            </>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}

/** Portal popover — for composite editors that need their own floating panel. */
function FormatPopover({
  trigger,
  children,
  width = 240,
}: {
  trigger: ReactElement<{ onClick?: (e: React.MouseEvent) => void }>;
  children: ReactNode;
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPos({ top: rect.bottom + 4, left: rect.left });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || contentRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const clonedTrigger = React.cloneElement(
    trigger as ReactElement<Record<string, unknown>>,
    {
      ref: (el: HTMLElement | null) => { triggerRef.current = el; },
      onClick: (e: React.MouseEvent) => {
        trigger.props.onClick?.(e);
        setOpen((p) => !p);
      },
    } as Record<string, unknown>,
  );

  return (
    <>
      {clonedTrigger}
      {open && createPortal(
        <div
          ref={contentRef}
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            zIndex: 10100,
            background: '#18181b',
            border: `1px solid ${T.border}`,
            borderRadius: 6,
            padding: 10,
            width,
            boxShadow: '0 16px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.02) inset',
            fontFamily: T.fontSans,
            fontSize: 11,
            color: T.text,
          }}
        >
          {children}
        </div>,
        document.body,
      )}
    </>
  );
}

// ─── State shape for preview ─────────────────────────────────────────────────

type BorderSide = 'top' | 'right' | 'bottom' | 'left';
type BorderMode = 'all' | BorderSide | 'custom';
type BorderStyle = 'solid' | 'dashed' | 'dotted';

interface SideSpec {
  color: string;
  alpha: number;
  width: number;
  style: BorderStyle;
  visible: boolean;
}

interface Style {
  fontWeight: '400' | '500' | '600' | '700';
  italic: boolean;
  underline: boolean;
  fontSize: number;
  align: 'left' | 'center' | 'right';
  textColor: string;
  textAlpha: number;
  fillColor: string;
  fillAlpha: number;
  // Shared stroke values — used when borderMode is 'all' / 'top' / etc.
  strokeColor: string;
  strokeAlpha: number;
  strokeWidth: number;
  strokeStyle: BorderStyle;
  strokePosition: 'inside' | 'outside' | 'center';
  // Per-side overrides — used when borderMode is 'custom'.
  sides: Record<BorderSide, SideSpec>;
  borderMode: BorderMode;
  cornerRadius: number;
  opacity: number;
}

const defaultSide: SideSpec = {
  color: '#000000',
  alpha: 100,
  width: 1,
  style: 'solid',
  visible: true,
};

const initialStyle: Style = {
  fontWeight: '400',
  italic: false,
  underline: false,
  fontSize: 12,
  align: 'left',
  textColor: '#EAECEF',
  textAlpha: 100,
  fillColor: '#D9D9D9',
  fillAlpha: 100,
  strokeColor: '#000000',
  strokeAlpha: 100,
  strokeWidth: 1,
  strokeStyle: 'solid',
  strokePosition: 'inside',
  sides: {
    top: { ...defaultSide },
    right: { ...defaultSide },
    bottom: { ...defaultSide },
    left: { ...defaultSide },
  },
  borderMode: 'all',
  cornerRadius: 0,
  opacity: 100,
};

// ─── Compact per-side border editor ─────────────────────────────────────────
//
// Triggered from the BorderSidePicker's trigger button when mode === 'custom'.
// Design: tight popover (~200px wide) with a 4-edge visual box selector +
// a single editor row for whichever edge is currently selected. Click an
// edge on the box to pick which side you're editing. A small "All" button
// copies the current side's spec to every side.

const EDGE_ORDER: BorderSide[] = ['top', 'right', 'bottom', 'left'];

function CompactSidesEditor({
  sides,
  onChange,
}: {
  sides: Record<BorderSide, SideSpec>;
  onChange: (next: Record<BorderSide, SideSpec>) => void;
}) {
  // Drill-in state: when non-null, the popover swaps the 5-row table for
  // an inline color picker view for the target row. Clicking "← Back" or
  // picking a color returns to the table.
  const [editingColorFor, setEditingColorFor] = useState<'all' | BorderSide | null>(null);

  const patchSide = (side: BorderSide, p: Partial<SideSpec>) =>
    onChange({ ...sides, [side]: { ...sides[side], ...p } });

  const patchAll = (p: Partial<SideSpec>) => {
    const next: Record<BorderSide, SideSpec> = { ...sides };
    for (const s of EDGE_ORDER) next[s] = { ...sides[s], ...p };
    onChange(next);
  };

  const allSame = <K extends keyof SideSpec>(key: K): boolean =>
    EDGE_ORDER.every((s) => sides[s][key] === sides.top[key]);
  const allColor = allSame('color') ? sides.top.color : null;
  const allAlpha = allSame('alpha') ? sides.top.alpha : null;
  const allWidth = allSame('width') ? sides.top.width : null;
  const allVisible = allSame('visible') ? sides.top.visible : null;

  type RowDef = {
    key: 'all' | BorderSide;
    label: string;
    color: string | null;
    alpha: number | null;
    width: number | null;
    visible: boolean | null;
    patch: (p: Partial<SideSpec>) => void;
  };

  const rows: RowDef[] = [
    {
      key: 'all',
      label: 'All',
      color: allColor, alpha: allAlpha, width: allWidth, visible: allVisible,
      patch: patchAll,
    },
    ...EDGE_ORDER.map<RowDef>((s) => ({
      key: s,
      label: s.charAt(0).toUpperCase() + s.slice(1),
      color: sides[s].color,
      alpha: sides[s].alpha,
      width: sides[s].width,
      visible: sides[s].visible,
      patch: (p: Partial<SideSpec>) => patchSide(s, p),
    })),
  ];

  // ─── Drill-in: inline color picker ────────────────────────────────────
  if (editingColorFor) {
    const row = rows.find((r) => r.key === editingColorFor);
    if (!row) { setEditingColorFor(null); return null; }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: 236 }}>
        {/* Header with back button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setEditingColorFor(null)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 2,
              padding: '2px 6px 2px 4px',
              background: 'transparent',
              border: 'none',
              color: T.textMid,
              fontSize: 11,
              cursor: 'pointer',
              borderRadius: 3,
            }}
            title="Back to sides"
          >
            <ChevronLeft size={12} strokeWidth={2} />
            Back
          </button>
          <span style={{ flex: 1, textAlign: 'center', fontSize: 11, fontWeight: 600, color: T.text }}>
            {row.label} color
          </span>
          <span style={{ width: 44 }} />
        </div>
        <FormatColorPicker
          value={row.color ?? '#000000'}
          alpha={row.alpha ?? 100}
          onChange={(hex) => row.patch({ color: hex })}
          onAlpha={(a) => row.patch({ alpha: a })}
        />
      </div>
    );
  }

  // ─── Default view: 5-row table ────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: 236 }}>
      {/* Column headers */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '46px 22px 1fr 22px',
          alignItems: 'center',
          gap: 6,
          padding: '2px 6px 4px',
          color: T.textDim,
          fontSize: 9,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}
      >
        <span>Side</span>
        <span></span>
        <span>Thickness</span>
        <span></span>
      </div>

      {rows.map((row, idx) => (
        <BorderRow
          key={row.key}
          row={row}
          emphasized={row.key === 'all'}
          divider={idx === 0}
          onEditColor={() => setEditingColorFor(row.key)}
        />
      ))}
    </div>
  );
}

/** One row of the 5-row border table: [label] [eye] [thickness-select] [color]. */
function BorderRow({
  row,
  emphasized,
  divider,
  onEditColor,
}: {
  row: {
    key: 'all' | BorderSide;
    label: string;
    color: string | null; alpha: number | null; width: number | null; visible: boolean | null;
    patch: (p: Partial<SideSpec>) => void;
  };
  emphasized?: boolean;
  divider?: boolean;
  onEditColor: () => void;
}) {
  const { color, width, visible } = row;
  const colorDisplay = color ?? '';
  const isHidden = visible === false;
  const isMixedColor = color === null;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '46px 22px 1fr 22px',
        alignItems: 'center',
        gap: 6,
        padding: '4px 6px',
        background: emphasized ? T.surface : 'transparent',
        borderRadius: emphasized ? T.radius : 0,
        borderBottom: divider ? `1px dashed ${T.border}` : 'none',
        marginBottom: divider ? 4 : 0,
        opacity: isHidden ? 0.55 : 1,
        transition: 'opacity 120ms ease',
      }}
    >
      {/* Label */}
      <span
        style={{
          fontSize: 11,
          fontWeight: emphasized ? 600 : 500,
          color: emphasized ? T.text : T.textMid,
          letterSpacing: emphasized ? '-0.01em' : 'normal',
        }}
      >
        {row.label}
      </span>

      {/* Visibility toggle */}
      <button
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => row.patch({ visible: visible === false ? true : false })}
        title={visible === false ? 'Show' : 'Hide'}
        style={{
          width: 20,
          height: 20,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'transparent',
          border: 'none',
          borderRadius: 3,
          color: visible === false ? T.textDim : T.textMid,
          cursor: 'pointer',
          padding: 0,
        }}
      >
        {visible === false
          ? <EyeOff size={12} strokeWidth={1.75} />
          : <Eye size={12} strokeWidth={1.75} />}
      </button>

      {/* Thickness as a compact 0–5 select (shadcn-style) */}
      <ThicknessSelect
        value={width}
        onChange={(n) => row.patch({ width: n })}
      />

      {/* Color swatch — clicking drills in, doesn't open a side popover */}
      <button
        onMouseDown={(e) => e.preventDefault()}
        onClick={onEditColor}
        title={colorDisplay ? `Edit ${row.label.toLowerCase()} color` : 'Pick a shared color'}
        style={{
          width: 20,
          height: 20,
          borderRadius: 3,
          background: colorDisplay || 'transparent',
          backgroundImage: isMixedColor
            ? 'repeating-linear-gradient(45deg, #444 0 3px, #222 3px 6px)'
            : undefined,
          border: `1px solid ${T.border}`,
          padding: 0,
          cursor: 'pointer',
        }}
      />
    </div>
  );
}

/** Compact shadcn-style select for 0..5 px thickness. Same portal dropdown
 *  primitive as everything else, with a tight trigger button. */
function ThicknessSelect({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (n: number) => void;
}) {
  return (
    <FormatDropdown
      trigger={
        <button
          onMouseDown={(e) => e.preventDefault()}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 4,
            height: 22,
            padding: '0 6px',
            background: T.surface,
            border: 'none',
            borderRadius: 3,
            color: value !== null ? T.text : T.textDim,
            fontFamily: T.fontMono,
            fontSize: 11,
            cursor: 'pointer',
            width: '100%',
          }}
          title="Thickness"
        >
          <span>{value === null ? '—' : value}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <span style={{ color: T.textDim, fontSize: 9 }}>px</span>
            <ChevronDown size={9} strokeWidth={2} color={T.textDim} />
          </span>
        </button>
      }
      value={value ?? -1}
      onChange={(v) => onChange(Number(v))}
      options={[0, 1, 2, 3, 4, 5].map((n) => ({
        value: n,
        label: n === 0 ? '0 · none' : `${n} px`,
        icon: <ThicknessBar width={n} />,
      }))}
    />
  );
}

/** Visual indicator next to each option in the thickness select. */
function ThicknessBar({ width }: { width: number }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 18,
        height: Math.max(1, width),
        background: width === 0 ? 'transparent' : T.text,
        borderRadius: 1,
        opacity: width === 0 ? 0.4 : 1,
        border: width === 0 ? `1px dashed ${T.textDim}` : 'none',
      }}
    />
  );
}

function strokeStyleIcon(style: BorderStyle) {
  const base: CSSProperties = {
    width: 16,
    height: 2,
    borderRadius: 1,
    display: 'inline-block',
  };
  if (style === 'solid') return <span style={{ ...base, background: 'currentColor' }} />;
  if (style === 'dashed') return (
    <span style={{
      ...base,
      background: 'transparent',
      backgroundImage: 'repeating-linear-gradient(to right, currentColor 0 4px, transparent 4px 7px)',
    }} />
  );
  return (
    <span style={{
      ...base,
      background: 'transparent',
      backgroundImage: 'repeating-linear-gradient(to right, currentColor 0 2px, transparent 2px 5px)',
    }} />
  );
}

// ─── Composite editors ───────────────────────────────────────────────────────

function BorderSidePicker({
  value,
  onChange,
  sides,
  onSidesChange,
}: {
  value: BorderMode;
  onChange: (m: BorderMode) => void;
  /** Required when mode can be 'custom' — drives the compact per-side editor. */
  sides?: Record<BorderSide, SideSpec>;
  onSidesChange?: (next: Record<BorderSide, SideSpec>) => void;
}) {
  const opts: Array<{ value: BorderMode; label: string; icon: ReactNode }> = [
    { value: 'all', label: 'All', icon: <Square size={11} strokeWidth={2} /> },
    { value: 'top', label: 'Top', icon: <PanelTop size={11} strokeWidth={2} /> },
    { value: 'bottom', label: 'Bottom', icon: <PanelBottom size={11} strokeWidth={2} /> },
    { value: 'left', label: 'Left', icon: <PanelLeft size={11} strokeWidth={2} /> },
    { value: 'right', label: 'Right', icon: <PanelRight size={11} strokeWidth={2} /> },
  ];
  const current = opts.find((o) => o.value === value);
  const isCustom = value === 'custom';

  const trigger = (
    <button
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: T.rowH,
        height: T.rowH,
        background: isCustom ? T.accentDim : T.surface,
        border: `1px solid ${isCustom ? T.accentRim : T.border}`,
        borderRadius: T.radius,
        color: isCustom ? T.accent : T.text,
        cursor: 'pointer',
      }}
      title={isCustom ? 'Edit individual sides' : current?.label}
    >
      {isCustom ? <Sliders size={12} strokeWidth={2} /> : (current?.icon ?? <Square size={11} strokeWidth={2} />)}
    </button>
  );

  // When in custom mode, the trigger opens the compact per-side editor
  // directly — no detour through the 6-item dropdown. A small "switch mode"
  // link at the bottom lets the user drop back to a preset side.
  if (isCustom && sides && onSidesChange) {
    return (
      <FormatPopover trigger={trigger} width={220}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <CompactSidesEditor sides={sides} onChange={onSidesChange} />
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onChange('all')}
            style={{
              alignSelf: 'flex-start',
              padding: 0,
              background: 'transparent',
              border: 'none',
              color: T.textMid,
              fontSize: 10,
              cursor: 'pointer',
              textDecoration: 'underline',
              textUnderlineOffset: 2,
            }}
          >
            Switch to shared stroke
          </button>
        </div>
      </FormatPopover>
    );
  }

  return (
    <FormatDropdown
      trigger={trigger}
      value={value}
      onChange={onChange}
      options={opts}
      footer={
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onChange('custom')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            width: '100%',
            padding: '6px 8px 6px 4px',
            background: 'transparent',
            color: value === 'custom' ? T.accent : T.text,
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
            fontFamily: T.fontSans,
            fontSize: 11,
          }}
        >
          <span style={{ width: 14, display: 'inline-flex', justifyContent: 'center', color: value === 'custom' ? T.accent : 'transparent' }}>
            <Check size={11} strokeWidth={2} />
          </span>
          <Sliders size={11} strokeWidth={2} />
          <span>Custom</span>
        </button>
      }
    />
  );
}

// ─── Settings panel composition ──────────────────────────────────────────────

function SettingsPanelDemo({ style, setStyle }: { style: Style; setStyle: (s: Style) => void }) {
  const patch = (p: Partial<Style>) => setStyle({ ...style, ...p });
  return (
    <FormatPane>
      {/* Header row replicating Figma Design / Prototype tabs */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 12px', borderBottom: `1px solid ${T.border}`,
        background: T.bg, position: 'sticky', top: 0, zIndex: 1,
      }}>
        <div style={{ display: 'flex', gap: 2 }}>
          <span style={{
            padding: '4px 10px', borderRadius: 3,
            background: T.surfaceActive, color: T.text,
            fontSize: 11, fontWeight: 600, letterSpacing: '-0.01em',
          }}>
            Format
          </span>
          <span style={{ padding: '4px 10px', color: T.textMid, fontSize: 11, fontWeight: 500 }}>
            Rule
          </span>
        </div>
        <span style={{ color: T.textMid, fontSize: 10, fontFamily: T.fontMono }}>100%</span>
      </div>

      <FormatSection title="Typography">
        <FormatRow label="Family">
          <FormatIconInput value="Inter" mono={false} />
          <FormatIconInput value={style.fontSize} suffix="px" width={60}
            onChange={(v) => patch({ fontSize: Number(v) || 12 })} align="right" />
        </FormatRow>
        <FormatRow label="Style">
          <FormatToggleGroup
            value={style.italic ? 'i' : style.underline ? 'u' : (style.fontWeight === '700' ? 'b' : null)}
            onChange={(v) => {
              if (v === 'b') patch({ fontWeight: style.fontWeight === '700' ? '400' : '700' });
              else if (v === 'i') patch({ italic: !style.italic });
              else if (v === 'u') patch({ underline: !style.underline });
            }}
            options={[
              { value: 'b', icon: <Bold size={11} strokeWidth={2} />, tooltip: 'Bold' },
              { value: 'i', icon: <Italic size={11} strokeWidth={2} />, tooltip: 'Italic' },
              { value: 'u', icon: <Underline size={11} strokeWidth={2} />, tooltip: 'Underline' },
            ]}
          />
          <div style={{ flex: 1 }} />
          <FormatToggleGroup
            value={style.align}
            onChange={(v) => patch({ align: (v ?? 'left') as Style['align'] })}
            options={[
              { value: 'left', icon: <AlignLeft size={11} strokeWidth={2} />, tooltip: 'Align Left' },
              { value: 'center', icon: <AlignCenter size={11} strokeWidth={2} />, tooltip: 'Align Center' },
              { value: 'right', icon: <AlignRight size={11} strokeWidth={2} />, tooltip: 'Align Right' },
            ]}
          />
        </FormatRow>
      </FormatSection>

      <FormatSection title="Appearance"
        rightActions={
          <>
            <button style={iconBtnStyle} title="Show"><Eye size={12} strokeWidth={1.75} /></button>
            <button style={iconBtnStyle} title="More"><Sliders size={12} strokeWidth={1.75} /></button>
          </>
        }
      >
        <FormatRow label="Opacity">
          <FormatIconInput value={style.opacity} suffix="%" width={84}
            onChange={(v) => patch({ opacity: Number(v) || 0 })} align="right" />
          <FormatIconInput value={style.cornerRadius} icon={<CornerDownRight size={11} strokeWidth={2} />}
            suffix="px" width={84}
            onChange={(v) => patch({ cornerRadius: Number(v) || 0 })} align="right" />
        </FormatRow>
      </FormatSection>

      <FormatSection
        title="Fill"
        rightActions={
          <>
            <button style={iconBtnStyle} title="Styles"><Grid3X3 size={12} strokeWidth={1.75} /></button>
            <button style={iconBtnStyle} title="Add fill"><Plus size={12} strokeWidth={1.75} /></button>
          </>
        }
      >
        <FormatSwatch
          value={style.fillColor}
          opacity={style.fillAlpha}
          onChange={(v) => patch({ fillColor: v })}
          onOpacity={(n) => patch({ fillAlpha: n })}
        />
      </FormatSection>

      <FormatSection
        title="Stroke"
        rightActions={
          <>
            <button style={iconBtnStyle} title="Styles"><Grid3X3 size={12} strokeWidth={1.75} /></button>
            <button style={iconBtnStyle} title="Add stroke"><Plus size={12} strokeWidth={1.75} /></button>
          </>
        }
      >
        <FormatSwatch
          value={style.strokeColor}
          opacity={style.strokeAlpha}
          onChange={(v) => patch({ strokeColor: v })}
          onOpacity={(n) => patch({ strokeAlpha: n })}
        />
        <FormatRow label="Position">
          <FormatDropdown
            trigger={
              <button
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 6,
                  padding: '0 8px',
                  height: T.rowH,
                  width: '100%',
                  background: T.surface,
                  border: 'none',
                  borderRadius: T.radius,
                  color: T.text,
                  fontFamily: T.fontSans,
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                <span style={{ textTransform: 'capitalize' }}>{style.strokePosition}</span>
                <ChevronDown size={10} strokeWidth={2} color={T.textDim} />
              </button>
            }
            value={style.strokePosition}
            onChange={(v) => patch({ strokePosition: v as Style['strokePosition'] })}
            options={[
              { value: 'inside', label: 'Inside' },
              { value: 'outside', label: 'Outside' },
              { value: 'center', label: 'Center' },
            ]}
          />
        </FormatRow>
        <FormatRow label="Weight">
          <FormatIconInput
            value={style.strokeWidth}
            icon={<Hash size={11} strokeWidth={2} />}
            suffix="px"
            align="right"
            onChange={(v) => patch({ strokeWidth: Number(v) || 0 })}
          />
          <FormatDropdown
            trigger={
              <button
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '0 8px',
                  height: T.rowH,
                  background: T.surface,
                  border: 'none',
                  borderRadius: T.radius,
                  color: T.text,
                  fontFamily: T.fontSans,
                  fontSize: 11,
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                }}
                title="Border style"
              >
                {strokeStyleIcon(style.strokeStyle)}
                <span>{style.strokeStyle}</span>
                <ChevronDown size={10} strokeWidth={2} color={T.textDim} />
              </button>
            }
            value={style.strokeStyle}
            onChange={(v) => patch({ strokeStyle: v as BorderStyle })}
            options={[
              { value: 'solid', label: 'Solid', icon: strokeStyleIcon('solid') },
              { value: 'dashed', label: 'Dashed', icon: strokeStyleIcon('dashed') },
              { value: 'dotted', label: 'Dotted', icon: strokeStyleIcon('dotted') },
            ]}
          />
          <BorderSidePicker
            value={style.borderMode}
            onChange={(m) => patch({ borderMode: m })}
            sides={style.sides}
            onSidesChange={(sides) => patch({ sides })}
          />
        </FormatRow>
      </FormatSection>

      <FormatSection title="Effects"
        rightActions={<button style={iconBtnStyle} title="Add effect"><Plus size={12} strokeWidth={1.75} /></button>}
      >
        <FormatRow>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: T.surface, borderRadius: T.radius,
            padding: '0 8px', height: T.rowH, flex: 1,
          }}>
            <div style={{
              width: 10, height: 10, border: `1px solid ${T.borderStrong}`,
              borderRadius: 2, flexShrink: 0,
            }} />
            <span style={{ flex: 1, color: T.text }}>Drop shadow</span>
            <button style={iconBtnStyle}><Eye size={12} strokeWidth={1.75} /></button>
          </div>
        </FormatRow>
      </FormatSection>

      <FormatSection title="Export"
        rightActions={<button style={iconBtnStyle}><Plus size={12} strokeWidth={1.75} /></button>}
      />
    </FormatPane>
  );
}

// ─── Inline toolbar composition (same primitives, horizontal) ────────────────

function InlineToolbarDemo({ style, setStyle }: { style: Style; setStyle: (s: Style) => void }) {
  const patch = (p: Partial<Style>) => setStyle({ ...style, ...p });
  const group: CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 4,
    padding: '4px 8px', background: T.surface, borderRadius: T.radius,
  };
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '8px 12px', background: T.bg, borderBottom: `1px solid ${T.border}`,
      fontFamily: T.fontSans, color: T.text,
    }}>
      <div style={group}>
        <FormatToggleGroup
          value={style.fontWeight === '700' ? 'b' : null}
          onChange={(v) => patch({ fontWeight: v === 'b' ? '700' : '400' })}
          options={[{ value: 'b', icon: <Bold size={11} strokeWidth={2} />, tooltip: 'Bold' }]}
        />
        <FormatToggleGroup
          value={style.italic ? 'i' : null}
          onChange={(v) => patch({ italic: v === 'i' })}
          options={[{ value: 'i', icon: <Italic size={11} strokeWidth={2} />, tooltip: 'Italic' }]}
        />
        <FormatToggleGroup
          value={style.underline ? 'u' : null}
          onChange={(v) => patch({ underline: v === 'u' })}
          options={[{ value: 'u', icon: <Underline size={11} strokeWidth={2} />, tooltip: 'Underline' }]}
        />
      </div>

      <FormatDropdown
        trigger={
          <button style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            height: T.rowH, padding: '0 8px',
            background: T.surface, border: 'none', borderRadius: T.radius,
            color: T.text, fontFamily: T.fontMono, fontSize: 11, cursor: 'pointer',
          }}>
            <CaseSensitive size={11} strokeWidth={2} color={T.textDim} />
            <span>{style.fontSize}px</span>
            <ChevronDown size={9} strokeWidth={2} color={T.textDim} />
          </button>
        }
        value={style.fontSize}
        onChange={(v) => patch({ fontSize: v })}
        options={[9, 10, 11, 12, 13, 14, 16, 18, 20, 24].map((n) => ({ value: n, label: `${n}px` }))}
      />

      <div style={group}>
        <FormatToggleGroup
          value={style.align}
          onChange={(v) => patch({ align: (v ?? 'left') as Style['align'] })}
          options={[
            { value: 'left', icon: <AlignLeft size={11} strokeWidth={2} /> },
            { value: 'center', icon: <AlignCenter size={11} strokeWidth={2} /> },
            { value: 'right', icon: <AlignRight size={11} strokeWidth={2} /> },
          ]}
        />
      </div>

      {/* Color pickers - compact form */}
      <FormatPopover
        trigger={
          <button style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            height: T.rowH, padding: '0 6px',
            background: T.surface, border: 'none', borderRadius: T.radius,
            color: T.text, cursor: 'pointer',
          }}>
            <Type size={11} strokeWidth={2} />
            <span style={{
              width: 12, height: 3, background: style.textColor, borderRadius: 1,
            }} />
          </button>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ color: T.textMid, fontSize: 10 }}>Text</div>
          <FormatSwatch
            value={style.textColor}
            opacity={style.textAlpha}
            onChange={(v) => patch({ textColor: v })}
            onOpacity={(n) => patch({ textAlpha: n })}
          />
        </div>
      </FormatPopover>

      <FormatPopover
        trigger={
          <button style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            height: T.rowH, padding: '0 6px',
            background: T.surface, border: 'none', borderRadius: T.radius,
            color: T.text, cursor: 'pointer',
          }}>
            <PaintBucket size={11} strokeWidth={2} />
            <span style={{
              width: 12, height: 10, background: style.fillColor, borderRadius: 1,
            }} />
          </button>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ color: T.textMid, fontSize: 10 }}>Fill</div>
          <FormatSwatch
            value={style.fillColor}
            opacity={style.fillAlpha}
            onChange={(v) => patch({ fillColor: v })}
            onOpacity={(n) => patch({ fillAlpha: n })}
          />
        </div>
      </FormatPopover>

      {/* Border side picker — dropdown for preset sides; compact per-side
          popover takes over when mode is Custom. */}
      <BorderSidePicker
        value={style.borderMode}
        onChange={(m) => patch({ borderMode: m })}
        sides={style.sides}
        onSidesChange={(sides) => patch({ sides })}
      />

      <div style={{ flex: 1 }} />
      <span style={{ color: T.textDim, fontSize: 10, fontFamily: T.fontMono }}>
        {style.fontWeight} · {style.fontSize}px · {style.align} · {borderSummary(style)}
      </span>
    </div>
  );
}

// ─── Border state → CSS helpers ──────────────────────────────────────────────

function borderSummary(s: Style): string {
  if (s.borderMode !== 'custom') return s.borderMode;
  const on = (['top', 'right', 'bottom', 'left'] as BorderSide[])
    .filter((k) => s.sides[k].visible && s.sides[k].width > 0)
    .map((k) => k[0].toUpperCase())
    .join('');
  return on.length ? `custom (${on})` : 'custom (none)';
}

function borderStyleFromState(s: Style): CSSProperties {
  if (s.borderMode === 'custom') {
    const sideCSS = (side: BorderSide) => {
      const spec = s.sides[side];
      if (!spec.visible || spec.width <= 0) return '';
      return `${spec.width}px ${spec.style} ${hexWithAlpha(spec.color, spec.alpha)}`;
    };
    return {
      borderTop: sideCSS('top') || 'none',
      borderRight: sideCSS('right') || 'none',
      borderBottom: sideCSS('bottom') || 'none',
      borderLeft: sideCSS('left') || 'none',
    };
  }
  const shared = `${s.strokeWidth}px ${s.strokeStyle} ${hexWithAlpha(s.strokeColor, s.strokeAlpha)}`;
  switch (s.borderMode) {
    case 'all': return { border: shared };
    case 'top': return { borderTop: shared };
    case 'right': return { borderRight: shared };
    case 'bottom': return { borderBottom: shared };
    case 'left': return { borderLeft: shared };
    default: return {};
  }
}

// ─── Preview page ────────────────────────────────────────────────────────────

export function FormatEditorPreview() {
  const [style, setStyle] = useState<Style>(initialStyle);
  const [dark, setDark] = useState(true);

  useEffect(() => {
    document.documentElement.style.background = dark ? T.bg : '#f7f7f8';
  }, [dark]);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100vh',
      background: T.bg, color: T.text, fontFamily: T.fontSans,
    }}>
      {/* Inline toolbar — horizontal reuse of the same primitives */}
      <InlineToolbarDemo style={style} setStyle={setStyle} />

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* Canvas preview — shows what the format applies to */}
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'linear-gradient(135deg, #0b0b0d 0%, #131316 100%)',
          borderRight: `1px solid ${T.border}`, overflow: 'hidden', position: 'relative',
        }}>
          {/* Dot grid pattern */}
          <div style={{
            position: 'absolute', inset: 0,
            backgroundImage: `radial-gradient(${T.border} 1px, transparent 1px)`,
            backgroundSize: '20px 20px',
            opacity: 0.4,
          }} />

          {/* Header */}
          <div style={{
            position: 'absolute', top: 20, left: 24, display: 'flex',
            alignItems: 'center', gap: 10, fontSize: 11, color: T.textMid,
          }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 22, height: 22, borderRadius: 11, background: T.accent,
              color: '#fff', fontWeight: 700, fontSize: 10,
            }}>
              F
            </span>
            <span style={{ color: T.text, fontWeight: 600 }}>Format Editor</span>
            <span style={{ color: T.textDim }}>/</span>
            <span>Figma-inspired property panel proposal</span>
          </div>

          {/* Preview card using the applied style */}
          <div style={{
            padding: '40px 60px',
            background: hexWithAlpha(style.fillColor, style.fillAlpha),
            borderRadius: style.cornerRadius,
            opacity: style.opacity / 100,
            ...borderStyleFromState(style),
            position: 'relative',
          }}>
            <div style={{
              fontFamily: T.fontSans,
              fontWeight: style.fontWeight,
              fontSize: style.fontSize + 4,
              fontStyle: style.italic ? 'italic' : 'normal',
              textDecoration: style.underline ? 'underline' : 'none',
              color: hexWithAlpha(style.textColor, style.textAlpha),
              textAlign: style.align,
            }}>
              Bond.T 4.25 %
            </div>
            <div style={{
              fontFamily: T.fontMono,
              fontSize: style.fontSize,
              color: hexWithAlpha(style.textColor, style.textAlpha * 0.6),
              textAlign: style.align,
              marginTop: 6,
            }}>
              102.175 / 102.250
            </div>
          </div>

          {/* Callout legend */}
          <div style={{
            position: 'absolute', bottom: 20, left: 24,
            display: 'flex', flexDirection: 'column', gap: 4,
            fontSize: 10, color: T.textDim, fontFamily: T.fontMono,
          }}>
            <div>One format spec powers both the toolbar and the panel.</div>
            <div>Edits in either surface update the preview live.</div>
          </div>

          <button
            onClick={() => setDark((d) => !d)}
            style={{
              position: 'absolute', top: 20, right: 20,
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 10px', background: T.surface,
              border: `1px solid ${T.border}`, borderRadius: T.radius,
              color: T.text, fontSize: 10, cursor: 'pointer',
            }}
          >
            {dark ? <Moon size={11} strokeWidth={2} /> : <Sun size={11} strokeWidth={2} />}
            {dark ? 'Dark' : 'Light'}
          </button>
        </div>

        {/* Settings panel — vertical reuse of the same primitives */}
        <SettingsPanelDemo style={style} setStyle={setStyle} />
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hexWithAlpha(hex: string, alpha: number): string {
  const clean = hex.replace(/^#/, '');
  if (clean.length !== 6) return hex;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha / 100})`;
}
