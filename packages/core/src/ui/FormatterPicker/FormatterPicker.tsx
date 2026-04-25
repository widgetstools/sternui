import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, Hash, Info, X } from 'lucide-react';
import { FormatDropdown, FormatPopover } from '../format-editor';
import {
  isValidExcelFormat,
  valueFormatterFromTemplate,
  type ValueFormatterTemplate,
} from '../../colDef';
import { Caps, IconInput, SubLabel } from '../SettingsPanel';
import { ExcelReferencePopover } from './ExcelReferencePopover';
import { EXCEL_EXAMPLES } from './excelExamples';
import {
  defaultSampleValue,
  findMatchingPreset,
  presetsForDataType,
  type FormatterPickerDataType,
  type FormatterPreset,
} from './presetsForDataType';

/**
 * FormatterPicker — the shared format selector. Two presentations:
 *
 *   compact  (toolbar host)   → single chip trigger that opens a
 *                               shadcn popover containing:
 *                                 • live preview of the current format
 *                                 • tiled preset grid grouped by
 *                                   category (pattern mirrors the
 *                                   IndicatorPicker)
 *                                 • custom Excel input + info button
 *                                 • "Clear" action
 *                               One toolbar slot replaces the old
 *                               preset dropdown + custom input + info
 *                               icon triple.
 *
 *   non-compact (editor hosts) → inline row: collapse chevron, preset
 *                                dropdown, custom Excel input, info
 *                                popover, live preview chip. Editors
 *                                have horizontal room to breathe, so
 *                                the inline layout stays faster to
 *                                scan than a popover.
 *
 * The value shape stays `ValueFormatterTemplate | undefined` across
 * both presentations, so hosts and downstream resolvers are unaware of
 * the UI split. Test-ids are preserved so existing tests keep working.
 */
export interface FormatterPickerProps {
  dataType: FormatterPickerDataType;
  value: ValueFormatterTemplate | undefined;
  onChange: (template: ValueFormatterTemplate | undefined) => void;
  /** Optional explicit sample value used for the live preview. Falls
   *  back to `defaultSampleValue(dataType)` when omitted. */
  sampleValue?: unknown;
  /** Start collapsed? Host-dependent. Ignored in compact mode (the
   *  trigger chip is always the collapsed form there). */
  defaultCollapsed?: boolean;
  /** Toolbar = true, editors = false. Controls the entire
   *  presentation (popover vs inline). */
  compact?: boolean;
  /**
   * Inline (non-compact) layout direction. `horizontal` (default)
   * is one row: collapse-chevron + preset + custom + info + preview.
   * `vertical` stacks: preset on top (full width), custom + info
   * below (full width), preview suppressed (the host should own a
   * preview chip elsewhere — e.g. in a panel header).
   *
   * Vertical is designed for narrow panels (≤400px) like the
   * FormattingPropertiesPanel popout, where a single-row layout
   * would overflow the column.
   */
  layout?: 'horizontal' | 'vertical';
  'data-testid'?: string;
}

/**
 * Map any host's incoming dataType into the picker's 7-valued enum.
 * Hosts that use the 4-value `ColumnDataType` can call this directly;
 * hosts that already know the fine-grained semantic (e.g. "currency")
 * can pass it through untouched.
 */
export function inferPickerDataType(
  raw: string | undefined,
): FormatterPickerDataType {
  switch (raw) {
    case 'number':
    case 'currency':
    case 'percent':
    case 'date':
    case 'datetime':
    case 'string':
    case 'boolean':
      return raw;
    case 'numeric':
      return 'number';
    default:
      return 'number';
  }
}

/** Safely render a formatter against a sample value. Swallows all errors
 *  — the preview chip is a help hint, not the source of truth. */
function renderPreview(
  template: ValueFormatterTemplate | undefined,
  sample: unknown,
): string {
  if (!template) return '';
  try {
    const fn = valueFormatterFromTemplate(template);
    return fn({ value: sample, data: {} });
  } catch {
    return '';
  }
}

/** Short caption for the compact trigger chip. Prefer the active
 *  preset's label when one is selected; fall back to a truncated
 *  format-string / token. */
