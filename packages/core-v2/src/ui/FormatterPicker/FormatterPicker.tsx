import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Hash } from 'lucide-react';
import { FormatDropdown } from '@grid-customizer/core';
import { isValidExcelFormat } from '../../modules/column-customization/adapters/excelFormatter';
import { valueFormatterFromTemplate } from '../../modules/column-customization/adapters/valueFormatterFromTemplate';
import type { ValueFormatterTemplate } from '../../modules/column-customization/state';
import { Caps, IconInput } from '../SettingsPanel';
import { ExcelReferencePopover } from './ExcelReferencePopover';
import {
  defaultSampleValue,
  findMatchingPreset,
  presetsForDataType,
  type FormatterPickerDataType,
  type FormatterPreset,
} from './presetsForDataType';

/**
 * FormatterPicker — the shared, horizontally-collapsible format
 * selector. Embedded in three hosts:
 *
 *   - FormattingToolbar (applies to selected columns).
 *   - Style Rule editor (single-cell rules only).
 *   - Calculated Column editor (sets the virtual column's display).
 *
 * The value is a `ValueFormatterTemplate | undefined` — same shape
 * that every downstream resolver (cell renderer, rule, virtual col)
 * already consumes. The picker never owns its own bespoke format
 * string; everything routes through the template union so persistence
 * and rendering stay coherent.
 *
 * Collapse animates WIDTH, not height, to preserve toolbar row
 * alignment. Collapsed state is local per instance (no profile
 * persistence) — hosts can pass `defaultCollapsed` to match their own
 * density. Each host's collapse state is therefore independent.
 */
