/**
 * FormattingPropertiesPanel — the popped-out variant of the
 * FormattingToolbar.
 *
 * Aesthetic: dark-first financial-terminal inspector, fully
 * theme-aware via the design-system tokens (`--card`, `--border`,
 * `--foreground`, `--muted-foreground`, `--primary`, `--bn-*`)
 * defined at `:root` and `[data-theme="light"]`. Typography mixes
 * JetBrains Mono (section numbers, numeric values, preview) with
 * Geist / IBM Plex Sans (labels, body text).
 *
 * Layout: content is pinned to a 360px column centered in the
 * window. If the user resizes the OS window wider, the extra space
 * shows as letter-boxed background — much like Figma's inspector
 * when pulled out. Preferred default window dim: 400×620.
 *
 * Prior iteration used local `--tb-*` vars that weren't defined in
 * this scope (the toolbar defined them on `.gc-formatting-toolbar`,
 * which the panel didn't carry), so theme switching silently broke
 * and dark fallbacks baked in. Now every color / surface goes
 * through the theme-variable system the rest of the app uses.
 */

import type { CSSProperties } from 'react';
import {
  BorderStyleEditor,
  FormatterPicker,
  ColorPickerPopover,
  PopoverCompat,
  cn,
  isOpenFin,
  type BorderSpec,
  type ValueFormatterTemplate,
} from '@grid-customizer/core';
import {
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  DollarSign,
  Hash,
  PaintBucket,
  Percent,
  Plus,
  Redo2,
  Trash2,
  Type,
  Undo2,
  X,
} from 'lucide-react';
// Shared template surface — same component the in-grid toolbar's
// Templates popover uses. Keeps apply / delete / save-as behavior
// identical across both surfaces.
import { TemplateManager } from './TemplateManager';
// Shared toolbar-preset helpers — same source the in-grid toolbar
// uses, so the "quick format" row in the panel stays in lockstep
// with the toolbar's behavior. Centralized in formatterPresets so
// template identity + active-state detection don't drift.
import {
  CURRENCY_FORMATTERS,
  PERCENT_TEMPLATE,
  COMMA_TEMPLATE,
  BPS_TEMPLATE,
  TICK_MENU,
  isPercentTemplate,
  isTickTemplate,
  currentTickToken,
  isCommaTemplate,
} from './formatterPresets';

export interface FormattingPropertiesPanelProps {
  /**
   * When true, render a custom draggable title bar at the top of
   * the panel (with `-webkit-app-region: drag` + a close "X"
   * button). Only honored when running inside OpenFin — in a
   * browser popout the OS always renders its own chrome and a
   * custom title bar would duplicate it.
   */
  frameless?: boolean;
  /** Fires when the user clicks the custom close "X" in the
   *  titlebar. Flips popped=false in the parent Poppable. */
  onClose?: () => void;
  /** Text shown in the custom title bar (frameless mode only). */
  titleText?: string;
  disabled: boolean;
  isHeader: boolean;
  target: 'cell' | 'header';
  colLabel: string;
  fmt: {
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    fontSize?: number;
    color?: string;
    background?: string;
    horizontal?: 'left' | 'center' | 'right';
    borders: { top?: BorderSpec; right?: BorderSpec; bottom?: BorderSpec; left?: BorderSpec };
    valueFormatterTemplate?: ValueFormatterTemplate;
  };
  pickerDataType: 'number' | 'date' | 'datetime' | 'boolean' | 'string';
  previewText: string;
  templateList: Array<{ id: string; name: string }>;
  activeTemplateId?: string;
  saveAsTplName: string;
  saveAsTplConfirmed: boolean;

  setTarget: (t: 'cell' | 'header') => void;
  toggleBold: () => void;
  toggleItalic: () => void;
  toggleUnderline: () => void;
  setFontSizePx: (px: number) => void;
  toggleAlign: (h: 'left' | 'center' | 'right') => void;
  setTextColor: (c: string | undefined) => void;
  setBgColor: (c: string | undefined) => void;
  applyBordersMap: (
    next: { top?: BorderSpec; right?: BorderSpec; bottom?: BorderSpec; left?: BorderSpec },
  ) => void;
  doFormat: (t: ValueFormatterTemplate | undefined) => void;
  /** Decrease / increase the current numeric template's decimal
   *  places by 1 — reads the current `valueFormatterTemplate` in
   *  the FormattingToolbar closure so repeated clicks compound. */
  decreaseDecimals: () => void;
  increaseDecimals: () => void;
  doApplyTemplate: (tplId: string) => void;
  doSaveAsTemplate: (name: string) => string | undefined;
  doDeleteTemplate: (tplId: string) => void;
  /** Opens the "Clear all styles?" confirm dialog. The dialog +
   *  actual reducer dispatch lives in FormattingToolbar so both
   *  surfaces confirm through the same mounted dialog. */
  requestClearAllStyles: () => void;
  /** Undo/redo for column-customization history. Same hook instance
   *  backs both the toolbar's ↺/↻ and the panel's header icons. */
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  setSaveAsTplName: (v: string) => void;
  flashSaveAsTpl: () => void;
}