function triggerCaption(
  template: ValueFormatterTemplate | undefined,
  activePreset: FormatterPreset | undefined,
): string {
  if (!template) return 'Format';
  if (activePreset) return activePreset.label;
  switch (template.kind) {
    case 'preset':
      return template.preset;
    case 'excelFormat':
      return template.format.length > 20 ? template.format.slice(0, 19) + '…' : template.format;
    case 'expression':
      return 'Custom expression';
    case 'tick':
      return template.tick.replace('TICK', '').replace('_PLUS', '+').toLowerCase();
  }
}

/**
 * Currency symbols offered by the quick-insert row above the custom
 * input. Ordered by desk frequency. `symbol` is what actually lands
 * in the Excel format string — SSF only recognises `$` and `€` as
 * bare currency characters; every other glyph has to be wrapped in
 * a quoted string literal (`"£"`, `"¥"`, `"₹"`, `"CHF "`) so SSF
 * emits it verbatim without trying to interpret it as a format code.
 */
const CURRENCY_QUICK_INSERT: ReadonlyArray<{ label: string; symbol: string; aria: string }> = [
  { label: '$', symbol: '$', aria: 'US dollar' },
  { label: '€', symbol: '€', aria: 'Euro' },
  { label: '£', symbol: '"£"', aria: 'British pound' },
  { label: '¥', symbol: '"¥"', aria: 'Japanese yen' },
  { label: '₹', symbol: '"₹"', aria: 'Indian rupee' },
  { label: 'CHF', symbol: '"CHF "', aria: 'Swiss franc' },
];

/** Regex matching any currency symbol we know about, including quoted
 *  literal variants. The outer alternation tries the quoted forms
 *  first so e.g. `"£"` is consumed as a single token instead of the
 *  inner `£`. */
const CURRENCY_SYMBOL_RE = /("£"|"¥"|"₹"|"[A-Z]{3} ?"|[$€])/;

/**
 * Insert `symbol` into the current Excel format string. Behaviour:
 *   1. Contains a currency symbol we recognise → swap every occurrence.
 *      Excel two-section formats (positive;negative) carry the symbol
 *      in both sections; swapping both keeps the format consistent.
 *   2. Non-empty format, no symbol → prepend the symbol.
 *   3. Empty → seed `${symbol}#,##0.00` as a sensible default.
 *
 * Pure function so the popover's click handler stays short.
 */
function applyCurrencySymbol(current: string, symbol: string): string {
  const trimmed = current.trim();
  if (!trimmed) return `${symbol}#,##0.00`;
  if (CURRENCY_SYMBOL_RE.test(trimmed)) {
    return trimmed.replace(new RegExp(CURRENCY_SYMBOL_RE.source, 'g'), symbol);
  }
  return `${symbol}${trimmed}`;
}

/** Category labels for the popover's preset tile grid. Covers every
 *  `group` key in `presetsForDataType`. */
const GROUP_LABELS: Record<string, string> = {
  number: 'Number',
  decimals: 'Decimals',
  negatives: 'Negatives',
  scientific: 'Scientific',
  bps: 'Basis points',
  tick: 'Fixed-income tick',
  currency: 'Currency',
  percent: 'Percent',
  date: 'Date',
  datetime: 'Date + time',
  string: 'String',
  boolean: 'Boolean',
};

/**
 * Derive a category key for a preset from its id. The preset catalog
 * isn't explicitly tagged, so group by id-prefix:
 *   num-*        → 'number' / 'decimals' / 'negatives' / 'scientific' / 'bps'
 *   tick-*       → 'tick'
 *   cur-*        → 'currency'
 *   pct-*        → 'percent'
 *   date-/dt-*   → 'date' / 'datetime'
 *   str-*        → 'string'
 *   bool-*       → 'boolean'
 *
 * Groupings within 'number' are refined so the popover can show
 * related presets together (e.g. all the green/red variants under
 * 'Negatives' rather than scattered through 'Number').
 */
