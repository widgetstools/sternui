/**
 * FormattingPropertiesPanel — the popped-out variant of the
 * FormattingToolbar.
 *
 * Replaces the compact horizontal toolbar + Radix popovers with a
 * vertical stack of always-visible sections, Figma-inspector style.
 * Same design language as the settings sheet: numbered bands, sub-
 * labels, compact controls, consistent 400-420px-wide container.
 *
 * Why a separate layout for the popout:
 *   - A popout window is DEDICATED real estate. Users pop it out to
 *     keep a styling workbench parked alongside their grids, not to
 *     replicate the toolbar strip. A vertical panel uses that space
 *     properly.
 *   - No more auto-resize dance: popovers opening inside a 900×120
 *     window either clipped off the bottom or forced the window to
 *     grow, flash, shrink. Everything here is inline — the window
 *     stays 400×620 always.
 *   - Traders can see every editor (color, border, format, templates)
 *     at a glance instead of hunting for triggers.
 *
 * The compact toolbar (FormattingToolbar's default render) is kept
 * for the inline case where horizontal strip is the right metaphor.
 *
 * Contract:
 *   - The panel takes the SAME action handlers + state snapshot the
 *     toolbar already computes. Both modes flow writes through the
 *     same reducers (applyTypographyReducer, applyColorsReducer, etc.)
 *     via the parent's dispatch functions, so switching between
 *     inline and popped mid-edit doesn't lose state.
 */

import type { CSSProperties } from 'react';
import {
  BorderStyleEditor,
  FormatterPicker,
  ColorPickerPopover,
  type BorderSpec,
  type CellStyleOverrides,
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
  RemoveFormatting,
  Type,
} from 'lucide-react';
import { TBtn, TGroup } from './formattingToolbarPrimitives';

export interface FormattingPropertiesPanelProps {
  // ── State snapshot ───────────────────────────────────────────────
  /** No columns selected in the grid — every control disables. */
  disabled: boolean;
  /** True when editing the header row (vs cells). Disables formatters. */
  isHeader: boolean;
  /** Scope toggle value. */
  target: 'cell' | 'header';
  /** Friendly label for the selected column(s) — "price" / "3 columns". */
  colLabel: string;
  /** Live snapshot of the selected columns' effective style. */
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
  /** Detected data type of the first selected column — drives the
   *  FormatterPicker's preset filter. */
  pickerDataType: 'number' | 'date' | 'datetime' | 'boolean' | 'string';
  /** Pre-rendered preview string ("1,234.5678", "2026-04-17", ...). */
  previewText: string;
  /** List of saved templates for the Templates section. */
  templateList: Array<{ id: string; name: string }>;
  /** Identifier of the currently-applied template, if any. */
  activeTemplateId?: string;
  /** Controlled "save as template" name input. */
  saveAsTplName: string;
  /** Did the save-as-template button just flash confirm? */
  saveAsTplConfirmed: boolean;

  // ── Action handlers ──────────────────────────────────────────────
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

const sectionStyle: CSSProperties = {
  padding: '10px 14px',
  borderBottom: '1px solid var(--tb-line, rgba(140, 170, 200, 0.16))',
};

const sectionLabelStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontFamily: 'var(--tb-font-mono, "IBM Plex Mono", ui-monospace, monospace)',
  fontSize: 9,
  fontWeight: 600,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: 'var(--tb-ink-2, #6B7685)',
  marginBottom: 8,
};

const sectionIndexStyle: CSSProperties = {
  opacity: 0.6,
};

const subLabelStyle: CSSProperties = {
  fontFamily: 'var(--tb-font-mono, monospace)',
  fontSize: 10,
  fontWeight: 500,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--tb-ink-2, #6B7685)',
  width: 56,
  flexShrink: 0,
};

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  minHeight: 26,
  marginBottom: 6,
};

function Section({ index, title, children }: {
  index: string; title: string; children: React.ReactNode;
}) {
  return (
    <div style={sectionStyle} data-section-index={index}>
      <div style={sectionLabelStyle}>
        <span style={sectionIndexStyle}>{index}</span>
        <span>{title}</span>
      </div>
      {children}
    </div>
  );
}

function SubRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={rowStyle}>
      <span style={subLabelStyle}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, minWidth: 0 }}>
        {children}
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────

