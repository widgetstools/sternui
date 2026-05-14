import { useMemo } from 'react';
import { Check, ChevronDown, Hash, Info, X } from 'lucide-react';
import { isValidExcelFormat } from '@starui/core';
import { FormatPopover } from '../format-editor';
import { Caps, IconInput, SubLabel } from '../SettingsPanel';
import { ExcelReferencePopover } from './ExcelReferencePopover';
import { EXCEL_EXAMPLES } from './excelExamples';
import { CURRENCY_QUICK_INSERT, applyCurrencySymbol } from './currencyQuickInsert';
import { GROUP_LABELS, groupKeyForPreset } from './presetGroups';
import { triggerCaption, type SharedBodyProps } from './formatterPickerShared';
import type { FormatterPreset } from './presetsForDataType';

/**
 * Compact (toolbar) presentation of FormatterPicker.
 *
 * Single chip trigger that opens a shadcn popover containing:
 *   • live preview of the current format
 *   • tiled preset grid grouped by category (pattern mirrors the
 *     IndicatorPicker)
 *   • currency-symbol quick-insert row
 *   • custom Excel input + apply/clear/info actions
 *
 * One toolbar slot replaces the old preset dropdown + custom input +
 * info icon triple.
 */
export function CompactFormatterPicker({
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
            background: 'var(--ds-surface-ground)',
            border: `1px solid ${
              value ? 'var(--ds-border-secondary)' : 'var(--ds-border-primary)'
            }`,
            borderRadius: 2,
            color: value ? 'var(--ds-primary)' : 'var(--ds-text-primary)',
            fontFamily: 'var(--ds-font-sans)',
            fontSize: 11,
            cursor: 'pointer',
            transition: 'background 120ms, border-color 120ms, color 120ms',
          }}
        >
          <Hash size={12} strokeWidth={1.75} className="opacity-70" />
          <span
            style={{
              maxWidth: 140,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              fontFamily:
                activePreset || !value
                  ? 'var(--ds-font-sans)'
                  : 'var(--ds-font-mono)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {triggerCaption(value, activePreset)}
          </span>
          <ChevronDown size={11} strokeWidth={1.75} className="opacity-50" />
        </button>
      }
    >
      {({ close }) => (
      <div
        data-testid={testId}
        className="flex-1 min-h-0 flex flex-col gap-2.5 font-sans p-0.5"
      >
        {/* Top bar — current / preview / clear (fixed-height shrinker) */}
        <div className="flex items-center gap-2 shrink-0">
          <SubLabel>CURRENT</SubLabel>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              height: 22,
              padding: '0 8px',
              background: preview
                ? 'var(--ds-primary-soft)'
                : 'var(--ds-surface-ground)',
              border: `1px dashed ${
                preview ? 'var(--ds-border-secondary)' : 'var(--ds-border-primary)'
              }`,
              borderRadius: 2,
              color: preview ? 'var(--ds-primary)' : 'var(--ds-text-faint)',
              fontFamily: 'var(--ds-font-mono)',
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
              border: '1px solid var(--ds-border-secondary)',
              borderRadius: 2,
              color: value ? 'var(--ds-accent-negative)' : 'var(--ds-text-faint)',
              cursor: value ? 'pointer' : 'default',
              opacity: value ? 1 : 0.4,
            }}
          >
            <X size={11} strokeWidth={2} />
          </button>
        </div>

        {/* Preset tile grid — the single scrollable region of the
            popover. `flex: 1` + `min-height: 0` lets it grow to fill
            the popover height between the fixed CURRENT bar above and
            the divider+custom-Excel block below; if it still overflows
            the available space, only THIS section scrolls. */}
        <div
          className="flex-1 min-h-0 flex flex-col gap-2 overflow-y-auto pr-0.5"
          style={{ scrollbarColor: 'var(--ds-border-primary) transparent', scrollbarWidth: 'thin' }}
        >
          {Object.entries(groups).map(([groupKey, items]) => (
            <div key={groupKey}>
              <SubLabel>{GROUP_LABELS[groupKey] ?? groupKey.toUpperCase()}</SubLabel>
              <div className="grid grid-cols-2 gap-1 mt-1">
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
                          ? 'var(--ds-primary-soft)'
                          : 'var(--ds-surface-ground)',
                        border: `1px solid ${
                          active ? 'var(--ds-primary)' : 'var(--ds-border-primary)'
                        }`,
                        borderRadius: 2,
                        color: active ? 'var(--ds-primary)' : 'var(--ds-text-primary)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        fontFamily: 'inherit',
                        fontSize: 11,
                      }}
                    >
                      <span className="font-semibold leading-[1.1]">{p.label}</span>
                      {p.hint ? (
                        <span
                          style={{
                            fontFamily: 'var(--ds-font-mono)',
                            fontSize: 10,
                            color: active ? 'var(--ds-primary)' : 'var(--ds-text-faint)',
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
            <Caps size={10} color="var(--ds-text-faint)">
              No presets for this data type — use the custom format below.
            </Caps>
          ) : null}
        </div>

        <div className="h-px bg-border shrink-0" />

        {/* Custom Excel input + info (fixed-height shrinker — never collapses) */}
        <div className="flex flex-col gap-1 shrink-0">
          <SubLabel>Custom Excel format</SubLabel>

          {/* Currency symbol quick-insert — one click swaps the symbol
               in the current format, or seeds `${symbol}#,##0.00` if
               the input is empty. Saves users from hunting for the
               right keyboard shortcut (especially ₹ / €). */}
          <div className="flex items-center gap-1 flex-wrap">
            <Caps size={9} color="var(--ds-text-faint)" style={{ paddingRight: 4 }}>
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
                  background: 'var(--ds-surface-ground)',
                  border: '1px solid var(--ds-border-primary)',
                  borderRadius: 2,
                  color: 'var(--ds-text-primary)',
                  cursor: 'pointer',
                  fontFamily: 'var(--ds-font-mono)',
                  fontSize: 11,
                  lineHeight: 1,
                  transition: 'background 100ms, border-color 100ms',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background =
                    'var(--ds-surface-tertiary)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background =
                    'var(--ds-surface-ground)';
                }}
              >
                {c.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <div className="flex-1">
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
            {/* Apply — commits the current draft and dismisses the popover.
             *  Disabled when the input is empty or syntactically invalid;
             *  the user shouldn't be able to "apply" nothing or a parse-fail. */}
            <ApplyOrClearButton
              icon={<Check size={12} strokeWidth={2.25} />}
              title="Apply format"
              accent="green"
              disabled={!draftExcel.trim() || !isExcelValid}
              data-testid={testId ? `${testId}-apply` : undefined}
              onClick={() => {
                commitExcel(draftExcel);
                close();
              }}
            />
            {/* Clear — wipes the draft AND the committed formatter. Mirrors
             *  the top-bar X but lives next to the input so the user
             *  doesn't have to scroll past the preset grid to reset.
             *  Stays open so the user can immediately type a new format. */}
            <ApplyOrClearButton
              icon={<X size={12} strokeWidth={2.25} />}
              title="Clear format"
              accent="red"
              disabled={!draftExcel && !value}
              data-testid={testId ? `${testId}-clear-inline` : undefined}
              onClick={() => {
                setDraftExcel('');
                onChange(undefined);
              }}
            />
            <ExcelReferencePopover
              onPick={(format) => {
                setDraftExcel(format);
                commitExcel(format);
              }}
              data-testid={testId ? `${testId}-info` : undefined}
            />
          </div>
          <Caps size={9} color="var(--ds-text-faint)">
            {EXCEL_EXAMPLES.length} categories of example formats in the{' '}
            <Info size={9} strokeWidth={2} className="inline align-middle" />{' '}
            reference.
          </Caps>
        </div>
      </div>
      )}
    </FormatPopover>
  );
}

/**
 * Small inline action button used next to the custom Excel format
 * input (Apply ✓ / Clear ×). Visually mirrors the top-bar Clear chip
 * — square, monochrome border, accent-tinted icon — so the two button
 * variants and the existing top X all read as the same affordance.
 *
 * Local helper rather than a shared primitive: single use site, and
 * the design-system `Pill` is too heavy for this.
 */
function ApplyOrClearButton({
  icon,
  title,
  accent,
  disabled,
  onClick,
  ...rest
}: {
  icon: React.ReactNode;
  title: string;
  accent: 'green' | 'red';
  disabled?: boolean;
  onClick: () => void;
  'data-testid'?: string;
}) {
  const accentColor =
    accent === 'green'
      ? 'var(--ds-primary)'
      : 'var(--ds-accent-negative)';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      data-testid={rest['data-testid']}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 26,
        height: 26,
        padding: 0,
        background: 'transparent',
        border: '1px solid var(--ds-border-secondary)',
        borderRadius: 2,
        color: disabled ? 'var(--ds-text-faint)' : accentColor,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        transition: 'background 100ms, border-color 100ms, color 100ms',
      }}
    >
      {icon}
    </button>
  );
}