function groupKeyForPreset(p: FormatterPreset): string {
  const id = p.id;
  if (id.startsWith('tick-')) return 'tick';
  if (id.startsWith('cur-')) return 'currency';
  if (id.startsWith('pct-')) return 'percent';
  if (id.startsWith('date-')) return 'date';
  if (id.startsWith('dt-')) return 'datetime';
  if (id.startsWith('str-')) return 'string';
  if (id.startsWith('bool-')) return 'boolean';
  if (id.startsWith('num-')) {
    if (/neg|green-red/.test(id)) return 'negatives';
    if (/scientific/.test(id)) return 'scientific';
    if (/bps/.test(id)) return 'bps';
    return /\d/.test(id) || /integer/.test(id) ? 'decimals' : 'number';
  }
  return 'number';
}

export function FormatterPicker({
  dataType,
  value,
  onChange,
  sampleValue,
  defaultCollapsed = false,
  compact = false,
  layout = 'horizontal',
  'data-testid': testId,
}: FormatterPickerProps) {
  const presets = useMemo(() => presetsForDataType(dataType), [dataType]);
  const activePreset = useMemo(() => findMatchingPreset(dataType, value), [dataType, value]);
  const sample = sampleValue !== undefined ? sampleValue : defaultSampleValue(dataType);

  // Custom-input draft — source of truth stays the committed template,
  // but while the user is typing we hold the working string so a
  // validation error doesn't thrash the input.
  const excelFromTemplate = value?.kind === 'excelFormat' ? value.format : '';
  const [draftExcel, setDraftExcel] = useState(excelFromTemplate);
  const lastCommittedRef = useRef(excelFromTemplate);
  useEffect(() => {
    if (value?.kind !== 'excelFormat' || value.format !== lastCommittedRef.current) {
      const nextText = value?.kind === 'excelFormat' ? value.format : '';
      setDraftExcel(nextText);
      lastCommittedRef.current = nextText;
    }
  }, [value]);

  const isExcelValid = draftExcel.length === 0 || isValidExcelFormat(draftExcel);

  const commitExcel = useCallback(
    (format: string) => {
      const trimmed = format.trim();
      lastCommittedRef.current = trimmed;
      if (!trimmed) {
        onChange(undefined);
        return;
      }
      if (!isValidExcelFormat(trimmed)) return;
      onChange({ kind: 'excelFormat', format: trimmed });
    },
    [onChange],
  );

  const pickPreset = useCallback(
    (preset: FormatterPreset) => {
      onChange(preset.template);
      if (preset.template.kind === 'excelFormat') {
        setDraftExcel(preset.template.format);
        lastCommittedRef.current = preset.template.format;
      } else {
        setDraftExcel('');
        lastCommittedRef.current = '';
      }
    },
    [onChange],
  );

  const preview = useMemo(() => {
    const presetSample =
      activePreset?.sampleValue !== undefined ? activePreset.sampleValue : sample;
    return renderPreview(value, presetSample);
  }, [value, activePreset, sample]);

  // ── Compact mode: single chip → popover ────────────────────────────────
  if (compact) {
    return (
      <CompactFormatterPicker
        value={value}
        onChange={onChange}
        presets={presets}
        activePreset={activePreset}
        preview={preview}
        draftExcel={draftExcel}
        setDraftExcel={setDraftExcel}
        isExcelValid={isExcelValid}
        commitExcel={commitExcel}
        pickPreset={pickPreset}
        dataType={dataType}
        testId={testId}
      />
    );
  }

  // ── Non-compact (editors): inline expanded form ────────────────────────
  // Kept intentionally unchanged — editors have room for the full layout
  // and the inline row scans faster than a popover in a dense settings panel.
  return (
    <InlineFormatterPicker
      value={value}
      onChange={onChange}
      presets={presets}
      activePreset={activePreset}
      preview={preview}
      draftExcel={draftExcel}
      setDraftExcel={setDraftExcel}
      isExcelValid={isExcelValid}
      commitExcel={commitExcel}
      pickPreset={pickPreset}
      dataType={dataType}
      defaultCollapsed={defaultCollapsed}
      layout={layout}
      testId={testId}
    />
  );
}

// ─── Compact (toolbar) presentation ─────────────────────────────────────

interface SharedBodyProps {
  value: ValueFormatterTemplate | undefined;
  onChange: (template: ValueFormatterTemplate | undefined) => void;
  presets: ReadonlyArray<FormatterPreset>;
  activePreset: FormatterPreset | undefined;
  preview: string;
  draftExcel: string;
  setDraftExcel: (next: string) => void;
  isExcelValid: boolean;
  commitExcel: (format: string) => void;
  pickPreset: (preset: FormatterPreset) => void;
  dataType: FormatterPickerDataType;
  testId?: string;
}