// ─── Atoms ─────────────────────────────────────────────────────────

/** Section — numbered rail on the left, caps label, hairline below. */
function Section({
  index,
  title,
  children,
  noBorder,
}: {
  index: string;
  title: string;
  children: React.ReactNode;
  noBorder?: boolean;
}) {
  return (
    <section
      data-section-index={index}
      style={{
        // Compact vertical rhythm — 12/10 instead of 18/16. Multiplied
        // across five sections this shaves ~50px of total panel height
        // without compromising readability.
        padding: '12px 0 10px',
        borderBottom: noBorder ? 'none' : '1px solid var(--border)',
        display: 'grid',
        gridTemplateColumns: '28px 1fr',
        columnGap: 0,
      }}
    >
      <span
        style={{
          fontFamily: "'JetBrains Mono', 'IBM Plex Mono', ui-monospace, monospace",
          fontSize: 10,
          fontWeight: 500,
          color: 'var(--primary)',
          letterSpacing: '0.05em',
          lineHeight: '14px',
          paddingTop: 2,
        }}
      >
        {index}
      </span>
      <div>
        <h3
          style={{
            margin: '0 0 8px',
            fontFamily: "'Geist', 'IBM Plex Sans', -apple-system, sans-serif",
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: 'var(--muted-foreground)',
            lineHeight: '14px',
          }}
        >
          {title}
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
      </div>
    </section>
  );
}

/** Labeled row inside a section. Label is a fixed-width caps-sans
 *  span; control occupies the flex-1 right column. */
function Row({ label, children, align = 'center' }: {
  label?: string;
  children: React.ReactNode;
  align?: 'center' | 'start';
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: label ? '60px 1fr' : '1fr',
        alignItems: align,
        gap: 12,
        minHeight: 24,
      }}
    >
      {label && (
        <span
          style={{
            fontFamily: "'Geist', 'IBM Plex Sans', -apple-system, sans-serif",
            fontSize: 10,
            fontWeight: 500,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--muted-foreground)',
            lineHeight: '24px',
          }}
        >
          {label}
        </span>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>{children}</div>
    </div>
  );
}

/** Toggle — small square button for inline toggles (B/I/U, align).
 *  Active state uses the design system's teal primary with a
 *  subtle fill + border. */
function Toggle({
  active,
  disabled,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  const bg = active
    ? 'color-mix(in srgb, var(--primary) 16%, transparent)'
    : 'transparent';
  const color = active ? 'var(--primary)' : 'var(--foreground)';
  const border = active ? 'var(--primary)' : 'var(--border)';
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      aria-pressed={active ? 'true' : 'false'}
      style={{
        width: 26,
        height: 24,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        border: `1px solid ${active ? border : 'transparent'}`,
        borderRadius: 3,
        background: bg,
        color,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.3 : 1,
        transition: 'background 120ms, color 120ms, border-color 120ms',
      }}
      // Fire the handler on mousedown ONLY (matches TBtn in the
      // compact toolbar). Do NOT also attach an `onClick` — the
      // handler captures the current `fmt.*` value via closure, and
      // firing on BOTH mousedown + click toggles the state twice in
      // a single user click, which presents as "change reverts
      // immediately". `e.preventDefault()` keeps focus off the
      // button so grid cell focus is preserved in the main window.
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!disabled) onClick?.();
      }}
    >
      {children}
    </button>
  );
}

/** Header icon button — sibling to Toggle but styled for the thin
 *  header strip (smaller, muted foreground, no active/pressed state).
 *  Used by Undo/Redo; can be reused for any future header-strip
 *  affordance without introducing another bespoke chrome. */