export interface FormatterPickerProps {
  dataType: FormatterPickerDataType;
  value: ValueFormatterTemplate | undefined;
  onChange: (template: ValueFormatterTemplate | undefined) => void;
  /** Optional explicit sample value used for the live preview. Falls
   *  back to `defaultSampleValue(dataType)` when omitted. */
  sampleValue?: unknown;
  /** Start collapsed? Host-dependent; picker defaults to expanded in
   *  editors and collapsed in the toolbar (host passes the flag). */
  defaultCollapsed?: boolean;
  /** Compact chrome for dense surfaces (toolbar). Editors can pass
   *  `false` for a slightly larger footprint. */
  compact?: boolean;
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

/** Trim trailing `%` / `$` when converting a custom Excel string into
 *  a stable display caption. Used ONLY for the collapsed-trigger text. */
function compactCaption(template: ValueFormatterTemplate | undefined): string {
  if (!template) return '—';
  switch (template.kind) {
    case 'preset':
      return template.preset;
    case 'excelFormat':
      return template.format.length > 18 ? template.format.slice(0, 17) + '…' : template.format;
    case 'expression':
      return 'expr';
    case 'tick':
      return template.tick.replace('TICK', '').replace('_PLUS', '+').toLowerCase();
  }
}

export function FormatterPicker({
  dataType,
  value,
  onChange,
  sampleValue,
  defaultCollapsed = false,
  compact = false,
  'data-testid': testId,
}: FormatterPickerProps) {
  const [expanded, setExpanded] = useState(!defaultCollapsed);
  const presets = useMemo(() => presetsForDataType(dataType), [dataType]);
  const activePreset = useMemo(() => findMatchingPreset(dataType, value), [dataType, value]);
  const sample = sampleValue !== undefined ? sampleValue : defaultSampleValue(dataType);

  // Custom-input local state: the source of truth is the committed
  // template, but while the user is typing we hold the working string
  // so validation errors don't cause a state thrash between renders.
  const excelFromTemplate =
    value?.kind === 'excelFormat' ? value.format : '';
  const [draftExcel, setDraftExcel] = useState(excelFromTemplate);
  const lastCommittedRef = useRef(excelFromTemplate);
  useEffect(() => {
    // Keep the input in sync when the template changes from outside
    // (e.g. a preset click or a profile reload).
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
      if (!isValidExcelFormat(trimmed)) return; // block invalid; stay with draft
      onChange({ kind: 'excelFormat', format: trimmed });
    },
    [onChange],
  );

  const pickPreset = useCallback(
    (preset: FormatterPreset) => {
      onChange(preset.template);
      // Populate the custom input with the Excel equivalent when
      // possible so the user sees (and can tweak) the underlying
      // expression. Tick / expression presets are not round-trippable
      // into Excel syntax, so we leave the input blank for those.
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

  // ── Collapsed ───────────────────────────────────────────────────────────
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
          height: compact ? 26 : 28,
          padding: '0 8px',
          background: 'var(--ck-bg, var(--background))',
          border: '1px solid var(--ck-border-hi, var(--border))',
          borderRadius: 2,
          color: 'var(--ck-t0, var(--foreground))',
          fontFamily: 'var(--ck-font-sans, "IBM Plex Sans", sans-serif)',
          fontSize: 11,
          cursor: 'pointer',
          transition: 'background 120ms, border-color 120ms',
        }}
      >
        <Hash size={12} strokeWidth={1.75} style={{ opacity: 0.6 }} />
        <span
          style={{
            maxWidth: 120,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            fontFamily: 'var(--ck-font-mono, monospace)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {compactCaption(value)}
        </span>
        {preview ? (
          <Caps size={9} color="var(--ck-t3)">
            = {preview.length > 14 ? preview.slice(0, 13) + '…' : preview}
          </Caps>
        ) : null}
        <ChevronRight size={11} strokeWidth={1.75} style={{ opacity: 0.5 }} />
      </button>
    );
  }

  // ── Expanded ────────────────────────────────────────────────────────────
  const rowHeight = compact ? 26 : 28;
  return (
    <div
      data-testid={testId}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: compact ? 2 : 4,
        background: 'var(--ck-card, transparent)',
        border: compact ? 'none' : '1px solid var(--ck-border, var(--border))',
        borderRadius: 2,
        fontFamily: 'var(--ck-font-sans, "IBM Plex Sans", sans-serif)',
      }}
    >
      {/* Collapse affordance */}
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
          color: 'var(--ck-t2, var(--muted-foreground))',
          cursor: 'pointer',
        }}
      >
        <ChevronLeft size={12} strokeWidth={1.75} />
      </button>

      {/* Preset dropdown */}
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
              padding: '0 6px 0 10px',
              background: 'var(--ck-bg, var(--background))',
              border: '1px solid var(--ck-border-hi, var(--border))',
              borderRadius: 2,
              color: 'var(--ck-t0, var(--foreground))',
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

      {/* Custom Excel input */}
      <div style={{ width: compact ? 150 : 180 }}>
        <IconInput
          icon={<Hash size={12} strokeWidth={2} />}
          value={draftExcel}
          onChange={(v) => {
            setDraftExcel(v);
            // Opportunistic commit on every keystroke WHEN valid so the
            // grid updates live. Invalid intermediate states stay local.
            const trimmed = v.trim();
            if (!trimmed) {
              // Clearing the input clears the formatter — but only when
              // the template was excelFormat; preserving preset / tick
              // picks while the input is empty would be confusing.
              if (value?.kind === 'excelFormat') onChange(undefined);
              return;
            }
            if (isValidExcelFormat(trimmed)) {
              onChange({ kind: 'excelFormat', format: trimmed });
              lastCommittedRef.current = trimmed;
            }
          }}
          onCommit={commitExcel}
          monospace
          placeholder={dataType === 'date' || dataType === 'datetime' ? 'yyyy-mm-dd' : '#,##0.00'}
          error={!isExcelValid}
          data-testid={testId ? `${testId}-excel` : undefined}
        />
      </div>

      {/* Info popover */}
      <ExcelReferencePopover
        onPick={(format) => {
          setDraftExcel(format);
          commitExcel(format);
        }}
        data-testid={testId ? `${testId}-info` : undefined}
      />

      {/* Live preview chip */}
      {preview ? (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            height: rowHeight,
            padding: '0 8px',
            background: 'var(--ck-green-bg, color-mix(in srgb, var(--primary) 10%, transparent))',
            border: '1px dashed var(--ck-green-dim, var(--border))',
            borderRadius: 2,
            color: 'var(--ck-green, var(--primary))',
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
