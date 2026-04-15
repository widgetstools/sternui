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
  useEffect,
  useLayoutEffect,
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
  ChevronDown, ChevronRight, Check,
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

/** Swatch + hex + opacity + action icons (Figma's Fill/Stroke row). */
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
      <button
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onChange?.(value)}
        style={{
          width: 14,
          height: 14,
          borderRadius: 2,
          background: value,
          border: `1px solid ${T.border}`,
          cursor: 'pointer',
          flexShrink: 0,
        }}
      />
      <input
        value={value.replace(/^#/, '').toUpperCase()}
        onChange={(e) => onChange?.('#' + e.target.value)}
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
  strokeColor: string;
  strokeAlpha: number;
  strokeWidth: number;
  strokePosition: 'inside' | 'outside' | 'center';
  borderMode: BorderMode;
  cornerRadius: number;
  opacity: number;
}

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
  strokePosition: 'inside',
  borderMode: 'all',
  cornerRadius: 0,
  opacity: 100,
};

// ─── Composite editors ───────────────────────────────────────────────────────

function BorderSidePicker({
  value,
  onChange,
}: {
  value: BorderMode;
  onChange: (m: BorderMode) => void;
}) {
  const opts: Array<{ value: BorderMode; label: string; icon: ReactNode }> = [
    { value: 'all', label: 'All', icon: <Square size={11} strokeWidth={2} /> },
    { value: 'top', label: 'Top', icon: <PanelTop size={11} strokeWidth={2} /> },
    { value: 'bottom', label: 'Bottom', icon: <PanelBottom size={11} strokeWidth={2} /> },
    { value: 'left', label: 'Left', icon: <PanelLeft size={11} strokeWidth={2} /> },
    { value: 'right', label: 'Right', icon: <PanelRight size={11} strokeWidth={2} /> },
  ];
  const current = opts.find((o) => o.value === value);
  return (
    <FormatDropdown
      trigger={
        <button
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: T.rowH,
            height: T.rowH,
            background: value === 'custom' ? T.accentDim : T.surface,
            border: `1px solid ${value === 'custom' ? T.accentRim : T.border}`,
            borderRadius: T.radius,
            color: value === 'custom' ? T.accent : T.text,
            cursor: 'pointer',
          }}
          title={current?.label}
        >
          {current?.icon ?? <Square size={11} strokeWidth={2} />}
        </button>
      }
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
          <button style={iconBtnStyle} title="Advanced">
            <Sliders size={12} strokeWidth={1.75} />
          </button>
          <BorderSidePicker value={style.borderMode} onChange={(m) => patch({ borderMode: m })} />
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

      {/* Border side picker — exactly the dropdown from the Figma screenshot */}
      <BorderSidePicker value={style.borderMode} onChange={(m) => patch({ borderMode: m })} />

      <div style={{ flex: 1 }} />
      <span style={{ color: T.textDim, fontSize: 10, fontFamily: T.fontMono }}>
        {style.fontWeight} · {style.fontSize}px · {style.align} · {style.borderMode}
      </span>
    </div>
  );
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
            ...(style.borderMode === 'all' && { border: `${style.strokeWidth}px solid ${hexWithAlpha(style.strokeColor, style.strokeAlpha)}` }),
            ...(style.borderMode === 'top' && { borderTop: `${style.strokeWidth}px solid ${hexWithAlpha(style.strokeColor, style.strokeAlpha)}` }),
            ...(style.borderMode === 'right' && { borderRight: `${style.strokeWidth}px solid ${hexWithAlpha(style.strokeColor, style.strokeAlpha)}` }),
            ...(style.borderMode === 'bottom' && { borderBottom: `${style.strokeWidth}px solid ${hexWithAlpha(style.strokeColor, style.strokeAlpha)}` }),
            ...(style.borderMode === 'left' && { borderLeft: `${style.strokeWidth}px solid ${hexWithAlpha(style.strokeColor, style.strokeAlpha)}` }),
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
