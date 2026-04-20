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
  PaintBucket,
  Plus,
  Trash2,
  Type,
  X,
} from 'lucide-react';

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
  doApplyTemplate: (tplId: string) => void;
  doSaveAsTemplate: (name: string) => string | undefined;
  doClearAllStyles: () => void;
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
        padding: '18px 0 16px',
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
            margin: '0 0 12px',
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{children}</div>
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
      onClick={onClick}
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
      onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onClick?.(); }}
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
    doApplyTemplate,
    doSaveAsTemplate,
    doClearAllStyles,
    setSaveAsTplName,
    flashSaveAsTpl,
  } = props;

  const columnMaxWidth: CSSProperties = { maxWidth: 360, margin: '0 auto' };

  // Only render the custom titlebar when we're in OpenFin AND
  // the caller asked for frameless mode. Browsers always render
  // their own OS title bar; ours would just be noise there.
  const showCustomTitleBar = frameless === true && isOpenFin();

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

      {/* ── Body — scrollable, content column pinned to 360 ──────── */}
      <div
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
          {/* 01 TYPOGRAPHY */}
          <Section index="01" title="Typography">
            <Row label="Style">
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
            </Row>
            <Row label="Align">
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
            </Row>
            <Row label="Size">
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
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10);
                    if (Number.isFinite(n) && n > 0) setFontSizePx(n);
                  }}
                  data-testid="fmt-panel-font-size"
                  style={{
                    width: 52,
                    height: 24,
                    padding: '0 8px',
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
                    padding: '0 10px',
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
            </Row>
          </Section>

          {/* 02 COLOR */}
          <Section index="02" title="Color">
            <Row label="Text">
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                <ColorPickerPopover
                  disabled={disabled}
                  value={fmt.color}
                  icon={<Type size={11} strokeWidth={2} />}
                  onChange={(c) => setTextColor(c)}
                  compact
                />
                <code
                  style={{
                    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                    fontSize: 10,
                    color: fmt.color ? 'var(--foreground)' : 'var(--muted-foreground)',
                    letterSpacing: '0.02em',
                  }}
                >
                  {fmt.color ? fmt.color.toUpperCase() : '—'}
                </code>
              </div>
            </Row>
            <Row label="Fill">
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                <ColorPickerPopover
                  disabled={disabled}
                  value={fmt.background}
                  icon={<PaintBucket size={11} strokeWidth={1.5} />}
                  onChange={(c) => setBgColor(c)}
                  compact
                />
                <code
                  style={{
                    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                    fontSize: 10,
                    color: fmt.background ? 'var(--foreground)' : 'var(--muted-foreground)',
                    letterSpacing: '0.02em',
                  }}
                >
                  {fmt.background ? fmt.background.toUpperCase() : '—'}
                </code>
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

          {/* 04 VALUE FORMAT */}
          <Section index="04" title="Value Format">
            <Row align="start">
              <FormatterPicker
                value={fmt.valueFormatterTemplate}
                onChange={(t) => doFormat(t)}
                dataType={pickerDataType}
                compact={false}
              />
            </Row>
          </Section>

          {/* 05 TEMPLATES */}
          <Section index="05" title="Templates" noBorder>
            {templateList.length === 0 ? (
              <div
                style={{
                  fontSize: 10,
                  fontStyle: 'italic',
                  color: 'var(--muted-foreground)',
                  padding: '0 0 10px',
                }}
              >
                No saved templates yet.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 12 }}>
                {templateList.map((tpl) => {
                  const isActive = tpl.id === activeTemplateId;
                  return (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => doApplyTemplate(tpl.id)}
                      disabled={disabled}
                      data-testid={`fmt-panel-template-${tpl.id}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        width: '100%',
                        height: 28,
                        padding: '0 10px',
                        border: `1px solid ${isActive ? 'color-mix(in srgb, var(--primary) 40%, transparent)' : 'transparent'}`,
                        borderRadius: 3,
                        background: isActive
                          ? 'color-mix(in srgb, var(--primary) 10%, transparent)'
                          : 'transparent',
                        color: isActive ? 'var(--primary)' : 'var(--foreground)',
                        fontFamily: "'Geist', 'IBM Plex Sans', -apple-system, sans-serif",
                        fontSize: 11,
                        fontWeight: isActive ? 500 : 400,
                        cursor: disabled ? 'not-allowed' : 'pointer',
                        textAlign: 'left',
                        opacity: disabled ? 0.4 : 1,
                      }}
                    >
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background: isActive ? 'var(--primary)' : 'var(--muted-foreground)',
                          opacity: isActive ? 1 : 0.4,
                        }}
                      />
                      {tpl.name}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Save-as-template row */}
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                type="text"
                value={saveAsTplName}
                onChange={(e) => setSaveAsTplName(e.target.value)}
                placeholder="Save current style as…"
                disabled={disabled}
                data-testid="fmt-panel-save-tpl-input"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && saveAsTplName.trim()) {
                    const id = doSaveAsTemplate(saveAsTplName.trim());
                    if (id) { setSaveAsTplName(''); flashSaveAsTpl(); }
                  }
                }}
                style={{
                  flex: 1,
                  height: 28,
                  padding: '0 10px',
                  border: '1px solid var(--border)',
                  borderRadius: 3,
                  background: 'var(--bn-bg, var(--background))',
                  color: 'var(--foreground)',
                  fontFamily: "'Geist', 'IBM Plex Sans', -apple-system, sans-serif",
                  fontSize: 11,
                  outline: 'none',
                }}
              />
              <button
                type="button"
                disabled={disabled || !saveAsTplName.trim()}
                onClick={() => {
                  const id = doSaveAsTemplate(saveAsTplName.trim());
                  if (id) { setSaveAsTplName(''); flashSaveAsTpl(); }
                }}
                data-testid="fmt-panel-save-tpl-btn"
                title="Save current style as template"
                style={{
                  width: 28,
                  height: 28,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: `1px solid ${saveAsTplConfirmed
                    ? 'color-mix(in srgb, var(--primary) 40%, transparent)'
                    : 'var(--border)'}`,
                  borderRadius: 3,
                  background: saveAsTplConfirmed
                    ? 'color-mix(in srgb, var(--primary) 14%, transparent)'
                    : 'transparent',
                  color: saveAsTplConfirmed ? 'var(--primary)' : 'var(--muted-foreground)',
                  cursor: disabled || !saveAsTplName.trim() ? 'not-allowed' : 'pointer',
                  opacity: disabled || !saveAsTplName.trim() ? 0.3 : 1,
                  transition: 'all 120ms',
                  padding: 0,
                }}
              >
                <Plus size={14} strokeWidth={2} />
              </button>
            </div>
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
            disabled={disabled}
            onClick={doClearAllStyles}
            data-testid="fmt-panel-clear-all"
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
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.3 : 1,
              transition: 'background 120ms, border-color 120ms',
            }}
            onMouseEnter={(e) => {
              if (!disabled) {
                e.currentTarget.style.background = 'color-mix(in srgb, var(--destructive) 10%, transparent)';
              }
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