export function FormattingPropertiesPanel(props: FormattingPropertiesPanelProps) {
  const {
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
        background: 'var(--tb-bg-bar, #11161C)',
        color: 'var(--tb-ink-0, #E4E9F0)',
        fontFamily: 'var(--tb-font-sans, "IBM Plex Sans", -apple-system, sans-serif)',
        fontSize: 11,
      }}
    >
      {/* ── Header — context + preview ────────────────────────────── */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '8px 14px',
          borderBottom: '1px solid var(--tb-line-strong, rgba(140, 170, 200, 0.24))',
          background: 'var(--tb-bg-sunken, #080B10)',
          flexShrink: 0,
          height: 36,
        }}
        data-testid="fmt-panel-header"
      >
        {/* Scope — Cell / Header */}
        <button
          type="button"
          className="gc-tb-scope"
          onClick={() => setTarget(target === 'cell' ? 'header' : 'cell')}
          data-testid="formatting-target-toggle"
          style={{ height: 22 }}
        >
          <span className="gc-tb-scope-val">{target.toUpperCase()}</span>
        </button>

        {/* Column label + live-dot */}
        <span
          style={{
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontFamily: 'var(--tb-font-mono, monospace)',
            fontSize: 11,
            color: disabled ? 'var(--tb-ink-3, #434C58)' : 'var(--tb-ink-1, #9AA5B4)',
          }}
          data-testid="fmt-panel-col-label"
        >
          {!disabled && (
            <span
              style={{
                display: 'inline-block',
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: 'var(--tb-accent, var(--primary))',
                marginRight: 8,
                verticalAlign: 'middle',
              }}
            />
          )}
          {colLabel}
        </span>

        {/* Preview chip */}
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '2px 8px',
            background: 'var(--tb-bg-panel, #0F1419)',
            border: '1px solid var(--tb-line, rgba(140, 170, 200, 0.08))',
            borderRadius: 2,
            fontFamily: 'var(--tb-font-mono, monospace)',
            fontSize: 10,
            height: 22,
          }}
          data-testid="fmt-panel-preview"
        >
          <span style={{ color: 'var(--tb-ink-3, #434C58)', fontSize: 9, letterSpacing: '0.1em' }}>
            PREVIEW
          </span>
          <span style={{ color: 'var(--tb-accent, var(--primary))', fontVariantNumeric: 'tabular-nums' }}>
            {previewText || '—'}
          </span>
        </span>
      </header>

      {/* ── Scrollable section stack ─────────────────────────────── */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
        data-testid="fmt-panel-body"
      >
        {/* 01 TYPOGRAPHY */}
        <Section index="01" title="TYPOGRAPHY">
          <SubRow label="Style">
            <TGroup>
              <TBtn disabled={disabled || isHeader} tooltip="Bold" active={fmt.bold} onClick={toggleBold}>
                <Bold size={13} strokeWidth={2} />
              </TBtn>
              <TBtn disabled={disabled || isHeader} tooltip="Italic" active={fmt.italic} onClick={toggleItalic}>
                <Italic size={13} strokeWidth={2} />
              </TBtn>
              <TBtn disabled={disabled || isHeader} tooltip="Underline" active={fmt.underline} onClick={toggleUnderline}>
                <Underline size={13} strokeWidth={2} />
              </TBtn>
            </TGroup>
          </SubRow>
          <SubRow label="Align">
            <TGroup>
              <TBtn disabled={disabled} tooltip="Left" active={fmt.horizontal === 'left'} onClick={() => toggleAlign('left')}>
                <AlignLeft size={13} strokeWidth={1.75} />
              </TBtn>
              <TBtn disabled={disabled} tooltip="Center" active={fmt.horizontal === 'center'} onClick={() => toggleAlign('center')}>
                <AlignCenter size={13} strokeWidth={1.75} />
              </TBtn>
              <TBtn disabled={disabled} tooltip="Right" active={fmt.horizontal === 'right'} onClick={() => toggleAlign('right')}>
                <AlignRight size={13} strokeWidth={1.75} />
              </TBtn>
            </TGroup>
          </SubRow>
          <SubRow label="Size">
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
              className="gc-sheet-v2"
              style={{
                width: 60, height: 24, padding: '0 8px',
                background: 'var(--tb-bg-sunken, #080B10)',
                border: '1px solid var(--tb-line-strong)',
                borderRadius: 2,
                color: 'var(--tb-ink-0)',
                fontFamily: 'var(--tb-font-mono)',
                fontSize: 11,
              }}
            />
            <span style={{ fontSize: 9, letterSpacing: '0.1em', color: 'var(--tb-ink-3)' }}>PX</span>
          </SubRow>
        </Section>

        {/* 02 COLOR */}
        <Section index="02" title="COLOR">
          <SubRow label="Text">
            <ColorPickerPopover
              disabled={disabled}
              value={fmt.color}
              icon={<Type size={11} strokeWidth={2} />}
              onChange={(c) => setTextColor(c)}
              compact
            />
          </SubRow>
          <SubRow label="Fill">
            <ColorPickerPopover
              disabled={disabled}
              value={fmt.background}
              icon={<PaintBucket size={11} strokeWidth={1.5} />}
              onChange={(c) => setBgColor(c)}
              compact
            />
          </SubRow>
        </Section>

        {/* 03 BORDER — full-width, inline. The BorderStyleEditor
            already renders a self-contained card with sides + color
            + style + weight pickers. Drop it in verbatim. */}
        <Section index="03" title="BORDER">
          <div style={{ marginTop: -4 }}>
            <BorderStyleEditor
              value={fmt.borders}
              onChange={applyBordersMap}
            />
          </div>
        </Section>

        {/* 04 VALUE FORMAT — inline expanded variant (compact={false}). */}
        <Section index="04" title="VALUE FORMAT">
          <div style={{ marginTop: -2 }}>
            <FormatterPicker
              value={fmt.valueFormatterTemplate}
              onChange={(t) => doFormat(t)}
              dataType={pickerDataType}
              compact={false}
            />
          </div>
        </Section>

        {/* 05 TEMPLATES */}
        <Section index="05" title="TEMPLATES">
          {templateList.length === 0 ? (
            <div style={{
              fontSize: 10,
              color: 'var(--tb-ink-3)',
              padding: '6px 0 10px',
              fontStyle: 'italic',
            }}>
              No saved templates yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 8 }}>
              {templateList.map((tpl) => {
                const isActive = tpl.id === activeTemplateId;
                return (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => doApplyTemplate(tpl.id)}
                    disabled={disabled}
                    data-testid={`fmt-panel-template-${tpl.id}`}
                    className="gc-tb-btn"
                    style={{
                      width: '100%',
                      height: 26,
                      justifyContent: 'flex-start',
                      padding: '0 10px',
                      background: isActive ? 'var(--tb-accent-fill)' : 'transparent',
                      color: isActive ? 'var(--tb-accent)' : 'var(--tb-ink-1)',
                      border: isActive ? '1px solid var(--tb-accent-line)' : '1px solid transparent',
                      fontSize: 11,
                      fontFamily: 'var(--tb-font-sans)',
                    }}
                  >
                    <span style={{
                      display: 'inline-block',
                      width: 6, height: 6,
                      borderRadius: '50%',
                      background: isActive ? 'var(--tb-accent)' : 'var(--tb-ink-3)',
                      marginRight: 10,
                    }} />
                    {tpl.name}
                  </button>
                );
              })}
            </div>
          )}

          {/* Save-as-template inline row */}
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="text"
              value={saveAsTplName}
              onChange={(e) => setSaveAsTplName(e.target.value)}
              placeholder="Template name…"
              disabled={disabled}
              data-testid="fmt-panel-save-tpl-input"
              className="gc-sheet-v2"
              style={{
                flex: 1, height: 26, padding: '0 8px',
                background: 'var(--tb-bg-sunken)',
                border: '1px solid var(--tb-line-strong)',
                borderRadius: 2,
                color: 'var(--tb-ink-0)',
                fontFamily: 'var(--tb-font-mono)',
                fontSize: 11,
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && saveAsTplName.trim()) {
                  const id = doSaveAsTemplate(saveAsTplName.trim());
                  if (id) { setSaveAsTplName(''); flashSaveAsTpl(); }
                }
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
              className={`gc-tb-btn ${saveAsTplConfirmed ? 'gc-tb-confirm' : ''}`}
              style={{ height: 26, padding: '0 10px', width: 'auto' }}
              title="Save current style as template"
            >
              <Plus size={12} strokeWidth={2} />
            </button>
          </div>
        </Section>
      </div>

      {/* ── Footer — clear-all action ─────────────────────────────── */}
      <footer
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          padding: '8px 14px',
          borderTop: '1px solid var(--tb-line-strong, rgba(140, 170, 200, 0.24))',
          background: 'var(--tb-bg-sunken, #080B10)',
          flexShrink: 0,
          height: 36,
        }}
      >
        <button
          type="button"
          disabled={disabled}
          onClick={doClearAllStyles}
          data-testid="fmt-panel-clear-all"
          className="gc-tb-btn"
          style={{
            height: 22,
            padding: '0 10px',
            width: 'auto',
            fontSize: 10,
            fontFamily: 'var(--tb-font-mono)',
            letterSpacing: '0.06em',
            color: 'var(--tb-red, #f87171)',
          }}
        >
          <RemoveFormatting size={12} strokeWidth={1.75} style={{ marginRight: 6 }} />
          Clear all styles
        </button>
      </footer>
    </div>
  );
}