function HeaderIconButton({
  disabled,
  onClick,
  title,
  children,
  'data-testid': testId,
}: {
  disabled?: boolean;
  onClick?: () => void;
  title?: string;
  children: React.ReactNode;
  'data-testid'?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!disabled) onClick?.();
      }}
      title={title}
      aria-label={title}
      data-testid={testId}
      style={{
        width: 22,
        height: 22,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        border: 'none',
        borderRadius: 3,
        background: 'transparent',
        color: 'var(--muted-foreground)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.3 : 0.85,
        transition: 'background 120ms, color 120ms, opacity 120ms',
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.background = 'color-mix(in srgb, var(--foreground) 8%, transparent)';
          e.currentTarget.style.color = 'var(--foreground)';
          e.currentTarget.style.opacity = '1';
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = 'var(--muted-foreground)';
        e.currentTarget.style.opacity = disabled ? '0.3' : '0.85';
      }}
    >
      {children}
    </button>
  );
}

// ─── Main component ────────────────────────────────────────────────

export function FormattingPropertiesPanel(props: FormattingPropertiesPanelProps) {
  const {
    frameless,
    onClose,
    titleText = 'Formatting',
    disabled,
    isHeader,
    target,
    colLabel,
    fmt,
    pickerDataType,
    previewText,
    templateList,
    activeTemplateId,
    saveAsTplName,
    saveAsTplConfirmed,
    setTarget,
    toggleBold,
    toggleItalic,
    toggleUnderline,
    setFontSizePx,
    toggleAlign,
    setTextColor,
    setBgColor,
    applyBordersMap,
    doFormat,
    decreaseDecimals,
    increaseDecimals,
    doApplyTemplate,
    doSaveAsTemplate,
    doDeleteTemplate,
    requestClearAllStyles,
    canUndo,
    canRedo,
    onUndo,
    onRedo,
    setSaveAsTplName,
    flashSaveAsTpl,
  } = props;

  const columnMaxWidth: CSSProperties = { maxWidth: 360, margin: '0 auto' };

  // Only render the custom titlebar when we're in OpenFin AND
  // the caller asked for frameless mode. Browsers always render
  // their own OS title bar; ours would just be noise there.
  const showCustomTitleBar = frameless === true && isOpenFin();

  // Quick-format row is numeric-only: currency, %, thousands, decimals
  // and tick are all numeric semantics. Disable on non-numeric columns
  // (date, string, boolean) and on header scope (headers have no
  // valueFormatter). `disabled` already covers the "no column selected"
  // case. The wrapper dims + blocks pointer-events in one place so the
  // row reads as a single gated region, not a patchwork of enabled /
  // disabled buttons.
  const fmtQuickDisabled = disabled || isHeader || pickerDataType !== 'number';

  return (
    <div
      className="gc-fmt-panel"
      data-testid="formatting-properties-panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100vh',
        overflow: 'hidden',
        background: 'var(--bn-bg, var(--background))',
        color: 'var(--foreground)',
        fontFamily: "'Geist', 'IBM Plex Sans', -apple-system, sans-serif",
        fontSize: 11,
      }}
    >
      {/* ── Custom draggable titlebar — only when OpenFin dropped
           the OS frame. The `.titlebar` class carries
           `-webkit-app-region: drag` so the whole strip is a drag
           handle; the close button opts out via `no-drag`. ────── */}
      {showCustomTitleBar && (
        <div
          className="titlebar"
          data-testid="fmt-panel-titlebar"
          style={{
            flexShrink: 0,
            height: 32,
            display: 'flex',
            alignItems: 'center',
            padding: '0 8px 0 12px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--bn-bg1, var(--card))',
            // OpenFin-specific: this CSS region tells the window
            // manager the strip is a "drag handle". Clicking +
            // dragging moves the OS window. Child elements that
            // need to be clickable must set app-region: no-drag.
            WebkitAppRegion: 'drag',
            userSelect: 'none',
          } as CSSProperties}
        >
          <span
            style={{
              flex: 1,
              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: '0.08em',
              color: 'var(--muted-foreground)',
              textTransform: 'uppercase',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {titleText}
          </span>
          <button
            type="button"
            onClick={() => onClose?.()}
            aria-label="Close"
            title="Close"
            data-testid="fmt-panel-close"
            style={{
              // The close button must not drag; opt out of the
              // drag region so clicks register as clicks.
              WebkitAppRegion: 'no-drag',
              width: 22,
              height: 22,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              border: 'none',
              borderRadius: 3,
              background: 'transparent',
              color: 'var(--muted-foreground)',
              cursor: 'pointer',
              transition: 'background 120ms, color 120ms',
            } as CSSProperties}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'color-mix(in srgb, var(--destructive) 18%, transparent)';
              e.currentTarget.style.color = 'var(--destructive)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--muted-foreground)';
            }}
          >
            <X size={13} strokeWidth={2} />
          </button>
        </div>
      )}

      {/* ── Header — sticky, compact, terminal-styled ───────────── */}
      <header
        data-testid="fmt-panel-header"
        style={{
          flexShrink: 0,
          height: 40,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '0 16px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bn-bg1, var(--card))',
        }}
      >
        <div style={{ ...columnMaxWidth, width: '100%', display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Scope — clickable pill */}
          <button
            type="button"
            onClick={() => setTarget(target === 'cell' ? 'header' : 'cell')}
            data-testid="formatting-target-toggle"
            style={{
              padding: '4px 10px',
              border: '1px solid var(--border)',
              borderRadius: 2,
              background: 'transparent',
              color: 'var(--primary)',
              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              lineHeight: 1,
            }}
            title="Toggle between cell and header styling"
          >
            {target}
          </button>

          {/* Column label + live dot */}
          <div
            style={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              fontSize: 11,
              color: disabled ? 'var(--muted-foreground)' : 'var(--foreground)',
              overflow: 'hidden',
            }}
            data-testid="fmt-panel-col-label"
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: disabled ? 'var(--muted-foreground)' : 'var(--primary)',
                flexShrink: 0,
                opacity: disabled ? 0.35 : 1,
              }}
            />
            <span
              style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {colLabel}
            </span>
          </div>

          {/* Undo / Redo — backed by the same useUndoRedo instance
               driving the in-grid toolbar's ↺ / ↻. Compact icon
               buttons with the panel's inspector aesthetic so they
               sit cleanly next to the scope pill + column label. */}
          <div style={{ display: 'inline-flex', gap: 2 }}>
            <HeaderIconButton
              disabled={!canUndo}
              onClick={onUndo}
              title="Undo"
              data-testid="fmt-panel-undo"
            >
              <Undo2 size={12} strokeWidth={1.75} />
            </HeaderIconButton>
            <HeaderIconButton
              disabled={!canRedo}
              onClick={onRedo}
              title="Redo"
              data-testid="fmt-panel-redo"
            >
              <Redo2 size={12} strokeWidth={1.75} />
            </HeaderIconButton>
          </div>

          {/* Preview chip */}
          <div
            data-testid="fmt-panel-preview"
            style={{
              display: 'inline-flex',
              alignItems: 'baseline',
              gap: 8,
              padding: '4px 10px',
              background: 'color-mix(in srgb, var(--primary) 8%, transparent)',
              border: '1px solid color-mix(in srgb, var(--primary) 25%, transparent)',
              borderRadius: 2,
              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              fontSize: 10,
              lineHeight: 1,
            }}
          >
            <span
              style={{
                fontSize: 8,
                fontWeight: 600,
                letterSpacing: '0.18em',
                color: 'var(--muted-foreground)',
                textTransform: 'uppercase',
              }}
            >
              Preview
            </span>
            <span
              style={{
                color: 'var(--primary)',
                fontWeight: 500,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {previewText || '—'}
            </span>
          </div>
        </div>
      </header>

      {/* ── Body — scrollable, content column pinned to 360 ────────
           `.gc-themed-scrollbar` uses `color-mix(var(--foreground), ...)`
           so the scrollbar thumb adapts to whichever theme is active
           without per-mode overrides. */}
      <div
        className="gc-themed-scrollbar"
        data-testid="fmt-panel-body"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          background: 'var(--bn-bg, var(--background))',
        }}
      >
        <div style={{ ...columnMaxWidth, padding: '0 16px' }}>
          {/* 01 TYPOGRAPHY — single row: style-toggles + hairline +
              align-toggles + hairline + size input. The three groups
              are semantically related (all "text-appearance") so they
              read fine without individual labels; the Section title
              carries the group name. Cuts ~60px of vertical space vs
              the previous three-row layout. */}
          <Section index="01" title="Typography">
            <Row align="center">
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  flexWrap: 'nowrap',
                }}
              >
                {/* B / I / U */}
                <div style={{ display: 'inline-flex', gap: 4 }}>
                  <Toggle
                    active={fmt.bold}
                    disabled={disabled || isHeader}
                    onClick={toggleBold}
                    title="Bold"
                  >
                    <Bold size={12} strokeWidth={2} />
                  </Toggle>
                  <Toggle
                    active={fmt.italic}
                    disabled={disabled || isHeader}
                    onClick={toggleItalic}
                    title="Italic"
                  >
                    <Italic size={12} strokeWidth={2} />
                  </Toggle>
                  <Toggle
                    active={fmt.underline}
                    disabled={disabled || isHeader}
                    onClick={toggleUnderline}
                    title="Underline"
                  >
                    <Underline size={12} strokeWidth={2} />
                  </Toggle>
                </div>

                {/* Vertical hairline */}
                <span
                  aria-hidden
                  style={{
                    width: 1,
                    height: 16,
                    background: 'var(--border)',
                  }}
                />

                {/* Align L / C / R */}
                <div style={{ display: 'inline-flex', gap: 4 }}>
                  <Toggle
                    active={fmt.horizontal === 'left'}
                    disabled={disabled}
                    onClick={() => toggleAlign('left')}
                    title="Left"
                  >
                    <AlignLeft size={12} strokeWidth={1.75} />
                  </Toggle>
                  <Toggle
                    active={fmt.horizontal === 'center'}
                    disabled={disabled}
                    onClick={() => toggleAlign('center')}
                    title="Center"
                  >
                    <AlignCenter size={12} strokeWidth={1.75} />
                  </Toggle>
                  <Toggle
                    active={fmt.horizontal === 'right'}
                    disabled={disabled}
                    onClick={() => toggleAlign('right')}
                    title="Right"
                  >
                    <AlignRight size={12} strokeWidth={1.75} />
                  </Toggle>
                </div>

                {/* Vertical hairline */}
                <span
                  aria-hidden
                  style={{
                    width: 1,
                    height: 16,
                    background: 'var(--border)',
                  }}
                />

                {/* Size input + PX unit — same chrome as before, just
                    inline with style / align instead of its own row. */}
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'stretch',
                    border: '1px solid var(--border)',
                    borderRadius: 3,
                    background: 'var(--bn-bg, var(--background))',
                    overflow: 'hidden',
                  }}
                >
                  <input
                    type="number"
                    min={7}
                    max={24}
                    value={fmt.fontSize ?? ''}
                    placeholder="11"
                    disabled={disabled || isHeader}
                    title="Font size (px)"
                    aria-label="Font size in pixels"
                    onChange={(e) => {
                      const n = parseInt(e.target.value, 10);
                      if (Number.isFinite(n) && n > 0) setFontSizePx(n);
                    }}
                    data-testid="fmt-panel-font-size"
                    style={{
                      width: 44,
                      height: 24,
                      padding: '0 6px',
                      border: 'none',
                      background: 'transparent',
                      color: 'var(--foreground)',
                      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                      fontSize: 11,
                      outline: 'none',
                    }}
                  />
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '0 8px',
                      borderLeft: '1px solid var(--border)',
                      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                      fontSize: 9,
                      fontWeight: 600,
                      letterSpacing: '0.14em',
                      color: 'var(--muted-foreground)',
                      background: 'color-mix(in srgb, var(--foreground) 4%, transparent)',
                    }}
                  >
                    PX
                  </span>
                </div>
              </div>
            </Row>
          </Section>

          {/* 02 COLOR — single row: Text swatch+hex + hairline + Fill
              swatch+hex. Both controls share identical shape (swatch +
              compact hex readout) so pairing them on one row reads
              naturally and saves another ~40px of vertical space. */}
          <Section index="02" title="Color">
            <Row align="center">
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 10,
                  flexWrap: 'nowrap',
                }}
              >
                {/* Text color */}
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <ColorPickerPopover
                    disabled={disabled}
                    value={fmt.color}
                    icon={<Type size={11} strokeWidth={2} />}
                    onChange={(c) => setTextColor(c)}
                    compact
                    title="Text color"
                  />
                  <code
                    style={{
                      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                      fontSize: 10,
                      color: fmt.color ? 'var(--foreground)' : 'var(--muted-foreground)',
                      letterSpacing: '0.02em',
                      minWidth: 54,
                    }}
                    title="Text color"
                  >
                    {fmt.color ? fmt.color.toUpperCase() : '—'}
                  </code>
                </div>

                {/* Vertical hairline */}
                <span
                  aria-hidden
                  style={{
                    width: 1,
                    height: 16,
                    background: 'var(--border)',
                  }}
                />

                {/* Fill color */}
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <ColorPickerPopover
                    disabled={disabled}
                    value={fmt.background}
                    icon={<PaintBucket size={11} strokeWidth={1.5} />}
                    onChange={(c) => setBgColor(c)}
                    compact
                    title="Fill color"
                  />
                  <code
                    style={{
                      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                      fontSize: 10,
                      color: fmt.background ? 'var(--foreground)' : 'var(--muted-foreground)',
                      letterSpacing: '0.02em',
                      minWidth: 54,
                    }}
                    title="Fill color"
                  >
                    {fmt.background ? fmt.background.toUpperCase() : '—'}
                  </code>
                </div>
              </div>
            </Row>
          </Section>

          {/* 03 BORDER */}
          <Section index="03" title="Border">
            <Row align="start">
              <BorderStyleEditor
                value={fmt.borders}
                onChange={applyBordersMap}
              />
            </Row>
          </Section>

          {/* 04 VALUE FORMAT — quick-action row (mirrors the in-grid
              toolbar's $ / % / # / decimals± / tick group) above the
              full FormatterPicker. Traders get the common actions
              without opening a dropdown; the picker stays for
              presets + custom Excel-format input.

              Vertical layout on the picker because the 360px panel
              column is narrower than the toolbar strip; the header's
              preview chip already covers live-preview, so the
              picker's inline preview is suppressed to avoid
              duplication. */}
          <Section index="04" title="Value Format">
            {/* Quick-format row — no label; the Section title above already
                brackets it, and the QUICK caption was dead weight. Gated
                on `pickerDataType === 'number'` because every button here
                emits a numeric formatter (currency, %, thousands, decimals,
                tick prices) — showing them enabled on date / string
                columns would mis-promise. `flexWrap: 'nowrap'` keeps the
                group on a single row; the compact buttons + small gaps
                fit comfortably inside the 360px panel column. */}
            <Row align="center">
              <div
                data-numeric-only={fmtQuickDisabled ? 'false' : 'true'}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  flexWrap: 'nowrap',
                  opacity: fmtQuickDisabled ? 0.45 : 1,
                  transition: 'opacity 120ms',
                  pointerEvents: fmtQuickDisabled ? 'none' : 'auto',
                }}
                title={fmtQuickDisabled ? 'Select a numeric column to apply quick formatters' : undefined}
              >
                {/* Currency — clicking the $ face applies USD;
                    the chevron opens EUR/GBP/JPY + BPS. Mirrors
                    the toolbar's split-button exactly. */}
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'stretch',
                    border: '1px solid var(--border)',
                    borderRadius: 3,
                    overflow: 'hidden',
                  }}
                >
                  <Toggle
                    disabled={fmtQuickDisabled}
                    onClick={() => doFormat(CURRENCY_FORMATTERS.USD.template)}
                    title="Currency (USD)"
                  >
                    <DollarSign size={12} strokeWidth={1.75} />
                  </Toggle>
                  <PopoverCompat
                    trigger={
                      <button
                        type="button"
                        disabled={fmtQuickDisabled}
                        aria-label="Currency menu"
                        title="Currency menu"
                        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                        style={{
                          width: 16,
                          height: 24,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: 0,
                          border: 'none',
                          borderLeft: '1px solid var(--border)',
                          background: 'transparent',
                          color: 'var(--muted-foreground)',
                          cursor: fmtQuickDisabled ? 'not-allowed' : 'pointer',
                          opacity: fmtQuickDisabled ? 0.3 : 1,
                        }}
                      >
                        <ChevronDown size={9} strokeWidth={2} />
                      </button>
                    }
                  >
                    <div className="p-1.5 min-w-[140px]">
                      {Object.entries(CURRENCY_FORMATTERS).map(([key, f]) => (
                        <button
                          key={key}
                          className="flex items-center gap-2.5 w-full px-2.5 py-1.5 rounded-md text-[11px] text-foreground hover:bg-accent cursor-pointer transition-colors"
                          onClick={() => doFormat(f.template)}
                          onMouseDown={(e) => e.preventDefault()}
                        >
                          <span className="font-mono font-semibold w-4 text-muted-foreground">{f.label}</span>
                          <span>{key}</span>
                        </button>
                      ))}
                      <div className="h-px bg-border my-1" />
                      <button
                        className="flex items-center gap-2.5 w-full px-2.5 py-1.5 rounded-md text-[11px] text-foreground hover:bg-accent cursor-pointer transition-colors"
                        onClick={() => doFormat(BPS_TEMPLATE)}
                        onMouseDown={(e) => e.preventDefault()}
                      >
                        <span className="font-mono font-semibold w-4 text-muted-foreground">bp</span>
                        <span>Basis points</span>
                      </button>
                    </div>
                  </PopoverCompat>
                </div>

                <Toggle
                  disabled={fmtQuickDisabled}
                  active={!fmtQuickDisabled && isPercentTemplate(fmt.valueFormatterTemplate)}
                  onClick={() =>
                    doFormat(
                      isPercentTemplate(fmt.valueFormatterTemplate) ? undefined : PERCENT_TEMPLATE,
                    )
                  }
                  title="Percentage"
                >
                  <Percent size={12} strokeWidth={1.75} />
                </Toggle>
                <Toggle
                  disabled={fmtQuickDisabled}
                  active={!fmtQuickDisabled && isCommaTemplate(fmt.valueFormatterTemplate)}
                  onClick={() =>
                    doFormat(
                      isCommaTemplate(fmt.valueFormatterTemplate) ? undefined : COMMA_TEMPLATE,
                    )
                  }
                  title="Thousands (1,234)"
                >
                  <Hash size={12} strokeWidth={1.75} />
                </Toggle>

                {/* Vertical hairline between grouping + decimals */}
                <span
                  aria-hidden
                  style={{
                    width: 1,
                    height: 16,
                    background: 'var(--border)',
                    margin: '0 2px',
                  }}
                />

                <Toggle
                  disabled={fmtQuickDisabled}
                  onClick={decreaseDecimals}
                  title="Fewer decimals"
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 1, fontSize: 9, fontFamily: "'JetBrains Mono', monospace" }}>
                    <ArrowLeft size={9} strokeWidth={2} />
                    .0
                  </span>
                </Toggle>
                <Toggle
                  disabled={fmtQuickDisabled}
                  onClick={increaseDecimals}
                  title="More decimals"
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 1, fontSize: 9, fontFamily: "'JetBrains Mono', monospace" }}>
                    .0
                    <ArrowRight size={9} strokeWidth={2} />
                  </span>
                </Toggle>

                {/* Vertical hairline separating decimals from tick */}
                <span
                  aria-hidden
                  style={{
                    width: 1,
                    height: 16,
                    background: 'var(--border)',
                    margin: '0 2px',
                  }}
                />

                {/* Tick — bond-price format. Split: main button
                    toggles current tick; chevron picks denominator. */}
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'stretch',
                    border: '1px solid var(--border)',
                    borderRadius: 3,
                    overflow: 'hidden',
                  }}
                >
                  <Toggle
                    disabled={fmtQuickDisabled}
                    active={!fmtQuickDisabled && isTickTemplate(fmt.valueFormatterTemplate)}
                    onClick={() =>
                      doFormat(
                        isTickTemplate(fmt.valueFormatterTemplate)
                          ? undefined
                          : { kind: 'tick', tick: currentTickToken(fmt.valueFormatterTemplate) ?? 'TICK32' },
                      )
                    }
                    title={
                      currentTickToken(fmt.valueFormatterTemplate)
                        ? `Tick: ${TICK_MENU.find((m) => m.token === currentTickToken(fmt.valueFormatterTemplate))?.label ?? '32nds'}`
                        : 'Tick format (32nds)'
                    }
                  >
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 500 }}>
                      {currentTickToken(fmt.valueFormatterTemplate)
                        ? (TICK_MENU.find((m) => m.token === currentTickToken(fmt.valueFormatterTemplate))?.denominator ?? '32')
                        : '32'}
                    </span>
                  </Toggle>
                  <PopoverCompat
                    trigger={
                      <button
                        type="button"
                        disabled={fmtQuickDisabled}
                        aria-label="Tick precision"
                        title="Tick precision"
                        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                        style={{
                          width: 16,
                          height: 24,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: 0,
                          border: 'none',
                          borderLeft: '1px solid var(--border)',
                          background: 'transparent',
                          color: 'var(--muted-foreground)',
                          cursor: fmtQuickDisabled ? 'not-allowed' : 'pointer',
                          opacity: fmtQuickDisabled ? 0.3 : 1,
                        }}
                      >
                        <ChevronDown size={9} strokeWidth={2} />
                      </button>
                    }
                  >
                    <div className="p-1 min-w-[180px]">
                      {TICK_MENU.map((m) => {
                        const active = currentTickToken(fmt.valueFormatterTemplate) === m.token;
                        return (
                          <button
                            key={m.token}
                            type="button"
                            onClick={() => doFormat({ kind: 'tick', tick: m.token })}
                            onMouseDown={(e) => e.preventDefault()}
                            className={cn(
                              'flex items-center gap-3 w-full px-2 py-1.5 rounded-md text-[11px]',
                              'text-foreground hover:bg-accent cursor-pointer transition-colors',
                              active && 'bg-accent',
                            )}
                          >
                            <span className="flex-1 text-left">{m.label}</span>
                            <span className="font-mono text-[10px] text-muted-foreground">{m.sample}</span>
                          </button>
                        );
                      })}
                    </div>
                  </PopoverCompat>
                </div>
              </div>
            </Row>
            <Row align="start">
              <FormatterPicker
                value={fmt.valueFormatterTemplate}
                onChange={(t) => doFormat(t)}
                dataType={pickerDataType}
                compact={false}
                layout="vertical"
              />
            </Row>
            {/* Preview box — dedicated "LIVE FORMAT" readout under the
                picker. Uses `previewText` (already composed in
                FormattingToolbar by running the current template against
                a representative sample value per dataType). Gives
                traders a big, stable preview anchor under the picker so
                they can eyeball format changes without hunting for the
                small preview chip in the header. Falls back to an em
                dash when no formatter is active. */}
            <Row align="start">
              <div
                data-testid="fmt-panel-preview-box"
                style={{
                  width: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  padding: '10px 12px',
                  border: '1px solid color-mix(in srgb, var(--primary) 25%, transparent)',
                  borderRadius: 4,
                  background: 'color-mix(in srgb, var(--primary) 6%, transparent)',
                }}
              >
                <span
                  style={{
                    fontFamily: "'JetBrains Mono', 'IBM Plex Mono', ui-monospace, monospace",
                    fontSize: 9,
                    fontWeight: 600,
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    color: 'var(--muted-foreground)',
                  }}
                >
                  Live Preview
                </span>
                <span
                  data-testid="fmt-panel-preview-value"
                  style={{
                    fontFamily: "'JetBrains Mono', 'IBM Plex Mono', ui-monospace, monospace",
                    fontSize: 15,
                    fontWeight: 500,
                    color: 'var(--primary)',
                    fontVariantNumeric: 'tabular-nums',
                    wordBreak: 'break-all',
                    lineHeight: 1.2,
                  }}
                >
                  {previewText || '—'}
                </span>
              </div>
            </Row>
          </Section>

          {/* 05 TEMPLATES — identical markup / interaction to the
              toolbar's Templates popover via the shared
              TemplateManager component. Click-to-apply + two-step
              delete confirm + inline save-as. */}
          <Section index="05" title="Templates" noBorder>
            <Row align="start">
              <TemplateManager
                templates={templateList}
                activeTemplateId={activeTemplateId}
                disabled={disabled}
                saveName={saveAsTplName}
                saveConfirmed={saveAsTplConfirmed}
                onSaveNameChange={setSaveAsTplName}
                onSave={() => {
                  const id = doSaveAsTemplate(saveAsTplName.trim() || `${colLabel} Style`);
                  if (id) {
                    setSaveAsTplName('');
                    flashSaveAsTpl();
                  }
                }}
                onApply={doApplyTemplate}
                onDelete={doDeleteTemplate}
                variant="panel"
                testIdPrefix="fmt-panel-tpl"
              />
            </Row>
          </Section>

          {/* Bottom spacer so the body doesn't feel cramped when
              the content is short. The letter-boxed background of
              the panel shows through here. */}
          <div style={{ height: 40 }} />
        </div>
      </div>

      {/* ── Footer — proper destructive action, not a tiny link ──── */}
      <footer
        style={{
          flexShrink: 0,
          height: 44,
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          borderTop: '1px solid var(--border)',
          background: 'var(--bn-bg1, var(--card))',
        }}
      >
        <div style={{ ...columnMaxWidth, width: '100%', display: 'flex', alignItems: 'center' }}>
          <button
            type="button"
            onClick={requestClearAllStyles}
            data-testid="fmt-panel-clear-all"
            title="Clear every column's styling, value formatter, borders, filter config, and template references from this profile"
            aria-label="Clear all styles in this profile"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              height: 28,
              padding: '0 12px',
              border: '1px solid color-mix(in srgb, var(--destructive) 30%, transparent)',
              borderRadius: 3,
              background: 'transparent',
              color: 'var(--destructive)',
              fontFamily: "'Geist', 'IBM Plex Sans', -apple-system, sans-serif",
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              transition: 'background 120ms, border-color 120ms',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'color-mix(in srgb, var(--destructive) 10%, transparent)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <Trash2 size={12} strokeWidth={1.75} />
            Clear all styles
          </button>
        </div>
      </footer>
    </div>
  );
}