function CompactFormatterPicker({
  value,
  onChange,
  presets,
  activePreset,
  preview,
  draftExcel,
  setDraftExcel,
  isExcelValid,
  commitExcel,
  pickPreset,
  dataType,
  testId,
}: SharedBodyProps) {
  const groups = useMemo(() => {
    const grouped: Record<string, FormatterPreset[]> = {};
    for (const p of presets) {
      const g = groupKeyForPreset(p);
      (grouped[g] ??= []).push(p);
    }
    return grouped;
  }, [presets]);

  return (
    <FormatPopover
      width={360}
      trigger={
        <button
          type="button"
          title="Value formatter"
          data-testid={testId ? `${testId}-trigger` : undefined}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            height: 26,
            padding: '0 8px',
            background: 'var(--ck-bg, var(--bn-bg))',
            border: `1px solid ${
              value ? 'var(--ck-green-dim, var(--bn-border))' : 'var(--ck-border-hi, var(--bn-border))'
            }`,
            borderRadius: 2,
            color: value ? 'var(--ck-green, var(--bn-blue))' : 'var(--ck-t0, var(--bn-t0))',
            fontFamily: 'var(--ck-font-sans, "IBM Plex Sans", sans-serif)',
            fontSize: 11,
            cursor: 'pointer',
            transition: 'background 120ms, border-color 120ms, color 120ms',
          }}
        >
          <Hash size={12} strokeWidth={1.75} style={{ opacity: 0.7 }} />
          <span
            style={{
              maxWidth: 140,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              fontFamily:
                activePreset || !value
                  ? 'var(--ck-font-sans, sans-serif)'
                  : 'var(--ck-font-mono, monospace)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {triggerCaption(value, activePreset)}
          </span>
          <ChevronDown size={11} strokeWidth={1.75} style={{ opacity: 0.5 }} />
        </button>
      }
    >
      <div
        data-testid={testId}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          fontFamily: 'var(--ck-font-sans, "IBM Plex Sans", sans-serif)',
          padding: 2,
        }}
      >
        {/* Top bar — current / preview / clear */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <SubLabel>CURRENT</SubLabel>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              height: 22,
              padding: '0 8px',
              background: preview
                ? 'var(--ck-green-bg, color-mix(in srgb, var(--bn-blue) 10%, transparent))'
                : 'var(--ck-bg, var(--bn-bg))',
              border: `1px dashed ${
                preview ? 'var(--ck-green-dim, var(--bn-border))' : 'var(--ck-border-hi, var(--bn-border))'
              }`,
              borderRadius: 2,
              color: preview ? 'var(--ck-green, var(--bn-blue))' : 'var(--ck-t3)',
              fontFamily: 'var(--ck-font-mono, monospace)',
              fontSize: 11,
              fontVariantNumeric: 'tabular-nums',
              flex: 1,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
            title={preview || 'No formatter applied'}
          >
            {preview || '—'}
          </span>
          <button
            type="button"
            onClick={() => {
              setDraftExcel('');
              onChange(undefined);
            }}
            disabled={!value}
            title="Clear formatter"
            data-testid={testId ? `${testId}-clear` : undefined}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 22,
              height: 22,
              padding: 0,
              background: 'transparent',
              border: '1px solid var(--ck-border-hi, var(--bn-border))',
              borderRadius: 2,
              color: value ? 'var(--ck-red, var(--bn-red))' : 'var(--ck-t3)',
              cursor: value ? 'pointer' : 'default',
              opacity: value ? 1 : 0.4,
            }}
          >
            <X size={11} strokeWidth={2} />
          </button>
        </div>

        {/* Preset tile grid, grouped by category */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            maxHeight: 360,
            overflowY: 'auto',
            paddingRight: 2,
            scrollbarColor: 'var(--gc-border, #313944) transparent',
            scrollbarWidth: 'thin',
          }}
        >
          {Object.entries(groups).map(([groupKey, items]) => (
            <div key={groupKey}>
              <SubLabel>{GROUP_LABELS[groupKey] ?? groupKey.toUpperCase()}</SubLabel>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: 4,
                  marginTop: 4,
                }}
              >
                {items.map((p) => {
                  const active = activePreset?.id === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => pickPreset(p)}
                      title={p.hint ? `${p.label} · ${p.hint}` : p.label}
                      data-testid={testId ? `${testId}-preset-${p.id}` : undefined}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        gap: 2,
                        padding: '6px 8px',
                        background: active
                          ? 'var(--ck-green-bg, color-mix(in srgb, var(--bn-blue) 14%, transparent))'
                          : 'var(--ck-bg, var(--bn-bg))',
                        border: `1px solid ${
                          active ? 'var(--ck-green, var(--bn-blue))' : 'var(--ck-border-hi, var(--bn-border))'
                        }`,
                        borderRadius: 2,
                        color: active ? 'var(--ck-green, var(--bn-blue))' : 'var(--ck-t0, var(--bn-t0))',
                        cursor: 'pointer',
                        textAlign: 'left',
                        fontFamily: 'inherit',
                        fontSize: 11,
                      }}
                    >
                      <span style={{ fontWeight: 600, lineHeight: 1.1 }}>{p.label}</span>
                      {p.hint ? (
                        <span
                          style={{
                            fontFamily: 'var(--ck-font-mono, monospace)',
                            fontSize: 9,
                            color: active ? 'var(--ck-green, var(--bn-blue))' : 'var(--ck-t3)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            maxWidth: '100%',
                          }}
                        >
                          {p.hint}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {presets.length === 0 ? (
            <Caps size={10} color="var(--ck-t3)">
              No presets for this data type — use the custom format below.
            </Caps>
          ) : null}
        </div>

        <div style={{ height: 1, background: 'var(--ck-border, var(--bn-border))' }} />

        {/* Custom Excel input + info */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <SubLabel>Custom Excel format</SubLabel>

          {/* Currency symbol quick-insert — one click swaps the symbol
               in the current format, or seeds `${symbol}#,##0.00` if
               the input is empty. Saves users from hunting for the
               right keyboard shortcut (especially ₹ / €). */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              flexWrap: 'wrap',
            }}
          >
            <Caps size={9} color="var(--ck-t3)" style={{ paddingRight: 4 }}>
              SYMBOL
            </Caps>
            {CURRENCY_QUICK_INSERT.map((c) => (
              <button
                key={c.symbol}
                type="button"
                title={`Insert ${c.aria}`}
                aria-label={`Insert ${c.aria}`}
                data-testid={testId ? `${testId}-currency-${c.label.toLowerCase()}` : undefined}
                onClick={() => {
                  const next = applyCurrencySymbol(draftExcel, c.symbol);
                  setDraftExcel(next);
                  commitExcel(next);
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: 26,
                  height: 22,
                  padding: '0 6px',
                  background: 'var(--ck-bg, var(--bn-bg))',
                  border: '1px solid var(--ck-border-hi, var(--bn-border))',
                  borderRadius: 2,
                  color: 'var(--ck-t0, var(--bn-t0))',
                  cursor: 'pointer',
                  fontFamily: 'var(--ck-font-mono, monospace)',
                  fontSize: 11,
                  lineHeight: 1,
                  transition: 'background 100ms, border-color 100ms',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background =
                    'var(--ck-surface-hover, var(--bn-bg3))';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background =
                    'var(--ck-bg, var(--bn-bg))';
                }}
              >
                {c.label}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ flex: 1 }}>
              <IconInput
                icon={<Hash size={12} strokeWidth={2} />}
                value={draftExcel}
                onChange={(v) => {
                  setDraftExcel(v);
                  const trimmed = v.trim();
                  if (!trimmed) {
                    if (value?.kind === 'excelFormat') onChange(undefined);
                    return;
                  }
                  if (isValidExcelFormat(trimmed)) {
                    onChange({ kind: 'excelFormat', format: trimmed });
                  }
                }}
                onCommit={commitExcel}
                monospace
                placeholder={
                  dataType === 'date' || dataType === 'datetime' ? 'yyyy-mm-dd' : '#,##0.00'
                }
                error={!isExcelValid}
                data-testid={testId ? `${testId}-excel` : undefined}
              />
            </div>
            <ExcelReferencePopover
              onPick={(format) => {
                setDraftExcel(format);
                commitExcel(format);
              }}
              data-testid={testId ? `${testId}-info` : undefined}
            />
          </div>
          <Caps size={9} color="var(--ck-t3)">
            {EXCEL_EXAMPLES.length} categories of example formats in the{' '}
            <Info size={9} strokeWidth={2} style={{ display: 'inline', verticalAlign: 'middle' }} />{' '}
            reference.
          </Caps>
        </div>
      </div>
    </FormatPopover>
  );
}

// ─── Non-compact (editor) presentation ──────────────────────────────────
//
// Inline layout unchanged from the previous implementation — editors
// have the vertical + horizontal room for a full row of controls, and
// the inline form scans faster than opening a popover on every format
// tweak inside a dense settings panel.

function InlineFormatterPicker({
  value,
  onChange,
  presets,
  activePreset,
  preview,
  draftExcel,
  setDraftExcel,
  isExcelValid,
  commitExcel,
  pickPreset,
  dataType,
  defaultCollapsed,
  layout = 'horizontal',
  testId,
}: SharedBodyProps & { defaultCollapsed: boolean; layout?: 'horizontal' | 'vertical' }) {
  const [expanded, setExpanded] = useState(!defaultCollapsed);
  const rowHeight = 28;

  // Vertical layout: stack preset on top, custom input + info below.
  // No collapse chevron (the host section is always-expanded in this
  // layout). No inline preview (host header owns that). Everything
  // full-width so it fits a narrow (≤360px) column without overflow.
  if (layout === 'vertical') {
    return (
      <div
        data-testid={testId}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          width: '100%',
        }}
      >
        {/* Preset row — full-width dropdown trigger */}
        <FormatDropdown<string>
          value={activePreset?.id ?? ''}
          onChange={(id) => {
            const match = presets.find((p) => p.id === id);
            if (match) pickPreset(match);
          }}
          options={presets.map((p) => ({
            value: p.id,
            label: p.hint ? `${p.label} — ${p.hint}` : p.label,
          }))}
          width={280}
          trigger={
            <button
              type="button"
              title="Presets"
              data-testid={testId ? `${testId}-preset` : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                width: '100%',
                height: rowHeight,
                padding: '0 8px 0 10px',
                background: 'var(--bn-bg)',
                border: '1px solid var(--bn-border)',
                borderRadius: 3,
                color: 'var(--bn-t0)',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: 11,
                letterSpacing: '0.02em',
              }}
            >
              <span
                style={{
                  flex: 1,
                  textAlign: 'left',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {activePreset?.label ?? 'Preset…'}
              </span>
              <ChevronDown size={12} strokeWidth={1.75} style={{ opacity: 0.6 }} />
            </button>
          }
        />

        {/* Custom format row — input grows, info tooltip pinned right */}
        <div style={{ display: 'flex', gap: 6, width: '100%' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <IconInput
              icon={<Hash size={12} strokeWidth={2} />}
              value={draftExcel}
              onChange={(v) => {
                setDraftExcel(v);
                const trimmed = v.trim();
                if (!trimmed) {
                  if (value?.kind === 'excelFormat') onChange(undefined);
                  return;
                }
                if (isValidExcelFormat(trimmed)) {
                  onChange({ kind: 'excelFormat', format: trimmed });
                }
              }}
              onCommit={commitExcel}
              monospace
              placeholder={dataType === 'date' || dataType === 'datetime' ? 'yyyy-mm-dd' : '#,##0.00'}
              error={!isExcelValid}
              data-testid={testId ? `${testId}-excel` : undefined}
            />
          </div>
          <ExcelReferencePopover
            onPick={(format) => {
              setDraftExcel(format);
              commitExcel(format);
            }}
            data-testid={testId ? `${testId}-info` : undefined}
          />
        </div>
      </div>
    );
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        title="Expand format picker"
        data-testid={testId ? `${testId}-collapsed` : undefined}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          height: 28,
          padding: '0 8px',
          background: 'var(--ck-bg, var(--bn-bg))',
          border: '1px solid var(--ck-border-hi, var(--bn-border))',
          borderRadius: 2,
          color: 'var(--ck-t0, var(--bn-t0))',
          fontFamily: 'var(--ck-font-sans, "IBM Plex Sans", sans-serif)',
          fontSize: 11,
          cursor: 'pointer',
          transition: 'background 120ms, border-color 120ms',
        }}
      >
        <Hash size={12} strokeWidth={1.75} style={{ opacity: 0.6 }} />
        <span
          style={{
            maxWidth: 140,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            fontFamily: 'var(--ck-font-mono, monospace)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {triggerCaption(value, activePreset)}
        </span>
        <ChevronDown size={11} strokeWidth={1.75} style={{ opacity: 0.5 }} />
      </button>
    );
  }

  return (
    <div
      data-testid={testId}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: 4,
        background: 'var(--ck-card, transparent)',
        border: '1px solid var(--ck-border, var(--bn-border))',
        borderRadius: 2,
        fontFamily: 'var(--ck-font-sans, "IBM Plex Sans", sans-serif)',
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded(false)}
        title="Collapse"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: rowHeight,
          height: rowHeight,
          padding: 0,
          background: 'transparent',
          border: 'none',
          color: 'var(--ck-t2, var(--bn-t2))',
          cursor: 'pointer',
        }}
      >
        <ChevronLeft size={12} strokeWidth={1.75} />
      </button>

      <FormatDropdown<string>
        value={activePreset?.id ?? ''}
        onChange={(id) => {
          const match = presets.find((p) => p.id === id);
          if (match) pickPreset(match);
        }}
        options={presets.map((p) => ({
          value: p.id,
          label: p.hint ? `${p.label} — ${p.hint}` : p.label,
        }))}
        width={240}
        trigger={
          <button
            type="button"
            title="Presets"
            data-testid={testId ? `${testId}-preset` : undefined}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              height: rowHeight,
              minWidth: 120,
              maxWidth: 240,
              padding: '0 6px 0 10px',
              background: 'var(--ck-bg, var(--bn-bg))',
              border: '1px solid var(--ck-border-hi, var(--bn-border))',
              borderRadius: 2,
              color: 'var(--ck-t0, var(--bn-t0))',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: 11,
              letterSpacing: '0.02em',
            }}
          >
            <span
              style={{
                flex: 1,
                textAlign: 'left',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {activePreset?.label ?? 'Preset…'}
            </span>
            <ChevronDown size={12} strokeWidth={1.75} style={{ opacity: 0.6 }} />
          </button>
        }
      />

      <div style={{ width: 180 }}>
        <IconInput
          icon={<Hash size={12} strokeWidth={2} />}
          value={draftExcel}
          onChange={(v) => {
            setDraftExcel(v);
            const trimmed = v.trim();
            if (!trimmed) {
              if (value?.kind === 'excelFormat') onChange(undefined);
              return;
            }
            if (isValidExcelFormat(trimmed)) {
              onChange({ kind: 'excelFormat', format: trimmed });
            }
          }}
          onCommit={commitExcel}
          monospace
          placeholder={dataType === 'date' || dataType === 'datetime' ? 'yyyy-mm-dd' : '#,##0.00'}
          error={!isExcelValid}
          data-testid={testId ? `${testId}-excel` : undefined}
        />
      </div>

      <ExcelReferencePopover
        onPick={(format) => {
          setDraftExcel(format);
          commitExcel(format);
        }}
        data-testid={testId ? `${testId}-info` : undefined}
      />

      {preview ? (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            height: rowHeight,
            padding: '0 8px',
            background: 'var(--ck-green-bg, color-mix(in srgb, var(--bn-blue) 10%, transparent))',
            border: '1px dashed var(--ck-green-dim, var(--bn-border))',
            borderRadius: 2,
            color: 'var(--ck-green, var(--bn-blue))',
            fontFamily: 'var(--ck-font-mono, monospace)',
            fontSize: 11,
            fontVariantNumeric: 'tabular-nums',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: 180,
          }}
          title={`Preview: ${preview}`}
        >
          <Caps size={9} color="var(--ck-green)">
            PREVIEW
          </Caps>
          {preview}
        </span>
      ) : null}
    </div>
  );
}
